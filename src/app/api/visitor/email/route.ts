import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { visitorOf } from "@/lib/guard";
import { sendMail } from "@/lib/mail";
import { requestIsAuthenticated } from "@/lib/admin/session";

/* NEW VERSIONS, FIRST TIME (owner, 2026-09-27): the visitor leaves an
   e-mail; a link is sent to it. The link (a) proves the address, (b)
   brings them back to the SAME labels page — on this browser or another
   one — with their three versions and the "new versions" button ready.
   So the page's order is kept here with the token. */
const DISPOSABLE = /(^|\.)(mailinator|guerrillamail|10minutemail|tempmail|temp-mail|yopmail|trashmail|getnada|sharklasers|dispostable|maildrop|fakeinbox|throwawaymail|moakt|emailondeck|mintemail|mohmal|burnermail)\./i;

export async function POST(req: Request) {
  let body: { email?: string; lang?: string; record?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON body" }, { status: 400 }); }
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(email)) return NextResponse.json({ error: "bad-email" }, { status: 400 });
  if (DISPOSABLE.test(email.split("@")[1] + ".")) return NextResponse.json({ error: "disposable" }, { status: 400 });
  const record = JSON.stringify(body.record ?? null);
  if (record.length > 300_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  const v = await visitorOf(req);
  if (!v) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const db = await getDb();
  /* at most three letters a day from one browser, and to one address */
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const sent = await db.collection("verifications").countDocuments({ $or: [{ visitor: v._id }, { email }], createdAt: { $gt: since } } as never);
  if (sent >= 3) return NextResponse.json({ error: "too-many" }, { status: 429 });
  const token = crypto.randomBytes(24).toString("base64url");
  await db.collection("verifications").insertOne({ _id: token, visitor: v._id, email, record, createdAt: new Date() } as never);
  const origin = req.headers.get("x-forwarded-host")
    ? `${req.headers.get("x-forwarded-proto") || "https"}://${req.headers.get("x-forwarded-host")}`
    : new URL(req.url).origin;
  const link = `${origin}/api/visitor/verify?t=${token}`;
  const ge = body.lang === "ge";
  const out = await sendMail({
    to: email,
    subject: ge ? "8K Labels — დაადასტურე ელფოსტა" : "8K Labels — confirm your e-mail",
    text: ge
      ? `გამარჯობა!\n\nდააჭირე ამ ბმულს, რომ დაადასტურო ელფოსტა და დაბრუნდე შენს ეტიკეტებთან — იქ ახალი ვერსიების შექმნას შეძლებ:\n\n${link}\n\nბმული 48 საათი მოქმედებს. თუ ეს შენ არ გითხოვია, უბრალოდ წაშალე ეს წერილი.\n\n8K Labels`
      : `Hello!\n\nOpen this link to confirm your e-mail and return to your labels — you can make new versions there:\n\n${link}\n\nThe link works for 48 hours. If you didn't ask for this, just delete this e-mail.\n\n8K Labels`,
  });
  if (out.sent) return NextResponse.json({ sent: true });
  console.error(`[mail] not sent to ${email}: ${out.error}`);
  /* not sent: the admin sees the link to test with; a visitor is told —
     and a letter that never left does not count toward the day's three */
  if (await requestIsAuthenticated()) return NextResponse.json({ sent: false, link, note: out.error });
  await db.collection("verifications").deleteOne({ _id: token } as never).catch(() => { });
  return NextResponse.json({ error: "mail-down" }, { status: 503 });
}
