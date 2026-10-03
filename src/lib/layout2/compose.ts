/* THE FINAL-ROUND COMPOSER (2026-10-03): his layout, the wine's texts,
   the label's faces, the painting — one label.

   - the TYPE is set by engine.ts (his sizes and places; reduced only
     where it cannot fit);
   - the PAINTING is one panel with the painter's own edge on a plain
     sheet (the panel method). Its SHEET is recoloured to the label's
     ground (cleanPaper grows the paper in from the sheet's edge and
     stops at the drawing — the drawing itself is never touched), so the
     picture lies on the ground with no rectangle, no multiply, no fade;
   - the panel is placed by its INK in the zone: a rect zone by fitArt
     (bleeding sides run off a little, the painter's edge stays whole
     toward the type, 2 mm from every line), an oval or inset zone by
     fitSpot (the owner likes how the small centred pictures sit — kept).
     The grey zone is a guide: the ink lands in it, the edge is the
     painting's own — never a mask, never a cut. */
import sharp from "sharp";
import { layoutLabel, type Fields, type FitReport } from "./engine";
import { type Faces, type Placed, type PlacedLayout, PX_MM } from "./place";
import { textSvg, type Inks } from "./render";
import type { Layout2 } from "./spec";
import { fitArt, fitSpot } from "../typeset/compose-template";
import { cleanPaper } from "../typeset/palette";
import { rasterLabel } from "../typeset/raster";

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
export interface ComposeResult {
  svg: string; png: string;
  art: string;              /* the painting on the label's ground — stored for re-layouts */
  placed: PlacedLayout; fit: FitReport;
  picture: { x: number; y: number; w: number; h: number; by: "fitArt" | "fitSpot" | "centred" } | null;
  warnings: string[];
}

/* the type as fitArt / fitSpot read it (an arced word letter by letter) */
function linesFor(p: PlacedLayout) {
  const out: { text: string; x: number; y: number; size: number; tracking: number; family: string; weight: number; italic: boolean; anchor: "start" | "middle" | "end"; rot?: number }[] = [];
  for (const l of p.lines) {
    const base = { size: l.size, family: l.face.family, weight: l.face.weight, italic: !!l.face.italic };
    if (l.arcLetters) for (const g of l.arcLetters) out.push({ ...base, text: g.ch, x: g.x, y: g.y, tracking: 0, anchor: "middle", rot: g.rot });
    else out.push({ ...base, text: l.text, x: l.x, y: l.y, tracking: l.tracking, anchor: l.anchor, rot: l.rot });
  }
  return out;
}

export async function composeLayout2(inp: ComposeInput): Promise<ComposeResult> {
  const warnings: string[] = [];
  const { placed, fit } = layoutLabel(inp.lay, inp.fields, inp.widthMm, inp.heightMm, inp.faces);
  if (fit.problems.length) warnings.push(...fit.problems);
  const W = placed.W, H = placed.H;

  /* the sheet becomes the ground */
  let art = inp.artwork;
  if (!inp.sheetDone) {
    const c = await cleanPaper(inp.artwork, inp.ground);
    if (!c.cleaned) { const l = await cleanPaper(inp.artwork, inp.ground, undefined, { lenient: true }); if (l.cleaned) art = l.art; else warnings.push("no plain sheet found round the painting — laid in as painted"); }
    else art = c.art;
  }
  const meta = await sharp(Buffer.from(art.slice(art.indexOf(",") + 1), "base64")).metadata();
  const aw = meta.width || 1024, ah = meta.height || 1024;

  /* the picture in the zone */
  let picture: ComposeResult["picture"] = null;
  const z = placed.zone, zs = inp.lay.zone;
  if (z && zs) {
    const lines = linesFor(placed);
    const room = { x: Math.max(0, z.x), y: Math.max(0, z.y), w: Math.min(W, z.x + z.w) - Math.max(0, z.x), h: Math.min(H, z.y + z.h) - Math.max(0, z.y) };
    const bleedsAny = zs.bleeds.left || zs.bleeds.right || zs.bleeds.top || zs.bleeds.bottom;
    if (zs.kind === "rect" && bleedsAny) {
      const hit = await fitArt(art, inp.ground, { W, H, lines }, room, aw, ah, zs.bleeds);
      if (hit) picture = { x: hit.x, y: hit.y, w: aw * hit.s, h: ah * hit.s, by: "fitArt" };
    } else {
      /* a floating picture: at least large enough to fill ~70 % of the zone's shorter side by its ink */
      const sMin = Math.min(room.w / aw, room.h / ah) * 0.7;
      const hit = await fitSpot(art, inp.ground, { W, H, lines }, room, aw, ah, sMin);
      if (hit) picture = { x: hit.x, y: hit.y, w: aw * hit.s, h: ah * hit.s, by: "fitSpot" };
    }
    if (!picture) {
      /* fallback: the whole sheet fitted inside the zone, centred */
      const s = Math.min(room.w / aw, room.h / ah);
      picture = { x: room.x + (room.w - aw * s) / 2, y: room.y + (room.h - ah * s) / 2, w: aw * s, h: ah * s, by: "centred" };
      warnings.push("the picture could not be fitted by its ink — centred in the zone");
    }
  }

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const image = picture ? `<image xlink:href="${art}" x="${picture.x.toFixed(1)}" y="${picture.y.toFixed(1)}" width="${picture.w.toFixed(1)}" height="${picture.h.toFixed(1)}" preserveAspectRatio="none"/>` : "";
  const texts = inp.textless ? "" : placed.lines.map((l: Placed) => textSvg(l, inp.inks)).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${inp.widthMm}mm" height="${inp.heightMm}mm" viewBox="0 0 ${W} ${H}">`
    + `<rect width="${W}" height="${H}" fill="${esc(inp.ground)}"/>` + image + texts + `</svg>`;
  const png = await rasterLabel(svg, W, H);
  return { svg, png: `data:image/png;base64,${png.toString("base64")}`, art, placed, fit, picture, warnings };
}

export { PX_MM };
