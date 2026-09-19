import { generateOpenAIImage } from "@/lib/image-provider/openai";
import { artworkGuidance } from "@/lib/dream/engine";
import { getDb } from "@/lib/db";
import { DEFAULT_REGIONS } from "./regions";
import type { EvalBrief } from "./briefs";
import { aspectOf } from "./briefs";
import { mix } from "@/lib/typeset/fonts";

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
  /* two ways of ASKING the same painter, both aimed at the free-space
     problem (owner 2026-09-18: "the problem is the free space for text"):
     cutout — the illustration alone on a transparent ground, so the
     layout engine owns the paper and places art and type itself;
     masked — a paper canvas with the type zone masked OFF, so the model
     physically cannot paint there. */
  { id: "gpt-image-cutout", name: "gpt-image · cut-out on transparent", via: "openai" },
  { id: "gpt-image-masked", name: "gpt-image · type zone masked off", via: "openai" },
  /* way 1 (owner 2026-09-19): contemporary and punk paint on a flat ground
     of the PAINTER's choosing, unmasked; the composer reads that colour
     off the picture and grows the band out of it. Traditional keeps its
     paper tones and the mask. */
  { id: "gpt-image-own", name: "gpt-image · painter's own ground (way 1)", via: "openai" },
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

export interface ArtworkPrompt { prompt: string; short: string; card: string | null; aspect: "landscape" | "portrait" | "square"; paper: string }

/* THE GROUND, chosen before the ask (owner 2026-09-19: "a beautiful
   colourful illustration on top and a boring beige ground painted under
   it"). Traditional stays on paper tones; contemporary may take a pale
   colour; punk takes bold flat colour outright. The painter is handed
   this exact colour as its canvas, the composer draws the band in it, and
   the type is set for contrast — one ground, no seam. */
const GROUNDS: Record<string, string[]> = {
  traditional: ["#F4EFE3", "#F1EBDC", "#EFE6D3", "#F6F2EA", "#EAE3D2"],
  contemporary: ["#F4EFE3", "#FAF7F1", "#E9E4D6", "#DCE3DA", "#E8DFD0", "#F2E7D8"],
  punk: ["#1E2A44", "#B71318", "#D9A400", "#0F0F0F", "#2E6B4F", "#E85D2C", "#F4EFE3", "#7A2E8E"],
};
/* way 1, second pass: left entirely free, gpt-image went back to cream on
   four punk labels of six (run #14). The painter still chooses the colour,
   but is told what KIND of ground the style wants. */
const OWN_GROUND_KIND: Record<string, string> = {
  punk: "For this style the ground is a BOLD, saturated or deep colour — a loud flat ink, never paper, never cream, never white, never beige; the drawing sits on it in one or two contrasting inks. ",
  contemporary: "For this style the ground is either clean paper-white or ONE quiet tint (a pale or mid tone — dusty, chalky, mineral); never a busy or dark colour. ",
};
export function groundFor(style: string, seed: number): string {
  const list = GROUNDS[style] || GROUNDS.traditional;
  /* salt 7: the ground must not move in lockstep with the faces (1–3) */
  return list[mix(seed, 7) % list.length];
}

/* THE GAZETTEER (owner 2026-09-19: Svaneti towers on a Racha label — a
   region NAME means nothing to a painter; it needs what the region LOOKS
   like). Owner-written, 2-3 sentences per region, in /admin → Regions;
   used whenever the brief's region matches. */
export async function regionNote(region: string): Promise<string> {
  if (!region) return "";
  let map: Record<string, string> = DEFAULT_REGIONS;          /* Claude's drafts until the owner saves */
  try {
    const db = await getDb();
    const doc = (await db.collection("settings").findOne({ _id: "regions" } as never)) as { map?: Record<string, string> } | null;
    if (doc?.map) map = doc.map;
  } catch { /* the drafts still apply */ }
  const key = Object.keys(map).find((k) => k.trim().toLowerCase() === region.trim().toLowerCase());
  return key && map[key]?.trim() ? ` ${region.trim()} looks like this: ${map[key].trim()} ` : "";
}

/* THE ASK. Same words to every model. The reserved zone is the whole
   idea: the picture is composed to receive type, so art and type are
   planned together instead of fighting afterwards.
   `short` is the same ask without the house-feedback tail, for painters
   that cap the prompt (Recraft: 1000 characters). */
