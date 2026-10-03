/* PLACING THE TYPE OF ONE OF HIS 45 LAYOUTS ON A LABEL OF ANY SIZE
   (final round, 2026-10-04). His rules, one by one:

   1. HIS ARTBOARD IS THE SPEC. Every line keeps his size, his weight and
      his distance from the edge that holds it ("anchor": the edge whose
      distance his tall twin keeps). Font height and spacing are fixed;
      widths differ from font to font and that is fine — a left line
      starts at his left distance, a right line ends at his right
      distance, a centred line is centred (owner, 2026-10-04).
   2. THE IMAGE ZONE ABSORBS THE SIZE. A taller or wider label moves
      nothing but the zone's edges: each edge keeps his gap to the type
      beside it (or his distance to the label edge), bleeding edges bleed.
   3. A MISSING FIELD CLOSES TOWARD ITS EDGE. Rows (his lines on one
      baseline) move as whole rows: the row beyond a missing one keeps the
      AIR it had to its neighbour (ink to ink), measured now against the
      next surviving row. Items within a row never move, so a left/right
      pair stays a pair. Vertical columns close the same way toward the
      side they hug.
   4. NOTHING CROSSES THE 5 mm MARGIN, NOTHING UNDER 7 pt, NOTHING TOUCHES.
      A line that cannot fit is reduced in 2 % steps (with the air around
      its row scaled along), never below 7 pt; what still does not fit is
      REPORTED — never hidden, never broken into two lines. */
import { measure, inkExtent, type Face } from "../typeset/fonts";
import { softenCaps } from "../typeset/templates";
import type { Layout, Line, FieldKey } from "./spec";

export const PX = 12;                 /* px per mm in the label raster */
const PT = 25.4 / 72;                 /* mm per pt */
export const MARGIN = 5;              /* mm */
export const MIN_PT = 7;
const ASC = 0.72, DESC = 0.22;        /* nominal ink above / below the baseline, of the size */

export type LabelFace = Face & { noCaps?: boolean };
/* the label's faces: the wine's name; his Times lines (regular, bold); his Garamond lines */
export interface Faces { hero: LabelFace; title: LabelFace; titleBold: LabelFace; body: LabelFace }

export interface Glyph { ch: string; x: number; y: number; rot: number }
export interface Placed {
  line: Line; key: string; text: string; face: LabelFace;
  size: number;                       /* mm (font size) */
  x: number; y: number;               /* mm: anchor point on the baseline */
  anchor: "start" | "middle" | "end"; rot: number /* degrees, SVG */;
  tracking: number;                   /* mm between letters */
  glyphs?: Glyph[];                   /* an arc, letter by letter */
  box: { x0: number; y0: number; x1: number; y1: number };   /* ink box, mm */
}
export interface Placement {
  lay: Layout; W: number; H: number; lines: Placed[];
  zone: { kind: "rect" | "oval"; x: number; y: number; w: number; h: number } | null;
  reduced: Record<string, number>;    /* field key → scale < 1 */
  problems: string[];
}

/* ---------- texts ---------- */
export function textFor(l: Line, fields: Partial<Record<FieldKey, string>>, face: LabelFace): string {
  const parts = l.fields.map((f) => (fields[f] || "").trim()).filter(Boolean);
  if (!parts.length) return "";
  const s = parts.join(" / ");
  if (face.noCaps) return softenCaps(s);
  return l.caps ? s.toUpperCase() : s;
}
const faceOf = (l: Line, f: Faces): LabelFace => {
  const base = l.fields[0] === "wineName" ? f.hero : l.role === "body" ? f.body : l.bold ? f.titleBold : f.title;
  return l.italic && l.fields[0] !== "wineName" ? { ...base, italic: true } : base;
};
const widthMm = (text: string, face: Face, sizeMm: number, trackEm: number) => measure(text, face, sizeMm * PX, trackEm) / PX;
const extent = (text: string, face: Face, sizeMm: number) => { const e = inkExtent(text, face, sizeMm * PX); return { up: e.up / PX, down: e.down / PX }; };

