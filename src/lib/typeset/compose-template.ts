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
  /* 2026-09-23: a band/panel picture that ends in the painter's own edge
     on this side (and was cleaned there) — that edge is laid on the
     type's boundary instead of a straight cut */
  edge?: "top" | "bottom" | "left" | "right";
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
function accentFor(artAccent: string | null, wineColour: string | undefined, on: string, ink: string): string {
  const a = readable(artAccent || WINE_ACCENT[(wineColour || "").toLowerCase()] || "#8B1A1A", on);
  /* an accent that only reads by turning into the ink is no accent: the
     name is set in the ink instead */
  return ratioOf(a, on) >= 4.5 && ratioOf(a, ink) >= 1.6 ? a : ink;
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
const hexOf = (c: number[]) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
const ratioOf = (a: string, b: string) => { const x = lumOf(a), y = lumOf(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/* 2026-09-23 (owner's ten site labels: the names on Levan's blue paper
   were blue on blue). This measured against IVORY while the label's
   ground had become the painter's paper — so it is measured against the
   REAL ground now, and a colour that cannot stand clear by darkening (a
   mid or dark ground) is lightened instead. Hue kept, brightness moved;
   if neither way gets there, the plainest ink that does. */
export function readable(hex: string, on = IVORY, want = 4.5): string {
  const c0 = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const walk = (f: (c: number[]) => number[]) => {
    let c = c0;
    for (let i = 0; i < 32; i++) { if (ratioOf(hexOf(c), on) >= want) return hexOf(c); c = f(c); }
    return ratioOf(hexOf(c), on) >= want ? hexOf(c) : null;
  };
  const darker = walk((c) => c.map((v) => v * 0.88));
  const lighter = walk((c) => c.map((v) => v + (255 - v) * 0.14));
  const onDark = lumOf(on) < 0.18;
  return (onDark ? lighter || darker : darker || lighter) || (ratioOf("#111111", on) >= ratioOf("#FAFAF7", on) ? "#111111" : "#FAFAF7");
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
  const ink = readable(inks.ink, ground, 7);     /* the body text wants more than the accent */
  const accent = accentFor(inks.accent, inp.wineColour, ground, ink);

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
  /* 2026-09-23 (owner: "Levan's label showed only the legs of the man on
     the chair — more than half the picture lay outside the label").
     A picture that BLEEDS used to be pinned by the edge that faces the
     type (its bottom, under a top band) and every millimetre it was too
     tall went off the label on the other side — so a 3:2 painting in a
     2.8:1 band lost its top half, faces and all. That rule served one
     picture laid into several layouts; there is one label per picture
     now. So the WINDOW is fixed — the band, run past the trim on its
     bleeding sides — the picture covers it, and WHICH part of the picture
     shows is chosen by where the picture's detail is (figures, faces,
     edges; a flat wall or floor carries none). The side that faces the
     type is a straight cut, as his artboards draw the band. */
  let s: number, pxPos: { x: number; y: number };
  let clip: { x: number; y: number; w: number; h: number } | null = null;
  if (kind === "spot") {
    s = Math.min(art.w / bw, art.h / bh);
    pxPos = { x: art.x + (art.w - bw * s) / 2 - bx * s, y: art.y + (art.h - bh * s) / 2 - by * s };
    layout.art = { x: pxPos.x + bx * s, y: pxPos.y + by * s, w: bw * s, h: bh * s };
    layout.artCrop = { x: bx, y: by, w: bw, h: bh };
  } else {
    const over = Math.max(layout.W, layout.H) * 0.06;
    const win = {
      x0: bleeds.left ? Math.min(art.x, 0) - over : art.x,
      y0: bleeds.top ? Math.min(art.y, 0) - over : art.y,
      x1: bleeds.right ? Math.max(art.x + art.w, layout.W) + over : art.x + art.w,
      y1: bleeds.bottom ? Math.max(art.y + art.h, layout.H) + over : art.y + art.h,
    };
    const ww = win.x1 - win.x0, wh = win.y1 - win.y0;
    s = Math.max(ww / bw, wh / bh);
    /* the part of the ink box the window shows, in picture pixels, and
       where it sits: the strip with the most detail, a touch of pull to
       the middle so a tie does not hug an edge. The window's VISIBLE part
       (inside the trim) is what is weighed. */
    const srcW = ww / s, srcH = wh / s;
    const detail = await detailProfile(inp.artwork);
    const visTop = (Math.max(win.y0, 0) - win.y0) / s, visH = (Math.min(win.y1, layout.H) - Math.max(win.y0, 0)) / s;
    const visLeft = (Math.max(win.x0, 0) - win.x0) / s, visW = (Math.min(win.x1, layout.W) - Math.max(win.x0, 0)) / s;
    const offY = bestWindow(detail.rows, ah, by, bh, srcH, visTop, visH);
    const offX = bestWindow(detail.cols, aw, bx, bw, srcW, visLeft, visW);
    pxPos = { x: win.x0 - (bx + offX) * s, y: win.y0 - (by + offY) * s };
    if (inp.edge) {
      /* the painter's own edge sits ON the type's boundary; beyond it the
         plain ground, cleaned to the label's ground, simply runs on */
      if (inp.edge === "bottom") pxPos.y = win.y1 - (by + bh) * s;
      if (inp.edge === "top") pxPos.y = win.y0 - by * s;
      if (inp.edge === "right") pxPos.x = win.x1 - (bx + bw) * s;
      if (inp.edge === "left") pxPos.x = win.x0 - bx * s;
      /* what is drawn: the picture inside the trim plus its bleed */
      const B = { x0: -over, y0: -over, x1: layout.W + over, y1: layout.H + over };
      const d = { x0: Math.max(B.x0, pxPos.x), y0: Math.max(B.y0, pxPos.y), x1: Math.min(B.x1, pxPos.x + aw * s), y1: Math.min(B.y1, pxPos.y + ah * s) };
      layout.art = { x: d.x0, y: d.y0, w: d.x1 - d.x0, h: d.y1 - d.y0 };
      layout.artCrop = { x: (d.x0 - pxPos.x) / s, y: (d.y0 - pxPos.y) / s, w: (d.x1 - d.x0) / s, h: (d.y1 - d.y0) / s };
    } else {
      layout.art = { x: win.x0, y: win.y0, w: ww, h: wh };
      layout.artCrop = { x: bx + offX, y: by + offY, w: srcW, h: srcH };
      clip = layout.art;
    }
  }
  const pw = aw * s, ph = ah * s;

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const texts = layout.lines.map((l) => {
    const t = l.rot ? ` transform="rotate(${l.rot.toFixed(2)} ${l.x.toFixed(1)} ${l.y.toFixed(1)})"` : "";
    return `<text x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}" text-anchor="${l.anchor}" fill="${l.colour}"`
      + ` font-family="${esc(l.family)}" font-weight="${l.weight}" font-size="${l.size.toFixed(1)}"`
      + (l.tracking ? ` letter-spacing="${l.tracking.toFixed(2)}"` : "")
      + `${t}>${esc(l.text)}</text>`;
  }).join("");

  const image = `<image xlink:href="${inp.artwork}" x="${pxPos.x.toFixed(1)}" y="${pxPos.y.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" preserveAspectRatio="none"/>`;
  /* a bleeding picture is cut to its window (the straight edge facing the type) */
  const picture = clip
    ? `<clipPath id="artwin"><rect x="${clip.x.toFixed(1)}" y="${clip.y.toFixed(1)}" width="${clip.w.toFixed(1)}" height="${clip.h.toFixed(1)}"/></clipPath><g clip-path="url(#artwin)">${image}</g>`
    : image;
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


/* WHERE A PICTURE'S DETAIL IS (2026-09-23): gradient energy per row and
   per column of a small copy — figures, faces and drawn edges carry it, a
   flat painted wall or floor does not. Indexed 0..1 along each axis. */
async function detailProfile(dataUrl: string): Promise<{ rows: number[]; cols: number[] }> {
  const N = 160;
  const { data, info } = await sharp(Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"))
    .resize(N, N, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const c = info.channels;
  const rows = new Array(N).fill(0), cols = new Array(N).fill(0);
  for (let y = 1; y < N; y++) for (let x = 1; x < N; x++) {
    let g = 0;
    for (let k = 0; k < 3; k++) {
      const v = data[(y * N + x) * c + k];
      g += Math.abs(v - data[(y * N + x - 1) * c + k]) + Math.abs(v - data[((y - 1) * N + x) * c + k]);
    }
    rows[y] += g; cols[x] += g;
  }
  return { rows, cols };
}

/* the offset (picture px, from the ink box's start) of the window of
   length `len` inside [start, start+span] whose VISIBLE part holds the
   most detail; a gentle pull to the middle breaks ties */
function bestWindow(profile: number[], full: number, start: number, span: number, len: number, visOff: number, visLen: number): number {
  const slack = span - len;
  if (slack <= 1) return Math.max(0, slack / 2);
  const N = profile.length, at = (px: number) => Math.min(N - 1, Math.max(0, Math.floor((px / full) * N)));
  const sum = (a: number, b: number) => { let t = 0; for (let i = at(a); i <= at(b); i++) t += profile[i]; return t; };
  const total = sum(start, start + span) || 1;
  let best = slack / 2, bestScore = -Infinity;
  for (let k = 0; k <= 40; k++) {
    const off = (slack * k) / 40;
    const v0 = start + off + visOff;
    const score = sum(v0, v0 + visLen) / total - 0.08 * Math.abs(off / slack - 0.5);
    if (score > bestScore) { bestScore = score; best = off; }
  }
  return best;
}
