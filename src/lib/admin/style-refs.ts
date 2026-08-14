import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";

/* Per-style reference images — the owner's artistic language, uploaded in
   /admin. Files live on disk (data/style-refs/, gitignored); metadata in the
   `styleRefs` collection. An analysis pass (vision model) studies each
   style's reference board and derives a STYLE PROFILE: a handful of variety
   recipes spanning the board's diversity. Generation then rotates through
   those recipes AND attaches the reference images themselves as image
   inputs, which is where the real style transfer happens. */

export const REFS_DIR = path.join(process.cwd(), "data", "style-refs");

export interface StyleRefDoc {
  id: string;
  style: string;
  name: string;
  file: string;
  url: string;
  bytes: number;
  createdAt: Date;
}

export interface StyleVariant {
  key: string;
  label: string;
  medium: string;
  composition: string;
  mood: string;
  palette: string;
  /** self-contained rich visual language for THIS direction — leads the
      prompt (owner 2026-08-14: one shared charter made every generation of a
      style converge on one look; each direction must stand alone, mirroring
      a distinct cluster of the reference board) */
  language?: string;
}

export interface LayoutPalette {
  bg: string;
  ink: string;
  acc: string;
}

export const TYPE_DISPLAYS = [
  "serif", "sans", "condensed", "slab", "script", "poster", "mono", "elegant",
] as const;
export type TypeDisplay = (typeof TYPE_DISPLAYS)[number];

export interface LayoutType {
  /** dominant display-type character of the boards */
  display: TypeDisplay;
  case: "caps" | "lower" | "mixed";
}
export interface LayoutComposition {
  alignment: "centered" | "left" | "mixed";
}

export interface StyleProfile {
  style: string;
  summary: string;
  /** dense subject-agnostic paragraph of the board's shared visual DNA —
      leads every image prompt for this style (owner request 2026-08-13:
      generation must resemble the references' artistic style more strongly) */
  charter?: string;
  variants: StyleVariant[];
  /** layout-side hints derived from the same boards (palettes, type, composition) */
  layout?: {
    palettes: LayoutPalette[];
    type?: LayoutType | null;
    composition?: LayoutComposition | null;
  } | null;
  refCount: number;
  analyzedAt: Date;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function listRefs(style?: string): Promise<StyleRefDoc[]> {
  const db = await getDb();
  const q = style ? { style } : {};
  return db
    .collection<StyleRefDoc>("styleRefs")
    .find(q, { projection: { _id: 0 } })
    .sort({ createdAt: 1 })
    .toArray();
}

export async function addRef(style: string, imageDataUrl: string, name: string): Promise<StyleRefDoc> {
  const m = imageDataUrl.match(/^data:([^;,]+);base64,/);
  if (!m || !EXT_BY_MIME[m[1]]) throw new Error("reference must be a png/jpeg/webp data URL");
  const buf = Buffer.from(imageDataUrl.slice(m[0].length), "base64");
  const id = randomUUID().slice(0, 12);
  const file = `${style}-${id}.${EXT_BY_MIME[m[1]]}`;
  fs.mkdirSync(REFS_DIR, { recursive: true });
  fs.writeFileSync(path.join(REFS_DIR, file), buf);
  const doc: StyleRefDoc = {
    id,
    style,
    name: name.slice(0, 120) || file,
    file,
    url: `/api/style-refs/${file}`,
    bytes: buf.length,
    createdAt: new Date(),
  };
  const db = await getDb();
  await db.collection("styleRefs").insertOne({ ...doc });
  return doc;
}

export async function deleteRef(id: string): Promise<boolean> {
  const db = await getDb();
  const doc = await db.collection<StyleRefDoc>("styleRefs").findOne({ id });
  if (!doc) return false;
  await db.collection("styleRefs").deleteOne({ id });
  try {
    fs.unlinkSync(path.join(REFS_DIR, doc.file));
  } catch {}
  return true;
}

/** Read a stored reference as a data URL (for vision analysis / image input). */
export function refDataUrl(doc: Pick<StyleRefDoc, "file">): string | null {
  try {
    const p = path.join(REFS_DIR, path.basename(doc.file));
    const buf = fs.readFileSync(p);
    const ext = p.split(".").pop();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function getProfiles(): Promise<Record<string, StyleProfile>> {
  const db = await getDb();
  const rows = await db
    .collection<StyleProfile>("styleProfiles")
    .find({}, { projection: { _id: 0 } })
    .toArray();
  return Object.fromEntries(rows.map((r) => [r.style, r]));
}

/* ---- palette sanitation: layout grounds must stay light (house rule — the
   artwork is multiply-blended dark ink), inks dark, all values real hex. ---- */
const HEX = /^#[0-9a-fA-F]{6}$/;
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}
export function sanitizePalettes(raw: unknown): LayoutPalette[] {
  if (!Array.isArray(raw)) return [];
  const out: LayoutPalette[] = [];
  for (const p of raw.slice(0, 6)) {
    const o = (p || {}) as Record<string, unknown>;
    const bg = String(o.bg || ""), ink = String(o.ink || ""), acc = String(o.acc || o.accent || "");
    if (!HEX.test(bg) || !HEX.test(ink) || !HEX.test(acc)) continue;
    if (luminance(bg) < 0.55) continue; // ground must be light
    if (luminance(ink) > 0.4) continue; // ink must be dark enough to read
    out.push({ bg: bg.toUpperCase(), ink: ink.toUpperCase(), acc: acc.toUpperCase() });
  }
  return out;
}

export function sanitizeLayoutType(raw: unknown): LayoutType | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const display = String(o.display || "");
  if (!(TYPE_DISPLAYS as readonly string[]).includes(display)) return null;
  const cs = String(o.case || "mixed");
  return {
    display: display as TypeDisplay,
    case: cs === "caps" || cs === "lower" ? cs : "mixed",
  };
}
export function sanitizeComposition(raw: unknown): LayoutComposition | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const a = String(o.alignment || "");
  return a === "centered" || a === "left" || a === "mixed" ? { alignment: a } : null;
}

