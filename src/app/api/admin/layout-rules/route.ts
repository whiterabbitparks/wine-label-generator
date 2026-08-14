import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { getLayoutRules, saveLayoutRules } from "@/lib/admin/layout-refs";

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ rules: await getLayoutRules() });
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { global?: string; perStyle?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  await saveLayoutRules({ global: String(body.global || ""), perStyle: body.perStyle || {} });
  return NextResponse.json({ ok: true });
}
