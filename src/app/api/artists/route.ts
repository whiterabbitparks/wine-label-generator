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
  /* round 113 #5: the page carries BOTH marks, as the owner drew them.
     Either address may still be empty — its icon is then simply inert
     until the owner fills it in (profile.json: instagram / website). */
  instagram: string;
  website: string;
  portrait: string;
  crop: string;          /* where the portrait is cropped, as the owner clipped it */
  works: string[];
  /* round 113 #6: labels already painted in this artist's hand — the
     second view on her page ("Labels from …") */
  labels: string[];
}

const PUB = path.join(process.cwd(), "public", "newui", "artists");

export async function GET() {
  const out: SiteArtist[] = [];
  for (const a of listArtists()) {
    const p = a.profile as typeof a.profile & { bio?: string; page?: boolean; pageOrder?: number; crop?: string; instagram?: string; website?: string };
    const dir = path.join(PUB, p.id);
    /* 2026-09-22 (owner, adding Levan): an artist may arrive with her
       paintings and nothing else. What she MUST have to get a page is
       work to show; the portrait and the biography can follow. */
    const portrait = fs.existsSync(path.join(dir, "portrait.jpg"));
    if (p.page === false || !fs.existsSync(path.join(dir, "work1.jpg"))) continue;
    const works: string[] = [], labels: string[] = [];
    for (let i = 1; i <= 12; i++) {
      const f = path.join(dir, `work${i}.jpg`);
      if (fs.existsSync(f)) works.push(`/newui/artists/${p.id}/work${i}.jpg`);
      const l = path.join(dir, `label${i}.jpg`);
      if (fs.existsSync(l)) labels.push(`/newui/artists/${p.id}/label${i}.jpg`);
    }
    const link = (p.portfolio || "").trim();
    const isIg = /instagram\./i.test(link);
    out.push({
      instagram: (p.instagram || (isIg ? link : "")).trim(),
      website: (p.website || (isIg ? "" : link)).trim(),
      id: p.id,
      name: p.name,
      bio: (p.bio || "").trim(),
      link,
      linkKind: isIg ? "instagram" : link ? "site" : "",
      /* 2026-09-23 (Giorgi Akhuashvili arrived without a photo): until
         the portrait comes, his first work stands in the circle — an
         empty src showed a broken image with his name in it */
      portrait: portrait ? `/newui/artists/${p.id}/portrait.jpg` : works[0] || "",
      crop: p.crop || "50% 40%",
      works,
      labels,
      order: p.pageOrder ?? 99,
    } as SiteArtist & { order: number });
  }
  out.sort((x, y) => ((x as SiteArtist & { order: number }).order) - ((y as SiteArtist & { order: number }).order));
  return NextResponse.json({ artists: out }, { headers: { "Cache-Control": "public, max-age=300" } });
}
