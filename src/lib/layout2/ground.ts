/* THE LABEL'S GROUND AND ITS INKS — the final-round colour rules (owner,
   2026-10-03).

   GROUND. The painter works on a plain neutral sheet; the finished
   painting's palette is read; the label's ground is then chosen from
   three sources in admin-set shares (default 50 / 25 / 25):
     "painting" — a colour the painting dictates: its own main colour, or
                  a lighter / darker relative of it;
     "white"    — plain white;
     "warm"     — a warm light tone.
   Exceptions: an artist whose ground is his own (Pirosmani's black —
   profile keepGround) keeps it; an artist on light paper (Tatishvili —
   profile paper) stays white / beige.

   INKS. 60 % of labels: the wine's name in a colour, every other line
   black (95 %); 40 %: all the type in that one colour. The colour comes
   from the painting, steered by the wine's colour — above all for a
   low-saturation painting: red wine → reds and dark reds, white → warm
   and dark greens, amber → clay tones, rosé → dusty rose. Every ink must
   read on the ground (readable, 4.5 : 1). */
import sharp from "sharp";
import { readable } from "../typeset/compose-template";

/* the shares of the four sources (owner, 2026-10-04: the artist's
   ORIGINALS first — "look at the artist's original paintings and take the
   ground logic from there") */
export interface GroundShares { originals: number; painting: number; white: number; warm: number }
export const DEFAULT_SHARES: GroundShares = { originals: 70, painting: 15, white: 7.5, warm: 7.5 };
export const WHITE = "#FFFFFF";
export const WARM_LIGHT = "#F3ECDF";
export const BLACK_95 = "#0D0D0D";

const WINE_HUE: Record<string, string> = { red: "#8B1A1A", amber: "#9A6A2A", orange: "#9A6A2A", white: "#4A6B35", rose: "#B0566A", rosé: "#B0566A" };

export interface Palette { main: string | null; colours: { hex: string; share: number; sat: number; lum: number }[]; paper: string }

const hex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const satOf = (c: number[]) => { const mx = Math.max(...c), mn = Math.min(...c); return mx ? (mx - mn) / mx : 0; };
const lumOf = (c: number[]) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

/* the painting's palette: its pixels off the paper, in coarse colour
   bins; `main` is the most-present colour with some saturation (a grey
   or near-black painting has none and hands the ground to the wine) */
export async function paletteOf(dataUrl: string, paper: string): Promise<Palette> {
  const { data, info } = await sharp(Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64")).removeAlpha().resize(160, 160, { fit: "inside" }).raw().toBuffer({ resolveWithObject: true });
  const P = rgb(paper), C = info.channels;
  const bins = new Map<string, { n: number; r: number; g: number; b: number }>();
  let n = 0;
  for (let i = 0; i < data.length; i += C) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (Math.max(Math.abs(r - P[0]), Math.abs(g - P[1]), Math.abs(b - P[2])) < 28) continue;   /* the sheet */
    const k = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const e = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b; bins.set(k, e); n++;
  }
  const colours = [...bins.values()].filter((e) => e.n >= n * 0.01).map((e) => { const c = [e.r / e.n, e.g / e.n, e.b / e.n]; return { hex: hex(c[0], c[1], c[2]), share: e.n / Math.max(1, n), sat: satOf(c), lum: lumOf(c) }; }).sort((a, b) => b.share - a.share);
  /* the main colour: weight = share × saturation (a big grey field is not
     a colour the painting dictates) */
  const cand = colours.filter((c) => c.sat > 0.2 && c.lum > 0.04 && c.lum < 0.92).sort((a, b) => b.share * b.sat - a.share * a.sat)[0];
  return { main: cand?.hex || null, colours, paper };
}

/* a deterministic draw from a seed: 0 ≤ u < 1 */
const unit = (seed: number, salt: number) => { let h = (seed ^ (salt * 0x9e3779b9)) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 0x100000000; };