export async function buildArtworkPrompt(brief: EvalBrief, style: string, seed = 0, opts: { ownGround?: boolean } = {}): Promise<ArtworkPrompt> {
  const aspect = aspectOf(brief);
  const zone = zoneOf(aspect);
  const g = await artworkGuidance(style);
  const d = brief.data;
  const place = [d.region, d.country].filter(Boolean).join(", ");
  /* paper "" = the painter chooses (way 1); traditional always gets paper */
  const paper = opts.ownGround && style !== "traditional" ? "" : groundFor(style, seed);
  const dark = !!paper && (() => { const n = parseInt(paper.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 < 0.45; })();
  const gaz = await regionNote(d.region);
  const head =
    `Illustration for a wine label — the ARTWORK ONLY. No text, no lettering, no words, no numbers, no logo, no monogram, no border, no frame, no badge. ` +
    `Format: ${aspect === "portrait" ? "portrait 2:3" : aspect === "square" ? "square" : "landscape 3:2"}, the flat printed label itself, not a bottle, not a mockup. ` +
    `COMPOSITION: the illustration lives in the upper part of the picture; the ${zone.where} (${zone.share}) is left as EMPTY, flat, even paper ground — one continuous plain colour with nothing drawn on it — because the wine's name and details will be typeset there afterwards. Keep every drawn element clear of that zone; the illustration may reach the top and side edges if the style wants it, never the type zone. `;
  const styleLine = `STYLE: ${ART_STYLE[style] || ART_STYLE.traditional}.`;
  const subject =
    ` SUBJECT: ${brief.vision} ` +
    (place ? `The wine comes from ${place} — if the setting shows a landscape, it must be true to ${place}, never another region's.${gaz}` : "") +
    /* owner 2026-09-19 (x4 on the bake-off): painters invent churches, towers, châteaux */
    `Do NOT add buildings, towers, churches, castles or any architecture unless the story itself names them. ` +
    `A ${[d.sweetness, d.wineColorName].filter(Boolean).join(" ").toLowerCase()} ${(d.wineType || "wine").toLowerCase()}. `;
  const finish = paper
    ? `FINISH: handmade print on paper, not a photograph, not 3D, not airbrushed; discrete inks, honest imperfection; the ground is the plain ${dark ? "dark coloured" : "paper-coloured"} canvas you are given (${paper}) — keep it flat and untouched around the drawing.`
    : `FINISH: handmade print, not a photograph, not 3D, not airbrushed; discrete inks, honest imperfection. THE GROUND: choose ONE flat, solid, even colour that belongs to this illustration — the colour it is printed on — and fill the whole picture with it edge to edge, so that it continues unchanged into the empty type zone. ${OWN_GROUND_KIND[style] || ""}Absolutely no gradient, no texture, no vignette, no paper grain, no second colour in the ground; the type zone is nothing but that one flat colour.`;
  const prompt = head + styleLine + g.text + subject + finish;
  /* the short form keeps the ask, the style and the subject; the house
     feedback goes first, then the finish line, then the geography note */
  let short = head + styleLine + subject + finish;
  if (short.length > 1000) short = head + styleLine + subject;
  if (short.length > 1000) short = (head + styleLine + ` SUBJECT: ${brief.vision}`).slice(0, 1000);
  return { prompt, short, card: g.card, aspect, paper };
}

const FAL_SIZE: Record<ArtworkPrompt["aspect"], string> = { landscape: "landscape_4_3", portrait: "portrait_4_3", square: "square_hd" };
const FAL_RATIO: Record<ArtworkPrompt["aspect"], string> = { landscape: "4:3", portrait: "3:4", square: "1:1" };

/* one painting from one model — a data URL, like every provider here */
/* a plain paper canvas and a mask that opens ONLY the art region — the
   type zone (the same bottom band the prompt asks for) stays opaque, so
   the edit endpoint hands it back untouched */
async function paperAndMask(aspect: ArtworkPrompt["aspect"], colour: string): Promise<{ paper: string; mask: string }> {
  const sharp = (await import("sharp")).default;
  const W = aspect === "portrait" ? 1024 : aspect === "square" ? 1024 : 1536;
  const H = aspect === "portrait" ? 1536 : aspect === "square" ? 1024 : 1024;
  const n = parseInt(colour.slice(1), 16);
  const paper = await sharp({ create: { width: W, height: H, channels: 4, background: { r: n >> 16, g: (n >> 8) & 255, b: n & 255, alpha: 1 } } }).png().toBuffer();
  /* the open (transparent) window: top ~60% for landscape/square, ~65% for
     portrait, with a 4% margin at the top and sides */
  const m = Math.round(W * 0.04);
  const openH = Math.round(H * (aspect === "portrait" ? 0.65 : 0.6)) - m;
  const window = await sharp({ create: { width: W - 2 * m, height: openH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  const mask = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite([{ input: window, left: m, top: m, blend: "dest-out" }]).png().toBuffer();
  return { paper: `data:image/png;base64,${paper.toString("base64")}`, mask: `data:image/png;base64,${mask.toString("base64")}` };
}

export async function generateArtwork(model: EvalModel, ap: ArtworkPrompt, extra: { sketch?: string | null } = {}): Promise<string> {
  if (model.via === "openai") {
    const size = ap.aspect === "portrait" ? { w: 1024, h: 1536 } : ap.aspect === "square" ? { w: 1024, h: 1024 } : { w: 1536, h: 1024 };
    /* the customer's sketch (wizard) rides along as an image input — after
       the paper canvas when there is a mask, so the mask keeps applying to
       the canvas */
    const sketch = extra.sketch && extra.sketch.startsWith("data:image/") ? extra.sketch : null;
    const sketchLine = sketch ? " The customer's own sketch is attached: follow its subject and arrangement, rendered in the style described." : "";
    if (model.id === "gpt-image-cutout") {
      return generateOpenAIImage({
        prompt: ap.prompt + " Deliver the illustration as a CUT-OUT on a fully transparent background — nothing but the drawn subject, no paper, no ground, no vignette." + sketchLine,
        size, transparent: true, ...(sketch ? { reference: sketch } : {}),
      } as never);
    }
    /* way 1: with a paper (traditional) the mask still guards the band;
       without one the painter is free and the composer reads the ground */
    if (model.id === "gpt-image-masked" || (model.id === "gpt-image-own" && ap.paper)) {
      const { paper, mask } = await paperAndMask(ap.aspect, ap.paper);
      return generateOpenAIImage({
        prompt: ap.prompt + " Paint the illustration into the open area of the canvas; the rest of the canvas is finished paper and must stay exactly as it is." + sketchLine,
        size, reference: paper, mask, ...(sketch ? { references: [sketch] } : {}),
      } as never);
    }
    return generateOpenAIImage({ prompt: ap.prompt + sketchLine, size, ...(sketch ? { reference: sketch } : {}) } as never);
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
