import type { GenerationJob } from "./types";
import { generateMockImage } from "./mock";
import { generateOpenAIImage } from "./openai";

/* Single place that answers "which image model are we using?" — read at
   request time so .env.local edits apply without a restart in dev. */

export function providerName(): "mock" | "openai" {
  return process.env.IMAGE_PROVIDER === "openai" ? "openai" : "mock";
}

export function generateImage(job: GenerationJob): Promise<string> {
  return providerName() === "openai" ? generateOpenAIImage(job) : generateMockImage(job);
}

/* OpenAI caps image generations per minute (observed: 5/min), so a 6-style
   fan-out reliably 429s at least once. Honour the "try again in Ns" hint
   (falling back to 15 s) and retry a couple of times before giving up. */
const RETRIES = 2;

export async function generateImageWithRetry(job: GenerationJob): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await generateImage(job);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const rateLimited = msg.includes("429") || msg.includes("rate_limit");
      if (!rateLimited || attempt >= RETRIES) throw e;
      const hinted = msg.match(/try again in (\d+(?:\.\d+)?)s/i);
      const waitMs = hinted ? Math.ceil(parseFloat(hinted[1]) * 1000) + 1000 : 15000;
      await new Promise((res) => setTimeout(res, waitMs));
    }
  }
}
