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
  edge?: ("top" | "bottom" | "left" | "right")[];
  /* 2026-09-29 (owner): the picture was painted as ONE PANEL of the
     window's own shape on plain paper (the spot method) — laid in exactly
     on the sides that bleed, flexibly toward the type */
  panel?: boolean;
  /* 2026-10-01 (owner): the picture over the ground in multiply — Grigol Tatishvili only (profile `blend`) */
  blend?: "multiply";
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
    /* 2026-09-25 (owner: "the ink has more free space on one side, and
       centred as a whole it looks oddly placed — centre the drawing").
       The box around ALL the ink is stretched by strays — a cloud, a
       speck, a blade of grass off to one side — so its middle is not the
       drawing's. The drawing's own middle is its CORE: the ink with the
       outermost 3% trimmed on each side. The core is centred in the room,
       and the whole drawing still stays inside it: it shrinks a little to
       make that room, but never below 88% of its size — past that the
       core only moves as far as the room allows. */
    const s0 = Math.min(art.w / bw, art.h / bh);
    const core = await inkCore(inp.artwork, ground, box);
    const cx = core ? core.cx * aw : bx + bw / 2, cy = core ? core.cy * ah : by + bh / 2;
    const reachX = Math.max(cx - bx, bx + bw - cx), reachY = Math.max(cy - by, by + bh - cy);
    s = Math.max(0.88 * s0, Math.min(s0, art.w / (2 * reachX), art.h / (2 * reachY)));
    const fit = (lo: number, room: number, len: number, want: number) => Math.min(Math.max(want, lo), lo + room - len);
    pxPos = {
      x: fit(art.x, art.w, bw * s, art.x + art.w / 2 - (cx - bx) * s) - bx * s,
      y: fit(art.y, art.h, bh * s, art.y + art.h / 2 - (cy - by) * s) - by * s,
    };
    layout.art = { x: pxPos.x + bx * s, y: pxPos.y + by * s, w: bw * s, h: bh * s };
    layout.artCrop = { x: bx, y: by, w: bw, h: bh };
    /* 2026-09-30: grown to its room by its outline (fitSpot, below) —
       shown as a wider piece of the sheet so no wisp of the drawing meets
       a straight cut (the sheet's own outer 1.5 % stays out: the repaint
       leaves a hairline there) */
    const grown = process.env.SPOT_FIT_OLD === "1" ? null : await fitSpot(inp.artwork, ground, layout, art, aw, ah, s);
    if (grown) {
      s = grown.s; pxPos = { x: grown.x, y: grown.y };
      const over = 2 * (layout.W / inp.widthMm);
      const m = 0.015;
      const src = { x0: Math.max(aw * m, bx - aw * 0.05), y0: Math.max(ah * m, by - ah * 0.05), x1: Math.min(aw * (1 - m), bx + bw + aw * 0.05), y1: Math.min(ah * (1 - m), by + bh + ah * 0.05) };
      const d = { x0: Math.max(-over, pxPos.x + src.x0 * s), y0: Math.max(-over, pxPos.y + src.y0 * s), x1: Math.min(layout.W + over, pxPos.x + src.x1 * s), y1: Math.min(layout.H + over, pxPos.y + src.y1 * s) };
      layout.art = { x: d.x0, y: d.y0, w: d.x1 - d.x0, h: d.y1 - d.y0 };
      layout.artCrop = { x: (d.x0 - pxPos.x) / s, y: (d.y0 - pxPos.y) / s, w: (d.x1 - d.x0) / s, h: (d.y1 - d.y0) / s };
      clip = layout.art;
    }
  } else {
    /* 2026-09-29 (owner, reading the PDF: "the picture runs 6.6 mm past the
       label — it should be 2 mm, 114 × 84 on a 110 × 80 label"): 2 mm */
    const over = 2 * (layout.W / inp.widthMm);
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
    if (inp.panel) {
      /* THE PANEL (2026-09-29, owner: "control the three bleeding sides; the
         type side can give — a little more room there, or reaching the line;
         a hint of the painter's edge on a bleeding side is better than losing
         the picture"). An axis whose both ends bleed is covered exactly (plus
         the 2 mm); the other axis is anchored on its bleeding end, with the
         panel's loose fringe (4 %) just past the trim, and runs toward the
         type as far as it runs — at most 8 % over the window, else the panel
         is scaled down (its bleeding sides then come in a hair). */
      const xExact = bleeds.left && bleeds.right, yExact = bleeds.top && bleeds.bottom;
      const sx = ww / bw, sy = wh / bh;
      if (xExact && yExact) s = Math.max(sx, sy);
      else if (xExact) s = Math.min(sx, (wh * 1.08) / (bh * 0.96));
      else if (yExact) s = Math.min(sy, (ww * 1.08) / (bw * 0.96));
      else s = Math.min(sx, sy);
      const pw0 = bw * s, ph0 = bh * s, fx = pw0 * 0.04, fy = ph0 * 0.04;
      const ix = xExact || (!bleeds.left && !bleeds.right) ? win.x0 + (ww - pw0) / 2 : bleeds.left ? win.x0 - fx : win.x1 - pw0 + fx;
      const iy = yExact || (!bleeds.top && !bleeds.bottom) ? win.y0 + (wh - ph0) / 2 : bleeds.top ? win.y0 - fy : win.y1 - ph0 + fy;
      pxPos = { x: ix - bx * s, y: iy - by * s };
      const B = { x0: -over, y0: -over, x1: layout.W + over, y1: layout.H + over };
      const d = { x0: Math.max(B.x0, pxPos.x), y0: Math.max(B.y0, pxPos.y), x1: Math.min(B.x1, pxPos.x + aw * s), y1: Math.min(B.y1, pxPos.y + ah * s) };
      layout.art = { x: d.x0, y: d.y0, w: d.x1 - d.x0, h: d.y1 - d.y0 };
      layout.artCrop = { x: (d.x0 - pxPos.x) / s, y: (d.y0 - pxPos.y) / s, w: (d.x1 - d.x0) / s, h: (d.y1 - d.y0) / s };
    } else if (inp.edge && inp.edge.length) {
      const E = new Set(inp.edge);
      /* 2026-09-23 (owner, on Giorgi's t10 with type above AND below the
         picture: "it grew tall and ran over the top lines, and its top was
         a straight cut again — control the size"). With the painter's own
         edge on two opposite sides, the painted part is FITTED between
         them (never taller than the window), yet always wide enough to
         cross the label; then it is centred between its two edges. */
      const vPair = E.has("top") && E.has("bottom"), hPair = E.has("left") && E.has("right");
      if (vPair || hPair) {
        const visW = Math.min(win.x1, layout.W) - Math.max(win.x0, 0), visH = Math.min(win.y1, layout.H) - Math.max(win.y0, 0);
        s = vPair ? Math.max(visW / bw, Math.min(ww / bw, wh / bh)) : Math.max(visH / bh, Math.min(wh / bh, ww / bw));
        if (vPair) pxPos.y = win.y0 + (wh - bh * s) / 2 - by * s;
        if (hPair) pxPos.x = win.x0 + (ww - bw * s) / 2 - bx * s;
        if (vPair) pxPos.x = win.x0 - (bx + bestWindow(detail.cols, aw, bx, bw, Math.min(bw, ww / s), visLeft, Math.min(bw, visW / s))) * s;
        if (hPair) pxPos.y = win.y0 - (by + bestWindow(detail.rows, ah, by, bh, Math.min(bh, wh / s), visTop, Math.min(bh, visH / s))) * s;
      }
      /* the painter's own edge sits ON the type's boundary; beyond it the
         plain ground, cleaned to the label's ground, simply runs on */
      if (!vPair && E.has("bottom")) pxPos.y = win.y1 - (by + bh) * s;
      if (!vPair && E.has("top")) pxPos.y = win.y0 - by * s;
      if (!hPair && E.has("right")) pxPos.x = win.x1 - (bx + bw) * s;
      if (!hPair && E.has("left")) pxPos.x = win.x0 - bx * s;
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

  if (inp.blend === "multiply") layout.blend = "multiply";
  const image = `<image xlink:href="${inp.artwork}" x="${pxPos.x.toFixed(1)}" y="${pxPos.y.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" preserveAspectRatio="none"${inp.blend === "multiply" ? ' style="mix-blend-mode:multiply"' : ""}/>`;
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


/* THE DRAWING'S CORE (2026-09-25): where the ink lies once the outermost
   3% of it is set aside on each side — the middle a designer would centre
   by eye. Ink is whatever stands clearly off the flat paper. Fractions of
   the picture; null when there is too little ink to judge. */
async function inkCore(dataUrl: string, paper: string, box: { x: number; y: number; w: number; h: number }): Promise<{ cx: number; cy: number } | null> {
  const N = 200;
  const { data, info } = await sharp(Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"))
    .resize(N, N, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const g = (paper.match(/[0-9a-f]{2}/gi) || ["ff", "ff", "ff"]).map((h) => parseInt(h, 16));
  const c = info.channels, xs = new Array(N).fill(0), ys = new Array(N).fill(0);
  let n = 0;
  const x0 = Math.floor(box.x * N), x1 = Math.ceil((box.x + box.w) * N), y0 = Math.floor(box.y * N), y1 = Math.ceil((box.y + box.h) * N);
  for (let y = Math.max(0, y0); y < Math.min(N, y1); y++) for (let x = Math.max(0, x0); x < Math.min(N, x1); x++) {
    const i = (y * N + x) * c;
    if (Math.abs(data[i] - g[0]) + Math.abs(data[i + 1] - g[1]) + Math.abs(data[i + 2] - g[2]) > 60) { xs[x]++; ys[y]++; n++; }
  }
  if (n < 50) return null;
  const q = (h: number[], p: number) => { let t = 0; for (let i = 0; i < N; i++) { t += h[i]; if (t >= p * n) return (i + 0.5) / N; } return 1; };
  return { cx: (q(xs, 0.03) + q(xs, 0.97)) / 2, cy: (q(ys, 0.03) + q(ys, 0.97)) / 2 };
}

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

/* A SPOT GROWS TO ITS ROOM (owner, 2026-09-30: "the small pictures leave
   far too much empty space — I enlarge nearly every one by hand; leave
   some room around them, but less. On the taller labels they may run off
   the edges so the height is not left empty"). His eight corrections of
   spot layouts were ALL enlargements, ×2 on the median, and in every one
   the drawing's own OUTLINE — not its rectangle — stopped just short of
   the type: the empty corners of its box slid in beside the words, where
   they are only paper.

   So the drawing is measured by its ink, not its box, and made as large as
   it can be while every inked spot keeps GAP from every line of type
   (the words' real extent, measured from the glyphs), and EDGE from the
   trim — except on a TALL label, where it may run off the two sides (at
   most an eighth of the drawing's width each side). Among the positions
   that allow the largest size, the one whose middle sits nearest the
   middle of the template's picture room wins. Never smaller than the old
   fit, never so large the painting prints below ~200 dpi. null → the old
   fit stands. */
const SPOT_GAP_MM = 2, SPOT_EDGE_MM = 3;
export async function fitSpot(
  artwork: string, ground: string, layout: { W: number; H: number; lines: { text: string; x: number; y: number; size: number; tracking: number; family: string; weight: number; italic: boolean; anchor: "start" | "middle" | "end"; rot?: number }[] },
  room: { x: number; y: number; w: number; h: number }, aw: number, ah: number, sMin: number,
): Promise<{ s: number; x: number; y: number } | null> {
  const { measure, inkExtent } = await import("./fonts");
  const W = layout.W, H = layout.H;
  /* the ink, on a grid of at most ~160 cells a side */
  const n = Math.max(aw, ah) > 160 ? 160 / Math.max(aw, ah) : 1;
  const gw = Math.max(8, Math.round(aw * n)), gh = Math.max(8, Math.round(ah * n));
  const { data, info } = await sharp(Buffer.from(artwork.slice(artwork.indexOf(",") + 1), "base64")).removeAlpha().resize(gw, gh, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const P = [1, 3, 5].map((k) => parseInt(ground.slice(k, k + 2), 16));
  const ink = new Uint8Array(gw * gh);
  let x0 = gw, y0 = gh, x1 = -1, y1 = -1, cnt = 0, sx = 0, sy = 0;
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const i = (y * gw + x) * info.channels;
    if (Math.max(Math.abs(data[i] - P[0]), Math.abs(data[i + 1] - P[1]), Math.abs(data[i + 2] - P[2])) > 24) {
      ink[y * gw + x] = 1; cnt++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (cnt < 20) return null;
  /* the points tested: every inked cell on the outline, and a sparse
     sample of the inside (a word could sit wholly over the drawing) */
  const pts: [number, number][] = [];
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    if (!ink[y * gw + x]) continue;
    const edge = x === 0 || y === 0 || x === gw - 1 || y === gh - 1 || !ink[y * gw + x - 1] || !ink[y * gw + x + 1] || !ink[(y - 1) * gw + x] || !ink[(y + 1) * gw + x];
    if (edge || (x % 4 === 0 && y % 4 === 0)) pts.push([(x + 0.5) / gw * aw, (y + 0.5) / gh * ah]);
  }
  const inkL = x0 / gw * aw, inkR = (x1 + 1) / gw * aw, inkT = y0 / gh * ah, inkB = (y1 + 1) / gh * ah;
  /* the drawing's middle is its CORE (owner, 2026-09-25): the ink with the
     outermost 3 % of it set aside on each side — not its centre of mass,
     which a heavy figure on one side drags off (2026-09-30: a centred
     layout's picture sat 7 mm to the right) */
  const colN = new Uint32Array(gw), rowN = new Uint32Array(gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (ink[y * gw + x]) { colN[x]++; rowN[y]++; }
  const q = (a: Uint32Array, f: number) => { let acc = 0; for (let k = 0; k < a.length; k++) { acc += a[k]; if (acc >= cnt * f) return k; } return a.length - 1; };
  const cx = ((q(colN, 0.03) + q(colN, 0.97) + 1) / 2) / gw * aw, cy = ((q(rowN, 0.03) + q(rowN, 0.97) + 1) / 2) / gh * ah;
  void sx; void sy;

  /* where ink may not go, on a 4-px raster of the label */
  const C = 4, cw = Math.ceil(W / C), ch = Math.ceil(H / C);
  const bad = new Uint8Array(cw * ch);
  const gap = SPOT_GAP_MM * PX_PER_MM, edge = SPOT_EDGE_MM * PX_PER_MM;
  const tall = H / W >= 1.2;
  const mark = (ax: number, ay: number, bx: number, by: number) => {
    for (let y = Math.max(0, Math.floor(ay / C)); y <= Math.min(ch - 1, Math.floor(by / C)); y++)
      for (let x = Math.max(0, Math.floor(ax / C)); x <= Math.min(cw - 1, Math.floor(bx / C)); x++) bad[y * cw + x] = 1;
  };
  for (const l of layout.lines) {
    if (!l.text.trim()) continue;
    const f = { family: l.family, weight: l.weight, italic: l.italic };
    const w = measure(l.text, f, l.size, l.size ? l.tracking / l.size : 0);
    const e = inkExtent(l.text, f, l.size);
    let lx = l.anchor === "start" ? l.x : l.anchor === "middle" ? l.x - w / 2 : l.x - w;
    let rx = lx + w, ty = l.y - e.up, by = l.y + e.down;
    if (l.rot) {                                   /* a turned line: the box of its turned corners */
      const r = (l.rot * Math.PI) / 180, co = Math.cos(r), si = Math.sin(r);
      const cs = [[lx, ty], [rx, ty], [lx, by], [rx, by]].map(([px2, py2]) => [l.x + (px2 - l.x) * co - (py2 - l.y) * si, l.y + (px2 - l.x) * si + (py2 - l.y) * co]);
      lx = Math.min(...cs.map((c) => c[0])); rx = Math.max(...cs.map((c) => c[0])); ty = Math.min(...cs.map((c) => c[1])); by = Math.max(...cs.map((c) => c[1]));
    }
    mark(lx - gap, ty - gap, rx + gap, by + gap);
  }
  mark(0, 0, W, edge); mark(0, H - edge, W, H);
  if (!tall) { mark(0, 0, edge, H); mark(W - edge, 0, W, H); }

  const ok = (s: number, ox: number, oy: number) => {
    if (tall) {                                    /* at most an eighth of the drawing off each side */
      const lose = (inkR - inkL) * s / 8;
      if (ox + inkL * s < -lose || ox + inkR * s > W + lose) return false;
    } else if (ox + inkL * s < 0 || ox + inkR * s > W) return false;
    if (oy + inkT * s < 0 || oy + inkB * s > H) return false;
    for (const [px2, py2] of pts) {
      const X = ox + px2 * s, Y = oy + py2 * s;
      if (X < 0 || X >= W) continue;               /* past a tall label's side: nothing to hit */
      if (bad[Math.floor(Y / C) * cw + Math.floor(X / C)]) return false;
    }
    return true;
  };
  /* the positions for one size, nearest the room's middle first */
  const want = { x: room.x + room.w / 2, y: room.y + room.h / 2 };
  const centred = Math.abs(want.x - W / 2) <= PX_PER_MM;
  const place = (s: number): { x: number; y: number } | null => {
    const bx = want.x - cx * s, by = want.y - cy * s;
    const step = 6, R = Math.max(W, H) * 0.5;
    /* a CENTRED room keeps its drawing centred: at most 1.5 mm sideways —
       it grows only as far as the centred place allows */
    const RX = centred ? 1.5 * PX_PER_MM : R;
    const cands: [number, number, number][] = [];
    for (let dy = -R; dy <= R; dy += step) for (let dx = -RX; dx <= RX; dx += Math.min(step, RX)) cands.push([dx * dx + dy * dy, dx, dy]);
    cands.sort((a, b) => a[0] - b[0]);
    for (const [, dx, dy] of cands) if (ok(s, bx + dx, by + dy)) return { x: bx + dx, y: by + dy };
    return null;
  };
  const sMax = Math.min(12 / (200 / 25.4), sMin * 4);   /* ≥ 200 dpi */
  let lo = sMin, hi = sMax, best = place(lo);
  if (!best) return null;
  let bestS = lo;
  for (let k = 0; k < 11; k++) {
    const mid = (lo + hi) / 2, p = place(mid);
    if (p) { lo = mid; best = p; bestS = mid; } else hi = mid;
  }
  return { s: bestS, x: best.x, y: best.y };
}
