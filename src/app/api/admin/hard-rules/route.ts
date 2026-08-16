import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { getHardRules, saveHardRules } from "@/lib/admin/layout-refs";

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ rules: await getHardRules() });
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { minGapMM?: number; artFillPct?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const cur = await getHardRules();
  const v = body.minGapMM === undefined ? cur.minGapMM : Number(body.minGapMM);
  if (!isFinite(v) || v < 0 || v > 5)
    return NextResponse.json({ error: "minGapMM must be between 0 and 5" }, { status: 400 });
  const f = body.artFillPct === undefined ? cur.artFillPct : Number(body.artFillPct);
  if (!isFinite(f) || f < 30 || f > 100)
    return NextResponse.json({ error: "artFillPct must be between 30 and 100" }, { status: 400 });
  await saveHardRules({ minGapMM: Math.round(v * 10) / 10, artFillPct: Math.round(f) });
  return NextResponse.json({ ok: true, rules: await getHardRules() });
}
