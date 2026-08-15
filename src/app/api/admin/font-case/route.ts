import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import {
  setCasePref, getCasePrefs, FONT_POOL, FONT_ROLES, LAYOUT_STYLES, type FontRole,
} from "@/lib/admin/layout-refs";

/* Per-FONT case switch (owner, 2026-08-15): default null = standard grammar
   (text as the winemaker wrote it); "upper" forces UPPERCASE for that font
   in that style+role only. */
export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { style?: string; role?: string; family?: string; weight?: number; pref?: string | null };
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
  const font = FONT_POOL.find((f) => f.family === body.family && f.weight === Number(body.weight));
  if (!font) return NextResponse.json({ error: "unknown font" }, { status: 400 });
  const pref = body.pref === "upper" ? "upper" : null;
  await setCasePref(style, role, `${font.family}@${font.weight}`, pref);
  return NextResponse.json({ ok: true, casePrefs: await getCasePrefs() });
}