export interface StyleLayoutHints {
  palettes: { bg: string; ink: string; sub: string; acc: string }[];
  type?: LayoutType | null;
  composition?: LayoutComposition | null;
}

/** Layout hints for the client SVG engine: per-style palette chords (with a
    muted secondary ink computed by blending ink toward the ground) plus the
    boards' typography character and composition preference. */
export function layoutHintsFrom(
  profiles: Record<string, StyleProfile>
): Record<string, StyleLayoutHints> {
  const mix = (a: string, b: string, t: number) => {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (sh: number) =>
      Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
    return (
      "#" + [16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, "0")).join("").toUpperCase()
    );
  };
  const out: Record<string, StyleLayoutHints> = {};
  for (const [style, prof] of Object.entries(profiles)) {
    const pals = prof.layout?.palettes;
    if (!pals?.length) continue;
    out[style] = {
      palettes: pals.map((p) => ({ bg: p.bg, ink: p.ink, sub: mix(p.ink, p.bg, 0.45), acc: p.acc })),
      type: prof.layout?.type ?? null,
      composition: prof.layout?.composition ?? null,
    };
  }
  return out;
}

/* chat/completions with 429 retry — the vision TPM window resets within a
   minute and the error message names its own wait time. */
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

/* Vision pass: study the reference board and derive the variety recipes.
   The model returns strict JSON; we validate shape before storing.

   Owner rules (2026-08-13) baked into the instruction:
   - references are a VISUAL-LANGUAGE source only — recipes must never name or
     describe specific subjects, objects, figures or scenes from the boards
     (the subject always comes from the winemaker's brief);
   - 6-8 art directions per style so consecutive generations differ visibly;
   - the same boards also yield layout palettes (light grounds only). */
