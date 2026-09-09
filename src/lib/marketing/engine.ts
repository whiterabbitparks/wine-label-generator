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
  "Bordeaux": { heightCM: 30, diamCM: 7.6, shape: "classic Bordeaux claret bottle — straight cylindrical body with perfectly PARALLEL vertical sides, tall pronounced shoulders, medium neck" },
  "Bordeaux Prestige": { heightCM: 31.5, diamCM: 8.0, shape: "heavyweight prestige Bordeaux bottle — thick glass, high strong shoulders, deep punt, and a subtly TAPERED body: the sides are NEVER parallel, they narrow slightly and continuously from the shoulders down to the base (this taper is the defining difference from a standard Bordeaux)" },
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
function bottleShapeRef(type: string, closure?: string): string | null {
  const slug = BOTTLE_SLUG[type];
  if (!slug) return null;
  /* Screw Cap uses the owner's -screw outline so the drawn closure matches
     the selected one (round 17 #4; sparkling has no screw variant) */
  const screw = closure === "Screw Cap" && slug !== "sparkling";
  for (const file of [screw ? `${slug}-screw.jpg` : "", `${slug}.jpg`]) {
    if (!file) continue;
    try {
      const p = path.join(process.cwd(), "public", "newui", "bottles", file);
      return "data:image/jpeg;base64," + fs.readFileSync(p).toString("base64");
    } catch { /* try next */ }
  }
  return null;
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
    /* round 29 #3: medium-height wax, 2-3mm thick, rounded over the tip */
    case "Wax Seal": return `CLOSURE — NON-NEGOTIABLE: a ${fin} ${col} WAX SEAL of MEDIUM height — it coats the bottle mouth and the upper third of the neck (never just the tip, never the whole neck). The wax is a SUBSTANTIAL 2–3 mm thick coat that visibly ROUNDS and softens the glass tip's edges — it must never read as a thin skin tracing the sharp glass profile. Its lower edge is clean and only slightly uneven — absolutely NO drips or runs. No foil capsule`;
    /* round 29 #4: the model kept missing what a crown cap is */
    case "Crown Cap": return `CLOSURE — NON-NEGOTIABLE: a ${fin} ${col} metal CROWN CAP — the pressed-steel BEER-BOTTLE cap: a flat round top with a short crimped skirt of ~21 tiny flutes gripping the bottle lip, exactly like on a classic beer bottle. Bare glass neck below it. There is NO cork, NO capsule, NO screw threads — only this crimped beer-style cap`;
    case "Sparkling Cork": return `CLOSURE — NON-NEGOTIABLE: a mushroom sparkling cork under a wire cage, dressed in a ${fin} ${col} foil hood down the neck`;
    default: return `CLOSURE — NON-NEGOTIABLE: a natural cork under a ${fin} ${col} foil capsule covering the bottle lip and upper neck`;
  }
}

/* ---- label position (ROUND 29 #2) ----------------------------------
   Measured from the owner's charts in WAIN/Bottle types/Label positioning
   (black zone on each outline). Top-anchored bottles hang the label DOWN
   from the black zone's TOP line; bottom-anchored build it UP from the
   zone's BOTTOM line — the label's own real height decides the rest. */
const LABEL_POS: Record<string, { anchor: "top" | "bottom"; pct: number }> = {
  "Bordeaux": { anchor: "top", pct: 0.423 },
  "Bordeaux Prestige": { anchor: "top", pct: 0.433 },
  "Ice Wine": { anchor: "top", pct: 0.386 },
  "Burgundy": { anchor: "bottom", pct: 0.093 },
  "Sparkling": { anchor: "bottom", pct: 0.079 },
  "Alsace / Rhine": { anchor: "bottom", pct: 0.066 },
};

