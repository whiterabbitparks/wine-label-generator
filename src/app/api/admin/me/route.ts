import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";

export async function GET() {
  return NextResponse.json({ authenticated: await requestIsAuthenticated() });
}
