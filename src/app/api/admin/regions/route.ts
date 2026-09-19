import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { getDb } from "@/lib/db";

/* THE GAZETTEER (branch POPIKA_Back_To_Vector, 2026-09-19). A region's
   NAME means nothing to a painter — every one of five drew Svaneti's towers
   for Racha. What it needs is what the region LOOKS like: landscape,
   buildings, plants, and what must NOT appear. Owner-written, 2-3
   sentences each, read by the artwork ask whenever the brief's region
   matches. Claude's drafts below are the starting point until the owner
   saves their own. */

import { DEFAULT_REGIONS } from "@/lib/eval/regions";

const DOC = "regions";

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  try {
    const db = await getDb();
    const doc = (await db.collection("settings").findOne({ _id: DOC } as never)) as { map?: Record<string, string> } | null;
    return NextResponse.json({ map: doc?.map || DEFAULT_REGIONS, saved: !!doc?.map });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  let body: { map?: Record<string, string> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const map: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.map || {})) {
    const key = String(k).trim().slice(0, 60);
    if (key) map[key] = String(v || "").slice(0, 1200);
  }
  const db = await getDb();
  await db.collection("settings").updateOne({ _id: DOC } as never, { $set: { map } }, { upsert: true });
  return NextResponse.json({ ok: true, map });
}
