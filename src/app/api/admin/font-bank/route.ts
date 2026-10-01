import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { queue, decide, readBank, bankCounts, type FontCat, type Verdict } from "@/lib/typeset/font-bank";

/* the admin's Fonts tab (owner, 2026-10-01): the next fonts of a category
   to judge, and his verdicts — approved faces go live at once */
const CATS: FontCat[] = ["serif", "sans", "display"];

export async function GET(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cat = new URL(req.url).searchParams.get("cat") as FontCat;
  if (!CATS.includes(cat)) return NextResponse.json({ error: "cat must be serif|sans|display" }, { status: 400 });
  try {
    const next = await queue(cat, 12);
    const decided = Object.values(readBank().fonts).filter((f) => f.cat === cat).sort((a, b) => b.at.localeCompare(a.at));
    return NextResponse.json({ next, decided, counts: bankCounts(), last: readBank().history.slice(-1)[0] || null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { family?: string; verdict?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON body" }, { status: 400 }); }
  const v = String(body.verdict);
  if (!["full", "title", "reject", "undo"].includes(v)) return NextResponse.json({ error: "verdict must be full|title|reject|undo" }, { status: 400 });
  try {
    const f = await decide(String(body.family || ""), v as Verdict | "undo");
    return NextResponse.json({ ok: true, font: f, counts: bankCounts() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
