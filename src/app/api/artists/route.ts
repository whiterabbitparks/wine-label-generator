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
  bioGe: string;           /* 2026-09-29: the biography in Georgian, when written */
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
  /* 2026-09-29 (owner): one PAGE may stand for several models of one
     painter (Kakabadze's Imereti oils + Brittany watercolours) — their
     names (labels read "Style By: <model name>") and ids (to paint with) */
  names?: string[];
  ids?: string[];
}

const PUB = path.join(process.cwd(), "public", "newui", "artists");

export async function GET() {
  const out: SiteArtist[] = [];
  for (const a of listArtists()) {
    const p = a.profile as typeof a.profile & { bioGe?: string; bio?: string; page?: boolean; pageOrder?: number; crop?: string; instagram?: string; website?: string; pageName?: string; pageMerge?: string[] };
    const dir = path.join(PUB, p.id);
    /* 2026-09-22 (owner, adding Levan): an artist may arrive with her
       paintings and nothing else. What she MUST have to get a page is
       work to show; the portrait and the biography can follow. */
    const portrait = fs.existsSync(path.join(dir, "portrait.jpg"));
    if (p.page === false || !fs.existsSync(path.join(dir, "work1.jpg"))) continue;
    const works: string[] = [], labels: string[] = [];
    /* a merged page takes its models' pictures in turn (oil, watercolour, …) */
    const members = [p.id, ...(p.pageMerge || [])];
    const each = members.map((id) => {
      const w: string[] = [], l: string[] = [];
      for (let i = 1; i <= 12; i++) {
        if (fs.existsSync(path.join(PUB, id, `work${i}.jpg`))) w.push(`/newui/artists/${id}/work${i}.jpg`);
        if (fs.existsSync(path.join(PUB, id, `label${i}.jpg`))) l.push(`/newui/artists/${id}/label${i}.jpg`);
      }
      return { w, l };
    });
    for (let i = 0; i < 12; i++) for (const e of each) { if (e.w[i]) works.push(e.w[i]); if (e.l[i]) labels.push(e.l[i]); }
    const memberNames = members.map((id) => listArtists().find((x) => x.profile.id === id)?.profile.name || "").filter(Boolean);
    const link = (p.portfolio || "").trim();
    const isIg = /instagram\./i.test(link);
    out.push({
      instagram: (p.instagram || (isIg ? link : "")).trim(),
      website: (p.website || (isIg ? "" : link)).trim(),
      id: p.id,
      name: p.pageName || p.name,
      names: memberNames,
      ids: members,
      bio: (p.bio || "").trim(),
      bioGe: (p.bioGe || "").trim(),
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
  /* 2026-09-28 (owner): the details page's Style menu lists everyone who
     PAINTS (a trained model, switched on) — with a round avatar (the
     portrait, else a first work, else an avatar.jpg cut from a work) and
     whether a page exists to open */
  const painters = listArtists().filter((a) => a.lora).map((a) => {
    const p = a.profile as typeof a.profile & { pageOrder?: number };
    const dir = path.join(PUB, p.id);
    const page = out.find((x) => (x.ids || [x.id]).includes(p.id));
    const avatar = page?.portrait || (fs.existsSync(path.join(dir, "avatar.jpg")) ? `/newui/artists/${p.id}/avatar.jpg` : "");
    /* 2026-09-28 (owner): the taste page's horse — every painter paints one
       (tools/make-horse.mts), shown in the owner's order (horseOrder) */
    const horse = fs.existsSync(path.join(dir, "horse.jpg")) ? `/newui/artists/${p.id}/horse.jpg` : "";
    const hp = a.profile as typeof a.profile & { horseOrder?: number };
    return { id: p.id, name: p.name, avatar, crop: page?.crop || "50% 40%", page: !!page, order: p.pageOrder ?? 99, horse, horseOrder: hp.horseOrder ?? 50 + (p.pageOrder ?? 49) };
  }).sort((x, y) => x.order - y.order);
  return NextResponse.json({ artists: out, painters }, { headers: { "Cache-Control": "public, max-age=300" } });
}
