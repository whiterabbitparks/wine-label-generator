import { PNG } from "pngjs";
import type { GenerationJob } from "./types";
import { generateMockImage } from "./mock";
import { generateOpenAIImage } from "./openai";
import { generateFluxImage, restyleWithFlux } from "./flux";

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

export function finishArtwork(dataUrl: string, paletteLock?: string[]): string {
  const PREFIX = "data:image/png;base64,";
  if (!dataUrl.startsWith(PREFIX)) return dataUrl;
  try {
    const png = PNG.sync.read(Buffer.from(dataUrl.slice(PREFIX.length), "base64"));
    const { width: W, height: H, data: px } = png;
    const D = Math.max(2, Math.round(Math.min(W, H) * 0.04));
    const INK_FX = process.env.IMAGE_FINISH !== "raw";
    const LO = 232, HI = 248, STEP = 255 / (INK_LEVELS - 1);
    /* PAPER NEUTRALIZATION (owner trial 2026-08-18): style-conditioned
       providers inherit their references' toned paper (tan/beige grounds,
       live-observed from Recraft) — under multiply a toned ground prints as
       a block. Sample the border ring's light pixels; if the "paper" isn't
       white, white-balance the whole image so paper → pure white (inks keep
       their relative colour). No-op when the ground is already white. */
    let fr = 1, fg = 1, fb = 1;
    {
      const R = Math.max(2, Math.round(Math.min(W, H) * 0.02));
      let n = 0, sr = 0, sg = 0, sb = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (x >= R && x < W - R && y >= R && y < H - R) { x = W - R - 1; continue; }
          const i = (y * W + x) * 4;
          const a = px[i + 3] / 255;
          const r = px[i] * a + 255 * (1 - a), g = px[i + 1] * a + 255 * (1 - a), b = px[i + 2] * a + 255 * (1 - a);
          if ((Math.max(r, g, b) + Math.min(r, g, b)) / 510 > 0.55) { sr += r; sg += g; sb += b; n++; }
        }
      }
      if (n > 50) {
        const pr = sr / n, pg = sg / n, pb = sb / n;
        // treat as "paper" down to fairly deep tans (live-observed ~140s);
        // cap the boost so inks can't blow out
        if (Math.min(pr, pg, pb) >= 110 && Math.min(pr, pg, pb) < 250) {
          fr = Math.min(2.3, 255 / pr); fg = Math.min(2.3, 255 / pg); fb = Math.min(2.3, 255 / pb);
        }
      }
    }
    /* PALETTE LOCK (owner rule 2026-08-18): precompute the card's ink set;
       every coloured pixel is mapped to its nearest ink by hue, luminance
       preserved — invented hues cannot survive. Neutral pixels stay. */
    const PAL = (paletteLock || [])
      .map((hx) => {
        const mm = /^#?([0-9a-f]{6})$/i.exec(hx); if (!mm) return null;
        const n = parseInt(mm[1], 16), pr = (n >> 16) & 255, pg = (n >> 8) & 255, pb = n & 255;
        const mx = Math.max(pr, pg, pb), mn = Math.min(pr, pg, pb);
        const s2 = mx === mn ? 0 : (mx - mn) / (255 - Math.abs(mx + mn - 255));
        let h2 = 0;
        if (mx !== mn) {
          if (mx === pr) h2 = 60 * ((pg - pb) / (mx - mn) + (pg < pb ? 6 : 0));
          else if (mx === pg) h2 = 60 * ((pb - pr) / (mx - mn) + 2);
          else h2 = 60 * ((pr - pg) / (mx - mn) + 4);
        }
        const L2 = 0.299 * pr + 0.587 * pg + 0.114 * pb;
        return { r: pr, g: pg, b: pb, h: ((h2 % 360) + 360) % 360, s: s2, L: Math.max(1, L2) };
      })
      .filter(Boolean) as { r: number; g: number; b: number; h: number; s: number; L: number }[];
    const PAL_C = PAL.filter((p2) => p2.s >= 0.15); // coloured inks only
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        let r = px[i], g = px[i + 1], b = px[i + 2];
        const a = px[i + 3] / 255;
        if (a < 1) { r = r * a + 255 * (1 - a); g = g * a + 255 * (1 - a); b = b * a + 255 * (1 - a); }
        r = Math.min(255, r * fr); g = Math.min(255, g * fg); b = Math.min(255, b * fb);
        let m = Math.min(r, g, b);
        if (PAL_C.length && m < HI) {
          const mx2 = Math.max(r, g, b);
          const s2 = mx2 === m ? 0 : (mx2 - m) / (255 - Math.abs(mx2 + m - 255));
          if (s2 >= 0.12) { // coloured pixel → nearest ink by hue
            let h2 = 0;
            if (mx2 !== m) {
              if (mx2 === r) h2 = 60 * ((g - b) / (mx2 - m) + (g < b ? 6 : 0));
              else if (mx2 === g) h2 = 60 * ((b - r) / (mx2 - m) + 2);
              else h2 = 60 * ((r - g) / (mx2 - m) + 4);
            }
            h2 = ((h2 % 360) + 360) % 360;
            let best = PAL_C[0], bd = 1e9;
            for (const p2 of PAL_C) {
              const d = Math.min(Math.abs(h2 - p2.h), 360 - Math.abs(h2 - p2.h));
              if (d < bd) { bd = d; best = p2; }
            }
            const Lp = 0.299 * r + 0.587 * g + 0.114 * b;
            const f2 = Lp / best.L;
            r = Math.min(255, best.r * f2); g = Math.min(255, best.g * f2); b = Math.min(255, best.b * f2);
            m = Math.min(r, g, b);
          }
        }
        // ink discipline: grain ∝ ink coverage, then quantize LUMINANCE only
        // (all channels scaled by the same factor → hue exactly preserved;
        // per-channel posterizing would band into false colours).
        // IMAGE_FINISH=raw skips it (owner A/B, 2026-08-20) — everything
        // else (paper neutralization, palette lock, white edges) stays.
        if (INK_FX && m < HI) {
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
    /* CONTENT RE-CENTRING (owner 2026-08-17; refined 2026-08-18 after the
       owner's before/after comparison): centre on the ink CENTROID (density-
       weighted mass), not the bounding-box midpoint — sparse tendrils used
       to count as much as the dense subject, leaving the visual mass a few
       percent off-centre. Shift is clamped so no ink leaves the canvas. */
    let bx0 = W, by0 = H, bx1 = -1, by1 = -1; // bbox of SIGNIFICANT ink only —
    let sw = 0, sx2 = 0, sy2 = 0;             // ghost speckles may crop
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const m2 = Math.min(px[i], px[i + 1], px[i + 2]);
        if (m2 < HI) {
          if (m2 < 200) {
            if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
            if (y < by0) by0 = y; if (y > by1) by1 = y;
          }
          const w2 = 1 - m2 / 255; // denser ink pulls harder
          sw += w2; sx2 += x * w2; sy2 += y * w2;
        }
      }
    }
    if (bx1 >= bx0 && sw > 0) {
      let dx = Math.round(W / 2 - sx2 / sw);
      let dy = Math.round(H / 2 - sy2 / sw);
      // clamp: the full ink bbox must stay on the canvas
      dx = Math.max(-bx0, Math.min(W - 1 - bx1, dx));
      dy = Math.max(-by0, Math.min(H - 1 - by1, dy));
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

/* DEV/PROD QUALITY (owner 2026-08-18): during development the artistic
   side is what's being tuned — resolution and render quality are wasted
   money. IMAGE_QUALITY=dev (the default) buys cheap passes (gpt-image
   quality low, FLUX at quarter-megapixels); IMAGE_QUALITY=prod restores
   full quality for launch. One env switch, nothing else changes. */
export function imageQuality(): "dev" | "prod" {
  return process.env.IMAGE_QUALITY === "prod" ? "prod" : "dev";
}

export function providerName(): "mock" | "openai" | "flux" | "hybrid" {
  const p = process.env.IMAGE_PROVIDER;
  return p === "openai" ? "openai" : p === "flux" ? "flux" : p === "hybrid" ? "hybrid" : "mock";
}

export async function generateImage(job: GenerationJob): Promise<string> {
  const p = job.provider || providerName(); // per-job override = playground A/B
  if (p === "hybrid") {
    // owner insight 2026-08-18: gpt-image composes the STORY, the FLUX LoRA
    // repaints the CRAFT — comprehension and technique from different models
    const base = await generateOpenAIImage(job);
    return restyleWithFlux(base, job);
  }
  return p === "openai" ? generateOpenAIImage(job)
    : p === "flux" ? generateFluxImage(job)
    : generateMockImage(job);
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
      return finishArtwork(await generateImage(job), job.paletteLock);
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

/* Same retry, NO artwork finishing — marketing photos must keep their real
   gradients, transparency and colours (ink discipline / white edges are
   label-artwork treatments and would destroy a photograph). */
export async function generateImageRawWithRetry(job: GenerationJob): Promise<string> {
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

/* SCREEN-PRINT KEYING (owner 2026-08-19): convert the finished white-ground
   PNG into an ink-density alpha PNG — "unmultiply". Alpha = ink coverage
   (255 − min channel); colour is re-derived so that compositing the pixel
   over pure white reproduces the original exactly. Because multiply is
   linear in the source, the keyed image under multiply renders identically
   to the old opaque image on ANY light ground — but on dark grounds the
   engine can now composite it normally: opaque inks on coloured stock, the
   real screen-print behaviour, instead of ink drowning in the ground.
   MUST run LAST: verification and palette extraction need opaque pixels. */
export function keyArtwork(dataUrl: string): string {
  const PREFIX = "data:image/png;base64,";
  if (!dataUrl.startsWith(PREFIX)) return dataUrl;
  try {
    const png = PNG.sync.read(Buffer.from(dataUrl.slice(PREFIX.length), "base64"));
    const { width: W, height: H, data: px } = png;
    for (let i = 0; i < W * H * 4; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const a = 255 - Math.min(r, g, b); // ink coverage
      if (a === 0) { px[i] = px[i + 1] = px[i + 2] = 0; px[i + 3] = 0; continue; }
      const w = 255 - a; // white share to remove
      px[i] = Math.max(0, Math.min(255, Math.round(((r - w) * 255) / a)));
      px[i + 1] = Math.max(0, Math.min(255, Math.round(((g - w) * 255) / a)));
      px[i + 2] = Math.max(0, Math.min(255, Math.round(((b - w) * 255) / a)));
      px[i + 3] = a;
    }
    return PREFIX + PNG.sync.write(png).toString("base64");
  } catch {
    return dataUrl;
  }
}
