import { buildArtworkPrompt, asKind, evalModel, generateArtwork, artistModels, BLEED } from "@/lib/eval/models";
import { ideaInEnglish } from "./translate";
import { composeTemplateLabel, templatesOf, pickTemplate, inkLost } from "@/lib/typeset/compose-template";
import { templatesNow } from "@/lib/typeset/overrides";
import type { Template } from "@/lib/typeset/templates";
import { cleanPaper } from "@/lib/typeset/palette";
import { artKindOf, bleedsOf, facesFor, layoutFromTemplate, templateFields, type ArtKind, type Band } from "@/lib/typeset/templates";
import { faceFile, pickRoles, mix } from "@/lib/typeset/fonts";
import type { Layout } from "@/lib/typeset/compose";
import { painterFor, castPainter } from "./painters";
import { usage, pickFresh, rememberMade, groundWord, restingGround } from "./variety";

/* the wizard's three columns are the owner's three bands (2026-09-22:
   "first option can be classical… second contemporary… third more free,
   so we have the most variety within one artist") */
export const bandOf = (style: string): Band =>
  style === "contemporary" ? "contemporary" : style === "punk" ? "free" : "classical";

/* THE HYBRID ENGINE for the wizard (branch POPIKA_Back_To_Vector, round
   84; round 105 on POPIKA_Artists). One call:

     the ARTIST paints the picture — gpt-image paints the story shown her
       works, FLUX + her LoRA repaints it in her hand (models.ts) — as a
       spot illustration on plain paper;
     the composer trims the air and sets the TYPE by code — Google faces,
       grouped blocks, 120 % leading, measured fit — so the label comes
       back as live type (SVG) and a print PNG.

   No text is ever painted, so no proofreading, no strict redream. */

export interface HybridInput {
  vision: string;
  style: string;
  data: Record<string, string>;
  widthMm: number;
  heightMm: number;
  sketch?: string | null;
  seed?: number;
  /* round 112 #4: paint in THIS artist's hand, whatever the column says */
  artistId?: string;
  /* one generation run's token: the three columns share it and get a
     mixed cast of artists from it (painters.ts mixedPainter) */
  order?: string;
  /* force one of the artist's reference sets (0-based) — tests only */
  refSet?: number;
  /* paint FOR this template (the admin's layout batch walks all twelve);
     its band then decides the column, whatever `style` says */
  template?: string;
  /* "Artist Name|template" of the labels already shown in this session —
     a new version never repeats one of those pairs */
  avoidPairs?: string[];
  /* the artists the visitor picked (ids) — the run's cast comes from them */
  pool?: string[];
  /* paint a big picture as ONE PANEL (see below) whatever PANEL_METHOD
     says — the admin's layout batch always does, so the owner's picture
     corrections are made on the method under trial */
  panel?: boolean;
  /* repaint at a smaller size (about half the price) — the admin's batch */
  small?: boolean;
}
export interface HybridOutput {
  png: string;          /* data URL — the print bitmap at 12 px/mm */
  svg: string;          /* live type over the artwork */
  art: string;          /* the painter's picture alone */
  faces: string;
  ink: string;
  ground: string;
  prompt: string;
  layout: Layout;       /* every set line in label px — the PDF draws from it */
  fit?: "yield" | "crop" | "top" | "vignette";
}

/* the label's texts, exactly as the dream engine derives them */
export function textsOf(d: Record<string, string>) {
  return {
    wine: d.wine || "Wine", producer: d.producer || "", appellation: d.appellation || "", vintage: d.vintage || "",
    grape: d.grape || "", region: [d.region, d.country].filter(Boolean).join(", "),
    classification: d.classification || "", special: d.special || "",
    legal: [[d.sweetness, d.wineColorName, "Wine"].filter(Boolean).join(" "), `${d.alcohol || "12.5"}% Alc. by Vol. / ${d.volume || "750"} mL`].join(" / "),
  };
}

/* three columns paint in parallel from the wizard — a burst can trip the
   images rate limit; honour the hint and retry once */
async function gen429<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/429|rate.?limit/i.test(msg)) throw e;
    const hinted = msg.match(/try again in (\d+(?:\.\d+)?)s/i);
    await new Promise((r) => setTimeout(r, hinted ? Math.ceil(parseFloat(hinted[1]) * 1000) + 1000 : 20000));
    return fn();
  }
}

