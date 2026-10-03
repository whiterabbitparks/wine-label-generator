/* THE 45 LAYOUTS ON A REAL LABEL (final round, 2026-10-04).

   FAMILIES: his landscape artboard and its tall twin are one design at
   two proportions; a label takes the twin whose proportion is nearer,
   and only the image zone stretches (place.ts). A layout without a twin
   is its own family.

   FACES: the admin's font bank, as on the live site (facesFor: the
   artist's categories, title-only faces, never-all-caps). The wine's name
   in the hero face; every other line in ONE companion family — his bold
   lines in its bold, his regular lines in its regular.

   FIT (owner, 2026-10-03/04): when a line cannot fit at its size even
   after small reductions, a NARROWER approved face is tried for the
   companion first; breaking a line in two is not done. A family is
   OFFERED for a size only when its type fits there without a problem and
   its zone keeps a usable size. */
import { LAYOUTS } from "./layouts.data";
import { place, type Faces, type Placement, type LabelFace } from "./place";
import type { Layout, FieldKey } from "./spec";
import { facesFor, typedCaps, templateFields, type Band } from "../typeset/templates";
import { readBank, roleWeights, noCapsFamilies, type FontCat } from "../typeset/font-bank";
import { measure, loadFace } from "../typeset/fonts";

export const byId = (id: string) => LAYOUTS.find((l) => l.id === id) || null;

export const FAMILIES: Layout[][] = (() => {
  const seen = new Set<string>(), out: Layout[][] = [];
  for (const l of LAYOUTS) {
    if (seen.has(l.id)) continue;
    const t = l.twin ? byId(l.twin) : null;
    const fam = t ? [l, t].sort((a, b) => a.refH / a.refW - b.refH / b.refW) : [l];
    fam.forEach((x) => seen.add(x.id)); out.push(fam);
  }
  return out;
})();
export const familyOf = (id: string) => FAMILIES.find((f) => f.some((l) => l.id === id)) || null;

/* the twin whose proportion is nearer the label's */
export function pickRef(fam: Layout[], W: number, H: number): Layout {
  const r = H / W;
  return fam.reduce((a, b) => (Math.abs(Math.log((b.refH / b.refW) / r)) < Math.abs(Math.log((a.refH / a.refW) / r)) ? b : a));
}

/* the three kinds the wizard's columns are dealt */
export type Kind = "centred" | "sides" | "vertical";
export function kindOf(l: Layout): Kind {
  if (l.texts.some((t) => t.rot)) return "vertical";
  const c = l.texts.filter((t) => t.align === "center").length;
  return c * 2 >= l.texts.length ? "centred" : "sides";
}

/* ---------- faces from the bank ---------- */
const nc = () => noCapsFamilies();
const mark = (f: { family: string; weight: number; italic?: boolean }): LabelFace => (nc().has(f.family) ? { ...f, noCaps: true } : { ...f });
function weightsOf(family: string): { text: number; mid: number; bold: number } | null {
  const b = readBank().fonts[family];
  return b && b.weights.length ? roleWeights(b.weights) : null;
}
/* the companion family set as his roles want it */
export function companion(family: string, text: number, bold: number): Pick<Faces, "title" | "titleBold" | "body"> {
  return { title: mark({ family, weight: text }), titleBold: mark({ family, weight: bold }), body: mark({ family, weight: text }) };
}
export function facesFromBank(seed: number, data: Record<string, string>, cats?: FontCat[] | null): Faces {
  const band: Band = "classical";
  const f = facesFor(band, seed, typedCaps(Object.values(templateFields(data))), cats);
  const w = weightsOf(f.small.family);
  const bold = w ? w.bold : Math.max(f.secondary.weight, f.small.weight);
  return { hero: mark(f.hero), ...companion(f.small.family, f.small.weight, bold) };
}
/* approved companion families narrower than this one — of the SAME
   category, with at least two weights and real lowercase letters (a
   capitals-only face like Bebas Neue is no body face) — narrowest first */
const realText = (family: string, weight: number) => { const f = loadFace({ family, weight }); if (!f) return false; const a = f.charToGlyph("a"), A = f.charToGlyph("A"); return !!a && a.index !== A.index && a.index !== 0; };
export function narrowerCompanions(cats: FontCat[] | null | undefined, than: string): { family: string; text: number; bold: number; width: number }[] {
  const sample = "Premier Grand Cru Classé · Bordeaux, France";
  const bank = readBank().fonts, own = bank[than]?.cat;
  const all = Object.values(bank).filter((f) => f.verdict === "full" && f.weights.length >= 2 && f.cat !== "display" && (!own || f.cat === own) && (!cats?.length || cats.includes(f.cat)));
  const rows = all.map((f) => { const w = roleWeights(f.weights); return { family: f.family, text: w.text, bold: w.bold, width: measure(sample, { family: f.family, weight: w.text }, 100, 0) }; }).filter((r) => realText(r.family, r.text));
  const ref = measure(sample, { family: than, weight: 400 }, 100, 0);
  return rows.filter((r) => r.width < ref * 0.95).sort((a, b) => b.width - a.width);   /* the least narrowing first */
}

/* ---------- the label ---------- */
export interface LabelPlacement extends Placement { faces: Faces; narrowed?: string }
const score = (p: Placement) => p.problems.length * 100 + Object.values(p.reduced).reduce((s, v) => s + (1 - v), 0);

export function layoutLabel(fam: Layout[], fields: Partial<Record<FieldKey, string>>, W: number, H: number, faces: Faces, cats?: FontCat[] | null): LabelPlacement {
  const lay = pickRef(fam, W, H);
  const first = place(lay, fields, W, H, faces);
  const strained = first.problems.length || Object.values(first.reduced).some((v) => v < 0.85);
  if (!strained) return { ...first, faces };
  /* a narrower companion before anything else */
  let best: LabelPlacement = { ...first, faces };
  for (const c of narrowerCompanions(cats, faces.body.family).slice(0, 8)) {
    const f2: Faces = { hero: faces.hero, ...companion(c.family, c.text, c.bold) };
    const p = place(lay, fields, W, H, f2);
    if (score(p) < score(best)) best = { ...p, faces: f2, narrowed: c.family };
    if (!p.problems.length && !Object.values(p.reduced).some((v) => v < 0.85)) break;
  }
  return best;
}

/* is this family offered for this label and these words? */
export function suits(fam: Layout[], fields: Partial<Record<FieldKey, string>>, W: number, H: number, faces: Faces, cats?: FontCat[] | null): boolean {
  const p = layoutLabel(fam, fields, W, H, faces, cats);
  if (p.problems.length) return false;
  const z = p.zone; if (!z) return true;
  const vw = Math.min(W, z.x + z.w) - Math.max(0, z.x), vh = Math.min(H, z.y + z.h) - Math.max(0, z.y);
  return vw >= 25 && vh >= 20;
}
