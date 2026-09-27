import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { visitorCookie } from "@/lib/guard";

/* the link in the e-mail: proves the address, gives its one free run
   (once per address, ever), and puts THIS browser on the visitor who
   asked — then opens the labels page again with their versions */
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") || "";
  const db = await getDb();
  const ver = (await db.collection("verifications").findOne({ _id: t } as never)) as { visitor: string; email: string; createdAt: Date } | null;
  const home = new URL("/", req.headers.get("x-forwarded-host") ? `${req.headers.get("x-forwarded-proto") || "https"}://${req.headers.get("x-forwarded-host")}` : req.url);
  if (!ver || Date.now() - new Date(ver.createdAt).getTime() > 48 * 3600 * 1000) {
    home.searchParams.set("verify", "expired");
    return NextResponse.redirect(home, 302);
  }
  await db.collection("verifications").updateOne({ _id: t } as never, { $set: { usedAt: new Date() } } as never);
  /* the address's free run goes to the first visitor who confirms it */
  const claim = await db.collection("emails").updateOne(
    { _id: ver.email, freeRunTo: { $exists: false } } as never,
    { $set: { freeRunTo: ver.visitor, verifiedAt: new Date() } } as never, { upsert: true }).catch(() => ({ upsertedCount: 0, modifiedCount: 0 }));
  const gotRun = !!(claim.upsertedCount || claim.modifiedCount);
  await db.collection("visitors").updateOne({ _id: ver.visitor } as never,
    { $set: { email: ver.email, verifiedAt: new Date().toISOString(), ...(gotRun ? { emailRun: 1 } : {}) } } as never);
  home.searchParams.set("resume", t);
  /* the cookie rides on the redirect itself, so a phone or another browser
     opening the link becomes this visitor */
  const res = NextResponse.redirect(home, 302);
  const c = visitorCookie(ver.visitor);
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
