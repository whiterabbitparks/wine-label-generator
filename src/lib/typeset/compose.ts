import sharp from "sharp";
import { measure, vmetrics, pickRoles, type Pick } from "./fonts";
import { inkOf, inkFootOf } from "./palette";

/* THE COMPOSER, v1.2 (branch POPIKA_Back_To_Vector, 2026-09-19).

   Takes a MASKED artwork (ground + illustration + a band the model was
   kept out of), the brief's texts, the style and the label's mm, and sets
   the type INTO the band by code. Output: the SVG (live type — the future
   PDF) and a PNG.

   Laws, each one learned on a real label:
   · the type starts below the drawing's LAST INKED ROW, not the mask
     window (the model feathers past its mask);
   · when the drawing leaves too little room the ART yields — drawn
     smaller, top-anchored — before the type is crushed;
   · a varietal's grape is never printed twice;
   · (owner 2026-09-19) lines are GROUPED into logical blocks — producer +
     name, appellation + vintage, grape + origin, alcohol + volume — with
     120% leading INSIDE a block and real air BETWEEN blocks; a block is
     ONE <text> object with a <tspan> per line, so Illustrator opens it
     as one editable paragraph;
   · the ground colour is the painter's (chosen before the ask); the type
     takes the drawing's ink on a light ground and paper-white on a dark
     or saturated one. */

export interface ComposeInput {
  artwork: string;                 /* data URL, the masked image (whole label) */
  style: string;
  texts: { wine: string; producer: string; appellation: string; vintage: string; grape: string; region: string; classification: string; special: string; legal: string };
  widthMm: number;
  heightMm: number;
  seed: number;
  paper?: string;                  /* the ground the painter was given; sampled when absent */
}
export interface ComposeOutput { svg: string; png: string; faces: string; ink: string }

const PX_PER_MM = 12;                       /* 110 mm → 1320 px */
const MARGIN_MM = 5;                        /* the house rule: text never inside 5 mm */
const MIN_PT = 7;                           /* the house rule: nothing under 7 pt */
const BAND_MIN = 0.34;                      /* the type wants at least this much of the label */
const LEADING = 1.2;                        /* inside a block: baseline to baseline = 120% of the size */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Role = "hero" | "secondary" | "small";
interface Line { text: string; pick: Pick; size: number; role: Role; drop: number /* lower = dropped first; 99 = never */ }
interface Block { id: string; lines: Line[] }

const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
const sat = (hex: string) => { const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };

