import fs from "node:fs";
import path from "node:path";

/* THE ARTISTS (branch POPIKA_Artists, 2026-09-20). A real artist's works
   and questionnaire live under data/artists/<id>/ — works/*.jpg,
   profile.json (the seven answers), lora.json (the trained FLUX LoRA on
   fal, written by the trainer). An artist is a PAINTER for the hybrid
   engine: painter id "artist:<id>", FLUX + LoRA on fal, the artist's own
   words as the style line. The pilot: Mariam Kvashilava. */

export const ARTISTS_DIR = path.join(process.cwd(), "data", "artists");

export interface ArtistProfile {
  id: string; name: string; country?: string; portfolio?: string;
  medium: string; words: string[]; colour: string; form: string; never: string; mood: string;
  status?: string;
}
export interface ArtistLora { url: string; trigger: string; steps: number; works: number; trainedAt: string }
export interface Artist { profile: ArtistProfile; lora: ArtistLora | null; works: number }

const safe = (s: string) => path.basename(String(s)).replace(/[^a-z0-9-]/g, "");

export function listArtists(): Artist[] {
  if (!fs.existsSync(ARTISTS_DIR)) return [];
  return fs.readdirSync(ARTISTS_DIR).map((d) => readArtist(d)).filter((a): a is Artist => !!a);
}

export function readArtist(id: string): Artist | null {
  const dir = path.join(ARTISTS_DIR, safe(id));
  const pp = path.join(dir, "profile.json");
  if (!fs.existsSync(pp)) return null;
  const profile = JSON.parse(fs.readFileSync(pp, "utf8")) as ArtistProfile;
  const lp = path.join(dir, "lora.json");
  const lora = fs.existsSync(lp) ? (JSON.parse(fs.readFileSync(lp, "utf8")) as ArtistLora) : null;
  const wd = path.join(dir, "works");
  const works = fs.existsSync(wd) ? fs.readdirSync(wd).filter((f) => /\.jpe?g$|\.png$/i.test(f)).length : 0;
  return { profile, lora, works };
}

/* the artist's charter — their own answers, as the STYLE line of the ask */
export function artistStyleLine(p: ArtistProfile): string {
  return `in the style of ${p.name}: ${p.medium}; ${p.words.join(", ")}; colour — ${p.colour}; form — ${p.form}; ${p.never}; mood — ${p.mood}`;
}
