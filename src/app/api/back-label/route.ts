import sharp from "sharp";
import { composeBackLabel, MARKETS, BackLabelData } from "@/lib/back-label";

/* BACK LABEL API (owner 2026-09-03): deterministic vector-typography back
   label. format=png → preview; format=tiff → 300dpi print file; default
   returns the SVG + metadata as JSON. */

export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { data?: BackLabelData; markets?: string[]; heightMM?: number; format?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), { status: 400 });
  }
  const markets = (body.markets || ["EU", "US"]).filter((m) => m in MARKETS).slice(0, 13);
  const heightMM = Math.min(200, Math.max(40, Number(body.heightMM) || 73.3));
  try {
    const out = await composeBackLabel(body.data || {}, { heightMM, markets });
    const fmt = String(body.format || "json");
    if (fmt === "json")
      return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
    /* librsvg's mm handling double-scales — render big, then pin the
       EXACT pixel width for true 300dpi */
    const pxW = Math.round((out.widthMM / 25.4) * 300);
    if (fmt === "tiff") {
      const tiff = await sharp(await sharp(Buffer.from(out.svg), { density: 300 }).resize({ width: pxW }).png().toBuffer())
        .withMetadata({ density: 300 })
        .tiff({ compression: "lzw" })
        .toBuffer();
      return new Response(new Uint8Array(tiff), {
        headers: {
          "Content-Type": "image/tiff",
          "Content-Disposition": `attachment; filename="back-label-300dpi.tiff"`,
          "Cache-Control": "no-store",
        },
      });
    }
    const png = await sharp(Buffer.from(out.svg), { density: 150 }).resize({ width: 1400, withoutEnlargement: true }).png().toBuffer();
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "compose failed" }), { status: 500 });
  }
}
