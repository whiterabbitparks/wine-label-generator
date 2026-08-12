import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { listRefs, addRef, deleteRef } from "@/lib/admin/style-refs";
import { getProfiles } from "@/lib/admin/style-refs";

const STYLES = ["traditional", "contemporary", "flora", "premium", "minimalist", "artistic"];

export async function GET(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const style = url.searchParams.get("style") || undefined;
  const [refs, profiles] = await Promise.all([listRefs(style), getProfiles()]);
  return NextResponse.json({ refs, profiles });
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { style?: string; name?: string; imageDataUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!STYLES.includes(String(body.style))) return NextResponse.json({ error: "unknown style" }, { status: 400 });
  if (typeof body.imageDataUrl !== "string" || body.imageDataUrl.length > 12 * 1024 * 1024)
    return NextResponse.json({ error: "image missing or too large (12MB max)" }, { status: 400 });
  try {
    const doc = await addRef(String(body.style), body.imageDataUrl, String(body.name || ""));
    return NextResponse.json({ ok: true, ref: doc });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  return NextResponse.json({ ok: await deleteRef(id) });
}
