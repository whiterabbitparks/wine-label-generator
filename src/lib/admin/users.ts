import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";

/* Admin user management (`users` collection). Passwords are bcrypt-hashed;
   plaintext never touches the database. The last remaining admin cannot be
   deleted (lock-out guard). */

export interface AdminUserInfo {
  username: string;
  createdAt: Date;
}

export class UserError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function validUsername(u: unknown): u is string {
  return typeof u === "string" && /^[a-zA-Z0-9._-]{3,40}$/.test(u);
}
function validPassword(p: unknown): p is string {
  return typeof p === "string" && p.length >= 4 && p.length <= 200;
}

export async function listUsers(): Promise<AdminUserInfo[]> {
  const db = await getDb();
  const rows = await db
    .collection("users")
    .find({}, { projection: { _id: 0, username: 1, createdAt: 1 } })
    .sort({ createdAt: 1 })
    .toArray();
  return rows.map((r) => ({ username: r.username as string, createdAt: r.createdAt as Date }));
}

export async function createUser(username: unknown, password: unknown): Promise<AdminUserInfo> {
  if (!validUsername(username))
    throw new UserError("username must be 3-40 chars: letters, digits, . _ -", 400);
  if (!validPassword(password)) throw new UserError("password must be at least 4 characters", 400);
  const db = await getDb();
  const doc = { username, passwordHash: await bcrypt.hash(password, 10), createdAt: new Date() };
  try {
    await db.collection("users").insertOne(doc);
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: number }).code === 11000) {
      throw new UserError("username already exists", 409);
    }
    throw e;
  }
  return { username: doc.username, createdAt: doc.createdAt };
}

export async function changePassword(username: unknown, password: unknown): Promise<void> {
  if (typeof username !== "string") throw new UserError("username required", 400);
  if (!validPassword(password)) throw new UserError("password must be at least 4 characters", 400);
  const db = await getDb();
  const r = await db
    .collection("users")
    .updateOne({ username }, { $set: { passwordHash: await bcrypt.hash(password, 10) } });
  if (r.matchedCount === 0) throw new UserError("user not found", 404);
}

export async function deleteUser(username: unknown): Promise<void> {
  if (typeof username !== "string") throw new UserError("username required", 400);
  const db = await getDb();
  const users = db.collection("users");
  if ((await users.countDocuments()) <= 1) {
    throw new UserError("cannot delete the last remaining admin", 409);
  }
  const r = await users.deleteOne({ username });
  if (r.deletedCount === 0) throw new UserError("user not found", 404);
}
