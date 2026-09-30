import { buildPackage, savePack, type PackBody } from "@/lib/package";
import { getDb } from "@/lib/db";
import { paddleOn, packTokenOk } from "@/lib/paddle";
import { requestIsAuthenticated } from "@/lib/admin/session";

/* DELIVERY PACKAGE (owner 2026-09-07): "Proceed to payment" downloads one
   ZIP named after the wine — the folder is built in src/lib/package.ts.
   2026-09-26: with the order's product-page code the pack is also kept
   beside that page, so its DOWNLOAD ASSETS hands out the same folder.
   TEMP: free download until payments exist. */

export const maxDuration = 120;

export async function POST(req: Request) {
  let body: PackBody & { code?: string; payToken?: string; fake?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), { status: 400 });
  }
  /* 2026-09-30: with Paddle connected the pack is let out only against a
     paid transaction's receipt key (or to the admin, or while the TEMP
     fake-payment switch is allowed) */
  if (paddleOn()) {
    const fake = body.fake === true && process.env.FAKE_PAY !== "0";
    let ok = fake || (await requestIsAuthenticated());
    const txn = !ok ? packTokenOk(String(body.payToken || "")) : null;
    if (txn) ok = !!(await (await getDb()).collection("payments").findOne({ _id: txn } as never));
    if (!ok) return new Response(JSON.stringify({ error: "not-paid" }), { status: 402 });
  }
  try {
    const { code, payToken, fake, ...pack } = body;
    void payToken; void fake;
    if (code) try { savePack(String(code), pack); } catch { /* the download matters more */ }
    /* the READ ME gets the order's product page and its code */
    if (code) try {
      const c = String(code).replace(/[^a-z0-9]/gi, "");
      const db = await getDb();
      const doc = (await db.collection("products").findOne({ _id: c } as never)) as { pin?: string } | null;
      const origin = req.headers.get("x-forwarded-host") ? `${req.headers.get("x-forwarded-proto") || "https"}://${req.headers.get("x-forwarded-host")}` : new URL(req.url).origin;
      if (doc?.pin) pack.product = { url: `${origin}/p/${c}`, pin: doc.pin };
    } catch { /* the pack still ships */ }
    const out = await buildPackage(pack);
    if (!out) return new Response(JSON.stringify({ error: "nothing to package" }), { status: 400 });
    return new Response(new Uint8Array(out.zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${out.base}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "packaging failed" }), { status: 500 });
  }
}
