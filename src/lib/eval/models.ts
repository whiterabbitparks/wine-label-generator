import { generateOpenAIImage } from "@/lib/image-provider/openai";
import { artworkGuidance } from "@/lib/dream/engine";
import type { EvalBrief } from "./briefs";
import { aspectOf } from "./briefs";

/* THE PAINTERS (branch POPIKA_Back_To_Vector, 2026-09-18).

   The coming hybrid engine asks a model for ONE thing: the illustration,
   with a zone left empty for the type that code will set. This module is
   that ask, put to five models the same way, so the evaluation page can
   show them side by side on the six frozen briefs and the owner can pick
   the painter blind. gpt-image speaks to OpenAI directly; the other four
   go through fal.ai's blocking endpoint (FAL_KEY), exactly like the FLUX
   LoRA path always has. Imagen 4 was on the list — fal no longer serves it
   (probed 2026-09-18: 404 on every known id).

   Each model gets the SAME prompt; only the request shape differs. */

export interface EvalModel {
  id: string;
  name: string;
  via: "openai" | "fal";
  endpoint?: string;
}

export const EVAL_MODELS: EvalModel[] = [
  { id: "gpt-image", name: "OpenAI gpt-image", via: "openai" },
  { id: "flux-pro", name: "FLUX 1.1 Pro", via: "fal", endpoint: "fal-ai/flux-pro/v1.1" },
  { id: "ideogram-3", name: "Ideogram 3", via: "fal", endpoint: "fal-ai/ideogram/v3" },
  { id: "recraft-3", name: "Recraft V3", via: "fal", endpoint: "fal-ai/recraft/v3/text-to-image" },
  { id: "nano-banana", name: "Nano Banana (Gemini 2.5 Flash Image)", via: "fal", endpoint: "fal-ai/nano-banana" },
];

export function evalModel(id: string): EvalModel | null {
  return EVAL_MODELS.find((m) => m.id === id) || null;
}

/* artwork-only style lines — the dream's STYLE_MOOD with every
   typographic word taken out, since type is no longer the model's job */
const ART_STYLE: Record<string, string> = {
  traditional:
    "classic European wine-label engraving — etched or woodcut line work, fine hatching, a restrained palette of one or two inks on paper, the calm of a nineteenth-century print",
  contemporary:
    "modern boutique wine-label illustration — linocut, silkscreen, cut-paper collage or gouache; bold flat shapes, confident emptiness around the subject, two to four inks",
  punk:
    "raw expressive wine-label art — rough brush, scratchy ink, screenprint misregistration, loud colour, energy over polish",
};

/* how much of the picture the type will need, by label proportion */
function zoneOf(aspect: "landscape" | "portrait" | "square"): { where: string; share: string } {
  return aspect === "portrait"
    ? { where: "bottom third", share: "roughly the bottom 35%" }
    : { where: "bottom part", share: "roughly the bottom 40%" };
}

export interface ArtworkPrompt { prompt: string; short: string; card: string | null; aspect: "landscape" | "portrait" | "square" }

/* THE ASK. Same words to every model. The reserved zone is the whole
   idea: the picture is composed to receive type, so art and type are
   planned together instead of fighting afterwards.
   `short` is the same ask without the house-feedback tail, for painters
   that cap the prompt (Recraft: 1000 characters). */
