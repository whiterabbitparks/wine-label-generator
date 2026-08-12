import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { loadCatalog, pickSubStyle } from "@/lib/styles/catalog";
import { buildStyleJob, type LabelBrief } from "@/lib/styles/prompt";
import { loadConfig, DEFAULT_CONFIG } from "@/lib/admin/config-store";
import { providerName, generateImageWithRetry } from "@/lib/image-provider";
import { getImageStorage } from "@/lib/image-storage";
import { logGeneration } from "@/lib/admin/generation-log";

/* POST /api/generate-label-set — the generation orchestrator.

   In: the raw brief {vision?, reference?, data?, seed?} — the client sends
   what the winemaker typed, never a prompt. The server owns prompt assembly
   (style catalog + art direction + focus guidance), which is what makes the
   art direction an enforceable guardrail instead of a suggestion.

   Out: { seed, provider, images: { <styleKey>: { url, imageUrl, subStyle,
   subStyleLabel } }, errors: { <styleKey>: message } } — one image per label
   style, each generated with a sub-style picked deterministically from the
   seed. Succeeds if at least one style succeeds.

   Cache: keyed on a hash of everything that affects the output (brief + catalog +
   art direction + provider). Same brief + same seed → served from memory,
   free. The cache is per-process (fine for one server; revisit for multi-
   instance deploys).

   TODO(security): rate-limit before any public deployment — a single request
   fans out to 6 provider calls. */

export const maxDuration = 300; // 6 real image-model calls can be slow

const MAX_VISION = 2000;
const MAX_REFERENCE = 8 * 1024 * 1024; // ~8 MB data URL
const DATA_KEYS = [
  "producer", "wine", "appellation", "classification", "grape",
  "region", "country", "special", "vintage", "wineColorName", "wineType",
];

interface SetEntry {
  url: string;
  imageUrl: string | null;
  subStyle: string;
  subStyleLabel: string;
}
interface SetResult {
  seed: number;
  provider: string;
  images: Record<string, SetEntry>;
  errors: Record<string, string>;
}

declare global {
  // eslint-disable-next-line no-var
  var __labelSetCache: Map<string, SetResult> | undefined;
}
const CACHE_MAX = 50; // FIFO bound — entries hold 6 data URLs each
function cache(): Map<string, SetResult> {
  if (!globalThis.__labelSetCache) globalThis.__labelSetCache = new Map();
  return globalThis.__labelSetCache;
}

function sanitizeBrief(raw: unknown): LabelBrief | { error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const vision = typeof r.vision === "string" ? r.vision.slice(0, MAX_VISION).trim() : "";
  let reference: string | null = null;
  if (typeof r.reference === "string" && r.reference) {
    if (!r.reference.startsWith("data:image/")) return { error: "reference must be an image data URL" };
    if (r.reference.length > MAX_REFERENCE) return { error: "reference image too large (8 MB max)" };
    reference = r.reference;
  }
  const data: Record<string, string> = {};
  if (r.data && typeof r.data === "object") {
    for (const k of DATA_KEYS) {
      const v = (r.data as Record<string, unknown>)[k];
      if (typeof v === "string" && v.trim()) data[k] = v.slice(0, 200).trim();
    }
  }
  const seed = Number.isFinite(Number(r.seed)) ? Math.abs(Math.floor(Number(r.seed))) : 0;
  // layout zones: validated pass-through (fractional boxes only)
  let zones: LabelBrief["zones"] = null;
  if (r.zones && typeof r.zones === "object") {
    zones = {};
    for (const [k, v] of Object.entries(r.zones as Record<string, unknown>)) {
      const z = v as { focal?: unknown; fade?: unknown; shape?: unknown } | null;
      const box = (b: unknown) =>
        Array.isArray(b) && b.length === 4 && b.every((n) => typeof n === "number" && n >= 0 && n <= 1);
      zones[k] =
        z && box(z.focal) && box(z.fade) && typeof z.shape === "string"
          ? { focal: z.focal as number[], fade: z.fade as number[], shape: z.shape.slice(0, 20) }
          : null;
    }
  }
  const aspect = ["landscape", "portrait", "square"].includes(String(r.aspect)) ? String(r.aspect) : undefined;
  return { vision, reference, data, seed, zones, aspect };
}

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const brief = sanitizeBrief(raw);
  if ("error" in brief) return NextResponse.json({ error: brief.error }, { status: 400 });

  const provider = providerName();
  const catalog = await loadCatalog();
  const art = await loadConfig().catch(() => ({ ...DEFAULT_CONFIG }));

  const key = createHash("sha256")
    .update(JSON.stringify([brief, catalog, art, provider]))
    .digest("hex");

  // Response is an NDJSON stream: one {type:"progress"} line per completed
  // style (drives the client's wine-glass loader with REAL progress), then a
  // single {type:"result"} line with the full set — or {type:"error"} if every
  // style failed (the HTTP status is already committed by then).
  const enc = new TextEncoder();
  const NDJSON = { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" };

  const hit = cache().get(key);
  if (hit) {
    const body =
      JSON.stringify({ type: "progress", done: 6, total: 6 }) + "\n" +
      JSON.stringify({ type: "result", ...hit, cached: true }) + "\n";
    return new Response(enc.encode(body), { headers: NDJSON });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      const images: Record<string, SetEntry> = {};
      const errors: Record<string, string> = {};
      let completed = 0;

      await Promise.all(
        catalog.map(async (style, i) => {
          const sub = pickSubStyle(style, brief.seed || 0, i);
          const job = buildStyleJob(style, sub, brief, art);
          const started = Date.now();
          try {
            const imageDataUrl = await generateImageWithRetry(job);

            let stored = null;
            try {
              stored = await getImageStorage().save(
                imageDataUrl,
                `${Date.now()}-${style.key}-${randomUUID().slice(0, 8)}`
              );
            } catch (e) {
              console.error("image storage failed:", e instanceof Error ? e.message : e);
            }
            images[style.key] = {
              url: imageDataUrl,
              imageUrl: stored?.url ?? null,
              subStyle: sub.key,
              subStyleLabel: sub.label,
            };
            logGeneration(job, {
              provider,
              ok: true,
              durationMs: Date.now() - started,
              imageBytes: stored?.bytes ?? Math.round(imageDataUrl.length * 0.75),
              imageUrl: stored?.url,
              storage: stored?.storage,
            }).catch(() => {});
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.error(`generate-label-set [${style.key}] failed:`, message);
            errors[style.key] = message;
            logGeneration(job, {
              provider,
              ok: false,
              durationMs: Date.now() - started,
              error: message,
            }).catch(() => {});
          }
          completed++;
          send({ type: "progress", done: completed, total: catalog.length, style: style.key });
        })
      );

      if (!Object.keys(images).length) {
        send({ type: "error", error: "all style generations failed", errors });
      } else {
        const result: SetResult = { seed: brief.seed || 0, provider, images, errors };
        // only complete sets are cacheable — caching a partial set would pin
        // the missing styles as permanently absent for this brief
        if (!Object.keys(errors).length) {
          const c = cache();
          c.set(key, result);
          if (c.size > CACHE_MAX) c.delete(c.keys().next().value as string);
        }
        send({ type: "result", ...result });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: NDJSON });
}
