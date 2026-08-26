import { generateOpenAIImage } from "@/lib/image-provider/openai";
import { finishArtwork, keyArtwork } from "@/lib/image-provider";
import { restyleWithFlux } from "@/lib/image-provider/flux";
import { getProfiles } from "@/lib/admin/style-refs";
import { feedbackAggregates } from "@/lib/admin/feedback";
import { getImageRules, ruleLines, verifyImage, NO_TEXT_RULE, WHITE_BG_RULE, NO_BORDER_RULE } from "@/lib/admin/image-rules";
import { assembleDreamRules } from "@/lib/dream/rules";
import { analyzeArtwork } from "@/lib/admin/art-analysis";
import { getDb } from "@/lib/db";
import { PNG } from "pngjs";
import sharp from "sharp";

/* DREAM ENGINE CORE (extracted 2026-08-25 so the admin studio and the
   public customer flow share one implementation — see the admin route
   for the full architecture story). */

const GOOGLE_FONTS = [
  "Playfair Display", "Cormorant Garamond", "EB Garamond", "Libre Baskerville", "Lora",
  "Crimson Text", "Cinzel", "Marcellus", "Spectral", "Prata", "Bodoni Moda",
  "DM Serif Display", "Abril Fatface", "Rozha One", "Yeseva One", "Fraunces",
  "Cardo", "Alegreya", "IM Fell English", "Grenze", "Philosopher",
  "Oswald", "Bebas Neue", "Anton", "Archivo", "Archivo Narrow", "Montserrat",
  "Raleway", "Jost", "Inter", "Work Sans", "Barlow Condensed", "Josefin Sans",
  "Poppins", "Nunito Sans", "Cabin", "Special Elite", "Courier Prime",
  "Great Vibes", "Dancing Script", "Sacramento", "Allura", "Parisienne",
  "Tangerine", "Italianno", "Pinyon Script", "Amatic SC", "Caveat",
  "Permanent Marker", "Shadows Into Light",
];

const STYLE_MOOD: Record<string, string> = {
  traditional:
    "classic european wine label tradition — engraved or etched illustration, refined serif typography, calm symmetry or classical hierarchy",
  contemporary:
    "modern boutique wine label — bold editorial typography, expressive illustration (linocut, silkscreen, collage, gouache), confident whitespace",
  punk: "loud natural-wine label — raw expressive artwork, punchy type, fearless colour, poster energy",
  free: "whatever serves the story best — full artistic freedom",
};

function labelTexts(d: Record<string, string>) {
  return {
    producer: d.producer || "", wine: d.wine || "Wine", appellation: d.appellation || "",
    grape: d.grape || "", vintage: d.vintage || "", region: [d.region, d.country].filter(Boolean).join(", "),
    classification: d.classification || "", special: d.special || "",
    legal: [
      [d.sweetness, d.wineColorName, "Wine"].filter(Boolean).join(" "),
      `${d.alcohol || "12.5"}% Alc. by Vol. / ${d.volume || "750"} mL`,
    ].join(" / "),
  };
}


/* COMPOSITION CARD DECK (owner 2026-08-25): each dream deals one of the
   style's arrangement cards — full coverage before any repeat, so
   consecutive dreams vary in composition, not just in dressing. */
const cardBags: Record<string, string[]> = {};
function dealCompositionCard(style: string, cards: { key: string; arrangement: string }[]): { key: string; arrangement: string } | null {
  if (!cards.length) return null;
  let bag = cardBags[style];
  if (!bag || !bag.length || !bag.every((k) => cards.some((c) => c.key === k))) {
    bag = cards.map((c) => c.key);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    cardBags[style] = bag;
  }
  const key = bag.shift() as string;
  return cards.find((c) => c.key === key) || cards[0];
}

/* three styles dream in parallel from the classic page — a burst can trip
   the images rate limit; honour the hint and retry once */
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

