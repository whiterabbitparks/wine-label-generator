/* THE REVIEW SHEET (owner, 2026-09-23: "give me the PDF — I will change
   it, and you compare it with yours and see what I changed").

   One page, every case at its real size in millimetres: the label's edge
   as a hairline, the picture's zone as a grey shape, every line as LIVE
   text in its embedded face, so Illustrator opens it as editable type.
   Captions and notes are BLUE (#0057FF) — blue is never label text.

   Beside the PDF a manifest.json keeps each case's frame on the page and
   the engine's own lines, so tools/review-diff.mts can read his edited
   file back and say, line by line, what he moved, resized or re-weighted.

     npx tsx tools/review-pdf.mts [out-dir]
*/
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, degrees, setCharacterSpacing, pushGraphicsState, popGraphicsState } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
const O = await import("@/lib/typeset/overrides");
const T = await import("@/lib/typeset/templates");
const { faceFile } = await import("@/lib/typeset/fonts");

const FULL = { producer: "GRAND VIN", wine: "Château Margaux", appellation: "Margaux AOC", classification: "Premier Grand Cru Classé", vintage: "2018", grape: "Cabernet Sauvignon, Merlot", region: "Bordeaux", country: "France", special: "Vieilles Vignes", sweetness: "Dry", wineColorName: "Red", wineType: "Wine", alcohol: "13.5", volume: "750" };
const LONG = { ...FULL, wine: "Château Marceau de Beauregard", producer: "DOMAINE DE LA ROMANÉE-CONTI", classification: "Grand Cru Classé en 1855, Premier Cru", grape: "Cabernet Sauvignon, Merlot, Petit Verdot" };
const SPARSE = { wine: "Korra", vintage: "2023", sweetness: "Dry", wineColorName: "Amber", wineType: "Wine", alcohol: "12.5", volume: "750" };
const DATA: Record<string, Record<string, string>> = { full: FULL, long: LONG, sparse: SPARSE };
const CASES = [
  ...["t01", "t02", "t03", "t04", "t05", "t06", "t07", "t08", "t09", "t10", "t11", "t12"].map((id) => `${id}:104x84:full`),
  "t01:104x84:sparse", "t02:104x84:long", "t06:110x80:sparse", "t08:130x90:long",
  "t05:70x120:full", "t11:104x84:long", "t12:110x80:sparse", "t03:90x90:long",
];

