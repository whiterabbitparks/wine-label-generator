import sharp from "sharp";
import { inkOf, vignetteOf } from "./palette";
import { layoutFromTemplate, templateFields, artKindOf, bleedsOf, MARGIN_MM, PX_PER_MM, type ArtKind, type Band, type Template } from "./templates";
import { templatesNow } from "./overrides";
import type { ComposeOutput } from "./compose";

/* THE TEMPLATE COMPOSER (2026-09-22). Sets a label on one of the owner's
   twelve drawn templates. Output is the same shape the wizard, the PDF
   and the delivery ZIP already take, so nothing downstream changes.

   The picture: the painting arrives as a spot illustration on flat paper
   (cleanPaper made the paper flat, so it joins the label with no edge).
   The template's picture box is the ROOM the drawing gets — the drawing
   is fitted inside it and never cropped, which keeps the standing rule
   that a painting is never cut and never framed. */

export const IVORY = "#F5F1E6";
const px = (mm: number) => mm * PX_PER_MM;

export interface TemplateComposeInput {
  artwork: string;               /* data URL — the painter's picture */
  template?: string;             /* template id; otherwise picked from the band */
  band?: Band;
  data: Record<string, string>;  /* the wizard's field record */
  widthMm: number;
  heightMm: number;
  seed: number;
  wineColour?: string;
  paper?: string;               /* the painting's own paper, from cleanPaper */
  textless?: boolean;           /* the label WITHOUT its type — the layout bench draws the words itself */
  /* the drawing's box inside the file, as fractions — cleanPaper knows it
     exactly, because it grew the paper in from the edge */
  ink?: { x: number; y: number; w: number; h: number };
}

/* HOW MUCH OF THE DRAWING A LAYOUT WOULD PUSH PAST THE TRIM.

   The owner's answer to the one real contradiction (2026-09-22): a
   picture is simply not offered a layout it would have to be dragged
   into. This measures the drag — the share of the drawing's own box that
   would end up outside the label — so the choice is made on a number and
   not on hope. It repeats the placement arithmetic of the composer, in
   label pixels, without touching a pixel of the picture. */
export function inkLost(tpl: Template, box: { x: number; y: number; w: number; h: number }, widthMm: number, heightMm: number, zone: { x: number; y: number; w: number; h: number }): number {
  const W = widthMm * PX_PER_MM, H = heightMm * PX_PER_MM;
  const kind = artKindOf(tpl), bleeds = bleedsOf(tpl);
  /* the file's own pixels cancel out, so work in a unit sheet */
  const aw = 1, ah = box.h > 0 ? 1 : 1;
  const bx = box.x * aw, by = box.y * ah, bw = Math.max(1e-6, box.w * aw), bh = Math.max(1e-6, box.h * ah);
  const sInk = kind === "spot" ? Math.min(zone.w / bw, zone.h / bh) : Math.max(zone.w / bw, zone.h / bh);
  const s = Math.max(sInk, Math.max(W / aw, H / ah));
  const pw = aw * s, ph = ah * s;
  const want = { x: zone.x + (zone.w - bw * s) / 2 - bx * s, y: zone.y + (zone.h - bh * s) / 2 - by * s };
  if (kind !== "spot") {
    if (bleeds.top && !bleeds.bottom) want.y = zone.y + zone.h - bh * s - by * s;
    if (bleeds.bottom && !bleeds.top) want.y = zone.y - by * s;
    if (bleeds.left && !bleeds.right) want.x = zone.x + zone.w - bw * s - bx * s;
    if (bleeds.right && !bleeds.left) want.x = zone.x - bx * s;
  }
  const px2 = { x: Math.max(Math.min(want.x, 0), W - pw), y: Math.max(Math.min(want.y, 0), H - ph) };
  const ix = px2.x + bx * s, iy = px2.y + by * s, iw = bw * s, ih = bh * s;
  const inX = Math.max(0, Math.min(ix + iw, W) - Math.max(ix, 0));
  const inY = Math.max(0, Math.min(iy + ih, H) - Math.max(iy, 0));
  const seen = (inX * inY) / Math.max(1e-6, iw * ih);
  return 1 - seen;
}

