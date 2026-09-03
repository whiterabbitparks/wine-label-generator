import { runDreamPhase } from "@/lib/dream/engine";

/* PUBLIC customer endpoint (owner 2026-08-25): the whole dream flow in one
   streamed call — dream → transcribe → artwork → spec. NDJSON progress
   lines keep the page's loader honest during the ~90s ride.
   TODO(security): rate-limit before any public deploy — one call is
   several paid model invocations. */

export const maxDuration = 300;
const MAX_VISION = 2000;
const DATA_KEYS = [
  "producer", "wine", "appellation", "classification", "grape", "region",
  "country", "special", "vintage", "wineColorName", "wineType", "sweetness",
  "alcohol", "volume",
] as const;

export async function POST(req: Request) {
  let body: { vision?: string; style?: string; data?: Record<string, string>; sketch?: string | null };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), { status: 400 });
  }
  const vision = String(body.vision || "").slice(0, MAX_VISION);
  const data: Record<string, string> = {};
  for (const k of DATA_KEYS) {
    const v = body.data?.[k];
    if (typeof v === "string") data[k] = v.slice(0, 200);
  }
  const style = ["traditional", "contemporary", "punk", "minimalist", "free"].includes(String(body.style)) ? String(body.style) : "free";
  const sketch = typeof body.sketch === "string" && body.sketch.startsWith("data:image/") && body.sketch.length < 8_000_000
    ? body.sketch : null;
  const aspect = ["landscape", "portrait", "square"].includes(String((body as { aspect?: string }).aspect)) ? String((body as { aspect?: string }).aspect) : "landscape";

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        /* branch POPIKA_No_Vector (owner 2026-09-03): the dream IS the
           label — no rebuild, no vector. Cheaper and simpler. */
        send({ type: "progress", stage: "dreaming" });
        const d = await runDreamPhase({ vision, style, data, sketch, aspect });
        send({ type: "result", dream: d.dream, preview: d.preview || null });
      } catch (e) {
        send({ type: "error", error: e instanceof Error ? e.message : String(e) });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
