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

/* ---- layout refinement feedback: approve/reject a rendered composition ---- */
export interface LayoutFeedbackDoc {
  style: string;
  variant: number;
  verdict: "approve" | "reject";
  comment: string;
  createdAt: Date;
}
export async function addLayoutFeedback(fb: Omit<LayoutFeedbackDoc, "createdAt">): Promise<void> {
  const db = await getDb();
  await db.collection("layoutFeedback").insertOne({ ...fb, createdAt: new Date() });
}
/** Per-style weight arrays for the engine: approvals boost a composition,
    rejections fade it (engine floors at 0.05 so nothing fully disappears). */
export async function layoutWeights(): Promise<Record<string, number[]>> {
  const db = await getDb();
  const rows = await db
    .collection<LayoutFeedbackDoc>("layoutFeedback")
    .find({}, { projection: { _id: 0 } })
    .toArray();
  const out: Record<string, number[]> = {};
  for (const [style, n] of Object.entries(VARIANT_COUNTS)) {
    const w = Array(n).fill(1);
    for (const r of rows) {
      if (r.style !== style || r.variant < 0 || r.variant >= n) continue;
      w[r.variant] += r.verdict === "approve" ? 1 : -0.6;
    }
    out[style] = w.map((x) => Math.max(0.05, x));
  }
  return out;
}

/** Everything the engine consumes, in setStyleHints() shape. Public read. */
export async function buildLayoutHints(): Promise<Record<string, unknown>> {
  const [profiles, weights] = await Promise.all([getLayoutProfiles(), layoutWeights()]);
  const hints: Record<string, unknown> = {};
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
    if (prof?.heroFonts?.length) entry.heroFonts = prof.heroFonts;
    const w = weights[style];
    if (w && w.some((x) => x !== 1)) entry.weights = w;
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
