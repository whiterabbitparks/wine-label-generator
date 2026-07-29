import fs from "node:fs";
import path from "node:path";

/* Server-side persistence for the Art Direction config.
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

const FILE = path.join(process.cwd(), "data", "art-direction.json");

export function loadConfig(): ArtDirectionConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return sanitize(raw);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(input: unknown): ArtDirectionConfig {
  const cfg = sanitize(input);
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2));
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