export interface DreamParams { vision: string; style?: string; data: Record<string, string>; sketch?: string | null }
export interface RebuildParams { dream: string; vision: string; data: Record<string, string>; style?: string }

export async function runDreamPhase(p: DreamParams): Promise<{ dream: string; prompt: string }> {
  const body = { style: p.style, sketch: p.sketch };
  const vision = p.vision;
  const texts = labelTexts(p.data);
    const style = STYLE_MOOD[String(body.style)] ? String(body.style) : "free";
    // the owner's dream-refinement corpus steers future dreams
    let guidance = "";
    let composition = "";
    try {
      const db = await getDb();
      // the dream charter: the board's spirit, distilled — never the images.
      // PER STYLE (owner 2026-08-25): each style keeps its own reference
      // board and charter; "free" dreams run uncharted.
      if (style !== "free") {
        const ch = (await db.collection("settings").findOne({ _id: `dream-charter-${style}` } as never)) as { text?: string } | null;
        if (ch?.text) guidance += ` House design spirit for this style (learned from the art director's reference labels): ${ch.text}`;
        const cd = (await db.collection("settings").findOne({ _id: `dream-cards-${style}` } as never)) as { cards?: { key: string; arrangement: string }[] } | null;
        const card = dealCompositionCard(style, cd?.cards || []);
        if (card) composition = ` COMPOSITION — arrange the label exactly in this scheme: ${card.arrangement}`;
      }
      const rows = (await db.collection("dream_feedback")
        .find({ comment: { $ne: "" } }, { projection: { _id: 0, verdict: 1, comment: 1 } })
        .sort({ at: -1 }).limit(12).toArray()) as unknown as { verdict: string; comment: string }[];
      const like = rows.filter((r) => r.verdict === "approve").map((r) => r.comment);
      const avoid = rows.filter((r) => r.verdict === "reject").map((r) => r.comment);
      if (like.length) guidance += ` The art director praised in past designs: ${like.join("; ")}.`;
      if (avoid.length) guidance += ` The art director criticised in past designs: ${avoid.join("; ")} — avoid these.`;
    } catch {}
    const prompt =
      `Design a complete, finished wine label — a flat, straight-on, full-bleed rectangular label design ` +
      `(landscape 3:2). Not a bottle photo, not a mockup: the printed label artwork itself, edge to edge. ` +
      `Style: ${STYLE_MOOD[style]}. ` +
      (vision ? `The illustration tells this story: ${vision}. ` : "") +
      `The label carries these texts — respect this visual HIERARCHY, largest to smallest: ` +
      `1) wine name "${texts.wine}" (the biggest, the hero)` +
      (texts.producer ? `, 2) producer "${texts.producer}"` : "") +
      (texts.appellation || texts.vintage
        ? `, 3) ${[texts.appellation && `appellation "${texts.appellation}"`, texts.vintage && `vintage "${texts.vintage}"`].filter(Boolean).join(" and ")}`
        : "") +
      (texts.grape || texts.region
        ? `, 4) ${[texts.grape && `grape "${texts.grape}"`, texts.region && `origin "${texts.region}"`].filter(Boolean).join(" and ")}`
        : "") +
      `, 5) small legal text "${texts.legal}" (the smallest). ` +
      (composition || ` Integrated, gallery-quality composition — type and image designed as one whole.`) +
      guidance;
    try {
      /* DREAM RULES (owner 2026-08-25): the same rule-then-verify treatment
         the image pipeline always had — prompt clauses, a vision check on
         the dream, one strict regeneration on violation. */
      const dr = await assembleDreamRules(vision);
      const makeDream = async (extra = "") => {
        const job: Record<string, unknown> = { prompt: prompt + dr.clauses + extra, size: "landscape" };
        if (body.sketch && String(body.sketch).startsWith("data:image/")) job.reference = body.sketch;
        return gen429(() => generateOpenAIImage(job as never));
      };
      let dream = await makeDream();
      try {
        const check = await verifyImage(dream, dr.checks as never);
        if (!check.ok)
          dream = await makeDream(` STRICT — the previous design violated: ${check.violations.join(" | ")}. Follow every design law exactly.`);
      } catch {}
      return { dream, prompt };
    } catch (e) {
      throw new Error(`dream failed: ${e instanceof Error ? e.message : e}`);
    }
}

