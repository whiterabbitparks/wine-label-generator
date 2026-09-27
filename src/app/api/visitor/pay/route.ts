import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { visitorOf } from "@/lib/guard";
import { requestIsAuthenticated } from "@/lib/admin/session";

/* BUYING NEW VERSIONS ($9 = three versions = one run; $19 = nine = three
   runs). TEMP until Paddle: only an admin's "payment" counts, so the live
   site cannot be painted for free by pressing Pay. */
export async function POST(req: Request) {
  let body: { pack?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON body" }, { status: 400 }); }
  const runs = body.pack === 9 ? 3 : body.pack === 3 ? 1 : 0;
  if (!runs) return NextResponse.json({ error: "bad pack" }, { status: 400 });
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "payments-not-connected" }, { status: 402 });
  const v = await visitorOf(req);
  if (!v) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const db = await getDb();
  await db.collection("visitors").updateOne({ _id: v._id } as never, { $inc: { paidRuns: runs } } as never);
  return NextResponse.json({ ok: true, runs });
}
