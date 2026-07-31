import { getDb } from "@/lib/db";

/* The Style Catalog — the creative brain of per-style image generation.
   One entry per label style (keys MUST match LabelEngine.STYLE_LIST in
   8k-labels-package/src/label-engine.js). Each style owns:
     - subStyles: fixed art directions; one is picked per generation (seeded)
       so the same brief can yield e.g. Traditional-engraving today and
       Traditional-pencil after a shuffle.
     - focus: v1 focus-area contract. `guidance` is baked into every prompt
       (keep the subject where layout text won't sit); `clearZone` describes
       the label region reserved for text in fractional units so a future v2
       (subject detection + automatic placement) can consume it.
     - treatment: how the engine renders the image (blend mode today).
   The defaults below are PLACEHOLDERS pending the owner's style reference
   PDFs — replacing them is a data edit (or /admin later), not a code change.
   When Mongo is up, a `settings/style-catalog` doc overrides these defaults. */

export interface SubStyle {
  key: string;
  label: string;
  /** prompt fragments, same roles as the original PRESETS */
  medium: string;
  composition: string;
  mood: string;
}

export interface FocusSpec {
  /** plain-English spatial instruction appended to every prompt for this style */
  guidance: string;
  /** region reserved for layout text, fractions of label [x, y, w, h] — v2 input */
  clearZone: [number, number, number, number];
}

export interface StyleDef {
  key: string;
  name: string;
  subStyles: SubStyle[];
  focus: FocusSpec;
  treatment: { blend: "multiply" | "normal" };
}

export const STYLE_KEYS = [
  "traditional",
  "contemporary",
  "flora",
  "premium",
  "minimalist",
  "artistic",
] as const;
export type StyleKey = (typeof STYLE_KEYS)[number];

const MULTIPLY = { blend: "multiply" as const };

