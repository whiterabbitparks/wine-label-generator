import sharp from "sharp";
import { paintHybridLabel } from "@/lib/label/hybrid";
import { saveLabel } from "@/lib/label/store";

/* PUBLIC customer endpoint — one label, streamed as NDJSON so the page's
   loader stays honest.
   ROUND 84 (branch POPIKA_Back_To_Vector): the HYBRID engine. The painter
   paints the artwork only; the type is set by code from Google faces
   (src/lib/label/hybrid.ts). The result carries an `id` — the SVG with
   live type waits on disk for the delivery package.
   TODO(security): rate-limit before any public deploy — one call is a
   paid model invocation. */

export const maxDuration = 300;
const MAX_VISION = 2000;
const DATA_KEYS = [
  "producer", "wine", "appellation", "classification", "grape", "region",
  "country", "special", "vintage", "wineColorName", "wineType", "sweetness",
  "alcohol", "volume",
] as const;

export async function POST(req: Request) {
  let body: { vision?: string; style?: string; data?: Record<string, string>; sketch?: string | null; width?: number; height?: number };
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
  const style = ["traditional", "contemporary", "punk"].includes(String(body.style)) ? String(body.style) : "traditional";
  const sketch = typeof body.sketch === "string" && body.sketch.startsWith("data:image/") && body.sketch.length < 8_000_000
    ? body.sketch : null;
  const widthMm = Number(body.width) || 110, heightMm = Number(body.height) || 80;

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        send({ type: "progress", stage: "painting" });
        const out = await paintHybridLabel({ vision, style, data, widthMm, heightMm, sketch });
        const id = saveLabel({ style, widthMm, heightMm, faces: out.faces, ground: out.ground, svg: out.svg, png: out.png, art: out.art, prompt: out.prompt });
        /* medium-res JPEG for the page's views — the PNG stays the print source */
        let preview: string | null = null;
        try {
          const jb = await sharp(Buffer.from(out.png.slice(out.png.indexOf(",") + 1), "base64")).resize(1024).jpeg({ quality: 82 }).toBuffer();
          preview = "data:image/jpeg;base64," + jb.toString("base64");
        } catch {}
        send({ type: "result", dream: out.png, preview, id });
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
