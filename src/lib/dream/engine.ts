import { generateOpenAIImage } from "@/lib/image-provider/openai";
import { finishArtwork, keyArtwork } from "@/lib/image-provider";
import { restyleWithFlux } from "@/lib/image-provider/flux";
import { getProfiles } from "@/lib/admin/style-refs";
import { feedbackAggregates } from "@/lib/admin/feedback";
import { getImageRules, ruleLines, verifyImage, NO_TEXT_RULE, WHITE_BG_RULE, NO_BORDER_RULE, NO_GLITCH_RULE } from "@/lib/admin/image-rules";
import { assembleDreamRules } from "@/lib/dream/rules";
import { analyzeArtwork } from "@/lib/admin/art-analysis";
import { getDb } from "@/lib/db";
import { PNG } from "pngjs";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

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
  punk:
    /* owner 2026-09-06: NO background/colour directives for punk — the
       image alone dictates its ground (supersedes "one painted world") */
    "loud natural-wine label — raw expressive artwork, punchy type, poster energy",
  minimalist:
    "minimalist wine label — restraint above all: generous empty ground, very few elements, one quiet motif or subtle abstraction, precise understated typography, calm confident whitespace",
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

/* every processed pair joins a small regression corpus — a failing dream
   must never be lost to the next run's overwrite (owner 2026-08-31) */
function archivePair(dream: string, result: unknown) {
  try {
    const dir = path.join(process.cwd(), "data", "debug", "pairs");
    fs.mkdirSync(dir, { recursive: true });
    let h = 0;
    for (let i = 0; i < Math.min(4096, dream.length); i++) h = (h * 31 + dream.charCodeAt(i)) >>> 0;
    const f = path.join(dir, `pair-${h.toString(16)}.json`);
    if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify({ dream, ...(result as object) }));
  } catch {}
}

export interface DreamParams { vision: string; style?: string; data: Record<string, string>; sketch?: string | null; aspect?: string }
export interface RebuildParams { dream: string; vision: string; data: Record<string, string>; style?: string; reuseArtwork?: string | null }

export async function runDreamPhase(p: DreamParams): Promise<{ dream: string; prompt: string; preview?: string }> {
  const body = { style: p.style, sketch: p.sketch };
  const vision = p.vision;
  const texts = labelTexts(p.data);
    const style = ["traditional", "contemporary", "punk", "minimalist"].includes(String(body.style)) ? String(body.style) : "traditional";
    // the owner's dream-refinement corpus steers future dreams
    let guidance = "";
    let composition = "";
    let compositionCheck = "";
    try {
      const db = await getDb();
      // the dream charter: the board's spirit, distilled — never the images.
      // PER STYLE (owner 2026-08-25): each style keeps its own reference
      // board and charter; "free" dreams run uncharted.
      if (style !== "free") {
        const ch = (await db.collection("settings").findOne({ _id: `dream-charter-${style}` } as never)) as { text?: string } | null;
        if (ch?.text) {
          /* owner 2026-09-06: punk grounds are entirely the image's own
             choice — strip the charter's "Grounds:" colour sentence for
             punk (supersedes the 2026-09-03 "charter Grounds language
             stays active" ruling, for punk only) */
          const doctrine = style === "punk"
            ? ch.text.replace(/Grounds:[^.]*(\.|$)/gi, "").replace(/\s{2,}/g, " ").trim()
            : ch.text;
          guidance += ` House LAYOUT doctrine for this style (learned from the art director's reference labels — hierarchy, alignment, density${style === "punk" ? "" : ", grounds"}; the illustration's artistic style is governed separately below): ${doctrine}`;
        }
        const cd = (await db.collection("settings").findOne({ _id: `dream-cards-${style}` } as never)) as { cards?: { key: string; arrangement: string }[] } | null;
        const card = dealCompositionCard(style, cd?.cards || []);
        if (card) {
          const contained = !/bleed/i.test(card.arrangement);
          composition =
            ` COMPOSITION — NON-NEGOTIABLE, follow this scheme exactly: ${card.arrangement}` +
            (contained
              ? " The illustration is CONTAINED: a discrete image surrounded by clean, flat label ground on every side — it must NOT fill the label, must NOT become a full scene, and must NOT touch any edge."
              : "");
          if (contained) compositionCheck =
            "Does the illustration spread to fill most of the label or reach the label edges, instead of sitting contained with clear label ground around it?";
        }
      }
      /* THE REORGANISATION (owner 2026-08-31): the illustration inside the
         dream IS the final art now, so the whole image-quality system —
         reference boards, derived style cards, Image Play feedback
         weights — steers the DREAM's illustration directly. Nothing built
         was wasted; it changed address. */
      try {
        const prof = (await getProfiles())[style];
        const aggD = (await feedbackAggregates())[style];
        const liveCards = (prof?.variants || []).filter((c) => (aggD?.weights?.[c.key] ?? 1) >= 0.5);
        /* SUB-STYLE DECK (owner 2026-08-31, "the shuffle is not happening"):
           illustration styles deal from a shuffled bag exactly like the
           composition cards — every sub-style appears before any repeats,
           so consecutive dreams cannot share a look by accident */
        const dealtI = liveCards.length
          ? dealCompositionCard(`ill-${style}`, liveCards.map((c) => ({ key: c.key, arrangement: c.key })))
          : null;
        const cardI = dealtI ? liveCards.find((c) => c.key === dealtI.key) || null : null;
        const lang = cardI ? ((cardI as { language?: string }).language || [cardI.medium, cardI.mood].filter(Boolean).join("; ")) : prof?.charter?.slice(0, 400);
        if (lang) guidance += ` The ILLUSTRATION inside the label is executed in the house illustration style: ${lang}.`;
      } catch {}
      /* comments steer ONLY their own style (owner 2026-09-03: a
         minimalist "smaller image" note was homogenising every style) */
      const rows = (await db.collection("dream_feedback")
        .find({ comment: { $ne: "" }, style }, { projection: { _id: 0, verdict: 1, comment: 1 } })
        .sort({ at: -1 }).limit(12).toArray()) as unknown as { verdict: string; comment: string }[];
      const like = rows.filter((r) => r.verdict === "approve").map((r) => r.comment);
      const avoid = rows.filter((r) => r.verdict === "reject").map((r) => r.comment);
      if (like.length) guidance += ` The art director praised in past designs: ${like.join("; ")}.`;
      if (avoid.length) guidance += ` The art director criticised in past designs: ${avoid.join("; ")} — avoid these.`;
    } catch {}
    const prompt =
      `Design a complete, finished wine label — a flat, straight-on, full-bleed rectangular label design ` +
      `(${p.aspect === "portrait" ? "portrait 2:3" : p.aspect === "square" ? "square" : "landscape 3:2"}). ` +
      `Not a bottle photo, not a mockup: the printed label artwork itself, edge to edge. ` +
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
      const dr = await assembleDreamRules(vision, style);
      if (compositionCheck) dr.checks.push({ src: "composition card (contained)", check: compositionCheck });
      /* PROOFREAD (owner 2026-09-03): the label is all AI-painted text now —
         every dream is spell-checked against the EXACT brief texts; typos,
         doubled lines or invented wording trigger the strict redream */
      dr.checks.push({
        src: "proofread",
        check:
          `Compare every piece of wording on the label to EXACTLY these intended texts: ${JSON.stringify(texts)}. ` +
          "Answer yes if any word is misspelled, doubled, truncated or garbled, if any line appears twice, " +
          "or if wording appears that is not on the list. Ignore print too small to read.",
      });
      const makeDream = async (extra = "") => {
        const job: Record<string, unknown> = {
          prompt: prompt + dr.clauses + extra,
          size: p.aspect === "portrait" ? { w: 1024, h: 1536 } : p.aspect === "square" ? { w: 1024, h: 1024 } : { w: 1536, h: 1024 },
        };
        if (body.sketch && String(body.sketch).startsWith("data:image/")) job.reference = body.sketch;
        return gen429(() => generateOpenAIImage(job as never));
      };
      let dream = await makeDream();
      try {
        const check = await verifyImage(dream, dr.checks as never);
        if (!check.ok)
          dream = await makeDream(` STRICT — the previous design violated: ${check.violations.join(" | ")}. Follow every design law exactly.`);
      } catch {}
      /* medium-res JPEG for admin/refinement views (owner 2026-09-03) —
         the full PNG stays the print source */
      let preview: string | undefined;
      try {
        const b64 = dream.split(",")[1];
        if (b64) {
          const jb = await sharp(Buffer.from(b64, "base64")).resize(1024).jpeg({ quality: 82 }).toBuffer();
          preview = "data:image/jpeg;base64," + jb.toString("base64");
        }
      } catch {}
      return { dream, prompt, preview };
    } catch (e) {
      throw new Error(`dream failed: ${e instanceof Error ? e.message : e}`);
    }
}

