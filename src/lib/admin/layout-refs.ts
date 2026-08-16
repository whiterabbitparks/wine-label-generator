import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { sanitizePalettes, type LayoutPalette } from "@/lib/admin/style-refs";

/* LAYOUT references — the owner's LAYOUT language, fully separate from the
   image references (owner, 2026-08-14 restart). Admin uploads label-layout
   reference images per style; a vision pass derives the concrete levers the
   engine actually consumes (palettes, hero-font pool); the layout playground
   collects approve/reject feedback that weights which compositions appear.
   Everything here flows to the client through GET /api/layout-hints and
   LabelEngine.setStyleHints — there is no other influence on rendering. */

export const LAYOUT_REFS_DIR = path.join(process.cwd(), "data", "layout-refs");
export const LAYOUT_STYLES = ["traditional", "contemporary", "punk"] as const;

/* Hero-font categories the vision pass may pick; every entry maps to a face
   the engine already loads (Google fonts). */
export const FONT_CHOICES: Record<string, [string, number]> = {
  blackletter: ["'Grenze Gotisch',serif", 600],
  serif: ["'Playfair Display',serif", 700],
  didone: ["'Prata',serif", 400],
  garalde: ["'EB Garamond',serif", 700],
  roman: ["'Marcellus',serif", 400],
  elegant: ["'Cinzel',serif", 600],
  modern_serif: ["'Fraunces',serif", 600],
  antique: ["'IM Fell English SC',serif", 400],
  sans: ["'Archivo',sans-serif", 800],
  grotesk: ["'Archivo',sans-serif", 600],
  light_sans: ["'Archivo',sans-serif", 300],
  geometric: ["'Jost',sans-serif", 600],
  condensed: ["'Barlow Condensed',sans-serif", 700],
  poster: ["'Anton',sans-serif", 400],
  display_caps: ["'Bebas Neue',sans-serif", 400],
  script: ["'Great Vibes',cursive", 400],
  copperplate: ["'MonteCarlo',cursive", 400],
  italic_script: ["'Italianno',cursive", 400],
  handwritten: ["'Caveat',cursive", 700],
  marker: ["'Permanent Marker',cursive", 400],
  mono: ["'Cutive Mono',monospace", 400],
  slab: ["'Montagu Slab',serif", 600],
};

export interface LayoutRefDoc {
  id: string;
  style: string;
  name: string;
  file: string;
  url: string;
  bytes: number;
  createdAt: Date;
}

export interface LayoutProfile {
  style: string;
  /** what the vision pass saw — shown in admin so the owner can sanity-check */
  notes: string;
  palettes: LayoutPalette[];
  /** hero-font pool: [css-family, weight] pairs mapped from FONT_CHOICES */
  heroFonts: [string, number][];
  refCount: number;
  analyzedAt: Date;
}

export interface LayoutRules {
  global: string;
  perStyle: Record<string, string>;
}

/** Variant counts per public style — MUST match the engine's pools
    (traditional 6; contemporary = 6+5+5+6 merged; punk 6). */
export const VARIANT_COUNTS: Record<string, number> = {
  traditional: 6,
  contemporary: 22,
  punk: 6,
};

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function listLayoutRefs(style?: string): Promise<LayoutRefDoc[]> {
  const db = await getDb();
  const q = style ? { style } : {};
  return db
    .collection<LayoutRefDoc>("layoutRefs")
    .find(q, { projection: { _id: 0 } })
    .sort({ createdAt: 1 })
    .toArray();
}

export async function addLayoutRef(style: string, imageDataUrl: string, name: string): Promise<LayoutRefDoc> {
  const m = imageDataUrl.match(/^data:([^;,]+);base64,/);
  if (!m || !EXT_BY_MIME[m[1]]) throw new Error("reference must be a png/jpeg/webp data URL");
  const buf = Buffer.from(imageDataUrl.slice(m[0].length), "base64");
  const id = randomUUID().slice(0, 12);
  const file = `${style}-${id}.${EXT_BY_MIME[m[1]]}`;
  fs.mkdirSync(LAYOUT_REFS_DIR, { recursive: true });
  fs.writeFileSync(path.join(LAYOUT_REFS_DIR, file), buf);
  const doc: LayoutRefDoc = {
    id,
    style,
    name: name.slice(0, 120) || file,
    file,
    url: `/api/layout-refs/${file}`,
    bytes: buf.length,
    createdAt: new Date(),
  };
  const db = await getDb();
  await db.collection("layoutRefs").insertOne({ ...doc });
  return doc;
}

export async function deleteLayoutRef(id: string): Promise<boolean> {
  const db = await getDb();
  const doc = await db.collection<LayoutRefDoc>("layoutRefs").findOne({ id });
  if (!doc) return false;
  await db.collection("layoutRefs").deleteOne({ id });
  try {
    fs.unlinkSync(path.join(LAYOUT_REFS_DIR, doc.file));
  } catch {}
  return true;
}

