import sharp from "sharp";

/* THE REAL LABEL, PUT ONTO THE PHOTOGRAPH (2026-09-25, owner: "the label
   on the bottle and on the marketing images must be IDENTICAL — no drift").
   The image model redraws a label it is shown, and small type drifts
   ("Whiie", "Georgio"). So the model is shown a BLANK label in one key
   colour instead, and paints the bottle, the pose and the light around
   it. Here that key patch is found and the customer's own label file is
   laid into it:

     · the blank label carries a thin CYAN stripe along its top edge, so
       the neck's direction is known at any tilt (a bottle lying in soil
       leans past 45°); without it, the patch's long or short side —
       whichever stands nearer upright — is taken as the axis;
     · across the bottle the label wraps a cylinder — its width is spread
       by the arc it covers on the bottle's real diameter, softened by
       half so the type near its ends stays readable;
     · along the bottle, each column runs from the patch's own top edge to
       its own bottom edge (fitted as gentle curves, so a finger over the
       edge does not dent it);
     · the patch's light and shade are carried onto the label;
     · whatever covers the patch (a finger, a glass rim) stays in front,
       because only key-coloured pixels are replaced.

   Returns null when no clean patch is found — the caller keeps the
   model's own picture then. */

export const KEY_HEX = "#FF00FF";

/* a flat key-coloured label of the label's own proportion — shown to the
   model in place of the label */
export async function keyLabel(wmm: number, hmm: number): Promise<string> {
  const w = 600, h = Math.max(60, Math.round((600 * hmm) / wmm));
  const band = Math.max(6, Math.round(h * 0.08));
  const png = await sharp({ create: { width: w, height: h, channels: 3, background: KEY_HEX } })
    .composite([{ input: { create: { width: w, height: band, channels: 3, background: "#00FFFF" } }, left: 0, top: 0 }]).png().toBuffer();
  return "data:image/png;base64," + png.toString("base64");
}

export const KEY_PROMPT =
  " THE LABEL IS A BLANK PLACEHOLDER — NON-NEGOTIABLE: the attached label image is a blank sheet in flat pure magenta (#FF00FF) with a thin cyan (#00FFFF) stripe along its TOP edge. Put exactly that on the bottle: a perfectly even flat magenta label, matte, its cyan stripe along the edge that faces the bottle's NECK — NOTHING printed on it, no text, no artwork, no logo, no border, no pattern. Only the photograph's own light and shadow may shade it. Nothing else in the picture is magenta, pink or cyan.";

type RGBA = { data: Buffer; w: number; h: number; ch: number };
const raw = async (dataUrl: string): Promise<RGBA> => {
  const { data, info } = await sharp(Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, ch: info.channels };
};

/* how magenta (hue 300) — or cyan (hue 180) — a pixel is: 0 … 1 */
function keyness(r: number, g: number, b: number, hueAt = 300): number {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx < 35) return 0;
  const sat = (mx - mn) / mx;
  if (sat < 0.25) return 0;
  let h = 0;
  const d = mx - mn || 1;
  if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const dh = Math.abs(h - hueAt);
  const hueK = Math.max(0, Math.min(1, (40 - dh) / 20));
  const satK = Math.max(0, Math.min(1, (sat - 0.25) / 0.25));
  return hueK * satK;
}

/* least-squares quadratic through (x, y) points, one pass of outlier
   rejection (a finger over the edge) */
