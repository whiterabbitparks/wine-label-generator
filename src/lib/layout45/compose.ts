/* ONE LABEL: his layout's type, the painting in its zone, the ground the
   painting was painted on (final round, 2026-10-04).

   THE PICTURE. The painting is one panel on its sheet; cleanPaper found
   the sheet and flattened it to ONE colour — that colour is the label's
   ground, all through the bleed, so the panel's own edges (the painter's)
   simply meet the ground they were painted on: nothing is masked, cut or
   faded, and nothing looks cut out.
   Its INK is fitted into the zone, centred, as large as the zone allows:
   the grey zone is the most it may take, never a mask. Where the zone runs
   off the label, the ink is taken a little past the trim on that side
   (at most a few per cent of it, so nothing that matters is lost). A
   panel whose shape does not fit the zone is REFUSED, never squeezed —
   the painter paints for the zone (paint.ts). */
import sharp from "sharp";
import { place, PX, type Faces, type Placement } from "./place";
import { typeSvg } from "./render";
import type { Layout, FieldKey } from "./spec";
import { rasterLabel } from "../typeset/raster";
import type { Layout as StoreLayout, LaidLine } from "../typeset/compose";
import type { Inks } from "./colour";

export const SHAPE_TOL = 1.3;   /* panel shape ÷ zone shape within 1/1.3 … 1.3 */
const OVERRUN = 0.03;           /* past a bleeding side: 3 % of the ink beyond the bleed line */

export interface Ink { x: number; y: number; w: number; h: number }   /* fractions of the file */
export interface Picture { x: number; y: number; w: number; h: number; ink: { x0: number; y0: number; x1: number; y1: number } }   /* mm on the label */

/* the part of the zone that can be printed (the label and its 2 mm bleed) */
export function visibleZone(p: Placement) {
  const z = p.zone; if (!z) return null;
  const x0 = Math.max(-2, z.x), y0 = Math.max(-2, z.y), x1 = Math.min(p.W + 2, z.x + z.w), y1 = Math.min(p.H + 2, z.y + z.h);
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, aspect: (x1 - x0) / (y1 - y0) };
}
export const shapeFits = (panel: number, zone: number) => panel / zone <= SHAPE_TOL && zone / panel <= SHAPE_TOL;

export function fitPicture(p: Placement, ink: Ink, aw: number, ah: number): Picture | null {
  const v = visibleZone(p), b = p.lay.zone?.bleeds;
  if (!v || !b) return null;
  /* the target: the zone, taken a little past the bleed line on a side that bleeds */
  const ex = v.w * OVERRUN, ey = v.h * OVERRUN;
  const T = { x0: v.x0 - (b.left ? ex : 0), x1: v.x1 + (b.right ? ex : 0), y0: v.y0 - (b.top ? ey : 0), y1: v.y1 + (b.bottom ? ey : 0) };
  const iw = ink.w * aw, ih = ink.h * ah, kx = (T.x1 - T.x0) / iw, ky = (T.y1 - T.y0) / ih;
  /* an axis bleeding on BOTH sides wants to be filled; an axis with type
     on one side (or both) is a wall the ink never passes */
  const bothX = b.left && b.right, bothY = b.top && b.bottom;
  const walls = [!bothX ? kx : Infinity, !bothY ? ky : Infinity], fills = [bothX ? kx : 0, bothY ? ky : 0];
  const kWall = Math.min(...walls), kFill = Math.max(...fills);
  const k = kFill ? Math.min(kWall, kFill) : Math.min(kx, ky);
  const w = iw * k, h = ih * k;
  /* centred in the target; a one-sided bleed holds the ink to that side */
  let x0 = (T.x0 + T.x1) / 2 - w / 2, y0 = (T.y0 + T.y1) / 2 - h / 2;
  if (b.left && !b.right) x0 = T.x0; else if (b.right && !b.left) x0 = T.x1 - w;
  if (b.top && !b.bottom) y0 = T.y0; else if (b.bottom && !b.top) y0 = T.y1 - h;
  return { x: x0 - ink.x * aw * k, y: y0 - ink.y * ah * k, w: aw * k, h: ah * k, ink: { x0, y0, x1: x0 + w, y1: y0 + h } };
}

/* the store's Layout (what the PDF, the admin editor and re-layouts read) */
export function storeLayout(p: Placement, pic: Picture | null, ground: string, inks: Inks, aw: number, ah: number): StoreLayout {
  const lines: LaidLine[] = [];
  for (const l of p.lines) {
    const colour = l.line.fields[0] === "wineName" ? inks.accent : inks.text;
    const base = { size: l.size * PX, family: l.face.family, weight: l.face.weight, italic: !!l.face.italic, colour, key: l.key };
    if (l.glyphs) for (const g of l.glyphs) lines.push({ ...base, text: g.ch, x: g.x * PX, y: g.y * PX, tracking: 0, anchor: "middle", rot: g.rot });
    else lines.push({ ...base, text: l.text, x: l.x * PX, y: l.y * PX, tracking: l.tracking * PX, anchor: l.anchor, ...(l.rot ? { rot: l.rot } : {}) });
  }
  const art = pic ? { x: pic.x * PX, y: pic.y * PX, w: pic.w * PX, h: pic.h * PX } : { x: 0, y: 0, w: 0, h: 0 };
  return { W: Math.round(p.W * PX), H: Math.round(p.H * PX), ground, art, artCrop: { x: 0, y: 0, w: aw, h: ah }, lines };
}

export interface Composed { svg: string; png: string; layout: StoreLayout; placement: Placement; picture: Picture | null }
export async function composeLabel(a: { lay: Layout; fields: Partial<Record<FieldKey, string>>; widthMm: number; heightMm: number; faces: Faces; art: string; ink: Ink; ground: string; inks: Inks; placement?: Placement }): Promise<Composed> {
  const p = a.placement || place(a.lay, a.fields, a.widthMm, a.heightMm, a.faces);
  const m = await sharp(Buffer.from(a.art.slice(a.art.indexOf(",") + 1), "base64")).metadata();
  const aw = m.width || 1024, ah = m.height || 1024;
  const pic = fitPicture(p, a.ink, aw, ah);
  const W = Math.round(p.W * PX), H = Math.round(p.H * PX), n = (v: number) => (v * PX).toFixed(1);
  const img = pic ? `<image xlink:href="${a.art}" x="${n(pic.x)}" y="${n(pic.y)}" width="${n(pic.w)}" height="${n(pic.h)}" preserveAspectRatio="none"/>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${p.W}mm" height="${p.H}mm" viewBox="0 0 ${W} ${H}">`
    + `<rect x="${-2 * PX}" y="${-2 * PX}" width="${W + 4 * PX}" height="${H + 4 * PX}" fill="${a.ground}"/>` + img + typeSvg(p, a.inks) + `</svg>`;
  const png = await rasterLabel(svg, W, H);
  return { svg, png: `data:image/png;base64,${png.toString("base64")}`, layout: storeLayout(p, pic, a.ground, a.inks, aw, ah), placement: p, picture: pic };
}
