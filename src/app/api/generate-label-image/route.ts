import { NextResponse } from "next/server";
import type { GenerationJob } from "@/lib/image-provider/types";
import { generateMockImage } from "@/lib/image-provider/mock";
import { generateOpenAIImage } from "@/lib/image-provider/openai";
import { logGeneration } from "@/lib/admin/generation-log";

/* POST /api/generate-label-image
   Body: the EightKImageGen.buildJob() payload.
   Returns: { imageDataUrl, provider }
   Provider selection: IMAGE_PROVIDER=mock (default) | openai
   Every attempt is logged to the `generations` collection (metadata only);
   logging failures never break generation. */

export const maxDuration = 120; // real image models can be slow

export async function POST(req: Request) {
  let job: GenerationJob;
  try {
    job = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!job || typeof job.prompt !== "string" || !job.prompt.trim()) {
    return NextResponse.json({ error: "job.prompt is required" }, { status: 400 });
  }

  const providerName = process.env.IMAGE_PROVIDER === "openai" ? "openai" : "mock";
  const started = Date.now();
  try {
    const imageDataUrl =
      providerName === "openai" ? await generateOpenAIImage(job) : await generateMockImage(job);
    logGeneration(job, {
      provider: providerName,
      ok: true,
      durationMs: Date.now() - started,
      imageBytes: Math.round(imageDataUrl.length * 0.75),
    }).catch((e) => console.error("generation log failed:", e?.message));
    return NextResponse.json({ imageDataUrl, provider: providerName });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("generate-label-image failed:", message);
    logGeneration(job, {
      provider: providerName,
      ok: false,
      durationMs: Date.now() - started,
      error: message,
    }).catch(() => {});
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
