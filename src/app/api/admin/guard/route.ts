import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { guardSettings, GUARD_DEFAULTS, freeSpentToday, type GuardSettings } from "@/lib/guard";

/* admin → System → Protection: the guard's numbers and today's picture */
export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const db = await getDb();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [settings, spent, visitors, runsToday, emails] = await Promise.all([
    guardSettings(), freeSpentToday(),
    db.collection("visitors").countDocuments({ createdAt: { $gt: since } } as never),
    db.collection("visitors").countDocuments({ lastRunAt: { $gt: since } } as never),
    db.collection("emails").countDocuments({}),
  ]);
  return NextResponse.json({
    settings, defaults: GUARD_DEFAULTS, spentToday: spent, newVisitors24h: visitors, visitorsWithRuns24h: runsToday, confirmedEmails: emails,
    mail: !!process.env.RESEND_API_KEY, alerts: !!process.env.ALERT_EMAIL,
  });
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  let body: Partial<GuardSettings>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON body" }, { status: 400 }); }
  const clean: Partial<GuardSettings> = {};
  for (const k of Object.keys(GUARD_DEFAULTS) as (keyof GuardSettings)[]) {
    const v = Number(body[k]);
    if (Number.isFinite(v) && v >= 0 && v <= 10000) clean[k] = v;
  }
  const db = await getDb();
  await db.collection("settings").updateOne({ _id: "guard" } as never, { $set: clean } as never, { upsert: true });
  return NextResponse.json({ ok: true, settings: await guardSettings() });
}
