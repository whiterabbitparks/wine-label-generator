import { getDb } from "@/lib/db";
import { STYLE_KEYS } from "@/lib/styles/catalog";

/* Art Direction config, persisted in the `settings` collection (single doc).

   Revamped 2026-08-13 (owner request): the old preset picker (5 legacy looks)
   is gone from the UI — direction now lives per CURRENT style: each of the six
   label styles gets its own plain-English rules and avoid-list, layered on top
   of the global ones. `preset` is kept in the stored shape for backwards
   compatibility but no longer drives anything. */

export interface StyleTuning {
  /** plain-English do's appended to every prompt of this style */
  rules: string;
  /** plain-English don'ts folded into this style's negative prompt */
  negative: string;
}

export interface ArtDirectionConfig {
  preset: string;
  extra: string;
  negative: string;
  template: string;
  perStyle: Record<string, StyleTuning>;
}

export const PRESET_KEYS = ["engraving", "botanical", "watercolor", "minimal", "bold"] as const;

export const DEFAULT_CONFIG: ArtDirectionConfig = {
  preset: "engraving",
  extra: "",
  negative:
    "no text, no words, no letters, no numbers, no logos, no watermark, no signature, no border or frame, not a photograph, no modern objects, no brand names, low quality, blurry, distorted, no coloured background, no dark background, no textured background, no paper texture, no gradient background, no vignette",
  template: "{medium}. Subject: {subject}. {context}{composition}. Mood: {mood}.{reference}{rules}",
  perStyle: {},
};

const DOC_ID = "art-direction";

export async function loadConfig(): Promise<ArtDirectionConfig> {
  const db = await getDb();
  const doc = await db.collection("settings").findOne({ _id: DOC_ID } as never);
  return doc ? sanitize(doc) : { ...DEFAULT_CONFIG };
}

export async function saveConfig(input: unknown): Promise<ArtDirectionConfig> {
  const cfg = sanitize(input);
  const db = await getDb();
  await db
    .collection("settings")
    .updateOne(
      { _id: DOC_ID } as never,
      { $set: { ...cfg, updatedAt: new Date() } },
      { upsert: true }
    );
  return cfg;
}

function sanitize(raw: unknown): ArtDirectionConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, fallback: string, max = 4000) =>
    typeof v === "string" ? v.slice(0, max) : fallback;
  const preset = str(r.preset, DEFAULT_CONFIG.preset, 40);
  const perStyle: Record<string, StyleTuning> = {};
  const rawPer = (r.perStyle && typeof r.perStyle === "object" ? r.perStyle : {}) as Record<
    string,
    unknown
  >;
  for (const k of STYLE_KEYS) {
    const t = (rawPer[k] && typeof rawPer[k] === "object" ? rawPer[k] : {}) as Record<
      string,
      unknown
    >;
    const rules = str(t.rules, "", 2000);
    const negative = str(t.negative, "", 2000);
    if (rules || negative) perStyle[k] = { rules, negative };
  }
  return {
    preset: (PRESET_KEYS as readonly string[]).includes(preset) ? preset : DEFAULT_CONFIG.preset,
    extra: str(r.extra, DEFAULT_CONFIG.extra),
    negative: str(r.negative, DEFAULT_CONFIG.negative),
    template: str(r.template, DEFAULT_CONFIG.template),
    perStyle,
  };
}
