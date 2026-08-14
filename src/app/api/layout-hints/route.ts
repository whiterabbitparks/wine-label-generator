import { NextResponse } from "next/server";
import { buildLayoutHints } from "@/lib/admin/layout-refs";

/* Public: everything the admin Layout section curated, in the exact shape
   LabelEngine.setStyleHints consumes. The client fetches this once at boot —
   it is the ONLY external influence on layout rendering. */
export async function GET() {
  try {
    return NextResponse.json({ hints: await buildLayoutHints() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ hints: {} }, { headers: { "Cache-Control": "no-store" } });
  }
}
