import { NextResponse } from "next/server";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { LABEL_DIR, readLabel } from "@/lib/label/store";

/* ROUND 98: the hybrid engine's recent labels for the admin — the list
   (newest 40) and, with ?id=, the label's PNG */
export async function GET(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const part = url.searchParams.get("part");
  if (id) {
    const l = readLabel(id);
    if (!l) return NextResponse.json({ error: "not found" }, { status: 404 });
    /* 2026-09-23 — the admin's LAYOUT EDITOR: the painting on its own, and
       the label's layout with what the editor needs to redraw it live
       (the painting's size, and which weights each face has on disk) */
    if (part === "art") return new Response(new Uint8Array(l.art), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" } });
    if (part === "layout") {
      const m = await sharp(l.art).metadata();
      const faces: Record<string, number[]> = {};
      for (const f of fs.readdirSync(path.join(process.cwd(), "public", "fonts", "labels"))) {
        const mm = f.match(/^(.+)-(\d{3})\.ttf$/);
        if (mm) (faces[mm[1]] ||= []).push(Number(mm[2]));
      }
      return NextResponse.json({ meta: l.meta, layout: l.layout, art: { w: m.width || 1, h: m.height || 1 }, faces });
    }
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
