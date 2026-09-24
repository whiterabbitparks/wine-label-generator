import sharp from "sharp";
import { measure, vmetrics, pickRoles, mix, type Pick } from "./fonts";
import { inkOf, inkFootOf, sliceColourOf, zoneStatsOf, vignetteOf } from "./palette";

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
  wineColour?: string;             /* "Red" / "White" / "Amber" / "Rosé" … — round 85 #10 */
  align?: "center" | "left";       /* round 94 #6: a layout variant may flip the style's alignment */
  fit?: "yield" | "crop" | "top" | "vignette";  /* round 100: vignette = the drawing is trimmed off its plain ground and placed above the type on that colour */
}
/* every set line, in label pixels — what the PDF is drawn from */
/* 2026-09-22: the owner's templates right-align a column and set two of
   them vertically, and one sets the wine name around an arc — so a line
   may now anchor at its END and may carry its own rotation, in degrees
   clockwise about its anchor point. Both are optional; nothing that was
   already laid out uses them. */
export interface LaidLine { text: string; x: number; y: number; size: number; tracking: number; family: string; weight: number; italic: boolean; anchor: "start" | "middle" | "end"; colour: string; rot?: number;
  /* 2026-09-23: which of the label's elements this line is ("producer",
     "wineTypeLine+alcVol"…) — the admin's layout editor and the reading of
     its edits need it; an arced name's letters all carry the same key */
  key?: string }
export interface Layout { W: number; H: number; ground: string; art: { x: number; y: number; w: number; h: number }; artCrop?: { x: number; y: number; w: number; h: number }; lines: LaidLine[] }
export interface ComposeOutput { svg: string; png: string; faces: string; ink: string; layout: Layout }

const PX_PER_MM = 12;                       /* 110 mm → 1320 px */
const MARGIN_MM = 5;                        /* the house rule: text never inside 5 mm */
const MIN_PT = 7;                           /* the house rule: nothing under 7 pt */
const BAND_MIN = 0.34;                      /* the type wants at least this much of the label */
const LEADING = 1.2;                        /* inside a block: baseline to baseline = 120% of the size */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Role = "hero" | "secondary" | "small";
interface Line { text: string; pick: Pick; size: number; role: Role; drop: number /* lower = dropped first; 99 = never */ }

/* ROUND 85 #10 (owner): a traditional label is a monochrome print and
   wants ONE colour in its type, taken from the wine — reds for a red,
   greens for a white, earth for an amber. One role carries it (the name,
   the producer/appellation line, or the small print), most of the time,
   never all of them. */
