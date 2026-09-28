import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { visitorOf } from "@/lib/guard";
import { requestIsAuthenticated } from "@/lib/admin/session";

/* BUYING TRIES (owner, 2026-09-28): a try = one run of three new versions;
   $9 = 3 tries, $19 = 10 tries; nothing is deducted from the Final Pack.
   TEMP until Paddle: only an admin's "payment" counts, so the live site
   cannot be painted for free by pressing Pay. */
export async function POST(req: Request) {
  let body: { pack?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON body" }, { status: 400 }); }
  const runs = body.pack === 10 ? 10 : body.pack === 3 ? 3 : 0;
  if (!runs) return NextResponse.json({ error: "bad pack" }, { status: 400 });
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "payments-not-connected" }, { status: 402 });
  const v = await visitorOf(req);
  if (!v) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const db = await getDb();
  await db.collection("visitors").updateOne({ _id: v._id } as never, { $inc: { paidRuns: runs } } as never);
  return NextResponse.json({ ok: true, runs });
}
