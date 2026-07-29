import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { loadConfig, saveConfig } from "@/lib/admin/config-store";

/* GET is public: the client configurator loads the active art direction on
   init (the assembled prompt is visible client-side anyway).
   POST requires an authenticated admin session. */

export async function GET() {
  return NextResponse.json(loadConfig());
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  return NextResponse.json(saveConfig(body));
}
