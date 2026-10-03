/* THE FINAL-ROUND LAYOUT ENGINE (2026-10-03): from a layout family, a
   label size, the wine's texts and the label's faces to a placed layout
   that keeps his rules —
   - FAMILY: a landscape artboard and its tall twin are one design at two
     proportions; the label takes the twin whose proportion is nearer and
     the zone absorbs the rest (place.ts). Singles are their own family.
   - FIT: the type is his, size for size. Only when a line physically
     cannot fit between the 5 mm margins, or two lines collide, is the
     whole block reduced in small steps (2%), spacing scaled along, never
     under 7 pt; what still cannot fit is reported, never hidden.
   - every check is on INK (glyph outlines), not on font boxes. */
import { LAYOUTS } from "./layouts.data";
import { placeLayout, inkBox, MARGIN, MIN_PT, PX_MM, type Faces, type Placed, type PlacedLayout } from "./place";
import type { Layout2, LayoutText, FieldKey } from "./spec";

export type Fields = Partial<Record<FieldKey, string>>;

/* his sample of a joined line, one part per field ("Dry Red Wine /
   Alc.: 13.5% / 750 ml." is two fields: the alcohol line has its own "/") */
export function splitSample(sample: string, n: number): string[] {
  if (n < 2) return [sample];
  const parts = sample.split(" / ");
  return parts.length <= n ? parts : [...parts.slice(0, n - 1), parts.slice(n - 1).join(" / ")];
}

/* the families: [landscape, tall] or [single] */
export const FAMILIES: Layout2[][] = (() => {
  const seen = new Set<string>(), out: Layout2[][] = [];
  for (const l of LAYOUTS) {
    if (seen.has(l.id)) continue;
    const tw = l.twin ? LAYOUTS.find((x) => x.id === l.twin) : null;
    const fam = tw ? [l, tw].sort((a, b) => a.refH / a.refW - b.refH / b.refW) : [l];
    fam.forEach((x) => seen.add(x.id));
    out.push(fam);
  }
  return out;
})();
export const familyOf = (id: string) => FAMILIES.find((f) => f.some((l) => l.id === id)) || null;

/* does this family suit a label of this proportion? A pair covers
   everything from its landscape twin to its tall twin and a little
   beyond; a single only proportions near its own (a tall vertical
   design cannot become a landscape label). */
export function suits(family: Layout2[], widthMm: number, heightMm: number): boolean {
  const r = heightMm / widthMm;
  const rs = family.map((l) => l.refH / l.refW);
  const lo = Math.min(...rs), hi = Math.max(...rs);
  return r >= lo * 0.72 && r <= hi * 1.4;
}

/* the twin whose proportion is nearer this label's */
export function pickLayout(family: Layout2[], widthMm: number, heightMm: number): Layout2 {
  const r = heightMm / widthMm;
  return family.reduce((a, b) => (Math.abs(b.refH / b.refW - r) < Math.abs(a.refH / a.refW - r) ? b : a));
}

export interface FitReport { scale: number /* the strongest reduction of any line (1 = his sizes) */; sizePt: number /* the wine name's size after fitting */; problems: string[]; reduced: string[] }

/* ink boxes of a placed line (an arc: its letters) */
function boxes(l: Placed) {
  if (l.arcLetters) return l.arcLetters.map((g) => { const b = inkBox({ ...l, text: g.ch, x: g.x, y: g.y, anchor: "middle" as const }); return b; });
  if (l.rot) {
    /* a vertical line: its box turned about its origin */
    const b = inkBox({ ...l, rot: 0 });
    const len = b.x1 - b.x0, up = l.y - b.y0, down = b.y1 - l.y;
    return l.rot === -90 ? [{ x0: l.x - up, x1: l.x + down, y0: l.y - len, y1: l.y }] : [{ x0: l.x - down, x1: l.x + up, y0: l.y, y1: l.y + len }];
  }
  return [inkBox(l)];
}

/* how far each line's ink crosses the margins on HIS artboard (his
   baselines sit 5 mm from the trim, so descenders and a vertical year
   already reach 0.3–0.5 mm into the margin — that much is his, allowed;
   anything beyond is a problem) */
function allowanceOf(lay: Layout2, faces: Faces): Map<string, number> {
  const sample: Record<string, string> = {};
  for (const t of lay.texts) { const parts = splitSample(t.sample, t.fields.length); if (parts.length === t.fields.length) t.fields.forEach((k, i) => { sample[k] ||= parts[i]; }); }
  const ref = placeLayout(lay, sample, lay.refW, lay.refH, faces, 1);
  const m = MARGIN * PX_MM, out = new Map<string, number>();
  const group = { top: 0, bottom: 0 };   /* the most any line of the group crosses: a line that moves into the first row's place inherits it */
  for (const l of ref.lines) {
    let worst = 0;
    for (const b of boxes(l)) worst = Math.max(worst, m - b.x0, b.x1 - (ref.W - m), m - b.y0, b.y1 - (ref.H - m));
    out.set(l.key, Math.max(0, worst));
    group[l.src.anchor] = Math.max(group[l.src.anchor], worst);
  }
  for (const l of ref.lines) out.set(l.key, Math.max(out.get(l.key) || 0, group[l.src.anchor]));
  return out;
}

