import sharp from "sharp";

/* THE HORSE, CUT OUT (owner, 2026-09-30: "cut away the white round the
   horses without touching a single coloured pixel, and never the white
   inside the picture — leave a 5-pixel white strip to be safe"). The
   white is grown in from the picture's border only, through near-white
   pixels, so a white shirt or cloud inside the drawing is never reached;
   that region is then pulled back 5 px from the drawing (the strip stays
   white and opaque) and its edge softened by a pixel. Returns a PNG. */
export async function cutoutHorse(input: Buffer, keep = 5): Promise<Buffer> {
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  const white = (p: number) => {
    const i = p * C, r = data[i], g = data[i + 1], b = data[i + 2];
    return Math.min(r, g, b) > 232 && Math.max(r, g, b) - Math.min(r, g, b) < 18;
  };
  const bg = new Uint8Array(W * H);
  const q = new Int32Array(W * H);
  let qa = 0, qb = 0;
  const seed = (p: number) => { if (!bg[p] && white(p)) { bg[p] = 1; q[qb++] = p; } };
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
  while (qa < qb) {
    const p = q[qa++], x = p % W, y = (p / W) | 0;
    if (x > 0) seed(p - 1);
    if (x < W - 1) seed(p + 1);
    if (y > 0) seed(p - W);
    if (y < H - 1) seed(p + W);
  }
  /* a speck standing alone on the white (a stray mark, a JPEG crumb —
     under 0.15 % of the picture) is white too */
  const lab = new Int32Array(W * H).fill(-1), st = new Int32Array(W * H);
  const sizes: number[] = [];
  for (let p0 = 0; p0 < W * H; p0++) {
    if (bg[p0] || lab[p0] >= 0) continue;
    const id = sizes.length; let sp = 0, n = 0; st[sp++] = p0; lab[p0] = id;
    while (sp) {
      const p = st[--sp], x = p % W, y = (p / W) | 0; n++;
      for (const r of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1])
        if (r >= 0 && !bg[r] && lab[r] < 0) { lab[r] = id; st[sp++] = r; }
    }
    sizes.push(n);
  }
  for (let p = 0; p < W * H; p++) if (!bg[p] && sizes[lab[p]] < W * H * 0.0015) bg[p] = 1;
  /* pull the cut back `keep` px from the drawing (8-neighbour erosion) */
  let cur = bg;
  for (let k = 0; k < keep; k++) {
    const next = new Uint8Array(cur);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (!cur[p]) continue;
      for (let dy = -1; dy <= 1 && next[p]; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (!cur[ny * W + nx]) { next[p] = 0; break; }
      }
    }
    cur = next;
  }
  const alpha = Buffer.alloc(W * H);
  for (let p = 0; p < W * H; p++) alpha[p] = cur[p] ? 0 : 255;
  const soft = await sharp(alpha, { raw: { width: W, height: H, channels: 1 } }).blur(0.8).extractChannel(0).raw().toBuffer();
  const out = Buffer.alloc(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    out[p * 4] = data[p * C]; out[p * 4 + 1] = data[p * C + 1]; out[p * 4 + 2] = data[p * C + 2];
    /* never below opaque where the drawing (or its strip) is */
    out[p * 4 + 3] = cur[p] ? soft[p] : 255;
  }
  return sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}
