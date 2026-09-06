import sharp from "sharp";
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db";
import { generateImageRawWithRetry, imageQuality } from "@/lib/image-provider";

/* MARKETING ASSETS ENGINE (owner 2026-09-06).
   Two product shots (front + back of the real bottle, studio cutout on
   transparent ground, the customer's own label images composited by the
   model) and five style-directed lifestyle images. The label images are
   CUSTOMER-OWNED artwork and therefore may travel to the image model as
   inputs (the sketch precedent); the owner's marketing reference boards
   steer only through the derived charter — never as image inputs. */

/* ---- bottle physics ------------------------------------------------ */

export interface BottleSpec { heightCM: number; diamCM: number; shape: string }

/* real-world 750 ml bottle proportions (Bordeaux is the owner's stated
   30 cm anchor; the rest follow standard glassware specs) */
export const BOTTLE_SPECS: Record<string, BottleSpec> = {
  "Bordeaux": { heightCM: 30, diamCM: 7.6, shape: "classic Bordeaux claret bottle — straight cylindrical body, tall pronounced shoulders, medium neck" },
  "Bordeaux Prestige": { heightCM: 31.5, diamCM: 8.0, shape: "heavyweight prestige Bordeaux bottle — thick glass, broader body, high strong shoulders, deep punt" },
  "Burgundy": { heightCM: 29.5, diamCM: 8.0, shape: "classic Burgundy bottle — wider body with gently sloping shoulders that curve smoothly into the neck" },
  "Sparkling": { heightCM: 32, diamCM: 8.9, shape: "Champagne-style sparkling wine bottle — thick heavy glass, sloped shoulders, deep punt, wide body" },
  "Alsace / Rhine": { heightCM: 35, diamCM: 7.0, shape: "tall slender Alsace flute bottle — long elegant body, very gradual shoulder taper, long neck" },
  "Ice Wine": { heightCM: 32, diamCM: 5.5, shape: "slim 375 ml ice-wine flute — very slender tall body, delicate proportions" },
};

/* the owner's line-art bottle drawings double as SHAPE SPECS: they ride
   along as a second image input so the generated bottle's silhouette
   matches the chosen type exactly (owner round 14 #4 — "shape is not
   consistent"). These are product specifications, not style boards. */
const BOTTLE_SLUG: Record<string, string> = {
  "Bordeaux": "bordeaux", "Bordeaux Prestige": "bordeaux-prestige", "Burgundy": "burgundy",
  "Sparkling": "sparkling", "Alsace / Rhine": "alsace-rhine", "Ice Wine": "ice-wine",
};
function bottleShapeRef(type: string): string | null {
  const slug = BOTTLE_SLUG[type];
  if (!slug) return null;
  try {
    const p = path.join(process.cwd(), "public", "newui", "bottles", `${slug}.jpg`);
    return "data:image/jpeg;base64," + fs.readFileSync(p).toString("base64");
  } catch { return null; }
}

/* ---- liquid appearance through the glass --------------------------- */

function liquidLine(wineColour: string, glass: string): string {
  const wc = /red/i.test(wineColour) ? "red"
    : /ros[eé]|pink/i.test(wineColour) ? "rose"
    : /amber|orange/i.test(wineColour) ? "amber"
    : "white";
  const g = /olive|green/i.test(glass) ? "olive" : /amber/i.test(glass) ? "amberglass" : "clear";
  const M: Record<string, string> = {
    "red-olive": "the dark red wine inside darkens the olive-green glass almost to black — the body reads as a near-black bottle with deep green glints only where light grazes the shoulders and neck",
    "red-amberglass": "the dark red wine inside darkens the amber glass to a very deep brown-black; warm amber shows only at the thin neck and edges",
    "red-clear": "through the transparent glass the dark red wine shows as a deep garnet-ruby body, almost opaque in the middle, glowing translucent red where light passes the edges",
    "rose-olive": "the pale rosé inside deepens the olive-green glass to a dense dark green",
    "rose-amberglass": "the pale rosé inside turns the amber glass a deep warm russet",
    "rose-clear": "through the transparent glass the rosé shows as a luminous pale salmon-pink liquid",
    "amber-olive": "the amber wine inside deepens the olive-green glass moderately — a dark green-brown body, noticeably lighter than a red wine would be",
    "amber-amberglass": "the amber wine inside deepens the amber glass moderately to a rich warm honey-brown — clearly lighter than near-black",
    "amber-clear": "through the transparent glass the amber wine glows a rich honey-orange",
    "white-olive": "the pale white wine inside deepens the olive-green glass only slightly — the bottle reads as a classic dark green wine bottle",
    "white-amberglass": "the pale white wine inside keeps the amber glass a readable warm brown",
    "white-clear": "through the transparent glass the white wine shows as a pale straw-gold liquid with the fill line visible at the shoulder",
  };
  return M[`${wc}-${g}`] || M["red-clear"];
}

