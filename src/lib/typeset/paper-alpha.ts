import sharp from "sharp";

/* INK ON TRANSPARENT FILM (owner, 2026-09-29, on trial in the admin editor:
   "a picture keeps a thin rim of its paper colour — when I take a colour
   from the painting for the ground, that rim and the paper's rectangle
   show; I don't want the edges cut by hand, and multiply would ruin
   pictures on a dark ground").

   cleanPaper has already made the paper ONE flat colour (the label's
   ground) and faded the drawing's pale edge into it. So every pixel of
   the painting reads as "ink over that paper", and the paper can be taken
   out mathematically — colour-to-alpha: each pixel gets the LEAST opacity
   that, laid over the paper colour, gives back exactly the pixel. Plain
   paper becomes fully transparent, dense ink stays opaque, a thin wash
   goes part-transparent and lets a new ground through, as watercolour on
   tinted paper does. Over the engine's own ground the picture is the same
   as before (within one colour level of rounding).

   Only the paper that REACHES THE SHEET'S EDGE is taken out (grown in from
   the border through paper-like pixels, as cleanPaper grows it), plus a
   two-pixel rim into the drawing for its soft edge — a white shirt or a
   pale cloud inside the drawing stays as it is. */
export async function paperToAlpha(png: Buffer, ground: string): Promise<Buffer> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  const P = [1, 3, 5].map((k) => parseInt(ground.slice(k, k + 2), 16));
  if (P.some((v) => Number.isNaN(v))) return png;
  const dist = (p: number) => { const i = p * C; return Math.max(Math.abs(data[i] - P[0]), Math.abs(data[i + 1] - P[1]), Math.abs(data[i + 2] - P[2])); };

  /* the drawing's box: rows and columns that carry real ink (as cleanPaper
     measures it) — outside it everything paper-like is paper */
  const rows = new Uint32Array(H), cols = new Uint32Array(W);
  for (let p = 0; p < W * H; p++) if (dist(p) >= 52) { rows[(p / W) | 0]++; cols[p % W]++; }
  let bx0 = 0, by0 = 0, bx1 = W - 1, by1 = H - 1;
  while (bx0 < W - 1 && cols[bx0] <= H * 0.006) bx0++;
  while (bx1 > 0 && cols[bx1] <= H * 0.006) bx1--;
  while (by0 < H - 1 && rows[by0] <= W * 0.006) by0++;
  while (by1 > 0 && rows[by1] <= W * 0.006) by1--;
  /* the paper: from the border, through pixels within the fade cleanPaper
     leaves (its ramp ends ≤ 52 levels from the paper) — and INSIDE the
     drawing's box only a short way (3 % of the sheet): the painter's own
     colour that happens to match the paper (Levan's yellow meadow,
     Kakabadze's pale sky) is part of the picture, not paper */
  /* …but only where the "paper" is a PAINTED ground (a strong colour —
     Levan's yellow, Pirosmani's black). A real sheet (light, nearly
     colourless: cream, white) is paper all the way in, and a wash that
     fades into it (Kakabadze's sky) fades into the new ground as well. */
  const sheet = Math.max(...P) - Math.min(...P) < 60 && Math.max(...P) > 170;
  const T = 52, DEPTH = sheet ? 1 << 15 : Math.round(Math.min(W, H) * 0.03);
  const inBox = (p: number) => { const x = p % W, y = (p / W) | 0; return x >= bx0 && x <= bx1 && y >= by0 && y <= by1; };
  const reach = new Uint8Array(W * H);
  const depth = new Uint32Array(W * H);
  const queue = new Int32Array(W * H);
  let qa = 0, qb = 0;
  const seed = (p: number) => { if (!reach[p] && dist(p) <= 6) { reach[p] = 1; queue[qb++] = p; } };
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
  while (qa < qb) {
    const p = queue[qa++], x = p % W, y = (p / W) | 0;
    for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
      if (q < 0 || reach[q] || dist(q) >= T) continue;
      const d = inBox(q) ? depth[p] + 1 : 0;
      if (d > DEPTH) continue;
      reach[q] = 1; depth[q] = d; queue[qb++] = q;
    }
  }
  /* the drawing's soft rim: two pixels in from the paper */
  for (let it = 0; it < 2; it++) {
    const grow: number[] = [];
    for (let p = 0; p < W * H; p++) {
      if (reach[p]) continue;
      const x = p % W, y = (p / W) | 0;
      if ((x > 0 && reach[p - 1]) || (x < W - 1 && reach[p + 1]) || (y > 0 && reach[p - W]) || (y < H - 1 && reach[p + W])) grow.push(p);
    }
    for (const p of grow) reach[p] = 2;
  }

  const out = Buffer.alloc(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    const i = p * C, o = p * 4;
    const c = [data[i], data[i + 1], data[i + 2]];
    if (!reach[p]) { out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255; continue; }
    /* the least opacity that gives the pixel back over the paper */
    let a = 0;
    for (let k = 0; k < 3; k++) {
      const d = c[k] - P[k];
      const ak = d > 0 ? d / Math.max(1, 255 - P[k]) : d < 0 ? -d / Math.max(1, P[k]) : 0;
      if (ak > a) a = ak;
    }
    a = Math.min(1, a);
    for (let k = 0; k < 3; k++) out[o + k] = a > 0 ? Math.max(0, Math.min(255, Math.round(P[k] + (c[k] - P[k]) / a))) : P[k];
    out[o + 3] = Math.round(a * 255);
  }
  return sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}