export function layoutRefDataUrl(doc: Pick<LayoutRefDoc, "file">): string | null {
  try {
    const p = path.join(LAYOUT_REFS_DIR, path.basename(doc.file));
    const buf = fs.readFileSync(p);
    const ext = p.split(".").pop();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function getLayoutProfiles(): Promise<Record<string, LayoutProfile>> {
  const db = await getDb();
  const rows = await db
    .collection<LayoutProfile>("layoutProfiles")
    .find({}, { projection: { _id: 0 } })
    .toArray();
  return Object.fromEntries(rows.map((r) => [r.style, r]));
}

/* HARD RULES (owner 2026-08-15): mechanical constraints the engine enforces.
   Fixed: 5mm margin, 7pt font floor. Tunable: minimum gap between text
   blocks (mm) and artwork fill of its free area (%, owner 2026-08-16) —
   delivered to the engine via hints.__hardRules. */
export interface HardRules { minGapMM: number; artFillPct: number }
const HARD_ID = "hard-rules";
export async function getHardRules(): Promise<HardRules> {
  try {
    const db = await getDb();
    const doc = (await db.collection("settings").findOne({ _id: HARD_ID } as never)) as { minGapMM?: number; artFillPct?: number } | null;
    const v = Number(doc?.minGapMM);
    const f = Number(doc?.artFillPct);
    return {
      minGapMM: isFinite(v) && v >= 0 && v <= 5 ? v : 1,
      artFillPct: isFinite(f) && f >= 30 && f <= 100 ? f : 85,
    };
  } catch {
    return { minGapMM: 1, artFillPct: 85 };
  }
}
export async function saveHardRules(r: HardRules): Promise<void> {
  const db = await getDb();
  await db.collection("settings").updateOne(
    { _id: HARD_ID } as never,
    { $set: { minGapMM: r.minGapMM, artFillPct: r.artFillPct, updatedAt: new Date() } },
    { upsert: true }
  );
}

const RULES_ID = "layout-rules";
export async function getLayoutRules(): Promise<LayoutRules> {
  try {
    const db = await getDb();
    const doc = await db.collection("settings").findOne({ _id: RULES_ID } as never);
    const d = doc as { global?: string; perStyle?: Record<string, string> } | null;
    return { global: d?.global || "", perStyle: d?.perStyle || {} };
  } catch {
    return { global: "", perStyle: {} };
  }
}
export async function saveLayoutRules(rules: LayoutRules): Promise<void> {
  const db = await getDb();
  await db.collection("settings").updateOne(
    { _id: RULES_ID } as never,
    { $set: { global: String(rules.global || "").slice(0, 4000),
              perStyle: Object.fromEntries(LAYOUT_STYLES.map((s) => [s, String(rules.perStyle?.[s] || "").slice(0, 4000)])),
              updatedAt: new Date() } },
    { upsert: true }
  );
}

/* ---- FONT playground (owner, 2026-08-15): a large style-aware catalog of
   free Google fonts. Each entry is tagged with the styles it suits —
   Traditional sees classic serifs / vintage / academic faces, Contemporary
   sees modern sans and display, Punk sees handwritten / brush / graffiti.
   Approving ANY of them puts it on real labels: the engine loads non-built-in
   families dynamically (EXTRA_FONTS_URL). Rejected fonts leave the deck for
   good; the "Show new fonts" deck keeps dealing unrated candidates. ---- */
export type PoolFont = { family: string; weight: number; label: string; styles: string[]; custom?: boolean };
const T = "traditional", C = "contemporary", P = "punk";
export const FONT_POOL: PoolFont[] = [
  // ---- classic serif · didone · garalde (traditional core) ----
  { family: "'Playfair Display',serif", weight: 700, label: "Playfair Display — serif display", styles: [T, C] },
  { family: "'Playfair Display SC',serif", weight: 700, label: "Playfair Display SC — small caps", styles: [T] },
  { family: "'Prata',serif", weight: 400, label: "Prata — didone", styles: [T, C] },
  { family: "'EB Garamond',serif", weight: 700, label: "EB Garamond — garamond", styles: [T] },
  { family: "'Cormorant Garamond',serif", weight: 600, label: "Cormorant Garamond", styles: [T] },
  { family: "'Cormorant SC',serif", weight: 600, label: "Cormorant SC — small caps", styles: [T] },
  { family: "'Cormorant Infant',serif", weight: 600, label: "Cormorant Infant", styles: [T] },
  { family: "'Libre Baskerville',serif", weight: 700, label: "Libre Baskerville", styles: [T] },
  { family: "'Libre Caslon Text',serif", weight: 400, label: "Libre Caslon Text", styles: [T] },
  { family: "'Libre Caslon Display',serif", weight: 400, label: "Libre Caslon Display", styles: [T] },
  { family: "'Lora',serif", weight: 700, label: "Lora", styles: [T] },
  { family: "'Crimson Text',serif", weight: 600, label: "Crimson Text — academic", styles: [T] },
  { family: "'Spectral',serif", weight: 500, label: "Spectral", styles: [T, C] },
  { family: "'Old Standard TT',serif", weight: 400, label: "Old Standard TT — academic", styles: [T] },
  { family: "'Cardo',serif", weight: 400, label: "Cardo — scholarly", styles: [T] },
  { family: "'Vollkorn',serif", weight: 600, label: "Vollkorn", styles: [T] },
  { family: "'Alegreya',serif", weight: 700, label: "Alegreya", styles: [T] },
  { family: "'Alegreya SC',serif", weight: 500, label: "Alegreya SC — small caps", styles: [T] },
  { family: "'Domine',serif", weight: 600, label: "Domine", styles: [T] },
  { family: "'Petrona',serif", weight: 500, label: "Petrona", styles: [T, C] },
  { family: "'Bellefair',serif", weight: 400, label: "Bellefair", styles: [T] },
  { family: "'Unna',serif", weight: 700, label: "Unna", styles: [T] },
  { family: "'Sorts Mill Goudy',serif", weight: 400, label: "Sorts Mill Goudy", styles: [T] },
  { family: "'Goudy Bookletter 1911',serif", weight: 400, label: "Goudy Bookletter 1911", styles: [T] },
  { family: "'Bodoni Moda',serif", weight: 600, label: "Bodoni Moda — didone", styles: [T, C] },
  { family: "'DM Serif Display',serif", weight: 400, label: "DM Serif Display", styles: [T, C] },
  { family: "'Abril Fatface',serif", weight: 400, label: "Abril Fatface — fat didone", styles: [T, C] },
  { family: "'Rozha One',serif", weight: 400, label: "Rozha One", styles: [T, C] },
  { family: "'Marcellus',serif", weight: 400, label: "Marcellus — roman caps", styles: [T, C] },
  { family: "'Cinzel',serif", weight: 600, label: "Cinzel — engraved caps", styles: [T] },
  { family: "'Cinzel Decorative',serif", weight: 700, label: "Cinzel Decorative", styles: [T] },
  { family: "'Fraunces',serif", weight: 600, label: "Fraunces — modern serif", styles: [T, C] },
  { family: "'Tinos','Times New Roman',serif", weight: 700, label: "Tinos — times", styles: [T] },
  { family: "'Italiana',serif", weight: 400, label: "Italiana — elegant hairline", styles: [T, C] },
  { family: "'Forum',serif", weight: 400, label: "Forum — roman", styles: [T] },
  { family: "'Yeseva One',serif", weight: 400, label: "Yeseva One", styles: [T] },
  { family: "'Mate SC',serif", weight: 400, label: "Mate SC — small caps", styles: [T] },
  { family: "'Baskervville SC',serif", weight: 400, label: "Baskervville SC", styles: [T] },
  { family: "'Girassol',serif", weight: 400, label: "Girassol", styles: [T] },
  { family: "'Nixie One',serif", weight: 400, label: "Nixie One", styles: [T, C] },
  { family: "'Montagu Slab',serif", weight: 600, label: "Montagu Slab — slab", styles: [T, C] },
  // ---- vintage · blackletter · typewriter (traditional flavour) ----
  { family: "'IM Fell English SC',serif", weight: 400, label: "IM Fell English — antique caps", styles: [T] },
  { family: "'Grenze Gotisch',serif", weight: 600, label: "Grenze Gotisch — blackletter", styles: [T] },
  { family: "'Manufacturing Consent',serif", weight: 400, label: "Manufacturing Consent — blackletter", styles: [T] },
  { family: "'UnifrakturMaguntia',cursive", weight: 400, label: "UnifrakturMaguntia — fraktur", styles: [T] },
  { family: "'Pirata One',cursive", weight: 400, label: "Pirata One — blackletter", styles: [T, P] },
  { family: "'Almendra SC',serif", weight: 400, label: "Almendra SC — medieval", styles: [T] },
  { family: "'Metamorphous',serif", weight: 400, label: "Metamorphous — gothic", styles: [T] },
  { family: "'Rye',serif", weight: 400, label: "Rye — western vintage", styles: [T, P] },
  { family: "'Smokum',serif", weight: 400, label: "Smokum — saloon", styles: [T, P] },
  { family: "'Special Elite',cursive", weight: 400, label: "Special Elite — typewriter", styles: [T, P] },
  { family: "'Courier Prime',monospace", weight: 700, label: "Courier Prime — typewriter", styles: [T, C] },
  { family: "'Cutive Mono',monospace", weight: 400, label: "Cutive Mono — typewriter", styles: [T, C] },
  { family: "'Berkshire Swash',cursive", weight: 400, label: "Berkshire Swash — vintage swash", styles: [T] },
  { family: "'Eagle Lake',cursive", weight: 400, label: "Eagle Lake — calligraphy", styles: [T] },
  // ---- scripts & calligraphy (traditional flavour) ----
  { family: "'Great Vibes',cursive", weight: 400, label: "Great Vibes — script", styles: [T] },
  { family: "'MonteCarlo',cursive", weight: 400, label: "MonteCarlo — copperplate", styles: [T] },
  { family: "'Italianno',cursive", weight: 400, label: "Italianno — script", styles: [T] },
  { family: "'Pinyon Script',cursive", weight: 400, label: "Pinyon Script", styles: [T] },
  { family: "'Mrs Saint Delafield',cursive", weight: 400, label: "Mrs Saint Delafield", styles: [T] },
  { family: "'Ballet',cursive", weight: 400, label: "Ballet", styles: [T] },
  { family: "'Estonia',cursive", weight: 400, label: "Estonia", styles: [T] },
  { family: "'Felipa',cursive", weight: 400, label: "Felipa", styles: [T] },
  // ---- modern sans · grotesque · geometric (contemporary core) ----
  { family: "'Archivo',sans-serif", weight: 800, label: "Archivo Heavy — grotesque", styles: [C] },
  { family: "'Archivo',sans-serif", weight: 600, label: "Archivo — grotesque", styles: [C] },
  { family: "'Archivo',sans-serif", weight: 300, label: "Archivo Light", styles: [C] },
  { family: "'Archivo Black',sans-serif", weight: 400, label: "Archivo Black", styles: [C, P] },
  { family: "'Inter',sans-serif", weight: 700, label: "Inter", styles: [C] },
  { family: "'Montserrat',sans-serif", weight: 700, label: "Montserrat", styles: [C] },
  { family: "'Poppins',sans-serif", weight: 600, label: "Poppins — geometric", styles: [C] },
  { family: "'Raleway',sans-serif", weight: 600, label: "Raleway", styles: [C] },
  { family: "'Work Sans',sans-serif", weight: 600, label: "Work Sans", styles: [C] },
  { family: "'DM Sans',sans-serif", weight: 700, label: "DM Sans", styles: [C] },
  { family: "'Manrope',sans-serif", weight: 700, label: "Manrope", styles: [C] },
  { family: "'Space Grotesk',sans-serif", weight: 600, label: "Space Grotesk", styles: [C] },
  { family: "'Sora',sans-serif", weight: 600, label: "Sora", styles: [C] },
  { family: "'Outfit',sans-serif", weight: 600, label: "Outfit", styles: [C] },
  { family: "'Urbanist',sans-serif", weight: 700, label: "Urbanist", styles: [C] },
  { family: "'Figtree',sans-serif", weight: 700, label: "Figtree", styles: [C] },
  { family: "'Karla',sans-serif", weight: 700, label: "Karla", styles: [C] },
  { family: "'Rubik',sans-serif", weight: 600, label: "Rubik", styles: [C] },
  { family: "'Lexend',sans-serif", weight: 600, label: "Lexend", styles: [C] },
  { family: "'Plus Jakarta Sans',sans-serif", weight: 700, label: "Plus Jakarta Sans", styles: [C] },
  { family: "'Albert Sans',sans-serif", weight: 700, label: "Albert Sans", styles: [C] },
  { family: "'Jost',sans-serif", weight: 600, label: "Jost — geometric", styles: [C] },
  { family: "'Josefin Sans',sans-serif", weight: 600, label: "Josefin Sans — deco geometric", styles: [C] },
  { family: "'Comfortaa',cursive", weight: 600, label: "Comfortaa — rounded", styles: [C] },
  { family: "'Quicksand',sans-serif", weight: 600, label: "Quicksand — rounded", styles: [C] },
  { family: "'Chivo',sans-serif", weight: 700, label: "Chivo", styles: [C] },
  { family: "'Cabin',sans-serif", weight: 600, label: "Cabin", styles: [C] },
  { family: "'Heebo',sans-serif", weight: 700, label: "Heebo", styles: [C] },
  { family: "'Didact Gothic',sans-serif", weight: 400, label: "Didact Gothic", styles: [C] },
  { family: "'Tenor Sans',sans-serif", weight: 400, label: "Tenor Sans — elegant sans", styles: [C, T] },
  { family: "'Julius Sans One',sans-serif", weight: 400, label: "Julius Sans One — hairline caps", styles: [C, T] },
  { family: "'Syne',sans-serif", weight: 700, label: "Syne — art sans", styles: [C, P] },
  { family: "'Unbounded',cursive", weight: 600, label: "Unbounded — expanded", styles: [C, P] },
  { family: "'Michroma',sans-serif", weight: 400, label: "Michroma — techno", styles: [C] },
  { family: "'Gruppo',cursive", weight: 400, label: "Gruppo — thin wide", styles: [C] },
  { family: "'Advent Pro',sans-serif", weight: 600, label: "Advent Pro", styles: [C] },
  { family: "'Poiret One',cursive", weight: 400, label: "Poiret One — deco", styles: [C, T] },
  { family: "'Monoton',cursive", weight: 400, label: "Monoton — neon deco", styles: [C, P] },
  // ---- condensed & poster (contemporary + punk) ----
  { family: "'Barlow',sans-serif", weight: 700, label: "Barlow", styles: [C] },
  { family: "'Barlow Condensed',sans-serif", weight: 700, label: "Barlow Condensed", styles: [C] },
  { family: "'Archivo Narrow',sans-serif", weight: 700, label: "Archivo Narrow", styles: [C] },
  { family: "'Oswald',sans-serif", weight: 600, label: "Oswald — condensed", styles: [C] },
  { family: "'Fjalla One',sans-serif", weight: 400, label: "Fjalla One", styles: [C] },
  { family: "'Teko',sans-serif", weight: 600, label: "Teko — condensed", styles: [C] },
  { family: "'League Spartan',sans-serif", weight: 700, label: "League Spartan", styles: [C] },
  { family: "'Saira Condensed',sans-serif", weight: 600, label: "Saira Condensed", styles: [C] },
  { family: "'Six Caps',sans-serif", weight: 400, label: "Six Caps — ultra condensed", styles: [C, P] },
  { family: "'Anton',sans-serif", weight: 400, label: "Anton — poster", styles: [C, P] },
  { family: "'Bebas Neue',sans-serif", weight: 400, label: "Bebas Neue — display caps", styles: [C, P] },
  { family: "'Staatliches',cursive", weight: 400, label: "Staatliches — poster caps", styles: [C, P] },
  { family: "'Antonio',sans-serif", weight: 600, label: "Antonio — condensed", styles: [C] },
  // ---- handwritten · marker · sketch (punk core) ----
  { family: "'Permanent Marker',cursive", weight: 400, label: "Permanent Marker", styles: [P] },
  { family: "'Caveat',cursive", weight: 700, label: "Caveat — handwritten", styles: [P, C] },
  { family: "'Rock Salt',cursive", weight: 400, label: "Rock Salt — scrawl", styles: [P] },
  { family: "'Homemade Apple',cursive", weight: 400, label: "Homemade Apple — pen", styles: [P] },
  { family: "'Reenie Beanie',cursive", weight: 400, label: "Reenie Beanie — biro", styles: [P] },
  { family: "'Shadows Into Light',cursive", weight: 400, label: "Shadows Into Light", styles: [P] },
  { family: "'Indie Flower',cursive", weight: 400, label: "Indie Flower", styles: [P] },
  { family: "'Amatic SC',cursive", weight: 700, label: "Amatic SC — tall hand", styles: [P, C] },
  { family: "'Patrick Hand',cursive", weight: 400, label: "Patrick Hand", styles: [P] },
  { family: "'Kalam',cursive", weight: 700, label: "Kalam", styles: [P] },
  { family: "'Gochi Hand',cursive", weight: 400, label: "Gochi Hand", styles: [P] },
  { family: "'Just Another Hand',cursive", weight: 400, label: "Just Another Hand", styles: [P] },
  { family: "'Nothing You Could Do',cursive", weight: 400, label: "Nothing You Could Do", styles: [P] },
  { family: "'Covered By Your Grace',cursive", weight: 400, label: "Covered By Your Grace", styles: [P] },
  { family: "'Walter Turncoat',cursive", weight: 400, label: "Walter Turncoat", styles: [P] },
  { family: "'Gloria Hallelujah',cursive", weight: 400, label: "Gloria Hallelujah", styles: [P] },
  { family: "'Architects Daughter',cursive", weight: 400, label: "Architects Daughter", styles: [P] },
  { family: "'Cabin Sketch',cursive", weight: 700, label: "Cabin Sketch — sketch", styles: [P] },
  { family: "'Fredericka the Great',cursive", weight: 400, label: "Fredericka the Great — sketch", styles: [P, T] },
  { family: "'Londrina Sketch',cursive", weight: 400, label: "Londrina Sketch", styles: [P] },
  { family: "'Londrina Solid',cursive", weight: 400, label: "Londrina Solid", styles: [P] },
  { family: "'Finger Paint',cursive", weight: 400, label: "Finger Paint", styles: [P] },
  { family: "'Freckle Face',cursive", weight: 400, label: "Freckle Face", styles: [P] },
  // ---- brush & graffiti (punk core) ----
  { family: "'Yellowtail',cursive", weight: 400, label: "Yellowtail — brush script", styles: [P, C] },
  { family: "'Pacifico',cursive", weight: 400, label: "Pacifico — brush", styles: [P, C] },
  { family: "'Kaushan Script',cursive", weight: 400, label: "Kaushan Script — brush", styles: [P, C] },
  { family: "'Knewave',cursive", weight: 400, label: "Knewave — heavy brush", styles: [P] },
  { family: "'Sarina',cursive", weight: 400, label: "Sarina — brush", styles: [P] },
  { family: "'Sedgwick Ave',cursive", weight: 400, label: "Sedgwick Ave — graffiti", styles: [P] },
  { family: "'Sedgwick Ave Display',cursive", weight: 400, label: "Sedgwick Ave Display — graffiti", styles: [P] },
  { family: "'Rubik Spray Paint',cursive", weight: 400, label: "Rubik Spray Paint — spray", styles: [P] },
  { family: "'Rubik Marker Hatch',cursive", weight: 400, label: "Rubik Marker Hatch", styles: [P] },
  { family: "'Rubik Glitch',cursive", weight: 400, label: "Rubik Glitch", styles: [P] },
  { family: "'Barrio',cursive", weight: 400, label: "Barrio — grunge", styles: [P] },
  // ---- loud display (punk core) ----
  { family: "'Bangers',cursive", weight: 400, label: "Bangers — comic shout", styles: [P] },
  { family: "'Luckiest Guy',cursive", weight: 400, label: "Luckiest Guy", styles: [P] },
  { family: "'Titan One',cursive", weight: 400, label: "Titan One", styles: [P] },
  { family: "'Bungee',cursive", weight: 400, label: "Bungee", styles: [P] },
  { family: "'Bungee Shade',cursive", weight: 400, label: "Bungee Shade", styles: [P] },
  { family: "'Creepster',cursive", weight: 400, label: "Creepster — horror", styles: [P] },
  { family: "'Nosifer',cursive", weight: 400, label: "Nosifer — drip", styles: [P] },
  { family: "'Eater',cursive", weight: 400, label: "Eater — decay", styles: [P] },
  { family: "'Frijole',cursive", weight: 400, label: "Frijole", styles: [P] },
  { family: "'Shrikhand',cursive", weight: 400, label: "Shrikhand — juicy display", styles: [P, C] },
  { family: "'Righteous',cursive", weight: 400, label: "Righteous", styles: [P, C] },
  { family: "'Ranchers',cursive", weight: 400, label: "Ranchers", styles: [P] },
  { family: "'Chewy',cursive", weight: 400, label: "Chewy", styles: [P] },
  { family: "'Wallpoet',cursive", weight: 400, label: "Wallpoet — stencil", styles: [P, C] },
];

/* Owner-added fonts by name (validated against Google Fonts by the route).
   They join the catalog permanently and are auto-approved on add. */
export interface CustomFontDoc { family: string; weight: number; label: string; styles: string[]; createdAt: Date }
export async function addCustomFont(name: string, weight: number, style: string): Promise<PoolFont> {
  const family = `'${name}',sans-serif`;
  const db = await getDb();
  const col = db.collection<CustomFontDoc>("customFonts");
  const existing = await col.findOne({ family, weight });
  if (existing) {
    if (!existing.styles.includes(style)) await col.updateOne({ family, weight }, { $addToSet: { styles: style } });
    return { family, weight, label: existing.label, styles: [...new Set([...existing.styles, style])], custom: true };
  }
  const doc: CustomFontDoc = { family, weight, label: `${name} — added by you`, styles: [style], createdAt: new Date() };
  await col.insertOne({ ...doc });
  return { family: doc.family, weight: doc.weight, label: doc.label, styles: doc.styles, custom: true };
}
export async function fullFontPool(): Promise<PoolFont[]> {
  let customs: CustomFontDoc[] = [];
  try {
    const db = await getDb();
    customs = await db.collection<CustomFontDoc>("customFonts").find({}, { projection: { _id: 0 } }).toArray();
  } catch {}
  const seen = new Set(FONT_POOL.map((f) => `${f.family}@${f.weight}`));
  const extra = customs
    .filter((c) => !seen.has(`${c.family}@${c.weight}`))
    .map((c) => ({ family: c.family, weight: c.weight, label: c.label, styles: c.styles, custom: true }));
  return [...FONT_POOL, ...extra];
}

export type FontRole = "hero" | "secondary" | "small";
export const FONT_ROLES: FontRole[] = ["hero", "secondary", "small"];

export interface FontFeedbackDoc {
  style: string;
  role: FontRole;
  family: string;
  weight: number;
  verdict: "approve" | "reject";
  comment: string;
  createdAt: Date;
}
export async function addFontFeedback(fb: Omit<FontFeedbackDoc, "createdAt">): Promise<void> {
  const db = await getDb();
  await db.collection("fontFeedback").insertOne({ ...fb, createdAt: new Date() });
}
/** Net score per style → role → "family@weight": approvals +1, rejections −1.
    Pre-role documents count toward the hero role. */
export async function fontScores(): Promise<Record<string, Record<FontRole, Record<string, number>>>> {
  const db = await getDb();
  const rows = await db
    .collection<FontFeedbackDoc>("fontFeedback")
    .find({}, { projection: { _id: 0 } })
    .toArray();
  const out: Record<string, Record<FontRole, Record<string, number>>> = {};
  for (const r of rows) {
    const role: FontRole = FONT_ROLES.includes(r.role) ? r.role : "hero";
    const per = ((out[r.style] ||= { hero: {}, secondary: {}, small: {} })[role] ||= {});
    const k = `${r.family}@${r.weight}`;
    per[k] = (per[k] ?? 0) + (r.verdict === "approve" ? 1 : -1);
  }
  return out;
}

/* Case preference PER FONT within a style+role (owner, 2026-08-15): default
   null = standard grammar (text as the winemaker wrote it); "upper" forces
   UPPERCASE for that font only. Keyed "family@weight". */
export type CasePref = "upper" | null;
const CASE_ID = "layout-caseprefs";
export async function getCasePrefs(): Promise<Record<string, Partial<Record<FontRole, Record<string, CasePref>>>>> {
  try {
    const db = await getDb();
    const doc = (await db.collection("settings").findOne({ _id: CASE_ID } as never)) as
      | ({ prefs?: Record<string, Partial<Record<FontRole, Record<string, CasePref>>>> } & Record<string, unknown>)
      | null;
    return doc?.prefs || {};
  } catch {
    return {};
  }
}
export async function setCasePref(style: string, role: FontRole, fontKey: string, pref: CasePref): Promise<void> {
  const db = await getDb();
  await db.collection("settings").updateOne(
    { _id: CASE_ID } as never,
    { $set: { [`prefs.${style}.${role}.${fontKey.replace(/\./g, "·")}`]: pref, updatedAt: new Date() } },
    { upsert: true }
  );
}

/* ---- layout refinement feedback: approve/reject a rendered LOOK ----
   A look (owner 2026-08-16) = the exact combination the admin judged: the
   card's render seed + the pick-relevant hint arrays active at that moment
   (palettes / role fonts). Storing them FROZEN means an approved look
   reproduces byte-for-byte forever, immune to later board re-derivations
   or font-pool changes. Legacy docs without a seed remain comp-level. */
export interface LookHints {
  palettes?: unknown[];
  heroFonts?: unknown[];
  secondaryFonts?: unknown[];
  smallFonts?: unknown[];
}
export interface LayoutFeedbackDoc {
  style: string;
  variant: number;
  seed?: number;
  hints?: LookHints;
  verdict: "approve" | "reject";
  comment: string;
  createdAt: Date;
}
export async function addLayoutFeedback(fb: Omit<LayoutFeedbackDoc, "createdAt">): Promise<void> {
  const db = await getDb();
  await db.collection("layoutFeedback").insertOne({ ...fb, createdAt: new Date() });
}
/** Remove from the selected set: with a seed, only that LOOK's history goes;
    without, the comp's whole history (legacy cards). Never a rejection. */
export async function clearLayoutFeedback(style: string, variant: number, seed?: number): Promise<void> {
  const db = await getDb();
  await db.collection("layoutFeedback").deleteMany(
    seed === undefined ? { style, variant } : { style, variant, seed }
  );
}
/** Approved LOOKS per style — last verdict per (style, seed) wins. */
export async function approvedLooks(): Promise<Record<string, { variant: number; seed: number; hints?: LookHints }[]>> {
  const db = await getDb();
  const rows = await db
    .collection<LayoutFeedbackDoc>("layoutFeedback")
    .find({ seed: { $exists: true } }, { projection: { _id: 0 } })
    .sort({ createdAt: 1 })
    .toArray();
  const last: Record<string, LayoutFeedbackDoc> = {};
  for (const r of rows) last[`${r.style}#${r.seed}`] = r;
  const out: Record<string, { variant: number; seed: number; hints?: LookHints }[]> = {};
  for (const r of Object.values(last)) {
    if (r.verdict !== "approve") continue;
    (out[r.style] = out[r.style] || []).push({ variant: r.variant, seed: r.seed!, hints: r.hints });
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.variant - b.variant || a.seed - b.seed);
  return out;
}
/** Recent plain-English comments from the layout playground — steer the next
    "Derive layout language" run and are surfaced in admin. */
export async function layoutComments(style?: string, limit = 12): Promise<{ style: string; verdict: string; comment: string }[]> {
  const db = await getDb();
  return db
    .collection<LayoutFeedbackDoc>("layoutFeedback")
    .find({ ...(style ? { style } : {}), comment: { $exists: true, $ne: "" } }, { projection: { _id: 0, style: 1, verdict: 1, comment: 1 } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray() as Promise<{ style: string; verdict: string; comment: string }[]>;
}

/** Per-style weight arrays for the engine. SELECTION IS A STATE, not a
    running vote (owner bug report 2026-08-16: an approve after earlier
    rejects nets below the bar and silently stays hidden): the comp's LAST
    verdict wins — approve → 2 (selected), reject → 0.4 (faded in soft
    mode, 0 in approved-only mode), unrated → 1. buildLayoutHints applies
    the approved-only transform (weight > 1) before the engine sees it. */
export async function layoutWeights(): Promise<Record<string, number[]>> {
  const db = await getDb();
  const rows = await db
    .collection<LayoutFeedbackDoc>("layoutFeedback")
    .find({}, { projection: { _id: 0 } })
    .sort({ createdAt: 1 })
    .toArray();
  const last: Record<string, Record<number, string>> = {};
  for (const r of rows) (last[r.style] = last[r.style] || {})[r.variant] = r.verdict;
  const out: Record<string, number[]> = {};
  for (const [style, n] of Object.entries(VARIANT_COUNTS)) {
    out[style] = Array.from({ length: n }, (_, i) => {
      const v = last[style]?.[i];
      return v === "approve" ? 2 : v === "reject" ? 0.4 : 1;
    });
  }
  return out;
}

/** Everything the engine consumes, in setStyleHints() shape. Public read.
    Hero-font pool = fonts approved in the Fonts playground ∪ the derived
    profile fonts, minus anything net-rejected — verdicts apply immediately. */
export async function buildLayoutHints(): Promise<Record<string, unknown>> {
  const [profiles, weights, fonts, casePrefs, POOL, hard, looks] = await Promise.all([
    getLayoutProfiles(), layoutWeights(), fontScores(), getCasePrefs(), fullFontPool(), getHardRules(), approvedLooks().catch(() => ({})),
  ]);
  const hints: Record<string, unknown> = { __hardRules: { minGapMM: hard.minGapMM, artFillPct: hard.artFillPct } };
  for (const style of LAYOUT_STYLES) {
    const prof = profiles[style];
    const mix = (a: string, b: string, t: number) => {
      const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
      const ch = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
      return "#" + [16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, "0")).join("").toUpperCase();
    };
    const entry: Record<string, unknown> = {};
    if (prof?.palettes?.length)
      entry.palettes = prof.palettes.map((p) => ({ bg: p.bg, ink: p.ink, sub: mix(p.ink, p.bg, 0.45), acc: p.acc }));
    const byRole = fonts[style] || { hero: {}, secondary: {}, small: {} };
    // every pool entry is [family, weight, case] — case is that FONT's own
    // switch (null = standard grammar, "upper" = force caps), owner 2026-08-15
    const caseOf = (role: FontRole, fam: string, w: number): CasePref =>
      (casePrefs[style]?.[role] || {})[`${fam}@${w}`.replace(/\./g, "·")] ?? null;
    // ALL roles are approved-only (owner 2026-08-16: "use only selected
    // fonts"). The board-derived hero pool no longer auto-joins the customer
    // pool — derived fonts only seed the Fonts deck for the owner to judge.
    // No selections for a role → the engine's designed per-comp fonts.
    const heroScores = byRole.hero || {};
    const approvedHero = POOL.filter((f) => (heroScores[`${f.family}@${f.weight}`] ?? 0) > 0)
      .map((f) => [f.family, f.weight, caseOf("hero", f.family, f.weight)] as [string, number, CasePref]);
    if (approvedHero.length) entry.heroFonts = approvedHero;
    for (const [role, key] of [["secondary", "secondaryFonts"], ["small", "smallFonts"]] as const) {
      const sc = byRole[role] || {};
      const pool = POOL.filter((f) => (sc[`${f.family}@${f.weight}`] ?? 0) > 0)
        .map((f) => [f.family, f.weight, caseOf(role, f.family, f.weight)] as [string, number, CasePref]);
      if (pool.length) entry[key] = pool;
    }
    // APPROVED LOOKS dominate (owner 2026-08-16): once a style has approved
    // looks, customers get ONLY those exact combinations — the engine
    // renders each look under its frozen hints + seed, so the weights
    // transform below is irrelevant for that style. Without looks, the
    // legacy comp-level gating stands: any comp approved (weight > 1) →
    // every non-approved comp gets EXACTLY 0 ("never render"); with no
    // approvals at all, the old soft behaviour (rejected comps fade).
    const styleLooks = (looks as Record<string, { variant: number; seed: number; hints?: LookHints }[]>)[style];
    if (styleLooks?.length) {
      entry.looks = styleLooks.map((L) => ({ variant: L.variant, seed: L.seed, ...(L.hints || {}) }));
    } else {
      const w = weights[style];
      if (w) {
        const anyApproved = w.some((x) => x > 1);
        const finalW = anyApproved ? w.map((x) => (x > 1 ? x : 0)) : w;
        if (finalW.some((x) => x !== 1)) entry.weights = finalW;
      }
    }
    if (Object.keys(entry).length) hints[style] = entry;
  }
  return hints;
}

/* chat/completions with 429 retry (same behaviour as the image analysis) */
async function visionFetch(init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", init);
    if (res.status !== 429 || attempt >= 3) return res;
    const text = await res.text().catch(() => "");
    const m = text.match(/try again in ([\d.]+)s/i);
    const wait = Math.min(60, m ? Math.ceil(parseFloat(m[1])) + 1 : 15);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
}

/** Vision pass over the LAYOUT board: derive palettes + a hero-font pool
    (mapped onto faces the engine loads) + human-readable notes. The owner's
    layout rules are handed to the model so admin rules steer the derivation. */
export async function analyzeLayoutStyle(style: string): Promise<LayoutProfile> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set — analysis needs the vision model");
  const refs = await listLayoutRefs(style);
  if (!refs.length) throw new Error("upload at least one layout reference first");
  const rules = await getLayoutRules();
  const comments = await layoutComments(style, 10).catch(() => []);
  const liked = comments.filter((c) => c.verdict === "approve").map((c) => c.comment);
  const disliked = comments.filter((c) => c.verdict === "reject").map((c) => c.comment);
  const images = refs.slice(0, 12).map((r) => layoutRefDataUrl(r)).filter(Boolean) as string[];
  const cats = Object.keys(FONT_CHOICES).join('"|"');
  const model = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
  const res = await visionFetch({
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a wine-label art director analysing LAYOUT reference boards (typography and " +
            "colour only — ignore what any illustration depicts). Return strict JSON: " +
            '{"notes": 2-3 sentences on the boards\' layout language (type character, colour use, density), ' +
            '"palettes": [3-6 items {"bg": hex, "ink": hex, "acc": hex} — colour chords actually seen on the ' +
            "boards for label ground, text ink and one accent; bg must be a light paper-like colour, ink dark], " +
            '"heroFonts": [2-5 items, each ONE of "' + cats + '" — the display-type characters you actually ' +
            "see used for the most prominent word on these labels, most dominant first]}. " +
            (rules.global || rules.perStyle?.[style]
              ? "OWNER RULES you must respect: " + [rules.global, rules.perStyle?.[style]].filter(Boolean).join(" | ") + ". "
              : "") +
            (liked.length ? "The owner LIKED layouts described as: " + liked.join("; ") + ". " : "") +
            (disliked.length ? "The owner DISLIKED layouts described as: " + disliked.join("; ") + " — avoid palettes/typography with those qualities. " : "") +
            "Only report what is observably on the boards.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Style: ${style}. Derive the layout profile from these boards.` },
            ...images.map((url) => ({ type: "image_url" as const, image_url: { url, detail: "low" as const } })),
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`layout analysis failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const parsed = JSON.parse(json.choices?.[0]?.message?.content || "{}") as {
    notes?: string;
    palettes?: unknown;
    heroFonts?: unknown;
  };
  const palettes = sanitizePalettes(parsed.palettes);
  const heroFonts = (Array.isArray(parsed.heroFonts) ? parsed.heroFonts : [])
    .map((c) => FONT_CHOICES[String(c)])
    .filter(Boolean)
    .slice(0, 6) as [string, number][];
  const profile: LayoutProfile = {
    style,
    notes: String(parsed.notes || "").slice(0, 1000),
    palettes,
    heroFonts,
    refCount: refs.length,
    analyzedAt: new Date(),
  };
  const db = await getDb();
  await db.collection("layoutProfiles").updateOne({ style }, { $set: profile }, { upsert: true });
  return profile;
}
