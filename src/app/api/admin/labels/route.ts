import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { LABEL_DIR, readLabel } from "@/lib/label/store";

/* ROUND 98: the hybrid engine's recent labels for the admin — the list
   (newest 40) and, with ?id=, the label's PNG */
export async function GET(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const l = readLabel(id);
    if (!l) return NextResponse.json({ error: "not found" }, { status: 404 });
    return new Response(new Uint8Array(l.png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" } });
  }
  if (!fs.existsSync(LABEL_DIR)) return NextResponse.json({ labels: [] });
  const labels = fs.readdirSync(LABEL_DIR)
    .filter((d) => fs.existsSync(path.join(LABEL_DIR, d, "meta.json")))
    .map((d) => JSON.parse(fs.readFileSync(path.join(LABEL_DIR, d, "meta.json"), "utf8")))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 40);
  return NextResponse.json({ labels });
}
