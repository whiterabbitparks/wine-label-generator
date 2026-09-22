import sharp from "sharp";
import { inkOf, vignetteOf } from "./palette";
import { layoutFromTemplate, templateFields, MARGIN_MM, PX_PER_MM, type Band, type Template } from "./templates";
import { TEMPLATES } from "./templates.data";
import type { ComposeOutput } from "./compose";

/* THE TEMPLATE COMPOSER (2026-09-22). Sets a label on one of the owner's
   twelve drawn templates. Output is the same shape the wizard, the PDF
   and the delivery ZIP already take, so nothing downstream changes.

   The picture: the painting arrives as a spot illustration on flat paper
   (cleanPaper made the paper flat, so it joins the label with no edge).
   The template's picture box is the ROOM the drawing gets — the drawing
   is fitted inside it and never cropped, which keeps the standing rule
   that a painting is never cut and never framed. */

export interface TemplateComposeInput {
  artwork: string;               /* data URL — the painter's picture */
  template?: string;             /* template id; otherwise picked from the band */
  band?: Band;
  data: Record<string, string>;  /* the wizard's field record */
  widthMm: number;
  heightMm: number;
  seed: number;
  wineColour?: string;
}

export function templatesOf(band: Band): Template[] {
  return (TEMPLATES as Template[]).filter((t) => t.band === band);
}
export function pickTemplate(band: Band, seed: number): Template {
  const pool = templatesOf(band);
  return pool[seed % pool.length] || (TEMPLATES as Template[])[0];
}

/* the accent: the painting's own loud colour when it has one, else a red
   that suits the wine (his rule — a loose direction, the artwork decides) */
const WINE_ACCENT: Record<string, string> = {
  red: "#8B1A1A", amber: "#8A5A16", white: "#3F5C2E", rose: "#A8425C", rosé: "#A8425C", orange: "#9A4E14",
};
function accentFor(artAccent: string | null, wineColour?: string): string {
  if (artAccent) return artAccent;
  return WINE_ACCENT[(wineColour || "").toLowerCase()] || "#8B1A1A";
}

export async function composeTemplateLabel(inp: TemplateComposeInput): Promise<ComposeOutput & { template: string; warnings: string[] }> {
  const band: Band = inp.band || "classical";
  const tpl = inp.template
    ? ((TEMPLATES as Template[]).find((t) => t.id === inp.template) || pickTemplate(band, inp.seed))
    : pickTemplate(band, inp.seed);

  const vig = await vignetteOf(inp.artwork);
  const inks = await inkOf(inp.artwork);
  const ground = vig.ground;
  const ink = inks.ink;
  const accent = accentFor(inks.accent, inp.wineColour);

  const { layout, art, faces, warnings } = layoutFromTemplate({
    template: tpl,
    fields: templateFields(inp.data),
    widthMm: inp.widthMm, heightMm: inp.heightMm,
    seed: inp.seed, ground, ink, accent,
  });

  /* the drawing, trimmed off its paper, fitted into the template's room.
     An oval box is the room's SHAPE, not a cookie cutter — the drawing is
     never clipped (standing rule: a painting is never cut). */
  const meta = await sharp(Buffer.from(inp.artwork.slice(inp.artwork.indexOf(",") + 1), "base64")).metadata();
  const aw = meta.width || 1, ah = meta.height || 1;
  const bx = vig.box.x * aw, by = vig.box.y * ah, bw = vig.box.w * aw, bh = vig.box.h * ah;
  const fillK = art.kind === "oval" ? 0.98 : 0.9;
  const k = Math.min((art.w * fillK) / bw, (art.h * fillK) / bh);
  const pw = bw * k, ph = bh * k;
  const pxPos = { x: art.x + (art.w - pw) / 2, y: art.y + (art.h - ph) / 2 };
  layout.art = { x: pxPos.x, y: pxPos.y, w: pw, h: ph };
  layout.artCrop = { x: bx, y: by, w: bw, h: bh };

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const texts = layout.lines.map((l) => {
    const t = l.rot ? ` transform="rotate(${l.rot.toFixed(2)} ${l.x.toFixed(1)} ${l.y.toFixed(1)})"` : "";
    return `<text x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}" text-anchor="${l.anchor}" fill="${l.colour}"`
      + ` font-family="${esc(l.family)}" font-weight="${l.weight}" font-size="${l.size.toFixed(1)}"`
      + (l.tracking ? ` letter-spacing="${l.tracking.toFixed(2)}"` : "")
      + `${t}>${esc(l.text)}</text>`;
  }).join("");

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${inp.widthMm}mm" height="${inp.heightMm}mm" viewBox="0 0 ${layout.W} ${layout.H}">`
    + `<rect width="${layout.W}" height="${layout.H}" fill="${ground}"/>`
    + `<svg x="${pxPos.x.toFixed(1)}" y="${pxPos.y.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" viewBox="${bx.toFixed(1)} ${by.toFixed(1)} ${bw.toFixed(1)} ${bh.toFixed(1)}" preserveAspectRatio="xMidYMid meet">`
    + `<image xlink:href="${inp.artwork}" x="0" y="0" width="${aw}" height="${ah}"/></svg>`
    + texts + `</svg>`;

  const png = await sharp(Buffer.from(svg), { density: 12 * 25.4 }).resize(layout.W, layout.H).png().toBuffer();
  return {
    svg, png: `data:image/png;base64,${png.toString("base64")}`,
    faces, ink, layout, template: tpl.id, warnings,
  };
}

export { MARGIN_MM, PX_PER_MM };
