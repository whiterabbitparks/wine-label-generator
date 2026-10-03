/* THE FINAL-ROUND LAYOUTS NEXT TO THE OWNER'S ARTBOARDS (2026-10-03).
   Every layout is set by the new engine (src/lib/layout2) with his
   placeholder texts and his faces (Times → Tinos, EB Garamond), rendered
   to his PNG's scale, and the ink is compared: how much of his ink lies
   more than 0.5 mm (and 0.25 mm) from ours, and how much of ours is not
   his. Two passes:
     1. each layout at its own reference size against its own artboard;
     2. TWIN TEST — each layout set at its twin's size (the 80 mm one
        stretched to 166 mm and back) against the TWIN's artboard: the
        proof that a proportion change is absorbed by the image zone and
        the type stays where he put it.

     npx tsx tools/layout2-preview.mts [L07 …]     → tests/layout2/out/

   Writes per layout <id>.png and twin-<id>.png (his | ours | overlay:
   his ink red, ours cyan, agreement black), contact sheets sheet.png /
   sheet-twins.png and report.json.

   Known, accepted deviations: on his artboards "CHÂTEAU MARGAUX" sits
   0.66 mm left of centre and the tracked "GRAND VIN" 0.35–0.5 mm right
   of it (Illustrator centres the box, trailing tracking included); the
   engine centres the ink exactly, so those layouts read ~2–3% off. */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { LAYOUTS } from "../src/lib/layout2/layouts.data";
import { placeLayout, PX_MM, type Faces } from "../src/lib/layout2/place";
import { layoutSvg } from "../src/lib/layout2/render";
import { FAMILIES, layoutFamily, splitSample, suits } from "../src/lib/layout2/engine";
import type { Layout2 } from "../src/lib/layout2/spec";

const ART_DIR = "/Users/giorgipopiashvili/Documents/PROJECTS/WAIN/NEW UI/Comments/New";
const OUT = "tests/layout2/out";
fs.mkdirSync(OUT, { recursive: true });

/* his artboard PNGs in numeric order are his pages in order (checked by size) */
const pngs = fs.readdirSync(ART_DIR).filter((f) => /^Artboard 2 copy \d+@3x\.png$/.test(f)).sort((a, b) => +a.match(/(\d+)@/)![1] - +b.match(/(\d+)@/)![1]);
const pngOf = (lay: Layout2) => path.join(ART_DIR, pngs[LAYOUTS.indexOf(lay)]);

const FIELDS: Record<string, string> = {
  producer: "GRAND VIN", wineName: "CHÂTEAU MARGAUX", appellation: "Margaux AOC", classification: "Premier Grand Cru Classé",
  vintage: "2018", grape: "Cabernet Sauvignon, Merlot", regionCountry: "Bordeaux, France", special: "Vieilles Vignes",
  wineTypeLine: "Dry Red Wine", alcVol: "Alc.: 13.5% / 750 ml.",
};
/* his page's own sample words (some pages carry "Cabernet Sauvignon" alone) */
function fieldsOf(lay: Layout2) {
  const f = { ...FIELDS };
  for (const t of lay.texts) { const parts = splitSample(t.sample, t.fields.length); if (parts.length === t.fields.length) t.fields.forEach((k, i) => { f[k] = parts[i]; }); }
  return f;
}
const FACES: Faces = { hero: { family: "Tinos", weight: 700 }, bold: { family: "Tinos", weight: 700 }, title: { family: "Tinos", weight: 400 }, text: { family: "EB Garamond", weight: 400 } };

/* ink: black and red alike, by the green and blue channels */
const isInk = (d: Buffer, i: number) => d[i + 1] < 120 && d[i + 2] < 120;
function mask(data: Buffer, w: number, h: number, ch: number): Uint8Array {
  const m = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) m[p] = isInk(data, p * ch) ? 1 : 0;
  return m;
}
function dilate(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const a = new Uint8Array(w * h), b = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let k = -r; k <= r && !v; k++) { const xx = x + k; if (xx >= 0 && xx < w && m[y * w + xx]) v = 1; } a[y * w + x] = v; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let k = -r; k <= r && !v; k++) { const yy = y + k; if (yy >= 0 && yy < h && a[yy * w + x]) v = 1; } b[y * w + x] = v; }
  return b;
}
/* % of A's ink not within the dilated B */
function missed(A: Uint8Array, Bd: Uint8Array): number {
  let n = 0, miss = 0;
  for (let p = 0; p < A.length; p++) if (A[p]) { n++; if (!Bd[p]) miss++; }
  return n ? 100 * miss / n : 0;
}

