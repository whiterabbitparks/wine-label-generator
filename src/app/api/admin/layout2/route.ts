import { NextResponse } from "next/server";
import fs from "node:fs";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { trialRuns, startTrial, trialOtherLayout, trialOtherGround, trialFile } from "@/lib/layout2/trials";
import { artistGrounds } from "@/lib/layout2/artist-grounds";
import { listArtists } from "@/lib/label/artists";
import { FAMILIES } from "@/lib/layout2/engine";

/* the admin's final-round trials (src/lib/layout2/trials.ts):
     GET                      → runs, artists, families
     GET ?file=run/name.png   → a trial picture
     POST { action: "paint", artists, idea, data, widthMm, heightMm, count, families?, note? }
     POST { action: "layout", id, want? }   another layout of the same painting (free)
     POST { action: "ground", id, want? }   another ground (free): "originals" | "painting" | "white" | "warm" | "#rrggbb" */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const url = new URL(req.url);
  const file = url.searchParams.get("file");
  if (file) {
    const [run, name] = file.split("/");
    const p = trialFile(run || "", name || "");
    if (!fs.existsSync(p)) return new NextResponse("not found", { status: 404 });
    return new NextResponse(fs.readFileSync(p), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" } });
  }
  const artists = await Promise.all(listArtists().map(async (a) => ({ id: a.profile.id, name: a.profile.name, grounds: (await artistGrounds(a.profile.id)).grounds.slice(0, 5) })));
  return NextResponse.json({ runs: trialRuns(), artists, families: FAMILIES.map((f) => ({ id: f[0].id, ids: f.map((l) => l.id), sizes: f.map((l) => `${l.refW}×${Math.round(l.refH)}`) })) });
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  let body: { action?: string; id?: string; want?: string; artists?: string[]; idea?: string; data?: Record<string, string>; widthMm?: number; heightMm?: number; count?: number; families?: string[]; note?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  try {
    if (body.action === "paint") {
      const count = Math.min(12, Math.max(1, Number(body.count) || 4));
      const run = startTrial({ artists: (body.artists || []).map(String).filter((a) => /^[a-z0-9-]{1,40}$/.test(a)), idea: String(body.idea || "").slice(0, 1200), data: Object.fromEntries(Object.entries(body.data || {}).map(([k, v]) => [k, String(v).slice(0, 200)])), widthMm: Math.min(300, Math.max(30, Number(body.widthMm) || 100)), heightMm: Math.min(300, Math.max(30, Number(body.heightMm) || 80)), count, families: (body.families || []).map(String).filter((f) => /^L\d\d$/.test(f)), note: String(body.note || "").slice(0, 200) });
      return NextResponse.json({ run });
    }
    if (body.action === "layout") return NextResponse.json({ item: await trialOtherLayout(String(body.id || ""), body.want ? String(body.want) : undefined) });
    if (body.action === "ground") return NextResponse.json({ item: await trialOtherGround(String(body.id || ""), body.want ? String(body.want) : undefined) });
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
