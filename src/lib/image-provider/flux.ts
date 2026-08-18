import { getDb } from "@/lib/db";
import type { GenerationJob } from "./types";

/* FLUX provider via fal.ai (owner GO, 2026-08-18) — the LoRA path.
   FLUX has strong prompt comprehension (the thing Recraft lacked) and each
   of our styles can carry a REAL trained LoRA baked from the owner's board
   (trained via /api/admin/fal-lora). Generation passes that LoRA so the
   technique is native, not imitated. Needs FAL_KEY in .env.local.
   No LoRA trained yet → base FLUX dev (still a fair A/B baseline). */

const GEN_URL = "https://fal.run/fal-ai/flux-lora"; // blocking endpoint
export const FAL_LORAS_DOC = "fal-loras";
export const LORA_TRIGGER = "STYLE8K"; // trigger word baked at training time

export interface FalLoraMap {
  [styleKey: string]: { url: string; steps: number; refCount: number; trainedAt: string };
}

export async function getFalLoras(): Promise<FalLoraMap> {
  try {
    const db = await getDb();
    const doc = (await db.collection("settings").findOne({ _id: FAL_LORAS_DOC } as never)) as
      | ({ map?: FalLoraMap } & Record<string, unknown>)
      | null;
    return doc?.map || {};
  } catch {
    return {};
  }
}

export async function saveFalLora(styleKey: string, entry: FalLoraMap[string]): Promise<void> {
  const db = await getDb();
  await db.collection("settings").updateOne(
    { _id: FAL_LORAS_DOC } as never,
    { $set: { [`map.${styleKey}`]: entry } },
    { upsert: true }
  );
}

export async function generateFluxImage(job: GenerationJob): Promise<string> {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY is not set (put it in .env.local, server-side only)");

  const styleKey = String(job.art?.preset || "").split("/")[0];
  const loras = await getFalLoras();
  const lora = loras[styleKey];

  // FLUX comprehends well — but with a LoRA the technique is native, so the
  // condensed prompt (subject + geometry + non-negotiables) plus the trigger
  // word is the right shape; the long board-language is redundant.
  let prompt = job.shortPrompt || job.prompt || "";
  if (lora) prompt = `${LORA_TRIGGER} style. ${prompt}`;
  if (prompt.length > 1900) prompt = prompt.slice(0, 1900);

  const res = await fetch(GEN_URL, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      image_size: { width: 1664, height: 1024 }, // ≈ the engine's 1.6:1
      num_inference_steps: 28,
      guidance_scale: 3.5,
      num_images: 1,
      output_format: "png",
      loras: lora ? [{ path: lora.url, scale: 1.0 }] : [],
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    images?: { url?: string; content_type?: string }[];
    detail?: unknown; error?: string;
  };
  if (!res.ok || !body.images?.length)
    throw new Error(`FLUX generation failed (${res.status}): ${JSON.stringify(body.detail || body.error || body).slice(0, 200)}`);
  const url = body.images[0].url;
  if (!url) throw new Error("FLUX returned no image url");
  const imgRes = await fetch(url);
  if (!imgRes.ok) throw new Error(`FLUX image download failed (${imgRes.status})`);
  const mime = imgRes.headers.get("content-type") || body.images[0].content_type || "image/png";
  const buf = Buffer.from(await imgRes.arrayBuffer());
  return `data:${mime};base64,${buf.toString("base64")}`;
}