export type GroundSource = "originals" | "painting" | "white" | "warm" | "artist";
export interface GroundChoice { ground: string; source: GroundSource; note: string }

/* the ground for one label. `originals`: the tones read off the artist's
   own works (artist-grounds.ts), each with the number of works carrying
   it — the label takes one of them by those weights, so an artist who
   paints on cream gets cream, one who paints on black gets black. */
export function chooseGround(pal: Palette, seed: number, opts: { shares?: GroundShares; keepGround?: string; paper?: string; wineColour?: string; originals?: { hex: string; works: number }[] } = {}): GroundChoice {
  /* an artist whose ground is his own (profile keepGround is a WORD, "black"):
     the label takes the sheet exactly as he painted it */
  if (opts.keepGround) return { ground: pal.paper, source: "artist", note: `the artist's own ${opts.keepGround} (${pal.paper})` };
  if (opts.paper) {
    /* light paper only: white or the warm tone */
    return unit(seed, 3) < 0.5 ? { ground: WHITE, source: "white", note: "white (light-paper artist)" } : { ground: WARM_LIGHT, source: "warm", note: "warm light (light-paper artist)" };
  }
  const sh = { ...DEFAULT_SHARES, ...(opts.shares || {}) };
  const orig = (opts.originals || []).filter((o) => o.works > 0);
  const shOrig = orig.length ? sh.originals : 0;
  const tot = Math.max(1, shOrig + sh.painting + sh.white + sh.warm);
  const u = unit(seed, 3) * tot;
  if (u < shOrig) {
    const total = orig.reduce((s, o) => s + o.works, 0);
    let v = unit(seed, 11) * total;
    for (const o of orig) { v -= o.works; if (v <= 0) return { ground: o.hex, source: "originals", note: `a ground of the artist's originals (${o.works} of ${total} works)` }; }
    return { ground: orig[0].hex, source: "originals", note: "the artist's commonest ground" };
  }
  if (u < shOrig + sh.painting && pal.main) {
    const c = rgb(pal.main), v = unit(seed, 5);
    /* as it is / lighter / darker — the painting's own colour either way */
    if (v < 0.4) return { ground: pal.main, source: "painting", note: "the painting's main colour" };
    if (v < 0.75) return { ground: hex(...(c.map((x) => x + (255 - x) * 0.55) as [number, number, number])), source: "painting", note: "a lighter relative of the painting's main colour" };
    return { ground: hex(...(c.map((x) => x * 0.55) as [number, number, number])), source: "painting", note: "a darker relative of the painting's main colour" };
  }
  if (u < shOrig + sh.painting + sh.white) return { ground: WHITE, source: "white", note: "white" };
  return { ground: WARM_LIGHT, source: "warm", note: "warm light" };
}

export interface InkChoice { text: string; accent: string; allColoured: boolean; note: string }

/* the type's colours on this ground */
export function chooseInks(pal: Palette, ground: string, seed: number, wineColour?: string): InkChoice {
  const wine = WINE_HUE[(wineColour || "").toLowerCase()] || null;
  /* the accent: the painting's colour, pulled toward the wine's hue — the
     more for a low-saturation painting */
  let base = pal.main ? rgb(pal.main) : wine ? rgb(wine) : rgb("#8B1A1A");
  if (wine && pal.main) {
    const s = satOf(base);
    const pull = s < 0.25 ? 0.85 : s < 0.45 ? 0.5 : 0.25;
    const w = rgb(wine);
    base = base.map((v, i) => v * (1 - pull) + w[i] * pull);
  }
  const accent = readable(hex(base[0], base[1], base[2]), ground);
  const allColoured = unit(seed, 7) < 0.4;
  const text = allColoured ? accent : readable(BLACK_95, ground);
  return { text, accent, allColoured, note: allColoured ? "all the type in the one colour" : "the wine's name in colour, the rest black" };
}