function placementLine(b: MarketingBrief, spec: BottleSpec) {
  const pos = LABEL_POS[b.bottleType] || LABEL_POS["Bordeaux"];
  const labelH = (b.labelHmm / 10).toFixed(1);
  const cm = (pos.pct * spec.heightCM).toFixed(1);
  return pos.anchor === "top"
    ? `LABEL PLACEMENT — EXACT: the label's TOP edge sits ${cm} cm below the very top of the bottle (${Math.round(pos.pct * 100)}% of its ${spec.heightCM} cm height) and the label runs DOWNWARD from that line by its real ${labelH} cm height. Anchor the TOP edge exactly there — never higher, never lower.`
    : `LABEL PLACEMENT — EXACT: the label's BOTTOM edge sits ${cm} cm above the base of the bottle (${Math.round(pos.pct * 100)}% of its ${spec.heightCM} cm height) and the label runs UPWARD from that line by its real ${labelH} cm height. Anchor the BOTTOM edge exactly there — never higher, never lower.`;
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
  /* round 21 #4: through opaque dark red wine the punt is invisible — the
     base reads as solid dark; through white/rosé/amber it shows subtly */
  const punt = /red/i.test(b.wineColour)
    ? "The punt (bottom indentation) is NOT visible through the opaque dark wine — the lower body and base read as solid dark glass with no inner base shape or glow."
    : "The punt's inner curve is subtly visible through the pale liquid at the base, as it naturally is with light wines.";
  return {
    spec,
    text:
      `${spec.shape}. ${liquidLine(b.wineColour, b.glassColor)}. ${punt} ` +
      `${closureLine(b.closure, b.closureColour, b.finish)}. ` +
      `${scaleLine(b.labelWmm, b.labelHmm, spec)} ` +
      placementLine(b, spec),
  };
}