export function templatesOf(band: Band): Template[] {
  return templatesNow().filter((t) => t.band === band);
}
export function pickTemplate(band: Band, seed: number, kind?: ArtKind): Template {
  const all = templatesOf(band);
  const pool = kind ? all.filter((t) => artKindOf(t) === kind) : all;
  const use = pool.length ? pool : all;
  return use[seed % use.length] || templatesNow()[0];
}

/* the accent: the painting's own loud colour when it has one, else a red
   that suits the wine (his rule — a loose direction, the artwork decides) */
const WINE_ACCENT: Record<string, string> = {
  red: "#8B1A1A", amber: "#8A5A16", white: "#3F5C2E", rose: "#A8425C", rosé: "#A8425C", orange: "#9A4E14",
};
function accentFor(artAccent: string | null, wineColour?: string): string {
  return readable(artAccent || WINE_ACCENT[(wineColour || "").toLowerCase()] || "#8B1A1A");
}

/* TYPE MUST READ ON THE PAPER (2026-09-22). The ink and the accent are
   taken off the painting, and a high-key painting hands back a colour
   that vanishes on ivory — Levan's yellow did exactly that. Any colour
   is darkened until it stands clear of the paper; the hue is kept, only
   the brightness moves. */
const lumOf = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export function readable(hex: string, on = IVORY, want = 4.5): string {
  const L2 = lumOf(on);
  let [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (let i = 0; i < 24; i++) {
    const ratio = (Math.max(lumOf(`#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`), L2) + 0.05)
      / (Math.min(lumOf(`#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`), L2) + 0.05);
    if (ratio >= want) break;
    r = Math.round(r * 0.88); g = Math.round(g * 0.88); b = Math.round(b * 0.88);
  }
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`;
}

export async function composeTemplateLabel(inp: TemplateComposeInput): Promise<ComposeOutput & { template: string; warnings: string[] }> {
  const band: Band = inp.band || "classical";
  const tpl = inp.template
    ? (templatesNow().find((t) => t.id === inp.template) || pickTemplate(band, inp.seed))
    : pickTemplate(band, inp.seed);

  const vig = await vignetteOf(inp.artwork);
  const inks = await inkOf(inp.artwork);
  /* ONE PAPER (owner, 2026-09-22: "let us take the grounds off… make
     every ground ivory white"). One less variable while the layouts are
     being settled, and a printer's paper does not change per bottle. */
  /* the label's paper IS the painting's paper, flattened to one tone */
  const ground = inp.paper || vig.ground;
  const ink = readable(inks.ink, IVORY, 7);      /* the body text wants more than the accent */
  const accent = accentFor(inks.accent, inp.wineColour);

  const { layout, art, faces, warnings } = layoutFromTemplate({
    template: tpl,
    fields: templateFields(inp.data),
    widthMm: inp.widthMm, heightMm: inp.heightMm,
    seed: inp.seed, ground, ink, accent,
  });

  /* THE PICTURE IS THE LABEL'S GROUND (owner, 2026-09-22, with his
     second diagram). Red is the sheet the painter painted on, grey is
     the ink. The two together are the WHOLE generated file, and the
     label is cut out of it — which means the label's background is not
     a rectangle we draw, it IS the painting's own paper, and no
     millimetre of the label may be left uncovered by it.

     So the placement solves two things at once: the ink lands in the
     room the type left, and the sheet covers the label. When both cannot
     hold at once the ink is pushed too far past the trim, and that
     variation is simply not offered for this picture (his answer to the
     one real contradiction: gpt-image gives three shapes, labels come in
     many). */
  const kind = artKindOf(tpl);
  const bleeds = bleedsOf(tpl);
  const meta = await sharp(Buffer.from(inp.artwork.slice(inp.artwork.indexOf(",") + 1), "base64")).metadata();
  const aw = meta.width || 1, ah = meta.height || 1;
  const box = inp.ink || vig.box;
  const bx = box.x * aw, by = box.y * ah, bw = Math.max(1, box.w * aw), bh = Math.max(1, box.h * ah);

  /* WE BUILD THE SHEET (owner, 2026-09-22, second diagram). He is right
     that the label's ground must be the painting's own paper and not an
     invented colour — so the ground IS the paper, flattened to one tone
     by cleanPaper, and the label is filled with it. The drawing is then
     set on it: inside its room for a spot, filling and running past the
     trim for a picture that bleeds.

     Asking the painter for a sheet with exactly the right margin is a
     lottery; laying his drawing on his own paper is arithmetic. It is
     the same thing his red-and-grey diagram shows, built rather than
     hoped for, which is why one picture serves every layout of its
     shape. */
  const s = kind === "spot"
    ? Math.min(art.w / bw, art.h / bh)
    : (() => {
        const over = Math.max(layout.W, layout.H) * 0.06;
        const needW = art.w + (bleeds.left ? over : 0) + (bleeds.right ? over : 0);
        const needH = art.h + (bleeds.top ? over : 0) + (bleeds.bottom ? over : 0);
        let k = Math.max(needW / bw, needH / bh);
        /* it may only run past its room where it bleeds; on the side that
           faces the type the artist's own edge has to show */
        if (!(bleeds.left || bleeds.right)) k = Math.min(k, art.w / bw);
        if (!(bleeds.top || bleeds.bottom)) k = Math.min(k, art.h / bh);
        return k;
      })();
  const pw = aw * s, ph = ah * s;
  const pxPos = {
    x: art.x + (art.w - bw * s) / 2 - bx * s,
    y: art.y + (art.h - bh * s) / 2 - by * s,
  };
  if (kind !== "spot") {
    if (bleeds.top && !bleeds.bottom) pxPos.y = art.y + art.h - bh * s - by * s;
    if (bleeds.bottom && !bleeds.top) pxPos.y = art.y - by * s;
    if (bleeds.left && !bleeds.right) pxPos.x = art.x + art.w - bw * s - bx * s;
    if (bleeds.right && !bleeds.left) pxPos.x = art.x - bx * s;
  }
  layout.art = { x: pxPos.x + bx * s, y: pxPos.y + by * s, w: bw * s, h: bh * s };
  layout.artCrop = { x: bx, y: by, w: bw, h: bh };

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const texts = layout.lines.map((l) => {
    const t = l.rot ? ` transform="rotate(${l.rot.toFixed(2)} ${l.x.toFixed(1)} ${l.y.toFixed(1)})"` : "";
    return `<text x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}" text-anchor="${l.anchor}" fill="${l.colour}"`
      + ` font-family="${esc(l.family)}" font-weight="${l.weight}" font-size="${l.size.toFixed(1)}"`
      + (l.tracking ? ` letter-spacing="${l.tracking.toFixed(2)}"` : "")
      + `${t}>${esc(l.text)}</text>`;
  }).join("");

  const picture = `<image xlink:href="${inp.artwork}" x="${pxPos.x.toFixed(1)}" y="${pxPos.y.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" preserveAspectRatio="none"/>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${inp.widthMm}mm" height="${inp.heightMm}mm" viewBox="0 0 ${layout.W} ${layout.H}">`
    + `<rect width="${layout.W}" height="${layout.H}" fill="${ground}"/>`
    + picture + (inp.textless ? "" : texts) + `</svg>`;
  const png = await sharp(Buffer.from(svg), { density: 12 * 25.4 }).resize(layout.W, layout.H).png().toBuffer();
  return {
    svg, png: `data:image/png;base64,${png.toString("base64")}`,
    faces, ink, layout, template: tpl.id, warnings,
  };
}

export { MARGIN_MM, PX_PER_MM };
