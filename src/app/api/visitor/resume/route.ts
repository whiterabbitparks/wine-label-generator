import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { visitorOf } from "@/lib/guard";

/* the page's order kept with the e-mail link — only for the visitor it belongs to */
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") || "";
  const v = await visitorOf(req, false);
  const db = await getDb();
  const ver = (await db.collection("verifications").findOne({ _id: t } as never)) as { visitor: string; record: string } | null;
  if (!v || !ver || ver.visitor !== v._id) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ record: JSON.parse(ver.record || "null") });
}