/* ---- closure ------------------------------------------------------- */

function closureLine(closure: string, colourCSS: string, finish: string) {
  const fin = /glossy/i.test(finish) ? "glossy" : /no cap/i.test(finish) ? "" : "matte";
  const col = colourCSS || "deep red";
  /* "CLOSURE — NON-NEGOTIABLE" + an explicit no-cork clause for non-cork
     closures: round 15 #2 — a selected screw cap still rendered as cork
     (the silhouette outline shows a corked top and was winning) */
  if (/no cap/i.test(finish))
    return "CLOSURE — NON-NEGOTIABLE: a natural cork sits flush in the bare bottle mouth — NO capsule, NO foil, the glass lip fully visible";
  switch (closure) {
    case "Screw Cap": return `CLOSURE — NON-NEGOTIABLE: a ${fin} ${col} aluminium SCREW CAP with a clean straight skirt over the bottle mouth and upper neck. There is NO cork and NO foil capsule — a screw cap only`;
    case "Wax Seal": return `CLOSURE — NON-NEGOTIABLE: the neck is hand-dipped in ${fin} ${col} sealing wax with natural drips ending just below the lip. No foil capsule`;
    case "Crown Cap": return `CLOSURE — NON-NEGOTIABLE: a ${fin} ${col} CROWN CAP (beer-style) on the bottle mouth, bare glass neck below it. There is NO cork and NO capsule`;
    case "Sparkling Cork": return `CLOSURE — NON-NEGOTIABLE: a mushroom sparkling cork under a wire cage, dressed in a ${fin} ${col} foil hood down the neck`;
    default: return `CLOSURE — NON-NEGOTIABLE: a natural cork under a ${fin} ${col} foil capsule covering the bottle lip and upper neck`;
  }
}

/* ---- label scale --------------------------------------------------- */

function scaleLine(wmm: number, hmm: number, spec: BottleSpec) {
  const pct = Math.round((hmm / 10 / spec.heightCM) * 100);
  const circ = Math.PI * spec.diamCM * 10;
  const wrap = wmm > circ * 0.62 ? " (it wraps well around the body's curve; its sides foreshorten realistically)" : "";
  return `SCALE — CRITICAL AND EXACT: the bottle is ${spec.heightCM} cm tall and ${spec.diamCM} cm wide; ` +
    `the label is exactly ${wmm} mm wide × ${hmm} mm tall, so it covers about ${pct}% of the bottle's height${wrap}. ` +
    `Keep this label-to-bottle ratio precisely realistic — never enlarge or shrink the label relative to the bottle.`;
}

/* ---- product-shot prompt ------------------------------------------- */

export interface MarketingBrief {
  bottleType: string; glassColor: string; closure: string; finish: string; closureColour: string;
  wineColour: string; wine: string;
  labelWmm: number; labelHmm: number;
  style: string;
  seed: number;
}

function bottleDescription(b: MarketingBrief) {
  const spec = BOTTLE_SPECS[b.bottleType] || BOTTLE_SPECS["Bordeaux"];
  return {
    spec,
    text:
      `${spec.shape}. ${liquidLine(b.wineColour, b.glassColor)}. ` +
      `${closureLine(b.closure, b.closureColour, b.finish)}. ` +
      scaleLine(b.labelWmm, b.labelHmm, spec),
  };
}

