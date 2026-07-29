import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";

/* Minimal session auth for the admin panel.
   TODO before any real deployment: move credentials to env vars with a hashed
   password and swap the in-memory token set for a persistent session store.
   Hardcoded per current project phase. */
const ADMIN_USER = "John";
const ADMIN_PASS = "Doe";

export const SESSION_COOKIE = "admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

// In-memory sessions: restart of the server logs everyone out (acceptable for now).
const sessions = new Map<string, number>(); // token -> expiry epoch ms

export function checkCredentials(username: unknown, password: unknown): boolean {
  return username === ADMIN_USER && password === ADMIN_PASS;
}

export function createSession(): string {
  const token = randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

export function destroySession(token: string | undefined): void {
  if (token) sessions.delete(token);
}

export function isValidSession(token: string | undefined): boolean {
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) {
    sessions.delete(token);
    return false;
  }
  return true;
}

/** For route handlers: is the current request authenticated? */
export async function requestIsAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  return isValidSession(jar.get(SESSION_COOKIE)?.value);
}
