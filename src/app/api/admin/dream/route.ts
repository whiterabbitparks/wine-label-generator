import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { runDreamPhase, runRebuildPhase } from "@/lib/dream/engine";

/* DREAM ENGINE admin endpoint — thin wrapper over src/lib/dream/engine.ts
   (shared with the public customer flow at /api/dream-label). */

export const maxDuration = 300;

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { phase?: string; vision?: string; style?: string; data?: Record<string, string>; dream?: string; sketch?: string | null; reuseArtwork?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  try {
    if (body.phase === "rebuild") {
      const dream = String(body.dream || "");
      if (!dream.startsWith("data:image/")) return NextResponse.json({ error: "rebuild needs the dream image" }, { status: 400 });
      const r = await runRebuildPhase({ dream, vision: String(body.vision || ""), data: body.data || {}, style: body.style, reuseArtwork: body.reuseArtwork });
      return NextResponse.json(r);
    }
    const r = await runDreamPhase({ vision: String(body.vision || ""), style: body.style, data: body.data || {}, sketch: body.sketch });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
