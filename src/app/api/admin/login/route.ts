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
  if (!checkCredentials(body.username, body.password)) {
    return NextResponse.json({ error: "invalid username or password" }, { status: 401 });
  }
  const token = createSession();
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return NextResponse.json({ ok: true });
}
