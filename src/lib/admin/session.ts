import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";

/* Session auth backed by MongoDB.
   - `users`:    { username (unique), passwordHash, createdAt }
   - `sessions`: { token, expiresAt } with a TTL index — Mongo deletes expired
     sessions itself, and logins now survive server restarts.
   The user store is seeded with John/Doe on first use.
   TODO(auth): replace the seeded John/Doe credentials with proper user
   management (registration/invite flow, password change) before deployment. */

const SEED_USER = "John";
const SEED_PASS = "Doe";

export const SESSION_COOKIE = "admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

let indexesReady: Promise<void> | undefined;
function ensureIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      await db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      await db.collection("users").createIndex({ username: 1 }, { unique: true });
    })();
  }
  return indexesReady;
}

export async function checkCredentials(username: unknown, password: unknown): Promise<boolean> {
  if (typeof username !== "string" || typeof password !== "string") return false;
  await ensureIndexes();
  const db = await getDb();
  const users = db.collection("users");
  if ((await users.countDocuments()) === 0) {
    await users.insertOne({
      username: SEED_USER,
      passwordHash: await bcrypt.hash(SEED_PASS, 10),
      createdAt: new Date(),
    });
  }
  const user = await users.findOne({ username });
  if (!user) return false;
  return bcrypt.compare(password, user.passwordHash as string);
}

export async function createSession(): Promise<string> {
  await ensureIndexes();
  const token = randomBytes(32).toString("hex");
  const db = await getDb();
  await db.collection("sessions").insertOne({
    token,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    createdAt: new Date(),
  });
  return token;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  const db = await getDb();
  await db.collection("sessions").deleteOne({ token });
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const db = await getDb();
  const s = await db.collection("sessions").findOne({ token, expiresAt: { $gt: new Date() } });
  return !!s;
}

/** For route handlers: is the current request authenticated? */
export async function requestIsAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  try {
    return await isValidSession(jar.get(SESSION_COOKIE)?.value);
  } catch {
    return false; // DB down -> treat as unauthenticated rather than crash
  }
}
