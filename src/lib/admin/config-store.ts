import { getDb } from "@/lib/db";

/* Art Direction config, persisted in the `settings` collection (single doc).
   The shape and defaults MIRROR 8k-labels-package/src/image-gen.js (ART,
   NEGATIVE_DEFAULT, TEMPLATE_DEFAULT, PRESETS keys) — keep them in sync if the
   package source changes. */

export interface ArtDirectionConfig {
  preset: string;
  extra: string;
  negative: string;
  template: string;
}

export const PRESET_KEYS = ["engraving", "botanical", "watercolor", "minimal", "bold"] as const;

export const DEFAULT_CONFIG: ArtDirectionConfig = {
  preset: "engraving",
  extra: "",
  negative:
    "no text, no words, no letters, no numbers, no logos, no watermark, no signature, no border or frame, not a photograph, no modern objects, no brand names, low quality, blurry, distorted",
  template: "{medium}. Subject: {subject}. {context}{composition}. Mood: {mood}.{reference}{rules}",
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
  return {
    preset: (PRESET_KEYS as readonly string[]).includes(preset) ? preset : DEFAULT_CONFIG.preset,
    extra: str(r.extra, DEFAULT_CONFIG.extra),
    negative: str(r.negative, DEFAULT_CONFIG.negative),
    template: str(r.template, DEFAULT_CONFIG.template),
  };
}
