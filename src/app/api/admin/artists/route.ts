import { NextResponse } from "next/server";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { ARTISTS_DIR, readArtist, isActive } from "@/lib/label/artists";
import { LABEL_DIR } from "@/lib/label/store";

/* THE ARTISTS, FOR THE ADMIN (2026-09-24, the admin tidy). Read-only: who
   is painting, the trained model, the works, the owner's own sets of
   works (turned one a label), the consent status, and how many labels
   each has painted. Switching an artist on or off, or changing the sets,
   is still a word to Claude: a deploy copies data/artists to the server,
   so a switch flipped on the live admin would be undone by the next one.
   ?id=<artist>&work=<file> returns a small picture of one work. */

const safe = (s: string) => path.basename(String(s)).replace(/[^a-z0-9._-]/gi, "");

export async function GET(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id"), work = url.searchParams.get("work");
  if (id && work) {
    const f = path.join(ARTISTS_DIR, safe(id), "works", safe(work));
    if (!fs.existsSync(f)) return NextResponse.json({ error: "not found" }, { status: 404 });
    const jpg = await sharp(f).resize({ width: 220, height: 220, fit: "inside" }).jpeg({ quality: 78 }).toBuffer();
    return new Response(new Uint8Array(jpg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" } });
  }
  /* labels painted, per artist name */
  const painted = new Map<string, number>();
  if (fs.existsSync(LABEL_DIR)) for (const d of fs.readdirSync(LABEL_DIR)) {
    try { const m = JSON.parse(fs.readFileSync(path.join(LABEL_DIR, d, "meta.json"), "utf8")); if (m.artist) painted.set(m.artist, (painted.get(m.artist) || 0) + 1); } catch { /* not a label */ }
  }
  const artists = fs.existsSync(ARTISTS_DIR) ? fs.readdirSync(ARTISTS_DIR).map((d) => readArtist(d)).filter((a) => !!a).map((a) => {
    const p = a!.profile as typeof a.profile & { consent?: string; page?: boolean };
    const wd = path.join(ARTISTS_DIR, p.id, "works");
    const works = fs.existsSync(wd) ? fs.readdirSync(wd).filter((f) => /\.jpe?g$|\.png$/i.test(f)).sort() : [];
    return {
      id: p.id, name: p.name, active: isActive(p), page: !!p.page, consent: p.consent || "", status: p.status || "",
      note: p.note || "", works, refSets: p.refSets || [], lora: a!.lora ? { trigger: a!.lora.trigger, trainedAt: a!.lora.trainedAt, works: a!.lora.works } : null,
      painted: painted.get(p.name) || 0,
    };
  }).sort((x, y) => Number(y.active) - Number(x.active) || x.name.localeCompare(y.name)) : [];
  return NextResponse.json({ artists });
}
