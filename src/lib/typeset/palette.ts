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

/* ROUND 100: a vignette's ground is the border's colour; its drawing is
   the bounding box of everything that differs from that ground. Fractions
   of the image, with a small padding, so the drawing keeps its own air. */
export async function vignetteOf(dataUrl: string): Promise<{ ground: string; box: { x: number; y: number; w: number; h: number } }> {
  const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  const { data, info } = await sharp(buf).resize(240, 240, { fit: "fill" }).flatten({ background: "#F4EFE3" }).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  /* the ground: mode of a 6 % border ring */
  const ring = Math.round(W * 0.06);
  const bins = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x >= ring && x < W - ring && y >= ring && y < H - ring) continue;
    const i = (y * W + x) * C; const k = `${data[i] >> 4}-${data[i + 1] >> 4}-${data[i + 2] >> 4}`;
    const e = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += data[i]; e.g += data[i + 1]; e.b += data[i + 2]; bins.set(k, e);
  }
  const top = [...bins.values()].sort((a, b) => b.n - a.n)[0];
  const gr = top.r / top.n, gg = top.g / top.n, gb = top.b / top.n;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  const rows = new Array(H).fill(0), cols = new Array(W).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * C;
    if (Math.abs(data[i] - gr) + Math.abs(data[i + 1] - gg) + Math.abs(data[i + 2] - gb) > 60) { rows[y]++; cols[x]++; }
  }
  /* a row/column counts when at least 0.8 % of it is ink — stray specks don't stretch the box */
  for (let y = 0; y < H; y++) if (rows[y] > W * 0.008) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  for (let x = 0; x < W; x++) if (cols[x] > H * 0.008) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  if (x1 <= x0 || y1 <= y0) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; }
  const pad = 0.03;
  const box = { x: Math.max(0, x0 / W - pad), y: Math.max(0, y0 / H - pad), w: 0, h: 0 };
  box.w = Math.min(1, (x1 + 1) / W + pad) - box.x; box.h = Math.min(1, (y1 + 1) / H + pad) - box.y;
  return { ground: hex(gr, gg, gb), box };
}

/* CLEAN PAPER (2026-09-22, the owner: "Mariam's generated images have the
   wrinkled paper background, it ruins the seamless merging of the image
   into the label background colour… if we are using the ink area for the
   image, meaning leaving some area of the image clean, it should be clean
   indeed, no paper texture, no shading — otherwise it will always create
   an unnecessary visual edge between the image and the background").

   The artist's LoRA learned her paper as well as her hand, so the picture
   comes back on wrinkled, unevenly lit stock. The label then paints ONE
   flat colour behind it and the picture's rectangle shows: its paper is a
   few levels off the flat colour, and it is shaded across.

   This pass makes the clean part of the picture actually clean. The
   ground is the mode of a 5 % border ring; every pixel close to it is set
   to EXACTLY that colour, and the band above it fades in over a soft
   ramp, so a wash that dissolves into paper keeps dissolving — it just
   dissolves into a flat colour. The drawing itself is never touched.

   It refuses to run on a picture whose border is not paper at all (a
   painting that fills its frame), so nothing is ever scrubbed out of a
   full-bleed image. */
/* `side` (2026-09-23): a picture for a band or panel runs off three sides
   and ends in the painter's own edge only on the side that faces the type
   — there alone lies plain ground. The paper is then measured on THAT
   side's strip and grown only from THAT edge, so a dark painted scene
   touching the other sides is never taken for paper (it was: Mariam's
   navy evening, man and all, came back flattened to one tone). */
