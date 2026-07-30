import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { listUsers, createUser, changePassword, deleteUser, UserError } from "@/lib/admin/users";

/* Admin user management — every method requires an authenticated session.
   GET            -> { users: [{username, createdAt}] }
   POST   {username, password}  -> create
   PATCH  {username, password}  -> change password
   DELETE {username}            -> delete (last-admin guarded) */

async function guard(): Promise<NextResponse | null> {
  if (!(await requestIsAuthenticated())) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }
  return null;
}

function fail(e: unknown): NextResponse {
  if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status });
  const message = e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: message }, { status: 503 });
}

async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  try {
    return NextResponse.json({ users: await listUsers() });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const b = await body(req);
    return NextResponse.json(await createUser(b.username, b.password), { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const b = await body(req);
    await changePassword(b.username, b.password);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const b = await body(req);
    await deleteUser(b.username);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