export async function analyzeStyle(style: string): Promise<StyleProfile> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set — analysis needs the vision model");
  const refs = await listRefs(style);
  if (!refs.length) throw new Error("upload at least one reference image first");

  const images = refs
    .slice(0, 12)
    .map((r) => refDataUrl(r))
    .filter(Boolean) as string[];

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
            "You are an art director building a wine-label illustration system. " +
            "Study the reference images as ONE style board and distill its VISUAL LANGUAGE. " +
            "Return strict JSON: " +
            '{"summary": string (2-3 sentences on the shared artistic language), ' +
            '"charter": string (60-120 words, ONE dense paragraph of the board\'s shared visual DNA, ' +
            "written as a direct instruction to an illustrator: line quality and stroke character, " +
            "texture and surface, shading technique, how colour/ink is applied, the printing or tool " +
            "feel, degree of abstraction vs realism, how negative space is used, characteristic " +
            "imperfections. Pure technique — no subjects, no objects, no scenes), " +
            '"variants": [6-8 items, each {"label": short name, ' +
            '"language": a SELF-CONTAINED 40-70 word paragraph, written as a direct instruction to an ' +
            "illustrator, describing this direction's complete visual language: medium and tool, line " +
            "quality, texture, shading, how ink/colour is applied, degree of abstraction, negative " +
            "space, characteristic imperfections. Each variant mirrors ONE distinct cluster of images " +
            "on the board and must be SO different from the other variants that a viewer would assume " +
            'different artists made them, ' +
            '"medium": short technique summary of the same direction (one phrase), ' +
            '"composition": compositional doctrine phrase (framing, density, scale — never a specific scene), ' +
            '"mood": mood phrase, ' +
            '"palette": the ink/colour treatment (e.g. single sepia ink, red+black duotone)}], ' +
            '"layout": {"palettes": [3-5 items, each {"bg": hex, "ink": hex, "acc": hex} — real colour ' +
            "chords observed on the boards for label grounds, text ink and one accent; bg must always be " +
            "a light paper-like colour, ink dark], " +
            '"type": {"display": the dominant display-type character of the boards, one of ' +
            '"serif"|"sans"|"condensed"|"slab"|"script"|"poster"|"mono"|"elegant", ' +
            '"case": dominant lettering case "caps"|"lower"|"mixed"}, ' +
            '"composition": {"alignment": dominant text alignment on the boards ' +
            '"centered"|"left"|"mixed"}}. ' +
            "CRITICAL RULES: the references are a STYLE reference only, never a content reference. " +
            "Do NOT name, describe or allude to any specific subject, object, animal, plant, figure, " +
            "building, landscape, scene, symbol or distinctive shape that appears in them — in ANY " +
            "field, including labels. Labels must be 2-4 word names of the TECHNIQUE or treatment " +
            '(good: "Fine Crosshatch Engraving", "Loose Ink Wash", "Flat Riso Duotone"; bad: "Olive ' +
            'Tree", "Village Scene"). If a draft phrase names anything depictable, replace it with ' +
            "the technique it demonstrates. Every phrase must be fully subject-agnostic and reusable " +
            "for ANY subject, which is supplied separately. " +
            "The variants must SPAN THE DIVERSITY of the board — different techniques, inks, textures, " +
            "line qualities and compositional densities you actually observe, not invented ones, and " +
            "must be clearly DISTINCT from one another so consecutive generations look different. " +
            "Phrases must work inside an image-generation prompt and assume a pure white background.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `Style: ${style}. Derive the profile from these references. ` +
                "Remember: describe technique and treatment only — no nouns for anything depicted.",
            },
            // low detail: style language + palette chords survive the 512px
            // downscale, and 12 boards stay far under the vision TPM budget
            ...images.map((url) => ({ type: "image_url" as const, image_url: { url, detail: "low" as const } })),
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`vision analysis failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const parsed = JSON.parse(json.choices?.[0]?.message?.content || "{}") as {
    summary?: string;
    charter?: string;
    variants?: Partial<StyleVariant>[];
    layout?: { palettes?: unknown; type?: unknown; composition?: unknown };
  };
  const variants: StyleVariant[] = (parsed.variants || [])
    .filter((v) => v && v.medium && v.composition && v.mood)
    .slice(0, 10)
    .map((v, i) => ({
      key: `auto-${i + 1}`,
      label: String(v.label || `Variant ${i + 1}`).slice(0, 60),
      medium: String(v.medium).slice(0, 400),
      composition: String(v.composition).slice(0, 400),
      mood: String(v.mood).slice(0, 300),
      palette: String(v.palette || "").slice(0, 200),
      language: String((v as { language?: string }).language || "").slice(0, 900),
    }));
  if (!variants.length) throw new Error("analysis returned no usable variants");

  const palettes = sanitizePalettes(parsed.layout?.palettes);
  const type = sanitizeLayoutType(parsed.layout?.type);
  const composition = sanitizeComposition(parsed.layout?.composition);
  const profile: StyleProfile = {
    style,
    summary: String(parsed.summary || "").slice(0, 1000),
    charter: String(parsed.charter || "").slice(0, 1200),
    variants,
    layout: palettes.length || type || composition ? { palettes, type, composition } : null,
    refCount: refs.length,
    analyzedAt: new Date(),
  };
  const db = await getDb();
  await db
    .collection("styleProfiles")
    .updateOne({ style }, { $set: profile }, { upsert: true });
  return profile;
}
