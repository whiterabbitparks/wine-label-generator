/* THE FINAL-ROUND COMPOSER (2026-10-03; rules tightened 2026-10-04 after
   the owner's two screenshots): his layout, the wine's texts, the
   label's faces, the painting — one label.

   - the TYPE is set by engine.ts (his sizes and places; reduced only
     where a line cannot fit; never broken);
   - the PAINTING is one panel with the painter's own edge on a plain
     sheet (the panel method). Its SHEET is recoloured to the label's
     ground (cleanPaper grows the paper in from the sheet's edge and stops
     at the drawing — the drawing itself is never touched): no rectangle,
     no multiply, no fade;
   - THE PANEL MUST HAVE THE ZONE'S SHAPE. Its ink box is measured against
     the zone: a panel more than 1.4× wider or taller than the zone wants
     is REFUSED (SHAPE_MISMATCH) — never shrunk into a corner, never slid
     aside (the owner, 2026-10-04: a wide panel re-set into a tall zone
     came out as a small horizontal picture; a square one in a band was
     pushed to the right to gain size). A painting is painted for one
     zone and may be laid only into zones of that proportion.
   - the panel is placed by fitInZone: CENTRED in the zone, as large as
     the zone allows — on a side where the zone bleeds the panel's edge
     may run a little past the trim (at most 6 % of the panel), elsewhere
     it stays inside; position is never traded for size. The grey zone is
     a guide: the ink lands in it, the edge is the painting's own. */
import sharp from "sharp";
import { layoutLabel, type Fields, type FitReport } from "./engine";
import { type Faces, type Placed, type PlacedLayout, PX_MM, inkBox } from "./place";
import { textSvg, type Inks } from "./render";
import type { Layout2 } from "./spec";
import { cleanPaper } from "../typeset/palette";
import { rasterLabel } from "../typeset/raster";

export const SHAPE_TOLERANCE = 1.4;   /* panel aspect ÷ zone aspect must lie within 1/1.4 … 1.4 */
const RUN_OFF = 0.06;                 /* a bleeding edge may lose at most this much of the panel */
const GAP = 2 * PX_MM;                /* the least room between the panel's ink and any line of type */

export interface ComposeInput {
  lay: Layout2;
  fields: Fields;
  widthMm: number;
  heightMm: number;
  faces: Faces;
  artwork: string;          /* data URL — the painting on its sheet */
  ground: string;           /* the label's ground (ground.ts) */
  inks: Inks;               /* text / accent colours (ground.ts) */
  /* the painting's sheet was already recoloured to `ground` (a re-layout
     of a stored picture) — skip the recolouring */
  sheetDone?: boolean;
  textless?: boolean;
}
export interface Picture { x: number; y: number; w: number; h: number; ink: { x0: number; y0: number; x1: number; y1: number }; scale: number }
export interface ComposeResult {
  svg: string; png: string;
  art: string;              /* the painting on the label's ground — stored for re-layouts */
  placed: PlacedLayout; fit: FitReport;
  picture: Picture | null;
  panelAspect: number;      /* the painting's ink box, width ÷ height */
  zoneAspect: number;
  warnings: string[];
}

export class ShapeMismatch extends Error {
  constructor(public panelAspect: number, public zoneAspect: number, public lay: string) {
    super(`SHAPE_MISMATCH: the painting's panel is ${panelAspect.toFixed(2)} wide for its height, ${lay}'s zone wants ${zoneAspect.toFixed(2)} (ratio ${(panelAspect / zoneAspect).toFixed(2)}, allowed ${(1 / SHAPE_TOLERANCE).toFixed(2)}–${SHAPE_TOLERANCE})`);
  }
}

/* the zone's own proportion on this label, clipped to the trim */
export function zoneAspectOf(placed: PlacedLayout): number | null {
  const z = placed.zone; if (!z) return null;
  const x0 = Math.max(0, z.x), y0 = Math.max(0, z.y), x1 = Math.min(placed.W, z.x + z.w), y1 = Math.min(placed.H, z.y + z.h);
  return Math.max(0.05, x1 - x0) / Math.max(0.05, y1 - y0);
}
export const shapeFits = (panelAspect: number, zoneAspect: number) => { const r = panelAspect / zoneAspect; return r >= 1 / SHAPE_TOLERANCE && r <= SHAPE_TOLERANCE; };

/* THE PANEL IN THE ZONE, centred. `ink` = the panel's ink box as
   fractions of the file; the picture is the whole file, scaled so the
   ink box fills the zone: on an axis where the zone bleeds on BOTH sides
   the ink may run past both trims by up to RUN_OFF each; on one bleeding
   side the ink's edge runs to the bleed line (trim + 2 mm) and the other
   edge stays inside the zone; with no bleed the ink stays inside the
   zone. The smaller of the two axes' scales wins; the ink box is centred
   on the zone (a one-sided bleed pulls it to that edge). */
