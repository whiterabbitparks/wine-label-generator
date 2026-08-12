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
}

export interface StyleProfile {
  style: string;
  summary: string;
  variants: StyleVariant[];
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

/* Vision pass: study the reference board and derive the variety recipes.
   The model returns strict JSON; we validate shape before storing. */
export async function analyzeStyle(style: string): Promise<StyleProfile> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set — analysis needs the vision model");
  const refs = await listRefs(style);
  if (!refs.length) throw new Error("upload at least one reference image first");

  const images = refs
    .slice(0, 8)
    .map((r) => refDataUrl(r))
    .filter(Boolean) as string[];

  const model = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
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
            "Study the reference images as ONE style board. Return strict JSON: " +
            '{"summary": string (2-3 sentences on the shared artistic language), ' +
            '"variants": [4-6 items, each {"label": short name, "medium": detailed medium/technique phrase, ' +
            '"composition": compositional doctrine phrase, "mood": mood/palette phrase, ' +
            '"palette": the ink/colour treatment (e.g. single sepia ink, red+black duotone)}]}. ' +
            "The variants must SPAN THE DIVERSITY of the board — different techniques, inks and " +
            "compositions you actually observe, not invented ones. Phrases must work inside an " +
            "image-generation prompt and assume a pure white background.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Style: ${style}. Derive the profile from these references.` },
            ...images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`vision analysis failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const parsed = JSON.parse(json.choices?.[0]?.message?.content || "{}") as {
    summary?: string;
    variants?: Partial<StyleVariant>[];
  };
  const variants: StyleVariant[] = (parsed.variants || [])
    .filter((v) => v && v.medium && v.composition && v.mood)
    .slice(0, 8)
    .map((v, i) => ({
      key: `auto-${i + 1}`,
      label: String(v.label || `Variant ${i + 1}`).slice(0, 60),
      medium: String(v.medium).slice(0, 400),
      composition: String(v.composition).slice(0, 400),
      mood: String(v.mood).slice(0, 300),
      palette: String(v.palette || "").slice(0, 200),
    }));
  if (!variants.length) throw new Error("analysis returned no usable variants");

  const profile: StyleProfile = {
    style,
    summary: String(parsed.summary || "").slice(0, 1000),
    variants,
    refCount: refs.length,
    analyzedAt: new Date(),
  };
  const db = await getDb();
  await db
    .collection("styleProfiles")
    .updateOne({ style }, { $set: profile }, { upsert: true });
  return profile;
}
