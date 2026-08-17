import { PNG } from "pngjs";
import type { GenerationJob } from "./types";
import { generateMockImage } from "./mock";
import { generateOpenAIImage } from "./openai";

/* WHITE-EDGE GUARANTEE (owner 2026-08-16): the model sometimes returns a
   near-white ground (250-ish grey, not #FFF) — under the multiply blend
   that prints as a faint square around the artwork. Every generated PNG is
   post-processed: alpha flattened onto white, near-white pixels snapped to
   pure white through a soft knee (art shading below the knee untouched),
   and the outer 4% of every edge feathered to white — so the image always
   merges seamlessly into the label ground. Non-PNG (mock SVG) passes
   through; any failure returns the original. */
export function whitenEdges(dataUrl: string): string {
  const PREFIX = "data:image/png;base64,";
  if (!dataUrl.startsWith(PREFIX)) return dataUrl;
  try {
    const png = PNG.sync.read(Buffer.from(dataUrl.slice(PREFIX.length), "base64"));
    const { width: W, height: H, data: px } = png;
    const D = Math.max(2, Math.round(Math.min(W, H) * 0.04));
    const LO = 232, HI = 248;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        let r = px[i], g = px[i + 1], b = px[i + 2];
        const a = px[i + 3] / 255;
        if (a < 1) { r = r * a + 255 * (1 - a); g = g * a + 255 * (1 - a); b = b * a + 255 * (1 - a); }
        const m = Math.min(r, g, b);
        let t = m >= HI ? 1 : m >= LO ? (m - LO) / (HI - LO) : 0;
        if (t > 0 && t < 1) t = t * t * (3 - 2 * t);
        const ed = Math.min(x, y, W - 1 - x, H - 1 - y);
        if (ed < D) { const e = 1 - ed / D; t = Math.max(t, e * e); }
        if (t > 0) { r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; }
        px[i] = Math.round(r); px[i + 1] = Math.round(g); px[i + 2] = Math.round(b); px[i + 3] = 255;
      }
    }
    return PREFIX + PNG.sync.write(png).toString("base64");
  } catch {
    return dataUrl;
  }
}

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
      return whitenEdges(await generateImage(job));
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
