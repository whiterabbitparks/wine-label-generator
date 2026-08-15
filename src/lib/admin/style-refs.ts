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
/* CLUSTER-FIRST derivation (owner GO, 2026-08-15). The old one-pass analysis
   over 12 low-res refs with a small model produced generic art-school
   category language ("bold color blocks", "soft washes") — identical across
   styles, and prompts written in stock language produce stock images. Now:
   PASS 1 (all refs, low detail): group the board into 3-6 clusters of shared
   visual language, each anchored to specific reference images.
   PASS 2 (per cluster, HIGH detail, ≤4 refs): describe THAT cluster alone as
   one art direction in concrete process language — banned-vocabulary list
   keeps it specific — explicitly distinct from directions already derived.
   PASS 3 (text): cross-style distinctness audit rewrites anything that
   overlaps another style's directions. */

const GENERIC_BAN =
  "BANNED VOCABULARY (too generic, forbidden anywhere): bold, clean, playful, " +
  "dynamic, whimsical, hand-drawn feel, minimalistic, elegant, timeless, " +
  "eye-catching, modern twist, seamless, tactile, evoke, aesthetic. " +
  "Instead name REAL processes, tools and materials: e.g. copperplate " +
  "engraving with burin hatching, riso two-pass overprint with misregistration, " +
  "dry-brush gouache on cold-press paper, chinagraph pencil, linocut with " +
  "gouge chatter, rapidograph contour, screenprint with 45lpi halftone.";

