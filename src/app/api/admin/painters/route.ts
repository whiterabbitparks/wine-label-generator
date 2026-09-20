import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { getDb } from "@/lib/db";
import { EVAL_MODELS, artistModels } from "@/lib/eval/models";
import { DEFAULT_PAINTERS, WIZARD_PAINTERS } from "@/lib/label/painters";

/* THE PAINTERS (round 90, owner: "why aren't we using the other
   models?"): which painter paints each style in the wizard. Saved in
   settings/_id "painters" as { traditional, contemporary, punk } → a
   painter id from WIZARD_PAINTERS. Defaults to gpt-image on its own
   ground until the owner chooses otherwise in /admin → Rules. */

const DOC = "painters";

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  try {
    const db = await getDb();
    const doc = (await db.collection("settings").findOne({ _id: DOC } as never)) as { map?: Record<string, string> } | null;
    const options = [...EVAL_MODELS.filter((m) => WIZARD_PAINTERS.includes(m.id)), ...artistModels()].map((m) => ({ id: m.id, name: m.name }));
    return NextResponse.json({ map: { ...DEFAULT_PAINTERS, ...(doc?.map || {}) }, options, saved: !!doc?.map });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  let body: { map?: Record<string, string> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const map: Record<string, string> = {};
  for (const style of ["traditional", "contemporary", "punk"]) {
    const v = String(body.map?.[style] || "");
    map[style] = WIZARD_PAINTERS.includes(v) || v.startsWith("artist:") ? v : DEFAULT_PAINTERS[style];
  }
  const db = await getDb();
  await db.collection("settings").updateOne({ _id: DOC } as never, { $set: { map } }, { upsert: true });
  return NextResponse.json({ ok: true, map });
}