const PT = 72 / 25.4;
const BLUE = rgb(0, 0x57 / 255, 1);
const hexRgb = (h: string) => { const n = parseInt(h.slice(1), 16); return rgb((n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
const COLS = 4, CELL_W = 145, CELL_H = 140, TOP = 30, SIDE = 15;   /* mm */

const outDir = process.argv[2] || path.join(process.env.HOME!, "Desktop", "8K-sheet-test");
fs.mkdirSync(outDir, { recursive: true });
const rowsN = Math.ceil(CASES.length / COLS);
const pageW = (SIDE * 2 + COLS * CELL_W) * PT, pageH = (TOP + rowsN * CELL_H + 10) * PT;

const doc = await PDFDocument.create();
doc.registerFontkit(fontkit);
doc.setTitle("8K Labels — layout review");
const page = doc.addPage([pageW, pageH]);
const note = await doc.embedFont(StandardFonts.HelveticaBold);
const noteR = await doc.embedFont(StandardFonts.Helvetica);
const fonts = new Map<string, Awaited<ReturnType<PDFDocument["embedFont"]>>>();
const fontOf = async (family: string, weight: number) => {
  const file = faceFile({ family, weight });
  if (!fonts.has(file)) {
    const clean = file.replace(`${path.sep}labels${path.sep}`, `${path.sep}labels-pdf${path.sep}`);
    /* under the face's OWN PostScript name — pdf-lib otherwise adds a
       random suffix ("EBGaramond-Bold-9196") and Illustrator cannot match
       it to the installed font */
    const psName = fontkit.create(fs.readFileSync(file)).postscriptName;
    fonts.set(file, await doc.embedFont(fs.readFileSync(fs.existsSync(clean) ? clean : file), { subset: false, customName: psName }));
  }
  return fonts.get(file)!;
};

page.drawText("LAYOUT REVIEW — move, resize or re-weight anything; write notes in BLUE. Keep text as text (no outlines). Save under a NEW name.", { x: SIDE * PT, y: pageH - 14 * PT, size: 14, font: note, color: BLUE });
page.drawText("Top: the twelve at 104 × 84 with full details (house alcohol wording). Below: the hard cases — long names, few details, other sizes.", { x: SIDE * PT, y: pageH - 21 * PT, size: 11, font: noteR, color: BLUE });

const manifest: unknown[] = [];
for (const [i, c] of CASES.entries()) {
  const [id, size, kase] = c.split(":");
  const [w, h] = size.split("x").map(Number);
  const t = O.templatesNow().find((x) => x.id === id)!;
  const lay = T.layoutFromTemplate({ template: t, fields: T.templateFields(DATA[kase]), widthMm: w, heightMm: h, seed: 7, ground: "#ffffff", ink: "#1b1b1b", accent: "#D0021B" });
  const col = i % COLS, row = Math.floor(i / COLS);
  const fx = SIDE + col * CELL_W, fy = TOP + row * CELL_H + 10;         /* frame, mm from the page's top-left */
  const X = (mm: number) => (fx + mm) * PT, Y = (mm: number) => pageH - (fy + mm) * PT;
  const s = 1 / T.PX_PER_MM;                                           /* label px → mm */

  const what = kase === "full" ? "full details" : kase === "long" ? "long names" : "few details";
  page.drawText(`${id.toUpperCase()} · ${w} × ${h} mm · ${what}`, { x: X(0), y: Y(-3), size: 10, font: note, color: BLUE });
  /* the label's edge */
  page.drawRectangle({ x: X(0), y: Y(h), width: w * PT, height: h * PT, color: rgb(1, 1, 1), borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.35 });
  /* the picture's zone */
  const a = lay.art;
  if (a.kind === "oval") page.drawEllipse({ x: X((a.x + a.w / 2) * s), y: Y((a.y + a.h / 2) * s), xScale: (a.w / 2) * s * PT, yScale: (a.h / 2) * s * PT, color: rgb(0.9, 0.9, 0.9) });
  else page.drawRectangle({ x: X(a.x * s), y: Y((a.y + a.h) * s), width: a.w * s * PT, height: a.h * s * PT, color: rgb(0.9, 0.9, 0.9) });
  /* the type, live */
  for (const l of lay.layout.lines) {
    const font = await fontOf(l.family, l.weight);
    const sz = l.size * s * PT, tr = l.tracking * s * PT;
    const width = font.widthOfTextAtSize(l.text, sz) + tr * Math.max(0, [...l.text].length - 1);
    const off = l.anchor === "middle" ? -width / 2 : l.anchor === "end" ? -width : 0;
    const rot = l.rot || 0, rad = (-rot * Math.PI) / 180;
    page.pushOperators(pushGraphicsState(), setCharacterSpacing(tr));
    page.drawText(l.text, { x: X(l.x * s) + off * Math.cos(rad), y: Y(l.y * s) + off * Math.sin(rad), size: sz, font, color: hexRgb(l.colour), ...(rot ? { rotate: degrees(-rot) } : {}) });
    page.pushOperators(popGraphicsState());
  }
  manifest.push({
    case: c, frame: { x: fx, y: fy, w, h },
    art: { kind: a.kind, x: a.x * s, y: a.y * s, w: a.w * s, h: a.h * s },
    lines: lay.layout.lines.map((l) => ({ text: l.text, x: l.x * s, y: l.y * s, pt: l.size * s * PT, family: l.family, weight: l.weight, anchor: l.anchor, rot: l.rot || 0, colour: l.colour })),
  });
}

const pdfPath = path.join(outDir, "7-layout-review.pdf");
fs.writeFileSync(pdfPath, await doc.save({ useObjectStreams: false }));
fs.mkdirSync("data/eval", { recursive: true });
fs.writeFileSync(path.join("data", "eval", "layout-review-manifest.json"), JSON.stringify({ made: new Date().toISOString(), page: { w: pageW / PT, h: pageH / PT }, cases: manifest }, null, 1));
console.log(`→ ${pdfPath}  (${CASES.length} labels, page ${(pageW / PT).toFixed(0)} × ${(pageH / PT).toFixed(0)} mm)`);