export function buildShotPrompt(b: MarketingBrief, side: "front" | "back", hasShape: boolean) {
  const d = bottleDescription(b);
  return (
    `Professional studio product photograph of a single wine bottle, photographed dead straight-on, ` +
    `${side === "front" ? "showing the FRONT of the bottle" : "showing the BACK of the bottle"}, the whole bottle in frame from base to closure with a small margin. ` +
    `${d.text} ` +
    `The FIRST attached image is the wine's ${side} label — apply it to the bottle EXACTLY as given: identical layout, typography, artwork and colours, ` +
    `perfectly legible, wrapped naturally onto the glass curvature with subtle realistic paper sheen. Do NOT redraw, reinterpret, crop or add any text. ` +
    (hasShape
      ? `The SECOND attached image is a technical outline drawing of this exact bottle model — match its GLASS silhouette, proportions, shoulder curve and neck length PRECISELY, but render a real photographed glass bottle, never a drawing. IGNORE the closure/top drawn in the outline — the closure is specified above and OVERRIDES the drawing. `
      : "") +
    `Lighting: crisp premium studio softbox lighting, elegant vertical highlights along the glass, true colours, razor-sharp focus. ` +
    `CUTOUT: pure transparent background, no surface, no table, no cast shadow, no glow or halo around the silhouette — a clean isolated product cutout.`
  );
}

/* ---- lifestyle ------------------------------------------------------ */

const SCENARIOS: [string, string][] = [
  ["sommelier", "a sommelier in service attire presents the bottle to camera, holding it label-forward at chest height — framed from the shoulders down, no face visible"],
  ["pour", "wine is being poured from the bottle into a glass beside it (hands only), the label facing camera, motion caught mid-pour"],
  ["grapes", "a close-up of the label while the bottle rests among fresh wine grapes and vine leaves"],
  ["cellar", "the bottle stands label-forward on a wine cellar shelf among other (blurred, anonymous) bottles"],
  ["table", "the bottle on a set dining table with a filled glass, inviting atmosphere, label facing camera"],
  ["terrace", "the bottle and a glass on a table outdoors in low golden-hour light, vineyard softly blurred behind"],
  ["hand", "a hand lifts the bottle towards camera, label perfectly readable, shallow depth of field"],
  ["crate", "the bottle leans against a wooden harvest crate, label to camera, a few grapes scattered around"],
];

const STYLE_WORLD: Record<string, string> = {
  traditional:
    "Setting and styling are CLASSIC and timeless: old-world wine estate atmosphere — aged oak, stone, linen, brass, candle-warm or soft window light, refined understated elegance, nothing modern or flashy.",
  contemporary:
    "Setting and styling are CONTEMPORARY and minimal: clean modern spaces, simple architectural surfaces, uncluttered composition, generous negative space, calm natural daylight, editorial restraint.",
  punk:
    "Setting and styling are RAW and natural: candid unpolished scenes, natural-wine bar energy, honest daylight, real textures — concrete, worn wood, skin, paper — nothing staged-looking, a free documentary feel.",
};

export function buildLifestylePrompt(b: MarketingBrief, scenario: string, charter: string, hasShape: boolean) {
  const d = bottleDescription(b);
  return (
    `Photorealistic promotional lifestyle photograph for a wine brand: ${scenario}. ` +
    `${STYLE_WORLD[b.style] || STYLE_WORLD.contemporary} ` +
    (charter ? `Art director's world notes for this brand (follow their spirit): ${charter} ` : "") +
    `The wine bottle: ${d.text} ` +
    `The FIRST attached image is the wine's front label — it appears on the bottle EXACTLY as given, legible and true to its colours; never redraw or replace it. ` +
    (hasShape
      ? `The SECOND attached image is a technical outline of this exact bottle model — the bottle in the photo matches that GLASS silhouette and its proportions precisely (the closure drawn in the outline is irrelevant; the closure specified above overrides it). `
      : "") +
    `PEOPLE (house rule): never show a human face — any person appears from behind, framed below the shoulders, or as hands only. ` +
    `Shot on professional camera, beautiful natural light for the scene, crisp focus on the bottle and label. Square composition. No added text, no watermarks, no logos other than the label itself.`
  );
}

/* seeded scenario deal — full coverage before repeats, stable per seed */
export function dealScenarios(seed: number): [string, string][] {
  const arr = [...SCENARIOS];
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr.slice(0, 5);
}

/* ---- final sizing --------------------------------------------------- */

/* Product shots: final deliverable wants the BOTTLE ITSELF 2500 px tall.
   The model outputs 1024×1536; we measure the bottle's alpha bounding box
   and resize so that box is 2500 px (dev tier skips the upscale). */
