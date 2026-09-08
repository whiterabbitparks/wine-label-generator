import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

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
        "bottlingDate", "lot", "web"].map((k) => [k, S(wine[k], 200)])),
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
  await db.collection("products").updateOne({ _id: code } as never, { $set: doc }, { upsert: true });
  return NextResponse.json({ ok: true, url: `/p/${code}` });
}

export async function GET(req: Request) {
  const code = (new URL(req.url).searchParams.get("code") || "").replace(/[^a-z0-9]/gi, "");
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
  const db = await getDb();
  const doc = await db.collection("products").findOne({ _id: code } as never);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(doc);
}
