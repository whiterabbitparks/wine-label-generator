/* THE LAYOUT VERIFIER (2026-09-22). The owner saw texts laid over each
   other on real labels; the preview at one size with one set of words
   was never going to catch that. This sweeps the whole space — every
   template, several label shapes, several seeds and three levels of
   filled-in detail — and MEASURES every finished layout:

     · no two set lines may overlap;
     · no line may cross the 5 mm margin;
     · nothing under 7 pt or over 20 pt;
     · at most two font families a label (his rule: one, plus the name).

   It calls no image model. Run it after any change to the templates:

     npx tsx tools/check-templates.mts            the whole sweep
     npx tsx tools/check-templates.mts --shots    write the failures out
*/
import fs from "node:fs";
import { layoutFromTemplate, templateFields, facesInUse, MARGIN_MM, PX_PER_MM, MIN_PT, MAX_PT, type Template } from "../src/lib/typeset/templates";
import { TEMPLATES } from "../src/lib/typeset/templates.data";
import { measure, inkExtent, faceFile } from "../src/lib/typeset/fonts";
import type { LaidLine } from "../src/lib/typeset/compose";

const PT_MM = 25.4 / 72;
const SIZES: [number, number][] = [[104, 84], [110, 80], [80, 110], [90, 90], [70, 120], [130, 90]];
const SEEDS = [1, 7, 42, 4242, 90210, 31337];
const FULL = {
  producer: "GRAND VIN", wine: "Château Margaux", appellation: "Margaux AOC",
  classification: "Premier Grand Cru Classé", vintage: "2018", grape: "Cabernet Sauvignon, Merlot",
  region: "Bordeaux", country: "France", special: "Vieilles Vignes",
  sweetness: "Dry", wineColorName: "Red", wineType: "Wine", alcohol: "13.5", volume: "750",
};
const LONG = { ...FULL, wine: "Château Marceau de Beauregard", producer: "DOMAINE DE LA ROMANÉE-CONTI", classification: "Grand Cru Classé en 1855, Premier Cru", grape: "Cabernet Sauvignon, Merlot, Petit Verdot" };
const SPARSE: Record<string, string> = { wine: "Korra", vintage: "2023", sweetness: "Dry", wineColorName: "Amber", wineType: "Wine", alcohol: "12.5", volume: "750" };
const CASES: [string, Record<string, string>][] = [["full", FULL], ["long", LONG], ["sparse", SPARSE]];

/* the ink box of one set line, in label pixels — on the letters' real
   outlines (2026-09-23). Measured on the face's ascender and descender it
   called the owner's OWN artboard a collision: he sets lines closer than
   those boxes, and his letters never touch. */
function boxOf(l: LaidLine) {
  const f = { family: l.family, weight: l.weight };
  const w = measure(l.text, f, l.size, l.size ? l.tracking / l.size : 0);
  const e = inkExtent(l.text, f, l.size);
  /* turned -90 (read upward): the letters' tops face LEFT */
  if (l.rot === -90) return { x: l.x - e.up, y: l.y - w, w: e.up + e.down, h: w };
  if (l.rot) return null;                       /* an arced glyph — measured as a word below */
  const x = l.anchor === "middle" ? l.x - w / 2 : l.anchor === "end" ? l.x - w : l.x;
  return { x, y: l.y - e.up, w, h: e.up + e.down };
}
/* an arced word: the union of its glyphs, each boxed where it stands */
function arcBoxes(lines: LaidLine[]) {
  const out: { box: { x: number; y: number; w: number; h: number }; text: string }[] = [];
  let cur: { x0: number; y0: number; x1: number; y1: number; text: string; size: number } | null = null;
  for (const l of lines) {
    if (!l.rot || l.rot === -90) { cur = null; continue; }
    const f = { family: l.family, weight: l.weight };
    const w = measure(l.text, f, l.size), e = inkExtent(l.text, f, l.size);
    const b = { x0: l.x - w / 2, x1: l.x + w / 2, y0: l.y - e.up, y1: l.y + e.down };
    if (cur && cur.size === l.size && l.x - cur.x1 < l.size) {
      cur.x0 = Math.min(cur.x0, b.x0); cur.x1 = Math.max(cur.x1, b.x1); cur.y0 = Math.min(cur.y0, b.y0); cur.y1 = Math.max(cur.y1, b.y1); cur.text += l.text;
    } else { cur = { ...b, text: l.text, size: l.size }; out.push(cur as never); }
  }
  return (out as unknown as { x0: number; y0: number; x1: number; y1: number; text: string }[]).map((c) => ({ box: { x: c.x0, y: c.y0, w: c.x1 - c.x0, h: c.y1 - c.y0 }, text: c.text }));
}
const hits = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

