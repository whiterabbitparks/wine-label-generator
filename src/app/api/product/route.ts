import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { properCase, CASED_FIELDS } from "@/lib/label/casing";
import { savePack, dataBuf, type PackBody } from "@/lib/package";
import { readLabel } from "@/lib/label/store";
import { artistIdByName, saveShowcase } from "@/lib/label/showcase";
import { visitorOf, previewKey } from "@/lib/guard";
import { requestIsAuthenticated } from "@/lib/admin/session";

/* PRODUCT PAGE SNAPSHOT (owner 2026-09-08): when a QR code is requested,
   the wizard posts everything known about the wine at the moment the
   marketing assets finish — the /p/[code] landing page renders from this
   record. Images are stored as the ~700px previews (Mongo-friendly);
   the full-res files live in the delivery ZIP.
   TODO(security): rate-limit + code ownership before public deploy. */

export const maxDuration = 60;

const S = (v: unknown, n = 300) => String(v ?? "").slice(0, n);

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  /* 2026-09-27: only a visitor who has made labels publishes a page */
  const v = await visitorOf(req, false).catch(() => null);
  if (!(v && (v.runsUsed || 0) > 0) && !(await requestIsAuthenticated())) return NextResponse.json({ error: "make your labels first" }, { status: 403 });
  const code = S(body.code, 24).replace(/[^a-z0-9]/gi, "");
  if (code.length < 6) return NextResponse.json({ error: "bad code" }, { status: 400 });
  const img = (v: unknown) => (typeof v === "string" && v.startsWith("data:image/") && v.length < 2_000_000 ? v : "");
  const wine = (body.wine || {}) as Record<string, unknown>;
  const doc = {
    _id: code,
    wine: Object.fromEntries(
      ["producer", "wine", "appellation", "classification", "vintage", "grape", "regionCountry",
        "special", "sweetness", "colour", "wineType", "alcohol", "volume",
        "producerCompany", "producerAddress", "importer", "importerAddress",
        "bottlingDate", "lot", "web"].map((k) => [k, CASED_FIELDS.has(k) ? properCase(S(wine[k], 200)) : S(wine[k], 200)])),
    description: S(body.description, 2000),
    ingredients: S(body.ingredients, 20000),
    images: {
      front: img((body.images as Record<string, unknown>)?.front),
      back: img((body.images as Record<string, unknown>)?.back),
      life: (Array.isArray((body.images as Record<string, unknown>)?.life)
        ? ((body.images as Record<string, unknown>).life as unknown[]) : []).slice(0, 5).map(img),
    },
    updatedAt: new Date().toISOString(),
  };
  const db = await getDb();
  /* 2026-09-27 (owner): the page is LOCKED until its 5-digit code is
     entered once — the code is printed in the READ ME of the paid Final
     Pack, so a link seen before paying opens nothing. Made once, kept. */
  await db.collection("products").updateOne({ _id: code } as never,
    { $set: doc, $setOnInsert: { pin: String(crypto.randomInt(0, 100000)).padStart(5, "0"), open: false, owner: v?._id || "" } }, { upsert: true });
  /* a page made before its maker was recorded is claimed by the next maker who publishes it */
  if (v?._id) await db.collection("products").updateOne({ _id: code, owner: { $in: [null, ""] } } as never, { $set: { owner: v._id } });
  /* the Final Pack's makings, full size, for the page's DOWNLOAD ASSETS */
  if (body.pack && typeof body.pack === "object") try { savePack(code, body.pack as PackBody); } catch { /* the page still stands */ }
  /* 2026-09-30 (owner): the OWNER's marketing images go to the painter's
     page ("Labels from …") — only when he (admin) publishes; a customer's
     never do (src/lib/label/showcase.ts) */
  try {
    const pk = (body.pack || {}) as PackBody;
    const lab = pk.frontId ? readLabel(String(pk.frontId).replace(/[^a-z0-9-]/gi, "")) : null;
    const who = lab ? artistIdByName(String((lab.meta as { artist?: string }).artist || "")) : null;
    const imgs = (pk.lifestyle || []).map((u) => dataBuf(u)).filter((b): b is Buffer => !!b);
    if (who && imgs.length && (await requestIsAuthenticated())) await saveShowcase(who, code, imgs);
  } catch { /* the page still stands */ }
  /* the maker's own preview key (see previewKey) */
  const own = (await db.collection("products").findOne({ _id: code } as never, { projection: { owner: 1 } })) as { owner?: string } | null;
  const mine = (v?._id && own?.owner === v._id) || (await requestIsAuthenticated());
  return NextResponse.json({ ok: true, url: `/p/${code}`, ...(mine ? { preview: previewKey(code) } : {}) });
}

export async function GET(req: Request) {
  const code = (new URL(req.url).searchParams.get("code") || "").replace(/[^a-z0-9]/gi, "");
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
  const db = await getDb();
  const doc = await db.collection("products").findOne({ _id: code } as never);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { pin, tries, owner, ...shown } = doc as Record<string, unknown>;
  void pin; void tries;
  /* its maker (or the admin) gets the preview key back after a reload */
  const v = await visitorOf(req, false).catch(() => null);
  const mine = (v?._id && owner === v._id) || (await requestIsAuthenticated());
  return NextResponse.json({ ...shown, ...(mine ? { preview: previewKey(code) } : {}) });
}
