/* THE GROUNDS AN ARTIST PAINTS ON (owner, 2026-10-04: "take as many
   background options from the artist's original art as possible, and make
   sure the artwork and the background go together as in their originals —
   Dachi's and Oskar's pictures are obviously done on a coloured paper, and
   on a white background they look cut out").

   Every work in data/artists/<id>/works is MEASURED — never shown to a
   model for this. Two readings per work:
   - SHEET: the outer ring of the work is one even colour → the paper or
     board it was painted on;
   - FIELDS: large calm areas of one colour inside the work (Levan's yellow
     field, Oskar's mustard board between the figures, Pirosmani's black
     oilcloth) — the grounds of a painter who paints to the edges.
   The readings of all works are gathered into tones; each tone remembers
   which works carry it, so a painting shown a given set of works can take
   a ground from THOSE works (paint.ts). Cached in
   data/artists/<id>/grounds.json, renewed when the works change. */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export interface GroundTone { hex: string; share: number; works: string[]; kind: "sheet" | "field" }
export interface ArtistGrounds { artistId: string; tones: GroundTone[]; works: Record<string, { hex: string; share: number; kind: "sheet" | "field" }[]>; sig: string; at: string }

const worksDir = (id: string) => path.join(process.cwd(), "data", "artists", id, "works");
const cacheFile = (id: string) => path.join(process.cwd(), "data", "artists", id, "grounds.json");

/* colour maths: sRGB ↔ CIELAB, ΔE76 */
const hex = (c: number[]) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const rgbOf = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export function lab(c: number[]): number[] {
  const l = c.map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  const X = (0.4124 * l[0] + 0.3576 * l[1] + 0.1805 * l[2]) / 0.95047, Y = 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2], Z = (0.0193 * l[0] + 0.1192 * l[1] + 0.9505 * l[2]) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
export const dE = (a: string, b: string) => { const p = lab(rgbOf(a)), q = lab(rgbOf(b)); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

/* one work's grounds */
export async function groundsOfWork(file: string): Promise<{ hex: string; share: number; kind: "sheet" | "field" }[]> {
  const { data, info } = await sharp(file).removeAlpha().resize(300, 300, { fit: "inside" }).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  const px = (x: number, y: number) => { const i = (y * W + x) * C; return [data[i], data[i + 1], data[i + 2]]; };
  const out: { hex: string; share: number; kind: "sheet" | "field" }[] = [];

  /* SHEET: the outer 5 % ring, even within ΔE 12 of its median for 60 % */
  const ring = Math.max(3, Math.round(Math.min(W, H) * 0.05));
  const rp: number[][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (y < ring || y >= H - ring || x < ring || x >= W - ring) rp.push(px(x, y));
  const med = [0, 1, 2].map((k) => { const v = rp.map((p) => p[k]).sort((a, b) => a - b); return v[v.length >> 1]; });
  const medHex = hex(med);
  const near = rp.filter((p) => dE(hex(p), medHex) <= 12);
  if (near.length >= rp.length * 0.6) out.push({ hex: hex([0, 1, 2].map((k) => near.reduce((s, p) => s + p[k], 0) / near.length)), share: 1, kind: "sheet" });

  /* FIELDS: 6-px blocks that are calm (little variation inside), gathered
     by colour; a gathering covering ≥ 12 % of the work is a field. A
     textured paper (Dachi's, Tal's) is not calm block by block: when the
     strict pass finds nothing, it is read again with a looser calm and on
     the work's 3-px-blurred copy (the grain smoothed, the strokes kept) */
  for (const pass of [0, 1]) {
    if (pass === 1 && out.length) break;
    if (pass === 1) { const b = await sharp(file).removeAlpha().resize(300, 300, { fit: "inside" }).blur(3).raw().toBuffer(); b.copy(data); }
    fields(pass ? 16 : 9);
  }
  return out;

  function fields(calm: number) {
  const B = 6, blocks: string[] = [];
  let total = 0;
  for (let by = 0; by + B <= H; by += B) for (let bx = 0; bx + B <= W; bx += B) {
    total++;
    const s = [0, 0, 0], s2 = [0, 0, 0];
    for (let y = by; y < by + B; y++) for (let x = bx; x < bx + B; x++) { const p = px(x, y); for (let k = 0; k < 3; k++) { s[k] += p[k]; s2[k] += p[k] * p[k]; } }
    const n = B * B, m = s.map((v) => v / n), sd = Math.max(...s2.map((v, k) => Math.sqrt(Math.max(0, v / n - m[k] * m[k]))));
    if (sd <= calm) blocks.push(hex(m));
  }
  const groups: { sum: number[]; n: number; hex: string }[] = [];
  for (const b of blocks) {
    const g = groups.find((x) => dE(x.hex, b) <= 10);
    const c = rgbOf(b);
    if (g) { g.sum = g.sum.map((v, k) => v + c[k]); g.n++; g.hex = hex(g.sum.map((v) => v / g.n)); }
    else groups.push({ sum: c, n: 1, hex: b });
  }
  for (const g of groups.sort((a, b) => b.n - a.n)) {
    const share = g.n / total;
    if (share < 0.12) break;
    if (out.some((o) => dE(o.hex, g.hex) <= 10)) continue;   /* the sheet again */
    out.push({ hex: g.hex, share, kind: "field" });
  }
  }
}

/* all works → tones (ΔE ≤ 10 gathered), each with the works carrying it */
export async function artistGrounds(artistId: string, force = false): Promise<ArtistGrounds> {
  const dir = worksDir(artistId);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort() : [];
  const sig = files.map((f) => `${f}:${fs.statSync(path.join(dir, f)).size}`).join("|");
  if (!force) { try { const c = JSON.parse(fs.readFileSync(cacheFile(artistId), "utf8")) as ArtistGrounds; if (c.sig === sig) return c; } catch { /* measure */ } }
  const works: ArtistGrounds["works"] = {};
  for (const f of files) { try { works[f] = await groundsOfWork(path.join(dir, f)); } catch { works[f] = []; } }
  const tones: (GroundTone & { sum: number[]; n: number })[] = [];
  for (const [f, gs] of Object.entries(works)) for (const g of gs) {
    const t = tones.find((x) => dE(x.hex, g.hex) <= 10);
    const c = rgbOf(g.hex);
    if (t) { t.sum = t.sum.map((v, k) => v + c[k]); t.n++; t.hex = hex(t.sum.map((v) => v / t.n)); if (!t.works.includes(f)) t.works.push(f); if (g.kind === "sheet") t.kind = "sheet"; }
    else tones.push({ hex: g.hex, share: 0, works: [f], kind: g.kind, sum: c, n: 1 });
  }
  const readable = Object.values(works).filter((g) => g.length).length || 1;
  const out: ArtistGrounds = { artistId, tones: tones.map((t) => ({ hex: t.hex, share: t.works.length / readable, works: t.works, kind: t.kind })).sort((a, b) => b.works.length - a.works.length), works, sig, at: new Date().toISOString() };
  try { fs.writeFileSync(cacheFile(artistId), JSON.stringify(out, null, 1)); } catch { /* read-only */ }
  return out;
}
