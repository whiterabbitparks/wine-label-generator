import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { setCasePref, getCasePrefs, FONT_ROLES, LAYOUT_STYLES, type FontRole } from "@/lib/admin/layout-refs";

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { style?: string; role?: string; pref?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const style = String(body.style);
  if (!(LAYOUT_STYLES as readonly string[]).includes(style))
    return NextResponse.json({ error: "unknown style" }, { status: 400 });
  const role = FONT_ROLES.includes(body.role as FontRole) ? (body.role as FontRole) : null;
  if (!role) return NextResponse.json({ error: "role must be hero|secondary|small" }, { status: 400 });
  const pref = body.pref === "upper" || body.pref === "lower" ? body.pref : null;
  await setCasePref(style, role, pref);
  return NextResponse.json({ ok: true, casePrefs: await getCasePrefs() });
}
