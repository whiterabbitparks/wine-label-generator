import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { generateOpenAIImage } from "@/lib/image-provider/openai";
import { generateImageWithRetry, keyArtwork } from "@/lib/image-provider";
import { analyzeArtwork } from "@/lib/admin/art-analysis";

/* DREAM PIPELINE v1 (owner GO, 2026-08-25, branch POPIKA_ALTERNATIVE_ENGINE).

   The owner's experiment: a frontier image model designing the WHOLE label
   (type + image together) beats our comp system artistically. So the model
   becomes the composer — but its output is a BLUEPRINT, never material:

     1. DREAM    — gpt-image designs the complete label (typos allowed, it's
                   a sketch).
     2. TRANSCRIBE — a vision model reads the dream as GEOMETRY: where each
                   text element sits, how big, aligned how, which of the
                   OWNER'S approved fonts is nearest, exact colours, where
                   the artwork mass lives and what it depicts.
     3. ARTWORK  — the clean artwork is generated separately from the
                   dream's subject (keyed, finished — the normal craft path).
     4. REBUILD  — the client engine sets the REAL brief text as vector type
                   at the transcribed positions (renderDreamSpec), hard
                   rules enforced. Typos are impossible by construction.

   The rebuilt spec is judged in the Proof Bench next to its dream. */

const STYLE_MOOD: Record<string, string> = {
  traditional:
    "classic european wine label tradition — engraved or etched illustration, refined serif typography, calm symmetry or classical hierarchy",
  contemporary:
    "modern boutique wine label — bold editorial typography, expressive illustration (linocut, silkscreen, collage), confident whitespace",
  punk: "loud natural-wine label — raw expressive artwork, punchy type, fearless colour, poster energy",
};

interface DreamElement {
  role: string;
  box: { x: number; y: number; w: number; h: number };
  align?: string; caps?: boolean; tracking?: number;
  font?: string; weight?: number; colour?: string; lines?: number;
}
interface DreamSpec {
  ground?: string;
  elements?: DreamElement[];
  artwork?: { box?: { x: number; y: number; w: number; h: number }; subject?: string; palette?: string[] };
}

