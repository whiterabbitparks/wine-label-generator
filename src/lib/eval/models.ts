import { generateOpenAIImage } from "@/lib/image-provider/openai";
import { falUpload } from "@/lib/image-provider/flux";
import { getDb } from "@/lib/db";
import { DEFAULT_REGIONS } from "./regions";
import type { EvalBrief } from "./briefs";
import { aspectOf } from "./briefs";
import { readArtist, listArtists, artistRefs, artistCharter, type ArtistProfile } from "@/lib/label/artists";

/* THE PAINTER (round 105, 2026-09-20 — the owner, after nine story
   tests: "we have a winner: gpt-image → FLUX + LoRA at 0.60; drop every
   other model").

   ONE pipeline, two steps, always an artist:
     1. STORY  gpt-image paints the brief's story, shown four of the
               artist's works as references and her charter — it
               understands the story best of every model tried and hands
               back a spot illustration on plain paper (the type's room).
     2. HAND   FLUX + the artist's LoRA repaints that picture image-to-
               image at strength 0.60 — the story stays, the hand becomes
               hers. If FLUX cannot paint (balance, outage) the story
               picture ships as it is, so the customer always gets a label.
   Nothing else paints. The test scripts that found this live in
   data/experiments/ (git-ignored); the marks in data/eval/. */

export const REPAINT_STRENGTH = 0.60;
export const LORA_SCALE = 1.0;

export interface EvalModel {
  id: string;              /* "artist:<id>" */
  name: string;
  artist: ArtistProfile;
  lora: { url: string; trigger: string } | null;
}

export function evalModel(id: string): EvalModel | null {
  return id.startsWith("artist:") ? artistModel(id.slice(7)) : null;
}
export function artistModel(artistId: string): EvalModel | null {
  const a = readArtist(artistId);
  if (!a) return null;
  return { id: `artist:${a.profile.id}`, name: a.profile.name, artist: a.profile, lora: a.lora ? { url: a.lora.url, trigger: a.lora.trigger } : null };
}
export function artistModels(): EvalModel[] {
  return listArtists().map((a) => artistModel(a.profile.id)).filter((m): m is EvalModel => !!m);
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

export interface ArtworkPrompt { prompt: string; subject: string; aspect: "landscape" | "portrait" | "square" }

/* THE VIGNETTE — the one composition every model knows: an isolated spot
   illustration on a flat plain ground with air around it. The composer
   trims the air and sets the type on that same paper: nothing is ever
   cut or covered, the drawing ends where the artist ended it. */
const VIGNETTE = "A spot illustration: one self-contained drawing isolated on a flat, plain, single-colour background with empty margin all around; the drawing's edges finish naturally.";

/* THE ASK, exactly as test 5/7/8/9 put it (the words the owner marked) */
export async function buildArtworkPrompt(brief: EvalBrief, artist: ArtistProfile): Promise<ArtworkPrompt> {
  const d = brief.data;
  const place = [d.region, d.country].filter(Boolean).join(", ");
  const gaz = await regionNote(d.region);
  const subject = `${brief.vision} ${place ? `Set in ${place}.${gaz}` : ""} No buildings unless the story names them. No text, no letters, no border.`;
  const inStyle = `Painted by ${artist.name}, whose works are the reference images: ${artistCharter(artist)}. Paint a NEW picture in exactly her manner, medium and palette (do not copy the reference subjects).`;
  return { prompt: `${inStyle} ${VIGNETTE} ${subject}`, subject, aspect: aspectOf(brief) };
}

const GPT_SIZE = { landscape: { w: 1536, h: 1024 }, portrait: { w: 1024, h: 1536 }, square: { w: 1024, h: 1024 } } as const;

/* STEP 1 — the story, by gpt-image, with the artist's four works beside
   the ask (and the customer's own sketch, when there is one) */
export async function paintStory(model: EvalModel, ap: ArtworkPrompt, extra: { sketch?: string | null } = {}): Promise<string> {
  const sketch = extra.sketch && extra.sketch.startsWith("data:image/") ? extra.sketch : null;
  const refs = artistRefs(model.artist.id);
  return generateOpenAIImage({
    prompt: ap.prompt + (sketch ? " The last image is the customer's own sketch: follow its subject and arrangement." : ""),
    references: [...refs, ...(sketch ? [sketch] : [])],
    size: GPT_SIZE[ap.aspect], quality: "medium",
  } as never);
}

/* STEP 2 — the hand: FLUX + the artist's LoRA repaints the story picture */
export async function repaintInHand(model: EvalModel, story: string, ap: ArtworkPrompt): Promise<string> {
  if (!model.lora) throw new Error(`${model.name} has no trained LoRA yet`);
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY is not set");
  const url = await falUpload(Buffer.from(story.slice(story.indexOf(",") + 1), "base64"), "story.png", "image/png");
  const prompt = `${model.lora.trigger} style. Repaint this picture in your own hand — same scene, same subjects in the same places, your own colours and brush: ${ap.subject} Painted as ${artistCharter(model.artist)}. Keep the plain, empty paper around the drawing.`.slice(0, 1900);
  const res = await fetch("https://fal.run/fal-ai/flux-lora/image-to-image", {
    method: "POST", headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, image_url: url, strength: REPAINT_STRENGTH, num_inference_steps: 28, guidance_scale: 3.5, num_images: 1, output_format: "png", loras: [{ path: model.lora.url, scale: LORA_SCALE }] }),
  });
  const out = (await res.json().catch(() => ({}))) as { images?: { url?: string; content_type?: string }[]; detail?: unknown; error?: string };
  if (!res.ok || !out.images?.[0]?.url) throw new Error(`FLUX + LoRA failed (${res.status}): ${JSON.stringify(out.detail || out.error || out).slice(0, 240)}`);
  const img = await fetch(out.images[0].url);
  if (!img.ok) throw new Error(`FLUX + LoRA image download failed (${img.status})`);
  return `data:${img.headers.get("content-type") || "image/png"};base64,${Buffer.from(await img.arrayBuffer()).toString("base64")}`;
}

/* both steps; `story` is kept so a failed repaint still yields a picture */
export async function generateArtwork(model: EvalModel, ap: ArtworkPrompt, extra: { sketch?: string | null } = {}): Promise<{ art: string; story: string; repainted: boolean; error?: string }> {
  const story = await paintStory(model, ap, extra);
  try {
    return { art: await repaintInHand(model, story, ap), story, repainted: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[painter] FLUX + LoRA failed for ${model.id}: ${error} — the story picture ships as painted`);
    return { art: story, story, repainted: false, error };
  }
}
