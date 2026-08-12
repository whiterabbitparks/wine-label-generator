import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { checkCredentials, createSession, SESSION_COOKIE } from "@/lib/admin/session";

export async function POST(req: Request) {
  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  let ok = false;
  try {
    ok = await checkCredentials(body.username, body.password);
  } catch (e) {
    // DB unreachable/unconfigured must surface as JSON, not a bare 500 —
    // Safari turns a non-JSON body into "The string did not match the
    // expected pattern", which hides the real problem.
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `database not connected: ${msg}` },
      { status: 503 }
    );
  }
  if (!ok) {
    return NextResponse.json({ error: "invalid username or password" }, { status: 401 });
  }
  const token = await createSession();
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return NextResponse.json({ ok: true });
}