export function fitInZone(zone: { x: number; y: number; w: number; h: number }, bleeds: { left: boolean; right: boolean; top: boolean; bottom: boolean }, W: number, H: number, aw: number, ah: number, ink: { x: number; y: number; w: number; h: number }): Picture {
  const bleedPx = 2 * PX_MM;
  const inkW = ink.w * aw, inkH = ink.h * ah;
  /* the room along each axis: the zone, clipped to the bleed line */
  const zx0 = Math.max(-bleedPx, zone.x), zx1 = Math.min(W + bleedPx, zone.x + zone.w);
  const zy0 = Math.max(-bleedPx, zone.y), zy1 = Math.min(H + bleedPx, zone.y + zone.h);
  const roomX = (zx1 - zx0) * (bleeds.left && bleeds.right ? 1 + 2 * RUN_OFF : 1);
  const roomY = (zy1 - zy0) * (bleeds.top && bleeds.bottom ? 1 + 2 * RUN_OFF : 1);
  const s = Math.min(roomX / inkW, roomY / inkH);
  const w = inkW * s, h = inkH * s;
  /* centred; a one-sided bleed takes the ink's edge to the bleed line */
  let ix0 = (zx0 + zx1) / 2 - w / 2, iy0 = (zy0 + zy1) / 2 - h / 2;
  if (bleeds.left && !bleeds.right) ix0 = zx0; else if (bleeds.right && !bleeds.left) ix0 = zx1 - w;
  if (bleeds.top && !bleeds.bottom) iy0 = zy0; else if (bleeds.bottom && !bleeds.top) iy0 = zy1 - h;
  const x = ix0 - ink.x * aw * s, y = iy0 - ink.y * ah * s;
  return { x, y, w: aw * s, h: ah * s, ink: { x0: ix0, y0: iy0, x1: ix0 + w, y1: iy0 + h }, scale: s };
}

export async function composeLayout2(inp: ComposeInput): Promise<ComposeResult> {
  const warnings: string[] = [];
  const { placed, fit } = layoutLabel(inp.lay, inp.fields, inp.widthMm, inp.heightMm, inp.faces);
  if (fit.problems.length) warnings.push(...fit.problems);
  const W = placed.W, H = placed.H;

  /* the sheet becomes the ground; the ink box is measured either way */
  let art = inp.artwork;
  let c = await cleanPaper(inp.artwork, inp.sheetDone ? undefined : inp.ground);
  if (!c.cleaned) c = await cleanPaper(inp.artwork, inp.sheetDone ? undefined : inp.ground, undefined, { lenient: true });
  if (!c.cleaned) throw new Error("NO_SHEET: no plain sheet found round the painting — it cannot be laid on a ground");
  if (!inp.sheetDone) art = c.art;
  const meta = await sharp(Buffer.from(art.slice(art.indexOf(",") + 1), "base64")).metadata();
  const aw = meta.width || 1024, ah = meta.height || 1024;
  const panelAspect = (c.ink.w * aw) / Math.max(1, c.ink.h * ah);

  /* the picture in the zone — or a refusal */
  let picture: Picture | null = null;
  const z = placed.zone, zs = inp.lay.zone;
  const zoneAspect = zoneAspectOf(placed) ?? 1;
  if (z && zs) {
    if (!shapeFits(panelAspect, zoneAspect)) throw new ShapeMismatch(panelAspect, zoneAspect, inp.lay.id);
    let pic = fitInZone(z, zs.bleeds, W, H, aw, ah, c.ink);
    /* the ink keeps GAP from every line of type: smaller only if it must, centre kept */
    const boxes = placed.lines.flatMap((l) => l.arcLetters ? l.arcLetters.map((g) => inkBox({ ...l, text: g.ch, x: g.x, y: g.y, anchor: "middle" as const })) : [inkBox(l)]);
    const hits = (p: Picture) => boxes.some((b) => p.ink.x0 < b.x1 + GAP && b.x0 - GAP < p.ink.x1 && p.ink.y0 < b.y1 + GAP && b.y0 - GAP < p.ink.y1);
    let k = 1;
    while (hits(pic) && k > 0.6) {
      k -= 0.02;
      const cx = (pic.ink.x0 + pic.ink.x1) / 2, cy = (pic.ink.y0 + pic.ink.y1) / 2;
      const s = pic.scale * (k / (k + 0.02)), w = c.ink.w * aw * s, h = c.ink.h * ah * s;
      pic = { x: cx - w / 2 - c.ink.x * aw * s, y: cy - h / 2 - c.ink.y * ah * s, w: aw * s, h: ah * s, ink: { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 }, scale: s };
    }
    if (hits(pic)) warnings.push("the picture cannot keep 2 mm from the type in this zone");
    if (k < 1) warnings.push(`the picture was reduced to ${Math.round(k * 100)}% to keep 2 mm from the type`);
    picture = pic;
  }

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const image = picture ? `<image xlink:href="${art}" x="${picture.x.toFixed(1)}" y="${picture.y.toFixed(1)}" width="${picture.w.toFixed(1)}" height="${picture.h.toFixed(1)}" preserveAspectRatio="none"/>` : "";
  const texts = inp.textless ? "" : placed.lines.map((l: Placed) => textSvg(l, inp.inks)).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${inp.widthMm}mm" height="${inp.heightMm}mm" viewBox="0 0 ${W} ${H}">`
    + `<rect width="${W}" height="${H}" fill="${esc(inp.ground)}"/>` + image + texts + `</svg>`;
  const png = await rasterLabel(svg, W, H);
  return { svg, png: `data:image/png;base64,${png.toString("base64")}`, art, placed, fit, picture, panelAspect, zoneAspect, warnings };
}

export { PX_MM };
