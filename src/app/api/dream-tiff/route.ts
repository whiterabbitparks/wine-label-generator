import sharp from "sharp";

/* PRINT FILE (owner 2026-09-03, branch POPIKA_No_Vector): the dream IS the
   label — the final deliverable is a 300dpi TIFF of the dream image. At
   1536px wide a 110mm label prints at ~355dpi, so no upscaling is needed;
   this endpoint converts and stamps the density. LZW keeps files sane. */

export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { image?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), { status: 400 });
  }
  const m = String(body.image || "").match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
  if (!m || m[2].length > 16_000_000)
    return new Response(JSON.stringify({ error: "image must be a png/jpeg/webp data URL under 12MB" }), { status: 400 });
  const name = String(body.name || "label").replace(/[^\w-]+/g, "-").slice(0, 60) || "label";
  try {
    const tiff = await sharp(Buffer.from(m[2], "base64"))
      .withMetadata({ density: 300 })
      .tiff({ compression: "lzw" })
      .toBuffer();
    return new Response(new Uint8Array(tiff), {
      headers: {
        "Content-Type": "image/tiff",
        "Content-Disposition": `attachment; filename="${name}-300dpi.tiff"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "conversion failed" }), { status: 500 });
  }
}
