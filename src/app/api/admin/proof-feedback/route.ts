import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { getDb } from "@/lib/db";

/* PROOF BENCH FEEDBACK (owner 2026-08-20, branch POPIKA_IMage&layout_relation).
   The owner judges FINISHED labels (real artwork + layout + fonts together);
   a whole-label verdict alone is an ambiguous lesson, so rejections carry
   "what failed" chips (image / arrangement / fonts / colour / interplay) and
   an optional note. This is the training corpus for the future harmony
   critic and the vocabulary system — append-only, queried newest-first.
   Look approval itself still goes through /api/admin/layout-feedback so the
   customer gate keeps a single source of truth. */

const FAILURES = ["image", "arrangement", "fonts", "colour", "interplay"] as const;

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  const rows = await db.collection("proof_feedback")
    .find({}, { projection: { _id: 0 } })
    .sort({ at: -1 })
    .limit(200)
    .toArray();
  return NextResponse.json({ rows });
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: {
    style?: string; verdict?: string; failures?: unknown; note?: string;
    vision?: string; wine?: string; wineColorName?: string;
    seed?: number; subStyle?: string; analysis?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const style = String(body.style || "");
  if (!["traditional", "contemporary", "punk"].includes(style))
    return NextResponse.json({ error: "unknown style" }, { status: 400 });
  if (body.verdict !== "approve" && body.verdict !== "reject")
    return NextResponse.json({ error: "verdict must be approve|reject" }, { status: 400 });
  const failures = Array.isArray(body.failures)
    ? (body.failures as unknown[]).map(String).filter((f) => (FAILURES as readonly string[]).includes(f))
    : [];
  const doc = {
    at: new Date().toISOString(),
    style,
    verdict: body.verdict,
    failures,
    note: String(body.note || "").slice(0, 500),
    vision: String(body.vision || "").slice(0, 2000),
    wine: String(body.wine || "").slice(0, 200),
    wineColorName: String(body.wineColorName || "").slice(0, 40),
    seed: Number.isInteger(body.seed) ? body.seed : null,
    subStyle: String(body.subStyle || "").slice(0, 100),
    // the image analysis the label was judged under — the critic's context
    analysis: body.analysis && JSON.stringify(body.analysis).length < 30000 ? body.analysis : null,
  };
  const db = await getDb();
  await db.collection("proof_feedback").insertOne(doc as never);
  return NextResponse.json({ ok: true });
}
