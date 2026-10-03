/* HIS 45 ARTBOARDS AGAINST THE ENGINE: each layout set at his size with his
   own words, rendered at his PNG's scale, and the ink compared — how much of
   his ink lies more than 0.5 mm from ours, and of ours from his.
     npx tsx tools/l45/check.mts [A14 …]   (OUT=dir for the his|ours|overlay sheets) */
import fs from "node:fs"; import path from "node:path"; import sharp from "sharp";
import { LAYOUTS } from "../../src/lib/layout45/layouts.data";
import { place, PX, type Faces } from "../../src/lib/layout45/place";
import { typeSvg, zoneSvg } from "../../src/lib/layout45/render";
import type { FieldKey } from "../../src/lib/layout45/spec";

const DIR = "/Users/giorgipopiashvili/Documents/PROJECTS/WAIN/NEW UI/Comments/New";
const OUT = process.env.OUT || "tests/l45/out"; fs.mkdirSync(OUT, { recursive: true });
const FACES: Faces = { hero: { family: "Tinos", weight: 700 }, title: { family: "Tinos", weight: 400 }, titleBold: { family: "Tinos", weight: 700 }, body: { family: "EB Garamond", weight: 400 } };
const want = process.argv.slice(2);
const isInk = (d: Buffer, i: number) => d[i + 1] < 120 && d[i + 2] < 120;   /* black and red */
const mask = (d: Buffer, n: number, ch: number) => { const m = new Uint8Array(n); for (let p = 0; p < n; p++) m[p] = isInk(d, p * ch) ? 1 : 0; return m; };
function grow(m: Uint8Array, w: number, h: number, r: number) { const a = new Uint8Array(w * h), b = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let k = -r; k <= r && !v; k++) { const xx = x + k; if (xx >= 0 && xx < w && m[y * w + xx]) v = 1; } a[y * w + x] = v; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let k = -r; k <= r && !v; k++) { const yy = y + k; if (yy >= 0 && yy < h && a[yy * w + x]) v = 1; } b[y * w + x] = v; } return b; }
const missed = (A: Uint8Array, Bg: Uint8Array) => { let n = 0, m = 0; for (let p = 0; p < A.length; p++) if (A[p]) { n++; if (!Bg[p]) m++; } return n ? 100 * m / n : 0; };