function fitQuad(xs: number[], ys: number[]): (x: number) => number {
  const solve = (idx: number[]) => {
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
    for (const i of idx) { const x = xs[i], y = ys[i], x2 = x * x; s0++; s1 += x; s2 += x2; s3 += x2 * x; s4 += x2 * x2; t0 += y; t1 += x * y; t2 += x2 * y; }
    const M = [[s4, s3, s2, t2], [s3, s2, s1, t1], [s2, s1, s0, t0]];
    for (let c = 0; c < 3; c++) {
      let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      const v = M[c][c] || 1e-9;
      for (let k = c; k < 4; k++) M[c][k] /= v;
      for (let r = 0; r < 3; r++) if (r !== c) { const f = M[r][c]; for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k]; }
    }
    return [M[0][3], M[1][3], M[2][3]];
  };
  const all = xs.map((_, i) => i);
  let [a, b, c] = solve(all);
  const res = all.map((i) => Math.abs(ys[i] - (a * xs[i] * xs[i] + b * xs[i] + c)));
  const cut = [...res].sort((p, q) => p - q)[Math.floor(res.length * 0.8)] * 1.5 + 1;
  const keep = all.filter((i) => res[i] <= cut);
  if (keep.length > 8) [a, b, c] = solve(keep);
  return (x: number) => a * x * x + b * x + c;
}

