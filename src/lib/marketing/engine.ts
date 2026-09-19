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
     the selected one (round 17 #4; sparkling has no screw variant);
     Crown Cap uses the -crown outline where the owner drew one (round 38) */
  const screw = closure === "Screw Cap" && slug !== "sparkling";
  const crown = closure === "Crown Cap" && (slug === "burgundy" || slug === "alsace-rhine");
  for (const file of [screw ? `${slug}-screw.jpg` : crown ? `${slug}-crown.jpg` : "", `${slug}.jpg`]) {
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

/* the wine's colour as it reads in a GLASS (round 41 #1) */
function glassWineShade(wineColour: string) {
  return /red/i.test(wineColour) ? "deep ruby-red, near-opaque in the glass"
    : /ros/i.test(wineColour) ? "pale salmon-pink rosé"
    : /amber|orange/i.test(wineColour) ? "rich amber-orange"
    : "pale straw-gold white wine";
}

/* round 49 #9 (owner: red wine kept appearing with WHITE grapes): any
   grapes in a scene must match the wine's colour family */
/* ROUND 93 #2 (owner, "once and for all"): grapes appear ONLY when the
   variety is known — and then they are THAT variety. No variety → no
   grapes anywhere (no pink grapes under a rosé that is made from red
   grapes, no guessing). Rosé = red-skinned grapes, never pink. */
export function grapeLine(wineColour: string, grape?: string) {
  const v = (grape || "").trim();
  if (!v) return "GRAPES — NON-NEGOTIABLE: NO grapes anywhere in the scene — no grape clusters, no bunches, no grapes on the table, no fruiting vines in focus; the variety is not specified, so none may be invented. ";
  const skin = /red|ros/i.test(wineColour)
    ? "dark red-skinned grapes (deep purple-black / blue-black clusters with a dusty bloom) — a rosé is made from RED grapes, never pink ones"
    : /amber|orange/i.test(wineColour)
      ? "ripe amber-golden grapes (deep yellow-gold clusters)"
      : "green-gold white-wine grapes (pale green to golden clusters)";
  return `GRAPES — NON-NEGOTIABLE: if grapes appear ANYWHERE in the scene they are exactly the variety ${v}, true to that variety's berry size, cluster shape and skin colour — ${skin}. Never a generic or different grape. `;
}

/* ---- closure ------------------------------------------------------- */

function closureLine(closure: string, colourCSS: string, finish: string) {
  const fin = /glossy/i.test(finish) ? "glossy" : /no cap/i.test(finish) ? "" : "matte";
  const col = colourCSS || "deep red";
  /* "CLOSURE — NON-NEGOTIABLE" + an explicit no-cork clause for non-cork
     closures: round 15 #2 — a selected screw cap still rendered as cork
     (the silhouette outline shows a corked top and was winning) */
  /* round 48/49: "No Capsule" is a closure TYPE now (the old finish
     "No cap" spelling stays accepted for back-compat) */
  if (/no cap/i.test(finish) || /no capsule/i.test(closure))
    return closure === "Sparkling Cork"
      ? "CLOSURE — NON-NEGOTIABLE: a mushroom sparkling cork held by its BARE wire cage (muselet) with its round metal cap plate — no foil hood; the cage and its neatly twisted wire sit fully visible against the glass"
      /* round 50 #6 (owner: cork kept rendering half-pulled) + #7 (cork
         through the glass had defects) */
      /* ROUND 93 #1 (owner: "the cork shows pushed DOWN into the bottle
         under the cap"): the old "through the glass, a 45 mm cylinder"
         wording made the model DRAW the cork inside the neck. Now: the
         cork is seated at the lip and nothing of it is drawn below. */
      : "CLOSURE — NON-NEGOTIABLE: a natural cork sits FULLY SEATED in the bare bottle mouth, exactly like an unopened bottle — its top level with the glass lip or at most 1–2 mm above it. NEVER half-pulled, never rising tall out of the neck, never partially extracted, and NEVER sunk down inside the neck. NO capsule, NO foil, the glass lip fully visible. Below the lip the neck reads as plain glass — do NOT draw the cork's body inside the neck, no cork cylinder visible through the glass, no second cork lower down";
  switch (closure) {
    case "Screw Cap": return `CLOSURE — NON-NEGOTIABLE: a ${fin} ${col} aluminium SCREW CAP with a clean straight skirt over the bottle mouth and upper neck. There is NO cork and NO foil capsule — a screw cap only`;
    /* round 29 #3: medium-height wax; round 49 #14 (owner: "reads like a
       thin aluminium cap") — the coat got visibly THICKER and explicitly
       never-metal */
    case "Wax Seal": return `CLOSURE — NON-NEGOTIABLE: a ${fin} ${col} WAX SEAL of MEDIUM height — it coats the bottle mouth and the upper third of the neck (never just the tip, never the whole neck). The wax is a THICK chunky hand-dipped coat, a good 5–7 mm of visible wax BULK that clearly swells OUTWARD beyond the glass profile and fully ROUNDS the tip into a soft dome — it must never read as a thin skin or film tracing the sharp glass shape. The surface is unmistakably WAX — soft, slightly uneven, with a waxy sheen — NEVER foil, NEVER aluminium, NEVER a metal cap. Its lower edge is clean and only slightly uneven — absolutely NO drips or runs. No foil capsule`;
    /* round 29 #4: the model kept missing what a crown cap is */
    case "Crown Cap": return `CLOSURE — NON-NEGOTIABLE: a ${fin} ${col} metal CROWN CAP — the pressed-steel BEER-BOTTLE cap: a flat round top with a short crimped skirt of ~21 tiny flutes gripping the bottle lip, exactly like on a classic beer bottle. Bare glass neck below it. There is NO cork, NO capsule, NO screw threads — only this crimped beer-style cap`;
    /* round 37 #2: wires were rendered poking OUT of the foil — anatomy
       spelled out: with a foil hood the cage lives entirely UNDER the foil */
    case "Sparkling Cork": return `CLOSURE — NON-NEGOTIABLE: a ${fin} ${col} FOIL HOOD dressed smoothly over the sparkling cork AND its entire wire cage, running down the upper neck with a clean crimped lower edge. The foil COMPLETELY covers the cage — no wire ever pokes through, over or out of the foil; at most the cage's form reads as a soft embossed relief under the foil surface`;
    /* round 50 #7: the visible in-neck cork must be clean and full-length */
    /* round 93 #1: the cork is HIDDEN under the capsule — nothing of it is
       drawn in the neck below (the old through-the-glass clause put a
       cork cylinder halfway down the neck on most shots) */
    default: return `CLOSURE — NON-NEGOTIABLE: a ${fin} ${col} foil capsule covers the bottle lip and upper neck; the cork is entirely HIDDEN under it. Below the capsule the neck shows ONLY glass and the wine's fill level — NO cork is visible inside the neck, no cork cylinder through the glass, nothing sunk down into the bottle. Never a half-pulled or protruding cork`;
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
    `Keep this label-to-bottle ratio precisely realistic — never enlarge or shrink the label relative to the bottle. ` +
    /* round 50 #5 (owner: back shot rendered a TALLER label than the
       front shot): both sides carry the same-size label — say it */
    `The FRONT and BACK labels of this wine are exactly THE SAME physical size — every shot of this bottle shows the label at this one identical scale.`;
}

/* ---- product-shot prompt ------------------------------------------- */

export interface MarketingBrief {
  bottleType: string; glassColor: string; closure: string; finish: string; closureColour: string;
  wineColour: string; wine: string;
  grape?: string;          /* round 93 #2: grapes appear only when this is known */
  labelWmm: number; labelHmm: number;
  /* round 51 #9: the back label's own mm (same height, its real width) —
     the back shot's scale line uses these so the model never rescales */
  backWmm?: number; backHmm?: number;
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
  /* ROUND 86 #5 (owner: the sparkling bottle came back with a short
     still-wine cork — the shot follows the outline drawing, which ends at
     the glass lip): on a Sparkling bottle a cork closure is a MUSHROOM
     sparkling cork with its cage, standing a clear 3 cm above the lip */
  const sparklingTop = b.bottleType === "Sparkling" && !/screw|crown/i.test(b.closure)
    ? ` SPARKLING TOP — NON-NEGOTIABLE: this is a sparkling wine bottle, so its closure is a tall MUSHROOM-shaped sparkling cork held by a wire cage (muselet)${/no cap/i.test(b.finish) || /no capsule/i.test(b.closure) ? ", bare" : `, dressed under the ${/glossy/i.test(b.finish) ? "glossy" : "matte"} ${b.closureColour || "deep red"} foil hood`}. The whole top stands a full 3 cm ABOVE the glass lip — a crowned, bulbous head clearly taller and wider than the neck, exactly as on a Champagne bottle. NEVER a short still-wine cork flush with the neck, never a plain capsule. The outline drawing stops at the glass lip; the closure rises above it.` +
      ` The bottle's total height INCLUDING this closure is about ${(spec.heightCM + 3).toFixed(0)} cm — leave that headroom in the frame.`
    : "";
  return {
    spec,
    text:
      `${spec.shape}. ${liquidLine(b.wineColour, b.glassColor)}. ${punt} ` +
      `${closureLine(b.closure, b.closureColour, b.finish)}.${sparklingTop} ` +
      `${scaleLine(b.labelWmm, b.labelHmm, spec)} ` +
      placementLine(b, spec),
  };
}

export function buildShotPrompt(b: MarketingBrief, side: "front" | "back", hasShape: boolean, charter = "", rules?: string[], hasFrontRef = false) {
  /* round 51 #9: the back shot describes the BACK label's true size */
  const d = bottleDescription(side === "back" && b.backWmm && b.backHmm ? { ...b, labelWmm: b.backWmm, labelHmm: b.backHmm } : b);
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
      /* round 50 #12: exact-trace wording, matching the lifestyle prompt */
      ? `The SECOND attached image is a technical outline drawing of this exact bottle model — match its GLASS silhouette EXACTLY: the same shoulder curve, the same neck length, the same width-to-height ratio; when in doubt, TRACE the outline. Render a real photographed glass bottle, never a drawing, and never substitute a different bottle model. IGNORE the closure/top drawn in the outline — the closure is specified above and OVERRIDES the drawing. `
      : "") +
    /* round 56 #4 (owner's THIRD report of label-height drift): the back
       shot no longer trusts words alone — the finished FRONT shot rides
       along as a reference to copy */
    (hasFrontRef
      ? `The ${hasShape ? "THIRD" : "SECOND"} attached image is the finished FRONT-view photograph of THIS VERY BOTTLE — the same physical bottle rotated 180°. COPY its bottle size, position, framing and lighting EXACTLY, and place the back label in EXACTLY the same vertical band at EXACTLY the same height as the front label sits in that photo. The two photographs must overlay perfectly; only the label artwork differs. `
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

export function buildLifestylePrompt(b: MarketingBrief, scenario: string, charter: string, hasShape: boolean, fromBoard = false, rules?: string[], others?: string[]) {
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
    /* round 41 #1: a red wine once poured ROSÉ in a glass — every visible
       drop must match the label's wine */
    `WINE COLOUR — NON-NEGOTIABLE: any wine visible anywhere in the scene (in glasses, mid-pour, in decanters) is THE SAME wine as in the bottle: ${glassWineShade(b.wineColour)}. Never a different colour, never a different wine. ` +
    grapeLine(b.wineColour, b.grape) +
    /* round 49 #10 (owner: two bottle-in-grapes shots in one set): each
       image knows what the REST of the series shows and must differ */
    (others && others.length
      ? `SERIES — NON-NEGOTIABLE: this photo is one of a ${others.length + 1}-image campaign series. The OTHER images in the series already show: ${others.map((o) => o.slice(0, 80)).join("; ")}. THIS scene must read clearly DIFFERENT from every one of them — a different setting, different props, a different story. Never a second variation of a motif the series already has. `
      : "") +
    `The FIRST attached image is the wine's front label — it appears on the bottle EXACTLY as given, legible and true to its colours; never redraw or replace it. ` +
    `The label is lit by the same scene light as the bottle (one photographed object, never a pasted-on graphic), and its surface is smooth flat print — no invented paper grain or fibre texture. ` +
    /* round 31b (owner clarification): the bottle may be in ANY pose —
       the real rule is that the label sits ON THE BOTTLE'S AXIS, glued
       the normal way, and moves WITH the bottle. The bug being killed:
       a label once rendered rotated 90° relative to the bottle. */
    `LABEL-TO-BOTTLE ALIGNMENT — NON-NEGOTIABLE: the label is applied to the bottle the normal way — its vertical axis runs along the bottle's own axis, its TOP edge always facing the bottle's NECK and its BOTTOM edge facing the base, text baselines perpendicular to that axis, exactly as a real glued-on wine label. The bottle may stand, tilt, be held or lie down — the label always moves WITH the bottle: when the bottle lies horizontally the label lies with it (its text then reads along the bottle). Never rotated 90° on the glass, never upright text on a lying bottle, never upside down, never mirrored. ` +
    (hasShape
      /* round 50 #12 (owner: bottle shape drifts too much between images) */
      ? `The SECOND attached image is a technical outline of this exact bottle model — the bottle in the photo matches that GLASS silhouette EXACTLY: the same shoulder curve, the same neck length, the same width-to-height ratio; when in doubt, TRACE the outline. Never substitute a different bottle model (the closure drawn in the outline is irrelevant; the closure specified above overrides it). `
      : "") +
    /* round 50 #10 (owner: a sparkling wine got a still-wine cork in one
       image): the category's elements are locked across the series */
    `PRODUCT CONSISTENCY — NON-NEGOTIABLE: every image shows THIS exact product — the bottle type, glass colour, CLOSURE and label described above. Never a generic wine bottle, never a different closure style: a sparkling wine NEVER appears with a still-wine cork or capsule, and the specified closure overrides whatever is typical for the scene. ` +
    /* round 50 #6: unopened by default */
    `BOTTLE STATE: the bottle is UNOPENED unless the scene explicitly requires it open — the closure fully seated, never a half-pulled cork. ` +
    `PEOPLE (house rule): never show a human face — any person appears from behind, framed below the shoulders, or as hands only. ` +
    `Shot on professional camera, beautiful natural light for the scene, crisp focus on the bottle and label. Square composition. No added text, no watermarks, no logos other than the label itself.` +
    houseRules(rules)
  );
}

/* seeded scenario deal — full coverage before repeats, stable per seed.
   round 31: when the owner's board yielded scenes, deal from THOSE —
   the generic list is only the no-board fallback. */
export function dealScenarios(seed: number, boardScenes?: string[], count = 5, noGrapes = false): { text: string; fromBoard: boolean }[] {
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const toks = (s2: string) => new Set(s2.toLowerCase().split(/[^a-zà-ÿ]+/).filter((w) => w.length > 3));
  const sim = (a: string, b: string) => {
    const A = toks(a), B = toks(b);
    let n = 0; for (const w of A) if (B.has(w)) n++;
    return n / Math.max(1, Math.min(A.size, B.size));
  };
  /* round 93 #2: no known variety → the grape scenes are never dealt */
  const generic = shuffle(SCENARIOS.filter(([, text]) => !noGrapes || !/grape/i.test(text))).map(([, text]) => ({ text, fromBoard: false }));
  /* round 56 #5 (owner: identical prompts again): near-duplicates are
     DELETED, never dealt — when the distinct board pool runs short the
     GENERIC scenarios top it up (they are distinct by construction).
     The same seed always deals the same order, so a "More Variations"
     batch takes the NEXT window without repeating earlier images. */
  const out: { text: string; fromBoard: boolean }[] = [];
  if (boardScenes && boardScenes.length) {
    for (const cand of shuffle([...boardScenes])) {
      if (out.length >= count) break;
      if (out.every((o) => sim(o.text, cand) < 0.35)) out.push({ text: cand, fromBoard: true });
    }
  }
  for (const g of generic) {
    if (out.length >= count) break;
    if (out.every((o) => sim(o.text, g.text) < 0.35)) out.push(g);
  }
  while (out.length < count) out.push(generic[out.length % generic.length]);
  return out.slice(0, count);
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
  charters?: { life: string; shots: string; scenes: string[]; rules: string[] },
  /* round 56 (owner's More Variations): lifeOnly batches skip the shots
     and deal the NEXT window of 5 scenes */
  opts?: { lifeOnly?: boolean; batch?: number }
): Promise<void> {
  const final = imageQuality() === "prod";
  const batch = Math.max(0, opts?.batch || 0);
  const { life: charter, shots: shotCharter, scenes, rules } = charters || await loadMarketingCharters(b.style);
  /* ops visibility (owner escalation 2026-09-07: "references have no
     influence") — every run states what steering it actually carries */
  console.log(`[marketing] style=${b.style} lifeCharter=${charter.length}ch shotCharter=${shotCharter.length}ch boardScenes=${scenes.length} seed=${b.seed}`);

  /* the owner's line-art drawing of the chosen bottle rides along as a
     silhouette spec (round 14 #4) */
  const shape = bottleShapeRef(b.bottleType, b.closure);

  /* sequential on purpose: OpenAI allows ~5 images/min — the retry absorbs
     the occasional 429, and the stream keeps the page honest meanwhile */
  if (!opts?.lifeOnly) {
    send({ type: "progress", stage: "front shot" });
    const front = await generateImageRawWithRetry({
      prompt: buildShotPrompt(b, "front", !!shape, shotCharter, rules),
      references: shape ? [frontLabel, shape] : [frontLabel], transparent: true, size: { w: 1024, h: 1536 },
    });
    const frontSized = await sizeShot(front, final);
    send({ type: "shot", side: "front", image: frontSized, preview: await previewOf(front) });

    if (backLabel) {
      send({ type: "progress", stage: "back shot" });
      /* round 56 #4: the finished front shot rides along — the back shot
         COPIES its scale, so the two labels can never differ in height */
      const back = await generateImageRawWithRetry({
        prompt: buildShotPrompt(b, "back", !!shape, shotCharter, rules, true),
        references: shape ? [backLabel, shape, front] : [backLabel, front], transparent: true, size: { w: 1024, h: 1536 },
      });
      send({ type: "shot", side: "back", image: await sizeShot(back, final), preview: await previewOf(back) });
    }
  }

  /* round 71 #3 (owner went back to FIVE): five lifestyle images per set/batch */
  const scenarios = dealScenarios(b.seed, scenes, 5 * (batch + 1), !b.grape).slice(batch * 5);
  for (let i = 0; i < scenarios.length; i++) {
    send({ type: "progress", stage: `lifestyle ${i + 1}/${scenarios.length}` });
    try {
      const img = await generateImageRawWithRetry({
        prompt: buildLifestylePrompt(b, scenarios[i].text, charter, !!shape, scenarios[i].fromBoard, rules,
          scenarios.filter((_, j) => j !== i).map((x) => x.text)),
        references: shape ? [frontLabel, shape] : [frontLabel], size: { w: 1024, h: 1024 },
      });
      send({ type: "life", i, image: await sizeLifestyle(img, final), preview: await previewOf(img) });
    } catch (e) {
      /* one failed lifestyle image must not sink the set */
      send({ type: "error", i, error: e instanceof Error ? e.message : String(e) });
    }
  }
}
