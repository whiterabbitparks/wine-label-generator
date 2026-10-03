/* PLACING THE TYPE OF A FINAL-ROUND LAYOUT ON A LABEL OF ANY SIZE
   (2026-10-03). The owner's rules, as he wrote them:
   - the typography is a strict specification: sizes, spacing and holds
     exactly as on his artboard; when the label's proportion changes the
     IMAGE ZONE absorbs it, the type does not move relative to its edge;
   - wider label: centred lines stay centred, lines hugging a side keep
     hugging it, the room between grows;
   - taller label: the top group keeps its distance from the top, the
     bottom group from the bottom, the zone grows between them;
   - text never crosses the 5 mm safe margin, never under 7 pt; if the
     type physically cannot fit, it is reduced in very small steps with
     its spacing scaled along;
   - a missing optional field closes its gap toward the anchored edge —
     whole rows move, paired items on one line keep their pairing. */
import { measure, inkExtent, type Face } from "../typeset/fonts";
import type { Layout2, LayoutText, FieldKey } from "./spec";

export const PX_MM = 12;
const PT_MM = 25.4 / 72;
export const MARGIN = 5;      /* mm, the text safe margin from the trim */
export const MIN_PT = 7;

/* the label's faces: the wine's name (may be a title-only face), the
   title family's bold and regular, the body family's regular */
export interface Faces { hero: Face; bold: Face; title: Face; text: Face }
export interface Placed {
  key: FieldKey; text: string;
  x: number; y: number;          /* label px: anchor point and baseline */
  size: number;                  /* px */
  tracking: number;              /* px */
  face: Face; anchor: "start" | "middle" | "end";
  rot?: number;                  /* degrees, about (x, y) */
  accent: boolean; caps: boolean;
  arcLetters?: { ch: string; x: number; y: number; rot: number }[];   /* an arced word, glyph by glyph */
  src: LayoutText;               /* his line this was set from */
}
export interface PlacedLayout { W: number; H: number; lines: Placed[]; scale: number; zone: { kind: "rect" | "oval"; x: number; y: number; w: number; h: number } | null }

const ptPx = (pt: number) => pt * PT_MM * PX_MM;
const mmPx = (mm: number) => mm * PX_MM;

/* the lines of type for these fields — fields that are empty are left out */
function textOf(t: LayoutText, fields: Record<string, string>): string {
  const parts = t.fields.map((f) => (fields[f] || "").trim()).filter(Boolean);
  if (!parts.length) return "";
  const s = parts.join(t.join || " / ");
  return t.caps ? s.toUpperCase() : s;
}

/* rows: his lines on one baseline (same anchor, baseline within 0.8 mm) */
interface Row { anchor: "top" | "bottom"; d: number; items: LayoutText[] }
function rowsOf(ts: LayoutText[]): Row[] {
  const rows: Row[] = [];
  for (const t of [...ts].sort((a, b) => a.fromTop - b.fromTop)) {
    const d = t.anchor === "top" ? t.fromTop : t.fromBottom;
    const r = rows.find((x) => x.anchor === t.anchor && Math.abs(x.d - d) < 0.8);
    if (r) r.items.push(t); else rows.push({ anchor: t.anchor, d, items: [t] });
  }
  return rows;
}

/* `scale` reduces the whole block (sizes and spacing alike); `perLine`
   reduces single lines that cannot fit on their own (engine.ts), their
   anchor edge kept — nothing ever under 7 pt */
