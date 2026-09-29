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
   each has painted. Switching an artist on or off is still a word to
   Claude. 2026-09-29 (owner): the SETS are edited here (PUT, drag and drop
   in the card) — written into the server's profile.json; Claude pulls the
   live profile before any deploy of that artist's folder.
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
      note: p.note || "", works, refSets: p.refSets || [], abstractSet: (p as { abstractSet?: number }).abstractSet, lora: a!.lora ? { trigger: a!.lora.trigger, trainedAt: a!.lora.trainedAt, works: a!.lora.works } : null,
      painted: painted.get(p.name) || 0,
    };
  }).sort((x, y) => Number(y.active) - Number(x.active) || x.name.localeCompare(y.name)) : [];
  return NextResponse.json({ artists });
}

/* the owner's sets of works, rearranged in the admin (2026-09-29): up to
   eight sets of one to four works, every work one of the artist's own */
export async function PUT(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  let body: { id?: string; refSets?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = safe(body.id || "");
  const file = path.join(ARTISTS_DIR, id, "profile.json");
  if (!id || !fs.existsSync(file)) return NextResponse.json({ error: "no such artist" }, { status: 404 });
  const works = new Set(fs.readdirSync(path.join(ARTISTS_DIR, id, "works")));
  if (!Array.isArray(body.refSets)) return NextResponse.json({ error: "refSets must be a list" }, { status: 400 });
  const sets = (body.refSets as unknown[]).filter(Array.isArray).map((st) => [...new Set((st as unknown[]).map((f) => safe(String(f))).filter((f) => works.has(f)))].slice(0, 4)).filter((st) => st.length).slice(0, 8);
  const prof = JSON.parse(fs.readFileSync(file, "utf8"));
  prof.refSets = sets;
  fs.writeFileSync(file, JSON.stringify(prof, null, 2) + "\n");
  return NextResponse.json({ ok: true, refSets: sets });
}