/* ---------- rows ---------- */
interface Row { anchor: "top" | "bottom"; d: number; items: Line[] }
function rowsOf(lines: Line[]): Row[] {
  const rows: Row[] = [];
  for (const l of lines.filter((x) => !x.rot).sort((a, b) => (a.anchor === "top" ? a.fromTop! - b.fromTop! : a.fromBottom! - b.fromBottom!))) {
    const d = l.anchor === "top" ? l.fromTop! : l.fromBottom!;
    const r = rows.find((x) => x.anchor === l.anchor && Math.abs(x.d - d) < 0.8);
    if (r) r.items.push(l); else rows.push({ anchor: l.anchor, d, items: [l] });
  }
  return rows;
}
interface Col { side: "left" | "right"; d: number; items: Line[] }   /* d: baseline from the side it hugs */
function colsOf(lay: Layout): Col[] {
  const cols: Col[] = [];
  for (const l of lay.texts.filter((x) => x.rot)) {
    const d = l.side === "right" ? lay.refW - l.colX! : l.colX!;
    const c = cols.find((x) => x.side === l.side && Math.abs(x.d - d) < 0.8);
    if (c) c.items.push(l); else cols.push({ side: l.side!, d, items: [l] });
  }
  return cols.sort((a, b) => a.d - b.d);
}

/* the new distance of every row's (column's) baseline from its edge.
   `near`/`far`: a row's ink toward / away from its edge, in mm, at his
   size (orig) and at its size now (now). */
function close<T extends { d: number }>(rows: T[], live: (r: T) => boolean, near: (r: T, now: boolean) => number, far: (r: T, now: boolean) => number, scale: (r: T) => number): Map<T, number> {
  const out = new Map<T, number>();
  const sorted = [...rows].sort((a, b) => a.d - b.d);
  let prev: { r: T; d: number } | null = null;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (!live(r)) continue;
    let d: number;
    if (!prev) {
      /* the first surviving row: its ink stands where the group's first ink stood */
      const first = sorted[0];
      d = i === 0 ? r.d : first.d - near(first, false) + near(r, true);
    } else {
      /* the air it had to its own inner neighbour, kept (scaled with its size) */
      const inner = sorted[i - 1];
      const air = (r.d - near(r, false)) - (inner.d + far(inner, false));
      d = prev.d + far(prev.r, true) + air * Math.min(1, scale(r)) + near(r, true);
    }
    out.set(r, d); prev = { r, d };
  }
  return out;
}

