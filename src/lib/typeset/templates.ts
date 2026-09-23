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

/* TWO KINDS OF PICTURE (owner, 2026-09-22). A template either holds a
   SPOT — an illustration that stays inside the cut lines, floating on the
   paper with the edge the artist gave it — or a BLEED, a picture that
   runs off one or more edges of the label. They are different pictures
   and must be painted differently, so a column paints the kind its
   template wants and only ever shows layouts of that kind. */
export type ArtKind = "spot" | "bleed";
export function artKindOf(t: Template): ArtKind {
  const a = t.art;
  if (!a) return "bleed";
  const touches = a.x <= 0.5 || a.y <= 0.5 || a.x + a.w >= t.refW - 0.5 || a.y + a.h >= t.refH - 0.5;
  return touches ? "bleed" : "spot";
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

/* ONE FAMILY A LABEL (owner, 2026-09-22: "so the fonts do not confuse
   us, use one font on a label — one family. The wine name may use a more
   pronounced one, but every other text is always the same font").

   So every line but the name is set in ONE family. The name is that same
   family at its bold, unless the seed sends it out to a display face.
   Size, weight and colour still carry the hierarchy. */
export function facesFor(band: Band, seed: number): { hero: Face; secondary: Face; small: Face } {
  const p = BAND_FACES[band];
  const at = <T,>(l: T[], salt: number) => l[mix(seed, salt) % l.length];
  const set = at(p.sets, 13);
  const bold: Face = { family: set.family, weight: set.bold };
  return {
    hero: mix(seed, 11) % 3 === 0 ? at(p.display, 14) : bold,
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
    out.push(...p.display);
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

  /* ---- THE TEMPLATE IS A RHYTHM, NOT A SET OF COORDINATES ---------
     (owner, 2026-09-22: "when we went back to the vector front label you
     were doing the spacing, the proportions and the grouping far better
     — something is wrong in how you read the templates and implement
     them".) He was right, and this is the fix.

     His artboard's millimetres are the RESULT of the type he set, not a
     law. Held as absolute numbers they only fit his placeholder words at
     his sizes; give them a longer name, a missing field or another label
     shape and the rhythm breaks.

     So every vertical distance he drew is read as a MULTIPLE OF THE TYPE
     at that point — a gap of 5.1 mm under an 18 pt name is "0.8 of a
     name", not "5.1 mm" — and the stack is rebuilt from those multiples
     with the type actually being set. A removed row takes its own
     multiple with it, so what follows closes up by exactly the right
     amount. It is the old composer's way of working (measure, then
     place) on the owner's own proportions. */
  const rows0 = rowsOf(tpl);
  const hisPt = (r: Row) => Math.max(...r.items.map((t) => t.size));
  const hisMm = (r: Row) => hisPt(r) * PT_MM;
  /* the multiple of its own type that each row leaves before the next */
  const ratioAfter = new Map<Row, number>();
  for (const edge of ["top", "bottom"] as const) {
    const g = rows0.filter((r) => r.anchor === edge);
    for (let i = 0; i < g.length - 1; i++) ratioAfter.set(g[i], (g[i + 1].baseline - g[i].baseline) / hisMm(g[i]));
  }

  /* ---- across the label: his margins, his centring ---------------- */
  const xShift = new Map<TplText, number>();     /* vertical columns, closed up */
  const mmX = (t: TplText) => {
    const moved = xShift.get(t);
    if (moved !== undefined) return moved;
    /* the vertical columns of templates 11 and 12 hug the edge the type
       lives on, so they keep their distance from THAT edge — held at his
       absolute x they walked straight off a narrower label */
    if (t.rot === -90) {
      const fromRight = tpl.refW - t.x;
      return t.x <= fromRight ? t.x : inp.widthMm - fromRight;
    }
    return t.align === "center" ? inp.widthMm / 2 : t.align === "right" ? inp.widthMm - (tpl.refW - t.x) : t.x;
  };
  const mmY = (row: Row, base: number) => base;   /* the stack is built in this label's own space */

  /* ---- rule 4: sizes, hierarchy, and the two bounds --------------- */
  const sizeOf = (t: TplText) => Math.min(MAX_PT, Math.max(MIN_PT, t.size));
  const heroPt = Math.max(...tpl.texts.filter((t) => t.role === "hero").map(sizeOf), 0);

  /* lay one pass at a given overall type scale, and report the room it needs.

     TWO sweeps, and the second one is the sweep that was missing (owner,
     2026-09-22: "several times I saw texts laid over each other"). The
     first sizes each ROW so its own lines clear each other and the
     margin. The second walks the stack and makes each row clear the row
     BELOW it — because a collapsed stack can put a 20 pt name in a slot
     drawn for a 9 pt line, and nothing was checking that. */
  /* A ROW THAT CANNOT FIT BREAKS, IT DOES NOT OVERLAP (owner, 2026-09-22:
     "several times I saw texts laid over each other"). His foot row puts
     a line left, a line right and the vintage between them. That fits on
     a 104 mm label and does not on a 70 mm one — and shrinking to 7 pt
     does not save it. So the middle line steps up onto a line of its
     own, which is what a typographer does. */
  /* where a line's ink lies across the label, at a given size */
  const spanOf = (t: TplText, sizePx: number) => {
    const f = t.role === "hero" ? faces.hero : t.role === "secondary" ? faces.secondary : faces.small;
    /* a line turned on its side is as WIDE as its type is tall — from
       its descender to its ascender. Measured at 0.92 em it was too
       generous and his vertical columns touched on a narrow label. */
    if (t.rot === -90) return [px(mmX(t)) - sizePx * 0.28, px(mmX(t)) + sizePx * 0.95] as const;
    const w = measure(textOf(t), f, sizePx, t.tracking), x0 = px(mmX(t));
    const l = t.align === "center" ? x0 - w / 2 : t.align === "right" ? x0 - w : x0;
    return [l, l + w] as const;
  };
  const clashes = (items: TplText[], size: (t: TplText) => number, need: number) => {
    const b = items.map((t) => spanOf(t, size(t))).sort((p2, q) => p2[0] - q[0]);
    for (let j = 1; j < b.length; j++) if (b[j][0] < b[j - 1][1] + need) return true;
    return b.length > 0 && (b[0][0] < px(MARGIN_MM) - 0.5 || b[b.length - 1][1] > px(inp.widthMm - MARGIN_MM) + 0.5);
  };

  const splitRows = (src: Row[]): Row[] => {
    const out: Row[] = [];
    for (const row of src) {
      const live = row.items.filter((t) => textOf(t));
      if (live.length < 2 || live.some((t) => t.rot === -90)) { out.push(row); continue; }
      /* the question is not whether the words WOULD fit end to end — the
         left and right lines are pinned to the margins, so what matters
         is whether anything still collides once everything is at the
         floor. If it does, no amount of shrinking will save the row. */
      if (!clashes(live, () => ptPx(MIN_PT), px(1))) { out.push(row); continue; }
      const middle = live.find((t) => t.align === "center")
        || [...live].sort((a, b2) => measure(textOf(b2), faces.small, 100, 0) - measure(textOf(a), faces.small, 100, 0))[0];
      const rest = row.items.filter((t) => t !== middle);
      if (!rest.some((t) => textOf(t))) { out.push(row); continue; }
      const lifted: Row = { baseline: row.baseline - 0.01, fromBottom: row.fromBottom, anchor: row.anchor, items: [middle] };
      ratioAfter.set(lifted, 1.45);
      out.push(lifted, { ...row, items: rest });
    }
    return out;
  };

  const layPass = (scale: number) => {
    const rows = splitRows(rows0);
    const laid: LaidLine[] = [];
    let topMost = Infinity, botMost = -Infinity;
    interface Placed { row: Row; base: number; live: TplText[]; size: Map<TplText, number>; up: number; down: number; setMm: number }
    const placed: Placed[] = [];
    for (const row of rows) {
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
        const need = live.every((t) => t.rot === -90) ? px(0.5) : px(1);
        /* enough steps to reach the 7 pt floor from 20 pt — at fourteen
           it gave up at 8.4 pt with the line still over the margin */
        for (let i = 0; i < 40; i++) {
          if (!clashes(live, (t) => ptPx(Math.max(MIN_PT, natural.get(t)! * rowK)), need)) break;
          if (live.every((t) => natural.get(t)! * rowK <= MIN_PT + 0.01)) { warnings.push("a row is crowded even at 7 pt"); break; }
          rowK *= 0.94;
        }
      }
      /* how far this row's ink reaches above and below its baseline */
      const size = new Map<TplText, number>();
      let up = 0, down = 0;
      for (const t of live) {
        const face = t.role === "hero" ? faces.hero : t.role === "secondary" ? faces.secondary : faces.small;
        const sPx = ptPx(Math.max(MIN_PT, natural.get(t)! * rowK));
        size.set(t, sPx);
        if (t.rot === -90) { up = Math.max(up, measure(textOf(t), face, sPx, t.tracking)); down = Math.max(down, sPx * 0.3); }
        else if (t.arc) { up = Math.max(up, sPx * 1.6); down = Math.max(down, sPx * 0.3); }
        else { up = Math.max(up, sPx * vmetrics(face).asc); down = Math.max(down, sPx * vmetrics(face).desc); }
      }
      if (live.length) placed.push({ row, base: row.baseline, live, size, up, down, setMm: Math.max(...live.map((t) => size.get(t)!)) / PX_PER_MM });
    }

    /* ---- rebuild the stack from HIS proportions -------------------- */
    for (const edge of ["top", "bottom"] as const) {
      const g = placed.filter((p2) => p2.row.anchor === edge);
      if (!g.length) continue;
      const all = rows.filter((r) => r.anchor === edge);
      if (edge === "top") {
        /* the first line keeps the air he left above it, measured in its
           own type so a bigger name sits lower, not off the label */
        let y = all[0].baseline * (g[0].setMm / (hisPt(all[0]) * PT_MM));
        y = Math.max(y, MARGIN_MM + g[0].up / PX_PER_MM);
        for (let i = 0; i < g.length; i++) {
          g[i].base = y;
          y += (ratioAfter.get(g[i].row) ?? 1.4) * g[i].setMm;
        }
      } else {
        /* the foot keeps the air he left below it, in its own type */
        const last = all[all.length - 1];
        const lastSet = g[g.length - 1];
        let y = inp.heightMm - (tpl.refH - last.baseline) * (lastSet.setMm / (hisPt(last) * PT_MM));
        y = Math.min(y, inp.heightMm - MARGIN_MM - lastSet.down / PX_PER_MM);
        for (let i = g.length - 1; i >= 0; i--) {
          g[i].base = y;
          if (i > 0) y -= (ratioAfter.get(g[i - 1].row) ?? 1.4) * g[i - 1].setMm;
        }
      }
    }

    /* ---- his groups must read as groups (owner, 2026-09-22: "if the
       gap inside a group is 1, the gap to the next text must be at least
       2.5") ----------------------------------------------------------- */
    for (const edge of ["top", "bottom"] as const) {
      const g = placed.filter((p2) => p2.row.anchor === edge);
      if (g.length < 3) continue;
      const gaps = g.slice(0, -1).map((p2, i) => g[i + 1].base - p2.base);
      const inside = gaps.filter((v, i) => v <= (ratioAfter.get(g[i].row) ?? 1.4) * g[i].setMm * 1.05 && v <= 1.7 * g[i].setMm);
      if (!inside.length) continue;
      const unit = inside.sort((a, b2) => a - b2)[Math.floor(inside.length / 2)];
      for (let i = 0; i < gaps.length; i++) {
        if (gaps[i] <= 1.7 * g[i].setMm) continue;          /* a gap inside a group */
        const want = unit * 2.5;
        if (gaps[i] >= want - 0.01) continue;
        const add = want - gaps[i];
        if (edge === "top") for (let j = i + 1; j < g.length; j++) g[j].base += add;
        else for (let j = i; j >= 0; j--) g[j].base -= add;
      }
    }

    /* ---- and his vertical columns close up toward their own edge ----
       stepping by the REAL width of the column just set plus the next
       one's descender, so a big name never lands on its neighbour */
    for (const { row, live, size } of placed) {
      const cols = live.filter((t) => t.rot === -90);
      if (cols.length < 2) continue;
      const all = row.items.filter((t) => t.rot === -90).sort((a, b2) => a.x - b2.x);
      const onLeft = all[0].x <= tpl.refW - all[all.length - 1].x;
      const order = onLeft ? all : [...all].reverse();     /* outwards from the edge */
      let edgeOfPrev: number | null = null;
      for (const t of order) {
        if (!textOf(t)) continue;
        const sMm = (size.get(t) || ptPx(sizeOf(t))) / PX_PER_MM;
        if (edgeOfPrev === null) {
          const own = onLeft ? t.x : inp.widthMm - (tpl.refW - t.x);
          xShift.set(t, own);
          edgeOfPrev = onLeft ? own + 0.95 * sMm : own - 0.95 * sMm;
        } else {
          const x: number = onLeft ? edgeOfPrev + 0.6 + 0.28 * sMm : edgeOfPrev - 0.6 - 0.28 * sMm;
          xShift.set(t, x);
          edgeOfPrev = onLeft ? x + 0.95 * sMm : x - 0.95 * sMm;
        }
      }
    }

    /* ---- the second sweep: no row may sit on the row below it ------ */
    const GAP = px(1);                                  /* his rule: 1 mm between blocks */
    for (const edge of ["top", "bottom"] as const) {
      const group = placed.filter((p) => p.row.anchor === edge);
      if (group.length < 2) continue;
      if (edge === "top") {
        for (let i = 1; i < group.length; i++) {
          const prev = group[i - 1], cur = group[i];
          const need = px(prev.base) + prev.down + GAP + cur.up;
          if (px(cur.base) < need) { const push = (need - px(cur.base)) / PX_PER_MM; for (let j = i; j < group.length; j++) group[j].base += push; }
        }
      } else {
        for (let i = group.length - 2; i >= 0; i--) {
          const next = group[i + 1], cur = group[i];
          const limit = px(next.base) - next.up - GAP - cur.down;
          if (px(cur.base) > limit) { const push = (px(cur.base) - limit) / PX_PER_MM; for (let j = i; j >= 0; j--) group[j].base -= push; }
        }
      }
    }

    /* ---- and now set it ------------------------------------------- */
    for (const { row, base, live, size } of placed) {
      for (const t of live) {
        const text = textOf(t);
        const face = t.role === "hero" ? faces.hero : t.role === "secondary" ? faces.secondary : faces.small;
        let sizePx = size.get(t)!;
        const trackPx = t.tracking * sizePx;
        const yMm = mmY(row, base);
        const y = px(yMm), x = px(mmX(t));
        const anchor: LaidLine["anchor"] = t.align === "center" ? "middle" : t.align === "right" ? "end" : "start";

        if (t.arc) {
          /* his arced words: one glyph at a time around the circle he drew,
             the word centred on the top of the arc */
          const r = px(t.arc.r), cx = px(mmX(t)), cy = px(mmY(row, t.arc.cy));
          /* a long name on his radius used to sweep past itself and the
             letters climbed over each other — the word is held to a
             140-degree arc and steps down in size to fit it */
          let arcPx = sizePx;
          const MAX_SWEEP = (140 * Math.PI) / 180;
          while (measure(text, face, arcPx, t.tracking) > r * MAX_SWEEP && arcPx > ptPx(MIN_PT)) arcPx *= 0.95;
          sizePx = arcPx;
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
    return { laid, topMost, botMost, placed };
  };

  let scale = 1, pass = layPass(scale);
  const M = px(MARGIN_MM);

  /* the stack builder already stands the first and last lines off the
     margin, so nothing needs nudging here any more — the only thing left
     is the last resort, when the type itself will not fit. */
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
       beside it. Which half he drew it on is whichever edge it touches.

       2026-09-22 (owner: "the image should have grown to take the room
       the skipped lines left"): the column is only as wide as the lines
       that SURVIVED, measured, not as wide as he drew it — so when the
       customer leaves fields out the picture takes the rest. */
    const onLeft = a.x <= tpl.refW - (a.x + a.w);
    const cols = pass.laid.filter((l) => l.rot === -90);
    let typeW: number;
    if (cols.length) {
      /* the picture must stop where the TYPE BEGINS, so take the edge of
         the column nearest the picture and leave it 2 mm of air */
      const edge = onLeft
        ? Math.min(...cols.map((l) => l.x - l.size * 0.28))   /* type on the right */
        : Math.max(...cols.map((l) => l.x + l.size * 0.95));  /* type on the left  */
      typeW = ((onLeft ? W - edge : edge) / PX_PER_MM) + 2;
      typeW = Math.max(MARGIN_MM * 1.6, Math.min(typeW, inp.widthMm * 0.6));
    } else typeW = onLeft ? tpl.refW - a.w : a.x;
    const w = Math.max(px(10), W - px(typeW));
    art = { kind: a.kind, x: onLeft ? 0 : W - w, y: 0, w, h: H };
  } else {
    /* the picture's room is what the type left: under the LAST line that
       hangs from the top, above the FIRST line that hangs from the foot */
    /* measured off the lines that were ACTUALLY set, after the two
       sweeps moved them — not off the template's untouched numbers */
    const topRows = pass.placed.filter((p2) => p2.row.anchor === "top");
    const botRows = pass.placed.filter((p2) => p2.row.anchor === "bottom");
    const bandTop = topRows.length
      ? Math.max(...topRows.map((p2) => px(mmY(p2.row, p2.base)) + p2.down + px(2)))
      : 0;
    const bot = botRows.length
      ? Math.min(...botRows.map((p2) => px(mmY(p2.row, p2.base)) - p2.up - px(2)))
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
