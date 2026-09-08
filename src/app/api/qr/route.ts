import QRCode from "qrcode";

/* small display QR (checkout preview etc.) — GET /api/qr?u=<url> */
export async function GET(req: Request) {
  const u = (new URL(req.url).searchParams.get("u") || "").slice(0, 500);
  if (!u) return new Response("u required", { status: 400 });
  const png = await QRCode.toBuffer(u, { margin: 0, width: 300 });
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
  });
}
