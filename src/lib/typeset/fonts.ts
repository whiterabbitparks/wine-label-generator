import fs from "node:fs";
import path from "node:path";
/* opentype.js ships CommonJS without an ES default — a default import comes
   back undefined under the bundler; the namespace form is the whole module */
import * as opentype from "opentype.js";

/* THE TYPE SYSTEM (branch POPIKA_Back_To_Vector, 2026-09-19).

   Google fonts only (owner 2026-09-19: "in labels, as before, use only
   Google's free fonts") — the legacy engine's pool, downloaded to
   public/fonts/labels/ as TTFs so that (a) opentype.js can MEASURE every
   line before it is set and (b) librsvg renders the same file (installed
   as a system font — the back-label lesson). The role pools distil the
   legacy engine's hand-picked pairings: a HERO face for the wine name, a
   SECONDARY for producer / appellation / vintage, a SMALL for the rest. */

export const FONT_DIR = path.join(process.cwd(), "public", "fonts", "labels");

export interface Face { family: string; weight: number; italic?: boolean }

/* file name as downloaded: FamilyNoSpaces-<weight>[i].ttf */
export function faceFile(f: Face): string {
  return path.join(FONT_DIR, `${f.family.replace(/\s+/g, "")}-${f.weight}${f.italic ? "i" : ""}.ttf`);
}

const cache = new Map<string, opentype.Font>();
export function loadFace(f: Face): opentype.Font | null {
  const p = faceFile(f);
  if (cache.has(p)) return cache.get(p)!;
  if (!fs.existsSync(p)) return null;
  /* a Node Buffer may sit inside a pooled slab — hand opentype exactly this
     file's bytes, not the slab */
  const b = fs.readFileSync(p);
  const font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  cache.set(p, font);
  return font;
}

/* measured width of a line at `size` px, with optional letter-spacing (em) */
export function measure(text: string, f: Face, size: number, tracking = 0): number {
  const font = loadFace(f);
  if (!font) return text.length * size * 0.55;          /* never happens once fonts are installed */
  return font.getAdvanceWidth(text, size) + Math.max(0, text.length - 1) * tracking * size;
}

/* ascender / descender of the face, as fractions of the size */
export function vmetrics(f: Face): { asc: number; desc: number } {
  const font = loadFace(f);
  if (!font) return { asc: 0.9, desc: 0.25 };
  const u = font.unitsPerEm;
  return { asc: font.ascender / u, desc: Math.abs(font.descender) / u };
}

/* ---- the role pools, per style --------------------------------------
   Each entry is [face, letterspacing-em, caps]. Faces come from the legacy
   HERO_ALTS / role picks; the list order is the seed's shuffle space. */
export interface Pick { face: Face; tracking: number; caps: boolean }
const P = (family: string, weight: number, tracking = 0, caps = false, italic = false): Pick => ({ face: { family, weight, italic }, tracking, caps });

export const ROLE_POOLS: Record<string, { hero: Pick[]; secondary: Pick[]; small: Pick[]; align: "center" | "left" }> = {
  traditional: {
    hero: [P("Playfair Display", 700), P("Cinzel", 600, 0.04, true), P("Prata", 400), P("EB Garamond", 500), P("Marcellus", 400, 0.02, true), P("Cormorant Garamond", 600)],
    secondary: [P("Marcellus", 400, 0.12, true), P("EB Garamond", 500, 0.1, true), P("Cinzel", 500, 0.08, true), P("Alegreya SC", 500, 0.06)],
    small: [P("EB Garamond", 400, 0.02), P("Cormorant Garamond", 500, 0.02), P("Tinos", 400, 0.02)],
    align: "center",
  },
  contemporary: {
    hero: [P("Archivo", 800, -0.01), P("Fraunces", 600), P("Anton", 400, 0.01, true), P("Bebas Neue", 400, 0.03, true), P("Jost", 600, 0.02, true)],
    secondary: [P("Jost", 500, 0.14, true), P("Archivo", 500, 0.12, true), P("Marcellus", 400, 0.1, true)],
    small: [P("Archivo", 400, 0.01), P("Jost", 400, 0.01)],
    align: "left",
  },
  punk: {
    hero: [P("Permanent Marker", 400), P("Anton", 400, 0.01, true), P("Bebas Neue", 400, 0.02, true), P("Caveat", 700), P("Barlow Condensed", 700, 0.01, true)],
    secondary: [P("Caveat", 700), P("Barlow Condensed", 700, 0.06, true), P("Archivo", 700, 0.08, true)],
    small: [P("Barlow", 600, 0.01), P("Archivo", 500, 0.01)],
    align: "left",
  },
};

/* deterministic pick — the same seed always sets the same faces */
export function pickRoles(style: string, seed: number): { hero: Pick; secondary: Pick; small: Pick; align: "center" | "left" } {
  const pool = ROLE_POOLS[style] || ROLE_POOLS.traditional;
  const at = <T,>(list: T[], salt: number) => list[Math.abs((seed * 2654435761 + salt * 40503) >>> 0) % list.length];
  return { hero: at(pool.hero, 1), secondary: at(pool.secondary, 2), small: at(pool.small, 3), align: pool.align };
}
