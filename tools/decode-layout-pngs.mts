import fs from "node:fs";
import sharp from "sharp";
const d = "/Users/giorgipopiashvili/Documents/PROJECTS/WAIN/NEW UI/Comments/New";
const files = fs.readdirSync(d).filter((f) => f.endsWith(".png")).sort((a, b) => parseInt(a.match(/copy (\d+)/)![1]) - parseInt(b.match(/copy (\d+)/)![1]));
const out: Record<string, unknown> = {};
for (const f of files) {
  const { data, info } = await sharp(`${d}/${f}`).flatten({ background: "#fff" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, mm = W / 104;
  let gx0 = W, gx1 = 0, gy0 = H, gy1 = 0, gn = 0;
  const rowInk = new Uint32Array(H); const inkPx: number[] = [];
  const isInk = new Uint8Array(W * H);
  const gRow = new Uint32Array(H), gCol = new Uint32Array(W);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3, r = data[i], g = data[i + 1], b = data[i + 2];
    const grey = r === g && g === b && r >= 228 && r <= 232;
    if (grey) { gRow[y]++; gCol[x]++; }
    if (Math.min(r, g, b) < 200) { isInk[y * W + x] = 1; rowInk[y]++; }
  }
  for (let y = 0; y < H; y++) if (gRow[y] > W * 0.03) { gy0 = Math.min(gy0, y); gy1 = Math.max(gy1, y); }
  for (let x = 0; x < W; x++) if (gCol[x] > H * 0.03) { gx0 = Math.min(gx0, x); gx1 = Math.max(gx1, x); }
  for (let y = gy0; y <= gy1; y++) gn += gRow[y];
  const boxArea = (gx1 - gx0 + 1) * (gy1 - gy0 + 1);
  const shape = gn / boxArea > 0.95 ? "rect" : "oval";
  /* text blobs: connected rows then columns within the row band */
  const bands: [number, number][] = [];
  let s = -1;
  for (let y = 0; y <= H; y++) { const on = y < H && rowInk[y] > 0; if (on && s < 0) s = y; if (!on && s >= 0) { bands.push([s, y - 1]); s = -1; } }
  const lines: string[] = [];
  for (const [y0, y1] of bands) {
    const col = new Uint8Array(W);
    for (let y = y0; y <= y1; y++) for (let x = 0; x < W; x++) if (isInk[y * W + x]) col[x] = 1;
    /* split into pieces separated by > 4mm of empty */
    let x0 = -1, gap = 0, last = -1;
    const pieces: [number, number][] = [];
    for (let x = 0; x < W; x++) {
      if (col[x]) { if (x0 < 0) x0 = x; else if (x - last > 4 * mm) { pieces.push([x0, last]); x0 = x; } last = x; }
    }
    if (x0 >= 0) pieces.push([x0, last]);
    void gap;
    lines.push(`y ${(y0 / mm).toFixed(1)}–${(y1 / mm).toFixed(1)} (h ${((y1 - y0 + 1) / mm).toFixed(1)}) : ` + pieces.map(([a, b]) => `${(a / mm).toFixed(1)}–${(b / mm).toFixed(1)}`).join("  "));
  }
  console.log(`\n${f.replace("Artboard 2 ", "").replace("@3x.png", "")}  ${W}x${H}  grey ${shape} x ${(gx0 / mm).toFixed(1)} y ${(gy0 / mm).toFixed(1)} w ${((gx1 - gx0 + 1) / mm).toFixed(1)} h ${((gy1 - gy0 + 1) / mm).toFixed(1)}`);
  for (const l of lines) console.log("   " + l);
}
