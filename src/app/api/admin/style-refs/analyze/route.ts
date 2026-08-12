import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { analyzeStyle } from "@/lib/admin/style-refs";

export const maxDuration = 120;

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { style?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  try {
    const profile = await analyzeStyle(String(body.style || ""));
    return NextResponse.json({ ok: true, profile });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
