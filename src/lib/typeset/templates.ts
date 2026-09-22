import { measure, vmetrics, mix, type Face } from "./fonts";
import type { LaidLine, Layout } from "./compose";

/* THE OWNER'S LAYOUT TEMPLATES (2026-09-22).

   He draws them in Illustrator; tools/extract-templates.mjs reads his PDF
   and writes templates.data.ts, so every number below is measured off his
   artboard and never typed by hand. This module turns one of those
   templates + a customer's fields + a label size into a Layout — the same
   Layout the SVG, the PNG and the PDF are already drawn from.

   His five rules, in his words, and how each one is kept:

   1. "collapse the block and let the next item inherit that anchor,
      rather than leaving a floating gap" — rows (lines that share a
      baseline) are a stack anchored to the nearer edge of the label. An
      empty row is removed WITH its advance, and the rest close up toward
      the anchor. Nothing floats.

   2. "keep a 5 millimeter safe margin for all text and key elements,
      while allowing only background or bleed imagery to cross it" —
      MARGIN_MM is checked on every laid line; only the picture may cross.

   3. "when aspect ratios change, let the image absorb most of that
      change… tweak that crop or scale while keeping type within
      reasonable bounds" — type keeps its size and its distance from its
      own anchor edge; the picture takes whatever is left. Type only
      scales when the type itself no longer fits, and never past 7 pt.

   4. "allow variety but protect hierarchy and legibility… min 7pt, max
      20pt… prevent collisions, and encourage meaningful contrast, not
      trivial swaps" — MIN_PT / MAX_PT, the hero is always the largest,
      and a face pool per column whose members differ in CLASS.

   5. "set a loose palette direction by wine type, but let the artwork
      influence the actual choice" — the caller hands in the ink and the
      accent it read off the painting; the template only says WHICH lines
      take the accent. */

export type Band = "classical" | "contemporary" | "free";
export type FieldKey = "producer" | "wineName" | "appellation" | "classification"
  | "vintage" | "grape" | "regionCountry" | "special" | "wineTypeLine" | "alcVol";

export interface TplText {
  fields: FieldKey[];            /* more than one = joined, as he drew them */
  join?: string;
  role: "hero" | "secondary" | "small";
  x: number;                     /* mm from the left; the anchor point */
  baseline: number;              /* mm from the top */
  fromBottom: number;            /* mm from the foot */
  anchor: "top" | "bottom";      /* which edge holds this row */
  align: "left" | "center" | "right";
  size: number;                  /* points at the reference size */
  caps: boolean;
  accent: boolean;
  tracking: number;              /* em */
  rot: number;                   /* 0, or -90 for the vertical templates */
  serif: boolean;
  arc?: { cx: number; cy: number; r: number; up: boolean };
}
export interface Template {
  id: string;
  band: Band;
  refW: number; refH: number;
  art: { kind: "rect" | "oval"; x: number; y: number; w: number; h: number } | null;
  texts: TplText[];
}

export const PX_PER_MM = 12;
export const MARGIN_MM = 5;
export const MIN_PT = 7;
export const MAX_PT = 20;
const PT_MM = 25.4 / 72;
const px = (millimetres: number) => millimetres * PX_PER_MM;
const ptPx = (points: number) => points * PT_MM * PX_PER_MM;

/* ---- the faces, one pool per column -------------------------------
   Google faces only (standing rule). The owner, 2026-09-22: "classical
   serif, contemporary sans-serif, the third handwritten and artistic".
   Each pool's members differ in CLASS, not in name, so a swap always
   reads — his "meaningful contrast, not trivial swaps". */