export function placeLayout(lay: Layout2, fields: Record<string, string>, widthMm: number, heightMm: number, faces: Faces, scale = 1, perLine?: Map<LayoutText, number>): PlacedLayout {
  const W = Math.round(widthMm * PX_MM), H = Math.round(heightMm * PX_MM);
  const sizePt = (t: LayoutText) => Math.max(MIN_PT, t.size * scale * (perLine?.get(t) ?? 1));
  const faceOf = (t: LayoutText): Face => {
    const f = t.fields[0] === "wineName" ? faces.hero : t.role === "body" ? faces.text : t.bold ? faces.bold : faces.title;
    return t.italic ? { ...f, italic: true } : f;
  };
  const lines: Placed[] = [];

  /* 1. which lines live (horizontal and vertical apart) */
  const live = lay.texts.filter((t) => textOf(t, fields));
  const horiz = live.filter((t) => !t.rot && !t.arc), arcs = live.filter((t) => t.arc), verts = live.filter((t) => t.rot);

  /* 2. rows close their gaps toward the anchored edge: a missing row
        hands its distance to the rows beyond it (the gap between kept
        rows stays his). The group's INK keeps his distance from the
        edge: when the first row goes, the next row moves up only until
        its ink stands where the first row's ink stood (a 9 pt producer's
        cap line is not a place for an 18 pt name's baseline). */
  const allRows = rowsOf(lay.texts.filter((t) => !t.rot));
  const dist = new Map<LayoutText, number>();   /* the baseline's distance from its edge, after closing */
  const inkToward = (t: LayoutText, text: string, edge: "top" | "bottom") => {
    const e = inkExtent(text, faceOf(t), ptPx(sizePt(t)));
    return (edge === "top" ? e.up : e.down) / PX_MM;   /* mm from the baseline toward that edge */
  };
  for (const anchor of ["top", "bottom"] as const) {
    const rows = allRows.filter((r) => r.anchor === anchor).sort((a, b) => a.d - b.d);
    if (!rows.length) continue;
    /* his group's ink edge: the first row's ink, with his sample words */
    const edge0 = Math.min(...rows[0].items.map((t) => rows[0].d - inkToward(t, t.caps ? t.sample.toUpperCase() : t.sample, anchor)));
    let shift = 0;
    const live: LayoutText[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.items.some((t) => textOf(t, fields))) { const next = rows[i + 1]; if (next) shift += next.d - r.d; continue; }
      for (const t of r.items) { dist.set(t, (r.d - shift) * scale + (scale < 1 ? MARGIN * (1 - scale) : 0)); if (textOf(t, fields)) live.push(t); }
    }
    if (!live.length) continue;
    const edgeNow = Math.min(...live.map((t) => dist.get(t)! - inkToward(t, textOf(t, fields), anchor)));
    const want = edge0 * scale + (scale < 1 ? MARGIN * (1 - scale) : 0);
    if (edgeNow < want - 0.05) for (const t of dist.keys()) if (lay.texts.find((x) => x === t)!.anchor === anchor && !t.rot) dist.set(t, dist.get(t)! + (want - edgeNow));
  }
  /* (rows are scaled toward the edge: at scale < 1 the whole block
      shrinks about its anchored margin — spacing scales with the type) */

  const put = (t: LayoutText) => {
    const text = textOf(t, fields);
    const face = faceOf(t);
    const size = ptPx(sizePt(t));
    const tracking = t.tracking * size;
    const d = dist.get(t) ?? (t.anchor === "top" ? t.fromTop : t.fromBottom) * scale;
    const y = t.anchor === "top" ? mmPx(d) : H - mmPx(d);
    let x: number, anchor: Placed["anchor"];
    if (t.align === "center") { x = W / 2; anchor = "middle"; }
    else if (t.align === "right") { x = W - mmPx(Math.max(MARGIN, t.right)); anchor = "end"; }
    else { x = mmPx(Math.max(MARGIN, t.left)); anchor = "start"; }
    return { key: t.fields[0], text, x, y, size, tracking, face, anchor, accent: t.accent, caps: t.caps, src: t };
  };
  for (const t of horiz) lines.push(put(t));

  /* 3. arced words: his circle, moved with its anchor. His letter-spacing
        is read off his sample (the extractor sees each letter as its own
        run): the sweep his sample fills minus its glyph widths, spread
        between the letters; the real word takes the same spacing, so its
        sweep follows its length */
  for (const t of arcs) {
    const a = t.arc!, text = textOf(t, fields), face = faceOf(t);
    const size = ptPx(sizePt(t)), r = mmPx(a.r) * scale;
    const cx = t.align === "center" ? W / 2 : mmPx(a.cx);
    const d = (t.anchor === "top" ? a.cyFromTop : lay.refH - a.cyFromTop) * scale;
    const cy = t.anchor === "top" ? mmPx(d) : H - mmPx(d);
    const sample = t.caps ? t.sample.toUpperCase() : t.sample;
    const refSize = ptPx(t.size);   /* his spacing, read at his size, then scaled with the line */
    const gapPx = sample.length > 1 ? Math.max(0, (mmPx(a.r) * a.sweep * Math.PI / 180 - measure(sample, face, refSize, 0)) / ([...sample].length - 1)) * (size / refSize) : 0;
    const widths = [...text].map((ch) => measure(ch, face, size, 0));
    const total = widths.reduce((s, w) => s + w, 0) + gapPx * Math.max(0, widths.length - 1);
    const sweep = Math.min(170, (total / r) * 180 / Math.PI);
    const letters: Placed["arcLetters"] = [];
    let acc = 0;
    for (let i = 0; i < widths.length; i++) {
      const mid = acc + widths[i] / 2; acc += widths[i] + gapPx;
      /* up: the word reads over the top of the circle (SVG angles: -90 is
         straight up, 90 straight down); each letter leans with its tangent */
      const ang = (a.up ? -90 : 90) + (a.up ? 1 : -1) * ((mid / total) - 0.5) * sweep;
      const rad = ang * Math.PI / 180;
      letters.push({ ch: text[i], x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad), rot: a.up ? ang + 90 : 90 - ang });
    }
    lines.push({ key: t.fields[0], text, x: cx, y: cy, size, tracking: 0, face, anchor: "middle", accent: t.accent, caps: t.caps, arcLetters: letters, src: t });
  }

  /* 4. vertical lines: a column held by the side it is nearer (its
        baseline's x from that side — the glyphs stand to the LEFT of a
        line reading upward), its length held by the edge its start is
        nearer */
  for (const t of verts) {
    const text = textOf(t, fields), face = faceOf(t);
    const size = ptPx(sizePt(t));
    const nearLeft = t.left < lay.refW / 2;
    const x = nearLeft ? mmPx(t.left) : W - mmPx(lay.refW - t.left);
    /* rot 90 reads upward — its origin is its lower end */
    const y = t.anchor === "bottom" ? H - mmPx((t.vStart ?? t.fromBottom) * scale) : mmPx((t.vEndFromTop ?? t.fromTop) * scale) + measure(text, face, size, t.tracking);
    lines.push({ key: t.fields[0], text, x, y, size, tracking: t.tracking * size, face, anchor: "start", rot: t.rot === 90 ? -90 : 90, accent: t.accent, caps: t.caps, src: t });
  }

  const z = lay.zone;
  const zone = z ? zoneFor(lay, W, H) : null;
  return { W, H, lines, scale, zone };
}

