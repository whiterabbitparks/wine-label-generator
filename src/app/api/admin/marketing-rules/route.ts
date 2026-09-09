import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { getDb } from "@/lib/db";

/* RULES UNIFICATION (owner GO 2026-09-09): marketing finally gets its own
   owner-editable rules — one plain-English line per rule, appended to BOTH
   the studio-shot and lifestyle prompts as house rules. Stored in settings
   doc `marketing-rules`; hashed into the assets cache signature so an edit
   busts stale sets. */

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  const doc = (await db.collection("settings").findOne({ _id: "marketing-rules" } as never)) as { global?: string } | null;
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
    { _id: "marketing-rules" } as never,
    { $set: { global: String(body.global || "").slice(0, 4000), at: new Date().toISOString() } },
    { upsert: true }
  );
  return NextResponse.json({ ok: true });
}
