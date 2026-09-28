import { NextResponse } from "next/server";
import { startRun, refuse, runsLeft, guardSettings, refundRun } from "@/lib/guard";

/* the page starts a run (three labels) before it paints them */
export async function POST(req: Request) {
  let body: { order?: string; refund?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON body" }, { status: 400 }); }
  /* 2026-09-28: a run that delivered nothing is given back (guard.ts) */
  if (body.refund) return NextResponse.json({ refunded: await refundRun(req, String(body.order || "")) });
  const v = await startRun(req, String(body.order || ""));
  if (!v.ok) return refuse(v);
  return NextResponse.json({ ok: true, runsLeft: v.visitor ? Math.max(0, runsLeft(v.visitor, await guardSettings()) - 1) : 99 });
}