const rows: string[] = []; let bad = 0;
for (const lay of LAYOUTS) {
  if (want.length && !want.includes(lay.id)) continue;
  const f: Partial<Record<FieldKey, string>> = {};
  for (const l of lay.texts) {
    if (l.fields.length === 1) { f[l.fields[0]] ??= l.sample; continue; }
    const parts = l.sample.split(" / ");
    l.fields.forEach((k, i) => { f[k] ??= i === l.fields.length - 1 ? parts.slice(i).join(" / ") : parts[i]; });
  }
  const pl = place(lay, f, lay.refW, lay.refH, FACES);
  const file = path.join(DIR, `Artboard 2 copy ${lay.id.slice(1)}@3x.png`);
  const m = await sharp(file).metadata(); const pw = m.width!, ph = m.height!;
  const b = 2 * PX, W = lay.refW * PX + 2 * b, H = lay.refH * PX + 2 * b;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${-b} ${-b} ${W} ${H}"><rect x="${-b}" y="${-b}" width="${W}" height="${H}" fill="#fff"/>${zoneSvg(pl)}${typeSvg(pl, { text: "#231f20", accent: "#d71920" })}</svg>`;
  const ours = await sharp(Buffer.from(svg), { density: 12 * 25.4 }).resize(pw, ph, { fit: "fill" }).png().toBuffer();
  const A = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true }), B = await sharp(ours).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const mA = mask(A.data, pw * ph, A.info.channels), mB = mask(B.data, pw * ph, B.info.channels);
  /* his stray marks (owner: "a red and a black little square left by mistake"): a solid square blob of ink is not type */
  {
    const seen = new Uint8Array(pw * ph);
    for (let p0 = 0; p0 < pw * ph; p0++) {
      if (!mA[p0] || seen[p0]) continue;
      const st = [p0], blob: number[] = []; seen[p0] = 1;
      while (st.length) { const q = st.pop()!; blob.push(q); const x = q % pw, y = (q / pw) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= pw || ny >= ph) continue; const n2 = ny * pw + nx; if (mA[n2] && !seen[n2]) { seen[n2] = 1; st.push(n2); } } }
      const xs = blob.map((q) => q % pw), ys = blob.map((q) => (q / pw) | 0);
      const bw = Math.max(...xs) - Math.min(...xs) + 1, bh = Math.max(...ys) - Math.min(...ys) + 1;
      if (bw > 4 && bw < 40 && Math.abs(bw - bh) <= 2 && blob.length > 0.9 * bw * bh) for (const q of blob) mA[q] = 0;
    }
  }
  const r = Math.round(0.5 / ((lay.refW + 4) / pw));
  const his = missed(mA, grow(mB, pw, ph, r)), our = missed(mB, grow(mA, pw, ph, r));
  /* the grey zone: overlap of his grey and ours (intersection over union) */
  const grey = (d: Buffer, i: number) => d[i] > 200 && d[i] < 245 && Math.abs(d[i] - d[i + 2]) < 6;
  let inter = 0, uni = 0;
  for (let p = 0; p < pw * ph; p++) { const a = grey(A.data, p * A.info.channels) || (mA[p] && false), c = grey(B.data, p * B.info.channels); if (a && c) inter++; if (a || c) uni++; }
  const zoneIoU = uni ? 100 * inter / uni : 100;
  /* the same without the wine's name (his sits 0.66 mm off centre — Illustrator's box) */
  const sx = pw / (lay.refW + 4), nb = pl.lines.find((q) => q.line.fields[0] === "wineName")?.box;
  const inName = (p: number) => { if (!nb) return false; const x = (p % pw) / sx - 2, y = Math.floor(p / pw) / sx - 2; return x > nb.x0 - 2 && x < nb.x1 + 2 && y > nb.y0 - 1 && y < nb.y1 + 1; };
  const mA2 = mA.map((v, p) => (inName(p) ? 0 : v)), mB2 = mB.map((v, p) => (inName(p) ? 0 : v));
  const his2 = missed(mA2, grow(mB2, pw, ph, r)), our2 = missed(mB2, grow(mA2, pw, ph, r));
  const ok = his < 1.5 && our < 1.5 && zoneIoU > 97;
  const okButName = !ok && his2 < 1.5 && our2 < 1.5 && zoneIoU > 97;
  if (!ok && !okButName) bad++;
  if (!ok && !okButName) console.log(lay.id, "without the name:", his2.toFixed(2), our2.toFixed(2));
  rows.push(`${lay.id.padEnd(4)} ${ok ? "ok     " : okButName ? "ok*    " : "DIFFERS"} his ink off >0.5mm ${his.toFixed(1).padStart(5)}%  ours off ${our.toFixed(1).padStart(5)}%  zone ${zoneIoU.toFixed(1)}%${pl.problems.length ? "  problems: " + pl.problems.join("; ") : ""}${Object.keys(pl.reduced).length ? "  reduced: " + JSON.stringify(pl.reduced) : ""}`);
  /* overlay: his red, ours cyan, both black */
  const ov = Buffer.alloc(pw * ph * 3);
  for (let p = 0; p < pw * ph; p++) { const o = p * 3, a = mA[p], c = mB[p]; const v = a && c ? [20, 20, 20] : a ? [220, 30, 30] : c ? [0, 170, 200] : A.data[p * A.info.channels] < 245 ? [235, 235, 235] : [255, 255, 255]; ov[o] = v[0]; ov[o + 1] = v[1]; ov[o + 2] = v[2]; }
  const overlay = await sharp(ov, { raw: { width: pw, height: ph, channels: 3 } }).png().toBuffer();
  await sharp({ create: { width: pw * 3 + 40, height: ph, channels: 3, background: "#fff" } }).composite([{ input: file, left: 0, top: 0 }, { input: ours, left: pw + 20, top: 0 }, { input: overlay, left: 2 * pw + 40, top: 0 }]).png().toFile(path.join(OUT, `${lay.id}.png`));
}
console.log(rows.join("\n")); console.log(`\n${rows.length - bad}/${rows.length} match (ok* = matches except his wine name, which sits 0.66 mm off centre on his artboard)`);
