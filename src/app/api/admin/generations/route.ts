import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { recentGenerations } from "@/lib/admin/generation-log";

export async function GET() {
  if (!(await requestIsAuthenticated())) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }
  try {
    return NextResponse.json({ generations: await recentGenerations(20) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 503 }
    );
  }
}