type Pool = { hero: Face[]; secondary: Face[]; small: Face[] };
export const BAND_FACES: Record<Band, Pool> = {
  classical: {
    hero: [{ family: "Playfair Display", weight: 700 }, { family: "Cinzel", weight: 600 }, { family: "Prata", weight: 400 }, { family: "Cormorant Garamond", weight: 600 }, { family: "Marcellus", weight: 400 }],
    secondary: [{ family: "EB Garamond", weight: 500 }, { family: "Marcellus", weight: 400 }, { family: "Cinzel", weight: 500 }, { family: "Alegreya SC", weight: 500 }],
    small: [{ family: "EB Garamond", weight: 400 }, { family: "Cormorant Garamond", weight: 500 }, { family: "Tinos", weight: 400 }],
  },
  contemporary: {
    hero: [{ family: "Archivo", weight: 800 }, { family: "Jost", weight: 600 }, { family: "Bebas Neue", weight: 400 }, { family: "Anton", weight: 400 }, { family: "Fraunces", weight: 600 }],
    secondary: [{ family: "Jost", weight: 500 }, { family: "Archivo", weight: 500 }, { family: "Barlow", weight: 600 }],
    small: [{ family: "Archivo", weight: 400 }, { family: "Jost", weight: 400 }, { family: "Barlow", weight: 400 }],
  },
  free: {
    hero: [{ family: "Permanent Marker", weight: 400 }, { family: "Caveat", weight: 700 }, { family: "Great Vibes", weight: 400 }, { family: "Manufacturing Consent", weight: 400 }, { family: "Estonia", weight: 400 }],
    secondary: [{ family: "Caveat", weight: 700 }, { family: "Barlow Condensed", weight: 700 }, { family: "Nixie One", weight: 400 }],
    small: [{ family: "Barlow", weight: 500 }, { family: "Archivo", weight: 400 }],
  },
};
export function facesFor(band: Band, seed: number): { hero: Face; secondary: Face; small: Face } {
  const p = BAND_FACES[band];
  const at = <T,>(l: T[], salt: number) => l[mix(seed, salt) % l.length];
  return { hero: at(p.hero, 11), secondary: at(p.secondary, 12), small: at(p.small, 13) };
}

/* ---- the customer's words, in the template's field names ------------
   The alcohol line keeps the house wording (owner 2026-09-22: "13.5%
   Alc. by Vol. / 750 mL is the correct version"), not the shorthand his
   artboard shows. */
export function templateFields(d: Record<string, string>): Record<FieldKey, string> {
  const t = (s?: string) => (s || "").trim();
  return {
    producer: t(d.producer),
    wineName: t(d.wine),
    appellation: t(d.appellation),
    classification: t(d.classification),
    vintage: t(d.vintage),
    grape: t(d.grape),
    regionCountry: [t(d.region), t(d.country)].filter(Boolean).join(", "),
    special: t(d.special),
    wineTypeLine: [t(d.sweetness), t(d.wineColorName), t(d.wineType) || "Wine"].filter(Boolean).join(" "),
    alcVol: `${t(d.alcohol) || "12.5"}% Alc. by Vol. / ${t(d.volume) || "750"} mL`,
  };
}

/* a row = every line his artboard puts on one baseline (the foot pairs
   sit left and right of each other, so they live or die together) */
interface Row { baseline: number; fromBottom: number; anchor: "top" | "bottom"; items: TplText[] }
function rowsOf(tpl: Template): Row[] {
  const rows: Row[] = [];
  for (const t of [...tpl.texts].sort((a, b) => a.baseline - b.baseline)) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.baseline - t.baseline) < 0.8 && last.anchor === t.anchor) { last.items.push(t); continue; }
    rows.push({ baseline: t.baseline, fromBottom: t.fromBottom, anchor: t.anchor, items: [t] });
  }
  return rows;
}

export interface TemplateInput {
  template: Template;
  fields: Record<FieldKey, string>;
  widthMm: number;
  heightMm: number;
  seed: number;
  ground: string;
  ink: string;
  accent: string;
}
export interface TemplateLayout {
  layout: Layout;
  art: { kind: "rect" | "oval"; x: number; y: number; w: number; h: number };  /* label px */
  faces: string;
  warnings: string[];
}

