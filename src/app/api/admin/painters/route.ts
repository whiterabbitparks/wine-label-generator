import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { getDb } from "@/lib/db";
import { artistModels } from "@/lib/eval/models";
import { COLUMNS, defaultPainters } from "@/lib/label/painters";

/* THE ARTISTS PER COLUMN (round 90 → 105): which artist paints each of
   the wizard's three columns. Saved in settings/_id "painters" as
   { traditional, contemporary, punk } → "artist:<id>". Without a saved
   map the first three artists with a trained LoRA take the columns. */

const DOC = "painters";

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  try {
    const db = await getDb();
    const doc = (await db.collection("settings").findOne({ _id: DOC } as never)) as { map?: Record<string, string> } | null;
    const options = artistModels().map((m) => ({ id: m.id, name: m.name + (m.lora ? "" : " (no LoRA yet)") }));
    return NextResponse.json({ map: { ...defaultPainters(), ...(doc?.map || {}) }, options, saved: !!doc?.map });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  let body: { map?: Record<string, string> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const ids = new Set(artistModels().map((m) => m.id));
  const fallback = defaultPainters();
  const map: Record<string, string> = {};
  for (const col of COLUMNS) {
    const v = String(body.map?.[col] || "");
    map[col] = ids.has(v) ? v : fallback[col];
  }
  const db = await getDb();
  await db.collection("settings").updateOne({ _id: DOC } as never, { $set: { map } }, { upsert: true });
  return NextResponse.json({ ok: true, map });
}
