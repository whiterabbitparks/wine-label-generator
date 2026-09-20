import sharp from "sharp";
import { paintHybridLabel, relayoutLabel } from "@/lib/label/hybrid";
import { saveLabel, readLabel } from "@/lib/label/store";

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
  let body: { vision?: string; style?: string; data?: Record<string, string>; sketch?: string | null; width?: number; height?: number; relayout?: string; variants?: number };
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
        /* round 86 #3: a VARIATION keeps the painting and re-sets the type */
        const base = body.relayout ? readLabel(String(body.relayout)) : null;
        send({ type: "progress", stage: base ? "setting" : "painting" });
        const out = base
          ? await relayoutLabel(base, data)
          : await paintHybridLabel({ vision, style, data, widthMm, heightMm, sketch });
        const m = base ? base.meta : { style, widthMm, heightMm, fit: out.fit };
        const id = saveLabel({ style: m.style, widthMm: m.widthMm, heightMm: m.heightMm, faces: out.faces, ground: out.ground, svg: out.svg, png: out.png, art: out.art, prompt: out.prompt, layout: out.layout, fit: m.fit });
        /* medium-res JPEG for the page's views — the PNG stays the print source */
        let preview: string | null = null;
        try {
          const jb = await sharp(Buffer.from(out.png.slice(out.png.indexOf(",") + 1), "base64")).resize(1024).jpeg({ quality: 82 }).toBuffer();
          preview = "data:image/jpeg;base64," + jb.toString("base64");
        } catch {}
        /* round 94 #6: the wizard asks for THREE layouts of a fresh painting
           in one call — two contrasting re-layouts ride along as `variants` */
        const variants: { dream: string; preview: string | null; id: string }[] = [];
        const want = Math.min(3, Math.max(1, Number(body.variants) || 1));
        if (!base && want > 1) {
          const stored = { art: Buffer.from(out.art.slice(out.art.indexOf(",") + 1), "base64"), meta: { style, widthMm, heightMm, ground: out.ground, fit: out.fit } };
          const avoid = [out.tag];
          for (let i = 1; i < want; i++) {
            try {
              const v = await relayoutLabel(stored, data, avoid, i === 1 ? { big: true } : { flip: true });
              avoid.push(v.tag);
              const vid = saveLabel({ style, widthMm, heightMm, faces: v.faces, ground: v.ground, svg: v.svg, png: v.png, art: v.art, prompt: v.prompt, layout: v.layout, fit: out.fit });
              let vprev: string | null = null;
              try { vprev = "data:image/jpeg;base64," + (await sharp(Buffer.from(v.png.slice(v.png.indexOf(",") + 1), "base64")).resize(1024).jpeg({ quality: 82 }).toBuffer()).toString("base64"); } catch {}
              variants.push({ dream: v.png, preview: vprev, id: vid });
            } catch { /* a missing variant never fails the label */ }
          }
        }
        /* round 102: the artist's name rides along so the wizard can head the column with it */
        send({ type: "result", dream: out.png, preview, id, variants, artist: base ? undefined : (out as { artist?: string }).artist });
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
