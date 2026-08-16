import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { addLayoutFeedback, clearLayoutFeedback, layoutWeights, approvedLooks, LAYOUT_STYLES, VARIANT_COUNTS, type LookHints } from "@/lib/admin/layout-refs";

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [weights, looks] = await Promise.all([layoutWeights(), approvedLooks().catch(() => ({}))]);
  return NextResponse.json({ weights, looks });
}

/* hints ride along with a verdict so the approved LOOK is frozen exactly as
   judged — only the four pick-relevant arrays are kept, size-capped. */
function sanitizeHints(raw: unknown): LookHints | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: LookHints = {};
  for (const k of ["palettes", "heroFonts", "secondaryFonts", "smallFonts"] as const)
    if (Array.isArray(r[k]) && (r[k] as unknown[]).length) out[k] = (r[k] as unknown[]).slice(0, 40);
  if (!Object.keys(out).length) return undefined;
  if (JSON.stringify(out).length > 20000) return undefined;
  return out;
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { style?: string; variant?: number; seed?: number; hints?: unknown; verdict?: string; comment?: string };
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
  const seed = body.seed === undefined ? undefined : Number(body.seed);
  if (seed !== undefined && (!Number.isInteger(seed) || seed < 0))
    return NextResponse.json({ error: "bad seed" }, { status: 400 });
  if (body.verdict === "clear") await clearLayoutFeedback(style, variant, seed);
  else
    await addLayoutFeedback({
      style, variant, verdict: body.verdict, comment: String(body.comment || "").slice(0, 500),
      ...(seed !== undefined ? { seed } : {}),
      ...(seed !== undefined && sanitizeHints(body.hints) ? { hints: sanitizeHints(body.hints) } : {}),
    });
  const [weights, looks] = await Promise.all([layoutWeights(), approvedLooks().catch(() => ({}))]);
  return NextResponse.json({ ok: true, weights, looks });
}
