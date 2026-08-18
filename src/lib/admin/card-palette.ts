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

/** Extract up to MAX_COLORS ink colours from an image buffer. */
export async function extractPaletteFromBuffer(input: Buffer): Promise<string[]> {
  const { data, info } = await sharp(input)
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
    const colors = await extractPaletteFromBuffer(fs.readFileSync(p));
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

/* ELEMENT COLOURS FROM THE ARTWORK (owner 2026-08-18): turn a generated
   image's ink palette into one engine palette entry {bg,ink,sub,acc}.
   bg is always white (ground rule); ink = the darkest ink (clamped dark
   enough to read); acc = the most saturated ink; sub = ink faded toward
   the ground. The engine's wine-colour gamut still applies on top. */
export async function labelPaletteFromImage(dataUrl: string, styleKey?: string): Promise<{ bg: string; ink: string; sub: string; acc: string }[] | null> {
  try {
    const m = dataUrl.match(/^data:image\/[a-z]+;base64,(.+)$/);
    if (!m) return null;
    const colors = await extractPaletteFromBuffer(Buffer.from(m[1], "base64"));
    if (!colors.length) return null;
    const rgb = (hx: string) => {
      const n = parseInt(hx.slice(1), 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    };
    const lum = (c: { r: number; g: number; b: number }) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
    const sat = (c: { r: number; g: number; b: number }) => {
      const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b);
      return mx === mn ? 0 : (mx - mn) / (255 - Math.abs(mx + mn - 255));
    };
    const cs = colors.map((hx) => ({ hx, c: rgb(hx) }));
    const dark = [...cs].sort((a, b) => lum(a.c) - lum(b.c))[0];
    const vivid = [...cs].sort((a, b) => sat(b.c) - sat(a.c))[0];
    const hex = (c: { r: number; g: number; b: number }) =>
      "#" + [c.r, c.g, c.b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("").toUpperCase();
    // ink must be dark enough to print as text
    let ink = dark.c;
    const f = lum(ink) > 110 ? 110 / lum(ink) : 1;
    ink = { r: ink.r * f, g: ink.g * f, b: ink.b * f };
    const acc = vivid.hx === dark.hx && cs.length > 1 ? cs.find((x) => x.hx !== dark.hx)!.c : vivid.c;
    const mixToWhite = (c: { r: number; g: number; b: number }, t: number) => ({
      r: c.r + (255 - c.r) * t, g: c.g + (255 - c.g) * t, b: c.b + (255 - c.b) * t,
    });
    // TWO entries (owner 2026-08-18: "more diversity in label background"):
    // one with a light paper tint derived from the image's own ink, one on
    // pure white — the engine picks seeded, and the wine-colour gamut
    // rejects tints that break the ground rules (e.g. pinkish for whites).
    const inkHex = hex(ink), subHex = hex(mixToWhite(ink, 0.45)), accHex = hex(acc);
    // 9:1 tinted vs white (owner 2026-08-18: "white backgrounds still
    // dominate — only 1/10"): two tint voices (vivid-ink paper and ink-warm
    // paper) fill nine slots, pure white keeps one. The engine's seeded pick
    // is uniform over the list, so repetition IS the weighting; gamut
    // adaptation may still veto a tint for a given wine, falling back white.
    const tintA = { bg: hex(mixToWhite(vivid.c, 0.82)), ink: inkHex, sub: subHex, acc: accHex };
    const tintB = { bg: hex(mixToWhite(dark.c, 0.84)), ink: inkHex, sub: subHex, acc: accHex };
    const white = { bg: "#FFFFFF", ink: inkHex, sub: subHex, acc: accHex };
    // PUNK BOLD GROUNDS (owner 2026-08-18): saturated opaque grounds built
    // from the image's own inks so the artwork prints INTO the colour (its
    // whites dissolve into the ground under multiply). Lightness floored
    // where multiply ink still reads; the engine's contrast guard flips
    // text light on the deeper grounds.
    if (styleKey === "punk") {
      const toHsl = (c: { r: number; g: number; b: number }) => rgbToHsl(c.r, c.g, c.b);
      const hsl2hex = (h: number, sVal: number, l: number) => {
        h = ((h % 360) + 360) % 360;
        const C = (1 - Math.abs(2 * l - 1)) * sVal, X = C * (1 - Math.abs(((h / 60) % 2) - 1)), m2 = l - C / 2;
        let r = 0, g = 0, b = 0;
        if (h < 60) { r = C; g = X; } else if (h < 120) { r = X; g = C; } else if (h < 180) { g = C; b = X; }
        else if (h < 240) { g = X; b = C; } else if (h < 300) { r = X; b = C; } else { r = C; b = X; }
        const q = (v: number) => Math.round((v + m2) * 255).toString(16).padStart(2, "0");
        return ("#" + q(r) + q(g) + q(b)).toUpperCase();
      };
      const hv = toHsl(vivid.c), hd = toHsl(dark.c);
      const boldA = { bg: hsl2hex(hv.h, Math.max(hv.s, 0.6), 0.62), ink: inkHex, sub: subHex, acc: accHex };
      const boldB = { bg: hsl2hex(hd.h, Math.max(hd.s, 0.5), 0.48), ink: inkHex, sub: subHex, acc: accHex };
      return [boldA, boldB, boldA, boldB, boldA, boldB, boldA, tintA, tintB, white];
    }
    return [tintA, tintB, tintA, tintB, tintA, tintB, tintA, tintB, tintA, white];
  } catch {
    return null;
  }
}
