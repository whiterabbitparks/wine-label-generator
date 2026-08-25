import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { getDb } from "@/lib/db";

/* DREAM REFINEMENT (owner 2026-08-25): verdicts + comments on whole-label
   dreams. Comments are the steering wheel — the dream prompt quotes recent
   praised/criticised notes so dream quality compounds with every verdict. */

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  const rows = await db.collection("dream_feedback")
    .find({}, { projection: { _id: 0 } }).sort({ at: -1 }).limit(100).toArray();
  return NextResponse.json({ rows });
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { verdict?: string; comment?: string; vision?: string; style?: string; wine?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (body.verdict !== "approve" && body.verdict !== "reject")
    return NextResponse.json({ error: "verdict must be approve|reject" }, { status: 400 });
  const db = await getDb();
  await db.collection("dream_feedback").insertOne({
    at: new Date().toISOString(),
    verdict: body.verdict,
    comment: String(body.comment || "").slice(0, 400),
    vision: String(body.vision || "").slice(0, 400),
    style: String(body.style || "").slice(0, 30),
    wine: String(body.wine || "").slice(0, 120),
  } as never);
  return NextResponse.json({ ok: true });
}
