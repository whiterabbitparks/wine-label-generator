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

/* Two kinds of transient failure are worth retrying:
   - OpenAI rate limits (observed: 5 images/min, so a 6-style fan-out
     reliably 429s at least once) — honour the "try again in Ns" hint,
     falling back to 15 s.
   - Network-level errors ("fetch failed", resets, DNS blips) — a brief
     Wi-Fi/VPN hiccup shouldn't fail the whole label set; retry after 3 s. */
const RETRIES = 2;

function transientKind(e: unknown): "rate" | "network" | null {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("429") || msg.includes("rate_limit")) return "rate";
  const cause = e instanceof Error ? (e.cause as { code?: string; message?: string } | undefined) : undefined;
  const net = `${msg} ${cause?.code ?? ""} ${cause?.message ?? ""}`;
  if (/fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|socket|network/i.test(net))
    return "network";
  return null;
}

export async function generateImageWithRetry(job: GenerationJob): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await generateImage(job);
    } catch (e) {
      const kind = transientKind(e);
      if (!kind || attempt >= RETRIES) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      const hinted = msg.match(/try again in (\d+(?:\.\d+)?)s/i);
      const waitMs =
        kind === "rate" ? (hinted ? Math.ceil(parseFloat(hinted[1]) * 1000) + 1000 : 15000) : 3000;
      await new Promise((res) => setTimeout(res, waitMs));
    }
  }
}