export async function compositeLabel(photo: string, label: string, opt: { labelWmm: number; bottleDiamCM: number }): Promise<{ image: string; coverage: number } | null> {
  const P = await raw(photo), L = await raw(label);
  const { w, h } = P;
  const k = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * P.ch;
    k[i] = P.data[o + 3] < 20 ? 0 : Math.max(keyness(P.data[o], P.data[o + 1], P.data[o + 2]), keyness(P.data[o], P.data[o + 1], P.data[o + 2], 180));
  }
  /* the largest connected patch */
  const comp = new Int32Array(w * h).fill(-1);
  let best = -1, bestN = 0;
  const q = new Int32Array(w * h);
  for (let s = 0, id = 0; s < w * h; s++) {
    if (k[s] < 0.5 || comp[s] >= 0) continue;
    let qh = 0, qt = 0; q[qt++] = s; comp[s] = id; let n = 0;
    while (qh < qt) {
      const p = q[qh++]; n++;
      const x = p % w, y = (p / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const np = ny * w + nx; if (comp[np] >= 0 || k[np] < 0.5) continue;
        comp[np] = id; q[qt++] = np;
      }
    }
    if (n > bestN) { bestN = n; best = id; }
    id++;
  }
  if (bestN < w * h * 0.004) return null;
  /* its axis: second moments → the long side's angle, turned to the one
     nearer upright (a bottle is seldom held past 45°) */
  let mx = 0, my = 0;
  for (let p = 0; p < w * h; p++) if (comp[p] === best) { mx += p % w; my += (p / w) | 0; }
  mx /= bestN; my /= bestN;
  let sxx = 0, syy = 0, sxy = 0;
  for (let p = 0; p < w * h; p++) if (comp[p] === best) { const dx = p % w - mx, dy = ((p / w) | 0) - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);        /* the patch's long side, from the x axis */
  /* a direction's lean from upright, folded into (−90°, 90°] */
  const lean = (a: number) => { let d = (a - Math.PI / 2) % Math.PI; if (d <= -Math.PI / 2) d += Math.PI; if (d > Math.PI / 2) d -= Math.PI; return d; };
  /* the bottle's axis is the long side or the short side — whichever
     stands nearer upright */
  const l1 = lean(ang), l2 = lean(ang + Math.PI / 2);
  let tilt = Math.abs(l1) <= Math.abs(l2) ? l1 : l2;
  /* the cyan stripe marks the top: the direction from the patch's middle
     to the stripe's middle is "up the bottle" */
  let cx = 0, cy = 0, cn = 0;
  for (let p = 0; p < w * h; p++) {
    if (comp[p] !== best) continue;
    const o = p * P.ch;
    if (keyness(P.data[o], P.data[o + 1], P.data[o + 2], 180) > 0.5) { cx += p % w; cy += (p / w) | 0; cn++; }
  }
  if (cn > bestN * 0.02) {
    const ux = cx / cn - mx, uy = cy / cn - my;
    tilt = Math.atan2(ux, -uy);                               /* 0 = neck straight up */
  }
  const cs = Math.cos(-tilt), sn = Math.sin(-tilt);
  const rot = (x: number, y: number) => ({ u: (x - mx) * cs - (y - my) * sn, v: (x - mx) * sn + (y - my) * cs });
  /* the patch in the bottle's own frame: its left/right, and per column
     its top/bottom */
  let u0 = Infinity, u1 = -Infinity;
  const tops = new Map<number, number>(), bots = new Map<number, number>();
  for (let p = 0; p < w * h; p++) {
    if (comp[p] !== best) continue;
    const { u, v } = rot(p % w, (p / w) | 0);
    const col = Math.round(u);
    u0 = Math.min(u0, u); u1 = Math.max(u1, u);
    if (!tops.has(col) || v < tops.get(col)!) tops.set(col, v);
    if (!bots.has(col) || v > bots.get(col)!) bots.set(col, v);
  }
  const cols = [...tops.keys()].filter((c) => c > u0 + 2 && c < u1 - 2);
  if (cols.length < 10) return null;
  const top = fitQuad(cols, cols.map((c) => tops.get(c)!)), bot = fitQuad(cols, cols.map((c) => bots.get(c)!));
  const uc = (u0 + u1) / 2, half = (u1 - u0) / 2;
  const phiMax = Math.min(1.5, (opt.labelWmm / 20) / (opt.bottleDiamCM / 2));  /* half-width over radius, in cm */
  const sMax = Math.sin(phiMax);
  /* the patch's own light: its median brightness is the label's "1" */
  const vals: number[] = [];
  for (let p = 0; p < w * h; p++) if (comp[p] === best && k[p] > 0.8) { const o = p * P.ch; vals.push(Math.max(P.data[o], P.data[o + 1], P.data[o + 2])); }
  vals.sort((a, b) => a - b);
  const ref = vals[Math.floor(vals.length / 2)] || 255;
  /* lay the label in: every key pixel near the patch */
  const out = Buffer.from(P.data);
  const near = (x: number, y: number) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h && comp[ny * w + nx] === best) return true; } return false; };
  let laid = 0;
  const sample = (fx: number, fy: number, c: number) => {
    const x = Math.max(0, Math.min(L.w - 1.001, fx)), y = Math.max(0, Math.min(L.h - 1.001, fy));
    const x0 = Math.floor(x), y0 = Math.floor(y), ax = x - x0, ay = y - y0;
    const at = (xx: number, yy: number) => L.data[(yy * L.w + xx) * L.ch + c];
    return at(x0, y0) * (1 - ax) * (1 - ay) + at(x0 + 1, y0) * ax * (1 - ay) + at(x0, y0 + 1) * (1 - ax) * ay + at(x0 + 1, y0 + 1) * ax * ay;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    const a = k[p];
    if (a <= 0.02 || !near(x, y)) continue;
    const { u, v } = rot(x, y);
    const t = Math.max(-1, Math.min(1, (u - uc) / half));
    const phi = Math.asin(t * sMax);
    const lu = 0.5 * ((phi / phiMax + 1) / 2) + 0.5 * ((t + 1) / 2);
    const tp = top(u), bt = bot(u);
    const lv = (v - tp) / Math.max(1, bt - tp);
    if (lv < -0.25 || lv > 1.25) continue;
    const o = p * P.ch;
    const s = Math.max(P.data[o], P.data[o + 1], P.data[o + 2]) / ref;
    /* the photograph's edge pixels carry some magenta — take it out */
    let r0 = P.data[o], g0 = P.data[o + 1], b0 = P.data[o + 2];
    const m = Math.min(r0, b0); if (m > g0) { r0 -= m - g0; b0 -= m - g0; }
    for (let c = 0; c < 3; c++) {
      const lc = sample(lu * (L.w - 1), Math.max(0, Math.min(1, lv)) * (L.h - 1), c);
      const lit = s <= 1 ? lc * s : lc + (255 - lc) * Math.min(1, (s - 1) * 0.8);
      out[o + c] = Math.round((c === 0 ? r0 : c === 1 ? g0 : b0) * (1 - a) + lit * a);
    }
    laid++;
  }
  const png = await sharp(out, { raw: { width: w, height: h, channels: P.ch as 4 } }).png().toBuffer();
  return { image: "data:image/png;base64," + png.toString("base64"), coverage: laid / (w * h) };
}