let runs = 0;
const fails: string[] = [];
const missing = facesInUse().filter((f) => !fs.existsSync(faceFile(f)));
if (missing.length) fails.push(`FONT FILES MISSING: ${missing.map((f) => `${f.family} ${f.weight}`).join(", ")}`);

for (const tpl of TEMPLATES as Template[]) {
  for (const [w, h] of SIZES) {
    for (const seed of SEEDS) {
      for (const [caseName, data] of CASES) {
        runs++;
        const where = `${tpl.id} ${w}x${h} seed${seed} ${caseName}`;
        const { layout } = layoutFromTemplate({
          template: tpl, fields: templateFields(data), widthMm: w, heightMm: h,
          seed, ground: "#F5F1E6", ink: "#1b1b1b", accent: "#8B1A1A",
        });
        const M = MARGIN_MM * PX_PER_MM;
        const named = [
          ...layout.lines.map((l) => ({ box: boxOf(l), text: l.text })).filter((b) => b.box),
          ...arcBoxes(layout.lines),
        ] as { box: { x: number; y: number; w: number; h: number }; text: string }[];
        const boxes = named.map((n) => n.box);
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            if (hits(boxes[i], boxes[j])) {
              fails.push(`OVERLAP  ${where}  "${named[i].text.slice(0, 18)}" over "${named[j].text.slice(0, 18)}"`);
              i = boxes.length; break;
            }
          }
        }
        for (const b of boxes) {
          if (b.x < M - 1 || b.y < M - 1 || b.x + b.w > layout.W - M + 1 || b.y + b.h > layout.H - M + 1) {
            fails.push(`MARGIN   ${where}  a line crosses the 5 mm margin`);
            break;
          }
        }
        for (const l of layout.lines) {
          const pt = l.size / PX_PER_MM / PT_MM;
          if (pt < MIN_PT - 0.1 || pt > MAX_PT + 0.1) { fails.push(`SIZE     ${where}  ${pt.toFixed(1)} pt`); break; }
        }
        /* 2026-09-22: and no line may sit ON the picture — none of his
           templates set type over the artwork, and when the picture was
           allowed to grow into the room freed by missing fields it ran
           straight under the vertical columns */
        const az = layout.art;
        const onOval = (b: { x: number; y: number; w: number; h: number }) => {
          const ex = az.x + az.w / 2, ey = az.y + az.h / 2;
          const nx = Math.max(b.x, Math.min(ex, b.x + b.w)), ny = Math.max(b.y, Math.min(ey, b.y + b.h));
          return ((nx - ex) / (az.w / 2)) ** 2 + ((ny - ey) / (az.h / 2)) ** 2 < 1;
        };
        const isOval = tpl.art?.kind === "oval";
        /* against the picture an arced word counts letter by letter: its
           ends dip BESIDE the oval, and a box round the whole word would
           call that a collision */
        const glyphBoxes = layout.lines.filter((l) => l.rot && l.rot !== -90).map((l) => {
          const f = { family: l.family, weight: l.weight }, w = measure(l.text, f, l.size), e = inkExtent(l.text, f, l.size);
          return { x: l.x - w / 2, y: l.y - e.up, w, h: e.up + e.down };
        });
        const artBoxes = [...layout.lines.map(boxOf).filter(Boolean), ...glyphBoxes] as { x: number; y: number; w: number; h: number }[];
        for (const b of artBoxes) {
          if (isOval ? onOval(b) : hits(b, az)) { fails.push(`ON ART  ${where}  a line sits over the picture`); break; }
        }
        const fams = new Set(layout.lines.map((l) => l.family));
        if (fams.size > 2) fails.push(`FAMILIES ${where}  ${[...fams].join(" + ")}`);
      }
    }
  }
}

const kinds = new Map<string, number>();
for (const f of fails) kinds.set(f.slice(0, 8).trim(), (kinds.get(f.slice(0, 8).trim()) || 0) + 1);
console.log(`${runs} layouts checked`);
for (const f of (process.env.ALL ? fails : fails.slice(0, 40))) console.log("  " + f);
if (!process.env.ALL && fails.length > 40) console.log(`  … and ${fails.length - 40} more`);
console.log(fails.length ? `\nFAIL — ${fails.length} problems (${[...kinds].map(([k, n]) => `${k} ${n}`).join(", ")})` : "\nPASS — no overlaps, no margin crossings, sizes in range, one family plus the name");
process.exit(fails.length ? 1 : 0);
