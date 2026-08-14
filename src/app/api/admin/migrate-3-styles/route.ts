import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { getDb } from "@/lib/db";

/* One-shot migration to the 3-style world (owner, 2026-08-14 restart):
   - image references: flora/premium/minimalist → contemporary; artistic → punk
   - derived image profiles, image feedback, per-style art rules: WIPED
     (they were written for the six-style keys and the owner wants a clean
     slate — refs are kept, everything else re-derives on demand). */
export async function POST() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  const refs = db.collection("styleRefs");
  const toContemporary = await refs.updateMany(
    { style: { $in: ["flora", "premium", "minimalist"] } },
    { $set: { style: "contemporary" } }
  );
  const toPunk = await refs.updateMany({ style: "artistic" }, { $set: { style: "punk" } });
  const wipedProfiles = await db.collection("styleProfiles").deleteMany({});
  const wipedFeedback = await db.collection("styleFeedback").deleteMany({});
  await db.collection("settings").updateOne(
    { _id: "art-direction" } as never,
    { $unset: { perStyle: "" } }
  ).catch(() => {});
  return NextResponse.json({
    ok: true,
    movedToContemporary: toContemporary.modifiedCount,
    movedToPunk: toPunk.modifiedCount,
    wipedProfiles: wipedProfiles.deletedCount,
    wipedFeedback: wipedFeedback.deletedCount,
  });
}
