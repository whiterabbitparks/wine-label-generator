import { NextResponse } from "next/server";
import { visitorOf, runsLeft, guardSettings, freeSpentToday } from "@/lib/guard";
import { requestIsAuthenticated } from "@/lib/admin/session";

/* what this browser may still do — the page shows it, the server decides it */
export async function GET(req: Request) {
  try {
    const admin = await requestIsAuthenticated();
    const v = await visitorOf(req, false);
    const s = await guardSettings();
    return NextResponse.json({
      admin, runsLeft: v ? runsLeft(v, s) : s.freeRuns, runsUsed: v?.runsUsed || 0,
      verified: !!v?.verifiedAt, email: v?.email || "",
      paused: (await freeSpentToday()) >= s.dailyFreeUsd,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "unavailable" }, { status: 503 });
  }
}
