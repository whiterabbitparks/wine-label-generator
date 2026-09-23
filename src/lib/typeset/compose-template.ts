import sharp from "sharp";
import { inkOf, vignetteOf } from "./palette";
import { layoutFromTemplate, templateFields, artKindOf, bleedsOf, MARGIN_MM, PX_PER_MM, type ArtKind, type Band, type Template } from "./templates";
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
}

export function templatesOf(band: Band): Template[] {
  return (TEMPLATES as Template[]).filter((t) => t.band === band);
}
export function pickTemplate(band: Band, seed: number, kind?: ArtKind): Template {
  const all = templatesOf(band);
  const pool = kind ? all.filter((t) => artKindOf(t) === kind) : all;
  const use = pool.length ? pool : all;
  return use[seed % use.length] || (TEMPLATES as Template[])[0];
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
    ? ((TEMPLATES as Template[]).find((t) => t.id === inp.template) || pickTemplate(band, inp.seed))
    : pickTemplate(band, inp.seed);

  const vig = await vignetteOf(inp.artwork);
  const inks = await inkOf(inp.artwork);
  /* ONE PAPER (owner, 2026-09-22: "let us take the grounds off… make
     every ground ivory white"). One less variable while the layouts are
     being settled, and a printer's paper does not change per bottle. */
  const ground = IVORY;
  const ink = readable(inks.ink, IVORY, 7);      /* the body text wants more than the accent */
  const accent = accentFor(inks.accent, inp.wineColour);

  const { layout, art, faces, warnings } = layoutFromTemplate({
    template: tpl,
    fields: templateFields(inp.data),
    widthMm: inp.widthMm, heightMm: inp.heightMm,
    seed: inp.seed, ground, ink, accent,
  });

  /* THE PAINTING IS PLACED, NEVER CUT (owner, 2026-09-22, with his
     diagram). The dashed rectangle on his sheet is the label's TRIM and
     the pale area around it is bleed, so a picture that bleeds is simply
     drawn LARGER than the label and runs off the edges it should run
     off. The label canvas is the trim, so nothing needs clipping: what
     goes past it is not drawn. The edge that faces the type is the
     ragged one the artist painted, which is why there is no cut and no
     fade to hide one.

     A SPOT stays inside the trim and floats on the paper. */
  const kind = artKindOf(tpl);
  const bleeds = bleedsOf(tpl);
  const meta = await sharp(Buffer.from(inp.artwork.slice(inp.artwork.indexOf(",") + 1), "base64")).metadata();
  const aw = meta.width || 1, ah = meta.height || 1;
  const bx = vig.box.x * aw, by = vig.box.y * ah, bw = vig.box.w * aw, bh = vig.box.h * ah;

  let pw: number, ph: number, pxPos: { x: number; y: number };
  if (kind === "spot") {
    const k = Math.min(art.w / bw, art.h / bh);
    pw = bw * k; ph = bh * k;
    pxPos = { x: art.x + (art.w - pw) / 2, y: art.y + (art.h - ph) / 2 };
  } else {
    /* cover the room the type left, then push past the trim on every
       side this picture bleeds from — 6 % of the label is enough for the
       ragged edge to be outside and the paint to reach the corner */
    const over = Math.max(layout.W, layout.H) * 0.06;
    const needW = art.w + (bleeds.left ? over : 0) + (bleeds.right ? over : 0);
    const needH = art.h + (bleeds.top ? over : 0) + (bleeds.bottom ? over : 0);
    let k = Math.max(needW / bw, needH / bh);
    /* a picture may only run PAST its room on an axis where it bleeds.
       Where it does not bleed — the top and foot of a middle band — the
       edge faces the type, so it must be the artist's own edge, which
       means the picture has to fit. Otherwise it buries the words. */
    if (!(bleeds.left || bleeds.right)) k = Math.min(k, art.w / bw);
    if (!(bleeds.top || bleeds.bottom)) k = Math.min(k, art.h / bh);
    pw = bw * k; ph = bh * k;
    /* flush with the side it bleeds from; centred on an axis that bleeds
       both ways or neither */
    const place = (lo: boolean, hi: boolean, zoneLo: number, zoneLen: number, picLen: number) => {
      if (lo && !hi) return zoneLo + zoneLen - picLen;      /* hangs off the low side  */
      if (hi && !lo) return zoneLo;                          /* hangs off the high side */
      return zoneLo + (zoneLen - picLen) / 2;
    };
    pxPos = {
      x: place(bleeds.left, bleeds.right, art.x, art.w, pw),
      y: place(bleeds.top, bleeds.bottom, art.y, art.h, ph),
    };
  }
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

  const picture =
    `<svg x="${pxPos.x.toFixed(1)}" y="${pxPos.y.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" viewBox="${bx.toFixed(1)} ${by.toFixed(1)} ${bw.toFixed(1)} ${bh.toFixed(1)}" preserveAspectRatio="xMidYMid meet">`
    + `<image xlink:href="${inp.artwork}" x="0" y="0" width="${aw}" height="${ah}"/></svg>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${inp.widthMm}mm" height="${inp.heightMm}mm" viewBox="0 0 ${layout.W} ${layout.H}">`
    + `<rect width="${layout.W}" height="${layout.H}" fill="${ground}"/>`
    + picture + texts + `</svg>`;
  const png = await sharp(Buffer.from(svg), { density: 12 * 25.4 }).resize(layout.W, layout.H).png().toBuffer();
  return {
    svg, png: `data:image/png;base64,${png.toString("base64")}`,
    faces, ink, layout, template: tpl.id, warnings,
  };
}

export { MARGIN_MM, PX_PER_MM };
