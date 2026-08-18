import sharp from "sharp";
import { getDb } from "@/lib/db";
import type { GenerationJob } from "./types";

/* RECRAFT provider (owner GO, 2026-08-17) — the style-conditioning trial.
   Unlike gpt-image, Recraft SEES the owner's reference boards: each of our
   styles maps to a Recraft custom style (created from 3-5 board images via
   "Sync boards to Recraft" in the admin) and generations pass its style_id,
   so technique/light/detail-scale transfer directly instead of through a
   60-word description. Needs RECRAFT_API_KEY in .env.local (server-side).

   Notes:
   - Recraft prompts are shorter than gpt-image's; the style_id carries the
     visual language, so truncating our long prompt tail (board language is
     redundant here) is deliberate, not lossy.
   - No separate negative field on this endpoint — folded into the prompt.
   - Size 1707x1024 ≈ the engine's 1.6:1 artwork ratio. */

const API = "https://external.api.recraft.ai/v1";
export const RECRAFT_STYLES_DOC = "recraft-styles";

export interface RecraftStyleMap {
  [styleKey: string]: { id: string; refCount: number; syncedAt: string };
}

export async function getRecraftStyles(): Promise<RecraftStyleMap> {
  try {
    const db = await getDb();
    const doc = (await db.collection("settings").findOne({ _id: RECRAFT_STYLES_DOC } as never)) as
      | ({ map?: RecraftStyleMap } & Record<string, unknown>)
      | null;
    return doc?.map || {};
  } catch {
    return {};
  }
}

export async function saveRecraftStyle(styleKey: string, id: string, refCount: number): Promise<void> {
  const db = await getDb();
  await db.collection("settings").updateOne(
    { _id: RECRAFT_STYLES_DOC } as never,
    { $set: { [`map.${styleKey}`]: { id, refCount, syncedAt: new Date().toISOString() } } },
    { upsert: true }
  );
}

/** Create a Recraft custom style from raw image buffers (1-5). Returns id. */
export async function createRecraftStyle(images: { buf: Buffer; name: string }[]): Promise<string> {
  const key = process.env.RECRAFT_API_KEY;
  if (!key) throw new Error("RECRAFT_API_KEY is not set (put it in .env.local, server-side only)");
  if (!images.length) throw new Error("at least one reference image is required");
  const form = new FormData();
  form.append("style", "digital_illustration");
  for (const img of images.slice(0, 5))
    form.append("file", new Blob([new Uint8Array(img.buf)]), img.name || "ref.png");
  const res = await fetch(`${API}/styles`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; error?: string };
  if (!res.ok || !body.id)
    throw new Error(`Recraft style creation failed (${res.status}): ${body.message || body.error || "no id returned"}`);
  return body.id;
}

/** Generation. style key parsed from job.art.preset ("<styleKey>/<subKey>"). */
export async function generateRecraftImage(job: GenerationJob): Promise<string> {
  const key = process.env.RECRAFT_API_KEY;
  if (!key) throw new Error("RECRAFT_API_KEY is not set (put it in .env.local, server-side only)");

  // The style_id carries the boards' visual language, so the CONDENSED prompt
  // wins: subject + composition geometry + non-negotiables. (Truncating the
  // full prompt cut off the SUBJECT in live testing — millstone, not tower.)
  let prompt = job.shortPrompt || job.prompt || "";
  if (!job.shortPrompt && job.negative) prompt += ` Avoid: ${job.negative}.`;
  if (prompt.length > 990) prompt = prompt.slice(0, 990);

  const styleKey = String(job.art?.preset || "").split("/")[0];
  const styles = await getRecraftStyles();
  const styleId = styles[styleKey]?.id;

  const payload: Record<string, unknown> = {
    prompt,
    model: "recraftv3",
    size: "1707x1024", // closest offering to the engine's 1.6:1 artwork
    n: 1,
    response_format: "b64_json",
  };
  if (styleId) payload.style_id = styleId;
  else payload.style = "digital_illustration"; // pre-sync fallback

  const res = await fetch(`${API}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as {
    data?: { url?: string; b64_json?: string }[];
    message?: string; error?: string; code?: string;
  };
  if (!res.ok || !body.data?.length)
    throw new Error(`Recraft generation failed (${res.status}): ${body.message || body.error || "no image returned"}`);

  const item = body.data[0];
  let buf: Buffer;
  if (item.b64_json) buf = Buffer.from(item.b64_json, "base64");
  else if (item.url) {
    const imgRes = await fetch(item.url);
    if (!imgRes.ok) throw new Error(`Recraft image download failed (${imgRes.status})`);
    buf = Buffer.from(await imgRes.arrayBuffer());
  } else throw new Error("Recraft returned neither url nor b64_json");

  // Recraft serves WebP regardless of requested format (live-observed) — the
  // finishing pipeline (white edges, ink discipline, re-centring) only
  // processes PNG, so convert here.
  if (buf.slice(0, 4).toString("ascii") === "RIFF") buf = await sharp(buf).png().toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
}