/* ---------- the zone on this label ---------- */
function zoneOn(lay: Layout, W: number, H: number, lines: Placed[], hisPl: Placed[]) {
  const z = lay.zone; if (!z) return null;
  const rw = lay.refW, rh = lay.refH;
  const his = { top: z.y, bottom: rh - (z.y + z.h), left: z.x, right: rw - (z.x + z.w) };
  /* the type beyond each zone edge, in his drawing (real ink, his words) */
  const beyondHis = (side: "top" | "bottom" | "left" | "right") => hisPl.filter((p) => {
    const b = p.box;
    if (side === "top") return !p.line.rot && b.y1 <= z.y + z.h / 2 && p.line.anchor === "top";
    if (side === "bottom") return !p.line.rot && b.y0 >= z.y + z.h / 2 && p.line.anchor === "bottom";
    if (side === "left") return !!p.line.rot && b.x1 <= z.x + z.w / 2;
    return !!p.line.rot && b.x0 >= z.x + z.w / 2;
  });
  const gapOf = (side: "top" | "bottom" | "left" | "right") => {
    const b = beyondHis(side); if (!b.length) return null;
    if (side === "top") return z.y - Math.max(...b.map((p) => p.box.y1));
    if (side === "bottom") return Math.min(...b.map((p) => p.box.y0)) - (z.y + z.h);
    if (side === "left") return z.x - Math.max(...b.map((p) => p.box.x1));
    return Math.min(...b.map((p) => p.box.x0)) - (z.x + z.w);
  };
  /* the same lines on this label */
  const beyond = (side: "top" | "bottom" | "left" | "right") => { const keys = new Set(beyondHis(side).map((p) => p.key)); return lines.filter((p) => keys.has(p.key)); };
  const edge = (side: "top" | "bottom" | "left" | "right") => {
    /* a side that runs off the label keeps HIS overhang (a rect to the bleed line, A21's oval far past it) */
    if (z.bleeds[side]) return side === "top" ? his.top : side === "left" ? his.left : side === "bottom" ? H - his.bottom : W - his.right;
    const b = beyond(side), g = gapOf(side);
    if (!b.length || g === null) return side === "top" ? his.top : side === "left" ? his.left : side === "bottom" ? H - his.bottom : W - his.right;
    /* the type's ink NOW, plus his gap */
    if (side === "top") return Math.max(...b.map((p) => p.box.y1)) + g;
    if (side === "bottom") return Math.min(...b.map((p) => p.box.y0)) - g;
    if (side === "left") return Math.max(...b.map((p) => p.box.x1)) + g;
    return Math.min(...b.map((p) => p.box.x0)) - g;
  };
  const x0 = edge("left"), x1 = edge("right"), y0 = edge("top"), y1 = edge("bottom");
  return { kind: z.kind, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/* ---------- one pass at given scales ---------- */
function pass(lay: Layout, fields: Partial<Record<FieldKey, string>>, W: number, H: number, faces: Faces, scale: Map<Line, number>): Placed[] {
  const sz = (l: Line) => Math.max(MIN_PT, l.size * (scale.get(l) ?? 1)) * PT;   /* mm */
  const txt = (l: Line) => textFor(l, fields, faceOf(l, faces));
  const out: Placed[] = [];

  /* flat rows */
  const rows = rowsOf(lay.texts);
  for (const anchor of ["top", "bottom"] as const) {
    const rs = rows.filter((r) => r.anchor === anchor);
    const rowSz = (r: Row, now: boolean) => Math.max(...r.items.map((l) => (now ? sz(l) : l.size * PT)));
    /* toward its edge a top row shows its capitals, a bottom row its descenders */
    const near = (r: Row, now: boolean) => rowSz(r, now) * (anchor === "top" ? ASC : DESC);
    const far = (r: Row, now: boolean) => rowSz(r, now) * (anchor === "top" ? DESC : ASC);
    const sc = (r: Row) => Math.min(...r.items.map((l) => scale.get(l) ?? 1));
    const ds = close(rs, (r) => r.items.some((l) => txt(l)), near, far, sc);
    for (const [r, d] of ds) for (const l of r.items) {
      const text = txt(l); if (!text) continue;
      const face = faceOf(l, faces), size = sz(l), tr = l.tracking * size;
      /* his baseline offset inside the row is kept (the vintage sits 0.2 mm off its row) */
      const own = (anchor === "top" ? l.fromTop! : l.fromBottom!) - r.d;
      const base = d + own;
      const y = anchor === "top" ? base : H - base;
      if (l.arc) { out.push(arcLine(l, text, face, size, W, H, y - (anchor === "top" ? l.fromTop! : H - l.fromBottom!), lay)); continue; }
      const w = widthMm(text, face, size, l.tracking);
      let x: number, a: Placed["anchor"];
      if (l.align === "center") { x = W / 2; a = "middle"; }
      else if (l.align === "right") { x = W - l.right!; a = "end"; }
      else { x = l.left!; a = "start"; }
      const x0 = a === "start" ? x : a === "middle" ? x - w / 2 : x - w;
      const e = extent(text, face, size);
      out.push({ line: l, key: l.fields.join("+"), text, face, size, x, y, anchor: a, rot: 0, tracking: tr, box: { x0, x1: x0 + w, y0: y - e.up, y1: y + e.down } });
    }
  }

  /* vertical columns */
  const cols = colsOf(lay);
  for (const side of ["left", "right"] as const) {
    const cs = cols.filter((c) => c.side === side);
    const colSz = (c: Col, now: boolean) => Math.max(...c.items.map((l) => (now ? sz(l) : l.size * PT)));
    /* a line reading upward has its capitals to its LEFT: toward the right
       side it shows its descenders, toward the left its capitals */
    const near = (c: Col, now: boolean) => colSz(c, now) * (side === "right" ? DESC : ASC);
    const far = (c: Col, now: boolean) => colSz(c, now) * (side === "right" ? ASC : DESC);
    const sc = (c: Col) => Math.min(...c.items.map((l) => scale.get(l) ?? 1));
    const ds = close(cs, (c) => c.items.some((l) => txt(l)), near, far, sc);
    for (const [c, d] of ds) for (const l of c.items) {
      const text = txt(l); if (!text) continue;
      const face = faceOf(l, faces), size = sz(l);
      const own = (side === "right" ? lay.refW - l.colX! : l.colX!) - c.d;
      const x = side === "right" ? W - (d + own) : d + own;
      const len = widthMm(text, face, size, l.tracking);
      /* along its length: from his lower end, or hanging from his upper end */
      const yStart = l.anchor === "bottom" ? H - l.start! : l.end! + len;
      const e = extent(text, face, size);
      out.push({ line: l, key: l.fields.join("+"), text, face, size, x, y: yStart, anchor: "start", rot: -90, tracking: l.tracking * size, box: { x0: x - e.up, x1: x + e.down, y0: yStart - len, y1: yStart } });
    }
  }
  return out;
}

/* an arced word: his circle (moved with its row), his letter-spacing */
function arcLine(l: Line, text: string, face: LabelFace, size: number, W: number, H: number, dy: number, lay: Layout): Placed {
  const a = l.arc!;
  const cx = l.align === "center" ? W / 2 : a.cx;
  const cy = (l.anchor === "top" ? a.cyFromTop : H - (lay.refH - a.cyFromTop)) + dy;
  const r = a.r * (size / (l.size * PT));   /* a smaller word sits on a proportionally smaller circle */
  /* his spacing between letters, read off his sample at his size */
  const sample = l.caps ? l.sample.toUpperCase() : l.sample;
  const hisSize = l.size * PT;
  const gap = Math.max(0, (a.r * a.sweep * Math.PI / 180 - widthMm(sample, face, hisSize, 0)) / Math.max(1, [...sample].length - 1)) * (size / hisSize);
  const ws = [...text].map((ch) => widthMm(ch, face, size, 0));
  const total = ws.reduce((s, w) => s + w, 0) + gap * Math.max(0, ws.length - 1);
  const glyphs: Glyph[] = [];
  let acc = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const e = extent(text, face, size);
  for (let i = 0; i < ws.length; i++) {
    const mid = acc + ws[i] / 2; acc += ws[i] + gap;
    const phi = ((mid - total / 2) / r) * (a.up ? 1 : -1);   /* radians from the top (or bottom) of the circle */
    const gx = cx + r * Math.sin(phi), gy = a.up ? cy - r * Math.cos(phi) : cy + r * Math.cos(phi);
    const rot = (a.up ? phi : -phi) * 180 / Math.PI;
    glyphs.push({ ch: [...text][i], x: gx, y: gy, rot });
    const reach = Math.max(ws[i], e.up);
    x0 = Math.min(x0, gx - reach); x1 = Math.max(x1, gx + reach); y0 = Math.min(y0, gy - e.up); y1 = Math.max(y1, gy + e.down);
  }
  return { line: l, key: l.fields.join("+"), text, face, size, x: cx, y: a.up ? cy - r : cy + r, anchor: "middle", rot: 0, tracking: 0, glyphs, box: { x0, x1, y0, y1 } };
}

/* ---------- problems ---------- */
const AIR = 1.5;   /* mm: the least air between two lines side by side on one row */
function problemsOf(lines: Placed[], W: number, H: number, his: Map<string, number>): { text: string; line: Placed; other?: Placed }[] {
  const out: { text: string; line: Placed; other?: Placed }[] = [];
  for (const p of lines) {
    const tol = (his.get(p.key) ?? 0) + 0.15;
    const b = p.box;
    if (b.x0 < MARGIN - tol || b.x1 > W - MARGIN + tol || b.y0 < MARGIN - tol || b.y1 > H - MARGIN + tol) out.push({ text: `${p.key} crosses the 5 mm margin`, line: p });
  }
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const a = lines[i].box, b = lines[j].box;
    const sameRow = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.5 * Math.min(a.y1 - a.y0, b.y1 - b.y0);
    const g = sameRow && !lines[i].rot && !lines[j].rot ? AIR : 0;
    if (a.x0 < b.x1 + g && b.x0 < a.x1 + g && a.y0 < b.y1 - 0.05 && b.y0 < a.y1 - 0.05) out.push({ text: `${lines[i].key} touches ${lines[j].key}`, line: lines[i], other: lines[j] });
  }
  return out;
}
/* how far his own ink crosses the margin on his artboard with his words —
   his baselines sit on the 5 mm line, so descenders already reach a little
   into it; that much is his, not a fault */
function hisLines(lay: Layout, faces: Faces): Placed[] {
  const f: Partial<Record<FieldKey, string>> = {};
  for (const l of lay.texts) { const parts = l.fields.length > 1 ? l.sample.split(/\s+\/\s+(?=[A-Z])/) : [l.sample]; l.fields.forEach((k, i) => { f[k] ??= parts.length === l.fields.length ? parts[i] : l.sample; }); }
  /* alcVol's own slash: rejoin the tail */
  for (const l of lay.texts) if (l.fields.length > 1) { const parts = l.sample.split(" / "); if (parts.length > l.fields.length) f[l.fields[l.fields.length - 1]] = parts.slice(l.fields.length - 1).join(" / "); }
  return pass(lay, f, lay.refW, lay.refH, faces, new Map());
}
function crossings(lay: Layout, his: Placed[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of his) { const b = p.box; out.set(p.key, Math.max(0, MARGIN - b.x0, b.x1 - (lay.refW - MARGIN), MARGIN - b.y0, b.y1 - (lay.refH - MARGIN))); }
  return out;
}

/* ---------- the whole placement ---------- */
export function place(lay: Layout, fields: Partial<Record<FieldKey, string>>, W: number, H: number, faces: Faces): Placement {
  const scale = new Map<Line, number>();
  const hisPl = hisLines(lay, faces), his = crossings(lay, hisPl);
  let lines = pass(lay, fields, W, H, faces, scale);
  let probs = problemsOf(lines, W, H, his);
  const stuck = new Set<string>();
  for (let step = 0; step < 300; step++) {
    const p = probs.find((x) => !stuck.has(x.text));
    if (!p) break;
    /* the line to reduce: the margin crosser, or the longer of the two */
    const len = (q: Placed) => (q.box.x1 - q.box.x0) + (q.box.y1 - q.box.y0);
    let victim = p.other && len(p.other) > len(p.line) ? p.other : p.line;
    const floor = (q: Placed) => MIN_PT / q.line.size;
    if ((scale.get(victim.line) ?? 1) <= floor(victim) + 1e-6) {
      const o = p.other && victim === p.line ? p.other : p.other ? p.line : null;
      if (o && (scale.get(o.line) ?? 1) > floor(o) + 1e-6) victim = o; else { stuck.add(p.text); continue; }
    }
    scale.set(victim.line, Math.max(floor(victim), (scale.get(victim.line) ?? 1) - 0.02));
    lines = pass(lay, fields, W, H, faces, scale);
    probs = problemsOf(lines, W, H, his);
  }
  const reduced: Record<string, number> = {};
  for (const [l, s] of scale) if (s < 0.999) reduced[l.fields.join("+")] = +s.toFixed(2);
  return { lay, W, H, lines, zone: zoneOn(lay, W, H, lines, hisPl), reduced, problems: probs.map((p) => p.text) };
}
