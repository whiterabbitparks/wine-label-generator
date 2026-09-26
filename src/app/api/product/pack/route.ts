import { getDb } from "@/lib/db";
import { buildPackage, dataBuf, readPack, type PackBody } from "@/lib/package";

/* THE PRODUCT PAGE'S DOWNLOADS (owner 2026-09-26):
     ?code=X          the order's Final Pack folder as one ZIP
     ?code=X&img=N    one gallery picture at full size — N counts the
                      gallery's order: front shot, back shot, the five
                      lifestyle images
   The pack is the one kept when the order was published or last
   downloaded (data/products/<code>.json). A page published before that
   was kept falls back to what its record holds: the pictures only. */

export const maxDuration = 120;

async function packOf(code: string): Promise<PackBody | null> {
  const kept = readPack(code);
  if (kept) return kept;
  const db = await getDb();
  const doc = (await db.collection("products").findOne({ _id: code } as never)) as unknown as
    { wine?: Record<string, string>; images?: { front?: string; back?: string; life?: string[] } } | null;
  if (!doc) return null;
  return {
    wineName: doc.wine?.wine || doc.wine?.producer || "Wine",
    shots: { front: doc.images?.front, back: doc.images?.back },
    lifestyle: (doc.images?.life || []).filter(Boolean),
  };
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const code = (sp.get("code") || "").replace(/[^a-z0-9]/gi, "");
  if (!code) return new Response("code required", { status: 400 });
  try {
    const pack = await packOf(code);
    if (!pack) return new Response("not found", { status: 404 });
    const base = String(pack.wineName || "Wine").trim().replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "") || "Wine";
    const img = sp.get("img");
    if (img !== null) {
      const all = [pack.shots?.front, pack.shots?.back, ...(pack.lifestyle || [])];
      const names = [`${base}_Bottle_Front`, `${base}_Bottle_Back`, ...(pack.lifestyle || []).map((_, i) => `${base}_Image${String(i + 1).padStart(2, "0")}`)];
      const k = Math.max(0, Number(img) || 0);
      const buf = dataBuf(all[k]);
      if (!buf) return new Response("no such picture", { status: 404 });
      const jpg = buf[0] === 0xff;   /* the record's previews may be JPEG */
      return new Response(new Uint8Array(buf), {
        headers: { "Content-Type": jpg ? "image/jpeg" : "image/png", "Content-Disposition": `attachment; filename="${names[k]}.${jpg ? "jpg" : "png"}"`, "Cache-Control": "no-store" },
      });
    }
    const out = await buildPackage(pack);
    if (!out) return new Response("nothing to package", { status: 404 });
    return new Response(new Uint8Array(out.zip), {
      headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${out.base}.zip"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "failed", { status: 500 });
  }
}
