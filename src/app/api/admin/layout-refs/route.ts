import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import {
  listLayoutRefs, addLayoutRef, deleteLayoutRef, getLayoutProfiles, getLayoutRules,
  setBuildRequest, LAYOUT_STYLES,
} from "@/lib/admin/layout-refs";

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [refs, profiles, rules] = await Promise.all([listLayoutRefs(), getLayoutProfiles(), getLayoutRules()]);
  return NextResponse.json({ refs, profiles, rules });
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { style?: string; name?: string; imageDataUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!(LAYOUT_STYLES as readonly string[]).includes(String(body.style)))
    return NextResponse.json({ error: "unknown style" }, { status: 400 });
  if (typeof body.imageDataUrl !== "string" || body.imageDataUrl.length > 12 * 1024 * 1024)
    return NextResponse.json({ error: "image missing or too large (12MB max)" }, { status: 400 });
  try {
    const doc = await addLayoutRef(String(body.style), body.imageDataUrl, String(body.name || ""));
    return NextResponse.json({ ok: true, ref: doc });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

/* PATCH {id, buildRequest} — the owner marks a board label "build this as a
   composition"; Claude reads the marked list and hand-builds verified comps
   (the board→comp workflow, owner 2026-08-17). */
export async function PATCH(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { id?: string; buildRequest?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  return NextResponse.json({ ok: await setBuildRequest(String(body.id), body.buildRequest === true) });
}

export async function DELETE(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  return NextResponse.json({ ok: await deleteLayoutRef(id) });
}