/* THE IMAGE ZONE on this label: what the type leaves. A RECT keeps his
   distances — the sides that bleed bleed, the inset sides keep their
   inset, the sides facing type keep his gap to the type — so it absorbs
   the whole change of proportion (his L01→L02). An OVAL is never
   distorted: it grows or shrinks UNIFORMLY (his L07→L08 is the same oval
   2.2× larger) to fit the room between the type groups, centred there,
   and stays whole inside the trim unless his own oval already bled. */
export function zoneFor(lay: Layout2, W: number, H: number) {
  const z = lay.zone!;
  const refW = lay.refW, refH = lay.refH;
  const x0 = z.bleeds.left ? -2 * PX_MM : mmPx(z.x);
  const x1 = z.bleeds.right ? W + 2 * PX_MM : W - mmPx(refW - (z.x + z.w));
  const y0 = z.bleeds.top ? -2 * PX_MM : mmPx(z.y);
  const y1 = z.bleeds.bottom ? H + 2 * PX_MM : H - mmPx(refH - (z.y + z.h));
  if (z.kind === "rect") return { kind: z.kind, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  /* the oval: his aspect, as large as the free box allows */
  const boxW = x1 - x0, boxH = y1 - y0;
  const k = Math.min(boxW / mmPx(z.w), boxH / mmPx(z.h));
  const w = mmPx(z.w) * k, h = mmPx(z.h) * k;
  return { kind: z.kind, x: x0 + (boxW - w) / 2, y: y0 + (boxH - h) / 2, w, h };
}

/* a line's ink box, for overlap and margin checks */
export function inkBox(l: Placed) {
  const w = measure(l.text, l.face, l.size, l.size ? l.tracking / l.size : 0);
  const e = inkExtent(l.text, l.face, l.size);
  const x0 = l.anchor === "start" ? l.x : l.anchor === "middle" ? l.x - w / 2 : l.x - w;
  return { x0, x1: x0 + w, y0: l.y - e.up, y1: l.y + e.down };
}