interface Cell { id: string; buf: Buffer; w: number; h: number; dev: number }

/* set `lay` at `ref`'s size and compare with `ref`'s artboard */
async function compare(lay: Layout2, ref: Layout2, outName: string, cells: Cell[], report: any[]) {
  const his = sharp(pngOf(ref));
  const meta = await his.metadata();
  const pw = meta.width!, ph = meta.height!;
  const sizeOk = Math.abs(ph / pw - (ref.refH + 4) / (ref.refW + 4)) < 0.01;

  const placed = placeLayout(lay, fieldsOf(ref), ref.refW, ref.refH, FACES);
  const svg = layoutSvg(placed, { bleed: 2 * PX_MM, inks: { text: "#231f20", accent: "#231f20" } });
  const ours = await sharp(Buffer.from(svg), { density: 12 * 25.4 }).resize(pw, ph, { fit: "fill" }).png().toBuffer();

  const A = await his.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const B = await sharp(ours).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const mm = (ref.refW + 4) / pw;
  const mA = mask(A.data, pw, ph, A.info.channels), mB = mask(B.data, pw, ph, B.info.channels);
  const r5 = Math.round(0.5 / mm), r25 = Math.round(0.25 / mm);
  const his5 = missed(mA, dilate(mB, pw, ph, r5)), his25 = missed(mA, dilate(mB, pw, ph, r25)), ours5 = missed(mB, dilate(mA, pw, ph, r5));
  const worst = Math.max(his5, ours5), ok = worst < 1.5;

  const ov = Buffer.alloc(pw * ph * 3);
  for (let p = 0; p < pw * ph; p++) {
    const da = !!mA[p], db = !!mB[p], grey = A.data[p * A.info.channels] < 245 && !da, o = p * 3;
    if (da && db) { ov[o] = 20; ov[o + 1] = 20; ov[o + 2] = 20; }
    else if (da) { ov[o] = 220; ov[o + 1] = 30; ov[o + 2] = 30; }
    else if (db) { ov[o] = 0; ov[o + 1] = 170; ov[o + 2] = 200; }
    else { const g = grey ? 236 : 255; ov[o] = g; ov[o + 1] = g; ov[o + 2] = g; }
  }
  const overlay = await sharp(ov, { raw: { width: pw, height: ph, channels: 3 } }).png().toBuffer();

  const gap = 24, capH = 60;
  const title = lay === ref ? `${lay.id} · ${lay.refW}×${Math.round(lay.refH)} mm · page ${lay.page} ↔ ${pngs[LAYOUTS.indexOf(ref)].replace("@3x.png", "")}` : `${lay.id} set at ${ref.refW}×${Math.round(ref.refH)} mm (its twin ${ref.id}'s size) ↔ ${ref.id}'s artboard`;
  const caption = `<svg xmlns="http://www.w3.org/2000/svg" width="${pw * 3 + gap * 2}" height="${capH}"><text x="8" y="40" font-family="Helvetica, Arial" font-size="30" fill="#111">${title}${sizeOk ? "" : " · SIZE MISMATCH"} · ${ok ? "matches" : "DIFFERS"} · his ink off by >0.5 mm: ${his5.toFixed(1)}% · >0.25 mm: ${his25.toFixed(1)}% · ours not his: ${ours5.toFixed(1)}%</text></svg>`;
  const sheet = await sharp({ create: { width: pw * 3 + gap * 2, height: ph + capH, channels: 3, background: "#ffffff" } })
    .composite([
      { input: Buffer.from(caption), top: 0, left: 0 },
      { input: await his.clone().png().toBuffer(), top: capH, left: 0 },
      { input: ours, top: capH, left: pw + gap },
      { input: overlay, top: capH, left: 2 * (pw + gap) },
    ]).png().toBuffer();
  fs.writeFileSync(path.join(OUT, `${outName}.png`), sheet);
  cells.push({ id: outName, buf: overlay, w: pw, h: ph, dev: worst });
  report.push({ test: outName, layout: lay.id, against: ref.id, size: `${ref.refW}x${Math.round(ref.refH)}`, sizeOk, ok, hisOff05: +his5.toFixed(2), hisOff025: +his25.toFixed(2), oursNotHis05: +ours5.toFixed(2) });
  console.log(`${outName.padEnd(12)} ${sizeOk ? "" : "SIZE? "}${ok ? "ok     " : "DIFFERS"} his>0.5mm ${his5.toFixed(1).padStart(5)}%  his>0.25mm ${his25.toFixed(1).padStart(5)}%  ours-not-his ${ours5.toFixed(1).padStart(5)}%`);
}