export async function buildArtworkPrompt(brief: EvalBrief, style: string): Promise<ArtworkPrompt> {
  const aspect = aspectOf(brief);
  const zone = zoneOf(aspect);
  const g = await artworkGuidance(style);
  const d = brief.data;
  const place = [d.region, d.country].filter(Boolean).join(", ");
  const head =
    `Illustration for a wine label — the ARTWORK ONLY. No text, no lettering, no words, no numbers, no logo, no monogram, no border, no frame, no badge. ` +
    `Format: ${aspect === "portrait" ? "portrait 2:3" : aspect === "square" ? "square" : "landscape 3:2"}, the flat printed label itself, not a bottle, not a mockup. ` +
    `COMPOSITION: the illustration lives in the upper part of the picture; the ${zone.where} (${zone.share}) is left as EMPTY, flat, even paper ground — one continuous plain colour with nothing drawn on it — because the wine's name and details will be typeset there afterwards. Keep every drawn element clear of that zone; the illustration may reach the top and side edges if the style wants it, never the type zone. `;
  const styleLine = `STYLE: ${ART_STYLE[style] || ART_STYLE.traditional}.`;
  const subject =
    ` SUBJECT: ${brief.vision} ` +
    (place ? `The wine comes from ${place} — if the setting shows a landscape or buildings, they must be true to ${place}, never landmarks of another region. ` : "") +
    `A ${[d.sweetness, d.wineColorName].filter(Boolean).join(" ").toLowerCase()} ${(d.wineType || "wine").toLowerCase()}. `;
  const finish = `FINISH: handmade print on paper, not a photograph, not 3D, not airbrushed; discrete inks, honest imperfection; the ground is paper-coloured and plain.`;
  const prompt = head + styleLine + g.text + subject + finish;
  /* the short form keeps the ask, the style and the subject; the house
     feedback goes first, then the finish line, then the geography note */
  let short = head + styleLine + subject + finish;
  if (short.length > 1000) short = head + styleLine + subject;
  if (short.length > 1000) short = (head + styleLine + ` SUBJECT: ${brief.vision}`).slice(0, 1000);
  return { prompt, short, card: g.card, aspect };
}

const FAL_SIZE: Record<ArtworkPrompt["aspect"], string> = { landscape: "landscape_4_3", portrait: "portrait_4_3", square: "square_hd" };
const FAL_RATIO: Record<ArtworkPrompt["aspect"], string> = { landscape: "4:3", portrait: "3:4", square: "1:1" };

/* one painting from one model — a data URL, like every provider here */
export async function generateArtwork(model: EvalModel, ap: ArtworkPrompt): Promise<string> {
  if (model.via === "openai") {
    const size = ap.aspect === "portrait" ? { w: 1024, h: 1536 } : ap.aspect === "square" ? { w: 1024, h: 1024 } : { w: 1536, h: 1024 };
    return generateOpenAIImage({ prompt: ap.prompt, size } as never);
  }
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY is not set");
  /* Recraft caps the prompt at 1000 characters (422 otherwise) */
  const body: Record<string, unknown> = { prompt: model.id === "recraft-3" ? ap.short : ap.prompt.slice(0, 1900), num_images: 1 };
  switch (model.id) {
    case "flux-pro": Object.assign(body, { image_size: FAL_SIZE[ap.aspect], output_format: "png", safety_tolerance: "2" }); break;
    case "ideogram-3": Object.assign(body, { image_size: FAL_SIZE[ap.aspect], rendering_speed: "BALANCED" }); break;
    case "recraft-3": Object.assign(body, { image_size: FAL_SIZE[ap.aspect], style: "digital_illustration" }); break;
    case "nano-banana": Object.assign(body, { aspect_ratio: FAL_RATIO[ap.aspect], output_format: "png" }); break;
  }
  const res = await fetch(`https://fal.run/${model.endpoint}`, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = (await res.json().catch(() => ({}))) as { images?: { url?: string; content_type?: string }[]; detail?: unknown; error?: string };
  if (!res.ok || !out.images?.length)
    throw new Error(`${model.name} failed (${res.status}): ${JSON.stringify(out.detail || out.error || out).slice(0, 240)}`);
  const url = out.images[0].url;
  if (!url) throw new Error(`${model.name} returned no image url`);
  const img = await fetch(url);
  if (!img.ok) throw new Error(`${model.name} image download failed (${img.status})`);
  const mime = img.headers.get("content-type") || out.images[0].content_type || "image/png";
  return `data:${mime};base64,${Buffer.from(await img.arrayBuffer()).toString("base64")}`;
}