export const maxDuration = 300;

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 400 });
  let body: { vision?: string; style?: string; fonts?: unknown; data?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const style = ["traditional", "contemporary", "punk"].includes(String(body.style)) ? String(body.style) : "contemporary";
  const vision = String(body.vision || "").slice(0, 2000);
  const d = body.data || {};
  const fonts = (Array.isArray(body.fonts) ? body.fonts.map(String) : []).slice(0, 60);
  const texts = {
    producer: d.producer || "", wine: d.wine || "Wine", appellation: d.appellation || "",
    grape: d.grape || "", vintage: d.vintage || "", region: [d.region, d.country].filter(Boolean).join(", "),
    classification: d.classification || "", special: d.special || "",
    legal: [
      [d.sweetness, d.wineColorName, "Wine"].filter(Boolean).join(" "),
      `${d.alcohol || "12.5"}% Alc. by Vol. / ${d.volume || "750"} mL`,
    ].join(" / "),
  };

  // ---- 1. DREAM: the model designs the complete label ----
  const dreamPrompt =
    `Design a complete, finished wine label — a flat, straight-on, full-bleed rectangular label design ` +
    `(landscape). Not a bottle photo, not a mockup: the printed label itself, edge to edge. ` +
    `Style: ${STYLE_MOOD[style]}. ` +
    (vision ? `The artwork illustrates this story: ${vision}. ` : "") +
    `The label carries this text (place it beautifully, sizes and hierarchy are yours): ` +
    `wine name "${texts.wine}"` +
    (texts.producer ? `, producer "${texts.producer}"` : "") +
    (texts.appellation ? `, appellation "${texts.appellation}"` : "") +
    (texts.grape ? `, grape "${texts.grape}"` : "") +
    (texts.vintage ? `, vintage "${texts.vintage}"` : "") +
    (texts.region ? `, origin "${texts.region}"` : "") +
    `, and small legal text "${texts.legal}". ` +
    `Typography in the spirit of these typefaces: ${fonts.slice(0, 25).join(", ") || "classic wine label faces"}. ` +
    `Integrated, gallery-quality composition — type and image designed as one. No borders framing the label.`;
  let dream: string;
  try {
    dream = await generateOpenAIImage({ prompt: dreamPrompt, size: "landscape" } as never);
  } catch (e) {
    return NextResponse.json({ error: `dream generation failed: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }

  // ---- 2. TRANSCRIBE: dream → structured layout spec ----
  const model = process.env.OPENAI_VISION_MODEL || "gpt-4o";
  const sysPrompt =
    "You are a meticulous design technologist. You receive a wine-label design image and transcribe its LAYOUT as JSON. " +
    "Read GEOMETRY, not words: for each visible text element, give its bounding box as fractions of the image (x,y from top-left, w,h), " +
    "its role (match against the known label texts you are given — wine, producer, appellation, grape, vintage, region, classification, special, legal), " +
    "alignment l|c|r, caps true/false, tracking 0–0.4 (0 = normal), the CLOSEST font from the allowed list, an approximate weight (300–800), " +
    "and its colour as hex sampled from the image. Also give: ground (the label's background colour as hex), " +
    "and artwork {box, subject (one sentence describing ONLY the illustration), palette (up to 4 hex inks)}. " +
    'Return strict JSON: {"ground":"#..","elements":[{"role":"..","box":{"x":..,"y":..,"w":..,"h":..},"align":"c","caps":true,"tracking":0.1,"font":"..","weight":600,"colour":"#..","lines":1}],"artwork":{"box":{..},"subject":"..","palette":["#.."]}} ' +
    "Every ROLE appears at most once: if one text (e.g. the wine name) is split across several visual blocks, output ONE element whose box covers ALL its parts. Skip decorative flourishes that carry no text.";
  let spec: DreamSpec = {};
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
                text:
                  `Known label texts (match roles against these):\n${JSON.stringify(texts, null, 1)}\n` +
                  `Allowed fonts (choose the closest for each element):\n${fonts.join(", ") || "Georgia, Helvetica"}`,
              },
              { type: "image_url", image_url: { url: dream, detail: "high" } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`vision ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    spec = JSON.parse(json.choices?.[0]?.message?.content || "{}") as DreamSpec;
  } catch (e) {
    return NextResponse.json({ error: `transcription failed: ${e instanceof Error ? e.message : e}`, dream }, { status: 502 });
  }

  // ---- 3. ARTWORK: clean generation from the dream's subject ----
  let artwork: string | null = null;
  let artAnalysis = null;
  const subject = spec.artwork?.subject || vision;
  if (subject) {
    const palette = (spec.artwork?.palette || []).filter((h) => /^#[0-9a-fA-F]{6}$/.test(h));
    const medium =
      style === "traditional" ? "fine engraving / etching, hand-printed"
      : style === "punk" ? "bold screen print, raw and loud"
      : "modern printmaking (linocut / silkscreen / gouache)";
    const artPrompt =
      `${subject}. Medium: ${medium}. Single composition on a pure white background; its edges dissolve into the white. ` +
      (palette.length ? `Ink palette: ${palette.join(", ")}. ` : "") +
      `Pure imagery with no text, letters or numbers. Never enclosed by any frame, border, oval or shape.`;
    try {
      const raw = await generateImageWithRetry({
        prompt: artPrompt, size: "landscape", provider: "openai", paletteLock: palette.length ? palette : undefined,
      } as never);
      artAnalysis = analyzeArtwork(raw);
      artwork = keyArtwork(raw);
    } catch {
      artwork = null; // rebuild still renders text-only
    }
  }

  return NextResponse.json({ dream, spec, artwork, artAnalysis, style, texts });
}
