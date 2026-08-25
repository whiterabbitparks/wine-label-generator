import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { generateOpenAIImage } from "@/lib/image-provider/openai";
import { generateImageWithRetry, keyArtwork } from "@/lib/image-provider";
import { getDb } from "@/lib/db";
import { PNG } from "pngjs";
import { analyzeArtwork } from "@/lib/admin/art-analysis";

/* DREAM ENGINE v2 (owner directive 2026-08-25, branch POPIKA_ALTERNATIVE_ENGINE).

   "The dream leads, the architecture follows." Two phases:

   phase:"dream"   — ChatGPT designs the COMPLETE label (type + image as one).
                     The prompt carries the real texts WITH their hierarchy and
                     the owner's accumulated dream-refinement guidance
                     (approved/rejected comments from the Dream Studio).
   phase:"rebuild" — the dream is replicated as faithfully as possible:
                     * transcription reads geometry/colour/type character and
                       matches fonts against a WIDE open library (not the old
                       approved list — owner: "forget the fonts");
                     * artwork is regenerated WITH THE DREAM AS VISUAL
                       REFERENCE ("same illustration, no text") — owner's
                       chosen path — then finished + keyed;
                     * the client engine sets real text at the transcribed
                       geometry. Only surviving laws: 7pt floor, 5mm text
                       margins, and the legal line must exist. Everything
                       else replicates the dream verbatim. */

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

export const maxDuration = 300;

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 400 });
  let body: {
    phase?: string; vision?: string; style?: string; data?: Record<string, string>;
    dream?: string; sketch?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const d = body.data || {};
  const texts = labelTexts(d);
  const vision = String(body.vision || "").slice(0, 2000);

  /* ---------------- phase: dream ---------------- */
  if (body.phase !== "rebuild") {
    const style = STYLE_MOOD[String(body.style)] ? String(body.style) : "free";
    // the owner's dream-refinement corpus steers future dreams
    let guidance = "";
    try {
      const db = await getDb();
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
      `Integrated, gallery-quality composition — type and image designed as one whole.` +
      guidance;
    try {
      const job: Record<string, unknown> = { prompt, size: "landscape" };
      if (body.sketch && String(body.sketch).startsWith("data:image/")) job.reference = body.sketch;
      const dream = await generateOpenAIImage(job as never);
      return NextResponse.json({ dream, prompt });
    } catch (e) {
      return NextResponse.json({ error: `dream failed: ${e instanceof Error ? e.message : e}` }, { status: 502 });
    }
  }

  /* ---------------- phase: rebuild ---------------- */
  const dream = String(body.dream || "");
  if (!dream.startsWith("data:image/")) return NextResponse.json({ error: "rebuild needs the dream image" }, { status: 400 });

  // 1. transcription — replicate, don't redesign
  const model = process.env.OPENAI_VISION_MODEL || "gpt-4o";
  const sysPrompt =
    "You are a meticulous design technologist. You receive a finished wine-label design and transcribe its LAYOUT as JSON " +
    "so it can be replicated EXACTLY in vector. Read geometry, not words: for each visible text element give " +
    "box {x,y,w,h} as fractions of the image (x,y top-left corner of the text block), " +
    "role matched against the known texts (wine, producer, appellation, grape, vintage, region, classification, special, legal), " +
    "align l|c|r (relative to its own box), caps true/false, tracking 0-0.4, " +
    "font = the visually CLOSEST match from the allowed list (look at serifs, weight, width, script character), " +
    "weight 300-800, colour as exact hex sampled from the glyphs, lines (how many lines the element occupies). " +
    "Also: ground (label background hex) and artwork {box, subject (one sentence, the illustration only), palette (up to 4 hex)}. " +
    'Strict JSON: {"ground":"#..","elements":[{"role":"..","box":{"x":..,"y":..,"w":..,"h":..},"align":"c","caps":true,"tracking":0.1,"font":"..","weight":600,"colour":"#..","lines":1}],"artwork":{"box":{..},"subject":"..","palette":["#.."]}} ' +
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
    return NextResponse.json({ error: `transcription failed: ${e instanceof Error ? e.message : e}` }, { status: 502 });
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
      const sp = spec as { ground?: string; elements?: { box?: { x: number; y: number; w: number; h: number }; colour?: string }[] };
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
      }
    }
  } catch {}

  // 2. artwork — the DREAM ITSELF is the visual reference (owner's choice),
  //    generated IN THE ASPECT OF ITS REGION (a tall region needs a tall
  //    artwork — the landscape-only default shrank the dream's full-height
  //    illustration into a floating postcard, live-observed).
  let artwork: string | null = null;
  let artAlign = "xMidYMid";
  const art = (spec as { artwork?: { subject?: string; palette?: string[]; box?: { w: number; h: number } } }).artwork;
  try {
    const palette = (art?.palette || []).filter((h) => /^#[0-9a-fA-F]{6}$/.test(h));
    const bx = art?.box;
    const regionAspect = bx && bx.h > 0 ? (bx.w * 1536) / (bx.h * 1024) : 1.5;
    const size = regionAspect < 0.83 ? { w: 1024, h: 1536 } : regionAspect > 1.2 ? { w: 1536, h: 1024 } : { w: 1024, h: 1024 };
    const artPrompt =
      `Recreate ONLY the illustration from this label design — the exact same subject, composition, colours and technique — ` +
      `as standalone artwork filling the whole canvas. ` +
      (art?.subject ? `The illustration: ${art.subject}. ` : "") +
      `Remove ALL text, letters, numbers and typography completely. No borders or frames.`;
    const raw = await generateImageWithRetry({
      prompt: artPrompt, size, provider: "openai",
      reference: dream, paletteLock: palette.length ? palette : undefined,
    } as never);
    // subject-aware cover-crop: aim the slice at the ink centroid so the
    // crop never amputates the subject (live-observed: the man cut at the edge)
    try {
      const an = analyzeArtwork(raw);
      const cx = an?.centroid?.x ?? 0.5, cy = an?.centroid?.y ?? 0.5;
      artAlign = `x${cx < 0.42 ? "Min" : cx > 0.58 ? "Max" : "Mid"}Y${cy < 0.42 ? "Min" : cy > 0.58 ? "Max" : "Mid"}`;
    } catch {}
    artwork = keyArtwork(raw);
  } catch {
    artwork = null;
  }

  return NextResponse.json({ spec, artwork, artAlign, fonts: GOOGLE_FONTS });
}