async function visionJSON(key: string, model: string, system: string, user: unknown[]): Promise<Record<string, unknown>> {
  const res = await visionFetch({
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`vision call failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return JSON.parse(json.choices?.[0]?.message?.content || "{}");
}

export async function analyzeStyle(style: string): Promise<StyleProfile> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set — analysis needs the vision model");
  const refs = await listRefs(style);
  if (!refs.length) throw new Error("upload at least one reference image first");
  const model = process.env.OPENAI_VISION_MODEL || "gpt-4o";

  const capped = refs.slice(0, 24);
  const urls = capped.map((r) => refDataUrl(r));

  // ---- PASS 1: cluster the board ----
  const p1user: unknown[] = [
    { type: "text", text: `Style "${style}": ${capped.length} wine-label reference images follow, each preceded by its number.` },
  ];
  urls.forEach((u, i) => {
    if (!u) return;
    p1user.push({ type: "text", text: `IMAGE ${i + 1}:` });
    p1user.push({ type: "image_url", image_url: { url: u, detail: "low" } });
  });
  const p1 = await visionJSON(key, model,
    "You are a printmaking connoisseur sorting a wine-label reference board. " +
    "Group the numbered images into 3-6 CLUSTERS purely by shared visual/technical " +
    "language (same printing process, ink handling, line character) — NEVER by " +
    "subject matter. Every image belongs to exactly one cluster. Return strict JSON: " +
    '{"clusters":[{"name": 2-4 word technique name, "images":[numbers], ' +
    '"hint": one sentence on what technically unites them}], ' +
    '"notes": 2 sentences on the board as a whole}. ' + GENERIC_BAN,
    p1user);
  let clusters = (Array.isArray(p1.clusters) ? p1.clusters : []) as { name?: string; images?: number[]; hint?: string }[];
  clusters = clusters.filter((c) => Array.isArray(c.images) && c.images.length).slice(0, 8);
  if (!clusters.length) clusters = [{ name: "whole board", images: capped.map((_, i) => i + 1), hint: "" }];

  // ---- PASS 2: one rich direction per cluster (high detail) ----
  const variants: StyleVariant[] = [];
  for (const [ci, cl] of clusters.entries()) {
    const clUrls = (cl.images || [])
      .map((n) => urls[n - 1])
      .filter(Boolean)
      .slice(0, 4) as string[];
    if (!clUrls.length) continue;
    const done = variants.map((v) => `"${v.label}": ${v.language?.slice(0, 90)}`).join("\n");
    const p2user: unknown[] = [
      { type: "text", text: `Cluster "${cl.name || "untitled"}" (${cl.hint || ""}) — these images only:` },
      ...clUrls.map((u) => ({ type: "image_url", image_url: { url: u, detail: "high" as const } })),
    ];
    const p2 = await visionJSON(key, model,
      "You are a master printmaker describing ONE art direction from the attached " +
      "reference images so another artist could reproduce the TECHNIQUE exactly. " +
      "Return strict JSON: " +
      '{"label": 2-4 word technique name, ' +
      '"language": 60-100 words of concrete process instruction — the exact ' +
      "process/tool (engraving, riso, linocut, gouache, marker…), line weight " +
      "behaviour, how ink sits on paper, halftone/hatching character, colour " +
      "application, registration flaws, texture of edges, what the eye notices " +
      "first. Written as imperative instructions. NEVER mention any depicted " +
      "subject, object, animal, figure or scene — technique only, reusable for " +
      "any subject, " +
      '"palette": exact ink/colour treatment seen (e.g. "single oxblood ink", "tomato red + cobalt riso"), ' +
      '"composition": framing/density doctrine (never a scene), ' +
      '"mood": 4-6 words}. ' +
      GENERIC_BAN +
      (done ? " ALREADY-DERIVED directions for this style — yours must be UNMISTAKABLY different from all of them:\n" + done : "") +
      " The artwork will be generated on a pure white background; do not mention backgrounds.",
      p2user);
    if (p2.language) {
      variants.push({
        key: `auto-${ci + 1}`,
        label: String(p2.label || cl.name || `Direction ${ci + 1}`).slice(0, 60),
        medium: String(p2.label || "").slice(0, 400),
        composition: String(p2.composition || "").slice(0, 400),
        mood: String(p2.mood || "").slice(0, 300),
        palette: String(p2.palette || "").slice(0, 200),
        language: String(p2.language).slice(0, 900),
      });
    }
  }
  if (!variants.length) throw new Error("analysis returned no usable directions");

  // ---- PASS 3: cross-style distinctness audit (text only) ----
  try {
    const others = await getProfiles();
    const foreign = Object.values(others)
      .filter((pr) => pr.style !== style && pr.variants?.length)
      .flatMap((pr) => pr.variants.map((v) => `[${pr.style}] ${v.label}: ${(v.language || v.medium || "").slice(0, 90)}`));
    if (foreign.length) {
      const audit = await visionJSON(key, model,
        "You audit art directions for a 3-style wine label system. The NEW directions " +
        "below must be unmistakably different from the OTHER STYLES' directions — no " +
        "shared signature technique vocabulary (if two directions both say 'stippling' " +
        "or 'ink wash', a blind reader could not tell the styles apart). Rewrite ONLY " +
        "the new directions that overlap, pushing them toward what makes THIS style's " +
        "references unique; keep the rest byte-identical. Return strict JSON " +
        '{"variants":[{"label","language","palette","composition","mood"} in the same order]}. ' +
        GENERIC_BAN,
        [{ type: "text", text:
          `NEW (${style}):\n` + variants.map((v) => `${v.label}: ${v.language}`).join("\n\n") +
          `\n\nOTHER STYLES:\n` + foreign.join("\n") }]);
      const rewritten = (Array.isArray(audit.variants) ? audit.variants : []) as Partial<StyleVariant>[];
      if (rewritten.length === variants.length) {
        rewritten.forEach((r, i) => {
          if (r.language) variants[i].language = String(r.language).slice(0, 900);
          if (r.label) variants[i].label = String(r.label).slice(0, 60);
          if (r.palette) variants[i].palette = String(r.palette).slice(0, 200);
          if (r.composition) variants[i].composition = String(r.composition).slice(0, 400);
          if (r.mood) variants[i].mood = String(r.mood).slice(0, 300);
        });
      }
    }
  } catch { /* audit is best-effort — clustered directions stand on their own */ }

  const profile: StyleProfile = {
    style,
    summary: String(p1.notes || "").slice(0, 1000),
    charter: "",   // per-direction language leads prompts; no shared charter to flatten them
    variants,
    layout: null,
    refCount: refs.length,
    analyzedAt: new Date(),
  };

  const db = await getDb();
  await db
    .collection("styleProfiles")
    .updateOne({ style }, { $set: profile }, { upsert: true });
  return profile;
}
