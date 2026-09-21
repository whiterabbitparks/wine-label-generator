import fs from "node:fs";
import path from "node:path";

/* THE ARTISTS (branch POPIKA_Artists, 2026-09-20). A real artist's works
   and questionnaire live under data/artists/<id>/ — works/*.jpg,
   profile.json (the seven answers), lora.json (the trained FLUX LoRA on
   fal, written by the trainer). An artist IS the painter of the hybrid
   engine (round 105: the one pipeline, gpt-image → FLUX + the artist's
   LoRA): painter id "artist:<id>". The pilots: Mariam Kvashilava, Keta
   Dvali, Tal Tamam. */

export const ARTISTS_DIR = path.join(process.cwd(), "data", "artists");

export interface ArtistProfile {
  id: string; name: string; country?: string; portfolio?: string;
  medium: string; words: string[]; colour: string; form: string; never: string; mood: string;
  /* the four works shown to gpt-image as style references (file names in
     works/); when absent, four are picked evenly through the folder */
  refs?: string[];
  status?: string;
}
export interface ArtistLora { url: string; trigger: string; steps: number; works: number; captions?: boolean; trainedAt: string }
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

/* the four reference works, as data URLs — what gpt-image is shown so the
   STORY picture already leans the artist's way before the LoRA repaints it */
export function artistRefs(id: string, count = 4): string[] {
  const dir = path.join(ARTISTS_DIR, safe(id));
  const wd = path.join(dir, "works");
  if (!fs.existsSync(wd)) return [];
  const all = fs.readdirSync(wd).filter((f) => /\.jpe?g$|\.png$/i.test(f)).sort();
  const a = readArtist(id);
  const chosen = (a?.profile.refs || []).filter((f) => all.includes(f));
  const pick = chosen.length ? chosen : Array.from({ length: Math.min(count, all.length) }, (_, i) => all[Math.floor((i + 0.5) * all.length / Math.min(count, all.length))]);
  return pick.map((f) => `data:image/${/\.png$/i.test(f) ? "png" : "jpeg"};base64,${fs.readFileSync(path.join(wd, f)).toString("base64")}`);
}

/* the artist's charter — their own answers, as the STYLE line of the ask */
export function artistCharter(p: ArtistProfile): string {
  return `${p.medium}; ${p.words.join(", ")}; colour: ${p.colour}; form: ${p.form}; ${p.never}; mood: ${p.mood}`;
}
