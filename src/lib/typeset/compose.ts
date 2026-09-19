import sharp from "sharp";
import { measure, vmetrics, pickRoles, type Pick } from "./fonts";
import { inkOf, inkFootOf } from "./palette";

/* THE COMPOSER, v1.1 (branch POPIKA_Back_To_Vector, 2026-09-19).

   Takes a MASKED artwork (paper + illustration + a band the model was
   kept out of), the brief's texts, the style and the label's mm, and sets
   the type INTO the band by code: a measured hierarchy, faces from the
   style's role pools, ink sampled from the drawing itself. Output: the
   SVG (the future PDF's live type) and a PNG.

   Two things learned on the first smoke, both now law here:
   · the type starts below the DRAWING's last inked row, not below the
     window on paper (the model feathers past its mask);
   · when the drawing leaves too little room, the ART yields — it is
     drawn smaller, top-anchored — before the type is crushed. Space is
     found by dropping the least important lines and closing gaps; the
     hero keeps its rank (never under 2x the secondary) and nothing goes
     under 7 pt. */

export interface ComposeInput {
  artwork: string;                 /* data URL, the masked image (whole label) */
  style: string;
  texts: { wine: string; producer: string; appellation: string; vintage: string; grape: string; region: string; classification: string; special: string; legal: string };
  widthMm: number;
  heightMm: number;
  seed: number;
}
export interface ComposeOutput { svg: string; png: string; faces: string; ink: string }

const PX_PER_MM = 12;                       /* 110 mm → 1320 px */
const MARGIN_MM = 5;                        /* the house rule: text never inside 5 mm */
const MIN_PT = 7;                           /* the house rule: nothing under 7 pt */
const BAND_MIN = 0.34;                      /* the type wants at least this much of the label */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Role = "hero" | "secondary" | "small";
interface Line { text: string; pick: Pick; size: number; role: Role; gapBefore: number; colour: string; drop: number /* lower = dropped first; 99 = never */ }

