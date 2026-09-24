import { measure, vmetrics, inkExtent, mix, type Face } from "./fonts";
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
  bold?: boolean;                /* his weight, read off the face he set it in */
  sample?: string;               /* his own words on the artboard */
  arc?: { cx: number; cy: number; r: number; up: boolean; sweep?: number };
}
export interface Template {
  id: string;
  band: Band;
  refW: number; refH: number;
  art: { kind: "rect" | "oval"; x: number; y: number; w: number; h: number } | null;
  texts: TplText[];
}

/* THREE SHAPES OF PICTURE (owner, 2026-09-22, with his diagram).

   The dashed rectangle on his sheet is the LABEL'S TRIM. The pale area
   around it is bleed. So a picture is not a rectangle cut to fit a slot:
   it is a painting with a ragged painted edge, drawn LARGER than the
   label, which runs off the trim on the sides it is meant to bleed from
   and shows its own edge on the side that faces the type.

   One painting serves every layout of its shape, which is why a
   variation costs nothing:

     spot   the painting stays inside the trim, floating on the paper
     band   a wide picture across the label — top, middle or foot
     panel  a tall picture down one side, the type set vertically beside it
*/
export type ArtKind = "spot" | "band" | "panel";
export function artKindOf(t: Template): ArtKind {
  const a = t.art;
  if (!a) return "band";
  const E = 0.5;
  const top = a.y <= E, bottom = a.y + a.h >= t.refH - E;
  const left = a.x <= E, right = a.x + a.w >= t.refW - E;
  if (!top && !bottom && !left && !right) return "spot";
  if (top && bottom && !(left && right)) return "panel";
  return "band";
}
/* which edges of the label this picture runs off */
export function bleedsOf(t: Template) {
  const a = t.art, E = 0.5;
  if (!a) return { top: true, bottom: true, left: true, right: true };
  return { top: a.y <= E, bottom: a.y + a.h >= t.refH - E, left: a.x <= E, right: a.x + a.w >= t.refW - E };
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
/* A FAMILY SET is one family with three weights that EXIST as files in
   public/fonts/labels — text, a middle for the second rank, and a bold.
   A label picks ONE of these and sets everything in it. */
interface FamilySet { family: string; text: number; mid: number; bold: number }
/* the display faces the wine NAME may step out into — one family, one
   weight, and only when the seed says so */
interface Pool { sets: FamilySet[]; display: Face[] }
export const BAND_FACES: Record<Band, Pool> = {
  classical: {
    sets: [
      { family: "EB Garamond", text: 400, mid: 500, bold: 700 },
      { family: "Cormorant Garamond", text: 500, mid: 600, bold: 600 },
      { family: "Tinos", text: 400, mid: 400, bold: 700 },
    ],
    display: [{ family: "Playfair Display", weight: 700 }, { family: "Cinzel", weight: 600 }, { family: "Prata", weight: 400 }, { family: "Marcellus", weight: 400 }],
  },
  contemporary: {
    sets: [
      { family: "Archivo", text: 400, mid: 500, bold: 700 },
      { family: "Jost", text: 400, mid: 500, bold: 600 },
    ],
    display: [{ family: "Anton", weight: 400 }, { family: "Bebas Neue", weight: 400 }, { family: "Archivo", weight: 800 }],
  },
  free: {
    sets: [
      { family: "Archivo", text: 400, mid: 500, bold: 700 },
      { family: "Jost", text: 400, mid: 500, bold: 600 },
    ],
    display: [{ family: "Permanent Marker", weight: 400 }, { family: "Caveat", weight: 700 }, { family: "Bebas Neue", weight: 400 }],
  },
};

/* ONE FAMILY A LABEL (owner, 2026-09-22, twice: "use one font family per
   label"). Not one plus a display face for the name — ONE. Size, weight
   and colour carry the whole hierarchy, which is how a wine label has
   always been set. */
export function facesFor(band: Band, seed: number): { hero: Face; secondary: Face; small: Face } {
  const p = BAND_FACES[band];
  const set = p.sets[mix(seed, 13) % p.sets.length];
  return {
    hero: { family: set.family, weight: set.bold },
    secondary: { family: set.family, weight: set.mid },
    small: { family: set.family, weight: set.text },
  };
}

/* every face a band can choose must EXIST as a file — a missing weight
   renders as the wrong font or as tofu, silently. Called by the preview
   tool and by the tests so it is never a surprise on a customer's label. */
export function facesInUse(): Face[] {
  const out: Face[] = [];
  for (const p of Object.values(BAND_FACES)) {
    for (const s2 of p.sets) for (const w of [s2.text, s2.mid, s2.bold]) out.push({ family: s2.family, weight: w });
  }
  return out.filter((f, i) => out.findIndex((g) => g.family === f.family && g.weight === f.weight) === i);
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
  const W = Math.round(inp.widthMm * PX_PER_MM), H = Math.round(inp.heightMm * PX_PER_MM);
  const faces = facesFor(inp.template.band, inp.seed);
  const warnings: string[] = [];

  const textOf = (t: TplText) => {
    const parts = t.fields.map((f) => inp.fields[f]).filter(Boolean);
    if (!parts.length) return "";
    const s = parts.join(t.join || " / ");
    return t.caps ? s.toUpperCase() : s;
  };
  /* ONE family, in HIS weights (owner, 2026-09-23: "one family, different
     weights, as on my artboards") — a line he set bold is bold, the rest
     are the family's text weight */
  const faceOf = (t: TplText): Face => t.bold === undefined
    ? (t.role === "hero" ? faces.hero : t.role === "secondary" ? faces.secondary : faces.small)
    : t.bold ? faces.hero : faces.small;

  /* THE VERTICAL TEMPLATES WITH FEW WORDS (owner, 2026-09-23, on t12 with
     only a name, a vintage and the legal line: he made the vintage small,
     plain and black, and stood it in the legal line's column). With
     nothing but the name and the small print, a big red vintage above the
     name is a second hero; it becomes small print, centred where the big
     one stood. */
  const tpl: Template = (() => {
    const t0 = inp.template;
    if (!t0.texts.some((t) => t.rot === -90)) return t0;
    const present = (Object.keys(inp.fields) as FieldKey[]).filter((k) => inp.fields[k]);
    const few = new Set<FieldKey>(["wineName", "vintage", "wineTypeLine", "alcVol"]);
    if (!present.includes("vintage") || present.some((k) => !few.has(k))) return t0;
    const vin = t0.texts.find((t) => t.fields.includes("vintage") && t.rot === -90);
    const legal = t0.texts.find((t) => t.fields.includes("alcVol") && t.rot === -90);
    if (!vin || !legal || vin === legal) return t0;
    const text = textOf(vin);
    const lenOld = measure(text, faceOf(vin), ptPx(vin.size), vin.tracking) / PX_PER_MM;
    const small: TplText = { ...vin, size: legal.size, bold: legal.bold ?? false, accent: false, tracking: legal.tracking, x: legal.x };
    const lenNew = measure(text, faceOf(small), ptPx(small.size), small.tracking) / PX_PER_MM;
    small.baseline = vin.baseline - lenOld / 2 + lenNew / 2;
    small.fromBottom = t0.refH - small.baseline;
    return { ...t0, texts: t0.texts.map((t) => (t === vin ? small : t)) };
  })();

  /* NO ORPHANS (owner, 2026-09-23, on two labels of one run). A row of
     his that holds places at the edges keeps them only when they are
     filled; one element left alone at an edge looks forgotten:
       · the row has an empty CENTRE place → the orphan moves into it
         ("Vendemmia Manuale" alone at the left of t05's foot, while
         everything else is centred and the centre of its row is empty);
       · the row has no centre place → EDGE GRAVITY: a small line standing
         alone in the middle of the row just inside it comes out to the
         empty edge place and takes that place's size ("Sangiovese", small
         in the middle of t02, joins "Vendemmia Manuale" on its row, at the
         right — a touch bigger). */
  const tplN: Template = (() => {
    const has = (t: TplText) => !!textOf(t);
    const flat = (t: TplText) => !t.rot && !t.arc;
    const rows: TplText[][] = [];
    for (const t of tpl.texts.filter(flat)) {
      const r = rows.find((g) => g[0].anchor === t.anchor && Math.abs(g[0].baseline - t.baseline) < 0.6);
      if (r) r.push(t); else rows.push([t]);
    }
    const moved = new Map<TplText, TplText>();
    const gone = new Set<TplText>();
    for (const row of rows) {
      const live = row.filter(has);
      if (live.length !== 1 || live[0].align === "center") continue;
      const lone = live[0];
      const centre = row.find((t) => t.align === "center" && !has(t));
      if (centre) { moved.set(lone, { ...lone, x: tpl.refW / 2, align: "center" }); continue; }
      const opp = row.find((t) => t !== lone && !has(t) && t.align !== lone.align && t.align !== "center");
      if (!opp) continue;
      /* the row just inside this one (toward the middle of the label) */
      const inward = rows
        .filter((g) => g !== row && g[0].anchor === row[0].anchor)
        .filter((g) => row[0].anchor === "bottom" ? g[0].baseline < row[0].baseline : g[0].baseline > row[0].baseline)
        .sort((a, b) => Math.abs(a[0].baseline - row[0].baseline) - Math.abs(b[0].baseline - row[0].baseline))[0];
      if (!inward || Math.abs(inward[0].baseline - row[0].baseline) > 8) continue;
      const inLive = inward.filter(has);
      const cand = inLive.length === 1 && inLive[0].align === "center" && inLive[0].role === "small" ? inLive[0] : null;
      if (!cand || moved.has(cand) || gone.has(cand)) continue;
      moved.set(cand, { ...cand, x: opp.x, align: opp.align, baseline: row[0].baseline, fromBottom: tpl.refH - row[0].baseline, anchor: row[0].anchor, size: Math.max(opp.size, cand.size) });
    }
    if (!moved.size) return tpl;
    return { ...tpl, texts: tpl.texts.filter((t) => !gone.has(t)).map((t) => moved.get(t) || t) };
  })();

  /* ---- HIS ARTBOARD IS THE MEASURE (owner, 2026-09-23, laying the
     engine's labels over his own: "the text runs onto the picture, the
     lines are far apart — compare it with my reference, where and how
     big"). With his words, at his size, the label IS his artboard: every
     line on his baseline, at his size, in his weight. The engine only
     moves a line when it must —
       a row is empty      → the rows beyond it close up toward their
                              edge, each keeping its own gap (rule 1);
       a text is too long  → its row steps down in size, to 7 pt at most;
       two lines' INK would touch → the later one steps away, and only
                              that one and those beyond it.
     The collision test is on the letters' real outlines and only between
     lines that share some width. It used to treat every row as a band
     across the whole label, so his vintage in the middle of the foot
     "hit" the line above it on the left, and every row was pushed up a
     millimetre or two until the name sat in the picture. */
  const rows0 = rowsOf(tplN);
  const hisPt = (r: Row) => Math.max(...r.items.map((t) => t.size));
  const hisMm = (r: Row) => hisPt(r) * PT_MM;
  /* THE AIR BETWEEN ROWS IS HIS WHITE SPACE, not his baseline step
     (owner, 2026-09-23: on a long name that had to shrink he pulled the
     name up to the producer; with rows missing he pulled the name down to
     the small print). What he draws is the paper between one row's letters
     and the next row's, so that is what is kept: from the foot of a row's
     letters (DESC of its size) to the top of the next row's capitals (ASC
     of its size). At his sizes this gives back his baselines exactly; when
     a row is set smaller, or the next row is gone, the rows stay the same
     distance apart AS THE EYE SEES IT. */
  const ASC = 0.7, DESC = 0.2;
  const gapAfter = new Map<Row, number>();
  for (const edge of ["top", "bottom"] as const) {
    const g = rows0.filter((r) => r.anchor === edge);
    for (let i = 0; i < g.length - 1; i++) gapAfter.set(g[i], (g[i + 1].baseline - g[i].baseline) - DESC * hisMm(g[i]) - ASC * hisMm(g[i + 1]));
  }
  /* a line that the engine joined or split from his, and the lines of his
     it came from — so the picture's zone still knows whose room it is */
  const originOf = new Map<TplText, TplText[]>();

  /* ---- across the label: his margins, his centring ---------------- */
  const xShift = new Map<TplText, number>();     /* vertical columns, closed up */
  const mmX = (t: TplText) => {
    const moved = xShift.get(t);
    if (moved !== undefined) return moved;
    /* the vertical columns of templates 11 and 12 keep their distance
       from the edge the type lives on */
    if (t.rot === -90) {
      const fromRight = tpl.refW - t.x;
      return t.x <= fromRight ? t.x : inp.widthMm - fromRight;
    }
    return t.align === "center" ? inp.widthMm / 2 + (t.x - tpl.refW / 2) : t.align === "right" ? inp.widthMm - (tpl.refW - t.x) : t.x;
  };

  /* ---- rule 4: sizes, hierarchy, and the two bounds --------------- */
  const sizeOf = (t: TplText) => Math.min(MAX_PT, Math.max(MIN_PT, t.size));

  /* his arced words: one glyph at a time around his circle, the word
     centred on its top; a long word is held to a 140-degree sweep and
     steps down in size to fit it */
  /* his arced words are spaced by where he put each letter: spread HIS
     sample over HIS sweep, and the customer's words keep that spacing */
  const arcTrack = (t: TplText, face: Face) => {
    const sample = t.sample || "", n = [...sample].length;
    if (!t.arc?.sweep || n < 2) return t.tracking;
    const s = ptPx(sizeOf(t)), r = px(t.arc.r);
    const natural = [...sample].reduce((w, ch) => w + measure(ch, face, s), 0);
    return Math.max(0, (t.arc.sweep * Math.PI / 180 * r - natural) / ((n - 1) * s));
  };
  const arcGlyphs = (t: TplText, text: string, face: Face, sizePx: number, cx: number, cy: number) => {
    const r = px(t.arc!.r);
    const track = arcTrack(t, face);
    const total = measure(text, face, sizePx, track);
    const out: { ch: string; x: number; y: number; w: number; rot: number }[] = [];
    let a = -total / 2;
    for (const [n, ch] of [...text].entries()) {
      /* each letter carries his letter-spacing — measured one glyph at a
         time it had none, and his spaced GRAND VIN closed up on the arc */
      const w = measure(ch, face, sizePx) + (n < [...text].length - 1 ? track * sizePx : 0);
      const mid = (a + measure(ch, face, sizePx) / 2) / r;
      out.push({ ch, x: cx + Math.sin(mid) * r, y: cy - Math.cos(mid) * r, w, rot: (mid * 180) / Math.PI });
      a += w;
    }
    return out;
  };

  const arcSize = (t: TplText, text: string, face: Face, sizePx: number) => {
    const r = px(t.arc!.r), MAX_SWEEP = (140 * Math.PI) / 180;
    /* a long word on his circle reaches further out AND further down; it
       steps down in size until it sits inside the 5 mm margin */
    const fits = (s: number) => {
      if (measure(text, face, s, arcTrack(t, face)) > r * MAX_SWEEP) return false;
      const gl = arcGlyphs(t, text, face, s, px(mmX(t)), 0);
      return Math.min(...gl.map((g) => g.x - g.w / 2)) >= px(MARGIN_MM) - 0.5 && Math.max(...gl.map((g) => g.x + g.w / 2)) <= W - px(MARGIN_MM) + 0.5;
    };
    let s = sizePx;
    while (!fits(s) && s > ptPx(MIN_PT)) s = Math.max(ptPx(MIN_PT), s * 0.96);
    if (!fits(s)) warnings.push(`the arced "${text.slice(0, 18)}" is too long for this label even at 7 pt`);
    return s;
  };
  /* where a line's ink lies across the label, at a given size */
  const spanOf = (t: TplText, sizePx: number) => {
    /* a line turned on its side (-90, read upward) is as wide as its type
       is tall, and its letters' TOPS face LEFT: the ink runs from the
       baseline leftward by the ascent, rightward by the descent. This was
       mirrored, and his columns "collided" and shrank to 7 pt. */
    if (t.rot === -90) { const e = inkExtent(textOf(t), faceOf(t), sizePx); return [px(mmX(t)) - e.up, px(mmX(t)) + e.down] as const; }
    const w = measure(textOf(t), faceOf(t), sizePx, t.tracking), x0 = px(mmX(t));
    const l = t.align === "center" ? x0 - w / 2 : t.align === "right" ? x0 - w : x0;
    return [l, l + w] as const;
  };
  const clashes = (items: TplText[], size: (t: TplText) => number, need: number) => {
    const b = items.filter((t) => !t.arc).map((t) => spanOf(t, size(t))).sort((p2, q) => p2[0] - q[0]);
    for (let j = 1; j < b.length; j++) if (b[j][0] < b[j - 1][1] + need) return true;
    return b.length > 0 && (b[0][0] < px(MARGIN_MM) - 0.5 || b[b.length - 1][1] > px(inp.widthMm - MARGIN_MM) + 0.5);
  };

  /* A ROW THAT CANNOT FIT JOINS, IT DOES NOT OVERLAP (owner, 2026-09-23,
     on a narrow label: "Vieilles Vignes / Bordeaux, France" and "Dry Red
     Wine / 13.5% Alc. by Vol. / 750 mL" each as ONE line). When a line on
     the left and one on the right cannot stand beside each other — or
     beside the line between them — even at 7 pt, the pair becomes one line
     joined by a slash, in the plain weight, and whatever stood between
     them follows on its own line under it. The joined line is centred on
     a centred label and stays on the left edge of a left-set one. */
  const heroCentred = tpl.texts.some((t) => t.fields.includes("wineName") && t.align === "center");
  const splitRows = (src: Row[]): Row[] => {
    const out: Row[] = [];
    for (const row of src) {
      const live = row.items.filter((t) => textOf(t));
      if (live.length < 2 || live.some((t) => t.rot === -90)) { out.push(row); continue; }
      if (!clashes(live, () => ptPx(MIN_PT), px(1))) { out.push(row); continue; }
      const left = live.find((t) => t.align === "left"), right = live.find((t) => t.align === "right");
      const mid = live.find((t) => t.align === "center");
      if (!left || !right) { out.push(row); continue; }
      const centred = !!mid || heroCentred;
      const joined: TplText = {
        ...left, fields: [...left.fields, ...right.fields], join: " / ",
        align: centred ? "center" : "left", x: centred ? tpl.refW / 2 : left.x,
        size: Math.min(left.size, right.size), bold: false,
        accent: left.accent && right.accent, caps: left.caps && right.caps, sample: undefined,
      };
      /* and if even the joined line cannot fit at 7 pt, the two keep
         their own sides and go on two lines of their own */
      const g0 = gapAfter.get(row) ?? 0.5 * hisMm(row);
      if (clashes([joined], () => ptPx(MIN_PT), px(1))) {
        const r1: Row = { baseline: row.baseline - 0.02, fromBottom: row.fromBottom, anchor: row.anchor, items: [left] };
        const r2: Row = { baseline: row.baseline - 0.01, fromBottom: row.fromBottom, anchor: row.anchor, items: [right] };
        gapAfter.set(r1, 0.35 * hisMm(row)); gapAfter.set(r2, g0);
        out.push(r1, r2);
      } else {
        originOf.set(joined, [left, right]);
        const pair: Row = { baseline: row.baseline - 0.01, fromBottom: row.fromBottom, anchor: row.anchor, items: [joined] };
        gapAfter.set(pair, g0);
        out.push(pair);
      }
      if (mid) {
        const midRow: Row = { ...row, items: [mid] };
        if (gapAfter.has(row)) gapAfter.set(midRow, gapAfter.get(row)!);
        out.push(midRow);
      }
    }
    return out;
  };

  interface Item { t: TplText; face: Face; size: number; span: readonly [number, number]; up: number; down: number }
  interface Placed { row: Row; base: number; items: Item[]; up: number; down: number; setMm: number }
  /* one item's ink above/below ITS OWN baseline, and across */
  const extentOf = (t: TplText, face: Face, sizePx: number): Omit<Item, "t" | "face" | "size"> => {
    const text = textOf(t);
    if (t.rot === -90) return { span: spanOf(t, sizePx), up: measure(text, face, sizePx, t.tracking), down: sizePx * 0.05 };
    if (t.arc) {
      const cy = px(t.arc.cy - t.baseline);                /* relative to the baseline */
      const gl = arcGlyphs(t, text, face, sizePx, px(mmX(t)), cy);
      let up = 0, down = 0, l = Infinity, r = -Infinity;
      for (const g of gl) {
        const e = inkExtent(g.ch, face, sizePx);
        up = Math.max(up, -(g.y - e.up)); down = Math.max(down, g.y + e.down);
        l = Math.min(l, g.x - g.w / 2); r = Math.max(r, g.x + g.w / 2);
      }
      return { span: [l, r], up, down };
    }
    const e = inkExtent(text, face, sizePx);
    return { span: spanOf(t, sizePx), up: e.up, down: e.down };
  };

  const layPass = (scale: number) => {
    const rows = splitRows(rows0);
    const placed: Placed[] = [];
    const sizes = new Map<TplText, number>();
    for (const row of rows) {
      /* rule 4, "prevent collisions": a row whose lines would touch steps
         down in size together, never below the 7 pt floor */
      const live = row.items.filter((t) => textOf(t));
      if (!live.length) continue;
      const natural = new Map<TplText, number>();
      for (const t of live) {
        /* his sizes ARE his hierarchy — on template 11 his vintage is
           larger than his name, and that is his to decide */
        const pt = sizeOf(t) * scale;
        natural.set(t, Math.max(MIN_PT, Math.min(MAX_PT, pt)));
      }
      let rowK = 1;
      const need = px(1);
      for (let i = 0; i < 40 && !live.every((t) => t.rot === -90); i++) {
        if (!clashes(live, (t) => ptPx(Math.max(MIN_PT, natural.get(t)! * rowK)), need)) break;
        if (live.every((t) => natural.get(t)! * rowK <= MIN_PT + 0.01)) { warnings.push("a row is crowded even at 7 pt"); break; }
        rowK *= 0.94;
      }
      for (const t of live) {
        let sPx = ptPx(Math.max(MIN_PT, natural.get(t)! * rowK));
        if (t.arc) sPx = arcSize(t, textOf(t), faceOf(t), sPx);
        sizes.set(t, sPx);
      }
      placed.push({ row, base: row.baseline, items: [], up: 0, down: 0, setMm: Math.max(...live.map((t) => sizes.get(t)!)) / PX_PER_MM });
    }

    /* ---- his vertical columns (templates 11 / 12) -------------------
       Each column keeps HIS distance from the column before it, counted
       outward from the edge the type lives on. An empty column takes its
       step with it, so the ones beyond close up toward the edge (rule 1).
       A column only steps further out if its ink would touch the one
       before it. A line of his standing in a column (the vintage above
       the name) moves with that column. */
    for (const { row } of placed) {
      const all = row.items.filter((t) => t.rot === -90).sort((a, b2) => a.x - b2.x);
      if (all.length < 2) continue;
      const onLeft = all[0].x <= tpl.refW - all[all.length - 1].x;
      const order = onLeft ? all : [...all].reverse();     /* outwards from the edge */
      const dir = onLeft ? 1 : -1;
      const home = (t: TplText) => (onLeft ? t.x : inp.widthMm - (tpl.refW - t.x));
      let prev: { x: number; inner: number } | null = null;
      for (let k = 0; k < order.length; k++) {
        const t = order[k];
        if (!textOf(t)) continue;
        const e = inkExtent(textOf(t), faceOf(t), sizes.get(t)!);
        const outer = (onLeft ? e.up : e.down) / PX_PER_MM;   /* ink toward the edge */
        const inner = (onLeft ? e.down : e.up) / PX_PER_MM;   /* ink toward the picture */
        let x: number = prev === null ? home(order[0]) : prev.x + dir * Math.abs(t.x - order[k - 1].x);
        if (prev && dir * (x - prev.x) < 0) x = prev.x;
        if (prev) { const need = prev.inner + 0.3 + outer; if (dir * (x - prev.x) < need) x = prev.x + dir * need; }
        xShift.set(t, x);
        prev = { x, inner };

      }
      const moved = new Map(order.filter((t) => xShift.has(t)).map((t) => [t, xShift.get(t)! - home(t)]));
      for (const other of tplN.texts) {
        if (other.rot !== -90 || row.items.includes(other)) continue;
        const twin = [...moved.keys()].find((t) => Math.abs(t.x - other.x) < 0.6);
        if (twin) xShift.set(other, home(other) + moved.get(twin)!);
      }
    }

    /* ---- every line's real ink, relative to its row's baseline ------ */
    for (const p of placed) {
      for (const t of p.row.items.filter((x) => textOf(x))) {
        const face = faceOf(t), size = sizes.get(t)!;
        const off = (t.baseline - p.row.baseline) * PX_PER_MM;   /* he may set a line a hair off the row */
        const e = extentOf(t, face, size);
        p.items.push({ t, face, size, span: e.span, up: e.up - off, down: e.down + off });
      }
      p.up = Math.max(...p.items.map((i) => i.up));
      p.down = Math.max(...p.items.map((i) => i.down));
    }

    /* ---- the stack, from HIS proportions ---------------------------
       At his size every gap is his gap exactly; an empty row takes its
       own advance with it and the rest close up toward the edge. */
    for (const edge of ["top", "bottom"] as const) {
      const g = placed.filter((p2) => p2.row.anchor === edge);
      if (!g.length) continue;
      const all = rows.filter((r) => r.anchor === edge);
      /* a row of turned (vertical) lines has no capitals above it: it
         keeps his baseline, not his cap line */
      const turned = (p2: Placed) => p2.items.every((i) => i.t.rot === -90);
      const gap = (p2: Placed) => (gapAfter.get(p2.row) ?? 0.5 * p2.setMm) * scale;
      if (edge === "top") {
        /* the air above his first row's capitals stays his; the first row
           that is set inherits it (rule 1) */
        let y = turned(g[0]) ? all[0].baseline : all[0].baseline - ASC * hisMm(all[0]) + ASC * g[0].setMm;
        y = Math.max(y, MARGIN_MM + g[0].up / PX_PER_MM);
        for (let i = 0; i < g.length; i++) {
          g[i].base = y;
          if (i < g.length - 1) y += DESC * g[i].setMm + gap(g[i]) + ASC * g[i + 1].setMm;
        }
      } else {
        const last = all[all.length - 1];
        const lastSet = g[g.length - 1];
        let y = turned(lastSet) ? inp.heightMm - (tpl.refH - last.baseline)
          : inp.heightMm - (tpl.refH - last.baseline - DESC * hisMm(last)) - DESC * lastSet.setMm;
        y = Math.min(y, inp.heightMm - MARGIN_MM - lastSet.down / PX_PER_MM);
        for (let i = g.length - 1; i >= 0; i--) {
          g[i].base = y;
          if (i > 0) y -= ASC * g[i].setMm + gap(g[i - 1]) + DESC * g[i - 1].setMm;
        }
      }
    }

    /* ---- no line's ink may touch another's ------------------------
       Only lines that share some width are compared, and on the real
       outline of their letters. A line that must move takes the lines
       beyond it along, so a group stays a group. */
    const CLEAR = px(0.4);
    const sharesWidth = (a: Item, b: Item) => a.span[0] < b.span[1] + px(1) && b.span[0] < a.span[1] + px(1);
    for (const edge of ["top", "bottom"] as const) {
      const g = placed.filter((p) => p.row.anchor === edge);
      if (edge === "top") {
        for (let i = 1; i < g.length; i++) {
          let need = -Infinity;
          for (let j = 0; j < i; j++) for (const a of g[j].items) for (const b of g[i].items)
            if (sharesWidth(a, b)) need = Math.max(need, px(g[j].base) + a.down + CLEAR + b.up);
          if (px(g[i].base) < need) { const push = (need - px(g[i].base)) / PX_PER_MM; for (let k = i; k < g.length; k++) g[k].base += push; }
        }
      } else {
        for (let i = g.length - 2; i >= 0; i--) {
          let limit = Infinity;
          for (let j = i + 1; j < g.length; j++) for (const a of g[i].items) for (const b of g[j].items)
            if (sharesWidth(a, b)) limit = Math.min(limit, px(g[j].base) - b.up - CLEAR - a.down);
          if (px(g[i].base) > limit) { const push = (px(g[i].base) - limit) / PX_PER_MM; for (let k = i; k >= 0; k--) g[k].base -= push; }
        }
      }
    }
    /* and the two stacks may not meet in the middle — if they do, the
       type as a whole must get smaller (the loop below) */
    let clash = 0;
    for (const a of placed.filter((p) => p.row.anchor === "top")) for (const b of placed.filter((p) => p.row.anchor === "bottom")) {
      for (const ia of a.items) for (const ib of b.items) {
        if (!sharesWidth(ia, ib)) continue;
        clash = Math.max(clash, (px(a.base) + ia.down + CLEAR) - (px(b.base) - ib.up));
      }
    }

    /* ---- and now set it ------------------------------------------- */
    const laid: LaidLine[] = [];
    let topMost = Infinity, botMost = -Infinity;
    for (const p of placed) {
      for (const it of p.items) {
        const t = it.t, text = textOf(t), face = it.face, sizePx = it.size;
        const baseMm = p.base + (t.baseline - p.row.baseline);
        const y = px(baseMm), x = px(mmX(t));
        const colour = t.accent ? inp.accent : inp.ink;
        topMost = Math.min(topMost, px(p.base) - it.up);
        botMost = Math.max(botMost, px(p.base) + it.down);
        if (t.arc) {
          const cy = px(t.arc.cy + (baseMm - t.baseline));
          for (const g of arcGlyphs(t, text, face, sizePx, x, cy)) {
            laid.push({ text: g.ch, size: sizePx, tracking: 0, family: face.family, weight: face.weight, italic: false, anchor: "middle", colour, x: g.x, y: g.y, rot: g.rot, key: t.fields.join("+") });
          }
          continue;
        }
        laid.push({
          text, x, y, size: sizePx, tracking: t.tracking * sizePx,
          family: face.family, weight: face.weight, italic: false,
          anchor: t.align === "center" ? "middle" : t.align === "right" ? "end" : "start", colour,
          ...(t.rot ? { rot: t.rot } : {}),
          key: t.fields.join("+"),
        });
      }
    }
    return { laid, topMost, botMost, placed, clash };
  };

  let scale = 1, pass = layPass(scale);
  const M = px(MARGIN_MM);
  /* rule 3: type only shrinks when the type itself no longer fits */
  for (let i = 0; i < 14; i++) {
    const over = Math.max(M - pass.topMost, pass.botMost - (H - M), pass.clash);
    if (over <= 0.5) break;
    if (scale <= 0.55) { warnings.push("the type is as small as it may go and still does not fit"); break; }
    scale *= 0.96; pass = layPass(scale);
  }

  /* ---- rule 2: the safe margin, checked, never assumed ------------ */
  for (const l of pass.laid) {
    if (l.rot) continue;                                /* arcs and columns are measured on their own axis */
    const w = measure(l.text, { family: l.family, weight: l.weight }, l.size, l.size ? l.tracking / l.size : 0);
    const left = l.anchor === "middle" ? l.x - w / 2 : l.anchor === "end" ? l.x - w : l.x;
    if (left < M - 0.5 || left + w > W - M + 0.5) warnings.push(`"${l.text.slice(0, 18)}" crosses the 5 mm margin`);
  }

  /* ---- the picture: his zone, keeping his distance from the type ----
     At his size, with his words, it is exactly the zone he drew. An edge
     of the zone that lies on the label's edge stays there; an edge that
     faces type follows that type, at the distance he left — so when the
     lines beside it close up (a field left empty) or the label changes
     shape, the picture takes the difference (rule 3). */
  const a = tpl.art || { kind: "rect" as const, x: 0, y: 0, w: tpl.refW, h: tpl.refH };
  const bleedsWide = a.w >= tpl.refW - 0.5;
  const bleedsTall = a.h >= tpl.refH - 0.5;
  let art: { kind: "rect" | "oval"; x: number; y: number; w: number; h: number };
  if (bleedsTall && !bleedsWide) {
    /* templates 11 / 12: the picture is a half, the type a vertical column
       beside it; the column is only as wide as the lines that SURVIVED,
       so when fields are left out the picture takes the rest */
    const onLeft = a.x <= tpl.refW - (a.x + a.w);             /* the PICTURE is on the left */
    const cols = pass.placed.flatMap((p) => p.items).filter((i) => i.t.rot === -90);
    /* his own distance from his innermost column's ink to the picture,
       measured with his words in this face */
    const hisCols = tpl.texts.filter((t) => t.rot === -90);
    const hisInner = onLeft ? hisCols.reduce((m, t) => (t.x < m.x ? t : m)) : hisCols.reduce((m, t) => (t.x > m.x ? t : m));
    const hisInk = inkExtent(hisInner.sample || textOf(hisInner), faceOf(hisInner), ptPx(sizeOf(hisInner)));
    const gap = onLeft ? px(hisInner.x) - hisInk.up - px(a.x + a.w) : px(a.x) - (px(hisInner.x) + hisInk.down);
    let w: number;
    if (cols.length) {
      const edge = onLeft ? Math.min(...cols.map((i) => i.span[0])) : Math.max(...cols.map((i) => i.span[1]));
      w = onLeft ? edge - gap : W - edge - gap;
    } else w = W - px(MARGIN_MM);
    w = Math.max(px(10), Math.min(W, w));
    art = { kind: a.kind, x: onLeft ? 0 : W - w, y: 0, w, h: H };
  } else {
    const mid = a.y + a.h / 2;
    /* where a row of HIS ended up — a row that broke on a narrow label
       lives in two placed rows, and the zone must respect both */
    const partsOf = (r: Row) => pass.placed.filter((p) => p.items.some((i) => r.items.includes(i.t) || (originOf.get(i.t) || []).some((o) => r.items.includes(o))));
    const hisRow = (r: Row) => {
      const ps = partsOf(r);
      if (!ps.length) return null;
      return r.baseline < mid ? ps.reduce((m, p) => (p.base > m.base ? p : m)) : ps.reduce((m, p) => (p.base < m.base ? p : m));
    };
    const above = rows0.filter((r) => r.baseline < mid), below = rows0.filter((r) => r.baseline >= mid);
    const touchesTop = a.y <= 0.5, touchesBottom = a.y + a.h >= tpl.refH - 0.5;
    const adjAbove = above[above.length - 1], adjBelow = below[0];
    let top: number, bot: number;
    if (touchesTop) top = 0;
    else if (adjAbove && hisRow(adjAbove)) top = px(a.y) + px(hisRow(adjAbove)!.base - hisRow(adjAbove)!.row.baseline);
    else {
      /* the row beside it is gone: the zone reaches up to the next line that
         is still there, at the distance he left under the missing one */
      const gap = px(a.y) - (adjAbove ? px(adjAbove.baseline) + ptPx(hisPt(adjAbove)) * 0.22 : M);
      const present = above.flatMap(partsOf);
      top = present.length ? Math.max(...present.map((p) => px(p.base) + p.down)) + gap : px(a.y);
    }
    if (touchesBottom) bot = H;
    else if (adjBelow && hisRow(adjBelow)) bot = H - px(tpl.refH - a.y - a.h) + px(hisRow(adjBelow)!.base - (hisRow(adjBelow)!.row.baseline + inp.heightMm - tpl.refH));
    else {
      const gap = (adjBelow ? px(adjBelow.baseline) - ptPx(hisPt(adjBelow)) * 0.7 : H - M) - px(a.y + a.h);
      const present = below.flatMap(partsOf);
      bot = present.length ? Math.min(...present.map((p) => px(p.base) - p.up)) - gap : H - px(tpl.refH - a.y - a.h);
    }
    /* a zone edge that follows a top-anchored row moves with the top; one
       that follows a foot row moves with the foot. The bottom formula
       above already works in the foot's frame. */
    if (!touchesBottom && adjBelow && hisRow(adjBelow) && adjBelow.anchor === "top") bot = px(a.y + a.h) + px(hisRow(adjBelow)!.base - hisRow(adjBelow)!.row.baseline);
    if (!touchesTop && adjAbove && hisRow(adjAbove) && adjAbove.anchor === "bottom") top = px(a.y) + px(hisRow(adjAbove)!.base - (hisRow(adjAbove)!.row.baseline + inp.heightMm - tpl.refH)) + (H - px(tpl.refH));
    /* a band across the label may never reach a line's ink: at least a
       millimetre of paper between them, whatever moved */
    if (a.kind !== "oval") {
      const CLEAR_ART = px(1);
      for (const p of above.flatMap(partsOf)) top = Math.max(top, px(p.base) + p.down + CLEAR_ART);
      for (const p of below.flatMap(partsOf)) bot = Math.min(bot, px(p.base) - p.up - CLEAR_ART);
    }
    const roomH = Math.max(px(8), bot - top);
    if (a.kind === "oval") {
      /* his oval, as large as the room allows (a little larger than he drew
         it at most), never nearer the sides than he drew it */
      const side = Math.min(a.x, tpl.refW - a.x - a.w);
      const cx = Math.abs(a.x + a.w / 2 - tpl.refW / 2) < 1 ? W / 2 : px(a.x + a.w / 2) * (W / px(tpl.refW));
      if (inp.heightMm > inp.widthMm * 1.1) {
        /* A TALL, NARROW LABEL (owner, 2026-09-23, on t05 at 70 × 120: he
           drew the oval over the whole height the type leaves, rounder, and
           running off both sides). There his wide oval would be a small
           lozenge in a column of air; instead it takes the height the type
           leaves, four-thirds as wide as tall, and may cross the label's
           edges — the painting alone may bleed — by up to 5 mm a side. If
           the room is taller than that allows, it stays 4:3 and sits in
           the middle of the room. */
        const w = Math.min(roomH * 4 / 3, W + px(10)), h = w * 3 / 4;
        art = { kind: "oval", x: cx - w / 2, y: top + (roomH - h) / 2, w, h };
      } else {
        const k = Math.min(1.25, (W - 2 * px(side)) / px(a.w), roomH / px(a.h));
        const w = px(a.w) * k, h = px(a.h) * k;
        art = { kind: "oval", x: cx - w / 2, y: top + (roomH - h) / 2, w, h };
      }
      /* and no letter may touch the oval itself — the ends of a long arced
         word dip beside it, which is fine; into it, which is not */
      /* an arced word is boxed letter by letter — as one box it covered the
         whole bowl under the arc, and the oval shrank away from nothing */
      const boxes = pass.placed.flatMap((p) => p.items.flatMap((i) => {
        if (!i.t.arc) return [{ x0: i.span[0], x1: i.span[1], y0: px(p.base) - i.up, y1: px(p.base) + i.down }];
        const baseMm = p.base + (i.t.baseline - p.row.baseline);
        const text = textOf(i.t);
        return arcGlyphs(i.t, text, i.face, i.size, px(mmX(i.t)), px(i.t.arc.cy + (baseMm - i.t.baseline))).map((g) => {
          const e = inkExtent(g.ch, i.face, i.size);
          return { x0: g.x - g.w / 2, x1: g.x + g.w / 2, y0: g.y - e.up, y1: g.y + e.down };
        });
      }));
      const touches = (o: typeof art) => boxes.some((b) => {
        const ex = o.x + o.w / 2, ey = o.y + o.h / 2, ra = o.w / 2 + px(1), rb = o.h / 2 + px(1);
        const nx = Math.max(b.x0, Math.min(ex, b.x1)), ny = Math.max(b.y0, Math.min(ey, b.y1));
        return ((nx - ex) / ra) ** 2 + ((ny - ey) / rb) ** 2 < 1;
      });
      for (let i = 0; i < 30 && touches(art); i++) {
        const nw = art.w * 0.96, nh = art.h * 0.96;
        art = { kind: "oval", x: art.x + (art.w - nw) / 2, y: art.y + (art.h - nh) / 2, w: nw, h: nh };
      }
    } else {
      art = { kind: "rect", x: 0, y: top, w: W, h: roomH };
    }
  }

  const layout: Layout = { W, H, ground: inp.ground, art: { x: art.x, y: art.y, w: art.w, h: art.h }, lines: pass.laid };
  return {
    layout, art,
    faces: `${faces.hero.family} ${faces.hero.weight}/${faces.small.weight} · ${tpl.id} ${tpl.band}${scale < 1 ? ` · type ${(scale * 100).toFixed(0)}%` : ""}`,
    warnings,
  };
}
