import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { readLabel } from "@/lib/label/store";

/* THE OWNER'S LAYOUT EDITS (2026-09-23). The admin's layout editor sends
   what he changed on a real label — every line before and after, and the
   picture — and it is kept here as it is: exact numbers, the label it was
   made on, its template and size. NOTHING here becomes a rule by itself;
   Claude reads them (tools/layout-edits-report.mts), says in words what
   they show, and writes a rule only once the owner agrees. */

const DIR = path.join(process.cwd(), "data", "layout-edits");

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  if (!fs.existsSync(DIR)) return NextResponse.json({ edits: [] });
  const edits = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, 100).map((f) => {
    const e = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    return { file: f, at: e.at, labelId: e.labelId, template: e.template, note: e.note || "" };
  });
  return NextResponse.json({ edits });
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  let body: { labelId?: string; before?: unknown; after?: unknown; note?: string; pictureBad?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = String(body.labelId || "").replace(/[^a-z0-9-]/gi, "");
  const label = id ? readLabel(id) : null;
  if (!label) return NextResponse.json({ error: "label not found" }, { status: 404 });
  if (!body.before || !body.after) return NextResponse.json({ error: "before and after required" }, { status: 400 });
  const at = new Date().toISOString();
  const rec = {
    at, labelId: id, template: label.meta.template, style: label.meta.style,
    widthMm: label.meta.widthMm, heightMm: label.meta.heightMm, artist: (label.meta as { artist?: string }).artist || "",
    note: String(body.note || "").slice(0, 2000),
    pictureBad: !!body.pictureBad,
    before: body.before, after: body.after,
  };
  fs.mkdirSync(DIR, { recursive: true });
  const file = `${at.replace(/[:.]/g, "-")}-${id}.json`;
  fs.writeFileSync(path.join(DIR, file), JSON.stringify(rec, null, 1));
  const count = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).length;
  return NextResponse.json({ ok: true, file, count });
}