async function sizeShot(dataUrl: string, final: boolean): Promise<string> {
  if (!final) return dataUrl;
  try {
    const b64 = dataUrl.split(",")[1];
    const png = PNG.sync.read(Buffer.from(b64, "base64"));
    let y0 = png.height, y1 = -1;
    for (let y = 0; y < png.height; y++)
      for (let x = 0; x < png.width; x++)
        if (png.data[(y * png.width + x) * 4 + 3] > 16) { if (y < y0) y0 = y; y1 = y; break; }
    const bottleH = y1 > y0 ? y1 - y0 : png.height;
    const scale = 2500 / bottleH;
    const out = await sharp(Buffer.from(b64, "base64"))
      .resize(Math.round(png.width * scale), Math.round(png.height * scale), { kernel: "lanczos3" })
      .png().toBuffer();
    return "data:image/png;base64," + out.toString("base64");
  } catch { return dataUrl; }
}

async function sizeLifestyle(dataUrl: string, final: boolean): Promise<string> {
  if (!final) return dataUrl;
  try {
    const b64 = dataUrl.split(",")[1];
    const out = await sharp(Buffer.from(b64, "base64")).resize(2500, 2500, { fit: "cover", kernel: "lanczos3" }).jpeg({ quality: 90 }).toBuffer();
    return "data:image/jpeg;base64," + out.toString("base64");
  } catch { return dataUrl; }
}

async function previewOf(dataUrl: string): Promise<string> {
  try {
    const b64 = dataUrl.split(",")[1];
    const out = await sharp(Buffer.from(b64, "base64")).resize(700, 700, { fit: "inside" }).png().toBuffer();
    return "data:image/png;base64," + out.toString("base64");
  } catch { return dataUrl; }
}

/* ---- orchestrator --------------------------------------------------- */

export interface AssetEvent {
  type: "progress" | "shot" | "life" | "error";
  stage?: string; side?: "front" | "back"; i?: number;
  image?: string; preview?: string; error?: string;
}

export async function generateMarketingAssets(
  b: MarketingBrief,
  frontLabel: string,
  backLabel: string | null,
  send: (e: AssetEvent) => void
): Promise<void> {
  const final = imageQuality() === "prod";
  let charter = "";
  try {
    const db = await getDb();
    const c = (await db.collection("settings").findOne({ _id: `marketing-charter-${b.style}` } as never)) as { text?: string } | null;
    charter = c?.text || "";
  } catch { /* charter is optional */ }

  /* the owner's line-art drawing of the chosen bottle rides along as a
     silhouette spec (round 14 #4) */
  const shape = bottleShapeRef(b.bottleType);

  /* sequential on purpose: OpenAI allows ~5 images/min — the retry absorbs
     the occasional 429, and the stream keeps the page honest meanwhile */
  send({ type: "progress", stage: "front shot" });
  const front = await generateImageRawWithRetry({
    prompt: buildShotPrompt(b, "front", !!shape),
    references: shape ? [frontLabel, shape] : [frontLabel], transparent: true, size: { w: 1024, h: 1536 },
  });
  const frontSized = await sizeShot(front, final);
  send({ type: "shot", side: "front", image: frontSized, preview: await previewOf(front) });

  if (backLabel) {
    send({ type: "progress", stage: "back shot" });
    const back = await generateImageRawWithRetry({
      prompt: buildShotPrompt(b, "back", !!shape),
      references: shape ? [backLabel, shape] : [backLabel], transparent: true, size: { w: 1024, h: 1536 },
    });
    send({ type: "shot", side: "back", image: await sizeShot(back, final), preview: await previewOf(back) });
  }

  const scenarios = dealScenarios(b.seed);
  for (let i = 0; i < scenarios.length; i++) {
    send({ type: "progress", stage: `lifestyle ${i + 1}/5` });
    try {
      const img = await generateImageRawWithRetry({
        prompt: buildLifestylePrompt(b, scenarios[i][1], charter, !!shape),
        references: shape ? [frontLabel, shape] : [frontLabel], size: { w: 1024, h: 1024 },
      });
      send({ type: "life", i, image: await sizeLifestyle(img, final), preview: await previewOf(img) });
    } catch (e) {
      /* one failed lifestyle image must not sink the set */
      send({ type: "error", i, error: e instanceof Error ? e.message : String(e) });
    }
  }
}
