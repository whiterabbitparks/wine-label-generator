import { PNG } from "pngjs";
import type { GenerationJob } from "./types";
import { generateMockImage } from "./mock";
import { generateOpenAIImage } from "./openai";

/* ARTWORK FINISHING (owner 2026-08-16/17) — one pixel pass over every
   generated PNG, two jobs:

   1. INK DISCIPLINE (owner 2026-08-17): the AI look is mostly continuous
      airbrushed gradients; real prints are discrete ink on paper. Each
      pixel gets deterministic paper grain (amplitude proportional to ink
      coverage — white paper stays clean) and is then posterized to a
      small number of tone levels per channel, so smooth gradients break
      into flat ink layers like a screen print. Hue is preserved, so
      multi-colour art (riso, cut-outs) keeps its colours.

   2. WHITE-EDGE GUARANTEE (owner 2026-08-16): near-white grounds print as
      a faint square under multiply. Alpha is flattened onto white,
      near-white snaps to pure #FFF through a soft knee, and the outer 4%
      of every edge feathers to white so the image merges seamlessly.

   Non-PNG (mock SVG) passes through; any failure returns the original. */
const INK_LEVELS = 6;      // tone steps per channel (screen-print layers)
const GRAIN_AMP = 12;      // max grain, scaled by ink coverage

/* deterministic per-pixel noise in [-1, 1] — no RNG, reproducible */
function grainAt(x: number, y: number): number {
  let n = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
  return ((n & 0xffff) / 0x7fff) - 1;
}

export function finishArtwork(dataUrl: string): string {
  const PREFIX = "data:image/png;base64,";
  if (!dataUrl.startsWith(PREFIX)) return dataUrl;
  try {
    const png = PNG.sync.read(Buffer.from(dataUrl.slice(PREFIX.length), "base64"));
    const { width: W, height: H, data: px } = png;
    const D = Math.max(2, Math.round(Math.min(W, H) * 0.04));
    const LO = 232, HI = 248, STEP = 255 / (INK_LEVELS - 1);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        let r = px[i], g = px[i + 1], b = px[i + 2];
        const a = px[i + 3] / 255;
        if (a < 1) { r = r * a + 255 * (1 - a); g = g * a + 255 * (1 - a); b = b * a + 255 * (1 - a); }
        let m = Math.min(r, g, b);
        // ink discipline: grain ∝ ink coverage, then quantize LUMINANCE only
        // (all channels scaled by the same factor → hue exactly preserved;
        // per-channel posterizing would band into false colours)
        if (m < HI) {
          const L = 0.299 * r + 0.587 * g + 0.114 * b;
          const gr = grainAt(x, y) * GRAIN_AMP * (1 - m / 255);
          const Lq = Math.min(255, Math.max(0, Math.round((L + gr) / STEP) * STEP));
          const f = L > 0 ? Lq / L : 0;
          r = Math.min(255, r * f); g = Math.min(255, g * f); b = Math.min(255, b * f);
          m = Math.min(r, g, b);
        }
        // white-edge guarantee: soft knee to pure white + edge feather
        let t = m >= HI ? 1 : m >= LO ? (m - LO) / (HI - LO) : 0;
        if (t > 0 && t < 1) t = t * t * (3 - 2 * t);
        const ed = Math.min(x, y, W - 1 - x, H - 1 - y);
        if (ed < D) { const e = 1 - ed / D; t = Math.max(t, e * e); }
        if (t > 0) { r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; }
        px[i] = Math.round(r); px[i + 1] = Math.round(g); px[i + 2] = Math.round(b); px[i + 3] = 255;
      }
    }
    /* CONTENT RE-CENTRING (owner 2026-08-17): the model often paints the
       subject off-centre on its canvas (extra white on one side). The layout
       centres the RECT, so an off-centre subject reads as a broken layout.
       Find the ink bounding box (non-white after whitening) and shift the
       whole content so its centre sits on the canvas centre. */
    let bx0 = W, by0 = H, bx1 = -1, by1 = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (Math.min(px[i], px[i + 1], px[i + 2]) < HI) {
          if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
          if (y < by0) by0 = y; if (y > by1) by1 = y;
        }
      }
    }
    if (bx1 >= bx0) {
      const dx = Math.round(W / 2 - (bx0 + bx1 + 1) / 2);
      const dy = Math.round(H / 2 - (by0 + by1 + 1) / 2);
      if (Math.abs(dx) > W * 0.01 || Math.abs(dy) > H * 0.01) {
        const src = Buffer.from(px);
        px.fill(255);
        for (let y = 0; y < H; y++) {
          const sy = y - dy; if (sy < 0 || sy >= H) continue;
          for (let x = 0; x < W; x++) {
            const sx = x - dx; if (sx < 0 || sx >= W) continue;
            const si = (sy * W + sx) * 4, di = (y * W + x) * 4;
            px[di] = src[si]; px[di + 1] = src[si + 1]; px[di + 2] = src[si + 2]; px[di + 3] = 255;
          }
        }
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
      return finishArtwork(await generateImage(job));
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
