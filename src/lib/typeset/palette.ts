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

/* THE ILLUSTRATION'S OWN GROUND (owner 2026-09-19, "way 1": "every
   illustration has a background colour — you should be able to read it;
   pick the ground FROM the drawing, not from a list"). Looks at the
   bottom fifth of the picture — the rows the type band will grow out of —
   finds the most common colour there and how much of those rows it
   covers. `flat` is true when the painter really left a plain ground
   (≥ 55% of the sampled rows, ≥ 80% of the very last rows); otherwise the
   colour is still the best ground we have, and the ink-foot rule will
   push the type below whatever was drawn. */
export interface OwnGround { colour: string; coverage: number; flat: boolean }
export async function flatGroundOf(dataUrl: string): Promise<OwnGround> {
  const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  const { data, info } = await sharp(buf).resize(200, 200, { fit: "fill" }).flatten({ background: "#F4EFE3" }).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  const y0 = Math.floor(H * 0.8);
  /* the mode, in coarse bins, then the mean of everything near it */
  const bins = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let y = y0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * C;
    const k = `${data[i] >> 4}-${data[i + 1] >> 4}-${data[i + 2] >> 4}`;
    const e = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += data[i]; e.g += data[i + 1]; e.b += data[i + 2]; bins.set(k, e);
  }
  const top = [...bins.values()].sort((a, b) => b.n - a.n)[0];
  const cr = top.r / top.n, cg = top.g / top.n, cb = top.b / top.n;
  let near = 0, sr = 0, sg = 0, sb = 0, lastNear = 0;
  const rows = H - y0, lastRows = 4;
  for (let y = y0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * C;
    const d = Math.abs(data[i] - cr) + Math.abs(data[i + 1] - cg) + Math.abs(data[i + 2] - cb);
    if (d <= 48) { near++; sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; if (y >= H - lastRows) lastNear++; }
  }
  const coverage = near / (rows * W);
  const flat = coverage >= 0.55 && lastNear / (lastRows * W) >= 0.8;
  return { colour: near ? hex(sr / near, sg / near, sb / near) : hex(cr, cg, cb), coverage, flat };
}

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

/* ROUND 96 (owner: "the painters I gave 5s to — we must have them"): those
   pictures were FREE paintings (no canvas), so the composer now has a
   CROP mode that keeps the painting whole and draws the type band over its
   foot. The band's colour is the dominant colour of the rows just above
   the cut — the picture's own foot, so the seam reads as designed. */
export async function sliceColourOf(dataUrl: string, fracTop: number, fracBottom: number): Promise<string> {
  const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  const { data, info } = await sharp(buf).resize(160, 160, { fit: "fill" }).flatten({ background: "#F4EFE3" }).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  const y0 = Math.max(0, Math.floor(H * fracTop)), y1 = Math.min(H, Math.ceil(H * fracBottom));
  const bins = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * C;
    const k = `${data[i] >> 4}-${data[i + 1] >> 4}-${data[i + 2] >> 4}`;
    const e = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += data[i]; e.g += data[i + 1]; e.b += data[i + 2]; bins.set(k, e);
  }
  const top = [...bins.values()].sort((a, b) => b.n - a.n)[0];
  return top ? hex(top.r / top.n, top.g / top.n, top.b / top.n) : "#F4EFE3";
}

/* ROUND 98 #3 (owner: "the fade is terrible, adding a background after
   obviously is not working"): the type zone is MEASURED. The painter was
   asked to keep the foot quiet; if it is (little variation), the type is
   set straight onto the painting — no band, no fade. Only a busy foot gets
   a flat band in the painting's own colour, with a hard edge. */
export interface ZoneStats { lum: number; spread: number; colour: string }
export async function zoneStatsOf(dataUrl: string, fracTop: number, fracBottom = 1): Promise<ZoneStats> {
  const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  const { data, info } = await sharp(buf).resize(160, 160, { fit: "fill" }).flatten({ background: "#F4EFE3" }).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  const y0 = Math.max(0, Math.floor(H * fracTop)), y1 = Math.min(H, Math.ceil(H * fracBottom));
  const lums: number[] = []; let sr = 0, sg = 0, sb = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * C;
    lums.push((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255);
    sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; n++;
  }
  const mean = lums.reduce((a, b) => a + b, 0) / Math.max(1, lums.length);
  const spread = Math.sqrt(lums.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, lums.length));
  return { lum: mean, spread, colour: n ? hex(sr / n, sg / n, sb / n) : "#F4EFE3" };
}
