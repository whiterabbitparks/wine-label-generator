import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { visitorOf } from "@/lib/guard";
import { paddleOn, paddleTransaction, priceIds, TRY_RUNS, packToken, type PriceKey } from "@/lib/paddle";

/* A PAYMENT, CONFIRMED (2026-09-30): the browser reports the transaction
   Paddle's overlay completed; the server reads it from Paddle, checks it
   is paid, recent and not yet claimed, and only then counts it — tries go
   to the visitor, a Final Pack returns its receipt key (packToken). Each
   transaction is claimed once (payments collection, _id = its id). */
export async function POST(req: Request) {
  if (!paddleOn()) return NextResponse.json({ error: "payments-not-connected" }, { status: 503 });
  let body: { transactionId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON body" }, { status: 400 }); }
  const id = String(body.transactionId || "").replace(/[^a-z0-9_]/gi, "");
  if (!id) return NextResponse.json({ error: "no transaction" }, { status: 400 });
  /* Paddle may take a moment to mark it paid */
  let txn = null;
  for (let k = 0; k < 6; k++) {
    txn = await paddleTransaction(id);
    if (txn && (txn.status === "completed" || txn.status === "paid")) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!txn) return NextResponse.json({ error: "unknown transaction" }, { status: 404 });
  if (txn.status !== "completed" && txn.status !== "paid") return NextResponse.json({ error: "not paid", status: txn.status }, { status: 402 });
  if (Date.now() - Date.parse(txn.created_at) > 6 * 3600_000) return NextResponse.json({ error: "too old" }, { status: 410 });
  const v = await visitorOf(req);
  if (!v) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const byId = Object.fromEntries(Object.entries(priceIds()).map(([k, p]) => [p, k as PriceKey]));
  const keys = txn.items.map((it) => byId[it.price?.id]).filter(Boolean) as PriceKey[];
  const runs = keys.reduce((n, k) => n + (TRY_RUNS[k] || 0), 0);
  const pack = keys.filter((k) => !TRY_RUNS[k]);
  const db = await getDb();
  const pay = db.collection("payments");
  const had = (await pay.findOne({ _id: id } as never)) as { visitor?: string } | null;
  if (had && had.visitor !== v._id) return NextResponse.json({ error: "already claimed" }, { status: 409 });
  if (!had) {
    await pay.insertOne({ _id: id, visitor: v._id, keys, runs, at: new Date().toISOString(), custom: txn.custom_data || {} } as never);
    if (runs) await db.collection("visitors").updateOne({ _id: v._id } as never, { $inc: { paidRuns: runs } } as never);
  }
  return NextResponse.json({ ok: true, runs, pack, ...(pack.length ? { packToken: packToken(id) } : {}) });
}
