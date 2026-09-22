import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { listArtists } from "@/lib/label/artists";

/* THE ARTISTS, FOR THE SITE (round 112 #4, owner's artboards). Public —
   this is the page a visitor reads, not the admin's. It carries only what
   the page shows: the name, the biography the owner wrote, one link, and
   the pictures that live under public/newui/artists/<id>/ (a portrait and
   up to six works, prepared from the owner's own artboards). An artist
   without that folder simply has no page. */

export interface SiteArtist {
  id: string;
  name: string;
  bio: string;
  link: string;
  linkKind: "instagram" | "site" | "";
  portrait: string;
  crop: string;          /* where the portrait is cropped, as the owner clipped it */
  works: string[];
}

const PUB = path.join(process.cwd(), "public", "newui", "artists");

export async function GET() {
  const out: SiteArtist[] = [];
  for (const a of listArtists()) {
    const p = a.profile as typeof a.profile & { bio?: string; page?: boolean; pageOrder?: number; crop?: string };
    const dir = path.join(PUB, p.id);
    if (p.page === false || !fs.existsSync(path.join(dir, "portrait.jpg"))) continue;
    const works: string[] = [];
    for (let i = 1; i <= 12; i++) {
      const f = path.join(dir, `work${i}.jpg`);
      if (fs.existsSync(f)) works.push(`/newui/artists/${p.id}/work${i}.jpg`);
    }
    const link = (p.portfolio || "").trim();
    out.push({
      id: p.id,
      name: p.name,
      bio: (p.bio || "").trim(),
      link,
      linkKind: /instagram\./i.test(link) ? "instagram" : link ? "site" : "",
      portrait: `/newui/artists/${p.id}/portrait.jpg`,
      crop: p.crop || "50% 40%",
      works,
      order: p.pageOrder ?? 99,
    } as SiteArtist & { order: number });
  }
  out.sort((x, y) => ((x as SiteArtist & { order: number }).order) - ((y as SiteArtist & { order: number }).order));
  return NextResponse.json({ artists: out }, { headers: { "Cache-Control": "public, max-age=300" } });
}
