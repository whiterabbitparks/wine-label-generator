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

/* measured width of a line at `size` px, with optional letter-spacing (em).
   Glyph by glyph with pair kerning — never through opentype's GSUB
   shaping, which trips on Archivo's chaining lookups ("substFormat 2 is
   not yet supported") and would take the whole label down with it. */
export function measure(text: string, f: Face, size: number, tracking = 0): number {
  const font = loadFace(f);
  if (!font) return text.length * size * 0.55;          /* never happens once fonts are installed */
  const k = size / font.unitsPerEm;
  let w = 0, prev: opentype.Glyph | null = null;
  for (const ch of text) {
    const g = font.charToGlyph(ch);
    if (prev) { try { w += font.getKerningValue(prev, g) * k; } catch { /* no kern table */ } }
    w += (g.advanceWidth || 0) * k;
    prev = g;
  }
  return w + Math.max(0, [...text].length - 1) * tracking * size;
}

/* how far THESE words' ink actually reaches above and below the baseline,
   in px at `size` — read off the glyph outlines, so "2018" is as tall as
   its figures and "Margaux AOC" reaches no lower than its baseline. The
   face's ascender/descender is the tallest glyph it owns; two lines his
   artboard sets close together only clash by that measure, never in ink. */
const boxCache = new Map<string, { up: number; down: number }>();
export function inkExtent(text: string, f: Face, size: number): { up: number; down: number } {
  const font = loadFace(f);
  if (!font) return { up: size * 0.72, down: size * 0.22 };
  let up = 0, down = 0;
  for (const ch of text) {
    const key = `${f.family}|${f.weight}|${f.italic ? 1 : 0}|${ch}`;
    let b = boxCache.get(key);
    if (!b) {
      const bb = font.charToGlyph(ch).getBoundingBox();
      b = { up: Math.max(0, bb.y2) / font.unitsPerEm, down: Math.max(0, -bb.y1) / font.unitsPerEm };
      boxCache.set(key, b);
    }
    up = Math.max(up, b.up); down = Math.max(down, b.down);
  }
  return { up: up * size, down: down * size };
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

/* ONE mixer for every "deterministic pick from a seed" (faces, grounds).
   Murmur-style finaliser on 32-bit ints via Math.imul — a plain `*`
   overflowed the double and every seed landed on the same choice (six
   punk labels, one navy ground). The salt keeps the hero, the secondary
   and the ground from moving in lockstep. */
export function mix(seed: number, salt: number): number {
  let x = Math.imul((seed | 0) ^ Math.imul(salt | 0, 0x9e3779b9), 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

/* deterministic pick — the same seed always sets the same faces */
export function pickRoles(style: string, seed: number): { hero: Pick; secondary: Pick; small: Pick; align: "center" | "left" } {
  const pool = ROLE_POOLS[style] || ROLE_POOLS.traditional;
  const at = <T,>(list: T[], salt: number) => list[mix(seed, salt) % list.length];
  return { hero: at(pool.hero, 1), secondary: at(pool.secondary, 2), small: at(pool.small, 3), align: pool.align };
}
