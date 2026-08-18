import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { getDb } from "@/lib/db";
import { listRefs, REFS_DIR } from "@/lib/admin/style-refs";

/* EXACT COLOURS PER CARD (owner rule 2026-08-18): each style card's ink
   palette is extracted from its reference image — deterministically, no
   vision model — and generations are LOCKED to it (prompt guidance + a
   mechanical hue-mapping pass in finishArtwork). "Good drawing ruined by
   invented colours" becomes impossible: stray hues are remapped to the
   reference's own inks, luminance preserved. Backgrounds stay under the
   white-ground rules. Cached per reference id; deleting/re-uploading a
   reference naturally refreshes it. */

const DOC_ID = "card-palettes";
const MAX_COLORS = 4;

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 510;
  const s = mx === mn ? 0 : (mx - mn) / (255 - Math.abs(mx + mn - 255));
  let h = 0;
  if (mx !== mn) {
    if (mx === r) h = 60 * ((g - b) / (mx - mn) + (g < b ? 6 : 0));
    else if (mx === g) h = 60 * ((b - r) / (mx - mn) + 2);
    else h = 60 * ((r - g) / (mx - mn) + 4);
  }
  return { h: ((h % 360) + 360) % 360, s, l };
}

/** Extract up to MAX_COLORS ink colours from one reference image file. */
async function extractPalette(filePath: string): Promise<string[]> {
  const { data, info } = await sharp(filePath)
    .resize(96, 96, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // bucket by hue (30° bands) for coloured pixels; one neutral bucket for
  // dark/grey ink; near-white pixels are ground and never count
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 2 < data.length; i += 3) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (Math.min(r, g, b) > 235) continue; // ground
    const { h, s, l } = rgbToHsl(r, g, b);
    if (l > 0.92) continue;
    const key = s < 0.15 ? "neutral" : `h${Math.floor(h / 30)}`;
    const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  }
  const total = [...buckets.values()].reduce((a, e) => a + e.n, 0);
  if (!total) return [];
  return [...buckets.entries()]
    .filter(([, e]) => e.n / total > 0.04) // ignore trace hues — those ARE the invented-colour noise
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, MAX_COLORS)
    .map(([, e]) => {
      const q = (v: number) => Math.round(v / e.n).toString(16).padStart(2, "0");
      return `#${q(e.r)}${q(e.g)}${q(e.b)}`.toUpperCase();
    });
}

/** Palette for one card (reference id), cached in Mongo. Empty = no lock. */
export async function cardPalette(styleKey: string, refId: string): Promise<string[]> {
  try {
    const db = await getDb();
    const doc = (await db.collection("settings").findOne({ _id: DOC_ID } as never)) as
      | ({ map?: Record<string, { colors: string[] }> } & Record<string, unknown>)
      | null;
    const hit = doc?.map?.[refId];
    if (hit?.colors) return hit.colors;
    const ref = (await listRefs(styleKey)).find((r) => r.id === refId);
    if (!ref) return [];
    const p = path.join(REFS_DIR, path.basename(ref.file));
    if (!fs.existsSync(p)) return [];
    const colors = await extractPalette(p);
    await db.collection("settings").updateOne(
      { _id: DOC_ID } as never,
      { $set: { [`map.${refId}`]: { colors, at: new Date().toISOString() } } },
      { upsert: true }
    );
    return colors;
  } catch {
    return [];
  }
}
