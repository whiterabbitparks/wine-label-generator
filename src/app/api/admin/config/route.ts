import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { loadConfig, saveConfig, DEFAULT_CONFIG } from "@/lib/admin/config-store";

/* GET is public: the client configurator loads the active art direction on
   init (the assembled prompt is visible client-side anyway). Falls back to
   defaults if the DB is unreachable so the configurator never breaks.
   POST requires an authenticated admin session. */

export async function GET() {
  try {
    return NextResponse.json(await loadConfig());
  } catch {
    return NextResponse.json(DEFAULT_CONFIG);
  }
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
  try {
    return NextResponse.json(await saveConfig(body));
  } catch (e) {
    return NextResponse.json(
      { error: "failed to save: " + (e instanceof Error ? e.message : String(e)) },
      { status: 503 }
    );
  }
}
