import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { listArtists } from "./artists";

/* "LABELS FROM <ARTIST>" (owner, 2026-09-30: "as soon as I generate
   marketing material, fill the artists' Labels from with it — six images
   from the marketing; take several from one pack if six must be filled").
   Each artist keeps the lifestyle images of the labels painted in his or
   her hand in data/artists/<id>/showcase/, named <time>-<code>-<n>.jpg
   (code = the order's product page; a new publish of the same order
   replaces its images). The page shows six: the newest pack's first image,
   the next pack's first, … and only then second images — variety first.
   Written only when the owner (admin) publishes — a customer's images never
   reach an artist's page by themselves. */

const dirOf = (id: string) => path.join(process.cwd(), "data", "artists", id.replace(/[^a-z0-9-]/gi, ""), "showcase");

/* the artist's id from the name a label records ("David Kakabadze · Brittany"
   is an older name of a model now called "David Kakabadze") */
export function artistIdByName(name: string): string | null {
  const all = listArtists();
  const n = name.trim();
  const hit = all.find((a) => a.profile.name === n) || all.find((a) => n.startsWith(a.profile.name) && a.lora) || all.find((a) => n.startsWith(a.profile.name));
  return hit?.profile.id || null;
}

export async function saveShowcase(artistId: string, code: string, images: Buffer[], at = Date.now()): Promise<number> {
  const dir = dirOf(artistId);
  fs.mkdirSync(dir, { recursive: true });
  const c = code.replace(/[^a-z0-9]/gi, "");
  for (const f of fs.readdirSync(dir)) if (f.includes(`-${c}-`)) fs.unlinkSync(path.join(dir, f));
  let n = 0;
  for (const img of images) {
    try {
      await sharp(img).flatten({ background: "#fff" }).resize(1400, 1400, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 84 }).toFile(path.join(dir, `${at}-${c}-${++n}.jpg`));
    } catch { n--; }
  }
  return n;
}

/* six for the page, from these artists (a merged page has several) */
export function listShowcase(ids: string[], want = 6): string[] {
  const packs = new Map<string, { at: number; files: string[] }>();
  for (const id of ids) {
    const dir = dirOf(id);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(/^(\d+)-([a-z0-9]+)-(\d+)\.jpg$/i);
      if (!m) continue;
      const key = `${id}/${m[2]}`;
      const e = packs.get(key) || { at: Number(m[1]), files: [] };
      e.files.push(`${id}/${f}`);
      packs.set(key, e);
    }
  }
  const order = [...packs.values()].sort((a, b) => b.at - a.at).map((p) => p.files.sort((x, y) => Number(x.match(/-(\d+)\.jpg$/)?.[1]) - Number(y.match(/-(\d+)\.jpg$/)?.[1])));
  const out: string[] = [];
  for (let round = 0; out.length < want && order.some((f) => f[round]); round++)
    for (const f of order) if (f[round] && out.length < want) out.push(f[round]);
  return out.map((f) => `/api/artists/showcase?f=${encodeURIComponent(f)}`);
}

export function showcaseFile(f: string): string | null {
  const m = f.match(/^([a-z0-9-]+)\/(\d+-[a-z0-9]+-\d+\.jpg)$/i);
  if (!m) return null;
  const p = path.join(dirOf(m[1]), m[2]);
  return fs.existsSync(p) ? p : null;
}