/* a contact sheet of overlays, 5 across */
async function contact(cells: Cell[], file: string) {
  if (cells.length < 2) return;
  const cw = 300, cols = 5, pad = 16, capH = 28;
  const scaled = await Promise.all(cells.map(async (c) => ({ ...c, img: await sharp(c.buf).resize(cw).png().toBuffer(), h: Math.round(c.h * cw / c.w) })));
  const rows: typeof scaled[] = []; for (let i = 0; i < scaled.length; i += cols) rows.push(scaled.slice(i, i + cols));
  const rowH = rows.map((r) => Math.max(...r.map((c) => c.h)) + capH + pad);
  const H = rowH.reduce((s, h) => s + h, pad), W = cols * (cw + pad) + pad;
  const comps: sharp.OverlayOptions[] = []; let y = pad;
  rows.forEach((r, ri) => {
    r.forEach((c, ci) => {
      const x = pad + ci * (cw + pad);
      comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${capH}"><text x="0" y="20" font-family="Helvetica, Arial" font-size="18" fill="${c.dev >= 1.5 ? "#c0392b" : "#111"}">${c.id} · ${c.dev.toFixed(1)}% off</text></svg>`), top: y, left: x });
      comps.push({ input: c.img, top: y + capH, left: x });
    });
    y += rowH[ri];
  });
  fs.writeFileSync(path.join(OUT, file), await sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } }).composite(comps).png().toBuffer());
}

const want = process.argv.slice(2);
const pick = LAYOUTS.filter((l) => !want.length || want.includes(l.id));
const report: any[] = [], own: Cell[] = [], twins: Cell[] = [];
console.log("— each layout at its own size —");
for (const lay of pick) await compare(lay, lay, lay.id, own, report);
console.log("— twin test: each layout at its twin's size, against the twin's artboard —");
for (const lay of pick) { const tw = lay.twin && LAYOUTS.find((l) => l.id === lay.twin); if (tw) await compare(lay, tw, `twin-${lay.id}`, twins, report); }
await contact(own, "sheet.png"); await contact(twins, "sheet-twins.png");

/* 3. STRESS — no reference: every family at other proportions, with
   fields missing, with long names; the engine's own problem report is
   printed under each cell (sheet-stress.png) */