export function buildShotPrompt(b: MarketingBrief, side: "front" | "back", hasShape: boolean, charter = "", rules?: string[]) {
  const d = bottleDescription(b);
  return (
    `Professional studio product photograph of a single wine bottle, photographed dead straight-on, ` +
    `the bottle standing PERFECTLY UPRIGHT and vertical, ` +
    `${side === "front" ? "showing the FRONT of the bottle" : "showing the BACK of the bottle"}, the whole bottle in frame from base to closure with a small margin. ` +
    (charter ? `Art director's studio notes (follow their spirit): ${charter} ` : "") +
    `${d.text} ` +
    `The FIRST attached image is the wine's ${side} label — apply it to the bottle EXACTLY as given: identical layout, typography, artwork and colours, ` +
    `perfectly legible, wrapped naturally onto the glass curvature. Do NOT redraw, reinterpret, crop or add any text. ` +
    /* round 29 #6: never fake paper grain on the label */
    `The label surface is SMOOTH flat print — NEVER invent paper grain, fibre or canvas texture on the label; only a subtle sheen where light grazes it. ` +
    /* round 30 #4: no white slivers above/below the applied label */
    `The label is applied EDGE-TO-EDGE: its printed area ends exactly at its own edges — never leave white slivers, strips or margins along the label's top or bottom, and never add any border around it. ` +
    /* round 31b / round 34 (owner's screenshot): label axis = bottle axis */
    `The label's vertical axis runs along the bottle's own axis — its TOP edge always faces the bottle's NECK and its BOTTOM edge faces the base; never rotated on the glass, never sideways relative to the bottle. ` +
    /* round 34 (owner's curvature reference): real straight-on wrap */
    `CURVATURE: at this straight-on angle the label's top and bottom edges bow only VERY slightly with the cylinder — a barely visible curve, as in a real photograph. Never strongly arched, bulging or fisheye-bent label edges. ` +
    /* round 29 #5: bottle and label must be lit as one object */
    `ONE LIGHT: the label is lit by exactly the same light as the glass — same direction, same colour temperature, same contrast and shadow fall — so bottle and label read as ONE object photographed together, never as a graphic pasted on afterwards. ` +
    (hasShape
      ? `The SECOND attached image is a technical outline drawing of this exact bottle model — match its GLASS silhouette, proportions, shoulder curve and neck length PRECISELY, but render a real photographed glass bottle, never a drawing. IGNORE the closure/top drawn in the outline — the closure is specified above and OVERRIDES the drawing. `
      : "") +
    `Lighting: crisp premium studio softbox lighting, elegant vertical highlights along the glass, true colours, razor-sharp focus. ` +
    `CUTOUT: pure transparent background, no surface, no table, no cast shadow, no glow or halo around the silhouette — a clean isolated product cutout.` +
    houseRules(rules)
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

export function buildLifestylePrompt(b: MarketingBrief, scenario: string, charter: string, hasShape: boolean, fromBoard = false, rules?: string[]) {
  const d = bottleDescription(b);
  return (
    /* round 31: a board-derived scene LEADS — recreate the reference's own
       story with OUR bottle; the generic style world stays out of its way */
    (fromBoard
      ? `Photorealistic promotional lifestyle photograph for a wine brand. THE SCENE (taken from the brand's own reference imagery — RECREATE its setting, story, action and atmosphere faithfully, with THIS wine bottle as the hero; interpret small details freely but keep what the scene IS): ${scenario}. `
      : `Photorealistic promotional lifestyle photograph for a wine brand: ${scenario}. `) +
    /* the owner's reference-derived charter LEADS the prompt (early tokens
       weigh most) and explicitly outranks the generic style world */
    (charter ? `ART DIRECTION — this brand's photographic world, follow it CLOSELY in setting, props, light, colour grading and styling (it overrides any generic defaults below): ${charter} ` : "") +
    (fromBoard ? "" : `${STYLE_WORLD[b.style] || STYLE_WORLD.contemporary} `) +
    `The wine bottle: ${d.text} ` +
    `The FIRST attached image is the wine's front label — it appears on the bottle EXACTLY as given, legible and true to its colours; never redraw or replace it. ` +
    `The label is lit by the same scene light as the bottle (one photographed object, never a pasted-on graphic), and its surface is smooth flat print — no invented paper grain or fibre texture. ` +
    /* round 31b (owner clarification): the bottle may be in ANY pose —
       the real rule is that the label sits ON THE BOTTLE'S AXIS, glued
       the normal way, and moves WITH the bottle. The bug being killed:
       a label once rendered rotated 90° relative to the bottle. */
    `LABEL-TO-BOTTLE ALIGNMENT — NON-NEGOTIABLE: the label is applied to the bottle the normal way — its vertical axis runs along the bottle's own axis, its TOP edge always facing the bottle's NECK and its BOTTOM edge facing the base, text baselines perpendicular to that axis, exactly as a real glued-on wine label. The bottle may stand, tilt, be held or lie down — the label always moves WITH the bottle: when the bottle lies horizontally the label lies with it (its text then reads along the bottle). Never rotated 90° on the glass, never upright text on a lying bottle, never upside down, never mirrored. ` +
    (hasShape
      ? `The SECOND attached image is a technical outline of this exact bottle model — the bottle in the photo matches that GLASS silhouette and its proportions precisely (the closure drawn in the outline is irrelevant; the closure specified above overrides it). `
      : "") +
    `PEOPLE (house rule): never show a human face — any person appears from behind, framed below the shoulders, or as hands only. ` +
    `Shot on professional camera, beautiful natural light for the scene, crisp focus on the bottle and label. Square composition. No added text, no watermarks, no logos other than the label itself.` +
    houseRules(rules)
  );
}

/* seeded scenario deal — full coverage before repeats, stable per seed.
   round 31: when the owner's board yielded scenes, deal from THOSE —
   the generic list is only the no-board fallback. */
export function dealScenarios(seed: number, boardScenes?: string[]): { text: string; fromBoard: boolean }[] {
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  if (boardScenes && boardScenes.length) {
    const arr = shuffle([...boardScenes]);
    const out: { text: string; fromBoard: boolean }[] = [];
    for (let i = 0; i < 5; i++) out.push({ text: arr[i % arr.length], fromBoard: true });
    return out;
  }
  return shuffle([...SCENARIOS]).slice(0, 5).map(([, text]) => ({ text, fromBoard: false }));
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

/* charters loaded ONCE per request — the route also hashes them into the
   cache signature, so editing a board busts stale cached sets (owner bug
   2026-09-07: new references changed nothing because the cache replayed) */
export async function loadMarketingCharters(style: string): Promise<{ life: string; shots: string; scenes: string[]; rules: string[] }> {
  try {
    const db = await getDb();
    const c = (await db.collection("settings").findOne({ _id: `marketing-charter-${style}` } as never)) as { text?: string } | null;
    const sc = (await db.collection("settings").findOne({ _id: "marketing-charter-shots" } as never)) as { text?: string } | null;
    /* round 31: per-image SCENES derived from the owner's board — when
       present, the five lifestyle images are dealt from THESE, not from
       the generic scenario list */
    const sn = (await db.collection("settings").findOne({ _id: `marketing-scenes-${style}` } as never)) as { list?: string[] } | null;
    /* rules unification (owner 2026-09-09): the owner's plain-English
       marketing rules ride every shot AND lifestyle prompt */
    const rl = (await db.collection("settings").findOne({ _id: "marketing-rules" } as never)) as { global?: string } | null;
    const rules = String(rl?.global || "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 30);
    return { life: c?.text || "", shots: sc?.text || "", scenes: Array.isArray(sn?.list) ? sn!.list!.filter(Boolean) : [], rules };
  } catch { return { life: "", shots: "", scenes: [], rules: [] }; }
}

function houseRules(rules?: string[]) {
  return rules && rules.length ? ` HOUSE RULES (the art director's standing orders — never break them): ${rules.map((r) => `${r}.`).join(" ")} ` : "";
}

export async function generateMarketingAssets(
  b: MarketingBrief,
  frontLabel: string,
  backLabel: string | null,
  send: (e: AssetEvent) => void,
  charters?: { life: string; shots: string; scenes: string[]; rules: string[] }
): Promise<void> {
  const final = imageQuality() === "prod";
  const { life: charter, shots: shotCharter, scenes, rules } = charters || await loadMarketingCharters(b.style);
  /* ops visibility (owner escalation 2026-09-07: "references have no
     influence") — every run states what steering it actually carries */
  console.log(`[marketing] style=${b.style} lifeCharter=${charter.length}ch shotCharter=${shotCharter.length}ch boardScenes=${scenes.length} seed=${b.seed}`);

  /* the owner's line-art drawing of the chosen bottle rides along as a
     silhouette spec (round 14 #4) */
  const shape = bottleShapeRef(b.bottleType, b.closure);

  /* sequential on purpose: OpenAI allows ~5 images/min — the retry absorbs
     the occasional 429, and the stream keeps the page honest meanwhile */
  send({ type: "progress", stage: "front shot" });
  const front = await generateImageRawWithRetry({
    prompt: buildShotPrompt(b, "front", !!shape, shotCharter, rules),
    references: shape ? [frontLabel, shape] : [frontLabel], transparent: true, size: { w: 1024, h: 1536 },
  });
  const frontSized = await sizeShot(front, final);
  send({ type: "shot", side: "front", image: frontSized, preview: await previewOf(front) });

  if (backLabel) {
    send({ type: "progress", stage: "back shot" });
    const back = await generateImageRawWithRetry({
      prompt: buildShotPrompt(b, "back", !!shape, shotCharter, rules),
      references: shape ? [backLabel, shape] : [backLabel], transparent: true, size: { w: 1024, h: 1536 },
    });
    send({ type: "shot", side: "back", image: await sizeShot(back, final), preview: await previewOf(back) });
  }

  const scenarios = dealScenarios(b.seed, scenes);
  for (let i = 0; i < scenarios.length; i++) {
    send({ type: "progress", stage: `lifestyle ${i + 1}/5` });
    try {
      const img = await generateImageRawWithRetry({
        prompt: buildLifestylePrompt(b, scenarios[i].text, charter, !!shape, scenarios[i].fromBoard, rules),
        references: shape ? [frontLabel, shape] : [frontLabel], size: { w: 1024, h: 1024 },
      });
      send({ type: "life", i, image: await sizeLifestyle(img, final), preview: await previewOf(img) });
    } catch (e) {
      /* one failed lifestyle image must not sink the set */
      send({ type: "error", i, error: e instanceof Error ? e.message : String(e) });
    }
  }
}
