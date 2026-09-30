import { getDb } from "@/lib/db";
import { previewKey } from "@/lib/guard";
import ProductClient, { type ProductDoc } from "./product-client";

/* PUBLIC PRODUCT PAGE (owner 2026-09-08): the QR on the back label lands
   here — /p/<code>. Renders the snapshot the wizard stored when the
   marketing assets finished. Same 8K artboard chrome, same parallax. */

export const dynamic = "force-dynamic";

export default async function ProductPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { code } = await params;
  const { preview } = await searchParams;
  const clean = code.replace(/[^a-z0-9]/gi, "");
  let doc: ProductDoc | null = null;
  try {
    const db = await getDb();
    doc = (await db.collection("products").findOne({ _id: clean } as never)) as unknown as ProductDoc | null;
  } catch { /* db down → not-found view */ }
  if (!doc) {
    return (
      <main style={{ background: "#000", color: "#fff", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Helvetica, sans-serif" }}>
        <p>This product page does not exist (yet).</p>
      </main>
    );
  }
  /* the code never leaves the server; a page made before the lock (no
     code) stays open */
  const { pin, tries, owner, ...shown } = doc as ProductDoc & { pin?: string; tries?: unknown; open?: boolean; owner?: string };
  void tries; void owner;
  /* the maker's preview (the wizard's own frame) sees the page unlocked;
     nothing is opened for anyone else */
  const previewing = !!preview && preview === previewKey(clean);
  return <ProductClient doc={shown} locked={!!pin && !shown.open && !previewing} />;
}