export async function paintHybridLabel(inp: HybridInput): Promise<HybridOutput & { tag: string; painter: string; artist?: string; repainted: boolean; template: string; hasPaper: boolean; refSet: string; panel: boolean }> {
  const style = ["traditional", "contemporary", "punk"].includes(inp.style) ? inp.style : "traditional";
  let seed = inp.seed ?? (Math.random() * 0xffffffff) >>> 0;
  const avoid = inp.avoidPairs || [];
  const widthMm = Math.min(300, Math.max(30, inp.widthMm || 110));
  const heightMm = Math.min(300, Math.max(30, inp.heightMm || 80));
  /* 2026-09-28: a Georgian (any non-Latin) idea is painted from its English translation */
  const brief = { id: "wizard", title: "wizard", vision: await ideaInEnglish(inp.vision), data: inp.data, width: widthMm, height: heightMm };
  /* the column's artist (admin → Artists); any artist with a LoRA if unset */
  const model = (inp.artistId ? evalModel(`artist:${inp.artistId}`) : null)
    || (inp.order ? evalModel(castPainter(inp.order, style, avoid, (id) => evalModel(id)?.artist.name || "", inp.pool)) : null)
    || evalModel(await painterFor(style)) || artistModels().find((m) => m.lora) || artistModels()[0];
  if (!model) throw new Error("no artist is set up yet (data/artists/<id>/profile.json + lora.json)");
  /* 2026-09-22: THE TEMPLATE IS CHOSEN BEFORE THE PAINTING, and so is
     the KIND of picture. A spot is an illustration that floats on the
     paper with its own edge; a bleed runs off the label. They are
     different pictures, so the column decides which it wants, paints
     that, and only ever shows layouts that use it. */
  const forced = inp.template ? templatesNow().find((t) => t.id === inp.template) : undefined;
  const band = forced ? forced.band : bandOf(style);
  /* only the shapes this column's band actually offers — the free
     column has no wide band drawn, so it must not ask for one */
  const offered = [...new Set(templatesOf(band).map(artKindOf))];
  let kind: ArtKind = forced ? artKindOf(forced) : offered[mix(seed, 21) % offered.length] || "spot";
  /* 2026-09-27 (owner): the VARIETY MEMORY — within the kind, the layouts
     used least lately are favoured; a pair of this artist and a layout
     already shown in the session is left out (when another kind still
     has a fresh one, the kind gives way) */
  const fresh = (k: ArtKind) => templatesOf(band).filter((t) => artKindOf(t) === k && !avoid.includes(`${model.artist.name}|${t.id}`));
  if (!forced && !fresh(kind).length) kind = offered.find((k) => fresh(k).length) || kind;
  const tplPool = fresh(kind).length ? fresh(kind) : templatesOf(band).filter((t) => artKindOf(t) === kind);
  const tpl = forced || (inp.seed !== undefined ? pickTemplate(band, seed, kind) : pickFresh(tplPool, (t) => t.id, usage("template")));
  /* and the type's face: of a few seeds, the one whose face is used least */
  if (inp.seed === undefined) {
    const faceUse = usage("face");
    const seeds = Array.from({ length: 12 }, () => (Math.random() * 0xffffffff) >>> 0);
    seed = pickFresh(seeds, (sd) => facesFor(band, sd).hero.family, faceUse);
  }
  const zone = tpl.art || { w: tpl.refW, h: tpl.refH };
  const zoneAspect = (zone.w / tpl.refW * widthMm) / (zone.h / tpl.refH * heightMm);
  /* no idea and no sketch → an abstraction in the artist's hand (owner, 2026-09-26) */
  const abstract = !String(inp.vision || "").trim() && !inp.sketch;
  const ap = asKind(await buildArtworkPrompt(brief, model.artist, abstract), artKindOf(tpl) === "spot" ? "spot" : "bleed");
  ap.aspect = zoneAspect > 1.25 ? "landscape" : zoneAspect < 0.8 ? "portrait" : "square";
  /* 2026-09-23 (owner, twice): "only the legs of a person on the chair
     showed — work the picture's proportion out from the room the label
     leaves", and "a picture that runs off three sides must not be cut
     with a straight line on the type's side — its edge should look like
     the artist meant it". Now that a painting serves ONE label, it can be
     painted for it: it runs off the sides that leave the label and, on
     the side that faces the type, ends in the painter's own edge with
     plain ground beyond. The painted part is given the WINDOW's shape, so
     nothing that matters falls outside the label. */
  /* 2026-09-23 (owner, on Giorgi's t05 label: "the illustration is very
     small in the middle — grow its ink, without running onto the type,
     but without so much air"). The oval window of a spot layout can be
     2.3 times wider than tall; a drawing painted near 4:3 fits it only by
     its height and leaves the sides empty. So a spot drawing is told its
     window's shape too — a wide horizontal (or a tall) vignette. */
  if (artKindOf(tpl) === "spot") {
    const canvas = ap.aspect === "landscape" ? 1.5 : ap.aspect === "portrait" ? 2 / 3 : 1;
    if (zoneAspect > canvas * 1.15 || zoneAspect < canvas / 1.15) {
      /* 2026-09-25 (owner: "many of Levan's pictures sit in a rather
         sharp oval — we passed that; let the illustration make its own
         edge; take the oval as rough margins, not as the ink's shape").
         The ask said "a wide OVAL", and the model drew one. Now the room
         is only a proportion; the outline belongs to the drawing. */
      ap.prompt += zoneAspect > canvas
        ? ` COMPOSITION — THE PROPORTION: the drawing will be placed in an area about ${zoneAspect.toFixed(1)} times wider than tall — that is only its rough proportion, not its shape. Spread it across most of the canvas's width, low in height, with plain empty margin above and below. Never a tall or square scene.`
        : ` COMPOSITION — THE PROPORTION: the drawing will be placed in an area about ${(1 / zoneAspect).toFixed(1)} times taller than wide — that is only its rough proportion, not its shape. Make it tall and upright, with plain empty margin at its sides.`;
      ap.prompt += ` Its outline is NOT a geometric shape: never an oval, circle, ellipse or rectangle, never a patch of colour with a smooth rounded edge. The silhouette is free, irregular and lively, made by the things drawn themselves — a figure, a plant, a patch of ground that breaks off unevenly.`;
    }
  }
  type Side = "top" | "bottom" | "left" | "right";
  let edgeSides: Side[] = [];
  if (artKindOf(tpl) !== "spot") {
    const bl = bleedsOf(tpl);
    edgeSides = (["bottom", "top", "right", "left"] as const).filter((k) => !bl[k]);
    /* (the panel method, below, asks for its own shape instead) */
    if (edgeSides.length && !((inp.panel ?? process.env.PANEL_METHOD === "1") && edgeSides.length <= 1)) {
      /* the type lies across the picture's height (above and/or below it)
         or across its width (beside it) */
      const horiz = edgeSides.every((k) => k === "top" || k === "bottom");
      ap.aspect = horiz
        ? (zoneAspect >= 1.2 ? "landscape" : zoneAspect >= 0.8 ? "square" : "portrait")
        : (zoneAspect <= 1.2 ? "landscape" : "square");
      const canvas = ap.aspect === "landscape" ? 1.5 : ap.aspect === "portrait" ? 2 / 3 : 1;
      const frac = Math.min(0.85, Math.max(0.35, horiz ? canvas / zoneAspect : zoneAspect / canvas));
      const runs = (["top", "bottom", "left", "right"] as const).filter((k) => bl[k]).join(", ");
      const both = edgeSides.length > 1;
      /* 2026-09-25 (owner, on Levan's t10: the cypresses rose into the
         wine name): with type on BOTH sides the painting is stretched
         across the label, so a strip painted too tall runs into the type.
         He chose to ask for a LOWER strip — a fifth lower, and said so
         plainly: nothing tall may leave it. */
      const pct = Math.round(frac * (both ? 0.8 : 1) * 100);
      const toward = edgeSides.join(" and toward the ");
      /* 2026-09-29 (owner: "important things still end up outside the
         crop, Dachi above all — when the picture is BIG, the one rule is
         that where it meets the ground it is not cut, it ends the way the
         artist would end it; delete anything that tells it to leave a big
         empty space on a side"). A ONE-SIDED band no longer asks for a
         painting in "the top N% with EMPTY ground below": the painting
         covers the canvas and only a narrow strip of plain ground lies
         beyond its own edge. What the label cannot hold is said as it is —
         the label shows the part NEAREST the edge (the composer pins the
         edge to the type's boundary), the far part is trimmed — so the
         figures are painted there and only sky or scenery reaches the
         trimmed part.
         The TWO-SIDED band (type above AND below) keeps its low strip: its
         two loose edges must both land inside the label or they become
         straight cuts on the type (owner, 2026-09-25, Levan's t10) — this
         is asked of the owner, not silently decided. */
      let edgeText: string;
      if (both) {
        const where = horiz
          ? `a LOW horizontal strip across the MIDDLE of the canvas, only about ${pct}% of its height — and it stays that low: nothing in it (no tree, tower, figure or branch) rises above or hangs below the strip; tall things are drawn short, leaning or lying down so they fit inside it`
          : `a NARROW vertical strip down the MIDDLE of the canvas, only about ${pct}% of its width — and it stays that narrow: nothing in it reaches out past the strip's sides`;
        edgeText = `THE PAINTING AND ITS EDGE: the painting fills ${where} and runs off the ${runs} edges of the canvas, cut by them as if the sheet were larger. Toward the ${toward} it does NOT reach the edge: it ends in the painter's own loose, irregular edge — brushed, torn or dissolving, never a straight line, never a frame — and beyond that edge the canvas is plain, flat ground in one tone taken from the painting's own palette. Everything that matters — every figure whole, every face, the whole story — sits inside the painted part.`;
      } else {
        const side = edgeSides[0];
        edgeText = `THE PAINTING AND ITS EDGE: the painting covers the canvas and runs off the ${runs} edges, cut by them as if the sheet were larger. Toward the ${side} it does NOT reach the edge: it ends in the painter's own loose, irregular edge — brushed, torn or dissolving, never a straight line, never a frame — with only a NARROW strip of plain ground beyond it (about a tenth of the canvas), in one tone taken from the painting's own palette.`
;
      }
      ap.prompt = ap.prompt.includes(BLEED) ? ap.prompt.replace(BLEED, edgeText) : `${ap.prompt} ${edgeText}`;
      ap.edgeSide = edgeSides.join(" and ") as never;
    }
  }
  /* 2026-09-29 (owner: "important things end up outside the crop"). A
     band is up to ~2.5 : 1, the sketch at most 1.5 : 1, so the label shows
     only part of the painting. Widening the sketch with AI tools (four were
     tried) wiped or doubled the story; an image guide was ignored. So the
     SKETCH is told, in words, how much of it is kept and where — the
     figures SMALL, whole, inside that part, with open sky and ground
     beyond. Only the sketch reads it (the repaint keeps the arrangement). */
  /* 2026-09-29 (owner) — THE PANEL METHOD, on trial (PANEL_METHOD=1): a
     big picture with type on at most one side is painted like a spot — ONE
     panel of the window's own shape on plain paper, everything whole inside
     it — and laid in by the composer (compose-template `panel`). The
     "run off the edges / cover the window" asks are dropped. */
  const panel = (inp.panel ?? process.env.PANEL_METHOD === "1") && artKindOf(tpl) !== "spot" && edgeSides.length <= 1;
  /* 2026-09-30 (owner: "Pirosmani's picture is plainly painted on black,
     yet it gets a beige edge"): the ask said PAPER, and paper means cream
     to the model — so a black oilcloth scene sat on a cream sheet and the
     label took the cream. An artist with a ground of his own (profile
     keepGround) gets it round the drawing too, and the label with it. */
  const kg = (model.artist as { keepGround?: string }).keepGround;
  const around = kg ? `plain ${kg} ground (the artist's own bare ${kg} ground, never white or cream paper)` : "paper";
  if (kg) ap.around = `${kg} ground`;
  if (kg && artKindOf(tpl) === "spot") ap.prompt += ` THE GROUND ROUND THE DRAWING is the artist's own plain ${kg} — flat and empty, never white or cream paper.`;
  if (panel) {
    const shape = zoneAspect >= 1 ? `about ${zoneAspect.toFixed(1)} times wider than tall` : `about ${(1 / zoneAspect).toFixed(1)} times taller than wide`;
    const panelText = `THE PICTURE IS ONE PANEL: paint the whole scene as a single panel ${shape}, large and centred, with a clear margin of ${kg ? `flat, empty ${around}` : "plain, flat, empty paper of one tone"} on ALL FOUR sides — about a tenth of the canvas on each side, nothing painted there, the panel never touching the canvas edge. The panel is filled edge to edge with the scene; its outline is the painter's own loose, irregular edge — never a frame, never a straight ruled line, never an oval. Every figure whole, every face and every animal, the whole story, well inside the panel; its outermost rim may be trimmed away, so nothing important sits near the panel's edges.`;
    ap.kind = "spot";
    ap.edgeSide = undefined;
    ap.prompt = ap.prompt.includes(BLEED) ? ap.prompt.replace(BLEED, panelText) : `${ap.prompt} ${panelText}`;
    ap.guide = undefined;
  }
  if (!panel && artKindOf(tpl) !== "spot" && edgeSides.length <= 1) {
    const canvas = ap.aspect === "landscape" ? 1.5 : ap.aspect === "portrait" ? 2 / 3 : 1;
    const side = edgeSides[0];
    const horizE = !side || side === "top" || side === "bottom" ? zoneAspect >= canvas : false;
    const painted = side ? 0.9 : 1;
    const kept = Math.min(1, zoneAspect >= canvas ? (canvas / painted) / zoneAspect : zoneAspect / (canvas * painted));
    if (kept < 0.92) {
      const pc = Math.round(kept * 100);
      const band = !side ? `the middle ${pc}% of the canvas's ${horizE ? "height" : "width"}`
        : side === "bottom" ? `the lower ${pc}% of the painted part` : side === "top" ? `the upper ${pc}% of the painted part`
        : side === "right" ? `the right-hand ${pc}% of the painted part` : `the left-hand ${pc}% of the painted part`;
      ap.guide = ` COMPOSITION — ONLY PART OF THIS PICTURE WILL BE SEEN: just ${band}. Compose a WIDE, airy scene: the figures are SMALL — every figure whole, head to foot, every raised arm, jug or glass, every animal — all standing well inside that part, with open sky, ground or scenery filling the rest. Nothing important near the canvas edges.`;
    }
  }
  /* a coloured ground that filled several of the latest paintings rests */
  /* an artist whose own ground is one colour keeps it (Pirosmani's black) */
  const rest0 = artKindOf(tpl) !== "spot" ? restingGround() : "";
  const rest = rest0 && rest0 === (model.artist as { keepGround?: string }).keepGround ? "" : rest0;
  if (rest) ap.prompt += ` GROUND COLOUR — for variety: this time the ground is NOT ${rest}; take another of the artist's own colours for it.`;
  /* a spot or a panel floats on its paper: its sketch must show paper all
     round (see generateArtwork `accept`) — the ink box clear of the sheet's
     edge on every side */
  const floats = panel || artKindOf(tpl) === "spot";
  const onPaper = async (s: string) => {
    const c = await cleanPaper(s);
    return c.cleaned && c.ink.x > 0.015 && c.ink.y > 0.015 && c.ink.x + c.ink.w < 0.985 && c.ink.y + c.ink.h < 0.985;
  };
  const retry = `IMPORTANT — THE LAST TRY FILLED THE WHOLE CANVAS: this time leave a wide empty margin of ${kg ? around : "plain, flat paper"} on ALL FOUR sides, about a tenth of the canvas each side; the picture must not touch any edge of the canvas.`;
  const painted = await gen429(() => generateArtwork(model, ap, { sketch: inp.sketch || null, refSet: inp.refSet, small: inp.small, ...(floats ? { accept: onPaper, retry } : {}) }));
  /* 2026-09-22 (owner): the artist's LoRA learned her PAPER as well as
     her hand, so the picture arrives wrinkled and unevenly lit, and its
     rectangle then shows against the label's one flat colour. The clean
     part of a picture must be clean — see cleanPaper. */
  /* only a SPOT floats on the label's paper, so only a spot's paper is
     repainted to it — a bleed keeps the ground the artist painted
     (owner: "inside the image leave the backgrounds alone") */
  /* the paper is flattened and MEASURED: cleanPaper grows the paper in
     from the edge, so it knows exactly where the drawing is. Inside the
     drawing nothing is touched — a flat ground Levan painted is his. */
  /* a band/panel picture has plain ground only on its type-facing side —
     the paper is looked for there and nowhere else */
  let cleaned = await cleanPaper(painted.art, undefined, !panel && edgeSides.length ? edgeSides : undefined);
  /* the repaint can hide the sketch's paper under its grain (Kakabadze's
     watercolour sheet, 2026-09-29) — the paper is then looked for more
     leniently, and failing that the drawing's box is taken from the
     sketch (the repaint is locked to the sketch's shapes), so a floating
     picture is still laid in whole, never cut */
  let floatOk = cleaned.cleaned;
  if (floats && !cleaned.cleaned) {
    const lenient = await cleanPaper(painted.art, undefined, undefined, { lenient: true });
    if (lenient.cleaned) { cleaned = lenient; floatOk = true; }
    else {
      const sk = await cleanPaper(painted.story);
      if (sk.cleaned) { cleaned = { ...cleaned, ink: sk.ink }; floatOk = true; }
    }
    console.warn(`[painter] ${model.id}: paper not found on the repaint — ${cleaned.cleaned ? "found leniently" : floatOk ? "the sketch's box is used" : "none anywhere"}`);
  }
  const art = cleaned.art;

  /* 2026-09-23 (owner: "we no longer generate variations — the rules
     that made one image fit different labels are not needed"): the
     painting stays in the template it was painted FOR. It used to be
     re-scored against every template of its shape, and could land in one
     whose window it was never composed for. */
  const chosen = tpl;

  const out = await composeTemplateLabel({
    artwork: art, band, template: chosen.id, data: inp.data, ink: cleaned.ink, paper: cleaned.ground,
    edge: !panel && cleaned.cleaned && edgeSides.length ? edgeSides : undefined,
    panel: panel && floatOk,
    widthMm, heightMm, seed, wineColour: inp.data.wineColorName,
  });
  if (out.warnings.length) console.warn(`[template ${out.template}] ${out.warnings.join("; ")}`);
  rememberMade({ artist: model.artist.name, template: out.template, face: out.faces.match(/^(.*?) \d{3}\//)?.[1] || out.faces.split(" ")[0], ground: groundWord(out.layout.ground) });
  return { png: out.png, svg: out.svg, art, faces: out.faces, ink: out.ink, ground: out.layout.ground, prompt: ap.prompt, layout: out.layout, tag: `${out.template}|${out.faces.split(" ")[0]}`, fit: "vignette", painter: model.id, artist: model.artist.name, repainted: painted.repainted, template: out.template, hasPaper: cleaned.cleaned, refSet: painted.refSet, panel: panel && floatOk };
}

/* ROUND 86 #3 (owner: "keep the image, just change the layout — tons of
   variations without burning generations"). A variation re-sets the type
   on the SAME painting with a fresh seed: new faces, hero size, wine-ink
   role, air — no model call, no credit. */
/* ROUND 94 #6 (owner): every painting ships with THREE layouts that read
   clearly different — a different hero face AND a different hero size
   from every earlier layout of the same painting (`avoid` = the tags of
   those). A tag is "family|sizeBucket"; the seed is re-drawn until both
   differ (20 tries; then only the face has to differ). */
export function layoutTag(style: string, seed: number): string {
  return `${pickRoles(style, seed).hero.face.family}|${mix(seed, 16) % 5}`;
}
/* recipes for real contrast (owner: "enough contrast between fonts and
   arrangements"): `big` insists on the largest hero sizes; `flip` sets
   the type on the OTHER alignment (a centred style goes left, a left one
   goes centred) */
export async function relayoutLabel(stored: { art: Buffer; meta: { style: string; widthMm: number; heightMm: number; ground: string; fit?: "yield" | "crop" | "top" | "vignette" } }, data: Record<string, string>, avoid: string[] = [], recipe: { big?: boolean; flip?: boolean } = {}, keep = false): Promise<HybridOutput & { tag: string; template: string; panel?: boolean }> {
  const { style, widthMm, heightMm, ground } = stored.meta;
  const raw = `data:image/png;base64,${stored.art.toString("base64")}`;
  /* a picture stored before the clean-paper pass still has its wrinkles;
     a re-layout is the moment to take them out */
  /* 2026-09-22: a variation is now A DIFFERENT TEMPLATE from the same
     band — the strongest contrast there is, and still no model call. The
     tags already shown are avoided, so three variations of one painting
     are three different arrangements of his own. */
  const band = bandOf(style);
  const used = new Set(avoid.map((a) => a.split("|")[0]));
  /* 2026-09-23 (owner: "within a session the label changes only when it
     is generated anew"). KEEP: the details changed, nothing else — the
     same painting in the SAME template, only the type set again. The
     painting is cleaned only on its type-facing sides, as when it was
     made (a full clean would flatten a dark painted scene). */
  const storedTpl = templatesNow().find((t) => t.id === (stored.meta as { template?: string }).template);
  if (keep && storedTpl) {
    type Side = "top" | "bottom" | "left" | "right";
    const bl = bleedsOf(storedTpl);
    const sides: Side[] = artKindOf(storedTpl) === "spot" ? [] : (["bottom", "top", "right", "left"] as const).filter((k) => !bl[k]);
    /* a panel picture is set again as a panel (cleaned all round) */
    const wasPanel = !!(stored.meta as { panel?: boolean }).panel;
    const cl = await cleanPaper(raw, undefined, !wasPanel && sides.length ? sides : undefined);
    /* and in the SAME face: the family was drawn from the label's seed,
       which the label records by name ("EB Garamond 700/400 · t02") —
       a seed that draws that family again is found */
    const fam = String((stored.meta as { faces?: string }).faces || "").match(/^(.*?) \d{3}\//)?.[1];
    let keepSeed = 1;
    if (fam) for (let k = 1; k < 2000; k++) if (facesFor(band, k).hero.family === fam) { keepSeed = k; break; }
    const out = await composeTemplateLabel({
      artwork: cl.art, band, template: storedTpl.id, data, ink: cl.ink, paper: cl.ground,
      widthMm, heightMm, seed: keepSeed, wineColour: data.wineColorName, edge: !wasPanel && cl.cleaned && sides.length ? sides : undefined,
      panel: wasPanel && cl.cleaned,
    });
    return { png: out.png, svg: out.svg, art: cl.art, faces: out.faces, ink: out.ink, ground: out.layout.ground || ground, prompt: "(the same painting, the details set again)", layout: out.layout, tag: `${out.template}|${out.faces.split(" ")[0]}`, fit: "vignette", template: out.template, panel: wasPanel && cl.cleaned };
  }
  const cleaned = await cleanPaper(raw);
  const art = cleaned.art;
  /* a variation is another layout of the SAME picture — the owner's
     three rows. Only layouts of its own shape, and only the ones it fits
     without being dragged past the trim. */
  const kind = artKindOf(templatesNow().find((t) => t.id === (stored.meta as { template?: string }).template) || templatesOf(band)[0]);
  const pool = templatesOf(band).filter((t) => artKindOf(t) === kind);
  const scored = pool.map((t) => {
    const probe = layoutFromTemplate({ template: t, fields: templateFields(data), widthMm, heightMm, seed: 1, ground: cleaned.ground, ink: "#111", accent: "#111" });
    return { t, lost: inkLost(t, cleaned.ink, widthMm, heightMm, probe.art) };
  }).filter((x) => x.lost <= 0.35).sort((a, b) => a.lost - b.lost);
  const free = scored.filter((x) => !used.has(x.t.id));
  const pick = (free.length ? free : scored.length ? scored : [{ t: pool[0], lost: 0 }])[0].t;
  const seed = (Math.random() * 0xffffffff) >>> 0;
  const out = await composeTemplateLabel({
    artwork: art, band, template: pick.id, data, ink: cleaned.ink, paper: cleaned.ground,
    widthMm, heightMm, seed, wineColour: data.wineColorName,
  });
  void recipe;
  return { png: out.png, svg: out.svg, art, faces: out.faces, ink: out.ink, ground: out.layout.ground || ground, prompt: "(re-layout of an existing painting)", layout: out.layout, tag: `${out.template}|${out.faces.split(" ")[0]}`, fit: "vignette", template: out.template };
}

/* the TTFs a label's SVG sets its type in — shipped beside the SVG so
   Illustrator opens it with the right faces */
export function fontFilesOf(svg: string): string[] {
  const files = new Set<string>();
  const re = /font-family="([^"]+)" font-weight="(\d+)"( font-style="italic")?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) files.add(faceFile({ family: m[1].replace(/&amp;/g, "&"), weight: Number(m[2]), italic: !!m[3] }));
  return [...files];
}
