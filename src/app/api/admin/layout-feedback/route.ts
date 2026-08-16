import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { addLayoutFeedback, clearLayoutFeedback, layoutWeights, LAYOUT_STYLES, VARIANT_COUNTS } from "@/lib/admin/layout-refs";

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ weights: await layoutWeights() });
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { style?: string; variant?: number; verdict?: string; comment?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const style = String(body.style);
  const variant = Number(body.variant);
  if (!(LAYOUT_STYLES as readonly string[]).includes(style))
    return NextResponse.json({ error: "unknown style" }, { status: 400 });
  if (!Number.isInteger(variant) || variant < 0 || variant >= (VARIANT_COUNTS[style] || 0))
    return NextResponse.json({ error: "bad variant index" }, { status: 400 });
  if (body.verdict !== "approve" && body.verdict !== "reject" && body.verdict !== "clear")
    return NextResponse.json({ error: "verdict must be approve|reject|clear" }, { status: 400 });
  if (body.verdict === "clear") await clearLayoutFeedback(style, variant);
  else await addLayoutFeedback({ style, variant, verdict: body.verdict, comment: String(body.comment || "").slice(0, 500) });
  return NextResponse.json({ ok: true, weights: await layoutWeights() });
}
