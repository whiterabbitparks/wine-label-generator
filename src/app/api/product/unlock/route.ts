import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/* THE PAGE'S CODE (owner, 2026-09-27): entered once, it opens the page
   for good — for every visitor, so the QR on the bottle works from then
   on. Ten wrong tries a day per page, then it waits for tomorrow. */
export async function POST(req: Request) {
  let body: { code?: string; pin?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON body" }, { status: 400 }); }
  const code = String(body.code || "").replace(/[^a-z0-9]/gi, "");
  const pin = String(body.pin || "").replace(/\D/g, "");
  const db = await getDb();
  const doc = (await db.collection("products").findOne({ _id: code } as never)) as { pin?: string; open?: boolean; tries?: { day: string; n: number } } | null;
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (doc.open || !doc.pin) return NextResponse.json({ ok: true });
  const day = new Date().toISOString().slice(0, 10);
  const n = doc.tries?.day === day ? doc.tries.n : 0;
  if (n >= 10) return NextResponse.json({ error: "too-many" }, { status: 429 });
  if (pin !== doc.pin) {
    await db.collection("products").updateOne({ _id: code } as never, { $set: { tries: { day, n: n + 1 } } } as never);
    return NextResponse.json({ error: "wrong" }, { status: 403 });
  }
  await db.collection("products").updateOne({ _id: code } as never, { $set: { open: true, openedAt: new Date().toISOString() } } as never);
  return NextResponse.json({ ok: true });
}
