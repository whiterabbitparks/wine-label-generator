import sharp from "sharp";

/* INK FROM THE ART (branch POPIKA_Back_To_Vector, 2026-09-19).
   Type that "belongs" to the illustration shares its ink. This samples
   the artwork and returns its dominant DARK colour (the drawing ink) and
   its most saturated accent, so the hero can be set in the drawing's own
   black-brown or its one loud colour. Paper-coloured pixels are ignored. */

export interface Inks { ink: string; accent: string | null; paper: string }

/* WHERE THE DRAWING ENDS. The mask keeps the model out of the band, but
   the illustration may run to the window's very edge (boots, grass) — so
   the type must start below the last row that carries ink, not below the
   window on paper. Returns that row as a fraction of the image height. */
export async function inkFootOf(dataUrl: string, ground = "#F4EFE3"): Promise<number> {
  const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  const { data, info } = await sharp(buf).resize(200, 200, { fit: "fill" }).flatten({ background: ground }).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  /* "ink" = anything that is not the ground the painter was given — so a
     deep-blue punk ground counts as empty, not as drawing */
  const g = parseInt(ground.slice(1), 16);
  const gr = g >> 16, gg = (g >> 8) & 255, gb = g & 255;
  for (let y = H - 1; y >= 0; y--) {
    let ink = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * C;
      const d = Math.abs(data[i] - gr) + Math.abs(data[i + 1] - gg) + Math.abs(data[i + 2] - gb);
      if (d > 90) ink++;
    }
    if (ink > W * 0.01) return (y + 1) / H;
  }
  return 0;
}

const hex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

export async function inkOf(dataUrl: string): Promise<Inks> {
  const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  const { data, info } = await sharp(buf).resize(160, 160, { fit: "inside" }).flatten({ background: "#F4EFE3" }).raw().toBuffer({ resolveWithObject: true });
  const dark: number[][] = [];
  const bins = new Map<string, { n: number; r: number; g: number; b: number; s: number }>();
  let pr = 0, pg = 0, pb = 0, pn = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sat = max === 0 ? 0 : (max - min) / max;
    if (lum > 215 && sat < 0.18) { pr += r; pg += g; pb += b; pn++; continue; }   /* paper */
    if (lum < 110) dark.push([r, g, b]);
    if (sat > 0.45 && lum > 60 && lum < 200) {
      const k = `${r >> 5}-${g >> 5}-${b >> 5}`;
      const e = bins.get(k) || { n: 0, r: 0, g: 0, b: 0, s: 0 };
      e.n++; e.r += r; e.g += g; e.b += b; e.s += sat; bins.set(k, e);
    }
  }
  /* the ink: median of the dark pixels per channel — outliers can't pull it */
  const med = (k: number) => { const v = dark.map((p) => p[k]).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : 20; };
  const ink = dark.length > 30 ? hex(med(0), med(1), med(2)) : "#1a1a1a";
  let accent: string | null = null;
  const best = [...bins.values()].filter((e) => e.n > 40).sort((a, b) => b.n - a.n)[0];
  if (best) accent = hex(best.r / best.n, best.g / best.n, best.b / best.n);
  const paper = pn > 200 ? hex(pr / pn, pg / pn, pb / pn) : "#F4EFE3";
  return { ink, accent, paper };
}
