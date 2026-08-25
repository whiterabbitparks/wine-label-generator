import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { getDb } from "@/lib/db";

/* Owner's plain-English dream rules — one per line; verified on every dream. */

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  const doc = (await db.collection("settings").findOne({ _id: "dream-rules" } as never)) as { global?: string } | null;
  return NextResponse.json({ global: doc?.global || "" });
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { global?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const db = await getDb();
  await db.collection("settings").updateOne(
    { _id: "dream-rules" } as never,
    { $set: { global: String(body.global || "").slice(0, 4000), at: new Date().toISOString() } },
    { upsert: true }
  );
  return NextResponse.json({ ok: true });
}