export async function cleanPaper(dataUrl: string, to?: string, side?: "top" | "bottom" | "left" | "right"): Promise<{ art: string; ground: string; cleaned: boolean; ink: { x: number; y: number; w: number; h: number } }> {
  const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  const { data, info } = await sharp(buf).flatten({ background: "#ffffff" }).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  const whole = { x: 0, y: 0, w: 1, h: 1 };
  const ring = Math.max(2, Math.round(Math.min(W, H) * 0.05));
  const onRing = side
    ? (x: number, y: number) => side === "top" ? y < ring : side === "bottom" ? y >= H - ring : side === "left" ? x < ring : x >= W - ring
    : (x: number, y: number) => x < ring || x >= W - ring || y < ring || y >= H - ring;

  /* the paper's colour: the commonest on the border ring */
  const bins = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!onRing(x, y)) continue;
    const i = (y * W + x) * C, k = `${data[i] >> 3}-${data[i + 1] >> 3}-${data[i + 2] >> 3}`;
    const e = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += data[i]; e.g += data[i + 1]; e.b += data[i + 2]; bins.set(k, e);
  }
  const top = [...bins.values()].sort((a, b) => b.n - a.n)[0];
  if (!top) return { art: dataUrl, ground: "#F4EFE3", cleaned: false, ink: whole };
  const gr = top.r / top.n, gg = top.g / top.n, gb = top.b / top.n;
  const ground = hex(gr, gg, gb);
  const dist = (i: number) => Math.max(Math.abs(data[i] - gr), Math.abs(data[i + 1] - gg), Math.abs(data[i + 2] - gb));

  /* how far the paper itself strays, from the ring */
  const hist = new Uint32Array(256);
  let ringN = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!onRing(x, y)) continue;
    hist[Math.min(255, Math.round(dist((y * W + x) * C)))]++; ringN++;
  }
  let acc = 0, p90 = 0;
  for (let d = 0; d < 256; d++) { acc += hist[d]; if (acc >= ringN * 0.9) { p90 = d; break; } }
  const t0 = Math.max(14, Math.min(28, p90 * 1.5 + 4));
  const t1 = t0 + 24;
  let near = 0;
  for (let d = 0; d <= Math.round(t0); d++) near += hist[d];
  if (near < ringN * 0.6) return { art: dataUrl, ground, cleaned: false, ink: whole };

  /* THE PAPER IS ONLY WHAT THE BORDER REACHES (owner, 2026-09-22, twice:
     "inside the image, inside the ink, leave the background alone — the
     background is what lies OUTSIDE the ink, the sheet it is painted
     on"). Flattening every pixel that merely resembled the paper ate the
     flat grounds inside Levan's paintings. Now the paper is grown from
     the edge of the sheet inward and stops at the drawing. */
  const paper = new Uint8Array(W * H);
  const queue = new Int32Array(W * H);
  let qa = 0, qb = 0;
  const push = (x: number, y: number) => {
    const p2 = y * W + x;
    if (paper[p2]) return;
    if (dist(p2 * C) >= t1) return;
    paper[p2] = 1; queue[qb++] = p2;
  };
  if (!side || side === "top") for (let x = 0; x < W; x++) push(x, 0);
  if (!side || side === "bottom") for (let x = 0; x < W; x++) push(x, H - 1);
  if (!side || side === "left") for (let y = 0; y < H; y++) push(0, y);
  if (!side || side === "right") for (let y = 0; y < H; y++) push(W - 1, y);
  while (qa < qb) {
    const p2 = queue[qa++], x = p2 % W, y = (p2 / W) | 0;
    if (x > 0) push(x - 1, y);
    if (x < W - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < H - 1) push(x, y + 1);
  }

  const tr = to ? parseInt(to.slice(1, 3), 16) : gr;
  const tg = to ? parseInt(to.slice(3, 5), 16) : gg;
  const tb = to ? parseInt(to.slice(5, 7), 16) : gb;
  const out = Buffer.from(data);
  const rows = new Uint32Array(H), cols = new Uint32Array(W);
  for (let p2 = 0; p2 < W * H; p2++) {
    const i = p2 * C;
    if (!paper[p2]) {
      rows[(p2 / W) | 0]++; cols[p2 % W]++;
      continue;
    }
    const d = dist(i);
    let a = d <= t0 ? 0 : (d - t0) / (t1 - t0);
    a = a * a * (3 - 2 * a);                       /* smoothstep, no banding */
    out[i] = Math.round(tr + (data[i] - gr) * a);
    out[i + 1] = Math.round(tg + (data[i + 1] - gg) * a);
    out[i + 2] = Math.round(tb + (data[i + 2] - gb) * a);
  }
  /* the drawing's box: the rows and columns that carry REAL ink. A speck
     of stray paint near a corner must not stretch it to the whole sheet
     (it did: Mariam's sheets came back as 99 % ink). */
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) if (rows[y] > W * 0.006) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
  for (let x = 0; x < W; x++) if (cols[x] > H * 0.006) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
  /* on the painter's-edge side the edge is where REAL ink starts — a
     column or row at least 5 % inked — not a lone speck left in the plain
     ground (a white dot in Giorgi's yellow once pushed his whole picture
     off to the right) */
  /* …and the sheet's outer 1.5 % is skipped (the repaint leaves a light
     hairline there) and the ink must hold for three lines running */
  const run = (a: Uint32Array, lim: number, from: number, to: number) => {
    const st = from < to ? 1 : -1;
    for (let k = from; k !== to; k += st) if (a[k] > lim && a[k + st] > lim && a[k + 2 * st] > lim) return k;
    return -1;
  };
  const mx = Math.round(W * 0.015), my = Math.round(H * 0.015);
  if (side === "left") { const k = run(cols, H * 0.05, mx, W - 3); if (k >= 0) x0 = k; }
  if (side === "right") { const k = run(cols, H * 0.05, W - 1 - mx, 2); if (k >= 0) x1 = k; }
  if (side === "top") { const k = run(rows, W * 0.05, my, H - 3); if (k >= 0) y0 = k; }
  if (side === "bottom") { const k = run(rows, W * 0.05, H - 1 - my, 2); if (k >= 0) y1 = k; }
  const ink = x1 < 0 || y1 < 0 ? whole : { x: x0 / W, y: y0 / H, w: (x1 - x0 + 1) / W, h: (y1 - y0 + 1) / H };
  const png = await sharp(out, { raw: { width: W, height: H, channels: C as 1 | 2 | 3 | 4 } }).png().toBuffer();
  return { art: `data:image/png;base64,${png.toString("base64")}`, ground: to || ground, cleaned: true, ink };
}
