import type { GenerationJob } from "./types";

/* Real provider — OpenAI Images API. Text-only jobs use /images/generations;
   jobs with an uploaded reference sketch use /images/edits (which accepts an
   input image). Returns base64 → data URL, exactly what the label slot needs.
   Requires OPENAI_API_KEY (server-side only — never expose it to the client). */

const API = "https://api.openai.com/v1";

function pickSize(size?: { w: number; h: number }): string {
  // gpt-image models accept these fixed sizes; choose by requested aspect ratio
  const w = size?.w || 1024;
  const h = size?.h || 640;
  const ratio = w / h;
  if (ratio > 1.2) return "1536x1024";
  if (ratio < 0.83) return "1024x1536";
  return "1024x1024";
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = head.match(/data:([^;]+)/)?.[1] || "image/png";
  return new Blob([Buffer.from(b64, "base64")], { type: mime });
}

export async function generateOpenAIImage(job: GenerationJob): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set (put it in .env.local, server-side only)");
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";

  // the Images API has no separate negative-prompt field — fold it into the prompt
  let prompt = job.prompt || "";
  if (job.negative) prompt += ` Avoid: ${job.negative}.`;

  let res: Response;
  const imageInputs: { blob: Blob; name: string }[] = [];
  // only the winemaker's own sketch may steer as an image input — the owner's
  // style-reference boards deliberately never reach the image model (rule
  // 2026-08-13: image inputs made the model copy their shapes and subjects)
  if (job.reference) imageInputs.push({ blob: dataUrlToBlob(job.reference), name: "reference.png" });
  if (imageInputs.length) {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt);
    form.append("size", pickSize(job.size));
    for (const inp of imageInputs) form.append("image[]", inp.blob, inp.name);
    res = await fetch(`${API}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
  } else {
    res = await fetch(`${API}/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, size: pickSize(job.size) }),
    });
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 500)}`);
  }
  const json = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI response contained no image data");
  return `data:image/png;base64,${b64}`;
}
