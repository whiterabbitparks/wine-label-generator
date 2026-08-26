import { PNG } from "pngjs";

/* IMAGE INTELLIGENCE (owner GO 2026-08-20, branch POPIKA_IMage&layout_relation).
   The foundation for image-aware layouts: instead of treating artwork as a
   rectangle, measure WHERE its ink lives — a density grid, the quiet zones
   (usable negative space), the ink bounding box and centroid, and which side
   of the image is open. Deterministic pixel math, no models, ~ms per image.
   Computed at generation time on the OPAQUE image (before screen-print
   keying) and shipped per style as hints[style].imgAnalysis: the proof
   bench displays it now; interlock/full-bleed placement consumes it next. */

export interface QuietZone {
  /** fractions of image width/height */
  x: number; y: number; w: number; h: number;
  /** mean ink density inside (0..1, lower = quieter) */
  density: number;
}
export interface ArtAnalysis {
  /** grid of mean ink density per cell, row-major, values 0..1 */
  grid: number[][];
  cols: number; rows: number;
  /** overall ink coverage 0..1 */
  inkShare: number;
  /** significant-ink bounding box + density centroid, all as fractions */
  bbox: { x: number; y: number; w: number; h: number } | null;
  /** FULL ink bbox incl. light strokes — content-pinning uses this */
  bboxFull: { x: number; y: number; w: number; h: number } | null;
  centroid: { x: number; y: number } | null;
  /** up to 3 non-overlapping quiet rectangles, biggest first */
  quiet: QuietZone[];
  /** the side with the most usable emptiness */
  openSide: "left" | "right" | "top" | "bottom" | "none";
}

const COLS = 24, ROWS = 15;
const INK_T = 0.12;   // a cell below this density counts as quiet
const DARK_PX = 235;  // min channel below this = ink pixel (matches card-palette)

export function analyzeArtwork(dataUrl: string): ArtAnalysis | null {
  const PREFIX = "data:image/png;base64,";
  if (!dataUrl.startsWith(PREFIX)) return null;
  let png: PNG;
  try {
    png = PNG.sync.read(Buffer.from(dataUrl.slice(PREFIX.length), "base64"));
  } catch {
    return null;
  }
  const { width: W, height: H, data: px } = png;
  if (!W || !H) return null;

  // density grid + ink stats in one pass
  const grid: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  const counts: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  let inkPx = 0, sw = 0, sx = 0, sy = 0;
  let bx0 = W, by0 = H, bx1 = -1, by1 = -1;
  let fx0 = W, fy0 = H, fx1 = -1, fy1 = -1; // FULL ink incl. light strokes
  for (let y = 0; y < H; y++) {
    const gy = Math.min(ROWS - 1, Math.floor((y * ROWS) / H));
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const a = px[i + 3] / 255;
      const r = px[i] * a + 255 * (1 - a), g = px[i + 1] * a + 255 * (1 - a), b = px[i + 2] * a + 255 * (1 - a);
      const m = Math.min(r, g, b);
      const gx = Math.min(COLS - 1, Math.floor((x * COLS) / W));
      const d = m < DARK_PX ? 1 - m / 255 : 0;
      grid[gy][gx] += d; counts[gy][gx]++;
      if (d > 0) {
        inkPx++;
        if (x < fx0) fx0 = x; if (x > fx1) fx1 = x;
        if (y < fy0) fy0 = y; if (y > fy1) fy1 = y;
        if (m < 200) { // significant ink only for the bbox (matches finishArtwork)
          if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
          if (y < by0) by0 = y; if (y > by1) by1 = y;
        }
        const w2 = 1 - m / 255;
        sw += w2; sx += x * w2; sy += y * w2;
      }
    }
  }
  for (let ry = 0; ry < ROWS; ry++)
    for (let cx = 0; cx < COLS; cx++)
      grid[ry][cx] = counts[ry][cx] ? grid[ry][cx] / counts[ry][cx] : 0;

  const bbox = bx1 >= bx0
    ? { x: bx0 / W, y: by0 / H, w: (bx1 - bx0 + 1) / W, h: (by1 - by0 + 1) / H }
    : null;
  const bboxFull = fx1 >= fx0
    ? { x: fx0 / W, y: fy0 / H, w: (fx1 - fx0 + 1) / W, h: (fy1 - fy0 + 1) / H }
    : null;
  const centroid = sw > 0 ? { x: sx / sw / W, y: sy / sw / H } : null;

  /* quiet zones: greedy largest-rectangle over the quiet mask, up to 3,
     non-overlapping. ROWSxCOLS is tiny so brute force is instant. */
  const used: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const quiet: QuietZone[] = [];
  for (let n = 0; n < 3; n++) {
    let best: { x: number; y: number; w: number; h: number; area: number; d: number } | null = null;
    for (let y0 = 0; y0 < ROWS; y0++) {
      for (let x0 = 0; x0 < COLS; x0++) {
        for (let y1 = y0; y1 < ROWS; y1++) {
          for (let x1 = x0; x1 < COLS; x1++) {
            let ok = true, sum = 0;
            for (let y = y0; y <= y1 && ok; y++)
              for (let x = x0; x <= x1; x++) {
                if (used[y][x] || grid[y][x] > INK_T) { ok = false; break; }
                sum += grid[y][x];
              }
            if (!ok) { break; }
            const area = (y1 - y0 + 1) * (x1 - x0 + 1);
            if (!best || area > best.area)
              best = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, area, d: sum / area };
          }
        }
      }
    }
    if (!best || best.area < 6) break; // ignore slivers (< ~2.5% of the image)
    for (let y = best.y; y < best.y + best.h; y++)
      for (let x = best.x; x < best.x + best.w; x++) used[y][x] = true;
    quiet.push({
      x: best.x / COLS, y: best.y / ROWS, w: best.w / COLS, h: best.h / ROWS, density: best.d,
    });
  }

  // open side: mean density of each edge third
  const third = (x0: number, y0: number, x1: number, y1: number) => {
    let s = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += grid[y][x]; n++; }
    return n ? s / n : 1;
  };
  const sides = {
    left: third(0, 0, Math.floor(COLS / 3), ROWS),
    right: third(COLS - Math.floor(COLS / 3), 0, COLS, ROWS),
    top: third(0, 0, COLS, Math.floor(ROWS / 3)),
    bottom: third(0, ROWS - Math.floor(ROWS / 3), COLS, ROWS),
  };
  const openEntries = (Object.entries(sides) as ["left" | "right" | "top" | "bottom", number][])
    .sort((a, b) => a[1] - b[1]);
  const openSide = openEntries[0][1] < INK_T ? openEntries[0][0] : "none";

  return {
    grid: grid.map((r) => r.map((v) => Math.round(v * 100) / 100)),
    cols: COLS, rows: ROWS,
    inkShare: Math.round((inkPx / (W * H)) * 1000) / 1000,
    bbox, bboxFull, centroid, quiet, openSide,
  };
}