export interface RebuildResult {
  spec: Record<string, unknown>; artwork: string | null; artAlign: string;
  artworkMode: "contained" | "full" | "canvas"; styleKey: string; fonts: string[];
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
    'Strict JSON: {"ground":"#..","elements":[{"role":"..","box":{"x":..,"y":..,"w":..,"h":..},"align":"c","caps":true,"arc":false,"tracking":0.1,"font":"..","fontAlts":["..",".."],"weight":600,"colour":"#..","lines":1}],"artwork":{"box":{..},"subject":"..","palette":["#.."]}} ' +
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
  /* an empty transcription must retry once, then fail LOUDLY — geometry no
     longer depends on it, but roles/fonts do, and a silent empty spec used
     to render a bare label (owner 2026-08-28: back-to-back runs flaked) */
  if (!Array.isArray((spec as { elements?: unknown[] }).elements) || !(spec as { elements: unknown[] }).elements.length) {
    try {
      const res2 = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model, response_format: { type: "json_object" },
          messages: [
            { role: "system", content: sysPrompt },
            { role: "user", content: [
              { type: "text", text: `Known label texts:\n${JSON.stringify(texts, null, 1)}\nAllowed fonts:\n${GOOGLE_FONTS.join(", ")}` },
              { type: "image_url", image_url: { url: dream, detail: "high" } },
            ] },
          ],
        }),
      });
      const json2 = (await res2.json()) as { choices?: { message?: { content?: string } }[] };
      spec = JSON.parse(json2.choices?.[0]?.message?.content || "{}");
    } catch {}
    if (!Array.isArray((spec as { elements?: unknown[] }).elements) || !(spec as { elements: unknown[] }).elements.length)
      throw new Error("transcription returned no elements twice — not rendering a bare label");
  }
  /* TOPOLOGY ENSEMBLE (owner escalation 2026-08-31): one vision reading
     sometimes returns a wildly wrong box and the snap inherits it. Two
     extra readings run in parallel and each role keeps the MEDIAN box
     centre — a single bad reading can never win. (~2¢; canvas mode saved
     far more by retiring generation.) */
  try {
    const readOnce = async () => {
      const rr = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model, response_format: { type: "json_object" },
          messages: [
            { role: "system", content: sysPrompt },
            { role: "user", content: [
              { type: "text", text: `Known label texts:\n${JSON.stringify(texts, null, 1)}\nAllowed fonts:\n${GOOGLE_FONTS.join(", ")}` },
              { type: "image_url", image_url: { url: dream, detail: "high" } },
            ] },
          ],
        }),
      });
      if (!rr.ok) return null;
      const jj = (await rr.json()) as { choices?: { message?: { content?: string } }[] };
      try { return JSON.parse(jj.choices?.[0]?.message?.content || "{}") as Record<string, unknown>; } catch { return null; }
    };
    const extras = (await Promise.all([readOnce(), readOnce()])).filter(Boolean) as Record<string, unknown>[];
    const all = [spec, ...extras];
    type El = { role?: string; box?: { x: number; y: number; w: number; h: number } };
    const els0 = ((spec as { elements?: El[] }).elements || []);
    for (const e of els0) {
      if (!e.role || !e.box) continue;
      const boxes = all
        .map((sp2) => ((sp2 as { elements?: El[] }).elements || []).find((e2) => e2.role === e.role)?.box)
        .filter((b): b is { x: number; y: number; w: number; h: number } => !!b && b.w > 0 && b.h > 0);
      if (boxes.length < 2) continue;
      const med = (vs: number[]) => vs.sort((a, b2) => a - b2)[Math.floor(vs.length / 2)];
      const cx = med(boxes.map((b) => b.x + b.w / 2)), cyv = med(boxes.map((b) => b.y + b.h / 2));
      const wv = med(boxes.map((b) => b.w)), hv = med(boxes.map((b) => b.h));
      e.box = { x: cx - wv / 2, y: cyv - hv / 2, w: wv, h: hv };
    }
  } catch {}

  let canvasArt: string | null = null;
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
      /* ground = the DOMINANT colour of the page (owner escalation
         2026-08-28: a yellow punk ground read as "dark" under the old
         light-pixel test, so the whole label became artwork). Modal
         histogram bin, falling back to light-pixel mean on busy pages. */
      let gr = 0, gg = 0, gb = 0, gn = 0;
      {
        const bins = new Map<number, { r: number; g: number; b: number; n: number }>();
        let samples = 0;
        for (let y = 0; y < PH; y += 5) for (let x = 0; x < PW; x += 5) {
          const i = (y * PW + x) * 4;
          samples++;
          const k = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
          const b0 = bins.get(k) || { r: 0, g: 0, b: 0, n: 0 };
          b0.r += px[i]; b0.g += px[i + 1]; b0.b += px[i + 2]; b0.n++;
          bins.set(k, b0);
        }
        let top: { r: number; g: number; b: number; n: number } | null = null;
        for (const b0 of bins.values()) if (!top || b0.n > top.n) top = b0;
        if (top && top.n > samples * 0.08) { gr = top.r; gg = top.g; gb = top.b; gn = top.n; }
        else {
          for (let y = 0; y < PH; y += 7) for (let x = 0; x < PW; x += 7) {
            const i = (y * PW + x) * 4;
            if (Math.min(px[i], px[i + 1], px[i + 2]) > 150) { gr += px[i]; gg += px[i + 1]; gb += px[i + 2]; gn++; }
          }
        }
      }
      const sp = spec as { ground?: string; elements?: { role?: string; box?: { x: number; y: number; w: number; h: number }; colour?: string; caps?: boolean; lines?: number; snapped?: boolean; textH?: number; capsSeg?: boolean; tracking?: number; trackSeg?: number; arc?: boolean; arcSag?: number; clearGlyphs?: { x: number; y: number; w: number; h: number; allow: number }[] }[] };
      if (gn > 50) sp.ground = hex(gr / gn, gg / gn, gb / gn);
      /* DETERMINISTIC SEGMENTATION (owner GO 2026-08-27): the dream is
         segmented ONCE, from pixels alone, with connected-component
         analysis — the technique OCR has used for decades. Every ink shape
         is found and classified as GLYPH or ARTWORK by stroke geometry
         (letters are small, thin-stroked, row-aligned; artwork is large or
         thick or dense); glyphs cluster into text lines. No vision-model
         coordinate touches geometry: the same dream yields the same
         regions on every run. The transcriber only labels roles/fonts. */
      const spArtPre = (spec as { artwork?: { box?: { x: number; y: number; w: number; h: number }; coverage?: string } }).artwork;
      {
        const G0 = gn > 0 ? { r: gr / gn, g: gg / gn, b: gb / gn } : { r: 245, g: 242, b: 235 };
        /* LOCAL grounds (owner failure 2026-08-31: pink sky + yellow earth —
           one global ground made half the page read as ink and the giant
           hero drowned in it): per-tile modal colour, bilinearly blended,
           so ink = "different from the paper RIGHT HERE" */
        const TX = 12, TY = 8;
        const tileG = new Float64Array(TX * TY * 3);
        {
          for (let ty = 0; ty < TY; ty++) for (let tx = 0; tx < TX; tx++) {
            const x0t = Math.floor((tx * PW) / TX), x1t = Math.floor(((tx + 1) * PW) / TX);
            const y0t = Math.floor((ty * PH) / TY), y1t = Math.floor(((ty + 1) * PH) / TY);
            const bins = new Map<number, { r: number; g: number; b: number; n: number }>();
            for (let y = y0t; y < y1t; y += 3) for (let x = x0t; x < x1t; x += 3) {
              const i = (y * PW + x) * 4;
              const k = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
              const b0 = bins.get(k) || { r: 0, g: 0, b: 0, n: 0 };
              b0.r += px[i]; b0.g += px[i + 1]; b0.b += px[i + 2]; b0.n++;
              bins.set(k, b0);
            }
            let top: { r: number; g: number; b: number; n: number } | null = null;
            for (const b0 of bins.values()) if (!top || b0.n > top.n) top = b0;
            const o = (ty * TX + tx) * 3;
            tileG[o] = top ? top.r / top.n : G0.r; tileG[o + 1] = top ? top.g / top.n : G0.g; tileG[o + 2] = top ? top.b / top.n : G0.b;
          }
          /* a huge display name can DOMINATE its tiles — the "ground"
             becomes the ink colour and those letters turn invisible to
             every later stage (owner ghost 2026-08-31). A 3×3 spatial
             median per channel restores the true paper: an ink-dominated
             tile is an outlier among its neighbours. */
          const tileG2 = new Float64Array(tileG);
          for (let ty = 0; ty < TY; ty++) for (let tx = 0; tx < TX; tx++) {
            for (let ch = 0; ch < 3; ch++) {
              const vals: number[] = [];
              for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const ny = ty + dy, nx2 = tx + dx;
                if (ny < 0 || nx2 < 0 || ny >= TY || nx2 >= TX) continue;
                vals.push(tileG2[(ny * TX + nx2) * 3 + ch]);
              }
              vals.sort((a2, b3) => a2 - b3);
              tileG[(ty * TX + tx) * 3 + ch] = vals[Math.floor(vals.length / 2)];
            }
          }
        }
        const localG = (x: number, y: number, ch: number) => {
          const fx = Math.min(TX - 1.001, Math.max(0, (x / PW) * TX - 0.5));
          const fy = Math.min(TY - 1.001, Math.max(0, (y / PH) * TY - 0.5));
          const ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy;
          const v = (xx: number, yy: number) => tileG[(yy * TX + xx) * 3 + ch];
          return (v(ix, iy) * (1 - ax) + v(ix + 1, iy) * ax) * (1 - ay) + (v(ix, iy + 1) * (1 - ax) + v(ix + 1, iy + 1) * ax) * ay;
        };
        const lbl = new Int32Array(PW * PH); // 0 = unvisited/ground
        const stack = new Int32Array(PW * PH);
        interface Comp { x0: number; y0: number; x1: number; y1: number; area: number; per: number; r: number; g: number; b: number; ws: number; id: number }
        const comps: Comp[] = [];
        /* ink = anything far from the ground colour — dark serif on cream
           AND pink display caps on yellow (owner escalation 2026-08-28).
           HYSTERESIS: only strong ink SEEDS a shape; weaker pixels may
           only join one — so faint paper grain and light stipple cannot
           spawn phantom shapes, while true strokes keep their edges. */
        const gDist = (x: number, y: number) => {
          const i = (y * PW + x) * 4;
          return Math.abs(px[i] - localG(x, y, 0)) + Math.abs(px[i + 1] - localG(x, y, 1)) + Math.abs(px[i + 2] - localG(x, y, 2));
        };
        const isDark = (x: number, y: number) => gDist(x, y) > 120;
        const isSeed = (x: number, y: number) => gDist(x, y) > 210;
        let nextLbl = 0;
        for (let sy = 0; sy < PH; sy++) for (let sx = 0; sx < PW; sx++) {
          const si = sy * PW + sx;
          if (lbl[si] !== 0 || !isSeed(sx, sy)) continue;
          const spi = si * 4;
          const sr = px[spi], sg = px[spi + 1], sb = px[spi + 2];
          nextLbl++;
          const c: Comp = { x0: sx, y0: sy, x1: sx, y1: sy, area: 0, per: 0, r: 0, g: 0, b: 0, ws: 0, id: nextLbl };
          let sp2 = 0; stack[sp2++] = si; lbl[si] = nextLbl;
          while (sp2 > 0) {
            const ci = stack[--sp2];
            const cx = ci % PW, cy = (ci / PW) | 0;
            c.area++;
            const pi = ci * 4;
            /* colour weighted by ink-ness squared: the glyph CORE decides
               the colour, not the antialiased edge blended with ground
               (owner: "almost never the colours are replicated") */
            const dg = Math.abs(px[pi] - localG(cx, cy, 0)) + Math.abs(px[pi + 1] - localG(cx, cy, 1)) + Math.abs(px[pi + 2] - localG(cx, cy, 2));
            const wq = dg * dg;
            c.r += px[pi] * wq; c.g += px[pi + 1] * wq; c.b += px[pi + 2] * wq; c.ws += wq;
            if (cx < c.x0) c.x0 = cx; if (cx > c.x1) c.x1 = cx;
            if (cy < c.y0) c.y0 = cy; if (cy > c.y1) c.y1 = cy;
            for (let d = 0; d < 4; d++) {
              const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
              const ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
              if (nx < 0 || ny < 0 || nx >= PW || ny >= PH) { c.per++; continue; }
              const ni = ny * PW + nx;
              if (!isDark(nx, ny)) { c.per++; continue; }
              /* colour-constrained growth (owner failure 2026-08-31): a
                 letter TOUCHING artwork must not fuse with it — grow only
                 into pixels of similar colour to the seed, so a purple
                 glyph stops at a teal leaf even where they meet */
              const npi = ni * 4;
              if (Math.abs(px[npi] - sr) + Math.abs(px[npi + 1] - sg) + Math.abs(px[npi + 2] - sb) > 150) { c.per++; continue; }
              if (lbl[ni] === 0) { lbl[ni] = nextLbl; stack[sp2++] = ni; }
            }
          }
          if (c.area >= 6) comps.push(c);
        }
        /* classify: glyph vs artwork by stroke geometry */
        const isGlyph = (c: Comp) => {
          const h = c.y1 - c.y0 + 1, w = c.x1 - c.x0 + 1;
          /* ceiling raised to display size (owner failure 2026-08-31: a
             giant arced hero read as ARTWORK, so the wine name matched a
             bottom line instead) — the stroke test still keeps art blobs
             out: letters are thin relative to their height, blobs are not */
          if (h < PH * 0.006 || h > PH * 0.24) return false;
          if (w > PW * 0.4) return false;
          if (c.area > PW * PH * 0.035) return false;
          const stroke = (2 * c.area) / Math.max(1, c.per); // ~stroke width
          if (stroke > 0.45 * h) return false;              // blobs are art
          return true;
        };
        const glyphs = comps.filter(isGlyph).filter((c) =>
          c.x0 > PW * 0.008 && c.y0 > PH * 0.008 && c.x1 < PW * 0.992 && c.y1 < PH * 0.992);
        const artComps = comps.filter((c) => !isGlyph(c) && c.area > PW * PH * 0.0004);
        /* glyphs → text lines: cluster by vertical overlap of bboxes */
        interface Line { y0: number; y1: number; x0: number; x1: number; n: number; r: number; g: number; b: number; area: number; ws: number; used?: boolean; gs: Comp[] }
        /* LINE TRACING (owner failure 2026-08-31: loose vertical-overlap
           clustering chained a huge arced hero together with every leaf
           into one mega-blob). A text line is a RUN: similar-height shapes
           marching left to right, each close behind the last, baseline
           continuous — that follows an arc and refuses scattered foliage. */
        const lines: Line[] = [];
        const byX = [...glyphs].sort((a, b2) => a.x0 - b2.x0 || a.y0 - b2.y0);
        const usedG = new Set<Comp>();
        for (const g0 of byX) {
          if (usedG.has(g0)) continue;
          const chain: Comp[] = [g0]; usedG.add(g0);
          let cur = g0;
          for (;;) {
            let best: Comp | null = null, bestGap = Infinity;
            for (const g of byX) {
              if (usedG.has(g) || g.x0 <= cur.x0) continue;
              const h1 = cur.y1 - cur.y0 + 1, h2 = g.y1 - g.y0 + 1;
              const hm = Math.max(h1, h2);
              const gap = g.x0 - cur.x1;
              /* 3.5×: small legal text has wide " / " separators */
              if (g.x0 - cur.x1 > 3.5 * (cur.y1 - cur.y0 + 1) && g.x0 - cur.x1 > 3.5 * hm) break;
              if (gap > 3.5 * hm) continue;
              if (gap < -0.5 * hm) continue;
              if (Math.abs((g.y0 + g.y1) / 2 - (cur.y0 + cur.y1) / 2) > 0.75 * hm) continue;
              const hr = h2 / h1;
              if (hr < 0.45 || hr > 2.2) continue;
              if (gap < bestGap) { bestGap = gap; best = g; }
            }
            if (!best) break;
            chain.push(best); usedG.add(best); cur = best;
          }
          const ln: Line = { y0: chain[0].y0, y1: chain[0].y1, x0: chain[0].x0, x1: chain[0].x1, n: 0, area: 0, ws: 0, r: 0, g: 0, b: 0, gs: [] };
          for (const g of chain) {
            ln.y0 = Math.min(ln.y0, g.y0); ln.y1 = Math.max(ln.y1, g.y1);
            ln.x0 = Math.min(ln.x0, g.x0); ln.x1 = Math.max(ln.x1, g.x1);
            ln.n++; ln.area += g.area; ln.ws += g.ws; ln.r += g.r; ln.g += g.g; ln.b += g.b; ln.gs.push(g);
          }
          lines.push(ln);
        }
        /* a line is one run of letters — a speck that merely shares the
           row's height must not stretch its box. Split each line at
           x-gaps far wider than the letter spacing and keep the dominant
           cluster. */
        for (const ln of lines) {
          if (ln.gs.length < 3) continue;
          const byX = [...ln.gs].sort((a2, b3) => a2.x0 - b3.x0);
          const hMed0 = byX.map((g2) => g2.y1 - g2.y0 + 1).sort((a2, b3) => a2 - b3)[Math.floor(byX.length / 2)];
          const clusters: Comp[][] = [[byX[0]]];
          for (let gi = 1; gi < byX.length; gi++) {
            const gap = byX[gi].x0 - byX[gi - 1].x1;
            if (gap > 2.5 * hMed0) clusters.push([byX[gi]]);
            else clusters[clusters.length - 1].push(byX[gi]);
          }
          if (clusters.length < 2) continue;
          const keep = clusters.reduce((a2, b3) => (b3.length > a2.length ? b3 : a2));
          ln.gs = keep; ln.n = keep.length;
          ln.x0 = Math.min(...keep.map((g2) => g2.x0)); ln.x1 = Math.max(...keep.map((g2) => g2.x1));
          ln.y0 = Math.min(...keep.map((g2) => g2.y0)); ln.y1 = Math.max(...keep.map((g2) => g2.y1));
          ln.area = keep.reduce((a2, g2) => a2 + g2.area, 0);
          ln.ws = keep.reduce((a2, g2) => a2 + g2.ws, 0);
          ln.r = keep.reduce((a2, g2) => a2 + g2.r, 0); ln.g = keep.reduce((a2, g2) => a2 + g2.g, 0); ln.b = keep.reduce((a2, g2) => a2 + g2.b, 0);
        }
        /* artwork bbox from art components */
        let artArea = 0;
        const colM = new Float64Array(PW), rowM = new Float64Array(PH);
        for (const c of artComps) {
          artArea += c.area;
          const cw = c.x1 - c.x0 + 1, chh = c.y1 - c.y0 + 1;
          for (let x = c.x0; x <= c.x1; x++) colM[x] += c.area / cw;
          for (let y = c.y0; y <= c.y1; y++) rowM[y] += c.area / chh;
        }
        /* the measured box holds 96% of the ink mass — outlier specks and
           stray bushes at the edges no longer stretch it (owner
           2026-08-28: "image ink area often changes in replica") */
        const trim = artArea * 0.02;
        const walk = (m: Float64Array, len: number, dir: 1 | -1) => {
          let cum = 0, i = dir === 1 ? 0 : len - 1;
          while (i >= 0 && i < len && cum + m[i] <= trim) { cum += m[i]; i += dir; }
          return i;
        };
        const ax0 = walk(colM, PW, 1), ax1 = walk(colM, PW, -1);
        const ay0 = walk(rowM, PH, 1), ay1 = walk(rowM, PH, -1);
        const haveArt = ax1 > ax0 && ay1 > ay0 && artArea > PW * PH * 0.01;
        const artBB = haveArt ? { x: ax0 / PW, y: ay0 / PH, w: (ax1 - ax0 + 1) / PW, h: (ay1 - ay0 + 1) / PH } : null;
        const coverageFull = !!artBB && artBB.w > 0.88 && artBB.h > 0.82 && artArea / (PW * PH) > 0.4;
        /* a real text line has several glyphs, is wider than tall, and is
           NOT buried inside the artwork — stippled textures shed small
           components that mimic letters, so any line mostly covered by
           artwork components is part of the picture, not typesetting */
        const artCover = (x0: number, y0: number, x1: number, y1: number) => {
          const a = Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1));
          let cov = 0;
          for (const c of artComps) {
            const iw = Math.min(x1, c.x1) - Math.max(x0, c.x0) + 1;
            const ih = Math.min(y1, c.y1) - Math.max(y0, c.y0) + 1;
            if (iw > 0 && ih > 0) cov += iw * ih;
          }
          return Math.min(1, cov / a);
        };
        /* a glyph is BURIED when its immediate surroundings are ink — the
           local truth (owner failure 2026-08-31: an arced hero's bounding
           box contains the tree canopy, so box-overlap rejected the whole
           name; meanwhile stipple phantoms sit in dense strokes on every
           side). Ring of 3px outside the glyph bbox, foreign-ink fraction. */
        /* only ARTWORK ink counts as burial: a letter's neighbours are its
           sibling letters (any candidate line's glyphs) and they must not
           bury it — foliage has no such alibi (owner 2026-08-31) */
        const candGlyphIds = new Set<number>();
        for (const ln of lines) if (ln.n >= 2 && (ln.x1 - ln.x0) > 1.5 * (ln.y1 - ln.y0)) for (const g2 of ln.gs) candGlyphIds.add(g2.id);
        const ringInk = (g2: Comp) => {
          let ink = 0, tot = 0;
          const m = 3;
          const probe = (x: number, y: number) => {
            if (x < 0 || y < 0 || x >= PW || y >= PH) return;
            tot++;
            const l2 = lbl[y * PW + x];
            if (l2 !== g2.id && !candGlyphIds.has(l2) && gDist(x, y) > 120) ink++;
          };
          for (let x = g2.x0 - m; x <= g2.x1 + m; x += 2) { probe(x, g2.y0 - m); probe(x, g2.y1 + m); }
          for (let y = g2.y0 - m; y <= g2.y1 + m; y += 2) { probe(g2.x0 - m, y); probe(g2.x1 + m, y); }
          return tot ? ink / tot : 1;
        };
        const buriedCache = new Map<object, number>();
        const buried = (ln: { gs: Comp[] }) => {
          const hit = buriedCache.get(ln);
          if (hit !== undefined) return hit;
          const fr = ln.gs.map(ringInk);
          const v = fr.reduce((a2, b3) => a2 + b3, 0) / Math.max(1, fr.length);
          buriedCache.set(ln, v);
          return v;
        };
        const textLines = lines
          .filter((ln) => ln.n >= 2 && (ln.x1 - ln.x0) > 1.5 * (ln.y1 - ln.y0))
          .filter((ln) => buried(ln) < 0.4)
          .sort((a, b2) => a.y0 - b2.y0);
        interface EraseJob { gs: Comp[]; bx0: number; by0: number; bx1: number; by1: number; ir: number; ig: number; ib: number; el: { snapped?: boolean; paintedBox?: object; box?: { x: number; y: number; w: number; h: number } } }
        const eraseJobs: EraseJob[] = [];
        const artIds2 = new Set<number>();
        for (const ac of artComps) artIds2.add(ac.id);
        const artIds = artIds2;
        (sp as { segLines?: unknown }).segLines = lines.map((ln) => ({
          y: +(ln.y0 / PH).toFixed(3), h: +((ln.y1 - ln.y0 + 1) / PH).toFixed(3),
          x: +(ln.x0 / PW).toFixed(3), w: +((ln.x1 - ln.x0 + 1) / PW).toFixed(3),
          n: ln.n, art: +buried(ln).toFixed(2),
          kept: textLines.includes(ln),
        }));
        if (spArtPre && artBB) {
          spArtPre.box = artBB;
          spArtPre.coverage = coverageFull ? "full" : "contained";
        }
        if (textLines.length) {
          /* DETERMINISTIC ASSIGNMENT (owner GO 2026-08-27, final anchor
             removed): roles are identified from the BRIEF, not from the
             transcriber's wobbly coordinates. Each line's width/height
             ratio predicts how many characters it holds — and we know
             every element's text. The tallest line leans hero, the lowest
             leans legal, the topmost leans producer. Same dream + same
             brief = same assignment, every run. */
          const els = (sp.elements || []).filter((e) => e.box && e.role);
          const roleText: Record<string, string> = {
            wine: texts.wine, producer: texts.producer, appellation: texts.appellation,
            grape: texts.grape, vintage: texts.vintage, region: texts.region,
            classification: texts.classification, special: texts.special, legal: texts.legal,
          };
          const maxH = Math.max(...textLines.map((ln) => ln.y1 - ln.y0));
          const minY = Math.min(...textLines.map((ln) => ln.y0));
          const maxY1 = Math.max(...textLines.map((ln) => ln.y1));
          /* ORDER-PRESERVING MATCH (owner escalation 2026-08-31, final
             form): vision coordinates scatter on wild art styles, but the
             transcriber's READING ORDER of roles is stable run to run —
             and the pixel counts of true lines are exact. Elements in
             vision reading order align to ink lines top-to-bottom by
             letter count and cleanliness; skipping a foliage chain is
             free, so decoration between text rows costs nothing. */
          const ordEls = [...els].sort((a, b2) => (a.box!.y + a.box!.h / 2) - (b2.box!.y + b2.box!.h / 2));
          const lineCost = (e: { role?: string }, ln: Line) => {
            const txt = roleText[e.role || ""] || "";
            if (!txt) return 9;
            const expChars = Math.max(1, txt.replace(/\s+/g, "").length);
            const expAspect = Math.max(1, 0.6 * txt.length);
            const lnAspect = (ln.x1 - ln.x0 + 1) / Math.max(1, ln.y1 - ln.y0 + 1);
            let c = 0.5 * Math.abs(Math.log(ln.n / expChars)) + buried(ln) + 0.15 * Math.abs(Math.log(lnAspect / expAspect));
            const maxH2 = Math.max(...textLines.map((l2) => l2.y1 - l2.y0));
            if (e.role === "wine") c += (ln.y1 - ln.y0) === maxH2 ? -0.3 : 0.15;
            if (e.role === "legal") c += ln.y1 === Math.max(...textLines.map((l2) => l2.y1)) ? -0.3 : 0.1;
            return c;
          };
          const N = ordEls.length, M = textLines.length, ESKIP = 0.9;
          const dp: number[][] = Array.from({ length: N + 1 }, () => Array(M + 1).fill(0));
          for (let i = 1; i <= N; i++) dp[i][0] = i * ESKIP;
          for (let i = 1; i <= N; i++) for (let j = 1; j <= M; j++)
            dp[i][j] = Math.min(dp[i - 1][j - 1] + lineCost(ordEls[i - 1], textLines[j - 1]), dp[i][j - 1], dp[i - 1][j] + ESKIP);
          {
            let i = N, j = M;
            const claimed = new Set<Line>();
            while (i > 0) {
              if (j > 0 && Math.abs(dp[i][j] - (dp[i - 1][j - 1] + lineCost(ordEls[i - 1], textLines[j - 1]))) < 1e-12) {
                if (lineCost(ordEls[i - 1], textLines[j - 1]) < 1.15) {
                  (ordEls[i - 1] as { __ln?: Line }).__ln = textLines[j - 1];
                  claimed.add(textLines[j - 1]);
                }
                i--; j--;
              } else if (j > 0 && Math.abs(dp[i][j] - dp[i][j - 1]) < 1e-12) j--;
              else i--;
            }

            for (const e of ordEls) {
              const ln = (e as { __ln?: Line }).__ln;
              if (!ln) continue;
              delete (e as { __ln?: Line }).__ln;
              ln.used = true;
              let y0 = ln.y0, y1 = ln.y1, x0 = ln.x0, x1 = ln.x1;
              /* two-line hero: deterministic merge — claim the adjacent
                 unclaimed line when doing so matches the expected shape
                 better than the single line does */
              if (e.role === "wine") {
                const below = textLines.filter((l2) => !claimed.has(l2) && !l2.used && l2.y0 > y0).sort((a2, b3) => a2.y0 - b3.y0);
                const nx = below[0];
                if (nx &&
                    nx.y0 - y1 < 1.3 * (y1 - y0) && (nx.y1 - nx.y0) > 0.6 * (y1 - y0)) {
                  const exp = Math.max(1, 0.6 * (roleText.wine || "").length);
                  const aSingle = Math.abs(Math.log(((x1 - x0 + 1) / (y1 - y0 + 1)) / exp));
                  const mx0 = Math.min(x0, nx.x0), mx1 = Math.max(x1, nx.x1);
                  const aMerged = Math.abs(Math.log((((mx1 - mx0 + 1) / (nx.y1 - y0 + 1)) * 2) / exp));
                  if (aMerged < aSingle) {
                    nx.used = true; y1 = nx.y1; x0 = mx0; x1 = mx1; e.lines = 2;
                    ln.gs = ln.gs.concat(nx.gs); ln.ws += nx.ws; ln.r += nx.r; ln.g += nx.g; ln.b += nx.b;
                  }
                }
              }
              e.box = { x: x0 / PW, y: y0 / PH, w: (x1 - x0 + 1) / PW, h: (y1 - y0 + 1) / PH };
              e.textH = (y1 - y0 + 1) / PH;
              e.snapped = true;
              const n3 = Math.max(1, ln.ws);
              e.colour = hex(ln.r / n3, ln.g / n3, ln.b / n3);
              eraseJobs.push({ gs: ln.gs, bx0: x0, by0: y0, bx1: x1, by1: y1, ir: ln.r / n3, ig: ln.g / n3, ib: ln.b / n3, el: e });
              /* TYPOGRAPHY IS MEASURED, NOT GUESSED (owner escalation
                 2026-08-27): the glyph shapes themselves say how the line
                 is set. Caps: capital letters are all one height, so most
                 glyphs reach near the tallest. Tracking: the ink gap
                 between neighbouring letters, in units of glyph height.
                 Arc: on an arched line the end letters sit lower than the
                 middle ones. All deterministic; the client must not
                 second-guess any of it. */
              const gs = ln.gs.filter((g2) => (g2.y1 - g2.y0 + 1) > 0.25 * (ln.y1 - ln.y0 + 1));
              if (gs.length >= 3) {
                const hs = gs.map((g2) => g2.y1 - g2.y0 + 1).sort((a2, b3) => a2 - b3);
                const hMax = hs[hs.length - 1];
                const hMed = hs[Math.floor(hs.length / 2)];
                const cy = (g2: Comp) => (g2.y0 + g2.y1) / 2;
                const third = Math.max(1, Math.floor(gs.length / 3));
                const byX0 = [...gs].sort((a2, b3) => a2.x0 - b3.x0);
                const endY0 = (byX0.slice(0, third).map(cy).reduce((a2, b3) => a2 + b3, 0) +
                               byX0.slice(-third).map(cy).reduce((a2, b3) => a2 + b3, 0)) / (2 * third);
                const midY0 = byX0.slice(third, byX0.length - third).map(cy);
                const midYm0 = midY0.length ? midY0.reduce((a2, b3) => a2 + b3, 0) / midY0.length : endY0;
                const arcHere = (Number(e.lines) || 1) === 1 && endY0 - midYm0 > 0.55 * hMed;
                /* CASE: descenders are the honest witness (owner defect
                   2026-08-27: digit-heavy legal read as caps by heights
                   alone). We know the text — if set in mixed case it
                   WOULD have descenders (g j p q y), and caps never do.
                   Arc lines keep the height rule (their baseline bends).
                   Height rule: caps (incl. SMALL CAPS) keep the median
                   glyph near the tallest; lowercase x-height sits near
                   half the ascender. */
                const hRule = hMed >= 0.62 * hMax;
                const baseLn = gs.map((g2) => g2.y1).sort((a2, b3) => a2 - b3)[Math.floor(gs.length / 2)];
                const descCount = gs.filter((g2) =>
                  g2.y1 - baseLn > 0.18 * hMed && (g2.y1 - g2.y0 + 1) > 0.35 * hMax).length;
                const txt0 = roleText[e.role || ""] || "";
                const capsSeg = arcHere || !/[gjpqy]/.test(txt0) ? hRule : descCount === 0;
                const byX = [...gs].sort((a2, b3) => a2.x0 - b3.x0);
                const gaps: number[] = [];
                for (let gi = 1; gi < byX.length; gi++) {
                  const gp = byX[gi].x0 - byX[gi - 1].x1;
                  if (gp > 0 && gp < 2.2 * hMed) gaps.push(gp);
                }
                gaps.sort((a2, b3) => a2 - b3);
                const gapMed = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
                const trackSeg = gapMed / Math.max(1, hMed) > 0.5 ? 0.32 : gapMed / Math.max(1, hMed) > 0.3 ? 0.18 : 0;
                const arcSeg = arcHere;
                const endY = endY0, midYm = midYm0;
                e.caps = capsSeg; e.capsSeg = capsSeg;
                e.tracking = trackSeg; e.trackSeg = trackSeg;
                if (arcSeg) { e.arc = true; e.textH = hMed / PH; e.arcSag = (endY - midYm) / PH; }
                else e.arc = false;
              }
              /* per-glyph law licences (owner 2026-08-28: foliage crashed
                 into the arched producer): each letter box carries how much
                 the DREAM's artwork already touched it — the replica may
                 touch exactly that much and no more. Whole-box tests were
                 blind to letters on a curve. */
              e.clearGlyphs = ln.gs.slice(0, 100).map((g2) => {
                const ga = (g2.x1 - g2.x0 + 1) * (g2.y1 - g2.y0 + 1);
                let cov = 0;
                for (const ac of artComps) {
                  const iw = Math.min(g2.x1, ac.x1) - Math.max(g2.x0, ac.x0) + 1;
                  const ih = Math.min(g2.y1, ac.y1) - Math.max(g2.y0, ac.y0) + 1;
                  if (iw > 0 && ih > 0) cov += iw * ih;
                }
                return { x: g2.x0 / PW, y: g2.y0 / PH, w: (g2.x1 - g2.x0 + 1) / PW, h: (g2.y1 - g2.y0 + 1) / PH,
                         allow: +Math.min(1, cov / Math.max(1, ga)).toFixed(2) };
              });
            }
          }
        }
        /* DREAM-AS-CANVAS ERASE (owner GO 2026-08-31, corrected): erase runs
           AFTER matching and touches ONLY lines a text actually claimed —
           foliage chains keep their pixels. Each glyph fills with its own
           ring colour; then the whole claimed band is swept for pixels of
           that line's ink colour, catching letters the tracer missed. */
        /* VALIDATED ERASE, FINAL FORM (owner 2026-08-31 "good clean up"):
           ONE honest gate instead of three heuristics. Every job PLANS its
           erase (glyphs + touching outline components + same-ink sweep);
           all plans union into one mask; each job is AUDITED across the
           FULL label width of its (arc-extended) rows for same-ink text
           the union would miss — neighbours' ink doesn't scare it because
           their own plans cover them. Only passing jobs erase; failures
           keep the dream's painting. Typeset ⇒ provably erased. */
        {
          const unionMask = new Uint8Array(PW * PH);
          interface Plan { job: EraseJob; pxs: number[]; yT: number; yB: number; xL: number; xR: number }
          // (pxs is reassigned on failure/adoption — keep it a plain field)
          const plans: Plan[] = [];
          for (const job of eraseJobs) {
            const p2 = 8;
            const yT = Math.max(0, job.by0 - p2), yB = Math.min(PH - 1, job.by1 + p2);
            const xL = Math.max(0, job.bx0 - p2), xR = Math.min(PW - 1, job.bx1 + p2);
            const pxs: number[] = [];
            const mark = (x: number, y: number) => {
              const idx = y * PW + x;
              if (unionMask[idx]) return;
              unionMask[idx] = 1; pxs.push(idx);
            };
            for (const g2 of job.gs)
              for (let y = Math.max(0, g2.y0 - 3); y <= Math.min(PH - 1, g2.y1 + 3); y++)
                for (let x = Math.max(0, g2.x0 - 3); x <= Math.min(PW - 1, g2.x1 + 3); x++) {
                  if (gDist(x, y) <= 32 || artIds.has(lbl[y * PW + x])) continue;
                  mark(x, y);
                }
            for (const c2 of comps) {
              if (artIds.has(c2.id)) continue;
              let touches = false;
              for (const g2 of job.gs)
                if (c2.x0 <= g2.x1 + 4 && c2.x1 >= g2.x0 - 4 && c2.y0 <= g2.y1 + 4 && c2.y1 >= g2.y0 - 4) { touches = true; break; }
              if (!touches) continue;
              for (let y = Math.max(0, c2.y0 - 2); y <= Math.min(PH - 1, c2.y1 + 2); y++)
                for (let x = Math.max(0, c2.x0 - 2); x <= Math.min(PW - 1, c2.x1 + 2); x++) {
                  if (gDist(x, y) <= 32 || artIds.has(lbl[y * PW + x])) continue;
                  mark(x, y);
                }
            }
            for (let y = yT; y <= yB; y++)
              for (let x = xL; x <= xR; x++) {
                const i = (y * PW + x) * 4;
                if (gDist(x, y) <= 45 || artIds.has(lbl[y * PW + x])) continue;
                if (Math.abs(px[i] - job.ir) + Math.abs(px[i + 1] - job.ig) + Math.abs(px[i + 2] - job.ib) > 160) continue;
                mark(x, y);
              }
            plans.push({ job, pxs, yT, yB, xL, xR });
          }
          /* audits loop until STABLE (owner ghost 2026-08-31): when a job
             fails and keeps its painting, the pixels it claimed are
             re-offered to surviving neighbours and everyone re-audits —
             a pass is only final when no failure can undermine it */
          const auditOnce = (plan: Plan) => {
            const { job } = plan;
            const ext = Math.round((job.by1 - job.by0 + 1) * 0.5);
            const aT = Math.max(0, job.by0 - ext), aB = Math.min(PH - 1, job.by1 + ext);
            let leftover = 0;
            for (let y = aT; y <= aB; y++)
              for (let x = 0; x < PW; x++) {
                const idx = y * PW + x;
                if (unionMask[idx] || artIds.has(lbl[idx])) continue;
                const i = idx * 4;
                if (gDist(x, y) <= 55) continue;
                if (Math.abs(px[i] - job.ir) + Math.abs(px[i + 1] - job.ig) + Math.abs(px[i + 2] - job.ib) > 140) continue;
                leftover++;
              }
            return leftover > Math.max(240, 0.06 * Math.max(1, plan.pxs.length));
          };
          const failedPlans = new Set<Plan>();
          for (let round = 0; round < plans.length + 1; round++) {
            let changed = false;
            for (const plan of plans) {
              if (failedPlans.has(plan)) continue;
              if (!auditOnce(plan)) continue;
              failedPlans.add(plan);
              plan.job.el.snapped = false;
              if (plan.job.el.box) plan.job.el.paintedBox = { ...plan.job.el.box };
              const released = plan.pxs;
              plan.pxs = [];
              for (const idx of released) unionMask[idx] = 0;
              for (const p2 of plans) {
                if (p2 === plan || failedPlans.has(p2)) continue;
                for (const idx of released) {
                  if (unionMask[idx]) continue;
                  const y = (idx / PW) | 0, x = idx % PW;
                  if (x >= p2.xL && x <= p2.xR && y >= p2.yT && y <= p2.yB) { unionMask[idx] = 1; p2.pxs.push(idx); }
                }
              }
              changed = true;
            }
            if (!changed) break;
          }
          const origs = new Map<Plan, Uint8Array>();
          for (const plan of plans) {
            if (!plan.pxs.length) continue;
            const { yT, yB, xL, xR } = plan;
            const bw2 = xR - xL + 1;
            const colTop = new Float64Array(bw2 * 3), colBot = new Float64Array(bw2 * 3);
            for (let x = xL; x <= xR; x++) {
              const o = (x - xL) * 3;
              let fy = -1;
              for (let y = yT - 1; y >= Math.max(0, yT - 50); y--) if (gDist(x, y) <= 60) { fy = y; break; }
              if (fy >= 0) { const i = (fy * PW + x) * 4; colTop[o] = px[i]; colTop[o + 1] = px[i + 1]; colTop[o + 2] = px[i + 2]; }
              else { colTop[o] = localG(x, yT, 0); colTop[o + 1] = localG(x, yT, 1); colTop[o + 2] = localG(x, yT, 2); }
              fy = -1;
              for (let y = yB + 1; y <= Math.min(PH - 1, yB + 50); y++) if (gDist(x, y) <= 60) { fy = y; break; }
              if (fy >= 0) { const i = (fy * PW + x) * 4; colBot[o] = px[i]; colBot[o + 1] = px[i + 1]; colBot[o + 2] = px[i + 2]; }
              else { colBot[o] = colTop[o]; colBot[o + 1] = colTop[o + 1]; colBot[o + 2] = colTop[o + 2]; }
            }
            const orig = new Uint8Array(plan.pxs.length * 3);
            plan.pxs.forEach((idx, k) => { const i = idx * 4; orig[k * 3] = px[i]; orig[k * 3 + 1] = px[i + 1]; orig[k * 3 + 2] = px[i + 2]; });
            origs.set(plan, orig);
            for (const idx of plan.pxs) {
              const y = (idx / PW) | 0, x = idx % PW;
              const i = idx * 4;
              const o = (x - xL) * 3, t = (y - yT) / Math.max(1, yB - yT);
              if (o < 0 || o >= bw2 * 3) continue;
              px[i] = colTop[o] * (1 - t) + colBot[o] * t;
              px[i + 1] = colTop[o + 1] * (1 - t) + colBot[o + 1] * t;
              px[i + 2] = colTop[o + 2] * (1 - t) + colBot[o + 2] * t;
            }
          }
          /* ABSOLUTE POST-CHECK, whole-batch (owner 2026-08-31): after ALL
             fills, re-scan each band by PURE colour match — no ground model
             a huge display name can blind. Ink still visible → restore that
             band's original pixels and keep the painting; then one more
             round so restored ink can demote anyone it now undermines. */
          const still = (plan: Plan) => {
            const { job } = plan;
            const ext2 = Math.round((job.by1 - job.by0 + 1) * 0.5);
            const aT2 = Math.max(0, job.by0 - ext2), aB2 = Math.min(PH - 1, job.by1 + ext2);
            let n2 = 0;
            for (let y = aT2; y <= aB2; y++)
              for (let x = 0; x < PW; x++) {
                const idx = y * PW + x;
                if (artIds.has(lbl[idx])) continue;
                const i = idx * 4;
                if (Math.abs(px[i] - job.ir) + Math.abs(px[i + 1] - job.ig) + Math.abs(px[i + 2] - job.ib) > 120) continue;
                n2++;
              }
            return n2 > Math.max(240, 0.06 * Math.max(1, plan.pxs.length));
          };
          for (let round = 0; round < 2; round++) {
            let changed = false;
            for (const plan of plans) {
              if (!plan.pxs.length || failedPlans.has(plan)) continue;
              if (!still(plan)) continue;
              const orig = origs.get(plan);
              if (orig) plan.pxs.forEach((idx, k) => { const i = idx * 4; px[i] = orig[k * 3]; px[i + 1] = orig[k * 3 + 1]; px[i + 2] = orig[k * 3 + 2]; });
              plan.job.el.snapped = false;
              if (plan.job.el.box) plan.job.el.paintedBox = { ...plan.job.el.box };
              failedPlans.add(plan);
              changed = true;
            }
            if (!changed) break;
          }
        }
        /* canvas is UNCONDITIONAL (owner law 2026-08-31 "never let texts
           overlap"): even when no text can be safely typeset, the label is
           the dream itself — the generation path must never run again */
        canvasArt = "data:image/png;base64," + PNG.sync.write(png).toString("base64");
        /* anything unmatched (or full-bleed dreams) keeps the transcriber's
           box and samples its colour there */
        for (const e of sp.elements || []) {
          if (e.snapped || !e.box) continue;
          const b = e.box;
          const x0 = Math.max(0, Math.floor(b.x * PW)), x1 = Math.min(PW, Math.ceil((b.x + b.w) * PW));
          const y0 = Math.max(0, Math.floor(b.y * PH)), y1 = Math.min(PH, Math.ceil((b.y + b.h) * PH));
          let r = 0, g = 0, bb = 0, wsum = 0, n = 0;
          for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
            const i = (y * PW + x) * 4;
            const dg = Math.abs(px[i] - gr / Math.max(1, gn)) + Math.abs(px[i + 1] - gg / Math.max(1, gn)) + Math.abs(px[i + 2] - gb / Math.max(1, gn));
            if (dg > 110) { const wq = dg * dg; r += px[i] * wq; g += px[i + 1] * wq; bb += px[i + 2] * wq; wsum += wq; n++; }
          }
          if (n > 12) e.colour = hex(r / wsum, g / wsum, bb / wsum);
        }
      }
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
  let artworkMode2: "contained" | "full" | "canvas" = "contained";
  if (p.reuseArtwork && p.reuseArtwork.startsWith("data:image/")) {
    // offline iteration path: reuse a saved artwork, skip all generation
    try {
      const an = analyzeArtwork(p.reuseArtwork);
      if (an?.bboxFull || an?.bbox) artInk = (an.bboxFull || an.bbox) as { x: number; y: number; w: number; h: number };
      const cx = an?.centroid?.x ?? 0.5, cy = an?.centroid?.y ?? 0.5;
      artAlign = `x${cx < 0.42 ? "Min" : cx > 0.58 ? "Max" : "Mid"}Y${cy < 0.42 ? "Min" : cy > 0.58 ? "Max" : "Mid"}`;
    } catch {}
    artwork = p.reuseArtwork;
    artworkMode2 = canvasArt ? "canvas" : (spec as { artwork?: { coverage?: string } }).artwork?.coverage === "full" ? "full" : "contained";
    if (canvasArt) artwork = canvasArt;
    const resultR: RebuildResult = { spec, artwork, artAlign, artworkMode: artworkMode2, styleKey: p.style || "contemporary", fonts: GOOGLE_FONTS, artInk };
    try {
      fs.mkdirSync(path.join(process.cwd(), "data", "debug"), { recursive: true });
      fs.writeFileSync(path.join(process.cwd(), "data", "debug", "last-rebuild.json"), JSON.stringify({ dream, ...resultR }));
      archivePair(dream, resultR);
    } catch {}
    return resultR;
  }
  let artworkMode: "contained" | "full" | "canvas" = "contained";
  const art = (spec as { artwork?: { subject?: string; palette?: string[]; box?: { w: number; h: number }; coverage?: string } }).artwork;
  const styleKey = ["traditional", "contemporary", "punk", "minimalist"].includes(String(body.style)) ? String(body.style) : "contemporary";

  /* DREAM-AS-CANVAS (owner GO 2026-08-31): when the pixel erase produced a
     clean canvas, the dream IS the artwork — art fidelity by construction,
     no generation, no cost. The sketch/FLUX paths below stay for rollback
     but are normally unreachable. */
  if (canvasArt) {
    const resultC: RebuildResult = { spec, artwork: canvasArt, artAlign, artworkMode: "canvas", styleKey, fonts: GOOGLE_FONTS, artInk };
    try {
      fs.writeFileSync(path.join(process.cwd(), "data", "debug", "last-rebuild.json"), JSON.stringify({ dream, ...resultC }));
      archivePair(dream, resultC);
    } catch {}
    return resultC;
  }

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
        const check = await verifyImage(raw, [NO_TEXT_RULE, NO_GLITCH_RULE]);
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
      const check = await verifyImage(raw, [NO_TEXT_RULE, WHITE_BG_RULE, NO_BORDER_RULE, NO_GLITCH_RULE]);
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

  const result: RebuildResult = { spec, artwork, artAlign, artworkMode, styleKey, fonts: GOOGLE_FONTS, artworkError, artInk };
  /* every rebuild is dumped so renderer work iterates on SAVED data —
     never on fresh paid generations (owner, 2026-08-26) */
  try {
    fs.mkdirSync(path.join(process.cwd(), "data", "debug"), { recursive: true });
    fs.writeFileSync(path.join(process.cwd(), "data", "debug", "last-rebuild.json"), JSON.stringify({ dream, ...result }));
    archivePair(dream, result);
  } catch {}
  return result;
}