export interface Problem { kind: "margin" | "overlap"; a: Placed; b?: Placed; text: string }
const GAP = 1.2 * PX_MM;   /* the least room between two lines on one row */

export function problemsOf(p: PlacedLayout, allowance: Map<string, number>): Problem[] {
  const out: Problem[] = [];
  const m = MARGIN * PX_MM, eps = 0.15 * PX_MM;
  const all = p.lines.map((l) => ({ l, bs: boxes(l) }));
  for (const { l, bs } of all) {
    const ok = (allowance.get(l.key) || 0) + eps;
    for (const b of bs) {
      if (b.x0 < m - ok || b.x1 > p.W - m + ok || b.y0 < m - ok || b.y1 > p.H - m + ok) { out.push({ kind: "margin", a: l, text: `${l.key} crosses the margin` }); break; }
    }
  }
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    /* side by side on one row (or, for vertical lines, one above the
       other in a column) they need GAP between them along the reading
       direction; otherwise only no ink in common */
    const vert = !!all[i].l.rot && !!all[j].l.rot;
    const hit = all[i].bs.some((a) => all[j].bs.some((b) => {
      const yShare = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.5 * Math.min(a.y1 - a.y0, b.y1 - b.y0);
      const xShare = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.5 * Math.min(a.x1 - a.x0, b.x1 - b.x0);
      const gx = !vert && yShare ? GAP : -eps, gy = vert && xShare ? GAP : -eps;
      return a.x0 < b.x1 + gx && b.x0 < a.x1 + gx && a.y0 < b.y1 + gy && b.y0 < a.y1 + gy;
    }));
    if (hit) out.push({ kind: "overlap", a: all[i].l, b: all[j].l, text: `${all[i].l.key} overlaps ${all[j].l.key}` });
  }
  return out;
}

/* the length of a line in its reading direction, in px */
const lengthOf = (l: Placed) => { const bs = boxes(l); const x0 = Math.min(...bs.map((b) => b.x0)), x1 = Math.max(...bs.map((b) => b.x1)), y0 = Math.min(...bs.map((b) => b.y0)), y1 = Math.max(...bs.map((b) => b.y1)); return l.rot ? y1 - y0 : x1 - x0; };

/* Place his layout; when a line cannot fit, THAT line comes down in 2%
   steps (its anchor edge kept, so a left line still hugs the left and a
   centred one stays centred); when two lines meet, the longer one comes
   down. The rest of the type is untouched. Hierarchy: no line ends up
   larger than the wine's name. Never under 7 pt; what still cannot fit
   is reported, never hidden. */
export function layoutLabel(lay: Layout2, fields: Fields, widthMm: number, heightMm: number, faces: Faces): { placed: PlacedLayout; fit: FitReport } {
  const allowance = allowanceOf(lay, faces);
  const per = new Map<LayoutText, number>();
  const f = fields as Record<string, string>;
  let placed = placeLayout(lay, f, widthMm, heightMm, faces, 1, per);
  let problems = problemsOf(placed, allowance);
  const hero = lay.texts.find((t) => t.fields[0] === "wineName");
  const givenUp = new Set<string>();   /* problems nothing more can be done about */
  for (let step = 0; step < 400; step++) {
    const pr = problems.find((p) => !givenUp.has(p.text));
    if (!pr) break;
    /* the line to reduce: a margin crosser, else the longer of a colliding pair */
    const victim = pr.kind === "margin" ? pr.a : (lengthOf(pr.a) >= lengthOf(pr.b!) ? pr.a : pr.b!);
    const t = victim.src, cur = per.get(t) ?? 1;
    const floor = MIN_PT / t.size;
    if (cur <= floor + 1e-6) {
      /* this one is at 7 pt already: the other of the pair, or give up on this problem */
      const other = pr.kind === "overlap" ? (victim === pr.a ? pr.b! : pr.a) : null;
      if (other && (per.get(other.src) ?? 1) > MIN_PT / other.src.size + 1e-6) per.set(other.src, Math.max(MIN_PT / other.src.size, (per.get(other.src) ?? 1) - 0.02));
      else { givenUp.add(pr.text); continue; }
    } else per.set(t, Math.max(floor, cur - 0.02));
    /* hierarchy: nothing larger than the wine's name */
    if (hero) { const hs = hero.size * (per.get(hero) ?? 1); for (const o of lay.texts) if (o !== hero && o.size * (per.get(o) ?? 1) > hs + 0.01) per.set(o, hs / o.size); }
    placed = placeLayout(lay, f, widthMm, heightMm, faces, 1, per);
    problems = problemsOf(placed, allowance);
  }
  const reduced = [...per.entries()].filter(([, v]) => v < 0.999);
  const scale = reduced.length ? Math.min(...reduced.map(([, v]) => v)) : 1;
  return { placed, fit: { scale, sizePt: +Math.max(MIN_PT, (hero?.size || 0) * (hero ? per.get(hero) ?? 1 : 1)).toFixed(2), problems: problems.map((p) => p.text), reduced: reduced.map(([t, v]) => `${t.fields[0]} ${Math.round(v * 100)}%`) } };
}

/* the whole way: family → twin → fit */
export function layoutFamily(family: Layout2[], fields: Fields, widthMm: number, heightMm: number, faces: Faces) {
  const lay = pickLayout(family, widthMm, heightMm);
  return { lay, ...layoutLabel(lay, fields, widthMm, heightMm, faces) };
}
