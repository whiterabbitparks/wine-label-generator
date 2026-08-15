import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import {
  addFontFeedback, fontScores, getCasePrefs, fullFontPool, FONT_ROLES, LAYOUT_STYLES,
  type FontRole,
} from "@/lib/admin/layout-refs";

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [scores, casePrefs] = await Promise.all([fontScores(), getCasePrefs()]);
  return NextResponse.json({ pool: await fullFontPool(), roles: FONT_ROLES, scores, casePrefs });
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { style?: string; role?: string; family?: string; weight?: number; verdict?: string; comment?: string };
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
  const POOL = await fullFontPool();
  const font = POOL.find((f) => f.family === body.family && f.weight === Number(body.weight));
  if (!font) return NextResponse.json({ error: "unknown font" }, { status: 400 });
  if (body.verdict !== "approve" && body.verdict !== "reject")
    return NextResponse.json({ error: "verdict must be approve|reject" }, { status: 400 });
  await addFontFeedback({
    style, role, family: font.family, weight: font.weight, verdict: body.verdict,
    comment: String(body.comment || "").slice(0, 300),
  });
  return NextResponse.json({ ok: true, scores: await fontScores() });
}