export interface RebuildResult {
  spec: Record<string, unknown>; artwork: string | null; artAlign: string;
  artworkMode: "contained" | "full"; styleKey: string; fonts: string[];
  artworkError?: string;
  artInk?: { x: number; y: number; w: number; h: number } | null;
}
export async function runRebuildPhase(p: RebuildParams): Promise<RebuildResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const body = { style: p.style };
  const vision = p.vision;
  const dream = p.dream;
  const texts = labelTexts(p.data);
  // 1. transcription — replicate, don't redesign
  const model = process.env.OPENAI_VISION_MODEL || "gpt-4o";
  const sysPrompt =
    "You are a meticulous design technologist. You receive a finished wine-label design and transcribe its LAYOUT as JSON " +
    "so it can be replicated EXACTLY in vector. Read geometry, not words: for each visible text element give " +
    "box {x,y,w,h} as fractions of the image (x,y top-left corner of the text block), " +
    "role matched against the known texts (wine, producer, appellation, grape, vintage, region, classification, special, legal), " +
    "align l|c|r (relative to its own box), caps true/false, tracking 0-0.4, " +
    "font = the visually CLOSEST match from the allowed list, plus fontAlts = the 2 next-closest candidates (look at serifs, weight, width, script character), " +
    "weight 300-800, colour as exact hex sampled from the glyphs, lines (how many lines the element occupies). " +
    "Also: ground (label background hex) and artwork {coverage, box, subject (one sentence, the illustration only), palette (up to 4 hex)}. " +
    "coverage is \"full\" when the illustration/scenery/texture extends behind or around the text across most of the label (the text sits INSIDE the scene), " +
    "or \"contained\" when the illustration occupies its own clear region separate from the text; for full coverage, box = the main subject's area. " +
    'Strict JSON: {"ground":"#..","elements":[{"role":"..","box":{"x":..,"y":..,"w":..,"h":..},"align":"c","caps":true,"tracking":0.1,"font":"..","fontAlts":["..",".."],"weight":600,"colour":"#..","lines":1}],"artwork":{"box":{..},"subject":"..","palette":["#.."]}} ' +
    "Every ROLE at most once — a text split across blocks gets ONE element whose box covers all its parts.";
  let spec: Record<string, unknown> = {};
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sysPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Known label texts:\n${JSON.stringify(texts, null, 1)}\nAllowed fonts:\n${GOOGLE_FONTS.join(", ")}`,
              },
              { type: "image_url", image_url: { url: dream, detail: "high" } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`vision ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    spec = JSON.parse(json.choices?.[0]?.message?.content || "{}");
  } catch (e) {
    throw new Error(`transcription failed: ${e instanceof Error ? e.message : e}`);
  }

  /* 1b. COLOURS ARE MEASURED, NEVER GUESSED (owner report 2026-08-25: the
     vision model's hex guesses gave blue-grey text and an olive ground
     where the dream is warm parchment). We own the dream's pixels: ground
     = the dominant light tone of the page; each element's ink = the mean
     of the dark glyph pixels inside its own transcribed box. */
  try {
    const m = dream.match(/^data:image\/png;base64,(.+)$/);
    if (m) {
      const png = PNG.sync.read(Buffer.from(m[1], "base64"));
      const { width: PW, height: PH, data: px } = png;
      const hex = (r: number, g: number, b: number) =>
        "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
      // ground: mean of light pixels across the page
      let gr = 0, gg = 0, gb = 0, gn = 0;
      for (let y = 0; y < PH; y += 7) for (let x = 0; x < PW; x += 7) {
        const i = (y * PW + x) * 4;
        if (Math.min(px[i], px[i + 1], px[i + 2]) > 150) { gr += px[i]; gg += px[i + 1]; gb += px[i + 2]; gn++; }
      }
      const sp = spec as { ground?: string; elements?: { box?: { x: number; y: number; w: number; h: number }; colour?: string; caps?: boolean; lines?: number; snapped?: boolean; textH?: number }[] };
      if (gn > 50) sp.ground = hex(gr / gn, gg / gn, gb / gn);
      for (const e of sp.elements || []) {
        const b = e.box; if (!b) continue;
        const x0 = Math.max(0, Math.floor(b.x * PW)), x1 = Math.min(PW, Math.ceil((b.x + b.w) * PW));
        const y0 = Math.max(0, Math.floor(b.y * PH)), y1 = Math.min(PH, Math.ceil((b.y + b.h) * PH));
        let r = 0, g = 0, bb = 0, n = 0;
        for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
          const i = (y * PW + x) * 4;
          if (Math.min(px[i], px[i + 1], px[i + 2]) < 170) { r += px[i]; g += px[i + 1]; bb += px[i + 2]; n++; }
        }
        if (n > 12) e.colour = hex(r / n, g / n, bb / n);

        /* INK SNAP (owner GO 2026-08-25): the vision model's box is only a
           locator — its coordinates are routinely 5-10% off, and every size
           inherits the error. Measure the TRUE glyph block instead: within
           the box inflated 18%, collect pixels close to the element's own
           sampled ink colour (colour-keying separates text from scene in
           full-bleed dreams) and snap the box to their tight bounds. */
        if (n > 12 && e.colour) {
          const cN = parseInt(e.colour.slice(1), 16);
          const cr = (cN >> 16) & 255, cg = (cN >> 8) & 255, cb = cN & 255;
          const ix0 = Math.max(0, Math.floor((b.x - b.w * 0.18) * PW)), ix1 = Math.min(PW, Math.ceil((b.x + b.w * 1.18) * PW));
          const iy0 = Math.max(0, Math.floor((b.y - b.h * 0.18) * PH)), iy1 = Math.min(PH, Math.ceil((b.y + b.h * 1.18) * PH));
          let sx0 = PW, sy0 = PH, sx1 = -1, sy1 = -1, sn = 0;
          for (let y = iy0; y < iy1; y++) for (let x = ix0; x < ix1; x++) {
            const i = (y * PW + x) * 4;
            if (Math.abs(px[i] - cr) + Math.abs(px[i + 1] - cg) + Math.abs(px[i + 2] - cb) < 150) {
              sn++;
              if (x < sx0) sx0 = x; if (x > sx1) sx1 = x;
              if (y < sy0) sy0 = y; if (y > sy1) sy1 = y;
            }
          }
          if (sn > 40 && sx1 > sx0 && sy1 > sy0) {
            const nb = { x: sx0 / PW, y: sy0 / PH, w: (sx1 - sx0 + 1) / PW, h: (sy1 - sy0 + 1) / PH };
            // sanity: the snap must stay near the located box
            const ov =
              Math.max(0, Math.min(nb.x + nb.w, b.x + b.w) - Math.max(nb.x, b.x)) *
              Math.max(0, Math.min(nb.y + nb.h, b.y + b.h) - Math.max(nb.y, b.y));
            if (ov > 0.3 * b.w * b.h) {
              e.box = nb;
              e.textH = nb.h; // measured glyph-block height (fraction of image)
              e.snapped = true;
              // resample the ink colour INSIDE the snapped box — the guessed
              // box could bleed a neighbour's colour (live-observed: a black
              // producer line sampled red from the hero above it)
              let rr = 0, rg = 0, rb2 = 0, rn = 0;
              for (let y = sy0; y <= sy1; y += 2) for (let x = sx0; x <= sx1; x += 2) {
                const i = (y * PW + x) * 4;
                if (Math.min(px[i], px[i + 1], px[i + 2]) < 170) { rr += px[i]; rg += px[i + 1]; rb2 += px[i + 2]; rn++; }
              }
              if (rn > 12) e.colour = hex(rr / rn, rg / rn, rb2 / rn);
            }
          }
        }
      }

      /* ARTWORK EXTENT IS MEASURED, NOT GUESSED (owner 2026-08-25: the
         replica shrank a half-label illustration into a floating block).
         Every pixel that differs from the ground and lies outside the text
         boxes is artwork; its bbox replaces the transcribed art box, and
         the coverage call (full vs contained) comes from the same numbers. */
      try {
        const spArt = (spec as { artwork?: { box?: { x: number; y: number; w: number; h: number }; coverage?: string } }).artwork;
        const gN = sp.ground ? parseInt(sp.ground.slice(1), 16) : 0xffffff;
        const gr2 = (gN >> 16) & 255, gg2 = (gN >> 8) & 255, gb2 = gN & 255;
        const tboxes = (sp.elements || []).map((e) => e.box).filter(Boolean) as { x: number; y: number; w: number; h: number }[];
        let ax0 = PW, ay0 = PH, ax1 = -1, ay1 = -1, an = 0;
        for (let y = 0; y < PH; y += 3) {
          const fy = y / PH;
          for (let x = 0; x < PW; x += 3) {
            const i = (y * PW + x) * 4;
            if (Math.abs(px[i] - gr2) + Math.abs(px[i + 1] - gg2) + Math.abs(px[i + 2] - gb2) < 90) continue;
            const fx = x / PW;
            let inText = false;
            for (const tb of tboxes) {
              if (fx >= tb.x - 0.015 && fx <= tb.x + tb.w + 0.015 && fy >= tb.y - 0.015 && fy <= tb.y + tb.h + 0.015) { inText = true; break; }
            }
            if (inText) continue;
            an++;
            if (x < ax0) ax0 = x; if (x > ax1) ax1 = x;
            if (y < ay0) ay0 = y; if (y > ay1) ay1 = y;
          }
        }
        if (spArt && an > 300 && ax1 > ax0 && ay1 > ay0) {
          const nb = { x: ax0 / PW, y: ay0 / PH, w: (ax1 - ax0 + 1) / PW, h: (ay1 - ay0 + 1) / PH };
          spArt.box = nb;
          const share = (an * 9) / (PW * PH); // stride-3 sampling
          spArt.coverage = nb.w > 0.88 && nb.h > 0.82 && share > 0.45 ? "full" : "contained";
        }
      } catch {}
    }
  } catch {}

  /* 2. ARTWORK — the division of labour (owner 2026-08-25):
       · the DREAM decides subject + composition (+ a soft palette hint)
       · the BOARDS decide visual style: card technique language, Image
         Play refinements (favour/avoid), verified image rules
       · FLUX + the style LoRA repaints the craft (the old hybrid, with
         the dream in ChatGPT's story seat)
     Region aspect still comes from the dream so tall regions get tall art. */
  let artwork: string | null = null;
  let artworkError: string | undefined;
  let artAlign = "xMidYMid";
  let artInk: { x: number; y: number; w: number; h: number } | null = null;
  let artworkMode: "contained" | "full" = "contained";
  const art = (spec as { artwork?: { subject?: string; palette?: string[]; box?: { w: number; h: number }; coverage?: string } }).artwork;
  const styleKey = ["traditional", "contemporary", "punk"].includes(String(body.style)) ? String(body.style) : "contemporary";

  /* FULL-BLEED DREAMS (owner report 2026-08-25: a full-scene dream was
     crushed into a pasted rectangle on flat ground): when the illustration
     IS the label, the replica must be built the same way — the entire
     dream, text erased, becomes the background; the LoRA restyles the
     whole scene; vector type is set into it. */
  if (art?.coverage === "full") {
    artworkMode = "full";
    try {
      let styleLangF = "";
      try {
        const prof = (await getProfiles())[styleKey];
        const aggF = (await feedbackAggregates())[styleKey];
        const cardsF = (prof?.variants || []).filter((c) => (aggF?.weights?.[c.key] ?? 1) >= 0.5);
        const cardF = cardsF.length ? cardsF[Math.floor(Math.random() * cardsF.length)] : null;
        if (cardF) styleLangF = ` Rendering technique (the house style): ${(cardF as { language?: string }).language || [cardF.medium, cardF.mood].filter(Boolean).join("; ")}`;
        else if (prof?.charter) styleLangF = ` Rendering technique (the house style): ${prof.charter.slice(0, 500)}`;
      } catch {}
      const fullPrompt =
        `Reproduce this exact label design WITHOUT any text: erase every letter, number, word and typographic element completely, ` +
        `and keep EVERYTHING else identical — the full scene, textures, colours, composition, edge to edge. ` +
        `Where text was, continue the underlying scene/texture naturally.` + styleLangF;
      const makeFull = (extra = "") =>
        gen429(() => generateOpenAIImage({ prompt: fullPrompt + extra, size: { w: 1536, h: 1024 }, reference: dream } as never));
      const craftFull = (base: string) =>
        restyleWithFlux(
          base,
          { shortPrompt: `${art?.subject || vision}. Keep the exact composition — repaint only the rendering technique. No text anywhere.`, art: { preset: `${styleKey}/dream` } } as never,
          { width: 832, height: 512 }
        ).catch(() => base);
      let raw = await craftFull(await makeFull());
      try {
        const check = await verifyImage(raw, [NO_TEXT_RULE]);
        if (!check.ok) raw = await craftFull(await makeFull(` STRICT: the previous attempt still contained lettering — ${check.violations.join(" | ")}.`));
      } catch {}
      artwork = finishArtwork(raw); // opaque full background — no keying
    } catch (e) {
      console.error("dream full-bleed artwork failed:", e instanceof Error ? e.message : e);
      artwork = null;
      artworkError = e instanceof Error ? e.message : String(e);
    }
    return { spec, artwork, artAlign, artworkMode, styleKey, fonts: GOOGLE_FONTS, artworkError };
  }

  try {
    const palette = (art?.palette || []).filter((h) => /^#[0-9a-fA-F]{6}$/.test(h));
    const bx = art?.box;
    const regionAspect = bx && bx.h > 0 ? (bx.w * 1536) / (bx.h * 1024) : 1.5;
    const size = regionAspect < 0.83 ? { w: 1024, h: 1536 } : regionAspect > 1.2 ? { w: 1536, h: 1024 } : { w: 1024, h: 1024 };
    const fluxSizeOv = regionAspect < 0.83 ? { width: 512, height: 832 } : regionAspect > 1.2 ? { width: 832, height: 512 } : { width: 640, height: 640 };

    // style language: a board card (non-rejected, random) + refinement lines
    let styleLang = "", fbLines = "";
    try {
      const prof = (await getProfiles())[styleKey];
      const agg = (await feedbackAggregates())[styleKey];
      const cards = (prof?.variants || []).filter((c) => (agg?.weights?.[c.key] ?? 1) >= 0.5);
      const card = cards.length ? cards[Math.floor(Math.random() * cards.length)] : null;
      if (card)
        styleLang =
          ` Visual style (the house technique — it OVERRIDES the reference design's rendering): ` +
          `${(card as { language?: string }).language || [card.medium, card.mood].filter(Boolean).join("; ")}`;
      else if (prof?.charter) styleLang = ` Visual style (the house technique): ${prof.charter.slice(0, 600)}`;
      if (agg?.favour?.length) fbLines += ` Favour: ${agg.favour.slice(0, 4).join("; ")}.`;
      if (agg?.avoid?.length) fbLines += ` Avoid: ${agg.avoid.slice(0, 4).join("; ")}.`;
    } catch {}
    let userRules = "";
    try {
      userRules = ruleLines(await getImageRules(), styleKey).map((l) => ` ${l}.`).join("");
    } catch {}

    const sketchPrompt =
      `Recreate this illustration exactly — the same subject, the same composition, every element in the same place — filling the whole canvas. ` +
      (art?.subject ? `The illustration: ${art.subject}. ` : "") +
      `Remove any text, letters or numbers completely.` +
      styleLang + fbLines + userRules +
      (palette.length ? ` Palette leaning: ${palette.join(", ")}.` : "") +
      ` Single composition on a pure white background; its edges dissolve into white; no borders or frames.`;

    /* the reference is a CROP of the dream's own illustration region —
       handing the model the whole dream let it recompose the scene
       (subject re-centred, rooster cropped, live-observed) */
    let artRef = dream;
    try {
      const m2 = dream.match(/^data:image\/png;base64,(.+)$/);
      if (m2 && bx && bx.w > 0.05 && bx.h > 0.05) {
        const img = sharp(Buffer.from(m2[1], "base64"));
        const meta = await img.metadata();
        const MW = meta.width || 1536, MH = meta.height || 1024;
        const bxy = bx as unknown as { x: number; y: number; w: number; h: number };
        const left = Math.max(0, Math.floor(bxy.x * MW));
        const top = Math.max(0, Math.floor(bxy.y * MH));
        const cw = Math.min(MW - left, Math.ceil(bx.w * MW));
        const chh = Math.min(MH - top, Math.ceil(bx.h * MH));
        if (cw > 60 && chh > 60) {
          const crop = await sharp(Buffer.from(m2[1], "base64")).extract({ left, top, width: cw, height: chh }).png().toBuffer();
          artRef = `data:image/png;base64,${crop.toString("base64")}`;
        }
      }
    } catch {}

    const makeBase = (extra = "") =>
      gen429(() => generateOpenAIImage({ prompt: sketchPrompt + extra, size, reference: artRef } as never));
    const craft = (base: string) =>
      restyleWithFlux(
        base,
        {
          shortPrompt:
            `${art?.subject || vision}. Keep the exact composition of the input image — repaint only the rendering technique. ` +
            `No text, no borders, pure white background.`,
          art: { preset: `${styleKey}/dream` },
        } as never,
        fluxSizeOv
      ).catch(() => base); // no LoRA / flux hiccup → the styled base still stands

    let raw = await craft(await makeBase());
    // verify the core laws (text leakage from the dream is the big one)
    try {
      const check = await verifyImage(raw, [NO_TEXT_RULE, WHITE_BG_RULE, NO_BORDER_RULE]);
      if (!check.ok) raw = await craft(await makeBase(` STRICT — the previous attempt violated: ${check.violations.join(" | ")}.`));
    } catch {}
    raw = finishArtwork(raw); // soft palette hint only — no mechanical lock (owner)
    try {
      const an = analyzeArtwork(raw);
      const cx = an?.centroid?.x ?? 0.5, cy = an?.centroid?.y ?? 0.5;
      artAlign = `x${cx < 0.42 ? "Min" : cx > 0.58 ? "Max" : "Mid"}Y${cy < 0.42 ? "Min" : cy > 0.58 ? "Max" : "Mid"}`;
      /* CONTENT-PINNED PLACEMENT (owner round 3): the generated artwork has
         its own internal margins — aligning its rectangle to the dream box
         still lets the subject wander. Ship the INK bbox so the engine can
         map the content itself onto the dream's measured artwork box. */
      if (an?.bboxFull || an?.bbox) artInk = (an.bboxFull || an.bbox) as { x: number; y: number; w: number; h: number };
    } catch {}
    artwork = keyArtwork(raw);
  } catch (e) {
    console.error("dream artwork failed:", e instanceof Error ? e.message : e);
    artwork = null;
    artworkError = e instanceof Error ? e.message : String(e);
  }

  return { spec, artwork, artAlign, artworkMode, styleKey, fonts: GOOGLE_FONTS, artworkError, artInk };
}