console.log("— stress: other sizes, missing fields, long names —");
const LONG = { ...FIELDS, producer: "DOMAINE DE LA GRANDE MONTAGNE NOIRE", wineName: "CHÂTEAU BEAUSÉJOUR-DUFFAU", appellation: "Saint-Émilion Grand Cru AOC", grape: "Cabernet Sauvignon, Cabernet Franc, Merlot, Petit Verdot" };
const MISSING = { ...FIELDS, producer: "", classification: "", special: "", grape: "" };
const CASES: { name: string; w: number; h: number; fields: Record<string, string> }[] = [
  { name: "100×80", w: 100, h: 80, fields: FIELDS }, { name: "100×120", w: 100, h: 120, fields: FIELDS }, { name: "100×166", w: 100, h: 166, fields: FIELDS },
  { name: "130×80", w: 130, h: 80, fields: FIELDS }, { name: "70×100", w: 70, h: 100, fields: FIELDS },
  { name: "missing", w: 100, h: 80, fields: MISSING }, { name: "long", w: 100, h: 80, fields: LONG },
];
{
  const cw = 260, pad = 14, capH = 44, bleed = 2;
  const fams = FAMILIES.filter((f) => f.some((l) => pick.includes(l)));
  const rowsImgs: { img: Buffer; h: number; cap: string; bad: boolean }[][] = [];
  for (const fam of fams) {
    const row: typeof rowsImgs[0] = [];
    for (const c of CASES) {
      const { lay, placed, fit } = layoutFamily(fam, c.fields as any, c.w, c.h, FACES);
      const svg = layoutSvg(placed, { bleed: bleed * PX_MM, inks: { text: "#231f20", accent: "#b3261e" } });
      const pw = cw, ph = Math.round(cw * (c.h + 2 * bleed) / (c.w + 2 * bleed));
      const img = await sharp(Buffer.from(svg), { density: 12 * 25.4 }).resize(pw, ph, { fit: "fill" }).png().toBuffer();
      const ok = suits(fam, c.w, c.h);
      const cap = `${fam[0].id}${fam.length > 1 ? "/" + fam[1].id : ""} ${c.name} → ${lay.id}${ok ? "" : " · NOT OFFERED at this proportion"}${fit.reduced.length ? ` · ${fit.reduced.join(", ")}` : ""}${fit.wrapped.length ? ` · wrapped: ${fit.wrapped.join(", ")}` : ""}${fit.problems.length ? " · " + fit.problems[0] : ""}`;
      row.push({ img, h: ph, cap, bad: fit.problems.length > 0 && ok });
      if (ok && (fit.reduced.length || fit.problems.length)) console.log(`${fam[0].id} ${c.name}: ${lay.id} reduced ${fit.reduced.join(", ") || "—"}${fit.wrapped.length ? `  WRAPPED ${fit.wrapped.join(", ")}` : ""}${fit.needsNarrower.length ? `  narrower face for ${fit.needsNarrower.join(", ")}` : ""}  ${fit.problems.join("; ")}`);
    }
    rowsImgs.push(row);
  }
  const rowH = rowsImgs.map((r) => Math.max(...r.map((c) => c.h)) + capH + pad);
  const H = rowH.reduce((s, h) => s + h, pad), W = CASES.length * (cw + pad) + pad;
  const comps: sharp.OverlayOptions[] = []; let y = pad;
  rowsImgs.forEach((r, ri) => {
    r.forEach((c, ci) => {
      const x = pad + ci * (cw + pad);
      const words = c.cap.split(" · "), l1 = words[0], l2 = words.slice(1).join(" · ");
      comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${capH}"><text x="0" y="15" font-family="Helvetica, Arial" font-size="13" fill="#111">${l1.replace(/&/g, "&amp;")}</text><text x="0" y="33" font-family="Helvetica, Arial" font-size="12" fill="${c.bad ? "#c0392b" : "#555"}">${l2.replace(/&/g, "&amp;")}</text></svg>`), top: y, left: x });
      comps.push({ input: c.img, top: y + capH, left: x });
    });
    y += rowH[ri];
  });
  fs.writeFileSync(path.join(OUT, "sheet-stress.png"), await sharp({ create: { width: W, height: H, channels: 3, background: "#f3f3f3" } }).composite(comps).png().toBuffer());
}
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
const sum = (rs: any[]) => `${rs.filter((r) => r.ok).length}/${rs.length} match (under 1.5% of ink off by more than 0.5 mm); differing: ${rs.filter((r) => !r.ok).map((r) => `${r.test} (${r.hisOff05}%)`).join(", ") || "none"}`;
console.log(`\nown size: ${sum(report.filter((r) => !r.test.startsWith("twin-")))}\ntwin test: ${sum(report.filter((r) => r.test.startsWith("twin-")))}`);
