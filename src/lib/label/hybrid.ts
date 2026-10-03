import sharp from "sharp";
import { buildArtworkPrompt, asKind, evalModel, generateArtwork, artistModels, BLEED } from "@/lib/eval/models";
import { ideaInEnglish } from "./translate";
import { composeTemplateLabel, templatesOf, pickTemplate, inkLost, lineBoxes } from "@/lib/typeset/compose-template";
import { templatesNow } from "@/lib/typeset/overrides";
import type { Template } from "@/lib/typeset/templates";
import { cleanPaper, whitenPaper } from "@/lib/typeset/palette";
import { listArtists } from "./artists";
import { artKindOf, bleedsOf, facesFor, bankFamilies, layoutTypeOf, typedCaps, layoutFromTemplate, templateFields, type ArtKind, type Band, type LayoutType } from "@/lib/typeset/templates";
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
  /* THE SCENE METHOD, on trial (owner 2026-10-01; SCENE_METHOD=1): the
     painting covers the WHOLE label — the story only in the template's
     picture room, its own plain background carried on under the type */
  scene?: boolean;
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

export async function paintHybridLabel(inp: HybridInput): Promise<HybridOutput & { tag: string; painter: string; artist?: string; repainted: boolean; template: string; hasPaper: boolean; refSet: string; panel: boolean; scene: boolean }> {
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
  /* 2026-10-01 (owner: "drop the tie between columns and categories —
     the three versions just need three DIFFERENT layouts: one centred, one
     set to the sides, one with vertical type; columns and artists don't
     matter"). The column (its old style name) is only a NUMBER now: the
     run's token deals the three layout types to the three columns in a
     random order, and within its type a column takes the layout used
     least lately (the variety memory), leaving out a layout this artist
     already showed in the session. */
  const forced = inp.template ? templatesNow().find((t) => t.id === inp.template) : undefined;
  const col = Math.max(0, ["traditional", "contemporary", "punk"].indexOf(style));
  const hashOf = (x: string) => { let h = 5381; for (let i = 0; i < x.length; i++) h = ((h * 33) ^ x.charCodeAt(i)) >>> 0; return h; };
  const runKey = inp.order ? hashOf(inp.order) : (mix(seed, 21) >>> 0);
  const TYPES: LayoutType[] = ["centred", "sides", "vertical"];
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const wantType = TYPES[perms[runKey % 6][col % 3]];
  const ofType = templatesNow().filter((t) => layoutTypeOf(t) === wantType);
  const freshOfType = ofType.filter((t) => !avoid.includes(`${model.artist.name}|${t.id}`));
  const tplPool = freshOfType.length ? freshOfType : ofType.length ? ofType : templatesNow();
  const tpl = forced || (inp.seed !== undefined ? tplPool[mix(seed, 23) % tplPool.length] : pickFresh(tplPool, (t) => t.id, usage("template")));
  const band = tpl.band;
  /* and the type's face: of a few seeds, the one whose face is used least —
     and once the font bank holds approved faces, the run's three versions
     take three DIFFERENT ones (the token deals them like the layouts) */
  const tc = typedCaps(Object.values(templateFields(inp.data)));
  /* the painter's font categories (owner, 2026-10-02) */
  const cats = (model.artist as { fontCats?: ("serif" | "sans" | "display")[] }).fontCats;
  if (inp.seed === undefined) {
    const fams = bankFamilies(cats);
    if (inp.order && fams.length >= 2) {
      const want = fams[(Math.floor(runKey / 6) + col) % fams.length];
      for (let k = 0; k < 4000; k++) { const sd = (Math.random() * 0xffffffff) >>> 0; if (facesFor(band, sd, tc, cats).small.family === want) { seed = sd; break; } }
    } else {
      const faceUse = usage("face");
      const seeds = Array.from({ length: 12 }, () => (Math.random() * 0xffffffff) >>> 0);
      seed = pickFresh(seeds, (sd) => facesFor(band, sd, tc, cats).hero.family, faceUse);
    }
  }
  const zone = tpl.art || { w: tpl.refW, h: tpl.refH };
  const zoneAspect = (zone.w / tpl.refW * widthMm) / (zone.h / tpl.refH * heightMm);
  /* no idea and no sketch → an abstraction in the artist's hand (owner, 2026-09-26) */
  const abstract = !String(inp.vision || "").trim() && !inp.sketch;
  /* the scene method: not for an artist whose ground is fixed (Pirosmani's
     black, Tatishvili's white paper — owner: "those are the exceptions") */
  const sceneOn = (inp.scene ?? process.env.SCENE_METHOD === "1") && !(model.artist as { keepGround?: string }).keepGround && !(model.artist as { paper?: string }).paper;
  const ap = asKind(await buildArtworkPrompt(brief, model.artist, abstract), artKindOf(tpl) === "spot" && !sceneOn ? "spot" : "bleed");
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
  if (artKindOf(tpl) === "spot" && !sceneOn) {
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
    if (!sceneOn && edgeSides.length && !((inp.panel ?? process.env.PANEL_METHOD !== "0") && edgeSides.length <= 1)) {
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
  /* 2026-10-01 (owner: "switch it on for everyone"): ON by default —
     PANEL_METHOD=0 in the environment turns it off.
     2026-09-29 (owner) — THE PANEL METHOD, on trial (PANEL_METHOD=1): a
     big picture with type on at most one side is painted like a spot — ONE
     panel of the window's own shape on plain paper, everything whole inside
     it — and laid in by the composer (compose-template `panel`). The
     "run off the edges / cover the window" asks are dropped. */
  const panel = !sceneOn && (inp.panel ?? process.env.PANEL_METHOD !== "0") && artKindOf(tpl) !== "spot" && edgeSides.length <= 1;
  /* 2026-09-30 (owner: "Pirosmani's picture is plainly painted on black,
     yet it gets a beige edge"): the ask said PAPER, and paper means cream
     to the model — so a black oilcloth scene sat on a cream sheet and the
     label took the cream. An artist with a ground of his own (profile
     keepGround) gets it round the drawing too, and the label with it. */
  const kg = (model.artist as { keepGround?: string }).keepGround;
  /* 2026-09-30 (owner, Grigol Tatishvili: "this artist always on white and
     light warm tones"): an artist whose ground is always a LIGHT paper
     (profile `paper`) — named round a floating drawing, asked of every
     picture, and never rotated away by the ground-variety rule */
  const pg = (model.artist as { paper?: string }).paper;
  const around = pg ? `plain ${pg}` : kg ? `plain ${kg} ground (the artist's own bare ${kg} ground, never white or cream paper)` : "paper";
  if (kg) ap.around = `${kg} ground`;
  if (pg) {
    ap.around = pg;
    ap.prompt += ` THE GROUND: always ${pg} — the picture stays light; never a dark, black or strongly coloured field, sky or background, whatever the story.`;
  }
  if (kg && artKindOf(tpl) === "spot") ap.prompt += ` THE GROUND ROUND THE DRAWING is the artist's own plain ${kg} — flat and empty, never white or cream paper.`;
  if (panel) {
    const shape = zoneAspect >= 1 ? `about ${zoneAspect.toFixed(1)} times wider than tall` : `about ${(1 / zoneAspect).toFixed(1)} times taller than wide`;
    const panelText = `THE PICTURE IS ONE PANEL: paint the whole scene as a single panel ${shape}, large and centred, with a clear margin of ${kg || pg ? `flat, empty ${around}` : "plain, flat, empty paper of one tone"} on ALL FOUR sides — about a tenth of the canvas on each side, nothing painted there, the panel never touching the canvas edge. The panel is filled edge to edge with the scene; its outline is the painter's own loose, irregular edge — never a frame, never a straight ruled line, never an oval. Every figure whole, every face and every animal, the whole story, well inside the panel; its outermost rim may be trimmed away, so nothing important sits near the panel's edges.`;
    ap.kind = "spot";
    ap.edgeSide = undefined;
    ap.prompt = ap.prompt.includes(BLEED) ? ap.prompt.replace(BLEED, panelText) : `${ap.prompt} ${panelText}`;
    ap.guide = undefined;
  }
  /* THE SCENE METHOD (owner, 2026-10-01: "where the image zones are,
     paint the main things of the story; on the rest of the label just
     carry the neutral background on — Levan's blue sky continued above,
     the yellow ground below — as part of the painting, but nothing from
     the story there, no details, no elements"). The canvas takes the
     LABEL's shape (gpt-image's three shapes are close to labels, unlike
     bands), the story area is said in numbers, and the sketch is checked
     for quiet where the type goes (sceneQuiet, below). */
  let story = { x: 0, y: 0, w: 1, h: 1 };
  let typeBoxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
  if (sceneOn) {
    const la = widthMm / heightMm;
    ap.aspect = la > 1.2 ? "landscape" : la < 0.83 ? "portrait" : "square";
    const probe = layoutFromTemplate({ template: tpl, fields: templateFields(inp.data), widthMm, heightMm, seed, ground: "#ffffff", ink: "#111111", accent: "#111111" });
    /* the canvas is cut to the label's shape round its middle: the story
       area in canvas fractions */
    const ca = ap.aspect === "landscape" ? 1.5 : ap.aspect === "portrait" ? 2 / 3 : 1;
    const fx = la < ca ? la / ca : 1, fy = la > ca ? ca / la : 1;
    const A = probe.art;
    story = { x: (1 - fx) / 2 + (A.x / (widthMm * 12)) * fx, y: (1 - fy) / 2 + (A.y / (heightMm * 12)) * fy, w: (A.w / (widthMm * 12)) * fx, h: (A.h / (heightMm * 12)) * fy };
    /* where the type will sit, in canvas fractions, grown by 2 mm */
    const g = 2 * 12;
    typeBoxes = (await lineBoxes(probe.layout.lines)).map((b) => ({
      x0: (1 - fx) / 2 + ((b.x0 - g) / (widthMm * 12)) * fx, x1: (1 - fx) / 2 + ((b.x1 + g) / (widthMm * 12)) * fx,
      y0: (1 - fy) / 2 + ((b.y0 - g) / (heightMm * 12)) * fy, y1: (1 - fy) / 2 + ((b.y1 + g) / (heightMm * 12)) * fy,
    }));
    const pc = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 100);
    const around = [story.y > 0.06 ? "above" : "", story.y + story.h < 0.94 ? "below" : "", story.x > 0.06 ? "to the left of" : "", story.x + story.w < 0.94 ? "to the right of" : ""].filter(Boolean).join(", ");
    const sceneText = `THE PICTURE IS THE WHOLE LABEL, painted edge to edge on every side — no paper, no margin, no frame, no border, no panel edge. THE STORY AREA: everything that happens — every figure, face, animal, object, building, tree, plant and detail — is painted ONLY inside the area from ${pc(story.x)}% to ${pc(story.x + story.w)}% of the canvas's width and from ${pc(story.y)}% to ${pc(story.y + story.h)}% of its height, filling it well, every figure whole. EVERYWHERE ELSE (${around || "around"} that area) the canvas is only the same painting's own background carried on — its sky, wall, field, ground or water simply continued in its own colours, calm and nearly flat, with only the painter's gentle brush texture — and NOTHING in it: no figures, objects, plants, trees, clouds, buildings, lines, marks or details. Wine-label type will be printed on those plain parts, so they stay quiet and even.`;
    ap.kind = "bleed";
    ap.edgeSide = undefined;
    ap.guide = undefined;
    ap.prompt = ap.prompt.includes(BLEED) ? ap.prompt.replace(BLEED, sceneText) : `${ap.prompt} ${sceneText}`;
  }
  if (!sceneOn && !panel && artKindOf(tpl) !== "spot" && edgeSides.length <= 1) {
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
  const rest = pg || (rest0 && rest0 === (model.artist as { keepGround?: string }).keepGround) ? "" : rest0;
  if (rest) ap.prompt += ` GROUND COLOUR — for variety: this time the ground is NOT ${rest}; take another of the artist's own colours for it.`;
  /* a spot or a panel floats on its paper: its sketch must show paper all
     round (see generateArtwork `accept`) — the ink box clear of the sheet's
     edge on every side */
  const floats = !sceneOn && (panel || artKindOf(tpl) === "spot");
  /* 2026-10-01 (owner: "a big picture is the same as a small one, only
     pushed to one side and wider"): a panel's sketch is also checked for
     its SHAPE — its ink measured against the window's proportion. A scene
     drawn far too tall (or too wide) for its band can only be placed by
     shrinking it or cutting it, so the cheap sketch is drawn again with
     the proportion said plainly. */
  const canvasAsp = ap.aspect === "landscape" ? 1.5 : ap.aspect === "portrait" ? 2 / 3 : 1;
  let refusal: "paper" | "tall" | "wide" = "paper";
  const onPaper = async (s: string) => {
    const c = await cleanPaper(s);
    refusal = "paper";
    if (!(c.cleaned && c.ink.x > 0.015 && c.ink.y > 0.015 && c.ink.x + c.ink.w < 0.985 && c.ink.y + c.ink.h < 0.985)) return false;
    if (!panel || process.env.SHAPE_CHECK === "0") return true;
    const r = (c.ink.w / Math.max(0.01, c.ink.h)) * canvasAsp / zoneAspect;
    if (r < 0.72) { refusal = "tall"; return false; }
    if (r > 1.4) { refusal = "wide"; return false; }
    return true;
  };
  const retry = () => refusal === "paper"
    ? `IMPORTANT — THE LAST TRY FILLED THE WHOLE CANVAS: this time leave a wide empty margin of ${kg || pg ? around : "plain, flat paper"} on ALL FOUR sides, about a tenth of the canvas each side; the picture must not touch any edge of the canvas.`
    : `IMPORTANT — THE LAST TRY HAD THE WRONG SHAPE: it was ${refusal === "tall" ? "too tall and narrow" : "too wide and low"}. This time the painted panel must be ${zoneAspect >= 1 ? `${zoneAspect.toFixed(1)} times wider than tall — a long ${zoneAspect >= canvasAsp ? "low band running across the whole width of the canvas, with wide empty margin above and below it" : "panel"}` : `${(1 / zoneAspect).toFixed(1)} times taller than wide — an upright panel, with wide empty margin at its sides`}${zoneAspect >= 1 ? "; arrange the figures side by side within it, never stacked into a tall group" : ""}.`;
  /* the scene's sketch: quiet where the type goes */
  const quietOk = async (st: string) => {
    const q = await sceneQuiet(st, story, typeBoxes);
    console.warn(`[scene] busy under the type ${(q.out * 100).toFixed(1)}% (story area ${(q.in * 100).toFixed(1)}%)`);
    return q.out <= SCENE_BUSY_MAX;
  };
  const quietRetry = () => `IMPORTANT — THE LAST TRY PUT FIGURES, OBJECTS OR DETAILS OUTSIDE THE STORY AREA: this time everything that happens stays inside the area from ${Math.round(story.x * 100)}% to ${Math.round((story.x + story.w) * 100)}% of the width and ${Math.round(story.y * 100)}% to ${Math.round((story.y + story.h) * 100)}% of the height; outside it ONLY the plain background carried on — sky, wall or ground in its own colour — with nothing in it at all.`;
  /* a scene that will not stay quiet under the type after its retries is
     painted the usual way instead (owner: "if anything, back to the
     current scheme") — only three cheap sketches are lost */
  let painted: Awaited<ReturnType<typeof generateArtwork>>;
  try {
    painted = await gen429(() => generateArtwork(model, ap, { sketch: inp.sketch || null, refSet: inp.refSet, small: inp.small, ...(sceneOn ? { accept: quietOk, retry: quietRetry, strict: !inp.sketch } : floats ? { accept: onPaper, retry } : {}) }));
  } catch (e) {
    if (sceneOn && e instanceof Error && e.message === "STORY_REFUSED") {
      console.warn(`[scene] ${model.id}: the story would not stay out of the type — painted the usual way`);
      return paintHybridLabel({ ...inp, scene: false, seed, template: tpl.id, artistId: model.artist.id });
    }
    throw e;
  }
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
  let cleaned = sceneOn
    ? { art: painted.art, ground: await meanColour(painted.art), cleaned: false, ink: { x: 0, y: 0, w: 1, h: 1 } }
    : await cleanPaper(painted.art, undefined, !panel && edgeSides.length ? edgeSides : undefined);
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
    scene: sceneOn,
    blend: (model.artist as { blend?: "multiply" }).blend,
    fadeEdges: !!kg,
    fontCats: cats,
    widthMm, heightMm, seed, wineColour: inp.data.wineColorName,
  });
  /* a multiply picture is KEPT with its paper made white (the PDF, the
     admin editor and every re-layout lay that file in multiply) */
  const blend = (model.artist as { blend?: "multiply" }).blend;
  const kept = out.art || (blend === "multiply" ? await whitenPaper(art, cleaned.ground) : art);
  if (out.warnings.length) console.warn(`[template ${out.template}] ${out.warnings.join("; ")}`);
  rememberMade({ artist: model.artist.name, template: out.template, face: out.faces.match(/^(.*?) \d{3}\//)?.[1] || out.faces.split(" ")[0], ground: groundWord(out.layout.ground) });
  return { png: out.png, svg: out.svg, art: kept, faces: out.faces, ink: out.ink, ground: out.layout.ground, prompt: ap.prompt, layout: out.layout, tag: `${out.template}|${out.faces.split(" ")[0]}`, fit: "vignette", painter: model.id, artist: model.artist.name, repainted: painted.repainted, template: out.template, hasPaper: cleaned.cleaned, refSet: painted.refSet, panel: panel && floatOk, scene: sceneOn };
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
/* the artist's own ground colour (Pirosmani's black), from the name a label records */
const keepGroundOf = (name?: string): boolean => {
  if (!name) return false;
  const a = listArtists().find((x) => x.profile.name === name);
  return !!(a?.profile as { keepGround?: string } | undefined)?.keepGround;
};
/* the artist's font categories, from the name a label records */
const fontCatsOf = (name?: string): ("serif" | "sans" | "display")[] | undefined => {
  if (!name) return undefined;
  const a = listArtists().find((x) => x.profile.name === name);
  return (a?.profile as { fontCats?: ("serif" | "sans" | "display")[] } | undefined)?.fontCats;
};
/* the artist's blend, from the name a label records */
const blendOf = (name?: string): "multiply" | undefined => {
  const n = String(name || "");
  const a = n ? listArtists().find((x) => x.profile.name === n || n.startsWith(x.profile.name)) : undefined;
  return (a?.profile as { blend?: "multiply" } | undefined)?.blend;
};
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
  /* the stored label's own layout family (no longer the column's) */
  const kband: Band = storedTpl?.band || band;
  /* a SCENE label: the painting is the whole label — only the type is set again */
  if (keep && storedTpl && (stored.meta as { scene?: boolean }).scene) {
    const fam = String((stored.meta as { faces?: string }).faces || "").match(/^(.*?) \d{3}\//)?.[1];
    let keepSeed = 1;
    if (fam) for (let k = 1; k < 2000; k++) if (facesFor(kband, k, typedCaps(Object.values(templateFields(data))), fontCatsOf((stored.meta as { artist?: string }).artist)).hero.family === fam) { keepSeed = k; break; }
    const out = await composeTemplateLabel({
      artwork: raw, band: kband, template: storedTpl.id, data, paper: await meanColour(raw),
      widthMm, heightMm, seed: keepSeed, wineColour: data.wineColorName, scene: true,
      fontCats: fontCatsOf((stored.meta as { artist?: string }).artist),
    });
    return { png: out.png, svg: out.svg, art: raw, faces: out.faces, ink: out.ink, ground: out.layout.ground || ground, prompt: "(the same painting, the details set again)", layout: out.layout, tag: `${out.template}|${out.faces.split(" ")[0]}`, fit: "vignette", template: out.template };
  }
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
    if (fam) for (let k = 1; k < 2000; k++) if (facesFor(kband, k, typedCaps(Object.values(templateFields(data))), fontCatsOf((stored.meta as { artist?: string }).artist)).hero.family === fam) { keepSeed = k; break; }
    /* a multiply picture is stored with its paper white: the label keeps
       the ground it was laid on */
    const blend = blendOf((stored.meta as { artist?: string }).artist);
    const out = await composeTemplateLabel({
      artwork: cl.art, band: kband, template: storedTpl.id, data, ink: cl.ink, paper: cl.ground,
      widthMm, heightMm, seed: keepSeed, wineColour: data.wineColorName, edge: !wasPanel && cl.cleaned && sides.length ? sides : undefined,
      panel: wasPanel && cl.cleaned,
      blend, labelGround: blend ? ground : undefined,
      fadeEdges: keepGroundOf((stored.meta as { artist?: string }).artist),
      fontCats: fontCatsOf((stored.meta as { artist?: string }).artist),
    });
    return { png: out.png, svg: out.svg, art: out.art || (blend === "multiply" ? await whitenPaper(cl.art, cl.ground) : cl.art), faces: out.faces, ink: out.ink, ground: out.layout.ground || ground, prompt: "(the same painting, the details set again)", layout: out.layout, tag: `${out.template}|${out.faces.split(" ")[0]}`, fit: "vignette", template: out.template, panel: wasPanel && cl.cleaned };
  }
  const cleaned = await cleanPaper(raw);
  const art = cleaned.art;
  /* a variation is another layout of the SAME picture — the owner's
     three rows. Only layouts of its own shape, and only the ones it fits
     without being dragged past the trim. */
  const kind = artKindOf(templatesNow().find((t) => t.id === (stored.meta as { template?: string }).template) || templatesOf(kband)[0]);
  const pool = templatesOf(kband).filter((t) => artKindOf(t) === kind);
  const scored = pool.map((t) => {
    const probe = layoutFromTemplate({ template: t, fields: templateFields(data), widthMm, heightMm, seed: 1, ground: cleaned.ground, ink: "#111", accent: "#111" });
    return { t, lost: inkLost(t, cleaned.ink, widthMm, heightMm, probe.art) };
  }).filter((x) => x.lost <= 0.35).sort((a, b) => a.lost - b.lost);
  const free = scored.filter((x) => !used.has(x.t.id));
  const pick = (free.length ? free : scored.length ? scored : [{ t: pool[0], lost: 0 }])[0].t;
  const seed = (Math.random() * 0xffffffff) >>> 0;
  const blendV = blendOf((stored.meta as { artist?: string }).artist);
  const out = await composeTemplateLabel({
    artwork: art, band: kband, template: pick.id, data, ink: cleaned.ink, paper: cleaned.ground,
    widthMm, heightMm, seed, wineColour: data.wineColorName,
    blend: blendV, labelGround: blendV ? ground : undefined,
    fadeEdges: keepGroundOf((stored.meta as { artist?: string }).artist),
      fontCats: fontCatsOf((stored.meta as { artist?: string }).artist),
  });
  void recipe;
  return { png: out.png, svg: out.svg, art: out.art || (blendV === "multiply" ? await whitenPaper(art, cleaned.ground) : art), faces: out.faces, ink: out.ink, ground: out.layout.ground || ground, prompt: "(re-layout of an existing painting)", layout: out.layout, tag: `${out.template}|${out.faces.split(" ")[0]}`, fit: "vignette", template: out.template };
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

/* the scene method's quiet check: how much of the sketch UNDER THE TYPE
   (each line's box, grown by 2 mm) is busy — 6-px blocks whose brightness
   varies more than a brush texture does; a figure, object or drawn detail
   there shows as busy blocks */
const SCENE_BUSY_MAX = Number(process.env.SCENE_BUSY_MAX || 0.06);
export async function sceneQuiet(dataUrl: string, story: { x: number; y: number; w: number; h: number }, boxes: { x0: number; y0: number; x1: number; y1: number }[]): Promise<{ out: number; in: number }> {
  const N = 240, B = 6;
  const { data } = await sharp(Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64")).removeAlpha().resize(N, N, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  let bo = 0, no = 0, bi = 0, ni = 0;
  for (let by = 0; by < N; by += B) for (let bx = 0; bx < N; bx += B) {
    let s1 = 0, s2 = 0;
    for (let y = by; y < by + B; y++) for (let x = bx; x < bx + B; x++) { const v = data[y * N + x]; s1 += v; s2 += v * v; }
    const n = B * B, sd = Math.sqrt(Math.max(0, s2 / n - (s1 / n) ** 2));
    const cx = (bx + B / 2) / N, cy = (by + B / 2) / N;
    const busy = sd > 20 ? 1 : 0;
    if (boxes.some((b) => cx >= b.x0 && cx <= b.x1 && cy >= b.y0 && cy <= b.y1)) { bo += busy; no++; }
    else if (cx > story.x && cx < story.x + story.w && cy > story.y && cy < story.y + story.h) { bi += busy; ni++; }
  }
  return { out: no ? bo / no : 0, in: ni ? bi / ni : 0 };
}
async function meanColour(dataUrl: string): Promise<string> {
  const st = await sharp(Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64")).removeAlpha().stats();
  return "#" + st.channels.slice(0, 3).map((c) => Math.round(c.mean).toString(16).padStart(2, "0")).join("");
}