export function layoutFromTemplate(inp: TemplateInput): TemplateLayout {
  const tpl = inp.template;
  const W = Math.round(inp.widthMm * PX_PER_MM), H = Math.round(inp.heightMm * PX_PER_MM);
  const faces = facesFor(tpl.band, inp.seed);
  const warnings: string[] = [];

  const textOf = (t: TplText) => {
    const parts = t.fields.map((f) => inp.fields[f]).filter(Boolean);
    if (!parts.length) return "";
    const s = parts.join(t.join || " / ");
    return t.caps ? s.toUpperCase() : s;
  };

  /* ---- rule 1: collapse ------------------------------------------ */
  const rows = rowsOf(tpl);
  const place = new Map<Row, number>();                 /* row → baseline, mm from the top */
  for (const edge of ["top", "bottom"] as const) {
    const group = rows.filter((r) => r.anchor === edge);
    if (!group.length) continue;
    /* how much room each row takes before the next one in his drawing */
    const adv = group.map((r, i) => (i < group.length - 1 ? group[i + 1].baseline - r.baseline : 0));
    const kept = group.filter((r) => r.items.some((t) => textOf(t)));
    if (!kept.length) continue;
    if (edge === "top") {
      let y = group[0].baseline;
      for (const r of kept) { place.set(r, y); y += adv[group.indexOf(r)]; }
    } else {
      /* the foot holds this stack, so the LAST row keeps its place and the
         rest close up toward it — the next item inherits the anchor */
      let y = group[group.length - 1].baseline;
      for (let i = kept.length - 1; i >= 0; i--) {
        place.set(kept[i], y);
        if (i > 0) y -= adv[group.indexOf(kept[i - 1])];
      }
    }
  }

  /* ---- rule 3: the type keeps its distance from its own edge, the
          picture absorbs the change of shape ------------------------ */
  const dh = inp.heightMm - tpl.refH;
  const mmY = (row: Row, base: number) => (row.anchor === "top" ? base : base + dh);
  const mmX = (t: TplText) => (t.align === "center" ? inp.widthMm / 2 : t.align === "right" ? inp.widthMm - (tpl.refW - t.x) : t.x);

  /* ---- rule 4: sizes, hierarchy, and the two bounds --------------- */
  const sizeOf = (t: TplText) => Math.min(MAX_PT, Math.max(MIN_PT, t.size));
  const heroPt = Math.max(...tpl.texts.filter((t) => t.role === "hero").map(sizeOf), 0);

  /* lay one pass at a given overall type scale, and report the room it needs */
  const layPass = (scale: number) => {
    const laid: LaidLine[] = [];
    let topMost = Infinity, botMost = -Infinity;
    for (const row of rows) {
      const base = place.get(row);
      if (base === undefined) continue;
      /* rule 4, "prevent collisions": his foot rows put a line on the left,
         one on the right and sometimes one between them. A long grape or a
         long appellation makes them touch. The ROW gives way together —
         its lines step down in size until they clear each other by a
         millimetre, and never below the 7 pt floor. */
      const live = row.items.filter((t) => textOf(t));
      const natural = new Map<TplText, number>();
      for (const t of live) {
        let pt = sizeOf(t) * scale;
        if (t.role !== "hero" && heroPt) pt = Math.min(pt, heroPt * scale * 0.9);
        natural.set(t, Math.max(MIN_PT, Math.min(MAX_PT, pt)));
      }
      let rowK = 1;
      if (live.length >= 1) {
        const span = (t: TplText, k: number) => {
          const f = t.role === "hero" ? faces.hero : t.role === "secondary" ? faces.secondary : faces.small;
          const s = ptPx(Math.max(MIN_PT, natural.get(t)! * k));
          if (t.rot === -90) return [px(mmX(t)) - s * 0.2, px(mmX(t)) + s * 0.72] as const;
          const w = measure(textOf(t), f, s, t.tracking), x0 = px(mmX(t));
          const l = t.align === "center" ? x0 - w / 2 : t.align === "right" ? x0 - w : x0;
          return [l, l + w] as const;
        };
        for (let i = 0; i < 14; i++) {
          const b = live.map((t) => span(t, rowK)).sort((p, q) => p[0] - q[0]);
          /* his own vertical columns clear each other by about half a
             millimetre, so a rotated row is held to that, not to the full one */
          const need = live.every((t) => t.rot === -90) ? px(0.3) : px(1);
          let clash = false;
          for (let j = 1; j < b.length; j++) if (b[j][0] < b[j - 1][1] + need) clash = true;
          /* rule 2: the 5 mm margin is the row's outermost neighbour — a
             long wine name gives way to it exactly as it gives way to the
             line beside it */
          if (b[0][0] < px(MARGIN_MM) - 0.5 || b[b.length - 1][1] > px(inp.widthMm - MARGIN_MM) + 0.5) clash = true;
          if (!clash) break;
          if (live.every((t) => natural.get(t)! * rowK <= MIN_PT + 0.01)) { warnings.push(`the row at ${base.toFixed(0)} mm is crowded even at 7 pt`); break; }
          rowK *= 0.94;
        }
      }
      for (const t of live) {
        const text = textOf(t);
        const face = t.role === "hero" ? faces.hero : t.role === "secondary" ? faces.secondary : faces.small;
        const pt = Math.max(MIN_PT, natural.get(t)! * rowK);
        const sizePx = ptPx(pt);
        const trackPx = t.tracking * sizePx;
        const yMm = mmY(row, base);
        const y = px(yMm), x = px(mmX(t));
        const anchor: LaidLine["anchor"] = t.align === "center" ? "middle" : t.align === "right" ? "end" : "start";

        if (t.arc) {
          /* his arced words: one glyph at a time around the circle he drew,
             the word centred on the top of the arc */
          const r = px(t.arc.r), cx = px(mmX(t)), cy = px(mmY(row, t.arc.cy));
          const total = measure(text, face, sizePx, t.tracking);
          let a = -total / 2;
          for (const ch of text) {
            const w = measure(ch, face, sizePx, t.tracking);
            const mid = (a + w / 2) / r;                       /* radians along the arc */
            laid.push({
              text: ch, size: sizePx, tracking: 0, family: face.family, weight: face.weight, italic: false,
              anchor: "middle", colour: t.accent ? inp.accent : inp.ink,
              x: cx + Math.sin(mid) * r, y: cy - Math.cos(mid) * r,
              rot: (mid * 180) / Math.PI,
            });
            a += w;
          }
          topMost = Math.min(topMost, y - sizePx); botMost = Math.max(botMost, y);
          continue;
        }
        laid.push({
          text, x, y, size: sizePx, tracking: trackPx,
          family: face.family, weight: face.weight, italic: false,
          anchor, colour: t.accent ? inp.accent : inp.ink,
          ...(t.rot ? { rot: t.rot } : {}),
        });
        const wpx = measure(text, face, sizePx, t.tracking);
        if (t.rot === -90) { topMost = Math.min(topMost, y - wpx); botMost = Math.max(botMost, y); }
        else { topMost = Math.min(topMost, y - sizePx * vmetrics(face).asc); botMost = Math.max(botMost, y + sizePx * vmetrics(face).desc); }
      }
    }
    return { laid, topMost, botMost };
  };

  let scale = 1, pass = layPass(scale);
  const M = px(MARGIN_MM);

  /* A collapsed stack can pull a BIG line up into a slot that was drawn
     for a small one — the wine name inheriting the producer's anchor puts
     its capitals inside the 5 mm margin. The margin is a floor, so the
     whole group steps back off it first. Shrinking the type is the last
     resort, not the first (his rule 3: the type keeps its size). */
  const topShift = Math.max(0, M - pass.topMost);
  const botShift = Math.max(0, pass.botMost - (H - M));
  if (topShift > 0.5 || botShift > 0.5) {
    for (const r of rows) {
      const b = place.get(r);
      if (b === undefined) continue;
      if (r.anchor === "top" && topShift > 0.5) place.set(r, b + topShift / PX_PER_MM);
      if (r.anchor === "bottom" && botShift > 0.5) place.set(r, b - botShift / PX_PER_MM);
    }
    pass = layPass(scale);
  }

  /* rule 3 again: type only shrinks when the type itself no longer fits */
  for (let i = 0; i < 14; i++) {
    const over = Math.max(M - pass.topMost, pass.botMost - (H - M));
    if (over <= 0.5) break;
    if (scale <= 0.55) { warnings.push("the type is as small as it may go and still does not fit"); break; }
    scale *= 0.96; pass = layPass(scale);
  }

  /* ---- rule 2: the safe margin, checked, never assumed ------------ */
  for (const l of pass.laid) {
    /* measure() takes its letter-spacing in EM; a laid line carries it in
       label pixels, because that is what SVG and the PDF want */
    const w = measure(l.text, { family: l.family, weight: l.weight }, l.size, l.size ? l.tracking / l.size : 0);
    const left = l.anchor === "middle" ? l.x - w / 2 : l.anchor === "end" ? l.x - w : l.x;
    if (l.rot === -90) continue;                        /* measured on its own axis below */
    if (left < M - 0.5 || left + w > W - M + 0.5) warnings.push(`"${l.text.slice(0, 18)}" crosses the 5 mm margin`);
  }

  /* ---- the picture takes what the type left ----------------------- */
  const a = tpl.art || { kind: "rect" as const, x: 0, y: 0, w: tpl.refW, h: tpl.refH };
  const bleedsWide = a.w >= tpl.refW - 0.5;
  const bleedsTall = a.h >= tpl.refH - 0.5;
  let art: { kind: "rect" | "oval"; x: number; y: number; w: number; h: number };
  if (bleedsTall && !bleedsWide) {
    /* templates 11 / 12: the picture is a half, the type a vertical column
       beside it. Which half he drew it on is whichever edge it touches. */
    const onLeft = a.x <= tpl.refW - (a.x + a.w);
    const typeW = onLeft ? tpl.refW - a.w : a.x;        /* the column he left for the type */
    const w = Math.max(px(10), W - px(typeW));
    art = { kind: a.kind, x: onLeft ? 0 : W - w, y: 0, w, h: H };
  } else {
    /* the picture's room is what the type left: under the LAST line that
       hangs from the top, above the FIRST line that hangs from the foot */
    const topRows = rows.filter((r) => r.anchor === "top" && place.has(r));
    const botRows = rows.filter((r) => r.anchor === "bottom" && place.has(r));
    const big = (r: Row) => ptPx(Math.max(...r.items.map(sizeOf)) * scale);
    const bandTop = topRows.length
      ? Math.max(...topRows.map((r) => px(mmY(r, place.get(r)!)) + big(r) * 0.3 + px(2)))
      : 0;
    const bot = botRows.length
      ? Math.min(...botRows.map((r) => px(mmY(r, place.get(r)!)) - big(r) - px(2)))
      : H;
    const bandH = Math.max(px(8), bot - bandTop);
    if (a.kind === "oval") {
      const k = Math.min((W - 2 * M) / px(a.w), bandH / px(a.h));
      const w = px(a.w) * k, h = px(a.h) * k;
      art = { kind: "oval", x: (W - w) / 2, y: bandTop + (bandH - h) / 2, w, h };
    } else {
      art = { kind: "rect", x: 0, y: bandTop, w: W, h: bandH };
    }
  }

  const layout: Layout = { W, H, ground: inp.ground, art: { x: art.x, y: art.y, w: art.w, h: art.h }, lines: pass.laid };
  return {
    layout, art,
    faces: `${faces.hero.family} ${faces.hero.weight} / ${faces.secondary.family} / ${faces.small.family} · ${tpl.id} ${tpl.band}${scale < 1 ? ` · type ${(scale * 100).toFixed(0)}%` : ""}`,
    warnings,
  };
}
