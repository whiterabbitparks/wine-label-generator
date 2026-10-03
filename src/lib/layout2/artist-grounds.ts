/* THE GROUNDS OF AN ARTIST'S ORIGINALS (owner, 2026-10-04: "for the
   grounds we should look at the artist's original paintings and take the
   logic from there — the ground that lies on the painting there, we
   should read it somehow and carry it over"; Dachi does not sit well on
   white, nor Oskar's illustrations on white or on a dark tone).

   Every work in data/artists/<id>/works is MEASURED (never shown to any
   model): the colour of its border ring — the sheet or the field the
   artist painted on — when that ring is fairly even; a work painted to
   its edges in many colours has no ground to read and is skipped. The
   grounds found are gathered into a few tones with their weights, and
   cached beside the works (grounds.json, renewed when the works change). */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export interface ArtistGround { hex: string; weight: number; works: number }
export interface ArtistGrounds { artistId: string; grounds: ArtistGround[]; measured: number; readable: number; at: string; sig: string }

const WORKS = (id: string) => path.join(process.cwd(), "data", "artists", id, "works");
const CACHE = (id: string) => path.join(process.cwd(), "data", "artists", id, "grounds.json");
const hex = (c: number[]) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

/* one work's ground. First the border ring (outer 6 %): when it is
   fairly even (55 % of it within 30 levels of its median) it IS the
   sheet or the field, and that is the ground. A work painted to its
   edges is read by its FLAT areas instead: the picture in 4-px blocks,
   the quiet blocks (little variation inside) voting for their colour —
   the colour most of the quiet surface carries is the field the artist
   painted on (Levan's yellow, Pirosmani's black, Dachi's cream paper
   showing between the strokes). Null when nothing is quiet enough. */
export async function groundOfWork(file: string): Promise<{ hex: string; even: number; by: "ring" | "flat" } | null> {
  const { data, info } = await sharp(file).removeAlpha().resize(240, 240, { fit: "inside" }).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels, ring = Math.max(3, Math.round(Math.min(W, H) * 0.06));
  const px: number[][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!(y < ring || y >= H - ring || x < ring || x >= W - ring)) continue;
    const i = (y * W + x) * C; px.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (px.length >= 50) {
    const med = [0, 1, 2].map((k) => { const v = px.map((p) => p[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; });
    const near = px.filter((p) => Math.max(...p.map((v, k) => Math.abs(v - med[k]))) <= 30);
    const even = near.length / px.length;
    if (even >= 0.55) { const mean = [0, 1, 2].map((k) => near.reduce((s, p) => s + p[k], 0) / near.length); return { hex: hex(mean), even, by: "ring" }; }
  }
  /* the flat areas */
  const B = 4, bins = new Map<string, { n: number; c: number[] }>();
  let quiet = 0, blocks = 0;
  for (let by = 0; by + B <= H; by += B) for (let bx = 0; bx + B <= W; bx += B) {
    const s = [0, 0, 0], s2 = [0, 0, 0];
    for (let y = by; y < by + B; y++) for (let x = bx; x < bx + B; x++) { const i = (y * W + x) * C; for (let k = 0; k < 3; k++) { s[k] += data[i + k]; s2[k] += data[i + k] ** 2; } }
    const n = B * B, m = s.map((v) => v / n), sd = Math.max(...s2.map((v, k) => Math.sqrt(Math.max(0, v / n - m[k] ** 2))));
    blocks++;
    if (sd > 10) continue;
    quiet++;
    const key = m.map((v) => Math.round(v / 24)).join("-");
    const e = bins.get(key) || { n: 0, c: [0, 0, 0] };
    e.n++; e.c = e.c.map((v, k) => v + m[k]); bins.set(key, e);
  }
  if (!blocks || quiet / blocks < 0.12) return null;
  const top = [...bins.values()].sort((a, b) => b.n - a.n)[0];
  if (!top || top.n < quiet * 0.25) return null;   /* the quiet surface is many colours — no one field */
  return { hex: hex(top.c.map((v) => v / top.n)), even: top.n / quiet, by: "flat" };
}

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const dist = (a: string, b: string) => { const p = rgb(a), q = rgb(b); return Math.sqrt(p.reduce((s, v, k) => s + (v - q[k]) ** 2, 0)); };

/* the works' grounds gathered into tones (within 36 levels of each other) */
export async function artistGrounds(artistId: string, force = false): Promise<ArtistGrounds> {
  const dir = WORKS(artistId);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort() : [];
  const sig = files.map((f) => `${f}:${fs.statSync(path.join(dir, f)).size}`).join("|");
  if (!force && fs.existsSync(CACHE(artistId))) {
    try { const c = JSON.parse(fs.readFileSync(CACHE(artistId), "utf8")) as ArtistGrounds; if (c.sig === sig) return c; } catch { /* re-measure */ }
  }
  const found: string[] = [];
  for (const f of files) { try { const g = await groundOfWork(path.join(dir, f)); if (g) found.push(g.hex); } catch { /* an unreadable file is skipped */ } }
  const groups: { sum: number[]; n: number }[] = [];
  for (const h of found) {
    const c = rgb(h);
    const g = groups.find((x) => dist(hex(x.sum.map((v) => v / x.n)), h) <= 36);
    if (g) { g.sum = g.sum.map((v, k) => v + c[k]); g.n++; } else groups.push({ sum: c, n: 1 });
  }
  const grounds = groups.map((g) => ({ hex: hex(g.sum.map((v) => v / g.n)), weight: g.n / Math.max(1, found.length), works: g.n })).sort((a, b) => b.weight - a.weight);
  const out: ArtistGrounds = { artistId, grounds, measured: files.length, readable: found.length, at: new Date().toISOString(), sig };
  try { fs.writeFileSync(CACHE(artistId), JSON.stringify(out, null, 1)); } catch { /* read-only: fine */ }
  return out;
}