export async function composeLabel(inp: ComposeInput): Promise<ComposeOutput> {
  const W = Math.round(inp.widthMm * PX_PER_MM), H = Math.round(inp.heightMm * PX_PER_MM);
  const portrait = inp.heightMm > inp.widthMm;
  const M = MARGIN_MM * PX_PER_MM;
  const minPx = (MIN_PT / 72) * 25.4 * PX_PER_MM;
  const roles = pickRoles(inp.style, inp.seed);
  const inks = await inkOf(inp.artwork);
  const ground = inp.paper || inks.paper;
  /* the type's colour: the drawing's ink on a light ground, paper-white on
     a dark or saturated one */
  const dark = lum(ground) < 0.45 || sat(ground) > 0.45;
  const colour = dark ? "#F6F1E6" : inks.ink;
  const t = inp.texts;
  const cased = (s: string, p: Pick) => (p.caps ? s.toUpperCase() : s);

  /* ---- where the drawing ends, and how big it may be ---- */
  const meta = await sharp(Buffer.from(inp.artwork.slice(inp.artwork.indexOf(",") + 1), "base64")).metadata();
  const aw = meta.width || W, ah = meta.height || H;
  const cover = Math.max(W / aw, H / ah);
  const footFrac = await inkFootOf(inp.artwork, ground);
  let artScale = 1;
  let inkFootPx = footFrac * ah * cover;
  const wanted = H * (1 - BAND_MIN) - H * 0.03;
  if (inkFootPx > wanted) { artScale = wanted / inkFootPx; inkFootPx = wanted; }
  const windowFoot = H * (portrait ? 0.65 : 0.6) * artScale;
  const bandTop = Math.round(Math.max(windowFoot, inkFootPx + H * 0.03));

  /* ---- the blocks ---- */
  const L = (text: string, pick: Pick, size: number, role: Role, drop: number): Line => ({ text, pick, size, role, drop });
  const grape = t.grape && t.grape.trim().toLowerCase() !== t.wine.trim().toLowerCase() ? t.grape : "";
  const blocks: Block[] = [];
  const name: Line[] = [];
  if (t.producer) name.push(L(cased(t.producer, roles.secondary), roles.secondary, H * 0.032, "secondary", 3));
  name.push(L(cased(t.wine, roles.hero), roles.hero, H * (portrait ? 0.075 : 0.105), "hero", 99));
  blocks.push({ id: "name", lines: name });
  const where: Line[] = [];
  const second = [t.appellation, t.vintage].filter(Boolean).join("   ");
  if (second) where.push(L(cased(second, roles.secondary), roles.secondary, H * 0.03, "secondary", 4));
  const third = [t.classification, grape, t.region].filter(Boolean).join("  ·  ");
  if (third) where.push(L(third, roles.small, H * 0.026, "small", 2));
  if (t.special) where.push(L(t.special, { ...roles.small, face: { ...roles.small.face, italic: true } }, H * 0.024, "small", 1));
  if (where.length) blocks.push({ id: "where", lines: where });
  blocks.push({ id: "legal", lines: [L(t.legal, roles.small, H * 0.022, "small", 99)] });

  /* ---- fit ---- */
  const maxW = W - 2 * M;
  const widthOf = (l: Line) => measure(l.text, l.pick.face, l.size, l.pick.tracking);
  const floor = (l: Line) => (l.role === "hero" ? minPx * 2.2 : l.role === "secondary" ? minPx * 1.1 : minPx);
  for (const b of blocks) for (const l of b.lines) { let g = 0; while (widthOf(l) > maxW && l.size > floor(l) && g++ < 80) l.size *= 0.96; }
  /* a block's height: first line's ascent, then 120% steps, then the last descent */
  const blockH = (b: Block) => b.lines.reduce((h, l, i) => h + (i === 0 ? l.size * vmetrics(l.pick.face).asc : l.size * LEADING), 0) + b.lines[b.lines.length - 1].size * vmetrics(b.lines[b.lines.length - 1].pick.face).desc;
  let gap = H * 0.05;                                         /* air between blocks */
  const all = () => blocks.filter((b) => b.lines.length);
  const stackH = () => all().reduce((h, b, i) => h + (i ? gap : 0) + blockH(b), 0);
  const room = H - M - bandTop;
  /* the order of sacrifice (learned on the second smoke, where a hero at
     full size cost the producer, the origin and "Old Vines" at once):
     1. close the air between blocks a little
     2. shrink everything, in proportion, down to a COMFORTABLE size
        (hero no smaller than 7% of the label height)
     3. only then drop the least important line
     4. and only then shrink to the hard floors */
  const soft = (l: Line) => (l.role === "hero" ? Math.max(floor(l), H * 0.07) : Math.max(floor(l), l.role === "secondary" ? H * 0.024 : H * 0.02));
  const shrink = (lim: (l: Line) => number) => {
    let moved = false;
    for (const b of all()) for (const l of b.lines) if (l.size > lim(l)) { l.size = Math.max(lim(l), l.size * 0.95); moved = true; }
    return moved;
  };
  let guard = 0;
  while (stackH() > room && guard++ < 80) {
    if (gap > H * 0.03) { gap *= 0.85; continue; }
    if (shrink(soft)) continue;
    const cands = all().flatMap((b) => b.lines.filter((l) => l.drop < 99).map((l) => ({ b, l }))).sort((a, c) => a.l.drop - c.l.drop);
    if (cands.length) { const { b, l } = cands[0]; b.lines = b.lines.filter((x) => x !== l); continue; }
    if (gap > H * 0.018) { gap *= 0.85; continue; }
    if (!shrink(floor)) break;
  }
  const hero = blocks[0].lines.find((l) => l.role === "hero")!;
  for (const b of all()) for (const l of b.lines) if (l.role !== "hero" && l.size > hero.size / 2) l.size = hero.size / 2;

  /* ---- place: blocks from the band's top with their air; the legal block
          pinned to the foot ---- */
  const x = roles.align === "center" ? W / 2 : M;
  const anchor = roles.align === "center" ? "middle" : "start";
  const blockEl = (b: Block, top: number) => {
    let y = top;
    const spans = b.lines.map((l, i) => {
      y += i === 0 ? l.size * vmetrics(l.pick.face).asc : l.size * LEADING;
      return `<tspan x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${esc(l.pick.face.family)}" font-weight="${l.pick.face.weight}"${l.pick.face.italic ? ' font-style="italic"' : ""} font-size="${l.size.toFixed(1)}" letter-spacing="${(l.pick.tracking * l.size).toFixed(2)}">${esc(l.text)}</tspan>`;
    });
    return `<text id="${b.id}" text-anchor="${anchor}" fill="${colour}">${spans.join("")}</text>`;
  };
  const body = all().filter((b) => b.id !== "legal");
  const legal = blocks.find((b) => b.id === "legal")!;
  const bodyH = body.reduce((h, b, i) => h + (i ? gap : 0) + blockH(b), 0);
  const free = Math.max(0, room - bodyH - blockH(legal) - gap);
  let y = bandTop + free * 0.35;
  const els: string[] = [];
  body.forEach((b, i) => { if (i) y += gap; els.push(blockEl(b, y)); y += blockH(b); });
  els.push(blockEl(legal, H - M - blockH(legal)));

  const drawW = W * artScale, drawH = H * artScale;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="${ground}"/>` +
    `<image xlink:href="${inp.artwork}" x="${((W - drawW) / 2).toFixed(1)}" y="0" width="${drawW.toFixed(1)}" height="${drawH.toFixed(1)}" preserveAspectRatio="xMidYMin slice"/>` +
    els.join("") +
    `</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return {
    svg, png: `data:image/png;base64,${png.toString("base64")}`,
    faces: `${roles.hero.face.family} ${roles.hero.face.weight} / ${roles.secondary.face.family} / ${roles.small.face.family}${artScale < 1 ? ` · art ${(artScale * 100).toFixed(0)}%` : ""} · ground ${ground}`,
    ink: colour,
  };
}