export const DEFAULT_CATALOG: StyleDef[] = [
  {
    key: "traditional",
    name: "Traditional",
    subStyles: [
      {
        key: "engraving",
        label: "Vintage engraving",
        medium:
          "a fine, detailed vintage engraving and etching illustration with cross-hatching and delicate line work",
        composition:
          "a single centred subject with clean negative space around it, designed as a wine-label illustration, no lettering and no border",
        mood: "elegant, heritage, timeless; monochrome ink on cream paper",
      },
      {
        key: "pencil",
        label: "Pencil drawing",
        medium:
          "a classical graphite pencil drawing with soft shading, precise contours and subtle paper grain",
        composition:
          "a single centred subject with generous negative space, drawn as a wine-label illustration, no lettering and no border",
        mood: "quiet, refined, hand-made; warm grey graphite on cream paper",
      },
      {
        key: "woodcut",
        label: "Woodcut print",
        medium:
          "a traditional woodcut print illustration with bold carved lines and honest, rustic texture",
        composition:
          "a strong centred subject with simple negative space, cut as a wine-label illustration, no lettering and no border",
        mood: "earthy, rooted, timeless; single dark ink on cream paper",
      },
    ],
    focus: {
      guidance:
        "Keep the main subject fully inside the central band of the image; the top and bottom edges must stay quiet, with only sky, ground or neutral texture that text can safely overlap.",
      clearZone: [0.1, 0.62, 0.8, 0.33],
    },
    treatment: MULTIPLY,
  },
  {
    key: "contemporary",
    name: "Contemporary",
    subStyles: [
      {
        key: "geometric",
        label: "Geometric abstraction",
        medium:
          "a modern flat geometric illustration built from a few clean shapes and confident colour fields",
        composition:
          "an asymmetric composition weighted to one side, leaving a calm structured area of flat colour, no lettering and no border",
        mood: "contemporary, architectural, assured; limited fresh palette",
      },
      {
        key: "collage",
        label: "Narrative collage",
        medium:
          "a contemporary narrative paper-collage illustration with torn edges and layered textures",
        composition:
          "an off-centre scene with layered depth, leaving one visually quiet region of flat paper, no lettering and no border",
        mood: "playful, storytelling, modern craft; warm tactile palette",
      },
      {
        key: "duotone",
        label: "Bold duotone",
        medium:
          "a bold two-colour screen-print style illustration with high contrast and visible print grain",
        composition:
          "a strong graphic subject placed off-centre with a large flat colour field beside it, no lettering and no border",
        mood: "punchy, urban, confident; exactly two inks",
      },
    ],
    focus: {
      guidance:
        "Place the main subject off-centre so a large flat, low-detail colour field remains on one side; that quiet field is where text will sit and may overlap it freely.",
      clearZone: [0.0, 0.05, 0.55, 0.9],
    },
    treatment: MULTIPLY,
  },
  {
    key: "flora",
    name: "Flora & Fauna",
    subStyles: [
      {
        key: "botanical",
        label: "Botanical line art",
        medium:
          "a delicate botanical line-art illustration with thin, even strokes in a herbarium style",
        composition:
          "a centred plant, vine or leaf motif with airy negative space, no lettering and no border",
        mood: "organic, natural and refined",
      },
      {
        key: "watercolour-botanical",
        label: "Watercolour botanical",
        medium:
          "a soft watercolour botanical illustration with gentle washes, fine veining and subtle paper texture",
        composition:
          "a centred natural motif with light, airy margins, no lettering and no border",
        mood: "romantic and artisanal, muted natural palette",
      },
      {
        key: "ink-fauna",
        label: "Ink animal study",
        medium:
          "a detailed ink study of an animal in a naturalist field-guide style with fine hatching",
        composition:
          "a single centred animal subject surrounded by sparse botanical sprigs and calm negative space, no lettering and no border",
        mood: "curious, noble, naturalist; single ink on warm paper",
      },
    ],
    focus: {
      guidance:
        "Centre the living subject and keep all edges of the image airy and sparse — only thin stems or empty paper near the borders, safe for text to overlap.",
      clearZone: [0.1, 0.66, 0.8, 0.3],
    },
    treatment: MULTIPLY,
  },
  {
    key: "premium",
    name: "Premium",
    subStyles: [
      {
        key: "fine-etching",
        label: "Fine-line etching",
        medium:
          "an ultra-fine copperplate etching illustration with hair-thin lines and jewel-like precision",
        composition:
          "a small, exquisitely detailed centred emblem-like subject surrounded by wide empty space, no lettering and no border",
        mood: "luxurious, restrained, precise; single dark ink on ivory",
      },
      {
        key: "charcoal",
        label: "Charcoal tonal",
        medium:
          "a rich tonal charcoal drawing with deep velvety darks and soft gradations",
        composition:
          "a dignified centred subject emerging from shadow with wide quiet margins, no lettering and no border",
        mood: "deep, quiet, expensive; near-black on warm ivory",
      },
    ],
    focus: {
      guidance:
        "Render the subject small and centred like an emblem, surrounded by wide, completely empty margins on all sides where text will sit.",
      clearZone: [0.08, 0.55, 0.84, 0.4],
    },
    treatment: MULTIPLY,
  },
  {
    key: "minimalist",
    name: "Minimalist",
    subStyles: [
      {
        key: "single-line",
        label: "Single-line icon",
        medium:
          "a minimal single-line icon illustration, geometric and made of just a few continuous strokes",
        composition:
          "one simple centred mark with generous negative space, no lettering and no border",
        mood: "modern, understated and clean",
      },
      {
        key: "geometric-mark",
        label: "Geometric mark",
        medium:
          "a minimal geometric mark built from two or three basic shapes with mathematical balance",
        composition:
          "one small centred symbol floating in vast empty space, no lettering and no border",
        mood: "precise, calm, timeless; one or two inks at most",
      },
    ],
    focus: {
      guidance:
        "The mark must occupy only the central third of the image; everything else is empty background that text may cover.",
      clearZone: [0.05, 0.05, 0.9, 0.9],
    },
    treatment: MULTIPLY,
  },
  {
    key: "artistic",
    name: "Artistic / Punk",
    subStyles: [
      {
        key: "punk-collage",
        label: "Punk xerox collage",
        medium:
          "a raw punk photocopy-collage illustration with ripped paper, high-contrast xerox texture and hand-cut shapes",
        composition:
          "an energetic off-centre subject with rough edges, leaving one chaotic-but-low-detail zone for overprinting, no lettering and no border",
        mood: "rebellious, loud, DIY; stark black with one shock colour",
      },
      {
        key: "expressive-brush",
        label: "Expressive brush",
        medium:
          "an expressive gestural brush-and-ink painting with fast, confident strokes and splatter",
        composition:
          "a dynamic subject caught mid-motion, with one side of the canvas left as raw open texture, no lettering and no border",
        mood: "visceral, free, artistic; ink on rough paper",
      },
      {
        key: "screenprint",
        label: "Screen-print poster",
        medium:
          "a bold, high-contrast graphic illustration in a screen-print poster style with a limited palette",
        composition:
          "a strong centred composition with confident shapes, no lettering and no border",
        mood: "expressive, contemporary and punchy",
      },
    ],
    focus: {
      guidance:
        "Let the subject be bold and expressive but keep one region of the image as raw low-detail texture where heavy type can be overprinted without hiding anything important.",
      clearZone: [0.0, 0.6, 1.0, 0.4],
    },
    treatment: MULTIPLY,
  },
];

const DOC_ID = "style-catalog";

/** Load the catalog: Mongo override when available, code defaults otherwise.
    Never throws — generation must work with no DB configured. */
export async function loadCatalog(): Promise<StyleDef[]> {
  try {
    const db = await getDb();
    const doc = await db.collection("settings").findOne({ _id: DOC_ID } as never);
    const stored = (doc as { styles?: StyleDef[] } | null)?.styles;
    if (Array.isArray(stored) && stored.length) {
      // merge: stored styles win by key, defaults fill any missing style
      const byKey = new Map(stored.map((s) => [s.key, s]));
      return DEFAULT_CATALOG.map((d) => byKey.get(d.key) ?? d);
    }
  } catch {
    /* DB down or not configured — defaults are the contract */
  }
  return DEFAULT_CATALOG;
}

export async function saveCatalog(styles: StyleDef[]): Promise<void> {
  const db = await getDb();
  await db
    .collection("settings")
    .updateOne(
      { _id: DOC_ID } as never,
      { $set: { styles, updatedAt: new Date() } },
      { upsert: true }
    );
}

/** Deterministic sub-style pick: same brief seed → same combination; a
    different seed re-rolls every style differently (styleIndex de-correlates
    them so all six don't step through their lists in lockstep). */
export function pickSubStyle(style: StyleDef, seed: number, styleIndex: number): SubStyle {
  const n = style.subStyles.length;
  return style.subStyles[Math.abs(seed * 31 + styleIndex * 7 + ((seed >> 3) % 5)) % n];
}