export async function composeLabel(inp: ComposeInput): Promise<ComposeOutput> {
  const W = Math.round(inp.widthMm * PX_PER_MM), H = Math.round(inp.heightMm * PX_PER_MM);
  const portrait = inp.heightMm > inp.widthMm;
  const M = MARGIN_MM * PX_PER_MM;
  const minPx = (MIN_PT / 72) * 25.4 * PX_PER_MM;
  const roles = pickRoles(inp.style, inp.seed);
  const inks = await inkOf(inp.artwork);
  const t = inp.texts;
  const cased = (s: string, p: Pick) => (p.caps ? s.toUpperCase() : s);

  /* ---- where the drawing ends, and how big it may be ---- */
  const meta = await sharp(Buffer.from(inp.artwork.slice(inp.artwork.indexOf(",") + 1), "base64")).metadata();
  const aw = meta.width || W, ah = meta.height || H;
  const cover = Math.max(W / aw, H / ah);                       /* cover-fit, top-anchored */
  const footFrac = await inkFootOf(inp.artwork);
  let artScale = 1;                                             /* 1 = full cover; smaller = the art yields */
  let inkFootPx = footFrac * ah * cover;
  const wanted = H * (1 - BAND_MIN) - H * 0.03;                 /* the foot the band needs */
  if (inkFootPx > wanted) { artScale = wanted / inkFootPx; inkFootPx = wanted; }
  const windowFoot = H * (portrait ? 0.65 : 0.6) * artScale;
  const bandTop = Math.round(Math.max(windowFoot, inkFootPx + H * 0.03));

  /* ---- the stack, top to bottom ---- */
  const lines: Line[] = [];
  if (t.producer) lines.push({ text: cased(t.producer, roles.secondary), pick: roles.secondary, size: H * 0.032, role: "secondary", gapBefore: 0, colour: inks.ink, drop: 3 });
  lines.push({ text: cased(t.wine, roles.hero), pick: roles.hero, size: H * (portrait ? 0.075 : 0.105), role: "hero", gapBefore: H * 0.012, colour: inks.ink, drop: 99 });
  const second = [t.appellation, t.vintage].filter(Boolean).join("   ");
  if (second) lines.push({ text: cased(second, roles.secondary), pick: roles.secondary, size: H * 0.03, role: "secondary", gapBefore: H * 0.016, colour: inks.ink, drop: 4 });
  /* a varietal wine's name IS its grape — never print "Saperavi" twice */
  const grape = t.grape && t.grape.trim().toLowerCase() !== t.wine.trim().toLowerCase() ? t.grape : "";
  const third = [t.classification, grape, t.region].filter(Boolean).join("  ·  ");
  if (third) lines.push({ text: third, pick: roles.small, size: H * 0.026, role: "small", gapBefore: H * 0.012, colour: inks.ink, drop: 2 });
  if (t.special) lines.push({ text: t.special, pick: { ...roles.small, face: { ...roles.small.face, italic: true } }, size: H * 0.024, role: "small", gapBefore: H * 0.008, colour: inks.ink, drop: 1 });
  const legal: Line = { text: t.legal, pick: roles.small, size: H * 0.022, role: "small", gapBefore: 0, colour: inks.ink, drop: 99 };

  /* ---- fit ---- */
  const maxW = W - 2 * M;
  const widthOf = (l: Line) => measure(l.text, l.pick.face, l.size, l.pick.tracking);
  const floor = (l: Line) => (l.role === "hero" ? minPx * 2.2 : l.role === "secondary" ? minPx * 1.1 : minPx);
  const shrinkToWidth = (l: Line) => { let g = 0; while (widthOf(l) > maxW && l.size > floor(l) && g++ < 80) l.size *= 0.96; };
  for (const l of [...lines, legal]) shrinkToWidth(l);
  const lh = (l: Line) => l.size * (vmetrics(l.pick.face).asc + vmetrics(l.pick.face).desc);
  const stackH = (ls: Line[]) => ls.reduce((h, l, i) => h + (i ? l.gapBefore : 0) + lh(l), 0);
  const legalH = lh(legal);
  const room = () => H - M - bandTop - legalH - H * 0.02;       /* what the body may use */
  let body = lines;
  let guard = 0;
  while (stackH(body) > room() && guard++ < 60) {
    /* 1. close the gaps a little  2. drop the least important line
       3. only then shrink, keeping the hero's rank */
    if (body.some((l) => l.gapBefore > H * 0.006)) { for (const l of body) l.gapBefore *= 0.8; continue; }
    const droppable = body.filter((l) => l.drop < 99).sort((a, b) => a.drop - b.drop)[0];
    if (droppable && stackH(body) - lh(droppable) - droppable.gapBefore > room() * 0.85) { body = body.filter((l) => l !== droppable); continue; }
    let moved = false;
    for (const l of body) if (l.size > floor(l)) { l.size = Math.max(floor(l), l.size * 0.95); moved = true; }
    if (!moved) { if (droppable) { body = body.filter((l) => l !== droppable); continue; } break; }
  }
  const hero = body.find((l) => l.role === "hero")!;
  for (const l of body) if (l.role !== "hero" && l.size > hero.size / 2) l.size = hero.size / 2;

  /* ---- place: body centred in its room, legal pinned to the foot ---- */
  const free = Math.max(0, room() - stackH(body));
  let y = bandTop + free * 0.4;
  const x = roles.align === "center" ? W / 2 : M;
  const anchor = roles.align === "center" ? "middle" : "start";
  const textEl = (l: Line, baseline: number) =>
    `<text x="${x.toFixed(1)}" y="${baseline.toFixed(1)}" text-anchor="${anchor}" font-family="${esc(l.pick.face.family)}" font-weight="${l.pick.face.weight}"${l.pick.face.italic ? ' font-style="italic"' : ""} font-size="${l.size.toFixed(1)}" letter-spacing="${(l.pick.tracking * l.size).toFixed(2)}" fill="${l.colour}">${esc(l.text)}</text>`;
  const els: string[] = [];
  body.forEach((l, i) => {
    const vm = vmetrics(l.pick.face);
    y += (i ? l.gapBefore : 0) + l.size * vm.asc;
    els.push(textEl(l, y));
    y += l.size * vm.desc;
  });
  els.push(textEl(legal, H - M - legal.size * vmetrics(legal.pick.face).desc));

  /* the art: cover-fit and top-anchored; when it yielded, smaller and
     centred, on the label's paper */
  const drawW = W * artScale, drawH = H * artScale;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="${inks.paper}"/>` +
    `<image xlink:href="${inp.artwork}" x="${((W - drawW) / 2).toFixed(1)}" y="0" width="${drawW.toFixed(1)}" height="${drawH.toFixed(1)}" preserveAspectRatio="xMidYMin slice"/>` +
    els.join("") +
    `</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return {
    svg, png: `data:image/png;base64,${png.toString("base64")}`,
    faces: `${roles.hero.face.family} ${roles.hero.face.weight} / ${roles.secondary.face.family} / ${roles.small.face.family}${artScale < 1 ? ` · art ${(artScale * 100).toFixed(0)}%` : ""}`,
    ink: inks.ink,
  };
}
