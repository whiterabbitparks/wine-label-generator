import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { batchStatus, closeItem, startBatch } from "@/lib/label/layout-batch";

/* the admin's layout batch (src/lib/label/layout-batch.ts): GET the queue
   and any batch still painting; POST { action: "make" } paints five more;
   POST { action: "close", id, outcome: "fixed" | "ok", pictureBad } takes
   one out of the queue */
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  return NextResponse.json(batchStatus());
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  let body: { action?: string; id?: string; outcome?: string; pictureBad?: boolean; note?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (body.action === "make") return NextResponse.json({ started: startBatch(), ...batchStatus() });
  if (body.action === "close") {
    const outcome = body.outcome === "ok" ? "ok" : "fixed";
    const ok = closeItem(String(body.id || "").replace(/[^a-z0-9-]/gi, ""), outcome, !!body.pictureBad, String(body.note || ""));
    return NextResponse.json({ closed: ok, ...batchStatus() }, { status: ok ? 200 : 404 });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