const WINE_INKS: Record<string, string[]> = {
  red: ["#8B1A1A", "#6E0F14", "#A32B2B", "#7A1F2B", "#5C0A0A"],
  white: ["#3D5A3A", "#2F4F2F", "#556B2F", "#4B6B4A", "#2E5E4E"],
  amber: ["#8A5A2B", "#A0522D", "#7B4A22", "#B5651D", "#6B4423"],
  rose: ["#B5556A", "#9E4A5E", "#C0616B", "#8E3B4C"],
  sparkling: ["#3D5A3A", "#6B6B2B", "#4B6B4A", "#8A7A2B"],
};
function wineInkFor(colour: string | undefined, seed: number): string | null {
  const c = (colour || "").toLowerCase();
  const key = /ros/.test(c) ? "rose" : /amber|orange|skin/.test(c) ? "amber" : /red/.test(c) ? "red" : /spark|brut|pét|pet/.test(c) ? "sparkling" : /white/.test(c) ? "white" : "";
  if (!key) return null;
  if (mix(seed, 13) % 10 >= 7) return null;                 /* three labels in ten stay all-ink */
  const list = WINE_INKS[key];
  return list[mix(seed, 14) % list.length];
}
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
  const crop = inp.fit === "crop";
  /* crop mode (round 98 #3): the foot of the painting is MEASURED. Quiet
     foot → the type sits straight on the painting, nothing added. Busy
     foot → a flat band in the foot's own colour, hard edge, no fade. */
  const bandFrac = portrait ? 0.62 : 0.6;
  /* ROUND 99 (owner: "NO — the background is cutting the illustration"):
     a free painting is NEVER cut and never shrunk. The type is set ON the
     painting, in the ink that reads against its foot; nothing is drawn
     over the picture. The measurement only chooses the ink. */
  const top = inp.fit === "top";
  const vig = inp.fit === "vignette" ? await vignetteOf(inp.artwork) : null;
  const zone = crop ? await zoneStatsOf(inp.artwork, bandFrac) : null;
  const overlay = !!zone;
  /* top mode: the band takes the painting's own bottom-edge colour, so
     the picture and the band read as one printed sheet */
  const ground = vig ? vig.ground : crop ? zone!.colour : top ? await sliceColourOf(inp.artwork, 0.9, 1) : (inp.paper || inks.paper);
  /* the type's colour: the drawing's ink on a light ground, paper-white on
     a dark or saturated one */
  /* on a painting the foot's mean luminance decides the ink: light foot →
     the drawing's dark ink, dark foot → paper-white */
  const dark = zone ? zone.lum < 0.55 : (lum(ground) < (top ? 0.6 : 0.45) || sat(ground) > 0.45);
  const colour = dark ? "#F6F1E6" : (zone ? "#1a1a1a" : inks.ink);
  /* round 85 #10: on a light traditional ground one role takes the wine's colour */
  const wineInk = inp.style === "traditional" && !dark ? wineInkFor(inp.wineColour, inp.seed) : null;
  const wineRole: Role | null = wineInk ? (["hero", "secondary", "small"] as Role[])[mix(inp.seed, 15) % 3] : null;
  const t = inp.texts;
  const cased = (s: string, p: Pick) => (p.caps ? s.toUpperCase() : s);

  /* ---- where the drawing ends, and how big it may be ---- */
  const meta = await sharp(Buffer.from(inp.artwork.slice(inp.artwork.indexOf(",") + 1), "base64")).metadata();
  const aw = meta.width || W, ah = meta.height || H;
  const cover = Math.max(W / aw, H / ah);
  const footFrac = await inkFootOf(inp.artwork, ground);
  let artScale = 1;
  let inkFootPx = footFrac * ah * cover;
  /* ROUND 85 #8: with the 7 pt floor binding, six lines no longer fit the
     34 % band of an 80 mm label — and the rule is that the ART yields, not
     the words. The band is at least what the whole stack needs at its
     floors (120 % leading, the tightest air), so no line is dropped just
     to keep the picture at full size. */
  const minPx0 = (MIN_PT / 72) * 25.4 * PX_PER_MM;
  const floorOf = (role: "hero" | "secondary" | "small") => (role === "hero" ? minPx0 * 2.2 : role === "secondary" ? minPx0 * 1.1 : minPx0);
  const t0 = inp.texts;
  const roleList: ("hero" | "secondary" | "small")[] = ["hero"];
  if (t0.producer) roleList.push("secondary");
  if (t0.appellation || t0.vintage) roleList.push("secondary");
  if (t0.classification || (t0.grape && t0.grape.trim().toLowerCase() !== t0.wine.trim().toLowerCase()) || t0.region) roleList.push("small");
  if (t0.special) roleList.push("small");
  roleList.push("small");                                    /* legal */
  const needH = (roleList.reduce((h, r) => h + floorOf(r) * LEADING, 0) + 2 * H * 0.018 + floorOf("hero") * 0.3) * 1.08;
  const wanted = Math.min(H * (1 - BAND_MIN) - H * 0.03, H - M - needH - H * 0.03);
  if (!crop && !top && !vig && inkFootPx > wanted) { artScale = wanted / inkFootPx; inkFootPx = wanted; }
  const windowFoot = Math.min(H * (portrait ? 0.65 : 0.6) * artScale, wanted + H * 0.03);
  const bandTop = (crop || top || vig) ? Math.round(Math.min(H * bandFrac, wanted + H * 0.03)) : Math.round(Math.max(windowFoot, inkFootPx + H * 0.03));

  /* ---- the blocks ---- */
  const L = (text: string, pick: Pick, size: number, role: Role, drop: number): Line => ({ text, pick, size, role, drop });
  const grape = t.grape && t.grape.trim().toLowerCase() !== t.wine.trim().toLowerCase() ? t.grape : "";
  const blocks: Block[] = [];
  const name: Line[] = [];
  if (t.producer) name.push(L(cased(t.producer, roles.secondary), roles.secondary, H * 0.032, "secondary", 3));
  /* ROUND 85 #9 (owner: "we can be more daring — bigger wine names"): the
     hero opens between 11 and 15 % of the height (8–11 % portrait), dealt
     by the seed; the fit shrinks it only if the band cannot hold it */
  const heroFrac = (portrait ? 0.08 : 0.11) + (mix(inp.seed, 16) % 5) * (portrait ? 0.0075 : 0.01);
  name.push(L(cased(t.wine, roles.hero), roles.hero, H * heroFrac, "hero", 99));
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
  /* ROUND 85 #8 (owner opened the file at real size: "the small text was
     4-point-something — we have the 7 pt rule!"): the floors used to bind
     only while shrinking; a small label's opening sizes (2.2 % of 80 mm)
     were already under 7 pt. Nothing opens below its floor. */
  for (const b of blocks) for (const l of b.lines) l.size = Math.max(l.size, floor(l));
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
  /* round 85 #8: the band now grows to hold every line at its floor, so
     dropping a line is the LAST resort — after the air is closed and the
     type is at its hard (7 pt) floors, never before */
  while (stackH() > room && guard++ < 80) {
    if (gap > H * 0.03) { gap *= 0.85; continue; }
    if (shrink(soft)) continue;
    if (gap > H * 0.018) { gap *= 0.85; continue; }
    if (shrink(floor)) continue;
    const cands = all().flatMap((b) => b.lines.filter((l) => l.drop < 99).map((l) => ({ b, l }))).sort((a, c) => a.l.drop - c.l.drop);
    if (cands.length) { const { b, l } = cands[0]; b.lines = b.lines.filter((x) => x !== l); continue; }
    break;
  }
  const hero = blocks[0].lines.find((l) => l.role === "hero")!;
  for (const b of all()) for (const l of b.lines) if (l.role !== "hero" && l.size > hero.size / 2) l.size = Math.max(floor(l), hero.size / 2);

  /* ---- place: blocks from the band's top with their air; the legal block
          pinned to the foot ---- */
  const align = inp.align || roles.align;
  const x = align === "center" ? W / 2 : M;
  const anchor: "start" | "middle" = align === "center" ? "middle" : "start";
  const laid: LaidLine[] = [];
  const blockEl = (b: Block, top: number) => {
    let y = top;
    const spans = b.lines.map((l, i) => {
      y += i === 0 ? l.size * vmetrics(l.pick.face).asc : l.size * LEADING;
      const fill = wineRole && l.role === wineRole ? wineInk! : colour;
      laid.push({ text: l.text, x, y, size: l.size, tracking: l.pick.tracking * l.size, family: l.pick.face.family, weight: l.pick.face.weight, italic: !!l.pick.face.italic, anchor, colour: fill });
      return `<tspan x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${esc(l.pick.face.family)}" font-weight="${l.pick.face.weight}"${l.pick.face.italic ? ' font-style="italic"' : ""} font-size="${l.size.toFixed(1)}" letter-spacing="${(l.pick.tracking * l.size).toFixed(2)}"${fill !== colour ? ` fill="${fill}"` : ""}>${esc(l.text)}</tspan>`;
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
  /* ROUND 108 #18 (owner: "the PDF's image covered the whole artboard
     while the SVG was right"): the vignette's placement is worked out
     ONCE — the SVG draws it and the layout carries it, source crop and
     all, so the PDF puts the drawing exactly where the SVG does. */
  const vigPlace = vig ? (() => {
    const bx = vig.box.x * aw, by = vig.box.y * ah, bw = vig.box.w * aw, bh = vig.box.h * ah;
    const areaW = W - 2 * M, areaH = bandTop - M * 0.6;
    const k = Math.min(areaW / bw, areaH / bh);
    const pw = bw * k, ph = bh * k;
    return { bx, by, bw, bh, pw, ph, px: (W - pw) / 2, py: M * 0.6 + (areaH - ph) / 2 };
  })() : null;
  /* ROUND 85 #8: the file carries its PHYSICAL size — width/height in mm,
     the pixel grid only in the viewBox — so Illustrator opens a 110 × 80
     label at 110 × 80, not at 1320 × 960 points */
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${inp.widthMm}mm" height="${inp.heightMm}mm" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="${ground}"/>` +
    (vigPlace
      ? `<svg x="${vigPlace.px.toFixed(1)}" y="${vigPlace.py.toFixed(1)}" width="${vigPlace.pw.toFixed(1)}" height="${vigPlace.ph.toFixed(1)}" viewBox="${vigPlace.bx.toFixed(1)} ${vigPlace.by.toFixed(1)} ${vigPlace.bw.toFixed(1)} ${vigPlace.bh.toFixed(1)}" preserveAspectRatio="xMidYMid meet"><image xlink:href="${inp.artwork}" x="0" y="0" width="${aw}" height="${ah}"/></svg>`
      : top
      ? `<svg x="0" y="0" width="${W}" height="${bandTop}" viewBox="0 0 ${W} ${bandTop}"><image xlink:href="${inp.artwork}" x="0" y="0" width="${W}" height="${bandTop}" preserveAspectRatio="xMidYMid slice"/></svg>`
      : `<image xlink:href="${inp.artwork}" x="${((W - drawW) / 2).toFixed(1)}" y="0" width="${drawW.toFixed(1)}" height="${drawH.toFixed(1)}" preserveAspectRatio="xMidYMin slice"/>`) +
    /* crop mode: the band over the painting's foot, with a soft 5 % seam */
    (crop && !overlay
      ? `<rect x="0" y="${bandTop}" width="${W}" height="${H - bandTop}" fill="${ground}"/>`
      : "") +
    els.join("") +
    `</svg>`;
  /* sharp rasterises at 12 px/mm regardless of the mm size on the root */
  const png = await sharp(Buffer.from(svg), { density: (12 * 25.4) }).resize(W, H).png().toBuffer();
  return {
    svg, png: `data:image/png;base64,${png.toString("base64")}`,
    faces: `${roles.hero.face.family} ${roles.hero.face.weight} / ${roles.secondary.face.family} / ${roles.small.face.family}${artScale < 1 ? ` · art ${(artScale * 100).toFixed(0)}%` : ""} · ground ${ground}${wineInk ? ` · ${wineRole} in ${wineInk}` : ""}${zone ? ` · type on the painting (foot lum ${zone.lum.toFixed(2)})` : ""}${top ? " · picture on top, band in its foot colour" : ""}${vig ? ` · vignette ${(vig.box.w * 100).toFixed(0)}×${(vig.box.h * 100).toFixed(0)}% on ${vig.ground}` : ""}`,
    ink: colour,
    layout: {
      W, H, ground,
      art: vigPlace ? { x: vigPlace.px, y: vigPlace.py, w: vigPlace.pw, h: vigPlace.ph }
        : top ? { x: 0, y: 0, w: W, h: bandTop }
        : { x: (W - drawW) / 2, y: 0, w: drawW, h: drawH },
      ...(vigPlace ? { artCrop: { x: vigPlace.bx, y: vigPlace.by, w: vigPlace.bw, h: vigPlace.bh } } : {}),
      lines: laid,
    },
  };
}
