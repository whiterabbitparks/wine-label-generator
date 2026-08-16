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

export const STYLE_KEYS = ["traditional", "contemporary", "punk"] as const;
export type StyleKey = (typeof STYLE_KEYS)[number];

const MULTIPLY = { blend: "multiply" as const };

const RAW_CATALOG: StyleDef[] = [
  {
    key: "traditional",
    name: "Traditional",
    // Reference set (2026-08-11): classic French labels — single-ink engravings
    // of estates, vineyards and trees on cream papers; the ink itself varies
    // (sepia, black, oxblood, slate blue) which is where colour variety lives.
    subStyles: [
      {
        key: "chateau-engraving",
        label: "Château engraving",
        medium:
          "a classical copperplate engraving of a wine estate with its vineyard, extremely fine parallel hatching and stipple, in a single deep sepia-brown ink",
        composition:
          "the estate centred like on a vintage Bordeaux label, wide sky above and vine rows in the foreground, no lettering and no border",
        mood: "heritage, established, dignified; one ink colour only on pure white",
      },
      {
        key: "vineyard-etching",
        label: "Vineyard panorama etching",
        medium:
          "a panoramic etching of rolling vineyard hills with distant mountains, delicate line work and cross-hatching, in a single black ink",
        composition:
          "a wide horizontal landscape band, horizon in the upper third, vine rows leading the eye, no lettering and no border",
        mood: "timeless, calm, expansive; one ink colour only on pure white",
      },
      {
        key: "oxblood-tree",
        label: "Oxblood tree engraving",
        medium:
          "a majestic old vine or lone tree rendered as a detailed engraving in a single oxblood red ink, every branch and leaf hatched by hand",
        composition:
          "one grand centred tree filling the frame like a monument, bare ground beneath, no lettering and no border",
        mood: "rooted, proud, monumental; one deep red ink only on pure white",
      },
      {
        key: "slate-village",
        label: "Slate-blue village etching",
        medium:
          "an old-world village or church among vineyards etched in a single slate-blue ink, fine steel-engraving lines",
        composition:
          "the village centred with vineyard rows around it, airy sky, no lettering and no border",
        mood: "storied, provincial, serene; one blue-grey ink only on pure white",
      },
      {
        key: "heraldic-crest",
        label: "Heraldic crest",
        medium:
          "an engraved heraldic wine crest with grape clusters, vine leaves, ribbons and scrollwork, in a single black ink with fine hatching",
        composition:
          "one ornate symmetrical emblem centred with generous empty margins, no lettering inside the ribbons and no border",
        mood: "noble, ceremonial, exacting; one ink colour only on pure white",
      },
    ],
    focus: {
      guidance:
        "Keep the main subject fully inside the upper half of the image; toward every edge the scene must dissolve into quiet, expendable surroundings (sky, mist, ground) that can fade away without losing anything important.",
      clearZone: [0.05, 0.6, 0.9, 0.38],
    },
    treatment: MULTIPLY,
  },
  {
    key: "contemporary",
    name: "Contemporary",
    // References: flat saturated colour fields, Matisse-like cut-out shapes,
    // gradient horizon bands, one giant playful motif; colour IS the design.
    subStyles: [
      {
        key: "cutout",
        label: "Paper cut-out shapes",
        medium:
          "a Matisse-style paper cut-out composition of bold organic shapes in flat saturated colours — coral red, teal, mustard, cobalt — with crisp edges",
        composition:
          "two or three large overlapping organic shapes centred in a wide band, plenty of breathing room, no lettering and no border",
        mood: "confident, modern, joyful; flat colour on pure white",
      },
      {
        key: "horizon",
        label: "Gradient horizon",
        medium:
          "a minimal abstract landscape of smooth horizontal colour bands like a sunset over the sea — apricot, rose, deep terracotta, dusk blue — softly graded",
        composition:
          "calm horizontal bands with a low sun disc, nothing else, no lettering and no border",
        mood: "serene, atmospheric, contemporary; soft flat gradients on pure white",
      },
      {
        key: "motif",
        label: "One giant motif",
        medium:
          "one oversized playful flat illustration — a sun, an eye, a grape cluster or a moon — drawn with bold simple shapes in two or three saturated colours",
        composition:
          "a single huge centred motif dominating the frame with generous empty space around it, no lettering and no border",
        mood: "iconic, punchy, friendly; flat colour on pure white",
      },
      {
        key: "geometric",
        label: "Geometric abstraction",
        medium:
          "a modern flat geometric abstraction of circles, arcs and diagonal fields in a limited bold palette — tomato red, cobalt, cream, forest green",
        composition:
          "an asymmetric arrangement weighted to one side within a wide band, no lettering and no border",
        mood: "architectural, assured, gallery-like; flat colour on pure white",
      },
    ],
    focus: {
      guidance:
        "Compose the subject within a wide horizontal band; keep the top edge of the image quiet and low-detail (a name may overprint it in white) and leave the lower part of the scene calm so nothing important is lost where the band crops.",
      clearZone: [0.04, 0.55, 0.92, 0.45],
    },
    treatment: MULTIPLY,
  },
  {
    key: "flora",
    name: "Flora & Fauna",
    // References: bold woodcut animals in red or black ink, naturalist plates,
    // loose brush creatures — the animal is the label.
    subStyles: [
      {
        key: "woodcut-red",
        label: "Red woodcut animal",
        medium:
          "a bold woodcut print of a single animal — bull, ram, boar, hare or rooster — carved with confident rough strokes in a single vermilion red ink",
        composition:
          "the animal in profile filling the centre, strong silhouette, coarse carved texture, no lettering and no border",
        mood: "primal, honest, striking; one red ink only on pure white",
      },
      {
        key: "woodcut-black",
        label: "Black linocut animal",
        medium:
          "a black linocut print of a single wild animal with rough hand-carved edges and strong negative space",
        composition:
          "one centred animal, bold and graphic, no lettering and no border",
        mood: "wild, graphic, fearless; one black ink only on pure white",
      },
      {
        key: "naturalist-plate",
        label: "Naturalist plate",
        medium:
          "a vintage naturalist field-guide illustration of a bird or plant, delicate watercolour and fine ink outline, muted natural colours",
        composition:
          "the specimen centred like a museum plate with airy margins, no lettering and no border",
        mood: "curious, scholarly, gentle; soft colour on pure white",
      },
      {
        key: "brush-beast",
        label: "Brush-ink creature",
        medium:
          "a loose expressive brush-and-ink painting of an animal in two colours — black with one warm accent — fast confident strokes",
        composition:
          "the creature mid-movement, centred, with splatter kept away from the edges, no lettering and no border",
        mood: "alive, spontaneous, artisanal; ink on pure white",
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
    // References: ivory stock, gold foil, engraved crests, giant overlapping
    // numerals, copper animals — restraint plus one precious material.
    subStyles: [
      {
        key: "gold-crest",
        label: "Gold-line crest",
        medium:
          "an exquisite heraldic crest or monogram drawn purely in thin antique-gold lines, jewel-like precision, as if gold-foiled",
        composition:
          "one small refined emblem centred with vast empty margins, no lettering and no border",
        mood: "luxurious, restrained, precise; antique gold line art only on pure white",
      },
      {
        key: "copper-beast",
        label: "Copper engraved animal",
        medium:
          "a noble animal — stag, ram, eagle or lion — engraved in fine lines of warm copper-bronze ink, aristocratic and exact",
        composition:
          "the animal small and centred like a seal, wide quiet margins on all sides, no lettering and no border",
        mood: "stately, heirloom, exact; one copper ink only on pure white",
      },
      {
        key: "fine-etching",
        label: "Fine-line etching",
        medium:
          "an ultra-fine copperplate etching illustration with hair-thin lines and jewel-like precision, single dark ink",
        composition:
          "a small, exquisitely detailed centred emblem-like subject surrounded by wide empty space, no lettering and no border",
        mood: "luxurious, restrained, precise; single dark ink on pure white",
      },
      {
        key: "emboss-tone",
        label: "Embossed tone-on-tone",
        medium:
          "an emblem drawn in the palest warm-grey lines as if blind-embossed into paper, barely-there tone-on-tone relief",
        composition:
          "one delicate centred emblem with vast white space, no lettering and no border",
        mood: "whisper-quiet luxury; near-white on pure white",
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
    // References: near-empty labels with one small mark — a dot, a blob, a
    // tiny creature — occasionally in one saturated accent colour.
    subStyles: [
      {
        key: "tiny-mark",
        label: "One tiny mark",
        medium:
          "a single small abstract mark — a painted dot, a torn-paper blob or a brush stroke — in one saturated colour: coral red, cobalt blue or black",
        composition:
          "one small mark alone in a vast empty field, perfectly balanced, no lettering and no border",
        mood: "quiet, assured, gallery-white; one colour only on pure white",
      },
      {
        key: "micro-line",
        label: "Micro line icon",
        medium:
          "a minimal single-line icon drawn with one thin continuous stroke — a hill, a wave, a leaf or a bottle",
        composition:
          "one tiny centred mark floating in vast white space, no lettering and no border",
        mood: "precise, calm, effortless; one thin line on pure white",
      },
      {
        key: "little-creature",
        label: "Little creature",
        medium:
          "a very small silhouette of an animal — a bird, hare or deer — in one flat colour, simple and charming",
        composition:
          "the tiny creature placed alone with enormous empty space around it, no lettering and no border",
        mood: "subtle, witty, endearing; one colour only on pure white",
      },
    ],
    focus: {
      guidance:
        "One small, self-contained subject centred in the frame — it must sit entirely within the central third; the rest of the image stays essentially empty so the edges can fade to nothing.",
      clearZone: [0.05, 0.05, 0.9, 0.9],
    },
    treatment: MULTIPLY,
  },
  {
    key: "artistic",
    name: "Artistic / Punk",
    // References: naive one-line wine drinkers, black linocut figures, riso
    // posters in tomato/cobalt/green, crayon scribbles, loud hand lettering.
    subStyles: [
      {
        key: "naive-line",
        label: "Naive wine drinkers",
        medium:
          "a naive continuous-line ink drawing of joyful figures drinking and pouring wine, wobbly childlike lines full of charm, in a single red or blue ink",
        composition:
          "one or two loose figures with glasses and a bottle, off-kilter and alive, generous empty paper around them, no lettering and no border",
        mood: "playful, human, unpolished; one ink colour on pure white",
      },
      {
        key: "linocut-figure",
        label: "Black linocut figure",
        medium:
          "a bold black linocut of a strange wonderful figure — a person, beast or hybrid — with rough carved edges and heavy ink coverage",
        composition:
          "the figure filling the centre with raw carved texture, no lettering and no border",
        mood: "raw, mythic, fearless; solid black ink on pure white",
      },
      {
        key: "riso-poster",
        label: "Riso poster",
        medium:
          "a risograph-style poster illustration in two or three spot colours — tomato red, cobalt blue, grass green — with grainy overprint texture",
        composition:
          "one bold central scene or creature, colours slightly misregistered, no lettering and no border",
        mood: "loud, printed, underground; flat spot colours on pure white",
      },
      {
        key: "crayon",
        label: "Crayon scribble",
        medium:
          "an expressive crayon and marker drawing, scribbled fast with visible strokes in a few bright colours",
        composition:
          "one energetic centred subject drawn like a brilliant child's sketch, no lettering and no border",
        mood: "free, funny, direct; bright strokes on pure white",
      },
      {
        key: "screenprint",
        label: "Screen-print animal",
        medium:
          "a high-contrast screen-print of an animal in one loud colour with visible print grain and rough registration",
        composition:
          "a strong centred animal composition with confident shapes, no lettering and no border",
        mood: "expressive, contemporary, punchy; one loud ink on pure white",
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

/* 3 public styles (owner, 2026-08-14 restart): Contemporary absorbs the old
   contemporary + flora + premium + minimalist art-direction pools; Punk is
   the old artistic. The RAW six-style entries above stay as the source. */
function rawByKey(k: string): StyleDef {
  const d = RAW_CATALOG.find((s) => s.key === k);
  if (!d) throw new Error("missing raw style " + k);
  return d;
}
export const DEFAULT_CATALOG: StyleDef[] = [
  rawByKey("traditional"),
  {
    key: "contemporary",
    name: "Contemporary",
    subStyles: ["contemporary", "flora", "premium", "minimalist"].flatMap(
      (k) => rawByKey(k).subStyles
    ),
    focus: rawByKey("contemporary").focus,
    treatment: { blend: "multiply" },
  },
  { ...rawByKey("artistic"), key: "punk", name: "Punk" },
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
