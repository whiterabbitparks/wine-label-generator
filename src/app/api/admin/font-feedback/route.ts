import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { addFontFeedback, fontScores, FONT_POOL, LAYOUT_STYLES } from "@/lib/admin/layout-refs";

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ pool: FONT_POOL, scores: await fontScores() });
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { style?: string; family?: string; weight?: number; verdict?: string; comment?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const style = String(body.style);
  if (!(LAYOUT_STYLES as readonly string[]).includes(style))
    return NextResponse.json({ error: "unknown style" }, { status: 400 });
  const font = FONT_POOL.find((f) => f.family === body.family && f.weight === Number(body.weight));
  if (!font) return NextResponse.json({ error: "unknown font" }, { status: 400 });
  if (body.verdict !== "approve" && body.verdict !== "reject")
    return NextResponse.json({ error: "verdict must be approve|reject" }, { status: 400 });
  await addFontFeedback({
    style, family: font.family, weight: font.weight, verdict: body.verdict,
    comment: String(body.comment || "").slice(0, 300),
  });
  return NextResponse.json({ ok: true, scores: await fontScores() });
}
