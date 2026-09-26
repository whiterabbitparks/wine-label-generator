"use client";

/* NEW UI v3 — the owner's 24-point precision round (2026-09-05).
   Principles: artboards are the visuals; chrome (header/footer/progress)
   is a STATIC layer rebuilt 1:1 from extracted geometry USING THE REAL
   Helvetica Neue World fonts (self-hosted, found on the owner's system);
   pages slide only in the content band. Every coordinate below was
   extracted from the SVGs (circles, rects, crosses, lines) — nothing is
   guessed. White patches cover baked mock content that live data
   replaces (E.g. texts, Select+magnifier boxes, corner crosses, dots). */

import { useCallback, useEffect, useRef, useState } from "react";
import { randomDetails } from "./demo-fill";
import { IDEAS } from "./ideas";
import { GUIDE, type GuideStep } from "./guide";
import { UI_GE, SVG_GE, translateSvg } from "./newui-i18n";

const W = 1440, H = 823;
/* ROUND 106 (owner's New_Progressbar_Tutorial_Header_Footer artboards,
   2026-09-21): the chrome turned WHITE — header and footer are now plain
   white with ONE 1px black hairline each, and the walkthrough's card is
   set under the bar instead of in a black balloon. The artboard is 931.97
   tall, so the page box grows below the bar to hold that card; the pages
   themselves still live in the old 1440x823 frame. */
const PAGE_H = 932;
const HAIRLINE = "#000";      /* header rule, footer rule, folder, README — one weight (1px) */
const INK = "#231f20";        /* the artboards' black for type */
/* the folder mark hangs lower off the rule than it did on the black
   header (artboard: its path starts at y114.2 where it used to be 103.1).
   ROUND 107 #5 (owner): it is a fifth smaller, and every icon drawn from
   it — the Final Pack tree's folders and its Read Me sheet — shrinks by
   the same factor, so the family keeps its proportions. */
const ICON_SCALE = 0.8;
const ICON_W = 85.1 * ICON_SCALE, ICON_H = 70 * ICON_SCALE;
const FOLDER_CX = 1275.05;                                   /* its centre, unchanged */
const FOLDER_TOP = 68.57 - (68.57 - 45) * ICON_SCALE;        /* the rule still crosses its tab */
const FOLDER_X = FOLDER_CX - ICON_W / 2;
/* drawn smaller, so the stroke is widened in the viewBox to come out at
   the same ONE page unit as the header and footer rules */
const ICON_STROKE = 1 / ICON_SCALE;
/* the two marks, drawn once and used by the header and the Final Pack
   tree: the owner's folder (viewBox 1232.5 33.9 85.1 70) and the owner's
   ReadMe.svg mapped into an 85x70 box */
const FOLDER_MARK = (
  <g fill="#fff" stroke={HAIRLINE} strokeWidth={ICON_STROKE} strokeMiterlimit="10">
    <path d="M1233.31,103.1V38.26c0-1.98,1.34-3.59,2.99-3.59h25.27c.79,0,1.55.38,2.11,1.05l7.74,9.3c.56.67,1.32,1.05,2.11,1.05h25.27c1.65,0,2.99,1.61,2.99,3.59v7.81" />
    <path d="M1233.31,103.1h68.49l15.03-40.57c.88-2.38-.57-5.05-2.73-5.05h-61.95c-1.18,0-2.25.84-2.73,2.13l-16.11,43.49" />
  </g>
);
const README_MARK = (
  <g fill="none" stroke={HAIRLINE} strokeWidth={ICON_STROKE} strokeMiterlimit="10">
    <polyline points="70.08,51.99 70.08,1 2.08,1 2.08,62.58" />
    {[18, 26.5, 35, 43.5, 52].map((yy) => <line key={yy} x1="14.92" y1={yy} x2="58.6" y2={yy} />)}
    <path d="M14.92,62.58a6.42,6.42 0 0 1-12.84,0" />
    <path d="M8.5,69h67.99a6.42,6.42 0 0 0 6.43,-6.42V52H14.92v10.58" />
  </g>
);
const HEADER_H = 68.57, FOOTER_Y = 754.07;
const BAND_TOP = HEADER_H;
const EASE = "cubic-bezier(0.33, 1, 0.68, 1)";
/* owner (round 7): size-box motion = quick middle, prolonged ease-in/out */
const EASE_IO = "cubic-bezier(0.8, 0, 0.2, 1)";
/* round 9 #7: everything a touch slower, to be appreciated */
const SLIDE_MS = 650;
const FADE_MS = 420;
/* parallax slide: each page moves as three vertical bands — top lands
   first, lower bands trail slightly (same speed/easing, staggered start) */
const STRIP_DELAYS = [0, 55, 110];
const HNW = "'HNW', 'Helvetica Neue', Helvetica, sans-serif";

/* ROUND 45 (owner's New_Progressbar mocks): the DETAILS page comes first,
   Your Vision second — generation fires from the vision page now */
/* ROUND 63 (owner's new mocks): Your Vision + Front Label Details are ONE
   page, and Back Label Details + Market Compliance are ONE page. */
const ORDER = ["welcome", "vision", "loader", "options", "backdetails", "backdesign", "bottle", "assets", "checkout", "blank",
  /* ROUND 112 #4 (owner's artboards): the people behind the paintings —
     an index of everyone who trained a model, and a page each. They are
     not wizard steps: no progress bar, and the red button walks back. */
  "artists", "artist"] as const;
/* round 38 #1: crown caps exist only on these bottles */
const CROWN_TYPES = ["Burgundy", "Sparkling", "Alsace / Rhine"];
/* round 38 #2: label anchors from the owner's positioning charts (same
   values as the marketing engine's LABEL_POS — duplicated because the
   engine module is server-only) */
const LABEL_ANCHOR: Record<string, { anchor: "top" | "bottom"; pct: number }> = {
  "Bordeaux": { anchor: "top", pct: 0.423 },
  "Bordeaux Prestige": { anchor: "top", pct: 0.433 },
  "Ice Wine": { anchor: "top", pct: 0.386 },
  "Burgundy": { anchor: "bottom", pct: 0.093 },
  "Sparkling": { anchor: "bottom", pct: 0.079 },
  "Alsace / Rhine": { anchor: "bottom", pct: 0.066 },
};
/* round 38 #3: colour-wheel closure zones (fractions of the bottle's
   drawn height, painted INSIDE the silhouette, multiply-blended so the
   line art reads through) — capsule + sparkling measured from the owner's
   Cap_reference images; the rest derived from the drawings */
/* ROUND 58 (owner's maximum_margins silhouettes): the red-line zone —
   fractions of the DRAWN bottle height — that a label may NEVER cross.
   Extracted programmatically from Comments/maximum_margins/*.jpg. */
const LABEL_ZONE: Record<string, [number, number]> = {
  "Bordeaux": [0.387, 0.909],
  "Bordeaux Prestige": [0.395, 0.894],
  "Burgundy": [0.607, 0.929],
  "Sparkling": [0.664, 0.927],
  "Alsace / Rhine": [0.652, 0.944],
  "Ice Wine": [0.314, 0.938],
};
const CAP_ZONES: Record<string, [number, number][]> = {
  "Cork": [[0.005, 0.145]],
  /* round 43 #1: was far shorter than the capsule — match Cork's span */
  "Screw Cap": [[0, 0.145]],
  "Wax Seal": [[0, 0.1]],
  "Crown Cap": [[0, 0.028]],
  /* round 50 #8: foil reads too long — trimmed 1/10 from below */
  "Sparkling Cork": [[0, 0.455]],
};
type PageKey = (typeof ORDER)[number];

/* ROUND 63 (owner's mocks, measured off the 3x artboards): the bar RIDES
   the white/black boundary — a filled red start dot, three white station
   dots (labels below them in the black footer) and a big round red NEXT
   button at the right. Nothing else lives in the footer. */
const BAR_RED = "#B71318";
/* ROUND 71 (owner's New_Progress-Bar artboards, read straight out of the
   SVG — its viewBox is our 1440x822.86, so these ARE page units): every
   wizard page now owns a labelled stop. The stops alternate — a small dot
   under a light label for the pages you FILL IN, a big dot under a bold
   caps label for the pages that hand you a RESULT. */
const PROG_Y = 754.18;         /* dot + line centre = the band edge */
const BAR_X0 = 142.06;         /* the filled red start dot */
const START_R = 4.92;
const DOT_BIG = 4.92;
const DOT_SMALL = 3.15;
const LINE_H = 4;
const LABEL_BASE = 794.68;     /* station labels' baseline (round 109: pulled down) */
const FOOT_RULE_Y = 753.96;    /* the footer's 1px hairline, straight off the artboard */
/* ROUND 112 #1 (owner: "the black line goes thin when a popup opens"):
   a modal's white veil ran from HEADER_H to FOOTER_Y — INSIDE both rules
   (each is a unit thick, centred on its line), so it washed out the half
   it covered. Every veil now stops a unit clear of them. */
const VEIL_TOP = HEADER_H + 1.5, VEIL_BOT = FOOT_RULE_Y - 1.5;
/* ROUND 106: the walkthrough's card, set flush-left under the station it
   explains — "STEP N /" in red, the title in black beside it, the body in
   italic below. All three baselines are the artboard's. */
/* ROUND 109 (owner's re-cut artboards): the card lost its title — the
   station's own label above it IS the title, so the card is "STEP N" in
   red and two italic lines, left-aligned with that label. */
const CARD_BASE = 823.61, CARD_BODY = [18.4, 32.8], CARD_FS = 15, CARD_BODY_FS = 12;
const NEXT_R = 18.09;          /* red round button — round 109: smaller again (was 27) */
const NEXT_X = 1302.86;        /* its centre on working pages … */
const WELCOME_X = 168.1;       /* … and on the welcome page */
const BACK_X = 155.23;         /* round 112 #4: artists' pages — a BACK button at the rule's left end */
const STEPS: { x: number; label: string; page: PageKey; big: boolean }[] = [
  { x: 303.38, label: "Front Label Details", page: "vision", big: false },
  { x: 469.98, label: "FRONT LABEL", page: "options", big: true },
  { x: 636.58, label: "Back Label Details", page: "backdetails", big: false },
  { x: 803.18, label: "BACK LABEL", page: "backdesign", big: true },
  /* the artboard repeats "Back Label Details" here — a copy/paste slip in
     the mock; the stop is the BOTTLE page, as its own STEP 5 card says */
  { x: 969.79, label: "Bottle Details", page: "bottle", big: false },
  { x: 1136.39, label: "MARKETING ASSETS", page: "assets", big: true },
];
const CIRCLE_X = STEPS.map((s2) => s2.x);
/* ROUND 63 (owner): the red line stops HALFWAY to the next station while
   its details are being filled in, and lands ON the station when that
   step's result exists. On checkout it runs up to the red button. */
/* the boards whose baked title is covered and redrawn bigger (round 63) */
const PAGE_TITLE: Partial<Record<PageKey, string>> = {
  options: "FRONT LABEL OPTIONS", backdesign: "BACK LABEL DESIGN",
  bottle: "BOTTLE", assets: "MARKETING ASSETS", checkout: "FINAL PACK",
};
/* 2026-09-23 (owner): where the red SKIP beside the title leads */
const SKIP_TO: Partial<Record<PageKey, PageKey>> = {
  vision: "backdetails", options: "backdetails",
  backdetails: "bottle", backdesign: "bottle",
  bottle: "checkout",
};
/* ROUND 71: one stop per page, so the red line lands exactly ON the
   current page's stop instead of stopping half way. */
const THICK: Record<PageKey, number | null> = {
  welcome: null,
  vision: CIRCLE_X[0],
  loader: CIRCLE_X[0],
  options: CIRCLE_X[1],
  backdetails: CIRCLE_X[2],
  backdesign: CIRCLE_X[3],
  bottle: CIRCLE_X[4],
  assets: CIRCLE_X[5],
  checkout: CIRCLE_X[5],                         /* round 93 #7: to the last station, not into the button */
  blank: null,                                    /* round 94 #2: takes the page it stands in for */
  artists: null, artist: null,                    /* round 112 #4: no bar on the artists' pages */
};
/* highest station index REACHED — that dot (and earlier ones) turn red */
const STEP_OF: Record<PageKey, number> = { welcome: -1, vision: 0, loader: 0, options: 1, backdetails: 2, backdesign: 3, bottle: 4, assets: 5, checkout: 5, blank: 0, artists: -1, artist: -1 };

/* ROUND 63: the bar no longer eats a white strip — every page's content
   band runs to the footer edge and the bar paints on top of it. */
const BAND_BOTTOM: Record<PageKey, number> = Object.fromEntries(ORDER.map((p) => [p, FOOTER_Y])) as Record<PageKey, number>;

/* parallax strip boundaries (page-coordinate y) — each pair sits in that
   artboard's natural empty bands so the cut never crosses a text row or a
   drawn box (loader entry fades, so its entry is unused) */
const STRIP_BOUNDS: Record<PageKey, [number, number]> = {
  welcome: [360, 560], vision: [225, 460], loader: [225, 460],
  options: [225, 543], backdetails: [225, 468],
  backdesign: [165, 540], bottle: [225, 515], assets: [165, 540], checkout: [250, 500], blank: [225, 460],
  artists: [300, 560], artist: [330, 560],
};

/* CONTENT-AWARE PARALLAX (owner round 16 #3): these pages slice by their
   actual content instead of three bands. Each slice is a clip rect in
   page coordinates with its own delay; mode 'fade' animates in place
   (the front size box grows during the slide instead of sliding).
   front: every input row cascades; compliance: country rows cascade;
   bottle: VERTICAL column slices, each carrying its own dashed divider. */
type Slice = { x0?: number; y0?: number; x1?: number; y1?: number; delay: number; mode?: "slide" | "fade"; layer?: HomeLayer };
/* 2026-09-23 (owner's Homepage_Visual): the home page does not cut into
   rectangles — its big bottle stands in front of the market photos and
   its headline runs over the label's column, so a clip would slice them.
   It slides as LAYERS instead: each group is a whole-page, see-through
   layer with its own delay (only the first carries the white page). The
   array order is the stacking order, the delay is the cascade: headline
   + Your Vision, then the label, then the bottles, the market photos
   last — and the bottles still stand in front of them. */
type HomeLayer = "base" | "label" | "market" | "bottles" | "tagline";
const PAGE_SLICES: Partial<Record<PageKey, Slice[]>> = {
  welcome: [
    { layer: "base", delay: 0 },
    { layer: "label", delay: 90 },
    { layer: "market", delay: 270 },
    { layer: "bottles", delay: 180 },
    /* the italic line sits OVER the big bottle's white edge, as in his file */
    { layer: "tagline", delay: 270 },
  ],
  /* ROUND 63: the merged pages slide as their two halves — vision splits
     at its dashed column rule, back details at its dashed band rule */
  vision: [
    { x1: 788, delay: 0 },
    { x0: 788, delay: 70 },
  ],
  backdetails: [
    { y1: 586, delay: 0 },
    { y0: 586, delay: 70 },
  ],
  /* round 48: FIVE option columns — cuts ride the new dividers */
  bottle: [
    { x1: 342.9, delay: 0 },
    { x0: 342.9, x1: 534.8, delay: 60 },
    { x0: 534.8, x1: 726.7, delay: 120 },
    { x0: 726.7, x1: 918.6, delay: 180 },
    { x0: 918.6, x1: 1110.5, delay: 240 },
    { x0: 1110.5, delay: 300 },
  ],
};
/* ROUND 94 #2 (owner missed the parallax): the slice cascade is BACK. The
   "old page reappears" glitch was never the cascade — it was the confirm
   popup sitting on the still-present page; now the page leaves before the
   popup opens (the BLANK page) */
const sliceDefs = (p: PageKey): Slice[] => {
  if (PAGE_SLICES[p]) return PAGE_SLICES[p]!;
  const [b1, b2] = STRIP_BOUNDS[p];
  return [{ y1: b1, delay: STRIP_DELAYS[0] }, { y0: b1, y1: b2, delay: STRIP_DELAYS[1] }, { y0: b2, delay: STRIP_DELAYS[2] }];
};
const maxSliceDelay = (p: PageKey) => Math.max(...sliceDefs(p).map((s) => s.delay));

/* Illustrator exports every board with the same global class names (.st0…)
   and ids (clippath…) whose meanings DIFFER per file — with two boards
   inline during a slide they fought each other (white headings, wrong
   clips mid-transition). Namespace both per page. */
function namespaceSvg(t: string, key: string) {
  return t
    .replace(/\.st(\d+)/g, `.${key}-st$1`)
    .replace(/class="([^"]*)"/g, (_, cls: string) => `class="${cls.split(/\s+/).map((c) => (/^st\d+$/.test(c) ? `${key}-${c}` : c)).join(" ")}"`)
    .replace(/id="([^"]*)"/g, (_, id: string) => `id="${key}--${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id: string) => `url(#${key}--${id})`)
    .replace(/href="#([^"]+)"/g, (_, id: string) => `href="#${key}--${id}"`);
}

/* THE IDEAS behind "Give me an idea" live in ./ideas (the admin's layout
   batch paints from them too) */

/* TEMP demo fill (owner RESTORED 2026-09-07 for testing speed — switch
   off before launch): empty fields fall back to these sample texts in
   GENERATED results only; the form stays empty */
/* ROUND 86 (owner): the walkthrough plays the owner's own pack —
   exactly the fields they filled in, nothing invented. 2026-09-23 (owner:
   "use the home page project"): KORRA gave way to MARANI TSINANDALI, his
   live run of that evening (product page wqo2bp5f, the labels' own text,
   his Final Pack in NEW UI/Comments/New). */
const DEMO_FRONT: Record<string, string> = {
  producer: "MARANI", wine: "TSINANDALI", appellation: "Mukuzani",
  classification: "", vintage: "2023", grape: "Rkatsiteli",
  regionCountry: "Kakheti Georgia", special: "Qvevri Wine", sweetness: "Dry",
  colour: "Amber", wineType: "Wine", alcohol: "12", volume: "750",
};

/* ================= ROUND 71 #4: the first-run WALKTHROUGH =============
   A visitor's first press of the red arrow does NOT drop them into an
   empty form — it plays the whole job through on a finished sample
   project, one bar stop at a time, with the fields typing themselves in.
   It runs on the REAL pages driven by demo state, so the walkthrough can
   never drift away from the product. "Let's build your pack!" wipes it
   and starts the real thing from the top.
   The sample is one of the owner's own runs: three engine-built label
   designs, its back label, and the product shots / marketing images /
   product page lifted from their Assets artboards. */
const TUT_D = "/newui/demo/";
/* his run's three columns: Mariam's traditional, Levan's contemporary (the
   one he chose), Levan's funky */
const TUT_LABELS = [TUT_D + "ts-label1.jpg", TUT_D + "ts-label2.jpg", TUT_D + "ts-label3.jpg"];
const TUT_LIFE = [1, 2, 3, 4, 5].map((n) => `${TUT_D}ts-life${n}.jpg`);
/* who painted each column of that run — the real page heads each label
   "Style By: <artist>", so the story's labels must carry the names too
   (owner 2026-09-23: "the tutorial still shows the old titles") */
const TUT_ARTISTS = ["Mariam Kvashilava", "Levan Amashukeli", "Levan Amashukeli"];
const TUT_BACK = TUT_D + "ts-back-label.png", TUT_SHOT_F = TUT_D + "ts-shot-front.png", TUT_SHOT_B = TUT_D + "ts-shot-back.png";   /* transparent, like the real shots */
/* round 72 #1: the closing card sits on a BLANK page — the walkthrough
   stays on the assets page and a white sheet covers the band */
const TUT_PAGES: PageKey[] = ["vision", "options", "backdetails", "backdesign", "bottle", "assets", "assets"];
/* ROUND 106 (owner's artboards): the card is no longer a balloon — it is
   set flush-left under the station it explains, so each line runs as long
   as it needs to. Copy verbatim off the artboards, typos fixed. The last
   card is a single red word under the button at the end of the bar. */
const TUT_CARDS: { step: string; body: string[] }[] = [
  { step: "STEP 1", body: ["Tell me what you picture, and the details", "that belong on your front label."] },
  { step: "STEP 2", body: ["Voilà — three designs to choose from.", "Pick your favourite."] },
  { step: "STEP 3", body: ["A few more details, and I'll build a back label", "that meets your market's rules."] },
  { step: "STEP 4", body: ["Done. Print-ready, and compliant with", "the markets you chose."] },
  { step: "STEP 5", body: ["Tell me about the bottle and the closure, so I can", "photograph your wine exactly as it will look on the shelf."] },
  /* the artboard reads "four marketing images" — the product makes five */
  { step: "STEP 6", body: ["Two product shots, five marketing images,", "and your product page if you asked for one."] },
  /* the closing state: the button at the end of the bar and ONE red word
     where a station's name would be */
  { step: "START", body: [] },
];
const DEMO_VISION = IDEAS[0];   /* Soft Gravity — his TSINANDALI story */
const DEMO_DESC = "A vibrant, medium-bodied wine with aromas of ripe cherry, wild berries, and subtle spice. Fresh acidity and soft tannins create a balanced palate, followed by notes of dried herbs and a smooth, lingering finish.";
const DEMO_BACK: Record<string, string> = {
  producerCompany: "POPIKA LLC", producerAddress: "#33 Chikovani St. 0171 Tbilisi, Georgia",
  importer: "", importerAddress: "",
  bottlingDate: "22/04/23", lot: "L9876545321", web: "www.popikasmarani.com",
};
/* round 73 #4: where the bottle step ENDS (it starts on Bordeaux / Olive
   Green / Wax Seal and is changed on camera). Round 86: KORRA's bottle —
   a clear Sparkling bottle, cork, black matte hood. */
/* round 88 #4: a Sparkling bottle offers only "Sparkling Cork" / "Crown
   Cap" — "Cork" left the ring empty */
/* TSINANDALI's bottle (owner 2026-09-23: Burgundy, olive glass, and a
   WAX SEAL in matte sky blue). The page opens on something else, so each
   choice is seen being made. */
const DEMO_BOTTLE = { type: "Burgundy", color: "Olive Green", closure: "Wax Seal", finish: "Matte" };
const DEMO_BOTTLE_0 = { type: "Bordeaux", color: "Transparent", closure: "Cork", finish: "Matte" };
/* the capsule's blue: the wheel point nearest his photo's capsule
   (31,135,188), which the shade drag then deepens a touch */
const DEMO_WHEEL = { x: 0.441, y: 0.772, rgb: [36, 167, 253] };
const DEMO_SHADE = 0.6;
/* round 72 #8: the ghost taps — a red ring blooms where a hand would be */
const TAP = {
  visionBox: [250, 400], width: [237, 650], height: [410, 650],   /* round 108 #1: the size row moved left */
  firstField: [1060, 279],          /* round 76 #3: on "GRAND VIN" itself */
  optSelect: [720, 654],            /* round 94 #1: ON the Save button, column 2 */
  bdSave: [719.3, 674.8],           /* round 94 #7: the back label's Save */
  descBox: [250, 265], barcode: [360, 468], qrBtn: [874.5, 467],
  market: [873.5, 670], eu: [873, 330], us: [873, 355],   /* the dropdown's rows are 25 apart */
  assetsSave: [720, 674.75],        /* the assets page's Save, on the centre line */
  backFirst: [1050, 212],            /* round 73 #1: up to the details */
  /* round 86: the variation plays on the PUNK column (KORRA's yellow →
     blue re-layout); column 3's centre is 960 + 342.9/2 */
  varBtn: [1131.45, 582], dot0: [1120.25, 516.85], dot1: [1142.25, 516.85],
  wheel: [1137.89 + 0.441 * 137.2, 368 + 0.772 * 137.2],
  bottleRings: [[386.06, 283.57], [577.98, 283.57], [769.9, 283.57], [961.82, 283.57], [1153.74, 283.57]],
} as const;
/* the bottle page's option rows and the lightness knob, from its own code:
   ring cx = COLS_X[ci] + 43.2, cy = 283.57 + row * 29.8;
   knob cx = 1144.83 + shade * 121.64 on y 532.5 */
const BRING = (ci: number, row: number) => [[342.86, 534.78, 726.7, 918.62, 1110.54][ci] + 43.2, 283.57 + row * 29.8] as [number, number];
const SHADE_X = (v: number) => 1144.83 + v * 121.64;

/* round 52 #3: placeholder terms text — long enough to need the scroll */
const TERMS_TEXT = Array.from({ length: 9 }, (_, i) => (
  `${i + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.`
));

/* round 84: `id` names the label on the server — its SVG with live type
   waits there for the delivery package */
interface Dream { style: string; dream: string; preview: string | null; id?: string; variants?: Dream[]; artist?: string }

/* ground colour of a label image — MEDIAN of many border samples
   (round 10 #4: the old 5-corner AVERAGE went dark whenever artwork or
   downscale smearing touched a corner; a median ignores such outliers) */
async function groundOf(url: string): Promise<string> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      try {
        const S = 120;
        const c = document.createElement("canvas"); c.width = S; c.height = S;
        const cx = c.getContext("2d")!;
        cx.drawImage(img, 0, 0, S, S);
        const d = cx.getImageData(0, 0, S, S).data;
        /* round 40 #5 (owner: "back label colour didn't match the front"):
           per-channel medians could BLEND mixed edges into a colour that
           exists nowhere on the label. Now: quantised DOMINANT edge colour
           — always a colour actually present on the label's border. */
        const inset = 4;
        const bins = new Map<string, { n: number; r: number; g: number; b: number }>();
        for (let i = 0; i < 28; i++) {
          const t = inset + Math.round((i / 27) * (S - 2 * inset - 1));
          for (const [x, y] of [[t, inset], [t, S - 1 - inset], [inset, t], [S - 1 - inset, t]]) {
            const o = (y * S + x) * 4;
            const r = d[o], g = d[o + 1], b = d[o + 2];
            const k = `${r >> 4}-${g >> 4}-${b >> 4}`;
            const e = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 };
            e.n++; e.r += r; e.g += g; e.b += b;
            bins.set(k, e);
          }
        }
        const top = [...bins.values()].sort((a, b) => b.n - a.n)[0];
        const hx = (v: number) => Math.round(v).toString(16).padStart(2, "0");
        res("#" + hx(top.r / top.n) + hx(top.g / top.n) + hx(top.b / top.n));
      } catch { res("#FFFFFF"); }
    };
    img.onerror = () => res("#FFFFFF");
    img.src = url;
  });
}

export default function NewUI() {
  const [page, setPage] = useState<PageKey>("welcome");
  /* dev aid: /?page=bottle jumps straight to a page (no generation needed) */
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get("page");
    if (q && q !== "blank" && (ORDER as readonly string[]).includes(q)) { pageNow.current = q as PageKey; setPage(q as PageKey); }
    /* round 65: seed the history so the FIRST Back has somewhere to land */
    try { window.history.replaceState({ page: pageNow.current }, "", `?page=${pageNow.current}`); } catch { }
    /* dev aid: &pp=<code> previews the final-pack product-page slot */
    const pp = sp.get("pp");
    if (pp) { setProductUrl(`/p/${pp.replace(/[^a-z0-9]/gi, "")}`); return; }
    /* round 28b: the published page survives reloads and server restarts —
       restore the order's code and re-verify the page actually exists, so
       the final-pack preview never forgets it (owner: "didn't load") */
    try {
      const c = localStorage.getItem("nui-product-code");
      if (c) {
        productCode.current = c;
        fetch(`/api/product?code=${c}`).then((r) => { if (r.ok) setProductUrl(`/p/${c}`); }).catch(() => { });
      }
    } catch { }
  }, []);
  const [prev, setPrev] = useState<PageKey | null>(null);
  /* 2026-09-23 (owner): the home page slides in on first open too, its
     groups in their cascade — as if arriving from another page */
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setIntro(false), SLIDE_MS + maxSliceDelay("welcome") + 60);
    return () => clearTimeout(id);
  }, []);
  /* ENG/GEO (owner 2026-09-07): translates overlays AND baked board text */
  const [lang, setLang] = useState<"en" | "ge">("en");
  useEffect(() => { try { const l = localStorage.getItem("nui-lang"); if (l === "ge") setLang("ge"); } catch { } }, []);
  const pickLang = (l: "en" | "ge") => { setLang(l); try { localStorage.setItem("nui-lang", l); } catch { } };
  const t = (s: string) => (lang === "ge" ? UI_GE[s] || SVG_GE[s] || s : s);
  const tStage = (s: string) => (lang === "ge" ? s.replace("front shot", "წინა ფოტო").replace("back shot", "უკანა ფოტო").replace("lifestyle", "სურათი").replace("preparing", "მზადდება").replace("publishing", "ქვეყნდება") : s);
  const [dir, setDir] = useState(1);
  const [scale, setScale] = useState(1);
  const [arrowFly, setArrowFly] = useState(false);

  const [vision, setVision] = useState("");
  const [ideaN, setIdeaN] = useState(0);
  const [sketch, setSketch] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>({ width: "110", height: "80" });
  const [dreams, setDreams] = useState<Dream[]>([]);
  /* ROUND 60 #1 (owner): each style column is its OWN mini-carousel —
     a variations press generates ONE new label of that style, dots under
     the label switch between the original (0) and its variations. */
  const [styleVars, setStyleVars] = useState<(Dream | null)[][]>([[], [], []]);
  /* ROUND 88 #9 (owner): two rows of dots across the button's width —
     15 a row, the original plus 29 variations */
  const DOTS_PER_ROW = 15, MAX_VARS = 2 * 15 - 1;
  /* ROUND 88 #6/#7/#10 (owner): "saving" is a little film — the image
     shrinks and glides up into the header's folder mark, which bumps as
     it lands. Several images go in sequence. */
  const [flights, setFlights] = useState<{ id: number; src: string; x: number; y: number; w: number; h: number; delay: number; back?: boolean }[]>([]);
  const flightN = useRef(0);
  const [folderBump, setFolderBump] = useState(0);
  const FOLDER_C = { x: FOLDER_CX, y: FOLDER_TOP + ICON_H * 0.4586 };
  /* round 94 (owner): `back` plays the film in REVERSE — the thing leaves
     the folder and glides back to its place on the page (a second press
     of Save un-saves; a third saves again) */
  const flyToFolder = (items: { src: string; x: number; y: number; w: number; h: number }[], back = false) => {
    const batch = items.filter((it) => it.src).map((it, i) => ({ ...it, id: ++flightN.current, delay: i * 150, back }));
    if (!batch.length) return;
    const last = batch[batch.length - 1].delay;
    setFlights((fl) => [...fl, ...batch]);
    setTimeout(() => setFolderBump((n) => n + 1), back ? 0 : last + 760);
    setTimeout(() => setFlights((fl) => fl.filter((x) => !batch.some((b2) => b2.id === x.id))), last + 1500);
  };
  const [backSaved, setBackSaved] = useState(false);
  const [assetsSaved, setAssetsSaved] = useState(false);
  const [treeN, setTreeN] = useState(0);        /* round 88 #1: replays the tree reveal */
  /* round 108 #19 (owner): the reveal plays when the page OPENS; a pack
     item switched on or off afterwards only fades in or out */
  const treeReveal = useRef(false);
  const [styleView, setStyleView] = useState<number[]>([0, 0, 0]);
  const [varBusyCol, setVarBusyCol] = useState(-1);
  const STYLES3 = ["traditional", "contemporary", "punk"];
  const viewedDream = (col: number): Dream | null => {
    if (col < 0) return null;
    const v = styleView[col] || 0;
    return v === 0 ? dreams[col] || null : styleVars[col]?.[v - 1] || null;
  };
  const varT = useRef(0);
  /* ROUND 54 #2: pre-generation confirmation popups — a run starts only
     after the customer reviews everything that shapes the result */
  const [confirmModal, setConfirmModal] = useState<"" | "labels" | "assets">("");
  /* round 93 #15/#16: the gallery — big picture, arrows, ✕, Save inside */
  const [gallery, setGallery] = useState<{ items: string[]; index: number; save?: () => void; saved?: boolean } | null>(null);
  /* round 93 #8: "every field is empty — really?" before moving on */
  const [emptyWarn, setEmptyWarn] = useState<"" | "front" | "back">("");
  /* round 94 #2: the page the confirm popup stands in for — it slides out
     BEFORE the popup opens, the loader fades in on Create, and Edit
     slides it back in */
  const blankFrom = useRef<PageKey>("vision");
  const openConfirm = (kind: "labels" | "assets", from: PageKey) => {
    blankFrom.current = from;
    go("blank", 1, false);
    setConfirmModal(kind);
  };
  const closeConfirm = () => { setConfirmModal(""); if (pageNow.current === "blank") go(blankFrom.current, -1, false); };
  const [assetsTick, setAssetsTick] = useState(0);
  const pendingAssetsSig = useRef("");
  const confirmedAssetsSig = useRef("");
  /* round 52 #3: Terms & Conditions modal with the house-style scroll */
  const [termsOpen, setTermsOpen] = useState(false);
  const [termsPos, setTermsPos] = useState(0);
  const termsRef = useRef<HTMLDivElement | null>(null);
  /* ROUND 112 #3 (owner): the CREDIT ECONOMY is out of the artists'
     branch — no balance in the header, no purchase page, no mailing-list
     gift, no "costs N credits" line. Making a label is free for now; the
     Final Pack's own prices are untouched. */
  /* round 56 #3 (owner, TEMP DEV TOOL — remove before launch): the
     footer switch fakes every generation with already-made images */
  const [liveGen, setLiveGen] = useState(true);
  const liveGenRef = useRef(true);
  useEffect(() => { try { if (localStorage.getItem("nui-live-gen") === "0") { setLiveGen(false); liveGenRef.current = false; } } catch { } }, []);
  /* 2026-09-23 — TEMP DEV SWITCH (remove before launch, with live gen):
     "fill details". On: the front and back label details are filled with
     one random, coherent wine, its optional fields left out at random
     (demo-fill.ts). Off: both forms are emptied. Remembered per browser;
     a page opened with it on arrives filled. */
  const [fillOn, setFillOn] = useState(false);
  /* 2026-09-23 — the GUIDED TOUR (guide.ts): its switch, and the step it
     stands on (-1 = not running) */
  const [guideOn, setGuideOn] = useState(false);
  const [clinkN, setClinkN] = useState(0);        /* 2026-09-23: the agree glasses' clink */
  const [guide, setGuide] = useState(-1);
  useEffect(() => { try { if (localStorage.getItem("nui-guide") === "1") setGuideOn(true); } catch { } }, []);
  const fillDetails = (on: boolean) => {
    if (on) { const r = randomDetails(); setF((m) => ({ width: m.width || "110", height: m.height || "80", ...r.front })); setB(r.back); setGtin(r.gtin); }
    else { setF((m) => ({ width: m.width || "110", height: m.height || "80" })); setB({}); setGtin(""); }
  };
  useEffect(() => { try { if (localStorage.getItem("nui-fill") === "1") { setFillOn(true); if (!localStorage.getItem("nui-order")) fillDetails(true); } } catch { } }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  /* round 57 #2: the stand-in is a REAL generated label, not a bottle */
  const FAKE_IMG = "/newui/sample-label.jpg";
  /* ROUND 68 #4 (owner: "an uploaded label generates only the label back —
   no bottle, no marketing images"). A generated label reaches the image
   model as a modest flat PNG; a customer's file can be a 12-megapixel
   phone photo, or a PNG whose transparency the model reads as the whole
   subject — in both cases the edit call hands the picture back instead of
   photographing a bottle with it. Every upload is therefore re-baked into
   the same shape our own labels have: flattened onto white, capped at
   1400px on its long side, plain JPEG. ROUND 70: this runs on the image
   the handler has ALREADY decoded — the first cut decoded the file twice,
   and a file the browser cannot decode (HEIC, PDF, a damaged export) then
   failed in silence. */
function flattenLabel(im: HTMLImageElement, fallback: string): string {
  try {
    const k = Math.min(1, 1400 / Math.max(1, im.naturalWidth, im.naturalHeight));
    const w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const cx = cv.getContext("2d"); if (!cx) return fallback;
    cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h);
    cx.drawImage(im, 0, 0, w, h);
    const out = cv.toDataURL("image/jpeg", 0.92);
    return out.startsWith("data:image/jpeg") ? out : fallback;
  } catch { return fallback; }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const [selected, setSelected] = useState(-1);
  const [genProgress, setGenProgress] = useState(0);
  const [frontSig, setFrontSig] = useState("");
  /* 2026-09-23 (owner: "within a session the label changes only when it is
     generated anew"): what the PAINTINGS were made from — the idea, the
     sketch, the size. The details alone changing re-sets the type on the
     same paintings; only a change here paints again. */
  const [paintSig, setPaintSig] = useState("");
  const [b, setB] = useState<Record<string, string>>({});
  const [markets, setMarkets] = useState<string[]>([]);   /* round 8 #7: none preselected */
  /* round 41 #9: "No compliance needed" — ON by default; picking any
     market turns it off, clearing all markets turns it back on */
  const [noComp, setNoComp] = useState(true);
  const [qrImg, setQrImg] = useState("");
  /* ingredients text file for the future QR landing page (owner 2026-09-07) */
  const [ingredients, setIngredients] = useState("");
  const [productUrl, setProductUrl] = useState("");
  /* round 30 #5: the slot-5 thumb takes a few seconds to build — the mini
     glass fills (same living-loader behaviour) until the iframe loads */
  const [ppLoaded, setPpLoaded] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [carIdx, setCarIdx] = useState(0);
  const [ppFill, setPpFill] = useState(0.14);
  useEffect(() => { setPpLoaded(false); setPpFill(0.14); }, [productUrl]);
  useEffect(() => {
    if (!productUrl || ppLoaded) return;
    const iv = setInterval(() => setPpFill((v) => Math.min(0.9, v + 0.11)), 700);
    return () => clearInterval(iv);
  }, [productUrl, ppLoaded]);
  const [backPng, setBackPng] = useState("");
  const [backPayload, setBackPayload] = useState<Record<string, unknown> | null>(null);
  const [backSig, setBackSig] = useState("");
  const [backDims, setBackDims] = useState({ w: 1, h: 1 });
  const [bottle, setBottle] = useState<Record<string, string>>({ type: "Bordeaux", color: "Olive Green", closure: "Cork", finish: "Matte" });
  /* round 38: which drawing variant the bottle page shows */
  const bottleSrc = () => {
    const slug = ({ "Bordeaux": "bordeaux", "Bordeaux Prestige": "bordeaux-prestige", "Burgundy": "burgundy", "Sparkling": "sparkling", "Alsace / Rhine": "alsace-rhine", "Ice Wine": "ice-wine" } as Record<string, string>)[bottle.type] || "bordeaux";
    const screw = bottle.closure === "Screw Cap" && slug !== "sparkling";
    const crown = bottle.closure === "Crown Cap" && (slug === "burgundy" || slug === "alsace-rhine");
    return `/newui/bottles/${slug}${screw ? "-screw" : crown ? "-crown" : ""}.jpg`;
  };
  /* round 38 #2/#3: the drawing is pixel-scanned ONCE per variant — the
     per-row silhouette spans drive the cap-colour overlay, the bbox drives
     the label-position preview */
  const bottleScans = useRef<Record<string, { top: number; bottom: number; cx: number; bw: number; spans: [number, number][] }>>({});
  const [bottleScanKey, setBottleScanKey] = useState("");
  const capCanvasRef = useRef<HTMLCanvasElement | null>(null);
  /* round 7 #20: marker starts centred; result box starts WHITE */
  const [wheel, setWheel] = useState({ x: 0.5, y: 0.5, rgb: [255, 255, 255] as number[] });
  const [shade, setShade] = useState(0.5);
  /* round 38 #2/#3: scan the drawing once per variant; paint the cap zone
     in the wheel colour; both run only on the bottle page */
  useEffect(() => {
    if (page !== "bottle") return;
    const src = bottleSrc();
    if (bottleScans.current[src]) { setBottleScanKey(src); return; }
    const im = new Image();
    im.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = 800; cv.height = 1600;
      const g = cv.getContext("2d"); if (!g) return;
      g.drawImage(im, 0, 0, 800, 1600);
      const d = g.getImageData(0, 0, 800, 1600).data;
      const spans: [number, number][] = []; let top = 1600, bottom = -1;
      for (let y = 0; y < 1600; y++) {
        let l = -1, r = -1;
        for (let x = 0; x < 800; x++) {
          const i = (y * 800 + x) * 4;
          if (Math.max(d[i], d[i + 1], d[i + 2]) < 130) { if (l < 0) l = x; r = x; }
        }
        spans[y] = l >= 0 ? [l, r] : [0, -1];
        if (l >= 0) { if (y < top) top = y; if (y > bottom) bottom = y; }
      }
      let cx0 = 400, w0 = 0;
      for (let y = top; y <= bottom; y++) { const [l, r] = spans[y]; if (r - l > w0) { w0 = r - l; cx0 = (l + r) / 2; } }
      bottleScans.current[src] = { top, bottom, cx: cx0, bw: w0, spans };
      setBottleScanKey(src);
    };
    im.src = src;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, bottle.type, bottle.closure]);
  useEffect(() => {
    const cv = capCanvasRef.current; if (!cv) return;
    const scan = bottleScans.current[bottleScanKey]; if (!scan) return;
    const g = cv.getContext("2d"); if (!g) return;
    g.clearRect(0, 0, 800, 1600);
    /* round 48: "No Capsule" is a CLOSURE TYPE now (was the finish "No cap") */
    if (bottle.closure === "No Capsule") return;
    const zones = CAP_ZONES[bottle.closure] || [];
    const bh = scan.bottom - scan.top;
    g.fillStyle = shadeRgb();
    for (const [a, b2] of zones)
      for (let y = Math.max(0, Math.round(scan.top + a * bh)); y <= Math.min(1599, Math.round(scan.top + b2 * bh)); y++) {
        const [l, r] = scan.spans[y] || [0, -1];
        if (r - l > 3) g.fillRect(l + 2, y, r - l - 3, 1);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bottleScanKey, wheel, shade, bottle.closure, bottle.finish, page, prev]);
  /* ROUND 47 (owner): "Upload Another Label" on the bottle page — a
     customer who ALREADY has a printed label uploads it and the tail of
     the flow flips to assets-only mode (no back shot, no landing page,
     final pack = Marketing Assets only). Without an upload nothing
     anywhere changes. A fresh label generation clears it. */
  const [customLabel, setCustomLabel] = useState<string | null>(null);
  const [customDims, setCustomDims] = useState({ w: 110, h: 80 });
  /* ROUND 48 (owner): Wine Color section on the bottle page. Generated
     flow preselects it from the front label's Colour field; an own-label
     upload clears EVERY section and the next arrow gates until each one
     has a pick. */
  const [wineColor, setWineColor] = useState("");
  useEffect(() => {
    if (page !== "bottle" || customLabel || wineColor) return;
    const src = (f.colour || DEMO_FRONT.colour).toLowerCase();
    setWineColor(/white|თეთრ/.test(src) ? "White" : /amber|orange|ქარვ/.test(src) ? "Amber" : /ros|pink|ვარდ/.test(src) ? "Rosé" : "Red");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);
  /* marketing assets (round 13): 2 product shots + 5 lifestyle images */
  const [assets, setAssets] = useState<{ front?: { full: string; prev: string }; back?: { full: string; prev: string }; life: { full: string; prev: string }[] }>({ life: [] });
  const [assetsSig, setAssetsSig] = useState("");
  const [assetsStage, setAssetsStage] = useState("");
  const assetsRunning = useRef(false);
  /* living loaders (round 17 #1): a slow tick keeps every glass rising */
  const [tick, setTick] = useState(0);
  const assetT = useRef({ run: 0, stage: 0 });
  const dreamT = useRef(Date.now());
  const bottleTouched = useRef(false);
  /* round 40 #3: true while the last navigation came from a progress-bar
     click — jump-ahead pages show placeholders instead of generating */
  const barJumped = useRef(false);
  useEffect(() => {
    if (!(assetsStage || page === "loader")) return;
    const iv = setInterval(() => setTick((t) => t + 1), 700);
    return () => clearInterval(iv);
  }, [assetsStage, page]);
  useEffect(() => { dreamT.current = Date.now(); }, [genProgress, page]);
  /* the displayed wine level never goes DOWN (creep resets on real jumps) */
  const fillMax = useRef(0);
  useEffect(() => { if (page === "loader") fillMax.current = 0; }, [page]);
  /* round 59 #5: FOUR lifestyle images per set */
  /* 2026-09-23 (owner: "only the first glass fills, the rest stay empty
     until their image appears"): this list still named FOUR lifestyle
     stages ("…/4") after round 71 went back to five — the server says
     "lifestyle N/5", so every lifestyle glass missed its stage and sat
     at the bottom */
  const ASSET_STAGES = ["front shot", "back shot", "lifestyle 1/5", "lifestyle 2/5", "lifestyle 3/5", "lifestyle 4/5", "lifestyle 5/5"];
  const assetFill = (key: string) => {
    void tick;   // ticking re-render drives the rise
    const now = Date.now();
    const cur = ASSET_STAGES.indexOf(assetsStage);
    const idx = ASSET_STAGES.indexOf(key);
    if (cur < 0 || idx < 0) return 0.08;
    if (idx < cur) return 0.93;                                                 // done, image imminent
    /* round 41 #17: STEPPED rises — a clear nudge every few seconds, so a
       glass never looks stuck even when the render is slow */
    /* round 86 #2: bigger, quicker steps — 8 % every 1.5 s on the active
       glass, 5 % every 3 s while waiting */
    if (idx === cur) return Math.min(0.9, 0.2 + Math.floor((now - assetT.current.stage) / 1500) * 0.08);
    return Math.min(0.6, 0.1 + Math.floor((now - assetT.current.run) / 3000) * 0.05);
  };

  /* round 17 #2: the front label's wording suggests the bottle type */
  useEffect(() => {
    if (tutRef.current >= 0) return;          /* round 71 #4 */
    if (page !== "bottle" || bottleTouched.current) return;
    const txt = [f.wineType, f.grape, f.wine, f.appellation, f.regionCountry, f.special, f.classification].filter(Boolean).join(" ").toLowerCase();
    let type = "";
    /* round 37 #1: Georgian wording detects too — the owner types the wine
       type in Georgian when the GEO interface is on */
    if (/sparkling|champagne|prosecco|cava|cr[ée]mant|p[ée]t[\s-]?nat|ცქრიალა|შამპან|პროსეკო/.test(txt)) type = "Sparkling";
    else if (/ice\s?wine|eiswein|აისვაინ|ყინულის ღვინო/.test(txt)) type = "Ice Wine";
    else if (/riesling|gew[uü]rztraminer|alsace|rhine|mosel|რისლინგ|ელზას/.test(txt)) type = "Alsace / Rhine";
    else if (/pinot noir|burgund|bourgogne|chardonnay|პინო|შარდონე|ბურგუნდ/.test(txt)) type = "Burgundy";
    if (type) setBottle((m) => ({
      ...m, type,
      closure: type === "Sparkling" ? "Sparkling Cork" : m.closure === "Sparkling Cork" ? "Cork" : m.closure,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);
  /* ---- ROUND 71 #4: walkthrough state ---- */
  const [tut, setTut] = useState(-1);          /* -1 = off, else 0..6 */
  const tutRef = useRef(-1);
  useEffect(() => { tutRef.current = tut; }, [tut]);
  const tutTok = useRef(0);                    /* cancels a half-played step */
  const [ripple, setRipple] = useState<{ x: number; y: number; n: number } | null>(null);
  const rippleN = useRef(0);
  /* round 72 #11: a visible pointer travels to whatever it is about to
     click — without it things simply happened on their own and read as a
     glitch rather than as somebody working */
  const [cursor, setCursor] = useState<{ x: number; y: number; ms: number } | null>(null);
  /* round 72 #14: the product page publishes AFTER the images are in */
  const [tutLanding, setTutLanding] = useState(false);
  /* round 73 #2: when a step's script ends the arrow inflates twice, so
     they know the turn is theirs */
  const [nudge, setNudge] = useState(0);
  const [pressed, setPressed] = useState(0);   /* round 85 #4: the self-press */

  const [packSel, setPackSel] = useState<boolean[]>([true, true, true, false]);
  const [agree, setAgree] = useState(false);
  /* ROUND 75 (owner): the new Final Pack has TWO buttons — Download stays
     grey and dead until "Proceed to payment" has gone through */
  const [paid, setPaid] = useState(false);
  /* round 87 (owner): the button announces each change of role on the
     Final Pack — arrow → card on arrival, card → download once paid —
     with the same double pulse the walkthrough's last card uses */
  useEffect(() => {
    if (page !== "checkout") return;
    const id = setTimeout(() => setNudge((n) => n + 1), SLIDE_MS + 120);
    return () => clearTimeout(id);
  }, [page, paid]);
  useEffect(() => {
    if (page !== "checkout") { treeReveal.current = false; return; }
    setTreeN((n) => n + 1);
    treeReveal.current = true;
    const id = setTimeout(() => { treeReveal.current = false; }, 2800);
    return () => clearTimeout(id);
  }, [page]);
  useEffect(() => { setBackSaved(false); }, [backPng]);
  useEffect(() => { setAssetsSaved(false); }, [assetsSig]);
  const [warn, setWarn] = useState("");
  /* ROUND 27: honest barcode — we never invent digits; the winery types its
     own number. ROUND 29 #1/#7: any 12- or 13-digit number is ACCEPTED and
     drawn (testing with random digits must work) — we only auto-correct the
     final check digit so the printed EAN actually scans. */
  const [gtin, setGtin] = useState("");
  const gtinValid = (() => { const d = gtin.replace(/\D/g, ""); return d.length === 12 || d.length === 13; })();
  const gtinNorm = (() => {
    if (!gtinValid) return "";
    const data = gtin.replace(/\D/g, "").slice(0, 12);
    let s = 0; for (let i = 0; i < 12; i++) s += +data[i] * (i % 2 ? 3 : 1);
    return data + ((10 - (s % 10)) % 10);
  })();
  const [qrMode, setQrMode] = useState<"" | "create" | "upload">("");
  /* ROUND 63 #4 (owner): markets are picked from a dropdown now */
  const [marketOpen, setMarketOpen] = useState(false);
  useEffect(() => { if (page !== "backdetails") setMarketOpen(false); }, [page]);
  /* ROUND 109: the walkthrough's card is left-aligned with the station's
     LABEL, and a label is centred on its stop — so its width has to be
     measured. One canvas, memoised per string+font. */
  const textWCache = useRef(new Map<string, number>());
  const textW = (text: string, font: string) => {
    const k = font + "|" + text;
    const hit = textWCache.current.get(k);
    if (hit !== undefined) return hit;
    let w = text.length * 7;
    try {
      const c = document.createElement("canvas").getContext("2d");
      if (c) { c.font = font; w = c.measureText(text).width; }
    } catch { /* the estimate stands */ }
    textWCache.current.set(k, w);
    return w;
  };
  /* live font metrics of 'italic 15px HNW' (per-browser; Safari ≠ Chrome) */
  const [fm, setFm] = useState({ a: 14.28, d: 3.19 });
  useEffect(() => {
    const go = () => {
      try {
        const c = document.createElement("canvas").getContext("2d");
        if (!c) return;
        c.font = "italic 15px HNW";
        const m = c.measureText("Hg");
        if (m.fontBoundingBoxAscent) setFm({ a: m.fontBoundingBoxAscent, d: m.fontBoundingBoxDescent });
      } catch { /* keep defaults */ }
    };
    if (document.fonts?.load) document.fonts.load("italic 15px HNW").then(go, go);
    else go();
  }, []);
  /* round 8 #13 (round 27: barcode row gone): entering checkout, the QR row
     follows the back-details choice; designer-edit always starts unmarked.
     ROUND 47: an own-label order preselects ONLY Marketing Assets. */
  useEffect(() => {
    if (page !== "checkout") return;
    /* ROUND 53 #6 (owner): the T&C ring starts UNCHECKED — always */
    setAgree(false); setPaid(false);
    if (customLabel) setPackSel([false, false, true, false]);
    else setPackSel((ps) => [ps[0], qrMode !== "upload", ps[2], false]);
  }, [page, qrMode, customLabel]);

  /* MARKETING ASSETS (round 13): entering the assets page kicks off the
     generation run (2 product shots + 5 lifestyle) unless the same brief
     is already generated. Sequential on the server (~5 imgs/min cap). */
  useEffect(() => {
    /* round 71 #4: the walkthrough paints its own sample set — it must
       never reach the paid generator */
    if (tutRef.current >= 0) return;
    if (page !== "assets" || assetsRunning.current) return;
    /* ROUND 47: an uploaded own label stands in for the generated front —
       otherwise a selected dream is still required */
    if (!customLabel && (selected < 0 || !viewedDream(selected))) return;
    /* round 40 #3: a progress-bar JUMP never starts a paid generation —
       placeholders show "Not yet created"; the run starts only when the
       page is reached through the normal flow (bottle → next) */
    if (barJumped.current && !assets.front && !assets.back) return;
    const sel = customLabel ? { style: "contemporary", dream: customLabel, preview: null } : viewedDream(selected)!;
    /* round 21 #7: NO client-side "same inputs" skip — it knew nothing
       about admin charter changes and replayed stale sets. The server
       cache (charter-aware since round 19) answers true duplicates
       instantly, so refetching costs nothing. */
    const sig = JSON.stringify({ fs: frontSig, bs: backSig, bottle, wc: wineColor, rgb: wheel.rgb, shade, sel: sel.style, cl: customLabel ? customLabel.length + customLabel.slice(-64) : "" });
    /* ROUND 50 #9 (owner: "old bottle still in the landing thumbs!"):
       any changed input invalidates the previously published page — the
       thumb shows its loader until the fresh publish lands */
    if (assetsSig && sig !== assetsSig) setProductUrl("");
    /* ROUND 54 #2: a NEW brief pauses for the confirmation popup — the
       run starts from its Create button (revisits of the same brief
       replay the server cache silently) */
    /* …except in the guided tour (owner, 2026-09-26: no "check your
       details" in either tutorial mode — the walkthrough never reaches here) */
    if (sig !== assetsSig && confirmedAssetsSig.current !== sig && guide < 0) {
      pendingAssetsSig.current = sig;
      setConfirmModal("assets");
      return;
    }
    assetsRunning.current = true;
    (async () => {
      /* round 56 #3 (TEMP dev switch): fake the whole run with whatever
         art already exists — same stages, no API, no cost */
      if (!liveGenRef.current) {
        setAssets({ life: [] }); setLifeTarget(5); setLifeOrder([0, 1, 2, 3, 4]);
        assetT.current = { run: Date.now(), stage: Date.now() };
        const lab = sel.preview || sel.dream;
        setAssetsStage("front shot"); await sleep(700);
        setAssets((a2) => ({ ...a2, front: { full: lab, prev: lab } }));
        if (backPng && !customLabel) {
          setAssetsStage("back shot"); await sleep(550);
          setAssets((a2) => ({ ...a2, back: { full: backPng, prev: backPng } }));
        }
        for (let i = 0; i < 5; i++) {
          setAssetsStage(`lifestyle ${i + 1}/5`); await sleep(420);
          setAssets((a2) => { const life = [...a2.life]; life[i] = { full: lab, prev: lab }; return { ...a2, life }; });
        }
        setAssetsSig(sig);
        setAssetsStage("");
        assetsRunning.current = false;
        return;
      }
      const got = { front: "", back: "", life: [] as string[] };
      try {
        setAssets({ life: [] }); setLifeTarget(5); setLifeOrder([0, 1, 2, 3, 4]);
        assetT.current = { run: Date.now(), stage: Date.now() };
        setAssetsStage("preparing");
        let backData: string | null = null;
        /* ROUND 47: own-label mode makes NO back product shot */
        if (backPng && !customLabel) {
          try {
            const blob = await (await fetch(backPng)).blob();
            backData = await new Promise<string>((res) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result)); rd.readAsDataURL(blob); });
          } catch { /* back shot is optional */ }
        }
        let seed = 5381; for (let i = 0; i < sig.length; i++) seed = ((seed * 33) ^ sig.charCodeAt(i)) >>> 0;
        const r = await fetch("/api/marketing-assets", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            front: sel.dream, back: backData,
            /* 2026-09-25: the server reads the label's own words from it */
            frontId: customLabel ? undefined : sel.id,
            backSpec: backData ? backSpec.current : undefined,
            bottle: { type: bottle.type, color: bottle.color, closure: bottle.closure, finish: bottle.finish, closureColour: shadeRgb() },
            wine: { colour: wineColor || f.colour || "Red", name: f.wine || "Wine", grape: (f.grape || "").trim() },
            labelMM: customLabel ? customDims : { w: Number(f.width) || 110, h: Number(f.height) || 80 },
            /* ROUND 51 #9 (owner: back-shot label height STILL drifts):
               the back shot used to claim the FRONT label's width — the
               model rescaled to honour it and the height drifted. Send
               the back label's true mm (same height, its own width). */
            backLabelMM: backData ? { w: Math.round((((Number(f.height) || 80)) * (backDims.w / Math.max(1, backDims.h))) / 5) * 5, h: Number(f.height) || 80 } : undefined,
            style: sel.style, seed,
          }),
        });
        if (!r.ok || !r.body) throw new Error(`assets failed (${r.status})`);
        const reader = r.body.getReader(); const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
            if (!line) continue;
            const m = JSON.parse(line);
            if (m.type === "progress") { assetT.current.stage = Date.now(); setAssetsStage(m.stage || ""); }
            else if (m.type === "shot") { if (m.side === "front") got.front = m.preview || m.image; else got.back = m.preview || m.image; setAssets((a) => ({ ...a, [m.side]: { full: m.image, prev: m.preview || m.image } })); }
            else if (m.type === "life") { got.life[m.i] = m.preview || m.image; setAssets((a) => { const life = [...a.life]; life[m.i] = { full: m.image, prev: m.preview || m.image }; return { ...a, life }; }); }
          }
        }
        setAssetsSig(sig);
        /* PRODUCT PAGE snapshot (owner 2026-09-08): QR requested → publish
           /p/<code> from everything known at this moment.
           ROUND 47: own-label mode builds NO landing page. */
        if (qrMode === "create" && !customLabel) {
          try {
            /* round 86: the product page carried the Château Margaux demo
               values for every field the customer left empty (found on the
               KORRA page) — the last of the demo fallbacks goes */
            const fx2 = (k: string) => f[k]?.trim() || "";
            const r2 = await fetch("/api/product", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                code: productCode.current,
                wine: {
                  producer: fx2("producer"), wine: fx2("wine"), appellation: fx2("appellation"),
                  classification: fx2("classification"), vintage: fx2("vintage"), grape: fx2("grape"),
                  regionCountry: fx2("regionCountry"), special: fx2("special"), sweetness: fx2("sweetness"),
                  colour: fx2("colour"), wineType: fx2("wineType"), alcohol: fx2("alcohol"), volume: fx2("volume"),
                  producerCompany: b.producerCompany || "", producerAddress: b.producerAddress || "",
                  importer: b.importer || "", importerAddress: b.importerAddress || "",
                  bottlingDate: b.bottlingDate || "", lot: b.lot || "", web: b.web || "",
                },
                description: b.description || "",
                ingredients,
                images: { front: got.front, back: got.back, life: got.life.filter(Boolean) },
              }),
            });
            if (r2.ok) {
              setProductUrl(`/p/${productCode.current}`);
              try { localStorage.setItem("nui-product-code", productCode.current); } catch { }
            }
          } catch { /* page can be published on a later pass */ }
        }
      } catch (e) {
        /* round 68 #4: a failed run used to vanish silently and leave the
           page looking half-generated — say so, and let a revisit retry */
        console.error("[assets]", e);
        setWarn(t("Generation failed — please try again"));
        setTimeout(() => setWarn(""), 5000);
      }
      setAssetsStage("");
      assetsRunning.current = false;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, assetsTick]);
  /* ROUND 56 (owner's PSD): "More Variations" — each press buys 5 more
     lifestyle images; the thumbs grid densifies to fit them all */
  const [lifeTarget, setLifeTarget] = useState(5);
  /* ROUND 74 #2 (owner): the marketing images can be re-ordered by hand —
     lifeOrder[0] is whatever is showing big, the rest are the thumbs, and
     clicking a thumb swaps it with the hero */
  const [lifeOrder, setLifeOrder] = useState([0, 1, 2, 3, 4]);
  const moreRunning = useRef(false);
  async function moreVariations() {
    if (assetsRunning.current || moreRunning.current || assetsStage) return;
    const sel = customLabel ? { style: "contemporary", dream: customLabel, preview: null as string | null } : viewedDream(selected);
    if (!sel) return;
    const base = lifeTarget;
    const batch = Math.floor(base / 5);
    setLifeTarget(base + 5);
    moreRunning.current = true;
    assetT.current = { run: Date.now(), stage: Date.now() };
    try {
      if (!liveGenRef.current) {
        for (let i = 0; i < 5; i++) {
          setAssetsStage(`lifestyle ${i + 1}/5`); await sleep(450);
          setAssets((a2) => { const life = [...a2.life]; const src = a2.life[i]?.prev || sel.preview || sel.dream; life[base + i] = { full: src, prev: src }; return { ...a2, life }; });
        }
      } else {
        setAssetsStage("preparing");
        let seed = 5381; const sg = assetsSig || "more";
        for (let i = 0; i < sg.length; i++) seed = ((seed * 33) ^ sg.charCodeAt(i)) >>> 0;
        const r = await fetch("/api/marketing-assets", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            front: sel.dream, back: null, frontId: customLabel ? undefined : sel.id,
            bottle: { type: bottle.type, color: bottle.color, closure: bottle.closure, finish: bottle.finish, closureColour: shadeRgb() },
            wine: { colour: wineColor || f.colour || "Red", name: f.wine || "Wine", grape: (f.grape || "").trim() },
            labelMM: customLabel ? customDims : { w: Number(f.width) || 110, h: Number(f.height) || 80 },
            style: sel.style, seed, lifeOnly: true, batch,
            /* 2026-09-23: the scenes copy this very bottle photo */
            frontShot: [assets.front?.prev, assets.front?.full].find((u) => u && u.startsWith("data:image/")) || null,
          }),
        });
        if (!r.ok || !r.body) throw new Error(`more variations failed (${r.status})`);
        const reader = r.body.getReader(); const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
            if (!line) continue;
            const m = JSON.parse(line);
            if (m.type === "progress") { assetT.current.stage = Date.now(); setAssetsStage(m.stage || ""); }
            else if (m.type === "life") setAssets((a2) => { const life = [...a2.life]; life[base + m.i] = { full: m.image, prev: m.preview || m.image }; return { ...a2, life }; });
          }
        }
      }
    } catch { /* missing slots stay grey; another press retries */ }
    setAssetsStage("");
    moreRunning.current = false;
  }
  const [imgDims, setImgDims] = useState<Record<number, { w: number; h: number }>>({});
  useEffect(() => {
    dreams.forEach((d, i) => {
      if (!d) return;   /* round 45: variation slots fill in one by one */
      const im = new Image();
      im.onload = () => setImgDims((m) => ({ ...m, [i]: { w: im.width, h: im.height } }));
      im.src = d.preview || d.dream;
    });
  }, [dreams]);
  const [busyMsg, setBusyMsg] = useState("");
  const dragRef = useRef<"" | "wheel" | "shade" | "terms">("");
  /* round 18 #5: every order gets a product code — the QR points to its
     future landing page (domain configurable when it exists) */
  const productCode = useRef(Math.random().toString(36).slice(2, 10));
  /* ROUND 112 #4 (owner's artboards): the ARTISTS pages — an index of
     everyone who trained a model, and a page each. Read from the public
     /api/artists (name, biography, link and the pictures on disk). */
  interface SiteArtist { id: string; name: string; bio: string; link: string; linkKind: "instagram" | "site" | ""; instagram: string; website: string; portrait: string; crop: string; works: string[]; labels: string[] }
  const [siteArtists, setSiteArtists] = useState<SiteArtist[]>([]);
  const [artistId, setArtistId] = useState("");
  /* round 113 #6: her page shows two sets — her own paintings, or the
     labels already painted in her hand */
  const [artistView, setArtistView] = useState<"art" | "labels">("art");
  const artistsFrom = useRef<PageKey>("welcome");
  /* the artist a visitor chose on that page: every column then paints in
     her hand instead of the three the admin set */
  const [chosenArtist, setChosenArtist] = useState("");
  useEffect(() => {
    fetch("/api/artists").then((r) => r.json()).then((b) => setSiteArtists(b.artists || [])).catch(() => { });
  }, []);
  /* 2026-09-23 (owner: "in the middle of the tutorial, 8K took me home
     but the bar still said Front Label Details"): the header's links, like
     the browser's Back (round 108 #21), stop the story before they go */
  const openArtists = () => { if (tutRef.current >= 0) stopTutRef.current(); if (page !== "artists" && page !== "artist") artistsFrom.current = pageNow.current; go("artists"); };
  const [boards, setBoards] = useState<Record<string, string>>({});
  const [boardsGe, setBoardsGe] = useState<Record<string, string>>({});
  useEffect(() => {
    /* inline the artboards: SVG-in-<img> cannot use page fonts (the
       owner's Safari font complaint) — inline SVG can */
    /* 2026-09-23 (owner: "a 404 flashes before the loader glass"): the
       "blank" step has no artboard — its fetch came back as the site's 404
       PAGE and that HTML was inlined as the board under the confirm popup.
       It is not fetched, and a board that fails to load is never inlined. */
    ORDER.filter((p) => p !== "artists" && p !== "artist" && p !== "blank").forEach((p) => {
      fetch(`/newui/${p}.svg`).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${p}.svg ${r.status}`)))).then((t) =>
        {
          const processed = namespaceSvg(t, p).replace(/<\?xml[^>]*\?>/, "").replace(/<svg /, '<svg preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%" ')
            /* Mtavruli titles: HNW lacks Georgian capitals — Apple's own
               Helvetica Neue supplies them seamlessly (round 24 #1) */
            .replace(/'Helvetica Neue World'/g, "'Helvetica Neue World','Helvetica Neue'")
            /* ROUND 47 (owner): the details page is titled like the back one */
            .replace(/>FRONT LABEL</, ">FRONT LABEL DETAILS<")
            /* ROUND 48 (owner: Wine Color column + No Capsule): the bottle
               board's THREE baked column dividers and their six corner
               crosses are stripped — the options zone is redrawn live as
               FIVE columns (the content itself is white-patched) */
            .replace(p === "bottle" ? /<line[^>]*x1="(?:582\.8[56]|822\.8[56]|1062\.8[56]|591\.1|574\.62|831\.1|814\.62|1071\.09|1054\.61)"[^>]*\/>/g : /$^/g, "")
            /* ROUND 49 #3 (owner): "all" leaves the compliance subtitle in
               both languages (the GEO key in SVG_GE matches this new text) */
            .replace("incorporate all required regulatory information", "incorporate required regulatory information")
            /* 2026-09-23 (owner's Homepage_Visual): the home page's
               headline and subline are drawn live now, at the new size
               and places — the board's baked copies go */
            .replace(p === "welcome" ? /<text class="welcome-st[01]"[\s\S]*?<\/text>/g : /$^/g, "");
          setBoards((m) => ({ ...m, [p]: processed }));
          setBoardsGe((m) => ({ ...m, [p]: translateSvg(processed) }));
        }
      ).catch(() => {});
    });
  }, []);
  const wheelCanvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    /* round 40 (owner): the whole active area at 80% — a single uniform
       transform, so internal alignment cannot shift */
    const fit = () => setScale(Math.max(1, window.innerWidth / W) * 0.8);
    fit(); window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  /* colour wheel sampling canvas */
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = 137; c.height = 137;
      c.getContext("2d")!.drawImage(img, 0, 0, 137, 137);
      wheelCanvas.current = c;
    };
    img.src = "/newui/colorwheel.png";
  }, []);

  /* ROUND 33 (owner: "at loader end the previous page's elements flash and
     slide away"): go() used to read `page` from its render closure — an
     async flow that navigated twice (front → loader … 25s … → options)
     called a STALE go that still believed the page was "front", so the
     front form replayed as the exiting layer instead of the loader fading.
     The current page now lives in a ref that never goes stale. */
  const pageNow = useRef<PageKey>("welcome");
  const go = useCallback((next: PageKey, d = 1, hist = true) => {
    const cur = pageNow.current;
    if (next === cur) return;
    pageNow.current = next;
    setPrev(cur); setDir(d); setPage(next);
    /* ROUND 65 (owner): the browser's own Back button walks the wizard —
       every step is a history entry. The loader is a waypoint, never a
       destination, so it adds none (back from the labels page lands on
       Your Vision, not on a dead loader). */
    if (hist && next !== "loader") {
      try { window.history.pushState({ page: next }, "", `?page=${next}`); } catch { }
    }
    /* into the loader the fade starts only after the slide-out (round 9 #1);
       out of the loader the fade completes before the slide (round 21 #1);
       slice cascades extend the settle per page (round 16 #3) */
    const md = SLIDE_MS + Math.max(maxSliceDelay(cur), maxSliceDelay(next));
    const extra = next === "loader" || cur === "loader" ? FADE_MS : 0;
    setTimeout(() => setPrev(null), md + extra + 60);
  }, []);

  /* ROUND 65: Back/Forward in the browser drive the same navigation */
  /* round 108 #21 (owner): Back during the walkthrough used to leave the
     story running behind the page it landed on — it stops the story first */
  const stopTutRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const st = (e.state || {}) as { page?: string };
      const target = st.page && (ORDER as readonly string[]).includes(st.page) ? (st.page as PageKey) : "welcome";
      if (tutRef.current >= 0) stopTutRef.current();
      if (target === pageNow.current) return;
      /* a history jump must never start a paid generation */
      barJumped.current = true;
      go(target, ORDER.indexOf(target) > ORDER.indexOf(pageNow.current) ? 1 : -1, false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [go]);

  const goBack = useCallback(() => {
    const i = ORDER.indexOf(page);
    if (i > 0) go(ORDER[i - 1] === "loader" ? "vision" : ORDER[i - 1], -1);
  }, [page, go]);

  /* ================= ROUND 71 #4: the walkthrough driver ==============
     Each step plays a short script against the REAL page state, so what
     the visitor watches is the actual product filling itself in. Every
     script is cancellable: bumping the token abandons the one in flight
     (they can press the arrow faster than the typing). */
  const tutReset = useCallback(() => {
    setVision(""); setSketch(null); setF({ width: "110", height: "80" }); setB({});
    /* the dev "fill details" switch, when on, refills what was just wiped */
    try { if (localStorage.getItem("nui-fill") === "1") { const r = randomDetails(); setF({ width: "110", height: "80", ...r.front }); setB(r.back); setGtin(r.gtin); } } catch { }
    setDreams([]); setStyleVars([[], [], []]); setSelected(-1); setFrontSig("");
    setBackPng(""); setBackSig(""); setBackDims({ w: 1, h: 1 });
    setMarkets([]); setNoComp(true); setGtin(""); setQrMode(""); setIngredients("");
    setBottle({ type: "Bordeaux", color: "Olive Green", closure: "Cork", finish: "Matte" });
    setWineColor(""); bottleTouched.current = false;
    setAssets({ life: [] }); setAssetsSig(""); setAssetsStage("");
    setCarIdx(0); setAgree(false); setProductUrl("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startTutorial = useCallback(() => {
    tutTok.current++;
    tutReset();
    tutRef.current = 0; setTut(0);
    setTutLanding(false);
    setCursor({ x: WELCOME_X, y: PROG_Y, ms: 0 });
    /* round 72 #12: the sample back label is fetched now, so the step that
       shows it never flashes an empty slot */
    new Image().src = TUT_BACK;
    go("vision");
  }, [go, tutReset]);

  const stopTutorial = useCallback(() => {
    tutTok.current++;
    tutRef.current = -1; setTut(-1);
    tutReset(); setRipple(null); setCursor(null); setTutLanding(false);
  }, [tutReset]);
  useEffect(() => { stopTutRef.current = stopTutorial; }, [stopTutorial]);

  /* 2026-09-23 (owner, restating his rule: "during the tutorial nothing
     may be pressed except the red button and Skip"): while the story runs,
     every press anywhere else is caught before it lands — header, fields,
     buttons, language switch alike. The two allowed controls carry
     data-tut-ok. The story itself drives state, not clicks, so it is
     untouched. */
  useEffect(() => {
    if (tut < 0) return;
    const block = (e: Event) => {
      if (tutClick.current) return;   /* the story's own press (assets Save) */
      const el = e.target as Element | null;
      if (el && el.closest && el.closest("[data-tut-ok]")) return;
      e.preventDefault(); e.stopPropagation();
    };
    const kinds = ["pointerdown", "mousedown", "click", "dblclick", "touchstart"];
    for (const k of kinds) document.addEventListener(k, block, { capture: true, passive: false });
    return () => { for (const k of kinds) document.removeEventListener(k, block, { capture: true }); };
  }, [tut]);
  /* 2026-09-23 (owner: "when a step's animation has finished and the user
     does nothing, the red button pulses every 3 seconds — a reminder that
     the next step is waiting"): tutIdle is set when a step has played out */
  const [tutIdle, setTutIdle] = useState(false);
  const tutClick = useRef(false);
  /* the back label's own data — the marketing ask reads its words from it */
  const backSpec = useRef<unknown>(null);

  /* THE ORDER KEPT (owner, 2026-09-23: "keep the generated label for the
     session — even if the browser reloads or the internet drops; it
     changes only when it is generated anew"). What the visitor made lives
     in this browser: the idea, the details, the bottle, the three labels
     (by their ids — the images come back from the server) and which one
     was saved. Not while the demo walkthrough plays, and never an empty
     page over a real order. */
  useEffect(() => {
    if (tut >= 0) return;
    const hasAny = dreams.length > 0 || !!vision.trim() || Object.entries(f).some(([k, v]) => k !== "width" && k !== "height" && !!(v || "").trim());
    if (!hasAny) return;
    const rec = {
      v: 1, at: Date.now(), vision, f, b, gtin, qrMode, markets, bottle, wineColor, selected, frontSig, paintSig,
      dreams: dreams.filter(Boolean).filter((d) => d.id).map((d) => ({ style: d.style, id: d.id, artist: d.artist })),
    };
    try { localStorage.setItem("nui-order", JSON.stringify(rec)); } catch { }
  }, [tut, dreams, vision, f, b, gtin, qrMode, markets, bottle, wineColor, selected, frontSig, paintSig]);
  useEffect(() => {
    let rec: { v?: number; vision?: string; f?: Record<string, string>; b?: Record<string, string>; gtin?: string; qrMode?: string; markets?: string[]; bottle?: Record<string, string>; wineColor?: string; selected?: number; frontSig?: string; paintSig?: string; dreams?: { style: string; id?: string; artist?: string }[] } | null = null;
    try { rec = JSON.parse(localStorage.getItem("nui-order") || "null"); } catch { }
    if (!rec || rec.v !== 1) return;
    setVision(rec.vision || ""); setF(rec.f || { width: "110", height: "80" }); setB(rec.b || {});
    setGtin(rec.gtin || ""); setQrMode((rec.qrMode || "") as never); setMarkets(rec.markets || []);
    if (rec.bottle) { setBottle(rec.bottle); bottleTouched.current = true; }
    setWineColor(rec.wineColor || "");
    const ds = (rec.dreams || []).filter((d) => d.id);
    if (!ds.length) return;
    const toData = async (u: string) => {
      const bl = await (await fetch(u)).blob();
      return new Promise<string>((res) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result)); rd.readAsDataURL(bl); });
    };
    (async () => {
      try {
        const got: Dream[] = await Promise.all(ds.map(async (d) => ({
          style: d.style, id: d.id, artist: d.artist,
          dream: await toData(`/api/dream-label?id=${d.id}`), preview: await toData(`/api/dream-label?id=${d.id}&kind=preview`),
        })));
        setDreams(got); setSelected(rec!.selected ?? -1); setFrontSig(rec!.frontSig || ""); setPaintSig(rec!.paintSig || "");
      } catch { /* the labels are gone from the server — the details stay */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* THE GUIDED TOUR moves on by itself when the visitor has done what its
     note asked (guide.ts `done`); a note to read waits for Next. It follows
     the visitor BOTH ways (owner, 2026-09-23 #1): pressing on past a page
     jumps to that page's first note, stepping back (Edit Details, Back)
     returns to the last note of the page they are on — so the black note
     is always about where they stand. */
  const GUIDE_PAGES = ["vision", "loader", "options", "backdetails", "backdesign", "bottle", "assets", "checkout"];
  const [guideWarn, setGuideWarn] = useState(-1);      /* the step whose Next already warned once */
  /* 2026-09-27: a note whose action is done shows "✓" a moment first */
  const [guideOk, setGuideOk] = useState(-1);
  const guideOkRef = useRef(-1);
  const [guideTick, setGuideTick] = useState(0);
  const createRect = useRef({ x: 735.5, y: 560, w: 354.5, h: 30 });
  const pageSince = useRef(Date.now());
  useEffect(() => { pageSince.current = Date.now(); }, [page]);
  const guideDoneNow = (d?: string) => {
    if (!d) return true;
    const cur = GUIDE_PAGES.indexOf(page);
    return d.startsWith("page:") ? cur >= GUIDE_PAGES.indexOf(d.slice(5))
      : d === "vision" ? vision.trim().split(/\s+/).filter(Boolean).length >= 3
      : d === "selected" ? selected >= 0
      : d === "markets" ? markets.length > 0
      : d === "backSaved" ? backSaved
      : d === "assetsReady" ? !assetsStage && !!assets.front
      : d === "assetsSaved" ? assetsSaved
      : d === "confirm" ? !!confirmModal
      : d === "marketClosed" ? markets.length > 0 && !marketOpen
      : false;
  };
  const guideNeedsMet = (n?: string) =>
    !n ? true
      : n === "details" ? FRONT_ROWS.some((k) => (f[k] || "").trim())
      : n === "backText" ? !!(b.description || "").trim()
      : n === "backFields" ? ["producerCompany", "producerAddress", "importer", "importerAddress", "bottlingDate", "lot", "web"].some((k) => (b[k] || "").trim())
      : n === "bottle" ? bottleTouched.current || !!wineColor
      : true;
  useEffect(() => {
    if (guide < 0) return;
    const st = GUIDE[guide];
    if (!st) { setGuide(-1); return; }
    const cur = GUIDE_PAGES.indexOf(page);
    const stIdx = GUIDE_PAGES.indexOf(st.page);
    const lastOf = (pg: string) => { for (let k = GUIDE.length - 1; k >= 0; k--) if (GUIDE[k].page === pg && !GUIDE[k].modal) return k; return -1; };
    /* a popup note whose popup closed back onto its own page: Edit Details */
    if (st.modal && !confirmModal && page === st.page) { const k = lastOf(page); if (k >= 0 && k !== guide) { setGuide(k); return; } }
    if (!confirmModal && cur >= 0) {
      /* stepped back */
      if (cur < stIdx) { const k = lastOf(page); if (k >= 0) { setGuide(k); return; } }
      /* pressed on past this page — but a "press the red button" note that
         opens a popup waits a moment for that popup first */
      if (cur > stIdx) {
        if (st.done === "confirm" && Date.now() - pageSince.current < 2500) {
          const id = setTimeout(() => setGuideTick((n) => n + 1), 2600);
          return () => clearTimeout(id);
        }
        const k = GUIDE.findIndex((g) => g.page === page && !g.modal);
        if (k > guide) { setGuide(k); return; }
      }
    }
    /* a popup's note is done only once its popup has closed — the
       marketing popup opens on a page that already "counts" as reached */
    if (st.done && (!st.modal || !confirmModal) && guideDoneNow(st.done)) {
      /* an action done on this page shows its "✓" for a moment; a page
         change moves on at once (the note has already left with its page) */
      if (st.done.startsWith("page:") || st.wait) { setGuide(guide + 1); return; }
      if (guideOkRef.current === guide) return;
      guideOkRef.current = guide; setGuideOk(guide);
      setTimeout(() => { setGuideOk(-1); setGuide((g) => (g === guide ? g + 1 : g)); }, 700);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guide, guideTick, page, vision, selected, markets, marketOpen, backSaved, assetsStage, assets.front, assetsSaved, confirmModal]);
  useEffect(() => {
    if (tut < 0 || !tutIdle) return;
    setNudge((n) => n + 1);
    const id = setInterval(() => setNudge((n) => n + 1), 3000);
    return () => clearInterval(id);
  }, [tut, tutIdle]);

  const endTutorial = useCallback(() => {
    stopTutorial();
    /* round 72 #2: straight into the real Your Vision page, not the home
       page — they have just watched the whole story, so they start work */
    go("vision");
  }, [go, stopTutorial]);

  useEffect(() => {
    setTutIdle(false);
    if (tut < 0) return;
    const tok = ++tutTok.current;
    const live = () => tok === tutTok.current;
    /* round 88 #3 (owner: "feels rushed"): every pause runs at 1.45× */
    const TUT_PACE = 1.2;                     /* round 94 #11: a touch quicker again */
    const hold = (ms: number) => new Promise<boolean>((r) => setTimeout(() => r(live()), ms * TUT_PACE));
    /* round 72 #10: nobody works to a metronome — every pause is nudged
       off the beat, and typing slows at spaces and stops at punctuation */
    let beatN = 0;
    const beat = (base: number) => hold(Math.round(base * (0.72 + ((beatN++ * 37) % 13) / 22)));
    const type = async (text: string, put: (v: string) => void, ms = 14) => {
      for (let i = 1; i <= text.length; i++) {
        put(text.slice(0, i));
        const ch = text[i - 1];
        let d = ms * (0.65 + ((i * 13) % 8) / 10);
        if (ch === " ") d *= 1.6;
        if (".,;—!?".includes(ch)) d *= 4.5;
        if (!(await hold(d))) return false;
      }
      return true;
    };
    const field = async (k: string, v: string) => type(v, (x) => setF((m) => ({ ...m, [k]: x })), 18);
    const backField = async (k: string, v: string) => type(v, (x) => setB((m) => ({ ...m, [k]: x })), 10);
    /* round 72 #8/#11: the pointer travels there, then a red ring blooms */
    const move = async (at: readonly number[], ms = 520) => {
      if (!live()) return false;
      setCursor({ x: at[0], y: at[1], ms });
      return hold(ms + 40);
    };
    /* round 90 #1 (owner): what the click selects is marked ON the click —
       `onTap` runs the instant the ring blooms, the beat comes after */
    const tap = async (at: readonly number[], after = 340, ms = 520, onTap?: () => void) => {
      if (!(await move(at, ms))) return false;
      setRipple({ x: at[0], y: at[1], n: ++rippleN.current });
      onTap?.();
      return beat(after);
    };
    /* round 73 #4: a pick on the colour wheel, sampled the same way the
       real pointer handler samples it */
    const pickWheel = (fx: number, fy: number) => {
      let rgb = DEMO_WHEEL.rgb as number[];
      const c = wheelCanvas.current;
      if (c) {
        const d = c.getContext("2d")!.getImageData(Math.round(fx * 136), Math.round(fy * 136), 1, 1).data;
        if (d[3] > 40) rgb = [d[0], d[1], d[2]];
      }
      setWheel({ x: fx, y: fy, rgb });
    };
    /* a slow drag along the lightness bar */
    const dragShade = async (from: number, to: number) => {
      if (!(await move([SHADE_X(from), 532.5], 560))) return false;
      setRipple({ x: SHADE_X(from), y: 532.5, n: ++rippleN.current });
      if (!(await hold(240))) return false;
      const N2 = 16;
      for (let i = 1; i <= N2; i++) {
        const v = from + (to - from) * (i / N2);
        setShade(v);
        setCursor({ x: SHADE_X(v), y: 532.5, ms: 60 });
        if (!(await hold(52))) return false;
      }
      return beat(420);
    };

    /* anything the visitor jumped over is filled in at once, so each step
       stands on its own however they got there */
    const seed = () => {
      if (tut > 0) { setVision(DEMO_VISION); setF((m) => ({ ...m, ...DEMO_FRONT })); }
      if (tut > 1) {
        setDreams(["traditional", "contemporary", "punk"].map((st2, i) => ({ style: st2, dream: TUT_LABELS[i], preview: TUT_LABELS[i], artist: TUT_ARTISTS[i] })));
        setSelected(1);
      }
      if (tut > 2) {
        setB({ description: DEMO_DESC, ...DEMO_BACK });
        setGtin("1234543454566"); setQrMode("create"); setMarkets(["US"]); setNoComp(false);
      }
      /* round 72 #12: the back label is set the instant the step begins —
         the image is preloaded when the walkthrough starts, so its empty
         "not yet created" slot is never on screen */
      if (tut >= 3) {
        const pr = new Image();
        pr.onload = () => { setBackDims({ w: pr.width, h: pr.height }); setBackPng(pr.src); };
        pr.src = TUT_BACK;
      }
      if (tut > 4) {
        bottleTouched.current = true; setBottle({ ...DEMO_BOTTLE }); setWineColor("Amber");
        setWheel({ ...DEMO_WHEEL }); setShade(DEMO_SHADE);
      }
      /* round 88 #5: the assets step opens ALREADY loading — no grey
         placeholders before the glasses */
      if (tut === 5) {
        setTutLanding(false);
        setAssets({ life: [] }); setLifeTarget(5); setLifeOrder([0, 1, 2, 3, 4]);
        assetT.current = { run: Date.now(), stage: Date.now() };
        setAssetsStage("front shot");
      }
      if (tut > 5) {
        setLifeTarget(5); setAssetsStage(""); setTutLanding(true);
        setAssets({
          front: { full: TUT_SHOT_F, prev: TUT_SHOT_F },
          back: { full: TUT_SHOT_B, prev: TUT_SHOT_B },
          life: TUT_LIFE.map((u) => ({ full: u, prev: u })),
        });
      }
    };
    seed();

    (async () => {
      /* let the page slide land before anything starts moving */
      if (!(await hold(SLIDE_MS + 260))) return;
      switch (tut) {
        case 0: {
          if (!(await tap(TAP.visionBox))) return;
          if (!(await type(DEMO_VISION, setVision, 13))) return;
          if (!(await hold(520))) return;
          /* round 72 #5: the label's own size gets set before the details */
          if (!(await tap(TAP.width, 300))) return;
          if (!(await type("110", (v) => setF((m) => ({ ...m, width: v })), 150))) return;   /* TSINANDALI: 110 × 80 */
          if (!(await hold(260))) return;
          if (!(await tap(TAP.height, 300))) return;
          if (!(await type("80", (v) => setF((m) => ({ ...m, height: v })), 150))) return;
          if (!(await hold(420))) return;
          if (!(await tap(TAP.firstField, 300))) return;
          for (const k of ["producer", "wine", "appellation", "classification", "vintage", "grape", "regionCountry", "special", "sweetness", "colour", "wineType", "alcohol", "volume"]) {
            if (!(await field(k, DEMO_FRONT[k] || ""))) return;
            if (!(await hold(90))) return;
          }
          break;
        }
        case 1: {
          /* round 72 #9: the real loader plays first — just quicker — and
             the finished designs land straight after it, no grey slots */
          setDreams([]); setSelected(-1);
          /* round 94 #10: a second of loader is enough for a demo */
          for (const g of [0.5, 0.97]) {
            setGenProgress(g);
            if (!(await hold(320))) return;
          }
          if (!(await hold(200))) return;
          setDreams(["traditional", "contemporary", "punk"].map((st2, i) => ({ style: st2, dream: TUT_LABELS[i], preview: TUT_LABELS[i], artist: TUT_ARTISTS[i] })));
          go("options");
          setGenProgress(0);
          if (!(await hold(SLIDE_MS + 900))) return;
          /* round 89 #1 (owner): no variation play — the pointer goes
             straight to Save on the favourite, and the label flies into
             the folder (round 73 #7's re-roll demo retired) */
          /* not saveFront(): this closure was made before the demo labels
             existed, so its `dreams` is empty — set and fly directly (the
             sample labels are 110 × 80 mm → 342.9×249.4 in column 2) */
          if (!(await tap(TAP.optSelect, 200, 520, () => { setSelected(1); flyToFolder([{ src: TUT_LABELS[1], x: 548.5, y: 290, w: 342.9, h: 249.4 }]); }))) return;
          if (!(await hold(900))) return;
          break;
        }
        case 2: {
          if (!(await tap(TAP.descBox))) return;
          if (!(await type(DEMO_DESC, (v) => setB((m) => ({ ...m, description: v })), 8))) return;
          if (!(await hold(320))) return;
          if (!(await tap(TAP.barcode, 300))) return;
          if (!(await type("1234543454566", setGtin, 55))) return;
          if (!(await hold(240))) return;
          if (!(await tap(TAP.qrBtn, 300, 520, () => setQrMode("create")))) return;
          if (!(await beat(560))) return;
          /* round 73 #1: up to the details column, and a click, before a
             single character of it is typed */
          if (!(await tap(TAP.backFirst, 340, 620))) return;
          for (const k of ["producerCompany", "producerAddress", "importer", "importerAddress", "bottlingDate", "lot", "web"]) {
            if (!DEMO_BACK[k]) continue;   /* TSINANDALI has no importer */
            if (!(await backField(k, DEMO_BACK[k]))) return;
            if (!(await hold(80))) return;
          }
          /* the market picker opens, takes its pick and closes again */
          if (!(await hold(360))) return;
          if (!(await tap(TAP.market, 320, 520, () => setMarketOpen(true)))) return;
          if (!(await hold(800))) return;
          if (!(await tap(TAP.us, 320, 520, () => { setMarkets(["US"]); setNoComp(false); }))) return;
          if (!(await hold(700))) return;
          if (!(await tap(TAP.market, 320, 520, () => setMarketOpen(false)))) return;
          break;
        }
        case 3: {
          /* round 72 #12: seed() already put it there. Round 94 #7: the
             pointer presses Save and the back label flies into the folder
             (the demo back label is square, 984 × 984) */
          if (!(await beat(900))) return;
          const fit3 = fitIn(BD_AREA.w, BD_AREA.h, 984, 984);
          if (!(await tap(TAP.bdSave, 200, 520, () => { setBackSaved(true); flyToFolder([{ src: TUT_BACK, x: BD_AREA.x + fit3.dx, y: BD_AREA.y + fit3.dy, w: fit3.w, h: fit3.h }]); }))) return;
          if (!(await hold(700))) return;
          break;
        }
        case 4: {
          /* round 73 #4: it opens already filled in — only the changes play */
          bottleTouched.current = true;
          setWineColor("Amber"); setBottle({ ...DEMO_BOTTLE_0 });
          setWheel({ x: 0.5, y: 0.5, rgb: [255, 255, 255] }); setShade(0.5);
          /* ROUND 73 #4 (owner's exact order): the page OPENS already set
             to White / Bordeaux / Olive Green / Wax Seal / Matte. The
             pointer then changes the bottle type, the glass colour and the
             closure, picks a colour off the wheel and finally darkens it
             (round 86: to KORRA's clear Sparkling bottle, cork, black hood). */
          if (!(await beat(700))) return;
          /* 2026-09-23: TSINANDALI's bottle. Bordeaux -> Burgundy */
          if (!(await tap(BRING(1, 2), 560, 520, () => setBottle((m) => ({ ...m, type: "Burgundy" }))))) return;
          if (!(await beat(620))) return;
          /* Transparent -> Olive Green */
          if (!(await tap(BRING(2, 0), 480, 520, () => setBottle((m) => ({ ...m, color: "Olive Green" }))))) return;
          if (!(await beat(620))) return;
          /* Cork -> Wax Seal (row 2: Cork, Screw Cap, Wax Seal …) */
          if (!(await tap(BRING(3, 2), 480, 520, () => setBottle((m) => ({ ...m, closure: "Wax Seal" }))))) return;
          if (!(await beat(680))) return;
          /* the seal's sky blue, then a touch deeper */
          if (!(await tap(TAP.wheel, 420, 560, () => pickWheel(DEMO_WHEEL.x, DEMO_WHEEL.y)))) return;
          if (!(await beat(560))) return;
          if (!(await dragShade(0.5, DEMO_SHADE))) return;
          break;
        }
        case 5: {
          /* the real run's stages, on the sample images */
          setTutLanding(false);
          setAssets({ life: [] }); setLifeTarget(5); setLifeOrder([0, 1, 2, 3, 4]);
          assetT.current = { run: Date.now(), stage: Date.now() };
          setAssetsStage("front shot");
          if (!(await hold(600))) return;
          setAssets((a) => ({ ...a, front: { full: TUT_SHOT_F, prev: TUT_SHOT_F } }));
          setAssetsStage("back shot");
          if (!(await hold(500))) return;
          setAssets((a) => ({ ...a, back: { full: TUT_SHOT_B, prev: TUT_SHOT_B } }));
          for (let i = 0; i < 5; i++) {
            setAssetsStage(`lifestyle ${i + 1}/5`);
            if (!(await beat(340))) return;
            setAssets((a) => { const life = [...a.life]; life[i] = { full: TUT_LIFE[i], prev: TUT_LIFE[i] }; return { ...a, life }; });
          }
          /* round 72 #14: only now does the product page get published */
          setAssetsStage("publishing");
          if (!(await hold(600))) return;
          setTutLanding(true);
          setAssetsStage("");
          /* 2026-09-23 (owner: "add the saving of those assets, and let the
             step end with it"): the pointer presses the page's own Save,
             so the very same flight into the folder plays */
          if (!(await hold(1100))) return;
          if (!(await tap(TAP.assetsSave, 320, 520, () => {
            tutClick.current = true;
            (document.querySelector("[data-assets-save]") as HTMLButtonElement | null)?.click();
            tutClick.current = false;
          }))) return;
          if (!(await hold(1800))) return;
          break;
        }
        default:
          /* nothing left to point at on the closing card */
          setCursor(null);
          break;
      }
      /* ROUND 85 #4 (owner): the story does not wait to be pressed — a
         beat after the step has played, the button presses itself (one
         click-sized scale) and the next step begins. Only the closing card
         waits, and only there the button keeps its double pulse. */
      /* 2026-09-23 (owner: "the tutorial must not move on by itself any
         more — bring back the version where the user clicks to go to the
         next step"): REVERSES round 85 #4. The step plays, the pointer
         leaves, and the red button pulses until the visitor presses it
         (its onClick turns the page of the story). */
      if (!live()) return;
      setCursor(null);
      setTutIdle(true);
    })();
    return () => { /* the token bump in the next run cancels this one */ };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tut]);

  const sigFront = () => JSON.stringify({ vision, sketch: !!sketch, f });
  const sigPaint = () => JSON.stringify({ vision, sketch: sketch ? sketch.length : 0, w: f.width, h: f.height });
  /* round 60 #4: qrMode AND the viewed variation are part of the brief —
     ANY back-details change births a fresh back label */
  const sigBack = () => JSON.stringify({ b, markets, gtin: gtinValid ? gtinNorm : "", qrImg: !!qrImg, qm: qrMode, w: f.width, h: f.height, sel: selected >= 0 ? `${selected}:${styleView[selected] || 0}` : "" });

  const buildDreamPayload = () => {
    const aspect = (Number(f.width) || 110) / (Number(f.height) || 80);
    const aspectKey = aspect > 1.15 ? "landscape" : aspect < 0.87 ? "portrait" : "square";
    /* ROUND 78 (found through the evaluation set): an EMPTY field used to be
       replaced by the Château Margaux demo value on its way to the engine —
       a customer who left Classification blank got "Grand Cru Classé"
       printed, and every label carried all thirteen lines, French data on
       Georgian wines. The form shows the field empty; the label honours it.
       (The engine keeps its own minimal fallbacks: "Wine", 12.5%, 750 mL.) */
    const fx = (k: string) => f[k]?.trim() || "";
    return {
      aspectKey,
      /* round 112 #4: a visitor who came from an artist's page has ALL
         three columns painted in that artist's hand */
      artist: chosenArtist || undefined,
      /* round 84: the hybrid engine sets type to the label's real mm */
      width: Number(f.width) || 110, height: Number(f.height) || 80,
      data: {
        producer: fx("producer"), wine: fx("wine"), appellation: fx("appellation"),
        classification: fx("classification"), grape: fx("grape"),
        region: fx("regionCountry").split(",")[0]?.trim() || "",
        country: fx("regionCountry").split(",")[1]?.trim() || "",
        special: fx("special"), vintage: fx("vintage"),
        wineColorName: fx("colour"), wineType: fx("wineType"),
        sweetness: fx("sweetness"), alcohol: fx("alcohol").replace("%", ""),
        volume: fx("volume").replace(/\D/g, "") || "750",
      },
    };
  };
  /* one variation dream — same endpoint, no page-level progress */
  async function genVariation(style: string): Promise<Dream> {
    /* round 56 #3 (TEMP dev switch): fake with an already-made label */
    if (!liveGenRef.current) {
      await sleep(600 + Math.random() * 700);
      const pool = [...dreams, ...styleVars.flat()].filter(Boolean) as Dream[];
      const d0 = pool[Math.floor(Math.random() * Math.max(1, pool.length))];
      return { style, dream: d0?.dream || FAKE_IMG, preview: d0?.preview || null };
    }
    const { data, aspectKey, width, height, artist } = buildDreamPayload();
    /* round 86 #3: a variation keeps the column's painting and only
       re-sets the type (the server needs the label's id); a label without
       an id (pre-hybrid) is painted afresh */
    const fi = STYLES3.indexOf(style);
    const baseId = (fi >= 0 && (viewedDream(fi)?.id || dreams[fi]?.id)) || undefined;
    const r = await fetch("/api/dream-label", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vision, style, data, sketch, aspect: aspectKey, width, height, relayout: baseId }),
    });
    if (!r.ok || !r.body) throw new Error(`generation failed (${r.status})`);
    const reader = r.body.getReader(); const dec = new TextDecoder();
    let buf = ""; let res: { dream?: string; preview?: string | null; id?: string } = {};
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        const m = JSON.parse(line);
        if (m.dream) res = m;
      }
    }
    if (!res.dream) throw new Error("empty variation");
    return { style, dream: res.dream, preview: res.preview || null, id: res.id };
  }
  async function createVariation(fi: number) {
    /* round 60 #1: ONE variation of the pressed style; the column's dot
       row grows by one and the view jumps to the fresh slot */
    setVarBusyCol(fi); varT.current = Date.now();
    const slot = (styleVars[fi] || []).length;
    setStyleVars((p) => { const n = p.map((a2) => [...a2]); n[fi] = [...n[fi], null]; return n; });
    setStyleView((p) => { const n = [...p]; n[fi] = slot + 1; return n; });
    try {
      const d = await genVariation(STYLES3[fi]);
      setStyleVars((p) => { const n = p.map((a2) => [...a2]); n[fi][slot] = d; return n; });
    } catch {
      setStyleVars((p) => { const n = p.map((a2) => [...a2]); n[fi] = n[fi].filter((_, i2) => i2 !== slot); return n; });
      setStyleView((p) => { const n = [...p]; n[fi] = 0; return n; });
    }
    setVarBusyCol(-1);
  }
  /* ROUND 86 #3 (owner): a variation re-sets the type on the SAME painting
     — no model call at all */
  const requestVariations = (fi: number) => {
    if (varBusyCol >= 0) return;
    if ((styleVars[fi]?.length || 0) >= MAX_VARS) return;   /* round 88 #9: two rows, full */
    createVariation(fi);
  };
  /* the option column's label box — shared by the picture, the frame, the
     dots and the Save film (round 88) */
  const optGeom = (fi: number) => {
    const nat = imgDims[fi];
    const ar = nat ? nat.w / nat.h : (Number(f.width) || 110) / (Number(f.height) || 80);
    const CUBE = 34.3, AREA_TOP = 290, AREA_BOT = 540;
    let lw: number, lh: number;
    if (ar >= 1) { lw = OPT_W; lh = OPT_W / ar; if (lh > AREA_BOT - AREA_TOP) { lh = AREA_BOT - AREA_TOP; lw = lh * ar; } }
    else { lh = AREA_BOT - AREA_TOP; lw = lh * ar; if (lw > OPT_W - 2 * CUBE) { lw = OPT_W - 2 * CUBE; lh = lw / ar; } }
    return { lx: OPT_FRAMES[fi].x + (OPT_W - lw) / 2, ly: AREA_TOP + (ar >= 1 ? 0 : (AREA_BOT - AREA_TOP - lh) / 2), lw, lh };
  };
  /* ROUND 88 #9 (owner): "Select" became SAVE — a black button under the
     variations; saving marks the column and flies the label into the folder */
  const saveFront = (fi: number) => {
    if (!dreams[fi]) return;
    const dv = viewedDream(fi);
    const g = optGeom(fi);
    const unsave = selected === fi;
    setSelected(unsave ? -1 : fi); setWarn("");
    if (dv) flyToFolder([{ src: dv.preview || dv.dream, x: g.lx, y: g.ly, w: g.lw, h: g.lh }], unsave);
  };
  /* round 52 #1 (owner: "it let me download without agreeing!"):
     every pay path checks the T&C ring first */
  const requireAgree = () => {
    if (agree) return true;
    setWarn(t("Agree to the Terms & Conditions to continue"));
    setTimeout(() => setWarn(""), 3200);
    return false;
  };
  async function nextFromFront() {
    /* owner #14: regenerate ONLY when inputs changed */
    if (dreams.length && frontSig === sigFront()) { go("options"); return; }
    /* only the details changed: the SAME paintings in the same templates,
       the type set again — seconds, no painter, no cost */
    if (liveGenRef.current && dreams.length && paintSig && paintSig === sigPaint() && dreams.every((d) => d?.id)) {
      go("loader"); setGenProgress(0.3);
      const { data, aspectKey, width, height } = buildDreamPayload();
      const redo = async (d: Dream): Promise<Dream> => {
        const r = await fetch("/api/dream-label", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vision, style: d.style, data, aspect: aspectKey, width, height, relayout: d.id, keep: true }),
        });
        if (!r.ok || !r.body) throw new Error(`re-set failed (${r.status})`);
        const txt = await r.text();
        const res = txt.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((m) => m.type === "result");
        if (!res?.dream) throw new Error("re-set gave nothing");
        return { style: d.style, dream: res.dream, preview: res.preview || null, id: res.id, artist: res.artist || d.artist };
      };
      try {
        const next = await Promise.all(dreams.map(redo));
        setGenProgress(1);
        setDreams(next); setFrontSig(sigFront()); setBackSig("");
        go("options");
        return;
      } catch { /* fall through to a fresh painting */ }
    }
    go("loader");
    setGenProgress(0);
    const genT0 = Date.now();   /* round 46: feed the loader's REAL average */
    /* round 84: ONE payload builder — this copy still carried the demo
       fallback that round 78 removed from buildDreamPayload */
    const { data, aspectKey, width, height, artist } = buildDreamPayload();
    /* 2026-09-23: one token for the whole run — the server mixes which
       artist paints which column from it (a retried column keeps its seat) */
    const order = Math.random().toString(36).slice(2, 12);
    const one = async (style: string): Promise<Dream> => {
      /* round 56 #3 (TEMP dev switch): fake the run with existing art */
      if (!liveGenRef.current) {
        await sleep(500);
        setGenProgress((p) => p + 1 / 3);
        const d0 = dreams.find(Boolean);
        const fake = { style, dream: d0?.dream || FAKE_IMG, preview: d0?.preview || FAKE_IMG };
        return fake;
      }
      const r = await fetch("/api/dream-label", {
        method: "POST", headers: { "Content-Type": "application/json" },
        /* 2026-09-23 (owner: "remove variations altogether, they
           complicate things — three versions and that's it"): one label
           a column, no re-layouts riding along */
        body: JSON.stringify({ vision, style, data, sketch, aspect: aspectKey, width, height, variants: 1, artist, order }),
      });
      if (!r.ok || !r.body) throw new Error(`generation failed (${r.status})`);
      const reader = r.body.getReader(); const dec = new TextDecoder();
      let buf = ""; let res: { dream?: string; preview?: string | null; id?: string; artist?: string; variants?: { dream: string; preview: string | null; id: string }[] } = {};
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line) continue;
          const m = JSON.parse(line);
          if (m.type === "result") res = m;
          else if (m.type === "error") throw new Error(m.error);
        }
      }
      setGenProgress((p) => p + 1 / 3);
      /* round 94 #6: two contrasting re-layouts of the same painting ride along */
      return { style, dream: res.dream || "", preview: res.preview || null, id: res.id, artist: res.artist, variants: (res.variants || []).map((v) => ({ style, dream: v.dream, preview: v.preview, id: v.id })) };
    };
    try {
      const styles3 = ["traditional", "contemporary", "punk"];
      const settled = await Promise.allSettled(styles3.map(one));
      const ok = settled.filter((x): x is PromiseFulfilledResult<Dream> => x.status === "fulfilled").map((x) => x.value);
      /* round 19: a parallel burst can rate-limit a style out of the set
         (owner saw a 1-label session) — retry the failed styles once,
         sequentially, before giving up on them */
      for (let i = 0; i < styles3.length; i++) {
        if (settled[i].status === "rejected") {
          try { ok.push(await one(styles3[i])); } catch { /* that style stays out */ }
        }
      }
      if (!ok.length) throw new Error("all generations failed — try again");
      ok.sort((a, b2) => styles3.indexOf(a.style) - styles3.indexOf(b2.style));
      setDreams(ok); setSelected(-1); setFrontSig(sigFront()); setPaintSig(sigPaint()); setBackSig("");
      setStyleVars([[], [], []]); setStyleView([0, 0, 0]); setVarBusyCol(-1);
      /* round 43 #3 (owner: "landing page thumb shows the previous bottle"):
         a freshly generated wine invalidates any earlier published page —
         the restored productUrl (round 28b, meant to survive a reload of
         the SAME in-progress order) must not leak into a NEW wine. Mint a
         fresh order code too, so a later publish never reuses the old one. */
      setProductUrl(""); productCode.current = Math.random().toString(36).slice(2, 10);
      try { localStorage.removeItem("nui-product-code"); } catch { }
      /* ROUND 47: generating a fresh label ends own-label (assets-only)
         mode. ROUND 48: wine colour re-derives from the new label's field
         and any custom-cleared bottle sections get their defaults back. */
      setCustomLabel(null); setWineColor("");
      setBottle((m) => ({ type: m.type || "Bordeaux", color: m.color || "Olive Green", closure: m.closure || "Cork", finish: m.finish || "Matte" }));
      /* round 46 (owner: "calculate real average"): remember how long the
         full set really took — the loader note averages the last 10 runs */
      try {
        const s = (JSON.parse(localStorage.getItem("nui-gen-secs") || "[]") as number[]).filter((n) => Number.isFinite(n));
        s.push(Math.round((Date.now() - genT0) / 1000));
        localStorage.setItem("nui-gen-secs", JSON.stringify(s.slice(-10)));
      } catch { }
      go("options");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      go("vision", -1);
    }
  }

  async function nextFromCompliance() {
    if (backPng && backSig === sigBack()) { go("backdesign"); return; }
    /* round 76 #1 (owner): no status line in the corner — the back-label
       page shows its own loader, this only added noise */
    const sel = viewedDream(selected);
    const bg = sel ? await groundOf(sel.preview || sel.dream) : "#FFFFFF";
    const payload = {
      data: {
        wine: f.wine || DEMO_FRONT.wine,
        producer: [b.producerCompany, b.producerAddress].filter(Boolean).join(", "),
        producerCompany: b.producerCompany || "", producerAddress: b.producerAddress || "",
        importerCompany: b.importer || "", importerAddress: b.importerAddress || "",
        description: b.description || "", importer: [b.importer, b.importerAddress].filter(Boolean).join(", "),
        bottlingDate: b.bottlingDate || "", lot: b.lot || "", web: b.web || "",
        alcohol: (f.alcohol || "12.5").replace("%", ""), volume: (f.volume || "750").replace(/\D/g, "") || "750",
        /* round 86: no demo country — the composer's own TEMP fallback applies */
        countryOfOrigin: (f.regionCountry || "").split(",")[1]?.trim() || "",
        barcodeDigits: gtinValid ? gtinNorm : "",
        /* round 53 #4: QR data travels ONLY when the customer chose one */
        qrImage: qrMode === "upload" ? qrImg : "",
        qrUrl: qrMode === "create" ? `https://8klabels.com/p/${productCode.current}` : "",
      },
      markets, heightMM: Number(f.height) || 80, bgColor: bg,
    };
    backSpec.current = { ...payload, data: { ...payload.data, qrImage: "" } };
    try {
      const r = await fetch("/api/back-label", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, format: "png" }) });
      if (!r.ok) throw new Error("back label failed");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const probe = new Image();
      probe.onload = () => setBackDims({ w: probe.width, h: probe.height });
      probe.src = url;
      setBackPng(url); setBackPayload(payload); setBackSig(sigBack());
      go("backdesign");
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    setBusyMsg("");
  }

  /* round 45 (mock): renamed rows, designer session $49/1h */
  const PACK = [
    { name: "Print ready Front & Back Labels", price: 199 },
    { name: "QR Code & Published Product Page", price: 29 },
    { name: "Marketing Assets", price: 9 },   /* round 48 #7: was $19 */
    { name: "1 Hour session with human designer", price: 49 },
  ];
  const total = PACK.reduce((s, it, i) => s + (packSel[i] ? it.price : 0), 0);

  /* round 18 #4: ONE delivery ZIP named after the wine — labels + fonts,
     marketing assets, sample contract (TEMP free until payments exist) */
  async function proceedToPayment() {
    /* round 85 #5: no "Packing…" line — it flashed behind the folder mark */
    try {
      const r = await fetch("/api/package", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wineName: f.wine || "Wine",
          /* ROUND 47: an own-label order ships marketing assets only —
             the customer already has their printed labels */
          front: customLabel ? null : viewedDream(selected)?.dream || null,
          /* round 84: the label's id fetches its SVG (live type) + fonts */
          frontId: customLabel ? null : viewedDream(selected)?.id || null,
          back: customLabel ? null : backPayload,
          shots: { front: assets.front?.full, back: customLabel ? undefined : assets.back?.full },
          lifestyle: assets.life.filter(Boolean).map((l) => l.full),
        }),
      });
      if (!r.ok) throw new Error(`packaging failed (${r.status})`);
      const u = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = u; a.download = `${(f.wine || "Wine").replace(/[^\w]+/g, "_")}.zip`; a.click();
      setTimeout(() => URL.revokeObjectURL(u), 1500);
    } catch { alert("download failed — try again"); }
  }

  /* helpers */
  const px = (x: number, y: number, w?: number, h?: number): React.CSSProperties => ({ position: "absolute", left: x, top: y, width: w, height: h });
  const ghost: React.CSSProperties = { background: "transparent", border: "none", cursor: "pointer", padding: 0 };
  const patch = (x: number, y: number, w: number, h: number, key?: string) => <div key={key} style={{ ...px(x, y, w, h), background: "#fff" }} />;
  /* round 41 #4/#5/#11: grey placeholder — clickable, takes you where the
     missing thing is created; message in the 12px subtitle size */
  const notMade = (x: number, y: number, w: number, h: number, kind: "front" | "back" = "front", key?: string, msg = true) => (
    <button key={key} onClick={() => go(kind === "front" ? "vision" : "backdetails", -1)}
      style={{ ...px(x, y, w, h), background: "#ECECEA", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", font: `12px ${HNW}`, color: "#8a887e", textAlign: "center", textTransform: "none", padding: 4 }}>
      {msg ? t(kind === "front" ? "Create front label" : "Create back label") : ""}
    </button>
  );
  /* round 41 #19: ONE dash style everywhere — the final-pack slot dashes
     (baked stroke-dasharray 4.12) are the sample */
  /* ROUND 85 #7 (owner: "some dashes thicker or doubled, some thinner"):
     the dashes were four CSS gradients, each snapped to the pixel grid on
     its own, so at fractional page scales a side could land on two rows
     or lose one. ONE SVG rectangle with a dash pattern, its edges on
     half-pixels, draws every side with the same hairline. */
  /* ROUND 110 (owner, asked many times: "the pluses never sit exactly on
     the crossing"): every dashed stroke's CENTRE now lands exactly on the
     coordinate it is given, and so does every plus arm — the two shapes
     then cover the SAME half-unit band and crispEdges snaps them to the
     same device pixel. (Before: a box edge's centre sat at x+0.5 and a
     right edge's at x+w-0.5, while the plus sat on x and x+w — half a
     unit out on every corner, which rounded to a whole pixel on screen.) */
  /* ROUND 110 (owner, asked many times: "the pluses never sit exactly on
     the crossing"). Two causes, both fixed here:
       · the dashed edge's stroke used to sit HALF A UNIT off the corner it
         was given (a rect inset by 0.5), while the plus sat on it exactly;
       · and even once they agreed, crispEdges snaps each SVG ELEMENT on
         its own, so two elements over the same line could land on
         different device rows — which is what stayed visible.
     So a dashed edge and the pluses that mark it are now drawn INSIDE ONE
     element: one raster space, one snap, no drift at any page scale. */
  const PLUS_ARM = 9;
  const dashLine = (x1: number, y1: number, x2: number, y2: number, i: number | string, dashed = true) => (
    /* the ink comes from the wrapping <svg>'s `color`, so a whole frame
       can be greyed in one place (round 113 #4) without splitting the
       element — splitting it is what made the pluses drift */
    <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1"
      strokeDasharray={dashed ? "4.12 4.12" : undefined} shapeRendering="crispEdges" />
  );
  const plusAt = (cx: number, cy: number, i: number | string) => (
    <g key={"p" + i}>
      {dashLine(cx, cy - PLUS_ARM, cx, cy + PLUS_ARM, "v" + i, false)}
      {dashLine(cx - PLUS_ARM, cy, cx + PLUS_ARM, cy, "h" + i, false)}
    </g>
  );
  /* a whole dashed frame — top and bottom rules, the inner column rules
     and EVERY plus — in one element. Anything that has to line up is drawn
     together; nothing lines up reliably across two elements. */
  const dashGrid = (x: number, y: number, w: number, h: number, cols: number[], key: string, sides = false) => {
    const T = 0.5, B = h + 0.5, L = 0.5, R = w + 0.5;
    const at = (c: number) => c - x + 0.5;
    return (
      <svg key={key} style={{ ...px(x - 0.5, y - 0.5, w + 1, h + 1), pointerEvents: "none", overflow: "visible", color: "#000" }} viewBox={`0 0 ${w + 1} ${h + 1}`}>
        {dashLine(L, T, R, T, "t")}{dashLine(L, B, R, B, "b")}
        {sides && (<>{dashLine(L, T, L, B, "l")}{dashLine(R, T, R, B, "r")}</>)}
        {cols.map((c, i) => dashLine(at(c), T, at(c), B, "c" + i))}
        {[L, ...cols.map(at), R].map((cx, i) => (
          <g key={"g" + i}>{plusAt(cx, T, "t" + i)}{plusAt(cx, B, "b" + i)}</g>
        ))}
      </svg>
    );
  };
  const dashedBox = (x: number, y: number, w: number, h: number, key?: string, pluses = false, color = "#000") => {
    const L = 0.5, R = w + 0.5, T = 0.5, B = h + 0.5;
    return (
      <svg key={key} style={{ ...px(x - 0.5, y - 0.5, w + 1, h + 1), pointerEvents: "none", overflow: "visible", color }} viewBox={`0 0 ${w + 1} ${h + 1}`}>
        {dashLine(L, T, R, T, 0)}{dashLine(L, B, R, B, 1)}
        {dashLine(L, T, L, B, 2)}{dashLine(R, T, R, B, 3)}
        {pluses && ([[L, T], [R, T], [L, B], [R, B]] as const).map(([cx, cy], i) => plusAt(cx, cy, i))}
      </svg>
    );
  };
  /* ROUND 85 #2 (owner, fourth time: "FIX THE DOTS INSIDE THE CIRCLES"):
     a CSS dot centred with translate(-50%,-50%) inside a CSS ring rounds
     to the pixel grid separately from the ring, so at most page scales the
     dot sat a hair off. Two SVG circles on the SAME centre cannot drift —
     the renderer places both from one fractional point. */
  /* one dashed hairline (round 85 #7): same pattern, same crisp pixel row */
  /* one dashed hairline; `ends` marks both of its ends with a plus, in the
     SAME element (see dashedBox above for why that matters) */
  const dashRule = (x: number, y: number, len: number, vertical = false, key?: string, color = "#000", ends = false) => (
    /* the element is pulled back half a unit across the line, so the
       stroke straddles the coordinate instead of sitting beside it */
    <svg key={key} style={{ ...px(vertical ? x - 0.5 : x, vertical ? y : y - 0.5, vertical ? 1 : len, vertical ? len : 1), pointerEvents: "none", overflow: "visible", color }} viewBox={`0 0 ${vertical ? 1 : len} ${vertical ? len : 1}`}>
      <line x1={vertical ? 0.5 : 0} y1={vertical ? 0 : 0.5} x2={vertical ? 0.5 : len} y2={vertical ? len : 0.5} stroke={color} strokeWidth="1" strokeDasharray="4.12 4.12" shapeRendering="crispEdges" />
      {ends && (vertical
        ? (<>{plusAt(0.5, 0, "a")}{plusAt(0.5, len, "b")}</>)
        : (<>{plusAt(0, 0.5, "a")}{plusAt(len, 0.5, "b")}</>))}
    </svg>
  );
  const ringSvg = (size: number, on: boolean, o?: { stroke?: number; color?: string; dot?: number; noRing?: boolean }) => {
    const sw = o?.stroke ?? 2, col = o?.color || "#111", dot = o?.dot ?? size / 2;
    return (
      /* overflow visible: at a scaled page the stroke's last soft pixel
         fell outside the box and was shaved off one side */
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} overflow="visible" style={{ display: "block", flex: "0 0 auto", overflow: "visible" }}>
        {!o?.noRing && <circle cx={size / 2} cy={size / 2} r={(size - sw) / 2} fill="#fff" stroke={col} strokeWidth={sw} />}
        {on && <circle cx={size / 2} cy={size / 2} r={dot / 2} fill={col} />}
      </svg>
    );
  };
  /* owner #15 / round 7 #2: input text italic (design st16); the underline is
     a SEPARATE fixed-length row line, not text-decoration */
  /* 2026-09-22 (owner, twice: "in the wine name field the address book
     pops up, and the same on Region, Country").

     The attributes alone were not enough, and I should have known: Chrome
     IGNORES autocomplete="off" on anything its heuristic reads as a name
     or an address, and it reads the heuristic off the words beside the
     field. "Wine Name:" and "Region, Country:" are as strong a signal as
     there is.

     What Chrome will not do is fill a READONLY field. So every field
     arrives readonly and drops it on the first focus — by then the
     autofill pass is long over. The attributes stay as well, for the
     password managers, which do honour them. */
  const [awake, setAwake] = useState<Record<string, boolean>>({});
  const noFill = (key: string) => ({
    name: `fld-${key}`,
    id: `fld-${key}`,
    autoComplete: "off",
    autoCorrect: "off",
    autoCapitalize: "off",
    spellCheck: false,
    readOnly: !awake[key],
    onFocus: () => setAwake((a) => (a[key] ? a : { ...a, [key]: true })),
    onMouseDown: () => setAwake((a) => (a[key] ? a : { ...a, [key]: true })),
    "data-lpignore": "true",
    "data-1p-ignore": "",
    "data-bwignore": "true",
    "data-form-type": "other",
  });

  const inputStyle: React.CSSProperties = { font: `italic 15px ${HNW}`, border: "none", outline: "none", background: "transparent", padding: "0 0 0 5px", color: "#111", lineHeight: "20px" };
  /* baseline offset of a 15px/20px-line input, computed from the REAL
     font metrics at runtime (round 8 #2): Safari and Chrome center line
     boxes with different ascent/descent values, so a hardcoded offset
     can never align both — the canvas metrics give each browser's own */
  /* ROUND 63: put ANY live text on an exact baseline — line-height equals
     the font size, so `top` is simply baseline − (half-leading + ascent),
     measured from the browser's own metrics (fm) */
  const baseTop = (baseline: number, size: number) =>
    baseline - ((size - (fm.a + fm.d) * (size / 15)) / 2 + fm.a * (size / 15));
  const IN_BASE = (20 - (fm.a + fm.d)) / 2 + fm.a;
  const WH_BASE = (15 - (fm.a + fm.d) * (14 / 15)) / 2 + fm.a * (14 / 15);
  /* fixed-length input rule — 1px black, same weight as the progress line */
  const rowLine = (x: number, y: number, w2: number, key?: string) => (
    <div key={key} style={{ position: "absolute", left: x, top: y, width: w2, height: 1, background: "#111" }} />
  );
  /* selection dot, ALWAYS concentric with its ring (round 7 #17): both the
     optional drawn ring and the dot are centred in the same button */
  const dotBtn = (cx: number, cy: number, on: boolean, click: () => void, key: string, opts?: { ring?: boolean; coverDot?: boolean; cover?: number; r?: number }) => {
    const r = opts?.r ?? 7.5;
    /* round 85 #2: one SVG, every circle on the button's exact centre */
    return (
      <button key={key} onClick={click} style={{ ...px(cx - 13, cy - 13, 26, 26), ...ghost }}>
        <svg width="26" height="26" viewBox="0 0 26 26" style={{ position: "absolute", left: 0, top: 0, display: "block" }}>
          {opts?.coverDot && <circle cx="13" cy="13" r="5.5" fill="#fff" />}
          {opts?.cover && <circle cx="13" cy="13" r={opts.cover / 2} fill="#fff" />}
          {opts?.ring && <circle cx="13" cy="13" r={r - 1} fill="#fff" stroke="#111" strokeWidth="2" />}
          {on && <circle cx="13" cy="13" r="3.75" fill="#111" />}
        </svg>
      </button>
    );
  };
  const cross = (cx: number, cy: number, key: string, thick = false) => (
    /* thick arms = 33px, matching the baked st14 pluses (532.06→565.02).
       Round 85 #7: hairline arms on the half-pixel, crisp, so the plus
       and the dashed line it marks share one pixel row/column */
    <svg key={key} style={{ ...px(cx - (thick ? 16.5 : 9), cy - (thick ? 16.5 : 9), thick ? 33 : 18, thick ? 33 : 18), pointerEvents: "none", zIndex: 5 }} viewBox={thick ? "0 0 33 33" : "0 0 18 18"}>
      <line x1={thick ? 16.5 : 9} y1="0" x2={thick ? 16.5 : 9} y2={thick ? 33 : 18} stroke="#000" strokeWidth={thick ? 3 : 1} shapeRendering={thick ? undefined : "crispEdges"} />
      <line x1="0" y1={thick ? 16.5 : 9} x2={thick ? 33 : 18} y2={thick ? 16.5 : 9} stroke="#000" strokeWidth={thick ? 3 : 1} shapeRendering={thick ? undefined : "crispEdges"} />
    </svg>
  );
  /* mini loader glass for asset boxes (round 14 #10; round 17 #1): the wine
     level is FILL-driven from the tick — the active image's glass rises
     with its render, waiting glasses crawl slowly, nothing ever freezes */
  const miniGlass = (key: string, fill: number) => (
    /* round 49 #11 (owner: cramped in the small thumbs): 22 → 18, the
       SAME size everywhere so no box gets a different glass */
    <svg key={key} viewBox="215 95 170 315" width="18" style={{ display: "block", marginTop: 4 }}>
      <defs>
        <clipPath id={`mg-${key.replace(/[^a-z0-9]/gi, "")}`}>
          <rect x="230" y={266.6 - fill * 95} width="140" height={fill * 95 + 4}
            style={{ transition: "y 750ms linear, height 750ms linear" }} />
        </clipPath>
      </defs>
      <path fill="#BA141A" clipPath={`url(#mg-${key.replace(/[^a-z0-9]/gi, "")})`} d="M352.397 185.696 C353.872 199.478 353.325 211.872 350.76 222.63 C346.838 239.075 336.88 251.431 321.163 259.355 C311.285 264.336 301.979 266.038 298.571 266.527 C296.674 266.308 286.165 264.888 274.916 259.216 C259.199 251.292 249.241 238.936 245.319 222.491 C242.762 211.769 242.21 199.422 243.667 185.696 Z" />
      <g fill="none" stroke="#231F20" strokeWidth="7.426">
        <path d="M254.813 401.491 L297.631 401.491 L297.631 276.2 C297.631 276.2 246.711 271.948 235.438 224.682 C222.211 169.219 254.078 108.466 254.078 108.466 L341.155 108.635 C341.155 108.635 373.068 169.358 359.84 224.821 C348.568 272.087 297.648 276.339 297.648 276.339" />
        <path d="M297.8 276.2 L297.8 401.491 L340.618 401.491" />
      </g>
    </svg>
  );

  /* centred contain-fit inside an area (owner #12) */
  const fitIn = (areaW: number, areaH: number, imgW: number, imgH: number) => {
    const k = Math.min(areaW / imgW, areaH / imgH);
    const w = imgW * k, h = imgH * k;
    return { w, h, dx: (areaW - w) / 2, dy: (areaH - h) / 2 };
  };

  const FRONT_ROWS = ["producer", "wine", "appellation", "classification", "vintage", "grape", "regionCountry", "special", "sweetness", "colour", "wineType", "alcohol", "volume"];
  /* ROUND 63: the captions used to be baked into front.svg — the merged
     page draws them live (SVG_GE already carries their translations) */
  const FRONT_LABELS = ["Producer:", "Wine Name:", "Appellation:", "Classification:", "Vintage:", "Grape Variety:", "Region, Country:", "Special mention:", "Sweetness:", "Colour:", "Wine Type:", "Alcohol:", "Volume:"];
  const FRONT_PH = ["E.g. GRAND VIN", "E.g. Château Margaux", "E.g. Margaux AOC", "E.g. Grand Cru Classé", "E.g. 2018", "E.g. Cabernet Sauvignon", "E.g. Bordeaux, France", "E.g. Vieilles Vignes", "Dry, etc.", "E.g. Red, White etc.", "E.g. Wine, Sparkling Wine, etc.", "E.g. 12.5%", "E.g. 750 mL"];
  const BACK_ROWS = ["producerCompany", "producerAddress", "importer", "importerAddress", "bottlingDate", "lot", "web"];
  const BACK_LABELS = ["Producer Company:", "Producer Company Address:", "Importer:", "Importer Address:", "Bottling Date:", "LOT Number:", "Web Page:"];
  const BACK_PH = ['E.g. "Popiashvili Cellar" LLC', "E.g. #36 S. Chikovani st. 0171 Tbilisi, Georgia", 'E.g. "Teller Wines" LLC', "E.g. #36 S. Chikovani st. 0171 Tbilisi, Georgia", "E.g. 22/04/2019", "E.g. L206026342", "E.g. www.popiashvili.com"];

  /* market codes + their window in flags.png (col,row) — the grid page is
     gone (round 63) but the sprite lookup lives on in the dropdown */
  const COMP: { code: string; col: number; row: number }[] = [
    { code: "EU", col: 0, row: 0 }, { code: "US", col: 0, row: 1 }, { code: "GB", col: 0, row: 2 }, { code: "JP", col: 0, row: 3 },
    { code: "AU", col: 1, row: 0 }, { code: "NZ", col: 1, row: 1 }, { code: "CN", col: 1, row: 2 },
    { code: "KR", col: 2, row: 0 }, { code: "BR", col: 2, row: 1 }, { code: "MX", col: 2, row: 2 },
    { code: "IL", col: 3, row: 0 }, { code: "GE", col: 3, row: 1 }, { code: "CA", col: 3, row: 2 },
  ];

  /* round 71: Mtavruli runs much wider than Latin — six stops 166.6 apart
     only clear each other in Georgian at a smaller size. The progress
     bar's title size; round 113 #2 borrows it for the artists' names
     over the three labels. */
  /* 2026-09-23 (owner): the bar's titles at the header menu's size (13) —
     the artist heads and SKIP ride this size too */
  const BAR_FS = lang === "ge" ? 12 : 13;

  const OPT_FRAMES = [{ x: 137.1 }, { x: 548.5 }, { x: 960 }];
  const OPT_TOP = 290, OPT_BOT = 540, OPT_W = 342.9;   /* round 98 #1: where the labels sit */
  const BD_AREA = { x: 548.6, y: 171.5, w: 342.9, h: 342.9 };

  const wheelPick = (clientX: number, clientY: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const fy = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    let rgb = wheel.rgb;
    if (wheelCanvas.current) {
      const d = wheelCanvas.current.getContext("2d")!.getImageData(Math.round(fx * 136), Math.round(fy * 136), 1, 1).data;
      if (d[3] > 40) rgb = [d[0], d[1], d[2]];
    }
    setWheel({ x: fx, y: fy, rgb });
  };
  const shadeRgb = () => {
    const [r, g, bl] = wheel.rgb;
    const t = shade; // 0 = white, 1 = black
    const mix = (v: number) => t < 0.5 ? Math.round(v + (255 - v) * (1 - t * 2)) : Math.round(v * (1 - (t - 0.5) * 2));
    return `rgb(${mix(r)}, ${mix(g)}, ${mix(bl)})`;
  };

  /* THE HOME PAGE (owner's Homepage_Visual, 2026-09-23) — every place,
     size and colour read out of his PDF (NEW UI/Comments/New), in page
     units. The pictures were lifted from the same file (public/newui/
     home/); the sample label is his PDF's own rendering of it, so its
     Archivo type is exactly his. `layer` picks one group for the slide
     cascade (see HomeLayer); none = all of them, in stacking order. */
  const homeLayers = (layer?: HomeLayer) => {
    const on = (l: HomeLayer) => !layer || layer === l;
    const H_ = "/newui/home/";
    const BLUE = "#04bcf6";
    const img = (src: string, x: number, y: number, w: number, h: number) => (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img key={src} src={H_ + src} alt="" draggable={false} style={{ ...px(x, y, w, h), display: "block", pointerEvents: "none" }} />
    );
    /* the blue "↦" between the steps */
    const arrow = (x: number, k: string) => (
      <svg key={k} style={{ ...px(x - 1, 450, 30, 18), overflow: "visible", pointerEvents: "none" }} viewBox={`${x - 1} 450 30 18`}>
        <line x1={x + 0.7} y1={458.7} x2={x + 25.4} y2={458.7} stroke={BLUE} strokeWidth={1.5} />
        <rect x={x} y={453.9} width={1.5} height={9.7} fill={BLUE} />
        <polyline points={`${x + 20.2},${453.2} ${x + 25.9},${458.7} ${x + 20.2},${464.2}`} fill="none" stroke={BLUE} strokeWidth={1.5} />
      </svg>
    );
    const title = (text: string, x: number, k: string, right = false) => (
      <span key={k} style={{ ...px(right ? x - 300 : x, baseTop(340.83, 13.5), 300, 16), font: `700 13.5px ${HNW}`, lineHeight: "13.5px", color: "#000", whiteSpace: "nowrap", textAlign: right ? "right" : "left" }}>{t(text)}</span>
    );
    const DETAILS: [string, string][] = [
      ["Producer:", "MARANI"], ["Wine Name:", "TSINANDALI"], ["Vintage:", "2023"], ["Grape Variety:", "Rkatsiteli"],
      ["Region, Country:", "Kakheti, Georgia"], ["Special mention:", "Qvevri wine"], ["Sweetness:", "Dry"], ["Colour:", "Amber"],
      ["Wine Type:", "Wine"], ["Alcohol:", "12%"], ["Volume:", "750 mL"],
    ];
    return (<>
      {on("base") && (<span key="hb">
        {/* English keeps his three lines; Georgian runs longer, so it
            wraps inside the room his headline has (it must stop short of
            the small bottle) */}
        {lang === "ge" ? (
          <span style={{ ...px(137.3, baseTop(184.59, 26) - (33.41 - 26) / 2, 540, 140), font: `700 26px ${HNW}`, lineHeight: "33.41px", color: "#000" }}>
            {["Everything you need to take your wine", "from bottle to market,", "in a few simple steps."].map((ln) => t(ln)).join(" ")}
          </span>
        ) : ["Everything you need to take your wine", "from bottle to market,", "in a few simple steps."].map((ln, i) => (
          <span key={"hl" + i} style={{ ...px(137.3, baseTop(184.59 + i * 33.41, 27.84), 700, 32), font: `700 27.84px ${HNW}`, lineHeight: "27.84px", color: "#000", whiteSpace: "nowrap" }}>{t(ln)}</span>
        ))}
        {title("YOUR VISION", 137.3, "tv")}
        <svg style={{ ...px(137, 361.4, 256, 186.2), overflow: "visible", pointerEvents: "none" }} viewBox="137 361.4 256 186.2">
          <rect x={137.3} y={361.7} width={255.1} height={185.5} fill="none" stroke="#221f1f" strokeWidth={0.475} strokeDasharray="2.376" />
        </svg>
        <span style={{ ...px(152.6, baseTop(381.07, 8.99), 222, 50), font: `8.99px ${HNW}`, lineHeight: "10.79px", color: "#000" }}>{IDEAS[0]}</span>
        {DETAILS.map(([k, v], i) => (
          <span key={"hd" + i}>
            <span style={{ ...px(152.6, baseTop(445.44 + i * 9, 6.59), 60, 9), font: `700 6.59px ${HNW}`, lineHeight: "6.59px", color: "#000", whiteSpace: "nowrap" }}>{t(k)}</span>
            <span style={{ ...px(212.3, baseTop(445.44 + i * 9, 7.06), 110, 9), font: `italic 7.06px ${HNW}`, lineHeight: "7.06px", color: "#000", whiteSpace: "nowrap" }}>{v}</span>
            <span style={{ ...px(212.3, 445.44 + i * 9 + 0.56, 109, 0.353), background: "#000", opacity: 0.55 }} />
          </span>
        ))}
      </span>)}
      {on("label") && (<span key="hlb">
        {title("YOUR LABEL", 433.7, "tl")}
        {img("label.webp", 433.7, 361.7, 255.1, 185.5)}
        {arrow(400.4, "a1")}
      </span>)}
      {on("market") && (<span key="hm">
        {title("YOUR MARKET", 1316.8, "tm", true)}
        {img("market-1.webp", 945.9, 361.7, 185.2, 185.5)}
        {img("market-2.webp", 1131.1, 361.7, 185.7, 185.5)}
      </span>)}
      {on("bottles") && (<span key="hbt">
        {arrow(697.3, "a2")}
        {img("shadow-small.webp", 690.2, 519.2, 239.1, 44.9)}
        {img("bottle-back.webp", 698.8, 231.5, 145.1, 269.4)}
        {img("bottle-front.webp", 655.9, 158.2, 465.6, 622.6)}
      </span>)}
      {on("tagline") && (<span key="htg">
        {lang === "ge" ? (
          <span style={{ ...px(1038.5, baseTop(625.4, 16.2) - (19.44 - 16.2) / 2, 280, 90), font: `italic 16.2px ${HNW}`, lineHeight: "19.44px", color: "#000" }}>
            {["Create print and market-ready labels,", "marketing assets, and a product page", "in ~10 minutes."].map((ln) => t(ln)).join(" ")}
          </span>
        ) : ["Create print and market-ready labels,", "marketing assets, and a product page", "in ~10 minutes."].map((ln, i) => (
          <span key={"hs" + i} style={{ ...px(1038.5, baseTop(625.4 + i * 19.44, 16.2), 320, 20), font: `italic 16.2px ${HNW}`, lineHeight: "16.2px", color: "#000", whiteSpace: "nowrap" }}>{t(ln)}</span>
        ))}
      </span>)}
    </>);
  };

  /* inSlide = rendered inside a moving slide layer (inert, entry
     animations suppressed — the slide itself is the entry) */
  const renderOverlay = (p: PageKey, inSlide = false, layer?: HomeLayer) => {
    switch (p) {
      case "welcome":
        /* ROUND 63: the start action is the red round button on the bar */
        return (<>
          {(!layer || layer === "base") && patch(118, 658, 70, 54, "welarrow")}
          {homeLayers(layer)}
        </>);

      /* ================= ROUND 112 #4: THE ARTISTS =================
         Straight off the owner's artboards. The index: a title, the
         paragraph, the contact line, and a six-by-two grid of round
         portraits with the names under them — a slot the platform has
         not filled yet is an empty grey disc. Press one and that
         artist's own page opens. */
      case "artists": {
        const R = 68.57, CX0 = 205.71, DX = 205.71, CY0 = 342.86, DY = 240, NAME_B = 445.51;
        const slots = 12;
        return (<>
          <span style={{ ...px(137.14, baseTop(151.08, 19), 700, 22), font: `700 19px ${HNW}`, lineHeight: "19px", color: INK, whiteSpace: "nowrap" }}>{t("ARTISTS WHO TRAINED OUR MODELS")}</span>
          {[
            "Our platform brings together AI and a carefully curated group of human artists.",
            "Each of our AI artists is developed in collaboration with one specific human artist,",
            "trained on their work, visual language, and creative approach.",
            "Explore the master artists behind our models and discover their original work.",
          ].map((ln, i) => (
            <span key={"ai" + i} style={{ ...px(136.97, baseTop(183.62 + i * 18, 15), 640, 18), font: `15px ${HNW}`, lineHeight: "15px", color: INK, whiteSpace: "nowrap" }}>{t(ln)}</span>
          ))}
          <span style={{ ...px(754.29, baseTop(183.62, 15), 560, 18), font: `15px ${HNW}`, lineHeight: "15px", color: INK, whiteSpace: "nowrap" }}>
            {t("Please")}{" "}
            <a href="mailto:hello@8klabels.com" style={{ font: `700 15px ${HNW}`, color: INK, textDecoration: "underline" }}>{t("contact")}</a>
            {t(", if you are an artist and want to participate.")}
          </span>
          {Array.from({ length: slots }, (_, i) => {
            const cx = CX0 + (i % 6) * DX, cy = CY0 + Math.floor(i / 6) * DY;
            const a2 = siteArtists[i];
            if (!a2) return <span key={"slot" + i} style={{ ...px(cx - R, cy - R, R * 2, R * 2), borderRadius: R, background: "#e6e6e6" }} />;
            const parts = a2.name.split(" ");
            return (
              <button key={a2.id} onClick={() => { setArtistId(a2.id); setArtistView("art"); go("artist"); }}
                style={{ ...px(cx - 110, cy - R, 220, R * 2 + 90), ...ghost, cursor: "pointer", textTransform: "none" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a2.portrait} alt={a2.name}
                  style={{ position: "absolute", left: 110 - R, top: 0, width: R * 2, height: R * 2, borderRadius: R, objectFit: "cover", objectPosition: a2.crop, display: "block" }} />
                {parts.map((w, k) => (
                  <span key={k} style={{ position: "absolute", left: 0, top: baseTop(NAME_B - cy + R + k * 22.8, 19), width: 220, textAlign: "center", font: `700 19px ${HNW}`, lineHeight: "19px", color: INK, whiteSpace: "nowrap", textTransform: "uppercase" }}>{w}</span>
                ))}
              </button>
            );
          })}
        </>);
      }

      /* one artist: her portrait, her words, the button that starts a
         label in her hand, and six of her own paintings */
      case "artist": {
        const a2 = siteArtists.find((x) => x.id === artistId) || siteArtists[0];
        if (!a2) return null;
        const first = a2.name.split(" ")[0];
        const BX = 137.14, BW = 342.86;
        const WK = 205.71, WGAP = 274.29, WX = 548.57, WY = 171.37;
        return (<>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a2.portrait} alt={a2.name} style={{ ...px(BX, 171.43, BW, 137.14), objectFit: "cover", objectPosition: a2.crop, display: "block" }} />
          <span style={{ ...px(BX, baseTop(357.95, 19), BW + 200, 22), font: `700 19px ${HNW}`, lineHeight: "19px", color: INK, whiteSpace: "nowrap", textTransform: "uppercase" }}>{a2.name}</span>
          <span style={{ ...px(BX, baseTop(384, 15), BW, 200), font: `15px ${HNW}`, lineHeight: "18px", color: INK, textAlign: "justify" }}>{a2.bio}</span>
          <button onClick={() => { setChosenArtist(a2.id); go("vision"); }}
            style={{ ...px(136.96, 548.57, 343.21, 34.29), cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: "#111", color: "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4, textTransform: "none" }}>
            {t("Create label with")} {first}{t("’s art")}</button>
          {/* ROUND 113 #6 (owner): the two captions are HYPERLINKS —
              underlined, as the owner drew them (his .st5 carries
              text-decoration: underline). "Original art" shows her own
              paintings; "Labels from …" shows the labels already painted
              in her hand. The set being shown is black, the other grey. */}
          {([["Original art", "art"], ["Labels from", "labels"]] as const).map(([cap, view], i) => {
            const set = view === "art" ? a2.works : a2.labels;
            const on = artistView === view;
            return (
              <button key={view} onClick={() => set.length && setArtistView(view)}
                style={{ ...px(BX, baseTop(i ? 651.35 : 628.19, 17), 300, 20), ...ghost, font: `700 17px ${HNW}`, lineHeight: "17px", color: on && set.length ? INK : "#b3b3b3", whiteSpace: "nowrap", textAlign: "left", textDecoration: "underline", textUnderlineOffset: 3, cursor: set.length ? "pointer" : "default", textTransform: "none" }}>
                {view === "art" ? t(cap) : `${t(cap)} ${first}`}</button>
            );
          })}
          {/* ROUND 113 #5 (owner): BOTH marks stand on every artist's page,
              traced from his own artboard — the paths are his, and the
              viewBox is the artboard's own space, so each lands exactly
              where he drew it. An address he has not filled in yet leaves
              its mark standing, pale and inert. */}
          {([["instagram", a2.instagram, 413, 24, [
              "M436.53,645.21c-.08,3.25-2.81,6.04-6.04,6.1-3.81.07-7.46.11-11.28-.02-3.25-.11-5.92-3.08-5.91-6.26v-10.5c.01-3.25,2.79-6.17,6.09-6.26,3.79-.1,7.39-.11,11.19,0,3.15.09,5.86,2.91,5.95,6.05.11,3.67.1,7.16,0,10.89ZM430.79,650.3c2.62-.42,4.75-2.63,4.74-5.3l-.02-10.51c0-2.74-2.39-5.18-5.12-5.18h-10.91c-2.77,0-5.12,2.52-5.13,5.26l-.04,10.01c0,1.63.61,3.14,1.76,4.25,1.06,1.03,2.38,1.47,3.84,1.47h10.88Z",
              "M429.34,643.85c-1.48,1.63-3.67,2.29-5.84,1.77-1.88-.45-3.52-1.85-4.24-3.82-.83-2.26-.15-4.74,1.63-6.36s4.5-2.1,6.71-.95c1.64.85,2.79,2.34,3.15,3.96.44,2.01-.05,3.9-1.41,5.4ZM429.87,640.2c.22-2.9-2.05-5.21-4.81-5.3s-5.06,2.07-5.11,4.87,2.09,4.84,4.69,4.98,5.01-1.8,5.23-4.55Z",
              "M431.92,634.48c-.57.19-1.08-.02-1.39-.46-.28-.39-.25-.94.06-1.37s.87-.6,1.39-.39c.47.19.78.64.77,1.12,0,.46-.33.93-.83,1.1Z"]],
            ["website", a2.website, 457.8, 22.6, [
              "M469.46,642.76c1.33.24,2.84-.07,3.8-1.02l4.62-4.59c1.14-1.13,1.49-2.86,1.1-4.44-.35-1.38-1.38-2.65-2.83-3.25-1.63-.67-3.62-.35-4.88.91l-3.84,3.87c-.36.03-.77-.37-.73-.73l4.09-4.11c1.93-1.74,4.86-1.78,6.9-.3,2.8,2.03,3.29,5.76,1.22,8.53l-4.44,4.46c-.62.67-1.33,1.1-2.18,1.42-2.9,1.07-5.62-.22-7.2-2.86.03-.19.19-.39.33-.49.13-.1.5-.12.61.02.78,1.28,1.84,2.3,3.42,2.59Z",
              "M466.08,649.23l3.86-3.76c.34-.04.69.28.76.67l-3.86,3.83c-1.85,1.84-5.55,1.97-7.86-.36-2.03-2.05-2.35-5.4-.37-7.66l4.84-4.91c1.16-1.18,3.07-1.48,4.62-1.21,1.72.3,2.98,1.38,3.93,2.74.21.31.31.53.04.79-.18.19-.57.33-.76,0-.82-1.33-2.07-2.34-3.69-2.54-1.19-.15-2.6.14-3.48,1.03l-4.65,4.69c-1.74,1.96-1.36,4.89.54,6.58,1.69,1.51,4.29,1.62,6.09.1Z"]]] as const)
            .map(([kind, href, ix, iw, paths]) => {
              const mark = (
                <svg viewBox={`${ix} 627.5 ${iw} 24.5`} style={{ ...px(ix, 627.5, iw, 24.5), display: "block", opacity: href ? 1 : 0.32 }}>
                  {paths.map((d, k) => <path key={k} d={d} fill={INK} />)}
                </svg>
              );
              return href
                ? <a key={kind} href={href} target="_blank" rel="noreferrer" aria-label={kind}>{mark}</a>
                : <span key={kind} aria-hidden="true">{mark}</span>;
            })}
          {(() => {
            /* round 113 #6: her paintings fill their squares; a LABEL keeps
               its own shape, so it is fitted inside the square instead */
            const set = (artistView === "labels" ? a2.labels : a2.works).slice(0, 6);
            return set.map((w, i) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img key={w} src={w} alt="" title={t("Show this one big")}
                style={{ ...px(WX + (i % 3) * WGAP, WY + Math.floor(i / 3) * WGAP, WK, WK), objectFit: artistView === "labels" ? "contain" : "cover", display: "block", cursor: "pointer" }}
                onClick={() => setGallery({ items: set, index: i })} />
            ));
          })()}
        </>);
      }

      case "vision": {
        /* ROUND 63 (owner's "Your Vision@3x" mock, measured off the 3x
           artboard): YOUR VISION and FRONT LABEL DETAILS share one page,
           split by a dashed column rule at x788. Everything is drawn live
           — the old baked board is covered wholesale. */
        const BOX = { x: 136, y: 342, w: 551, h: 207 };
        /* ROUND 111 (owner): the page has ONE bottom line — the foot of the
           dashed column rule (133 + 522). The details list's last rule, the
           size row's text and the size box's foot all end on it. */
        const VIS_FOOT = 655;
        const words = vision.trim() ? vision.trim().split(/\s+/).length : 0;
        return (<>
          {patch(0, HEADER_H, W, FOOTER_Y - HEADER_H, "viswipe")}
          {/* ── left: the vision ── */}
          <span style={{ ...px(137.14, baseTop(149.08, 24), 600, 24), font: `700 24px ${HNW}`, lineHeight: "24px", color: "#111", whiteSpace: "nowrap" }}>{t("YOUR VISION")}</span>
          <span style={{ ...px(137.14, baseTop(183, 14), 600, 40), font: `italic 14px ${HNW}`, lineHeight: "18px", color: "#111" }}>
            {/* round 95 #1: one flowing paragraph — the second sentence follows on the same line */}
            {t("If you have a specific idea for the front label, describe it in simple words")} {t("or upload a sketch or photo reference. Or, let us suggest ideas for you.")}
          </span>
          <label style={{ ...px(138, 275, 240, 34.3), cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: "#111", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4, textTransform: "none" }}>
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
              const input = e.currentTarget;
              const file = input.files?.[0]; if (!file) { setSketch(null); return; }
              /* round 70: cleared so the same file can be picked again */
              const rd = new FileReader();
              rd.onload = () => { setSketch(String(rd.result)); input.value = ""; };
              rd.onerror = () => { input.value = ""; };
              rd.readAsDataURL(file);
            }} />
            {t("Upload a sketch or a reference photo")}
            {sketch && <span style={{ position: "absolute", left: 0, top: 38, width: 240, font: `12px ${HNW}`, color: "#3f6d2a", textAlign: "center" }}>{t("✓ sketch attached")}</span>}
          </label>
          <button onClick={() => { setVision(IDEAS[Math.floor(Math.random() * IDEAS.length)]); setIdeaN((n) => n + 1); }}
            style={{ ...px(412, 275, 274, 34.3), cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: "#111", color: "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4 }}>
            {t("Give me an idea")}
          </button>
          <div style={{ ...px(BOX.x, BOX.y, BOX.w, BOX.h), border: "1px solid #111", borderTopWidth: 2, borderLeftWidth: 2, boxSizing: "border-box", pointerEvents: "none" }} />
          <textarea value={vision} onChange={(e) => setVision(e.target.value)} maxLength={2200} {...noFill("vision")}
            style={{ ...px(BOX.x + 14, BOX.y + 12, BOX.w - 28, BOX.h - 40), ...inputStyle, fontStyle: "normal", fontSize: 14, textDecoration: "none", resize: "none", lineHeight: 1.5, overflow: "auto", background: "transparent", padding: 0 }} />
          <span style={{ ...px(BOX.x + BOX.w - 174, baseTop(BOX.y + BOX.h - 13, 11), 160, 14), font: `11px ${HNW}`, lineHeight: "11px", color: "#8a8a8a", textAlign: "right" }}>{words} / 300 {t("words")}</span>
          {/* round 107 #1 (owner): the size row starts at the prompt box's
              LEFT edge (it used to hang off its right edge) */}
          {/* the row is a flex that aligns on the INPUT's baseline, and an
              input's box sits 7 lower than a bare 14px line (measured) —
              so the row is lifted by that much to put its TEXT on the
              page's bottom line */}
          <div style={{ position: "absolute", left: BOX.x, top: baseTop(VIS_FOOT - 7, 14), display: "flex", alignItems: "baseline" }}>
            {([["Label Width:", "width"], ["Label Height:", "height"]] as const).map(([cap, key2], gi) => (
              <span key={key2} style={{ display: "flex", alignItems: "baseline", marginLeft: gi ? 28 : 0 }}>
                <span style={{ font: `700 14px ${HNW}`, lineHeight: "14px" }}>{t(cap)}</span>
                <input value={f[key2]} {...noFill(key2)} onChange={(e) => setF((m) => ({ ...m, [key2]: e.target.value.replace(/[^\d.]/g, "") }))}
                  style={{ width: Math.max(1, (f[key2] || "").length) * 8.2 + 4, font: `italic 14px ${HNW}`, lineHeight: "14px", border: "none", borderBottom: "1px solid #111", outline: "none", background: "transparent", padding: 0, textAlign: "center", marginLeft: 4 }} />
                <span style={{ font: `italic 14px ${HNW}`, lineHeight: "14px", marginLeft: 4 }}>{t("mm")}</span>
              </span>
            ))}
          </div>
          {/* 2026-09-23 (owner): the label-size preview box is gone */}
          {/* the dashed column rule */}
          {dashRule(788, 133, 522, true, "vrule")}
          {/* ── right: the label's own details ── */}
          <span style={{ ...px(891.8, baseTop(149.08, 24), 500, 24), font: `700 24px ${HNW}`, lineHeight: "24px", color: "#111", whiteSpace: "nowrap" }}>{t("LABEL DETAILS")}</span>
          <span style={{ ...px(891.8, baseTop(183, 14), 410, 76), font: `italic 14px ${HNW}`, lineHeight: "18px", color: "#111" }}>
            {/* round 95 #2 (owner): what they type is what prints — case and
                language. Round 108 #3: ONE flowing paragraph — the forced
                break left Georgian with a half-empty first line. */}
            {t("Feel free to leave out fields you don't want on your front label.")}{" "}
            {t("Type each field exactly as it should print: capitals, spelling and language stay as you enter them.")}</span>
          {FRONT_ROWS.map((k2, i) => {
            /* ROUND 111 (owner): the list's last rule ends on the SAME pixel
               as the page's dashed column rule (its foot is y655, and a
               row's rule is drawn at base+2.5 and is one unit deep) */
            const base = VIS_FOOT - 3.5 - (FRONT_ROWS.length - 1 - i) * 30;
            return (
              <span key={k2}>
                <span style={{ ...px(891.8, baseTop(base, 14), 130, 14), font: `700 ${lang === "ge" ? 13 : 14}px/14px ${HNW}`, color: "#111", whiteSpace: "nowrap" }}>{t(FRONT_LABELS[i])}</span>
                <input value={f[k2] || ""} placeholder={t(FRONT_PH[i])} {...noFill(k2)}
                  onChange={(e) => setF((m) => ({ ...m, [k2]: e.target.value }))}
                  /* round 87 (owner): typed text sat ON its rule line — 2px up */
                  style={{ ...px(1012, base - IN_BASE * (14 / 15) - 2, 288, 20), ...inputStyle, fontSize: 14 }} />
                {rowLine(1013, base + 2.5, 1302.86 - 1013, `ln${i}`)}
              </span>
            );
          })}
        </>);
      }

      case "loader": {
        /* round 19: VISIBLE, never-stalling movement — fast creep for the
           first ~25s (1.2%/s), then a slow trickle; monotonic via fillMax */
        const el = Date.now() - dreamT.current + tick * 0;
        /* ROUND 86 #2 (owner: "too long before a substantial amount of wine
           appears"): the hybrid run is ~15–40 s, so the glass fills in
           BIG early steps — 4 %/s for the first 10 s, then 1.5 %/s, capped
           at 0.72 so the real jumps still have somewhere to go */
        const creep = el < 10000 ? (el / 1000) * 0.04 : Math.min(0.72, 0.4 + ((el - 10000) / 1000) * 0.015);
        const fill = Math.max(fillMax.current, Math.min(0.97, Math.max(0.06, genProgress + creep)));
        fillMax.current = fill;
        return (<>
          {patch(400, 90, 640, 500, "lcover")}
          {/* glass optically centred in the window (round 7 #10) */}
          <div style={{ ...px(601, 283.5, 238, 320) }}>
            <svg viewBox="0 0 595.276 609.089" width="238" aria-label="Designing your label">
              <clipPath id="nuiWineClip"><rect x="230" y={266.6 - fill * 95} width="140" height={fill * 95 + 4} style={{ transition: `all 650ms ${EASE}` }} /></clipPath>
              <path fill="#BA141A" clipPath="url(#nuiWineClip)" d="M352.397 185.696 C353.872 199.478 353.325 211.872 350.76 222.63 C346.838 239.075 336.88 251.431 321.163 259.355 C311.285 264.336 301.979 266.038 298.571 266.527 C296.674 266.308 286.165 264.888 274.916 259.216 C259.199 251.292 249.241 238.936 245.319 222.491 C242.762 211.769 242.21 199.422 243.667 185.696 Z" />
              <g fill="none" stroke="#231F20" strokeWidth="7.426">
                <path d="M254.813 401.491 L297.631 401.491 L297.631 276.2 C297.631 276.2 246.711 271.948 235.438 224.682 C222.211 169.219 254.078 108.466 254.078 108.466 L341.155 108.635 C341.155 108.635 373.068 169.358 359.84 224.821 C348.568 272.087 297.648 276.339 297.648 276.339" />
                <path d="M297.8 276.2 L297.8 401.491 L340.618 401.491" />
              </g>
            </svg>
          </div>
          {/* round 24 #4: phrase centred on the glass axis, dots on their own
              row below, note one more row down */}
          <span style={{ ...px(0, 466, W, 20), font: `15px ${HNW}`, textAlign: "center", display: "block" }}>
            {t("Designing your label")}
          </span>
          <span style={{ ...px(0, 494, W, 18), font: `16.5px ${HNW}`, letterSpacing: 2.2, textAlign: "center", display: "block", lineHeight: "12px" }}>
            {[0, 1, 2].map((d) => (
              <span key={d} style={{ animation: `nuiDot 1.2s ${d * 0.2}s infinite` }}>.</span>
            ))}
          </span>
          {/* round 72 #9: the walkthrough's loader is over in seconds — the
              real wait note would be a lie there */}
          <span style={{ ...px(0, 522, W, 18), font: `italic 13px ${HNW}`, color: "#555", textAlign: "center", display: "block", opacity: tut >= 0 ? 0 : 1 }}>
            {(() => {
              /* round 46 (owner: "calculate real average"): once real runs
                 exist, the estimate is their measured average */
              let avg = 0;
              try {
                const s = (JSON.parse(localStorage.getItem("nui-gen-secs") || "[]") as number[]).filter((n) => Number.isFinite(n) && n > 0);
                if (s.length) avg = Math.round(s.reduce((a, b2) => a + b2, 0) / s.length);
              } catch { }
              return avg
                ? t("Please stay on this page — preparing your labels usually takes about {N} seconds.").replace("{N}", String(avg))
                : t("Please stay on this page — preparing your labels usually takes 15–35 seconds.");
            })()}
          </span>
        </>);
      }
      case "options": {
        /* ROUND 60 #1 (owner): each style column is its own mini-carousel.
           A variations press makes ONE new label of that style; switcher
           dots appear UNDER the label, centered to it — one dot per
           version (original + each variation). */
        const covers: React.ReactNode[] = [];
        covers.push(patch(255, 503, 930, 24, "dots"));
        covers.push(patch(135, 546, 1172, 40, "selrow"));
        covers.push(patch(135, 578, 1172, 44, "selbars"));
        for (const fx0 of [137.1, 480, 548.5, 891.4, 960, 1302.9])
          for (const fy0 of [240, 468.6]) covers.push(patch(fx0 - 11, fy0 - 11, 22, 22, `c${fx0}-${fy0}`));
        /* round 50 #1: portrait labels stop at 519 so the dot rows keep
           air above the buttons */
        const CUBE = 34.3, AREA_TOP = 290, AREA_BOT = 540;
        /* ROUND 94 #5 (owner): "Punk" is FUNKY everywhere the customer reads */
        /* ROUND 94 #6 (owner's Front_Label_UI reference): the style's NAME
           over each column with a dashed rule, the label with its crosses,
           three dots (the three layouts of one painting), then SAVE. No
           variation buttons, no subtitle. */
        /* ROUND 113 #3 (owner): "make dashed line above the labels same
           width as the labels" — so the head has to know where the
           column's label will land. ONE measurement, used by the head and
           by the label itself; with no dream yet it falls back to the
           size the customer typed, so the empty page draws the same box. */
        const labelBox = (fi: number) => {
          const nat = imgDims[fi];
          const ar = nat ? nat.w / nat.h : (Number(f.width) || 110) / (Number(f.height) || 80);
          let lw: number, lh: number;
          if (ar >= 1) { lw = OPT_W; lh = OPT_W / ar; if (lh > AREA_BOT - AREA_TOP) { lh = AREA_BOT - AREA_TOP; lw = lh * ar; } }
          else { lh = AREA_BOT - AREA_TOP; lw = lh * ar; if (lw > OPT_W - 2 * CUBE) { lw = OPT_W - 2 * CUBE; lh = lw / ar; } }
          return { lx: OPT_FRAMES[fi].x + (OPT_W - lw) / 2, ly: AREA_TOP + (ar >= 1 ? 0 : (AREA_BOT - AREA_TOP - lh) / 2), lw, lh };
        };
        const styleHead = (fi: number) => {
          /* the empty page still shows a full-width grey slot, so its rule
             keeps the column's full width */
          const b = dreams.length ? labelBox(fi) : { lx: OPT_FRAMES[fi].x, lw: OPT_W };
          const who = dreams[fi]?.artist || "";
          /* ROUND 113 #2 (owner): the artist's name at the progress bar's
             own title size (the portrait circle went 2026-09-23) */
          const AV = BAR_FS + 7;
          return (
            <span key={"sh" + fi}>
              {/* round 102: an artist's column carries the artist's name */}
              <div style={{ ...px(b.lx, baseTop(221, BAR_FS) - (AV - BAR_FS) / 2, b.lw, AV), display: "flex", alignItems: "center", justifyContent: "center", columnGap: 7, pointerEvents: "none" }}>
                {/* 2026-09-23 (owner): no portrait, and the name as it is
                    written — "Style By: Mariam Kvashilava", not all capitals */}
                <span style={{ font: `700 ${BAR_FS}px/${BAR_FS}px ${HNW}`, whiteSpace: "nowrap" }}>{/* 2026-09-23 (owner: "a column that never came showed FUNKY, like
                    an error — take the old titles out altogether") */}
                  {who ? `${t("Style By:")} ${who}` : ""}</span>
              </div>
              {/* round 114 (owner): the dashed rule under the artist's
                  name is gone — the name stands on its own */}
            </span>
          );
        };
        return (<>
          {covers}
          {patch(135, 164, 1170, 26, "stynames")}
          {OPT_FRAMES.map((_, fi) => styleHead(fi))}
          {OPT_FRAMES.map((fr, fi) => {
            const orig = dreams[fi];
            if (!orig?.preview && !orig?.dream) return null;
            const dv = viewedDream(fi);
            const { lx, ly, lw, lh } = labelBox(fi);
            return (
              <div key={fi}>
                {dv ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={dv.preview || dv.dream} alt={orig.style} title={t("Show this one big")}
                    onClick={() => setGallery({ items: [dreams[fi], ...(styleVars[fi] || [])].filter(Boolean).map((d) => (d as Dream).preview || (d as Dream).dream), index: styleView[fi] || 0, save: () => saveFront(fi), saved: selected === fi })}
                    style={{ ...px(lx, ly, lw, lh), cursor: "pointer", objectFit: "fill" }} />
                ) : (
                  /* a variation is being born — label-shaped loader */
                  <div style={{ ...px(lx, ly, lw, lh), background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {/* round 86 #3: a re-layout takes seconds, not a minute */}
                    {miniGlass("var" + fi, Math.min(0.9, 0.2 + ((Date.now() - varT.current) / 6000) * 0.7 + tick * 0))}
                  </div>
                )}
                {/* ROUND 85 #6 (owner's board): the selection frame stands
                    OFF the label — 10px out on every side — and the corner
                    crosses sit on the frame's corners, not the label's */}
                {selected === fi
                  ? dashedBox(lx - 10, ly - 10, lw + 20, lh + 20, "selD" + fi, true)
                  : (<span key={"plain" + fi}>
                      {cross(lx - 10, ly - 10, `tl${fi}`)}{cross(lx + lw + 10, ly - 10, `tr${fi}`)}
                      {cross(lx - 10, ly + lh + 10, `bl${fi}`)}{cross(lx + lw + 10, ly + lh + 10, `br${fi}`)}
                    </span>)}
                {/* 2026-09-23 (owner): no variations, so no dots */}
              </div>
            );
          })}
          {dreams.length === 0 && OPT_FRAMES.map((fr, i) =>
            notMade(fr.x, OPT_TOP, OPT_W, OPT_BOT - OPT_TOP, "front", "nmopt" + i))}
          {/* ROUND 53 #8: a bar-jump before generation shows the REAL page
              furniture, deactivated and grey */}
          {dreams.length === 0 && OPT_FRAMES.map((fr, fi) => (
            <div key={"grey" + fi} style={{ ...px(fr.x + 0.2, 637, OPT_W, 34.3), background: "#ECECEA", color: "#B3B1A8", font: `12px ${HNW}`, letterSpacing: 0.3, display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4 }}>
              {t("Save")}</div>
          ))}
          {/* ROUND 88 #9 (owner): SAVE — a black button under the variations,
              in place of the "Select" ring; it marks the column and flies the
              label into the folder */}
          {dreams.length > 0 && OPT_FRAMES.map((fr, fi) => {
            const on = selected === fi;
            return (
              <button key={"sv" + fi} onClick={() => saveFront(fi)}
                style={{ ...px(fr.x + 0.2, 637, OPT_W, 34.3), cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: on ? "#fff" : "#111", color: "#111", border: "1px solid #111", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4, transition: `background 240ms ${EASE}, color 240ms ${EASE}`, ...(on ? {} : { color: "#fff" }) }}>
                {on ? t("Saved") : t("Save")}</button>
            );
          })}
        </>);
      }
      case "backdetails": {
        /* ROUND 63 (owner's "Back Label Details@3x" mock): BACK LABEL
           DETAILS and MARKET COMPLIANCE share one page, split by a dashed
           band rule at y586. The market grid became a dropdown behind the
           underlined word MARKET. */
        const BOX = { x: 136, y: 208, w: 551, h: 208 };
        const dwords = (b.description || "").trim() ? (b.description || "").trim().split(/\s+/).length : 0;
        const FLAG_X = [317.7, 570.2, 822.6, 1075.0];      /* flag centres inside flags.png */
        const PNG_ROW = [351.8, 403.5, 455.5, 505.8];
        const NAMES: Record<string, string> = {
          EU: "European Union", US: "United States", GB: "United Kingdom", JP: "Japan",
          AU: "Australia", NZ: "New Zealand", CN: "China", KR: "South Korea",
          BR: "Brazil", MX: "Mexico", IL: "Israel", GE: "Georgia", CA: "Canada",
        };
        const modeStyle = (active: boolean): React.CSSProperties => ({
          /* classic theme's global CSS uppercases <label> — undo it */
          cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, textTransform: "none", transition: `all 240ms ${EASE}`,
          background: active ? "#111" : "#fff", color: active ? "#fff" : "#111",
          border: "1px solid #111", boxSizing: "border-box",
          display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4,
        });
        return (<>
          {patch(0, HEADER_H, W, FOOTER_Y - HEADER_H, "bdwipe")}
          <span style={{ ...px(139, baseTop(149.08, 24), 600, 24), font: `700 24px ${HNW}`, lineHeight: "24px", color: "#111", whiteSpace: "nowrap" }}>{t("BACK LABEL DETAILS")}</span>
          {/* ── left: the wine description ── */}
          <div style={{ ...px(BOX.x, BOX.y, BOX.w, BOX.h), border: "1px solid #111", borderTopWidth: 2, borderLeftWidth: 2, boxSizing: "border-box", pointerEvents: "none" }} />
          {/* ROUND 76 #5 (owner): the caption sits ABOVE the box now, on its
              left edge and close to it — the whole box is writing space */}
          <span style={{ ...px(BOX.x, baseTop(196, 15), 300, 16), font: `700 15px ${HNW}`, lineHeight: "15px", color: "#111" }}>{t("Wine Description")}</span>
          <textarea value={b.description || ""} {...noFill("description")}
            onChange={(e) => setB((m) => ({ ...m, description: e.target.value }))}
            style={{ ...px(BOX.x + 17, BOX.y + 16, BOX.w - 34, BOX.h - 48), ...inputStyle, fontStyle: "normal", textDecoration: "none", fontSize: 14, resize: "none", lineHeight: 1.45, overflow: "auto", background: "transparent", padding: 0 }} />
          <span style={{ ...px(BOX.x + BOX.w - 174, baseTop(BOX.y + BOX.h - 11, 11), 160, 14), font: `11px ${HNW}`, lineHeight: "11px", color: "#8a8a8a", textAlign: "right" }}>{dwords} / 300 {t("words")}</span>
          {/* ── right: the regulated fields ── */}
          {BACK_ROWS.map((k, i) => {
            const base = 215.6 + i * 32;
            return (
              <span key={k}>
                <span style={{ ...px(755.5, baseTop(base, 14), 230, 14), font: `700 ${lang === "ge" ? 13 : 14}px/14px ${HNW}`, color: "#111", whiteSpace: "nowrap" }}>{t(BACK_LABELS[i])}</span>
                <input value={b[k] || ""} placeholder={t(BACK_PH[i])} {...noFill(k)}
                  onChange={(e) => setB((m) => ({ ...m, [k]: e.target.value }))}
                  style={{ ...px(989, base - IN_BASE * (14 / 15) - 2, 311, 20), ...inputStyle, fontSize: 14 }} />
                {rowLine(990, base + 2.5, 1302.86 - 990, `bln${i}`)}
              </span>
            );
          })}
          {/* ── barcode (ROUND 27's honest GTIN, in the mock's button row) ── */}
          <span style={{ ...px(139, baseTop(472, 14), 112, 14), font: `700 14px ${HNW}`, lineHeight: "14px" }}>{t("Barcode:")}</span>
          <input value={gtin} onChange={(e) => setGtin(e.target.value)} placeholder="E.g. 4860012345676" {...noFill("gtin")}
            style={{ ...px(232, 472 - IN_BASE * (14 / 15) - 2, 450, 20), ...inputStyle, fontSize: 14 }} />
          {rowLine(233, 474.5, 686 - 233, "gtln")}
          {gtin.trim() && (
            <span style={{ ...px(233, baseTop(492, 11), 320, 14), font: `11px ${HNW}`, lineHeight: "11px", color: gtinValid ? "#3f6d2a" : "#8e2b2b" }}>
              {gtinValid ? t("✓ barcode will be drawn") : t("needs 12 or 13 digits")}
            </span>
          )}
          {(lang === "ge"
            ? ["ჩაწერე შენი GS1 GTIN ნომერი და ბეჭდვისთვის", "მზა შტრიხკოდს უკანა ეტიკეტზე ჩვენ დავიტანთ."]
            : ["If you don't have a barcode, we'll provide an official GTIN barcode", "and integrate it into your back label."]
          ).map((ln, i) => (
            <span key={"bc" + i} style={{ ...px(139.6, baseTop(517 + i * 18, 13), 560, 14), font: `13px ${HNW}`, color: "#111", lineHeight: "13px", whiteSpace: "nowrap" }}>{ln}</span>
          ))}
          <a href="https://www.gs1.org/standards/get-barcodes" target="_blank" rel="noreferrer"
            style={{ ...px(139.6, baseTop(553, 11), 320, 14), font: `italic 11px ${HNW}`, color: "#8a8a8a", textDecoration: "underline", lineHeight: "11px" }}>
            {t("No GTIN yet? Register at gs1.org")}</a>
          {/* ── QR pair, exactly where the mock puts them ── */}
          <button onClick={() => { setQrImg(""); setQrMode(qrMode === "create" ? "" : "create"); }} style={{ ...px(754, 450, 241, 34.3), ...modeStyle(qrMode === "create") }}>{t("Create QR Code")}</button>
          <label style={{ ...px(1064, 450, 239, 34.3), ...modeStyle(qrMode === "upload") }}>
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
              const file = e.target.files?.[0]; if (!file) return;
              const rd = new FileReader(); rd.onload = () => { setQrImg(String(rd.result)); setQrMode("upload"); }; rd.readAsDataURL(file);
            }} />
            {t("Upload QR Code")}
            {qrImg && <span style={{ position: "absolute", left: 0, top: 38, width: 239, font: `11px ${HNW}`, color: "#3f6d2a", textAlign: "center" }}>{t("✓ QR uploaded")}</span>}
          </label>
          {(lang === "ge"
            ? ["თუ QR კოდი არ გაქვთ, ჩვენ შევქმნით და მივაბამთ სპეციალურ", "გვერდს ინგრედიენტებით, კვებითი ღირებულებით და ინფორმაციით."]
            : ["If you don't have a QR code, we'll generate one and link it to a dedicated page", "with your wine's ingredients, nutrition, and product information."]
          ).map((ln, i) => (
            <span key={"qr" + i} style={{ ...px(752.5, baseTop(517 + i * 18, 13), 560, 14), font: `13px ${HNW}`, color: "#111", lineHeight: "13px", whiteSpace: "nowrap" }}>{ln}</span>
          ))}
          {qrMode === "create" && (
            <label style={{ ...px(752.5, baseTop(553, 13), 300, 14), font: `13px ${HNW}`, lineHeight: "13px", color: "#111", textDecoration: "underline", textTransform: "none", cursor: "pointer", whiteSpace: "nowrap" }}>
              <input type="file" accept=".txt,.md,.csv,text/plain" style={{ display: "none" }} onChange={(e) => {
                const file = e.target.files?.[0]; if (!file) return;
                const rd = new FileReader(); rd.onload = () => setIngredients(String(rd.result).slice(0, 20000)); rd.readAsText(file);
              }} />
              {ingredients ? t("Ingredients uploaded ✓") : t("Upload Ingredients")}
            </label>
          )}
          {/* ── the band rule, then market compliance ── */}
          {dashRule(138, 586, 1301 - 138, false, "hrule")}
          {/* round 69 #3: title + paragraph start on the SAME horizontal line as
              the Select Market button's top edge (653) — cap ascents measured
              live: 17.54 at 700 24px, 10.23 at 14px (+2px of the 18px line
              box, which baseTop does not know about) */}
          <span style={{ ...px(139, baseTop(670.54, 24), 500, 24), font: `700 24px ${HNW}`, lineHeight: "24px", color: "#111", whiteSpace: "nowrap" }}>{t("MARKET COMPLIANCE")}</span>
          {/* round 108 #9 (owner): the same size as the GTIN note opposite */}
          <span style={{ ...px(lang === "ge" ? 139 : 446.2, baseTop(lang === "ge" ? 700.34 : 661.23, 13), lang === "ge" ? 560 : 270, 60), font: `13px ${HNW}`, lineHeight: "18px", color: "#111" }}>
            {t("Select the market(s) where your wine will be sold, and we’ll incorporate required regulatory information.")}</span>
          {/* ROUND 67 (owner's Unclicked / Opened / Selected references):
              the market picker is a BLACK button the size of the QR ones —
              "Select Market ^" closed, "Select v" while the drop-UP panel
              is open, "Selected v" once markets are chosen, with the picked
              flags listed to its right. */}
          {(() => {
            const MB = { x: 753, y: 653, w: 241, h: 34.3 };
            const ROW_H = 25, HEAD_H = 30, PAD = 12;
            const panelH = PAD + HEAD_H + 8 + COMP.length * ROW_H + PAD;
            const picked = COMP.filter((c) => markets.includes(c.code));
            const label = marketOpen ? t("Select") : picked.length ? t("Selected") : t("Select Market");
            /* round 69 #2: the chevron follows the PANEL — up whenever the
               menu is closed (picked or not), down while it is open */
            const up = !marketOpen;
            /* round 68 #2: white like the QR buttons until it is used —
               black once the panel opens and from then on */
            const dark = marketOpen || picked.length > 0;
            const ink = dark ? "#fff" : "#111";
            const AW = 15.4, AH = 7.7;   // the reference arrow, 30% smaller
            const flag = (col: number, row: number, w2 = 22) => (
              <span style={{
                width: w2, height: w2 * 20 / 26, flex: "0 0 auto",
                backgroundImage: "url(/newui/flags.png)", backgroundSize: `${959.8 * w2 / 26}px ${261.1 * w2 / 26}px`,
                backgroundPosition: `${-(FLAG_X[col] - 13 - 250.9) * w2 / 26}px ${-(PNG_ROW[row] - 10 - 289.8) * w2 / 26}px`,
              }} />
            );
            /* round 93 #12/#14: the bottle page's ring (18 px, 2 px stroke,
               7.5 px dot) — and a box that cannot clip it */
            const ring = (on: boolean) => (
              <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 18, height: 18, overflow: "visible" }}>
                {ringSvg(18, on, { stroke: 2, dot: 7.5 })}
              </span>
            );
            return (<>
              <button onClick={() => setMarketOpen((o) => !o)}
                /* while the panel is open the button rides ABOVE its
                   click-blocker, so pressing it closes the menu */
                style={{ ...px(MB.x, MB.y, MB.w, MB.h), background: dark ? "#111" : "#fff", border: "1px solid #111", cursor: "pointer", padding: 0, textTransform: "none", boxSizing: "border-box", transition: `all 240ms ${EASE}`, zIndex: marketOpen ? 14 : undefined }}>
                <span style={{ position: "absolute", left: 0, top: baseTop(MB.h / 2 + 4.5, 12), width: MB.w, textAlign: "center", font: `12px ${HNW}`, letterSpacing: 0.3, lineHeight: "12px", color: ink }}>{label}</span>
                <svg viewBox="0 0 22 11" width={AW} height={AH} style={{ position: "absolute", right: 11, top: (MB.h - AH) / 2 }}>
                  <polyline points={up ? "1,10 11,1 21,10" : "1,1 11,10 21,1"} fill="none" stroke={ink} strokeWidth="2" />
                </svg>
              </button>
              {/* the chosen markets, listed beside the button */}
              {!marketOpen && picked.length > 0 && (
                <div style={{ position: "absolute", left: MB.x + MB.w + 29, top: baseTop(MB.y + MB.h / 2 + 5, 14), display: "flex", alignItems: "center", columnGap: 10, flexWrap: "wrap", width: 300 }}>
                  {picked.map((c) => (
                    <span key={c.code} style={{ display: "flex", alignItems: "center", columnGap: 8 }}>
                      {flag(c.col, c.row)}
                      <span style={{ font: `14px ${HNW}`, lineHeight: "14px", color: "#111", whiteSpace: "nowrap" }}>{t(NAMES[c.code])}</span>
                    </span>
                  ))}
                </div>
              )}
              {marketOpen && (<>
                <div style={{ ...px(0, 0, W, H), zIndex: 12 }} onClick={() => setMarketOpen(false)} />
                {/* 2026-09-25 (owner: "the menu's right side looks cut off"):
                    the input rules and the QR button behind ran right up to
                    its edge — a white margin keeps the page off it */}
                <div style={{ ...px(MB.x, MB.y - panelH, MB.w, panelH), background: "#fff", border: "1px solid #111", boxSizing: "border-box", zIndex: 13, padding: `${PAD}px 0`, boxShadow: "0 0 0 12px #fff" }}>
                  <button onClick={() => { setMarkets([]); setNoComp(true); }}
                    style={{ position: "relative", display: "flex", alignItems: "center", width: "100%", height: HEAD_H, padding: "0 14px", background: "transparent", border: "none", cursor: "pointer", textTransform: "none" }}>
                    <span style={{ font: `700 14px ${HNW}`, color: "#111", whiteSpace: "nowrap" }}>{t("No compliance needed")}</span>
                    {ring(noComp)}
                  </button>
                  <svg style={{ display: "block", margin: "4px 14px", height: 1, width: "calc(100% - 28px)" }} preserveAspectRatio="none">
                    <line x1="0" y1="0.5" x2="100%" y2="0.5" stroke="#000" strokeWidth="1" strokeDasharray="4.12 4.12" shapeRendering="crispEdges" />
                  </svg>
                  {COMP.map(({ code, col, row }) => {
                    const on = markets.includes(code);
                    return (
                      <button key={code} onClick={() => setMarkets((ms) => {
                        const nxt = on ? ms.filter((m) => m !== code) : [...ms, code];
                        setNoComp(nxt.length === 0);
                        return nxt;
                      })}
                        style={{ position: "relative", display: "flex", alignItems: "center", width: "100%", height: ROW_H, padding: "0 14px", columnGap: 10, background: on ? "#F2F1ED" : "transparent", border: "none", cursor: "pointer", textTransform: "none" }}>
                        {flag(col, row)}
                        <span style={{ font: `${on ? 700 : 400} 13px ${HNW}`, color: "#111", whiteSpace: "nowrap" }}>{t(NAMES[code])}</span>
                        {ring(on)}
                      </button>
                    );
                  })}
                </div>
              </>)}
            </>);
          })()}
        </>);
      }

      case "backdesign": {
        const fit = fitIn(BD_AREA.w, BD_AREA.h, backDims.w, backDims.h);
        const lx = BD_AREA.x + fit.dx, ly = BD_AREA.y + fit.dy;
        /* ROUND 113 #4 (owner): "Back label page with placeholders is not
           in sync with the actual layout… if we make any change in real
           UI the placeholder pages should also adapt". So the empty page
           is the filled page with the ink taken out: the same dashed
           frame with its corner pluses, the same size caption on the same
           midline, and BOTH buttons — Edit and Save — in their real
           places, greyed. The geometry is read from the same numbers. */
        const BD_EDIT_Y = 589, BD_SAVE_Y = 657.6, BD_BX = 548.6, BD_BW = 341.4, BD_BH = 34.3;
        /* with nothing made yet the slot is the whole area, so the frame
           stands 10 off it exactly as it stands off a real label */
        const capY = ((backPng ? ly + fit.h : BD_AREA.y + BD_AREA.h) + BD_EDIT_Y) / 2 - 7.5;
        const sizeCaption = (rows: readonly (readonly [string, string])[], grey: boolean) => (
          <div style={{ position: "absolute", left: BD_AREA.x, top: capY, width: BD_AREA.w, display: "flex", justifyContent: "center", alignItems: "baseline", columnGap: 24, pointerEvents: "none" }}>
            {rows.map(([cap, v]) => (
              <span key={cap} style={{ display: "flex", alignItems: "baseline" }}>
                <span style={{ font: `700 14px ${HNW}`, lineHeight: "15px", ...(grey ? { color: "#C9C7BF" } : {}) }}>{t(cap)}</span>
                <span style={{ font: `italic 14px ${HNW}`, lineHeight: "15px", marginLeft: 4, ...(grey ? { color: "#C9C7BF" } : {}) }}>{v} {t("mm")}</span>
              </span>
            ))}
          </div>
        );
        return (<>
          {/* cover baked mock + its corner crosses + Edit/magnifier row */}
          {patch(BD_AREA.x - 12, BD_AREA.y - 12, BD_AREA.w + 24, BD_AREA.h + 24, "bdmock")}
          {patch(546, 546, 350, 40, "bdrow")}
          {!backPng && (<>
            {notMade(BD_AREA.x, BD_AREA.y, BD_AREA.w, BD_AREA.h, "back", "nmbd")}
            {dashedBox(BD_AREA.x - 10, BD_AREA.y - 10, BD_AREA.w + 20, BD_AREA.h + 20, "bdDempty", true, "#C9C7BF")}
            {/* round 53 #8: deactivated grey furniture on the empty page */}
            {sizeCaption([["Width:", "—"], ["Height:", "—"]] as const, true)}
            {([["Edit", BD_EDIT_Y], ["Save", BD_SAVE_Y]] as const).map(([cap, y]) => (
              <div key={cap} style={{ ...px(BD_BX, y, BD_BW, BD_BH), background: "#ECECEA", color: "#B3B1A8", font: `12px ${HNW}`, letterSpacing: 0.3, display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4 }}>{t(cap)}</div>
            ))}
          </>)}
          {backPng && (<>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={backPng} alt="back label" title={t("Show this one big")}
              onClick={() => setGallery({ items: [backPng], index: 0, save: () => { setBackSaved((v) => { flyToFolder([{ src: backPng, x: lx, y: ly, w: fit.w, h: fit.h }], v); return !v; }); }, saved: backSaved })}
              style={{ ...px(lx, ly, fit.w, fit.h), objectFit: "fill", cursor: "pointer" }} />
            {/* round 88 #8: the frame stands 10px off the label, crosses on its corners */}
            {dashedBox(lx - 10, ly - 10, fit.w + 20, fit.h + 20, "bdD", true)}
            <button onClick={() => go("backdetails", -1)}
              style={{ ...px(BD_BX, BD_EDIT_Y, BD_BW, BD_BH), cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: "#111", color: "#fff", border: "1px solid #111", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4 }}>{t("Edit")}</button>
            {/* round 88 #7 (owner): SAVE under Edit — flies the back label into the folder */}
            <button onClick={() => { setBackSaved(!backSaved); flyToFolder([{ src: backPng, x: lx, y: ly, w: fit.w, h: fit.h }], backSaved); }}
              style={{ ...px(BD_BX, BD_SAVE_Y, BD_BW, BD_BH), cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: backSaved ? "#fff" : "#111", color: backSaved ? "#111" : "#fff", border: "1px solid #111", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4, transition: `background 240ms ${EASE}, color 240ms ${EASE}` }}>{backSaved ? t("Saved") : t("Save")}</button>
            {/* ROUND 51 #7/#8 (owner): informational size caption — same
                type as the front page's Width/Height, no input, no
                underline, centered between the label and Edit. The width
                falls out of the composed PNG's aspect and rounds to 5mm;
                the height is the customer's own front-label height. */}
            {(() => {
              const hmm = Number(f.height) || 80;
              const wmm = Math.round((hmm * (backDims.w / backDims.h)) / 5) * 5;
              return sizeCaption([["Width:", String(wmm)], ["Height:", String(hmm)]] as const, false);
            })()}
          </>)}
        </>);
      }
      case "bottle": {
        /* ROUND 48 (owner): the options zone is FIVE live columns — Wine
           Color joins before Bottle Type and "No Capsule" becomes a
           CLOSURE TYPE (the finish row lost "No cap"). The baked 4-column
           chrome is stripped at fetch (dividers+crosses) and the content
           is white-patched; everything inside the frame is redrawn at the
           new 191.9px column rhythm with the baked proportions (header
           baseline 217.7 = col+35.2, ring cx = col+43.2, text = col+62.2,
           row pitch 29.8). */
        const COLS_X = [342.86, 534.78, 726.7, 918.62, 1110.54];
        const ROWY = (i: number) => 283.57 + i * 29.8;
        /* round 49 #4: no closure picked (own-label reset) ALSO freezes
           the wheel — it only lives while a real capsule is chosen */
        const wheelOff = bottle.closure === "No Capsule" || !bottle.closure;
        const colHead = (ci: number, title: string) => (
          <span key={"bh" + ci} style={{ ...px(COLS_X[ci] + 35.2, 217.7 - 13, 160, 16), font: `700 15px ${HNW}`, lineHeight: "16px" }}>{t(title)}</span>
        );
        const optRow = (ci: number, row: number, name: string, on: boolean, pick: () => void) => {
          const cx = COLS_X[ci] + 43.2, cy = ROWY(row);
          return (
            <span key={ci + name}>
              {dotBtn(cx, cy, on, pick, ci + name + "d", { ring: true, r: 9 })}
              <span style={{ ...px(COLS_X[ci] + 62.2, cy - 9.4, 122, 16), font: `12px ${HNW}`, color: "#111", lineHeight: "16px", pointerEvents: "none" }}>{t(name)}</span>
              {/* round 41 #3: the word beside the circle selects too */}
              <button onClick={pick} style={{ ...px(cx + 12, cy - 12, 150, 24), ...ghost }} />
            </span>
          );
        };
        const pickOf = (key: string, opt: string) => () => {
          if (key === "type") bottleTouched.current = true;
          setBottle((m) => ({
            ...m, [key]: opt,
            ...(key === "type" && opt !== "Sparkling" && m.closure === "Sparkling Cork" ? { closure: "Cork" } : {}),
            ...(key === "type" && !CROWN_TYPES.includes(opt) && m.closure === "Crown Cap" ? { closure: "Cork" } : {}),
            /* round 66: switching TO sparkling drops a still-wine closure */
            ...(key === "type" && opt === "Sparkling" && m.closure !== "Sparkling Cork" && m.closure !== "Crown Cap" ? { closure: "Sparkling Cork" } : {}),
          }));
        };
        /* round 17 #2 / round 38 #1 filters, then No Capsule always last.
           ROUND 66 (owner): a Sparkling bottle takes ONLY its own two
           closures — everything else disappears. */
        const closures = bottle.type === "Sparkling"
          ? ["Sparkling Cork", "Crown Cap"]
          : ["Cork", "Screw Cap", "Wax Seal"]
            .concat(CROWN_TYPES.includes(bottle.type) ? ["Crown Cap"] : [])
            .concat(["No Capsule"]);
        return (<>
          {/* wipe the baked column content AND the baked frame: the board
              draws its own dashed rules and pluses, which sat a pixel off
              ours and doubled them (round 110). Ours are the only ones now. */}
          {patch(341.6, 171, 959.3, 413, "bzone")}
          {patch(126, 160, 1194, 26, "btopwipe")}
          {patch(126, 572, 1194, 26, "bbotwipe")}
          {dashGrid(137.14, 171.71, 1302.86 - 137.14, 583.41 - 171.71, COLS_X, "bgrid")}
          {colHead(0, "Wine Color")}
          {["Red", "White", "Amber", "Rosé"].map((c, i) => optRow(0, i, c, wineColor === c, () => setWineColor(c)))}
          {colHead(1, "Bottle Type")}
          {["Bordeaux", "Bordeaux Prestige", "Burgundy", "Sparkling", "Alsace / Rhine", "Ice Wine"].map((o, i) => optRow(1, i, o, bottle.type === o, pickOf("type", o)))}
          {colHead(2, "Bottle Color")}
          {["Olive Green", "Transparent", "Amber"].map((o, i) => optRow(2, i, o, bottle.color === o, pickOf("color", o)))}
          {colHead(3, "Closure Type")}
          {closures.map((o, i) => optRow(3, i, o, bottle.closure === o, pickOf("closure", o)))}
          {colHead(4, "Closure Color")}
          {/* round 49 #7: Glossy rides the SECOND row under Matte;
              round 50 #4: both grey out and freeze with the wheel */}
          <div style={{ opacity: wheelOff ? 0.3 : 1, pointerEvents: wheelOff ? "none" : "auto", filter: wheelOff ? "grayscale(1)" : "none", transition: `opacity 240ms ${EASE}` }}>
            {optRow(4, 0, "Matte", bottle.finish === "Matte", () => setBottle((m) => ({ ...m, finish: "Matte" })))}
            {optRow(4, 1, "Glossy", bottle.finish === "Glossy", () => setBottle((m) => ({ ...m, finish: "Glossy" })))}
          </div>
          {/* round 49 #6: result rect GONE; the lightness bar lies
              HORIZONTAL below the wheel (white left → black right), bar
              and wheel share the column's centre axis. Round 48 #3 /
              49 #4: greyed and inert without a real capsule. */}
          <div style={{ ...px(COLS_X[4], 368, 191.9, 175), opacity: wheelOff ? 0.3 : 1, filter: wheelOff ? "grayscale(1)" : "none", pointerEvents: wheelOff ? "none" : "auto", transition: `opacity 240ms ${EASE}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/newui/colorwheel.png" alt="" style={{ ...px(27.35, 0, 137.2, 137.2), pointerEvents: "none" }} />
            <div style={{ ...px(27.35, 0, 137.2, 137.2), cursor: "crosshair" }}
              onPointerDown={(e) => { dragRef.current = "wheel"; e.currentTarget.setPointerCapture(e.pointerId); wheelPick(e.clientX, e.clientY, e.currentTarget); }}
              onPointerMove={(e) => { if (dragRef.current === "wheel") wheelPick(e.clientX, e.clientY, e.currentTarget); }}
              onPointerUp={() => { dragRef.current = ""; }}>
              <span style={{ position: "absolute", left: `${wheel.x * 100}%`, top: `${wheel.y * 100}%`, transform: "translate(-50%,-50%)", width: 15.2, height: 15.2, borderRadius: 8, background: "transparent", border: "1.5px solid #111", pointerEvents: "none", boxSizing: "border-box" }} />
            </div>
            {/* horizontal capsule: white LEFT → black RIGHT */}
            <div style={{ ...px(27.63, 157, 136.64, 15), borderRadius: 7.5, background: "linear-gradient(90deg, #fff, #000)", pointerEvents: "none" }} />
            <div style={{ ...px(19.6, 148.5, 152, 32), cursor: "grab" }}
              onPointerDown={(e) => { dragRef.current = "shade"; e.currentTarget.setPointerCapture(e.pointerId); }}
              onPointerMove={(e) => {
                if (dragRef.current !== "shade") return;
                const r = e.currentTarget.getBoundingClientRect();
                const xx = (e.clientX - r.left) / r.width * 152;
                setShade(Math.min(1, Math.max(0, (xx - 14.69) / 121.64)));
              }}
              onPointerUp={() => { dragRef.current = ""; }}>
              <span style={{ position: "absolute", left: 14.69 + shade * 121.64 - 7.6, top: 8.4, width: 15.2, height: 15.2, borderRadius: 8, background: "transparent", border: "1.5px solid #111", boxSizing: "border-box" }} />
            </div>
          </div>
          {/* the owner's bottle-type photos (public/newui/bottles, 800×1600
              = the area's exact 1:2 ratio); Screw Cap shows the -screw
              variant (round 17 #4), Crown Cap the -crown (round 38 #1).
              On top: the colour-wheel CAP overlay (round 38 #3, painted
              inside the scanned silhouette, multiply so line art reads
              through) and the SELECTED LABEL at its true position and
              scale (round 38 #2, owner's positioning charts, flat). */}
          {(() => {
            const src = bottleSrc();
            const s = 407.4 / 1600;                       // cover scale
            const xoff = 139.2 - (800 * s - 201.6) / 2;
            const scan = bottleScans.current[bottleScanKey === src ? src : ""];
            /* ROUND 47: an uploaded own label takes the preview slot */
            const lab = customLabel ? { style: "custom", dream: customLabel, preview: customLabel } : viewedDream(selected);
            const mmW = customLabel ? customDims.w : Number(f.width) || 110;
            const mmH = customLabel ? customDims.h : Number(f.height) || 80;
            let labelEl: React.ReactNode = null;
            /* round 41 #8: no label yet → grey placeholder at the true
               position and default size from the front-details page */
            /* round 57 #5 / ROUND 58: whatever the mm say, the DRAWN
               label may never cross the bottle — capped to the scanned
               body width (minus a 6px margin each side) and the owner's
               red-line LABEL_ZONE for this bottle, keeping the aspect. */
            const zone = LABEL_ZONE[bottle.type] || [0.35, 0.92];
            /* round 59 #1: NO width cap — the label may read wider than
               the silhouette (it wraps a real bottle); only the owner's
               red-line zone limits the height/position */
            const fitLabel = (lw0: number, lh0: number) => {
              const bhD0 = scan ? (scan.bottom - scan.top) * s : 1;
              const k2 = Math.min(1, ((zone[1] - zone[0]) * bhD0) / lh0);
              return { lw: lw0 * k2, lh: lh0 * k2 };
            };
            const clampY = (ly0: number, lh0: number, topD0: number, bhD0: number) =>
              Math.min(Math.max(ly0, topD0 + zone[0] * bhD0), topD0 + zone[1] * bhD0 - lh0);
            if (scan && !lab) {
              const bhD = (scan.bottom - scan.top) * s;
              const topD = 174 + scan.top * s;
              const pxPerCm = bhD / (bottle.type === "Alsace / Rhine" ? 35 : 30);
              const { lw, lh } = fitLabel((mmW / 10) * pxPerCm, (mmH / 10) * pxPerCm);
              const anc = LABEL_ANCHOR[bottle.type] || LABEL_ANCHOR["Bordeaux"];
              const ly = clampY(anc.anchor === "top" ? topD + anc.pct * bhD : topD + bhD - anc.pct * bhD - lh, lh, topD, bhD);
              /* round 57 #4: the empty label slot INVITES — click → details */
              labelEl = (
                <button onClick={() => go("vision", -1)}
                  style={{ position: "absolute", left: xoff + scan.cx * s - lw / 2, top: ly, width: lw, height: lh, background: "#ECECEA", border: "none", cursor: "pointer", font: `11px ${HNW}`, color: "#8a887e", textTransform: "none", padding: 4, lineHeight: "14px" }}>
                  {t("Create front label")}</button>
              );
            }
            if (scan && lab) {
              const bhD = (scan.bottom - scan.top) * s;
              const topD = 174 + scan.top * s;
              const pxPerCm = bhD / (bottle.type === "Alsace / Rhine" ? 35 : 30);
              const { lw, lh } = fitLabel((mmW / 10) * pxPerCm, (mmH / 10) * pxPerCm);
              const anc = LABEL_ANCHOR[bottle.type] || LABEL_ANCHOR["Bordeaux"];
              const ly = clampY(anc.anchor === "top" ? topD + anc.pct * bhD : topD + bhD - anc.pct * bhD - lh, lh, topD, bhD);
              labelEl = (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={lab.preview || lab.dream} alt="label position"
                  style={{ position: "absolute", left: xoff + scan.cx * s - lw / 2, top: ly, width: lw, height: lh, objectFit: "fill", pointerEvents: "none", boxShadow: "0 0 0 0.5px rgba(0,0,0,0.2)" }} />
              );
            }
            return (<>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={src} alt={bottle.type} src={src}
                style={{ ...px(139.2, 174, 201.6, 407.4), objectFit: "cover", animation: inSlide ? "none" : `nuiFadeIn 240ms ${EASE}`, pointerEvents: "none" }} />
              <canvas ref={capCanvasRef} width={800} height={1600}
                style={{ position: "absolute", left: xoff, top: 174, width: 800 * s, height: 407.4, mixBlendMode: "multiply", pointerEvents: "none" }} />
              {labelEl}
            </>);
          })()}
          {/* round 12 #3: the frame back ON TOP of the photo — round 110:
              one element for the whole grid, so every plus sits on its
              crossing to the pixel */}
          {dashGrid(137.14, 171.71, 1302.86 - 137.14, 583.41 - 171.71, COLS_X, "bgrid2")}
          {/* ROUND 47 (owner): customers who already have their labels
              upload one here and go straight to marketing assets.
              ROUND 48: the confirmation is GREEN like every other ✓, and
              a fresh upload UNSELECTS every section — the customer picks
              each one before the next arrow lets them through. */}
          <label style={{ ...px(137.14, 551, 205.7, 18), font: `13px ${HNW}`, color: customLabel ? "#3f6d2a" : "#111", textDecoration: "underline", textTransform: "none", textAlign: "center", cursor: "pointer", display: "block", lineHeight: "18px" }}>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/*" style={{ display: "none" }} onChange={(e) => {
              const input = e.currentTarget;
              const file = input.files?.[0]; if (!file) return;
              /* ROUND 70 (owner: "upload label is not working"): the input
                 is CLEARED at the end of every attempt — a file input fires
                 no change event when the same file is picked twice, so a
                 second try with the same label used to do nothing at all. */
              const fail = () => {
                input.value = "";
                setWarn(t("That file could not be read — please use a PNG or JPEG"));
                setTimeout(() => setWarn(""), 5000);
              };
              const rd = new FileReader();
              rd.onerror = fail;
              rd.onload = () => {
                const raw = String(rd.result);
                const im = new Image();
                im.onerror = fail;
                im.onload = () => {
                  /* round 57 #5: BEST-GUESS real size — fit the image's
                     aspect inside a typical 110×120mm label window and
                     round to 5mm, so an oversized file can never claim
                     half the bottle */
                  const ar = im.naturalWidth / Math.max(1, im.naturalHeight);
                  let wmm = Math.min(110, 120 * ar);
                  let hmm = wmm / ar;
                  wmm = Math.max(40, Math.round(wmm / 5) * 5);
                  hmm = Math.max(30, Math.round(hmm / 5) * 5);
                  setCustomDims({ w: wmm, h: hmm });
                  setCustomLabel(flattenLabel(im, raw));
                  setAssets({ life: [] }); setAssetsSig("");
                  setBottle({ type: "", color: "", closure: "", finish: "" });
                  setWineColor("");
                  bottleTouched.current = true;
                  input.value = "";
                };
                im.src = raw;
              };
              rd.readAsDataURL(file);
            }} />
            {customLabel ? t("Your label ✓ — upload another") : t("Upload Another Label")}
          </label>
        </>);
      }
      case "assets": {
        /* ROUND 71 #3 (owner's new Assets@3x pair, measured off the 3x
           artboards): FIVE marketing images — a 274-square HERO plus four
           thumbs — and the whole block sits ~31px lower than before.
           The thumbs take one of two shapes, exactly as the owner drew
           them: a 2x2 grid of 122s when there is no product page, or a
           single 62-wide column of four when the page column is present.
           Frame y 274.6 h 342.8; rules at 274 / 411.5 (+891.25 with the
           page column); right edge 1062.5, or 1302.5 with it. */
        const custom = !!customLabel;
        const emptyJump = !custom && selected < 0;
        const landingCol = !custom && (qrMode === "create" || emptyJump);
        const BOX = { x: 137.14, y: 274.6, w: (landingCol ? 1302.5 : 1062.5) - 137.14, h: 342.8 };
        const R1 = 274, R2 = 411.5, R3 = 891.25;   /* the dashed column rules */
        const Y0 = 307.75, CH = 274.5;             /* the content band */
        const HERO = { x: 446, w: 274 };
        const N = Math.max(5, lifeTarget);
        const head = (x: number, title: string, sub: string, spec: string) => (
          <span key={"h" + x}>
            <span style={{ ...px(x, baseTop(184, 15), 400, 18), font: `700 15px ${HNW}`, lineHeight: "15px", whiteSpace: "nowrap" }}>{t(title)}</span>
            <span style={{ ...px(x, baseTop(213, 12), 400, 32), font: `12px ${HNW}`, color: "#111", lineHeight: "14px", whiteSpace: "pre-line" }}>{t(sub)}</span>
            <span style={{ ...px(x, baseTop(227, 12), 400, 16), font: `12px ${HNW}`, color: "#111", lineHeight: "14px" }}>{spec}</span>
          </span>
        );
        /* round 57 #3: `quiet` cells show NO message — just the grey box */
        /* ROUND 92 #1 (owner): the product shots read small — the PNG carries
           transparent air around the bottle — so the shot slots draw at
           130 % (a transform, the box stays put; the air overflows unseen) */
        const SHOT_ZOOM = 1.3;
        const slot = (x: number, y: number, w2: number, h2: number, it: { full: string; prev: string } | undefined, loadKey: string, fit: "cover" | "contain", quiet = false, onPick?: () => void, zoom = 1) =>
          it ? (zoom !== 1 ? (
            /* the zoomed shot lives in a clip the width of its column, so
               a wide picture can never cross the dashed rules */
            <div key={loadKey} style={{ ...px(x + w2 / 2 - 67, BOX.y + 2, 134, BOX.h - 4), overflow: "hidden" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.prev} alt="" onClick={onPick} title={onPick ? t("Show this one big") : undefined}
                style={{ position: "absolute", left: 67 - w2 / 2, top: y - BOX.y - 2, width: w2, height: h2, objectFit: fit, animation: `nuiFadeIn ${FADE_MS}ms ${EASE}`, cursor: onPick ? "pointer" : undefined, transform: `scale(${zoom})`, transformOrigin: "center" }} />
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img key={loadKey} src={it.prev} alt="" onClick={onPick}
              title={onPick ? t("Show this one big") : undefined}
              style={{ ...px(x, y, w2, h2), objectFit: fit, animation: `nuiFadeIn ${FADE_MS}ms ${EASE}`, cursor: onPick ? "pointer" : undefined }} />
          )) : (
            /* round 86 #4 (owner): in the SMALL thumbs the dots sat on the
               box's bottom edge — there the group rides higher, the dots
               closer under the glass */
            <div key={loadKey} style={{ ...px(x, y, w2, h2), background: assetsStage ? "transparent" : "#ECECEA", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingBottom: h2 < 80 ? 10 : 0, boxSizing: "border-box" }}>
              {assetsStage ? (<>
                {miniGlass(loadKey, assetFill(loadKey))}
                <span style={{ marginTop: h2 < 80 ? 2 : 8, font: `14px ${HNW}`, color: "#111", letterSpacing: 2, lineHeight: "10px" }}>
                  {[0, 1, 2].map((dd) => <span key={dd} style={{ animation: `nuiDot 1.2s ${dd * 0.2}s infinite` }}>.</span>)}
                </span>
              </>) : quiet ? null : custom ? (
                <span style={{ font: `12px ${HNW}`, color: "#8a887e" }}>{t("Not yet created")}</span>
              ) : (
                <button onClick={() => go("vision", -1)} style={{ ...ghost, position: "relative", width: "100%", height: "100%", font: `12px ${HNW}`, color: "#8a887e", textTransform: "none", cursor: "pointer" }}>{t("Create front label")}</button>
              )}
            </div>
          );
        /* round 93 #16: any picture opens the gallery of every asset; the
           thumb-for-hero swap is retired */
        const assetItems = [assets.front?.prev, custom ? "" : assets.back?.prev, ...lifeOrder.map((i2) => assets.life[i2]?.prev)].filter(Boolean) as string[];
        const openAssetGallery = (lifeSlot: number) => {
          const src = assets.life[lifeOrder[lifeSlot]]?.prev;
          setGallery({ items: assetItems, index: Math.max(0, assetItems.indexOf(src || "")) });
        };
        /* the four thumbs, in whichever shape this layout calls for */
        const thumbs = landingCol
          ? Array.from({ length: 4 }, (_, k) => ({ x: 757.5, y: Y0 + k * 70.83, s: 62 }))
          : Array.from({ length: 4 }, (_, k) => ({ x: 754 + (k % 2) * 152, y: Y0 + Math.floor(k / 2) * 152, s: 122 }));
        return (<>
          {patch(0, 160, W, 500, "aswipe")}
          {custom
            /* 2026-09-25 (owner): the REAL sizes the files come in — the
               promised 700x2500 / 2500x2500 were never delivered */
            ? head(137.14, "Product Shot", "Face", "Transparent PNG / 1024x1536px / 72dpi")
            : head(137.14, "Two Product Shots", "Face & Back", "Transparent PNG / 1024x1536px / 72dpi")}
          {head(R2 + 0.3, "Five Marketing Images", "Product placed in contextual environments", "PNG / 1024x1024px / 72dpi")}
          {landingCol && head(R3 + 0.3, "Product Landing Page", "You will be provided with the link\nto your product page.", "")}
          {/* status line above the progress bar (round 47) */}
          {assetsStage && (
            /* round 108 #11 (owner): midway between the dashed box's foot
               (617.4) and the progress line (753.96) */
            <span style={{ ...px(0, 678.2, W, 16), font: `italic 12px ${HNW}`, color: "#BA141A", lineHeight: "15px", textAlign: "center", display: "block" }}>
              {t("Creating your marketing assets")} — {tStage(assetsStage)}…</span>
          )}
          {dashGrid(BOX.x, BOX.y, BOX.w, BOX.h, [...(custom ? [] : [R1]), R2, ...(landingCol ? [R3] : [])], "asgrid", true)}
          {/* product shots — split col 1, centred in each half */}
          {custom
            ? slot((BOX.x + R2) / 2 - 60, Y0, 120, CH, assets.front, "front shot", "contain", false, assets.front ? () => setGallery({ items: assetItems, index: 0 }) : undefined, SHOT_ZOOM)
            : (<>
              {slot((BOX.x + R1) / 2 - 60, Y0, 120, CH, assets.front, "front shot", "contain", false, assets.front ? () => setGallery({ items: assetItems, index: 0 }) : undefined, SHOT_ZOOM)}
              {slot((R1 + R2) / 2 - 60, Y0, 120, CH, assets.back, "back shot", "contain", false, assets.back ? () => setGallery({ items: assetItems, index: 1 }) : undefined, SHOT_ZOOM)}
            </>)}
          {/* ROUND 88 #10 (owner): SAVE under the dashed area's left corner,
              outside it, on its left edge — every image flies into the
              folder in sequence */}
          {!assetsStage && assets.front && (
            <button data-assets-save onClick={() => {
              const unsave = assetsSaved;
              setAssetsSaved(!unsave);
              const items: { src: string; x: number; y: number; w: number; h: number }[] = [];
              /* the shots fly from their zoomed box */
              const zw = 120 * SHOT_ZOOM, zh = CH * SHOT_ZOOM, zdx = (zw - 120) / 2, zdy = (zh - CH) / 2;
              if (assets.front) items.push({ src: assets.front.prev, x: (custom ? (BOX.x + R2) / 2 : (BOX.x + R1) / 2) - 60 - zdx, y: Y0 - zdy, w: zw, h: zh });
              if (!custom && assets.back) items.push({ src: assets.back.prev, x: (R1 + R2) / 2 - 60 - zdx, y: Y0 - zdy, w: zw, h: zh });
              const hero = assets.life[lifeOrder[0]];
              if (hero) items.push({ src: hero.prev, x: HERO.x, y: Y0, w: HERO.w, h: CH });
              thumbs.forEach((th, k) => { const it = assets.life[lifeOrder[k + 1]]; if (it) items.push({ src: it.prev, x: th.x, y: th.y, w: th.s, h: th.s }); });
              flyToFolder(unsave ? [...items].reverse() : items, unsave);
            }}
              /* round 108 #14 (owner): on the page's centre line */
              style={{ ...px(W / 2 - 137, 657.6, 274, 34.3), cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: assetsSaved ? "#fff" : "#111", color: assetsSaved ? "#111" : "#fff", border: "1px solid #111", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4, transition: `background 240ms ${EASE}, color 240ms ${EASE}` }}>
              {assetsSaved ? t("Saved") : t("Save")}</button>
          )}
          {/* the hero, then its four thumbs */}
          {slot(HERO.x, Y0, HERO.w, CH, assets.life[lifeOrder[0]], `lifestyle ${lifeOrder[0] + 1}/5`, "cover", false, assets.life[lifeOrder[0]] ? () => openAssetGallery(0) : undefined)}
          {thumbs.map((th, k) => {
            const idx = lifeOrder[k + 1];
            return (
              <span key={"mi" + k}>
                {slot(th.x, th.y, th.s, th.s, assets.life[idx], `lifestyle ${(idx % N) + 1}/5`, "cover", true,
                  assets.life[idx] ? () => openAssetGallery(k + 1) : undefined)}
              </span>
            );
          })}
          {/* landing column: browser + QR and its caption underneath */}
          {landingCol && (() => {
            /* round 60 #2 (owner: "two loaders"): ONE box, ONE glass —
               the same loader carries from generation into the iframe
               load; only then the page appears */
            const ready = !!productUrl && selected >= 0;
            const BW = 350.8, BH = BW / W * 823 + 13;
            /* round 71 #4: the walkthrough has no published page to frame —
               it shows the sample one, and its QR, as a picture */
            if (tut >= 0 && !tutLanding) return (
              <div style={{ ...px(921.5, 310.5, BW, BH), background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {miniGlass("landing", Math.min(0.92, 0.2 + assets.life.filter(Boolean).length * 0.16))}
              </div>
            );
            if (tut >= 0) return (<>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${TUT_D}ts-landing.jpg`} alt="product page"
                style={{ ...px(921.5, 310.5, BW, BH), objectFit: "cover", borderRadius: 5, boxShadow: "0 8px 22px rgba(0,0,0,0.2)", animation: `nuiFadeIn ${FADE_MS}ms ${EASE}` }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/qr?u=${encodeURIComponent("https://8klabels.com/p/wqo2bp5f")}`} alt="QR" style={{ ...px(925.5, 548.5, 34.3, 34.3) }} />
              <span style={{ ...px(975, baseTop(582.5, 12), 300, 16), font: `italic 12px ${HNW}`, color: "#111", lineHeight: "12px", whiteSpace: "nowrap" }}>{t("Product landing page")}</span>
            </>);
            return (<>
              <div style={{ ...px(921.5, 310.5, BW, BH), background: "#fff", borderRadius: ready ? 5 : 0, boxShadow: ready ? "0 8px 22px rgba(0,0,0,0.2)" : "none", overflow: "hidden" }}>
                {ready && (<>
                  <div style={{ height: 13, background: "#E8E8E6", display: "flex", alignItems: "center", gap: 3, padding: "0 6px" }}>
                    {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <span key={c} style={{ width: 4.5, height: 4.5, borderRadius: 3, background: c }} />)}
                    <span style={{ flex: 1, margin: "0 8px", height: 7, background: "#fff", borderRadius: 3, font: `5px ${HNW}`, color: "#999", paddingLeft: 4, lineHeight: "7px" }}>8klabels.com{productUrl}</span>
                  </div>
                  <iframe src={productUrl} title="product page" onLoad={() => setPpLoaded(true)} style={{ width: W, height: 823, transform: `scale(${BW / W})`, transformOrigin: "0 0", border: 0, pointerEvents: "none" }} />
                </>)}
                {(!ready || !ppLoaded) && (
                  <div style={{ position: "absolute", inset: 0, background: assetsStage || ready ? "transparent" : "#ECECEA", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {assetsStage || ready
                      ? miniGlass("landing", ready ? Math.max(ppFill, 0.55) : Math.min(0.9, assetFill("lifestyle 5/5")))
                      : <button onClick={() => go("vision", -1)} style={{ ...ghost, position: "relative", width: "100%", height: "100%", font: `12px ${HNW}`, color: "#8a887e", textTransform: "none", cursor: "pointer" }}>{t("Create front label")}</button>}
                  </div>
                )}
              </div>
              {ready && ppLoaded && (<>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/qr?u=${encodeURIComponent("https://8klabels.com" + productUrl)}`} alt="QR"
                  style={{ ...px(925.5, 548.5, 34.3, 34.3) }} />
                <span style={{ ...px(975, baseTop(582.5, 12), 300, 16), font: `italic 12px ${HNW}`, color: "#111", lineHeight: "12px", whiteSpace: "nowrap" }}>{t("Product landing page")}</span>
              </>)}
            </>);
          })()}
        </>);
      }

      case "checkout": {
        /* ROUND 75 (owner's new Final Pack artboard, rebuilt 1:1): the page
           turned around. LEFT is the order — carousel, T&C, the four priced
           rows and "Proceed to payment". RIGHT is what you are buying — the
           folder tree hanging off the header's own folder mark, the
           explanation, and a "Download" that stays grey until the payment
           goes through. A dashed rule at x720 separates them.
           The BOARD carries the layout; the mock label raster and the five
           prices were stripped at build time. Geometry read straight out of
           the artboard (its viewBox IS our 1440x822.86):
           rows on baselines 468.28 / 502.2 / 536.49 / 570.64 / 605.06 and
           Total 639.48; rings cx 171.15, centre = baseline − 6.13; prices
           right-aligned to 617.14; buttons y651.43 h34.29, 480 wide at
           137.14 and 822.86; carousel arrows centred on y308.57. */
        const COL_L = 137.14, COL_R = 822.86, COL_W = 480;
        /* 2026-09-23 (owner): the carousel's centre on the centre of the
           dashed rule at x720 (171.43 → 685.71); "I agree" on its foot; the
           right-hand tree and its paragraph brought down so the paragraph's
           last line sits on that foot too */
        const RULE_TOP = 171.43, RULE_FOOT = 685.71, RULE_MID = (RULE_TOP + RULE_FOOT) / 2;
        /* 2026-09-25 (owner): the carousel back UP to its artboard place
           (centre y308.57) — the price list is back beneath it */
        void RULE_MID;
        const CAR = { x: 160, y: 205.71, w: 434.28, h: 205.71 };   /* the slide's own space */
        const CAR_MID = 308.57;
        const ARR_L = 137.14, ARR_R = 700;     /* the chevrons' outer edges */
        const DY = RULE_FOOT - (559.8 + 3 * 18);
        const TC_B = 468.28;
        const ROWB = [502.2, 536.49, 570.64, 605.06];
        const TOT_B = 639.48, TOT_FOOT = 685.71;   /* the dashed rule's own foot */
        const RING_X = 171.15, RING_DY = 6.13, LBL_X = 205.71;
        const PRICE_R = 617.14;
        const BTN = { y: 651.43, h: 34.29 };
        type Slide = { name: string; img?: string; landing?: boolean; kind?: "front" | "back" };
        /* ROUND 47: own-label orders deliver ONLY the marketing assets */
        const slides: Slide[] = customLabel ? [
          { name: "Product_Shot_Front.png", img: assets.front?.prev, kind: "front" },
          ...Array.from({ length: Math.max(5, assets.life.length) }, (_, i) => ({ name: `Marketing_Image_${i + 1}.jpg`, img: assets.life[i]?.prev, kind: "front" as const })),
        ] : [
          { name: "Front_Label.svg", img: viewedDream(selected)?.preview || viewedDream(selected)?.dream || undefined, kind: "front" },
          { name: "Back_Label.svg", img: backPng || undefined, kind: "back" },
          { name: "Product_Shot_Front.png", img: assets.front?.prev, kind: "front" },
          { name: "Product_Shot_Back.png", img: assets.back?.prev, kind: "front" },
          ...Array.from({ length: Math.max(5, assets.life.length) }, (_, i) => ({ name: `Marketing_Image_${i + 1}.jpg`, img: assets.life[i]?.prev, kind: "front" as const })),
          /* round 53 #7: no requested QR/page → no landing slide */
          ...(qrMode === "create" ? [{ name: "Product_Page", landing: true, kind: "front" as const }] : []),
        ];
        const sl = slides[carIdx % slides.length];
        const ringY = (baseline: number) => baseline - RING_DY;
        /* a price, right-aligned on the column's own edge */
        const priceAt = (baseline: number, v: string, bold = false, right = PRICE_R) => (
          <span key={"pr" + baseline + right} style={{ ...px(right - 160, baseTop(baseline, 15), 160, 18), font: `${bold ? 700 : 400} 15px/15px ${HNW}`, textAlign: "right", display: "block" }}>{v}</span>
        );
        /* ROUND 93 #6 (owner): the total reads at twice the size — word and
           amount 30 px bold on the same left/right edges, and twice the air
           between the last dashed rule and the total */
        const bigTotal = (v: string) => (
          <span key="bigtotal">
            {patch(LBL_X - 2, TOT_B - 20, PRICE_R - LBL_X + 4, 28, "totwipe")}
            {/* round 108 #15 (owner): the total's baseline lands on the foot
                of the page's dashed rule (685.71) */}
            <span style={{ ...px(LBL_X, baseTop(TOT_FOOT, 30), 240, 34), font: `700 30px ${HNW}`, lineHeight: "30px" }}>{t("Total:")}</span>
            <span style={{ ...px(PRICE_R - 240, baseTop(TOT_FOOT, 30), 240, 34), font: `700 30px ${HNW}`, lineHeight: "30px", textAlign: "right", display: "block" }}>{v}</span>
          </span>
        );
        const madeRow = [selected >= 0 && !!backPng, qrMode === "create", !!assets.front, true];
        const rowLabel = (baseline: number, text: string, click: () => void, key: string) => (
          <button key={key} onClick={click}
            style={{ ...px(LBL_X, baseline - 17, 360, 24), ...ghost, textAlign: "left", textTransform: "none", font: `15px ${HNW}`, color: "#111", display: "flex", alignItems: "center" }}>{text}</button>
        );
        return (<>
          {/* ── the right-hand column: what the pack contains ───────────── */}
          {/* ROUND 88 #1 (owner): the baked tree is wiped and REDRAWN LIVE —
              it reveals from the folder mark downward (trunk, bar, branches,
              icons, names, arrows, then the files line by line) and lists
              the REAL files of the ZIP under the wine's name (Wine_Name
              until one is typed). Unselected rows drop their branch; an
              own-label order has no tree (round 50). */}
          {patch(COL_R - 6, 542, COL_W + 6, 82, "parawipe")}
          {patch(760, 92, 600, 450, "notree")}
          {!customLabel && (() => {
            const base = (f.wine || "").trim().replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "") || "Wine_Name";
            const slug = (f.wine || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "wine-name";
            type Branch = { x: number; kind: "doc" | "folder"; name: string[]; files: string[] };
            const branches: Branch[] = [
              /* 2026-09-23 (owner: "the product page link shows even when no
                 page was chosen"): it rode the old price row, which no longer
                 exists to switch off — the link is there only when a QR code
                 and its page were asked for */
              { x: 856, kind: "doc", name: ["READ ME"], files: ["Instructions.pdf", "Terms&Conditions.pdf", ...(qrMode === "create" ? [`www.8klabels.com/${slug}`] : [])] },
              ...(packSel[2] ? [{ x: 1055, kind: "folder" as const, name: ["MARKETING", "ASSETS"], files: [`${base}_Bottle_Front.png`, `${base}_Bottle_Back.png`, ...[1, 2, 3, 4, 5].map((n) => `${base}_Image0${n}.png`)] }] : []),
              ...(packSel[0] ? [{ x: 1275, kind: "folder" as const, name: ["LABELS"], files: [`${base}_Front_Label.pdf`, `${base}_Front_Label.svg`, `Links/${base}_Front_Artwork.png`, `Fonts/`, `${base}_Back_Label.svg`] }] : []),
            ];
            /* 2026-09-23 (owner): the bar sits HALFWAY between the folder
               mark above and the icons below, the branches dropping the rest */
            const TRUNK_TOP = 152, ICON_TOP = 255 + DY + (70 - ICON_H) / 2;
            const TX = 1275, BAR_Y = (TRUNK_TOP + ICON_TOP) / 2, DROP = ICON_TOP - 14 - BAR_Y;
            const leftX = Math.min(...branches.map((b2) => b2.x));
            /* 2026-09-25 (owner): a folder with nothing SAVED in it is grey,
               with no arrow and no file list — and with nothing saved at all
               the READ ME is grey too */
            const savedLabels = selected >= 0 || backSaved, savedAssets = assetsSaved;
            const isSaved = (b2: Branch) => (b2.name[0] === "LABELS" ? savedLabels : b2.name[0] === "MARKETING" ? savedAssets : savedLabels || savedAssets);
            const A = (delay: number, name: string, ms = 320): React.CSSProperties =>
              treeReveal.current ? { animation: `${name} ${ms}ms ${EASE} ${delay}ms both` } : { animation: `nuiFadeIn 260ms ${EASE} both` };
            return (
              <div key={"tree" + treeN}>
                {/* the caption under the folder mark */}
                <span style={{ ...px(TX - 80, baseTop(137.14, 15), 160, 18), font: `15px ${HNW}`, lineHeight: "15px", textAlign: "center", whiteSpace: "nowrap", ...A(0, "nuiFadeUp", 300) }}>{t("FINAL PACK")}</span>
                {/* the trunk grows down from the folder mark */}
                <div style={{ ...px(TX - 0.5, TRUNK_TOP, 1, BAR_Y - TRUNK_TOP), transformOrigin: "top", ...A(0, "nuiGrowY", 260) }}>{dashRule(0, 0, BAR_Y - TRUNK_TOP, true)}</div>
                {/* the bar runs from the trunk to the left-most branch */}
                {leftX < TX && (
                  <div style={{ ...px(leftX, BAR_Y - 0.5, TX - leftX, 1), transformOrigin: "right", ...A(260, "nuiGrowXR", 340) }}>{dashRule(0, 0, TX - leftX, false)}</div>
                )}
                {branches.map((b2, i) => (
                  <span key={b2.name[0]} style={{ opacity: isSaved(b2) ? 1 : 0.32 }}>
                    <div style={{ ...px(b2.x - 0.5, BAR_Y, 1, DROP + 1), transformOrigin: "top", ...A(600 + i * 90, "nuiGrowY", 220) }}>{dashRule(0, 0, DROP + 1, true)}</div>
                    <div style={{ ...px(b2.x - 4, BAR_Y + DROP, 8, 1), background: "#000", ...A(780 + i * 90, "nuiFadeIn", 160) }} />
                    {/* the icon — ROUND 106: the owner's own ReadMe.svg beside
                        the folder mark; ROUND 107 #5: both a fifth smaller,
                        like the mark in the header, on the same centre */}
                    <div style={{ ...px(b2.x - ICON_W / 2, 255 + DY + (70 - ICON_H) / 2, ICON_W, ICON_H), ...A(880 + i * 120, "nuiPop", 360) }}>
                      <svg viewBox={b2.kind === "folder" ? "1232.5 33.9 85.1 70" : "0 0 85 70"} width={ICON_W} height={ICON_H} style={{ display: "block" }}>
                        {b2.kind === "folder" ? FOLDER_MARK : README_MARK}
                      </svg>
                    </div>
                    {/* the name */}
                    {b2.name.map((ln, j) => (
                      <span key={ln} style={{ ...px(b2.x - 80, baseTop(345 + DY + j * 18, 15), 160, 18), font: `15px ${HNW}`, lineHeight: "15px", textAlign: "center", whiteSpace: "nowrap", ...A(1080 + i * 120, "nuiFadeUp", 300) }}>{t(ln)}</span>
                    ))}
                    {/* the arrow down to the files — only when something is saved */}
                    {isSaved(b2) && (<>
                    <div style={{ ...px(b2.x - 4, 372 + DY, 8, 1), background: "#000", ...A(1300 + i * 120, "nuiFadeIn", 160) }} />
                    <div style={{ ...px(b2.x - 0.5, 372 + DY, 1, 32), transformOrigin: "top", ...A(1300 + i * 120, "nuiGrowY", 240) }}>{dashRule(0, 0, 32, true)}</div>
                    <svg viewBox="0 0 10 6" style={{ ...px(b2.x - 5, 402 + DY, 10, 6), ...A(1500 + i * 120, "nuiFadeIn", 160) }}><polyline points="0.5,0.5 5,5.5 9.5,0.5" fill="none" stroke="#000" strokeWidth="1" /></svg>
                    </>)}
                    {/* the files, one line after another */}
                    {isSaved(b2) && b2.files.map((fn, j) => (
                      <span key={fn} style={{ ...px(b2.x - 110, baseTop(434.45 + DY + j * 10, 9.5), 220, 12), font: `9.5px ${HNW}`, lineHeight: "9.5px", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...A(1620 + i * 120 + j * 70, "nuiFadeUp", 260) }}>{fn}</span>
                    ))}
                  </span>
                ))}
              </div>
            );
          })()}
          {/* an own-label (assets-only) order buys no labels: no tree, no caption (round 50) */}
          {customLabel && patch(1225, 108, 120, 40, "nofpcap")}
          {/* ROUND 85 #3 (owner): no "Proceed to payment" bar, no "Download"
              bar — the red round button does both: a card until the payment
              lands, a download tray after. Both baked bars are wiped. */}
          {patch(COL_R - 2, BTN.y - 2, COL_W + 4, BTN.h + 4, "dlwipe")}
          {patch(COL_L - 2, BTN.y - 2, COL_W + 4, BTN.h + 4, "paywipe")}
          {/* 2026-09-23 (owner): no "After payment…" paragraph any more (the
              baked one stays wiped) */}
          {/* ROUND 93 #11 (owner): what is already made reads crisp, what is
              not yet made reads pale — the rows here and the tree's branches */}
          {/* 2026-09-25 (owner): the PRICE LIST is back, as it was — only the
              baked slide, chevrons and T&C row above it are wiped (the
              "I agree" glass stays on the right) */}
          {patch(COL_L - 14, RULE_TOP + 8, PRICE_R - COL_L + 28, 480 - RULE_TOP, "leftwipe")}
          {!customLabel && PACK.map((it, i) => (!madeRow[i] && (
            <div key={"pale" + i} style={{ ...px(COL_L, ROWB[i] - 20, COL_W, 30), background: "rgba(255,255,255,0.62)", pointerEvents: "none", zIndex: 2 }} />
          )))}
          {customLabel ? (<>
            {/* own-label order: only Marketing Assets and its price */}
            {patch(LBL_X - 2, 486, 380, 134, "custrows")}
            {patch(PRICE_R - 160, 486, 160, 134, "custprices")}
            {dotBtn(RING_X, ringY(ROWB[0]), !!packSel[2], () => setPackSel((ps) => ps.map((v, k) => (k === 2 ? !v : v))), "pkc", { ring: true, r: 9, cover: 24 })}
            {[1, 2, 3].map((i) => <span key={"nr" + i} style={{ ...px(RING_X - 13, ringY(ROWB[i]) - 13, 26, 26), background: "#fff" }} />)}
            {rowLabel(ROWB[0], t("Marketing Assets"), () => setPackSel((ps) => ps.map((v, k) => (k === 2 ? !v : v))), "clm")}
            {priceAt(ROWB[0], "$" + PACK[2].price)}
            {bigTotal("$" + total)}
          </>) : (<>
            {/* live dots on the baked rings + the row click zones */}
            {PACK.map((it, i) => (
              <span key={it.name}>
                {dotBtn(RING_X, ringY(ROWB[i]), !!packSel[i], () => setPackSel((ps) => ps.map((v, k) => (k === i ? !v : v))), "pk" + i, { ring: true, r: 9, cover: 24 })}
                <button onClick={() => setPackSel((ps) => ps.map((v, k) => (k === i ? !v : v)))}
                  style={{ ...px(LBL_X, ROWB[i] - 17, 360, 24), ...ghost }} />
                {priceAt(ROWB[i], "$" + it.price)}
              </span>
            ))}
            {bigTotal("$" + total)}
          </>)}
          {/* ── the left-hand column: the order ─────────────────────────── */}
          {/* 2026-09-23 (owner): A CAROUSEL — the current item big, sharp and
              in the middle; its neighbours smaller, blurred and pale to each
              side, as if the items stood on a ring turning past the eye.
              Each item keeps its own element, so a turn SLIDES: the next
              one grows into the middle and sharpens, the last one shrinks
              aside and blurs. */}
          {/* 2026-09-23 (owner): the left chevron on the page margin, the right
              one out toward the rule, the carousel centred between them and
              its side items drawn in closer */}
          <div style={{ ...px(ARR_L, CAR.y - 30, ARR_R - ARR_L, CAR.h + 60), overflow: "hidden" }}>
            {slides.map((sd, i) => {
              const n = slides.length;
              let rel = ((i - carIdx) % n + n) % n;
              if (rel > n / 2) rel -= n;
              if (Math.abs(rel) > 2) return null;
              const ar = Math.abs(rel);
              const scale = ar === 0 ? 1 : ar === 1 ? 0.52 : 0.32;
              const dx = rel === 0 ? 0 : Math.sign(rel) * (ar === 1 ? 150 : 200);
              const dy = ar === 0 ? 0 : ar === 1 ? -6 : -10;
              const cx0 = (ARR_R - ARR_L) / 2, cy0 = 30;
              const inner = sd.landing
                ? (ar === 0 && productUrl && selected >= 0 ? (
                  <div style={{ position: "absolute", left: (CAR.w - 320) / 2, top: 0, width: 320, height: 320 / W * 823 + 13, background: "#fff", borderRadius: 5, boxShadow: "0 8px 22px rgba(0,0,0,0.2)", overflow: "hidden" }}>
                    <div style={{ height: 13, background: "#E8E8E6", display: "flex", alignItems: "center", gap: 3, padding: "0 6px" }}>
                      {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <span key={c} style={{ width: 4.5, height: 4.5, borderRadius: 3, background: c }} />)}
                      <span style={{ flex: 1, margin: "0 8px", height: 7, background: "#fff", borderRadius: 3, font: `5px ${HNW}`, color: "#999", paddingLeft: 4, lineHeight: "7px" }}>8klabels.com{productUrl}</span>
                    </div>
                    <iframe src={productUrl} title="product page" style={{ width: W, height: 823, transform: `scale(${320 / W})`, transformOrigin: "0 0", border: 0, pointerEvents: "none" }} />
                  </div>
                ) : <div style={{ position: "absolute", left: 40, top: 0, width: CAR.w - 80, height: CAR.h, background: "#ECECEA" }} />)
                : sd.img
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={sd.img} alt={sd.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
                  : ar === 0 ? <div style={{ position: "absolute", inset: 0 }}>{notMade(40, 0, CAR.w - 80, CAR.h, sd.kind || "front", "nmCar" + i)}</div>
                    : <div style={{ position: "absolute", left: 40, top: 0, width: CAR.w - 80, height: CAR.h, background: "#ECECEA" }} />;
              return (
                <div key={"car" + i} onClick={ar ? () => setCarIdx(i) : undefined}
                  style={{ position: "absolute", left: cx0 - CAR.w / 2, top: cy0, width: CAR.w, height: CAR.h, zIndex: 10 - ar,
                    transform: `translate(${dx}px, ${dy}px) scale(${scale})`, filter: ar ? `blur(${ar === 1 ? 2.5 : 4}px)` : "none", opacity: ar === 0 ? 1 : ar === 1 ? 0.55 : 0.28,
                    transition: `transform 520ms ${EASE}, filter 520ms ${EASE}, opacity 520ms ${EASE}`, cursor: ar ? "pointer" : undefined }}>
                  {inner}
                </div>
              );
            })}
          </div>
          {/* the chevrons, live now (the baked ones went with the left column) */}
          {([["prev slide", ARR_L, "13,3 5,11 13,19"], ["next slide", ARR_R - 12, "5,3 13,11 5,19"]] as const).map(([lab, x, pts]) => (
            <button key={lab} aria-label={lab} onClick={() => setCarIdx((c) => (c + (lab === "next slide" ? 1 : slides.length - 1)) % slides.length)}
              style={{ ...px(x - 16, CAR_MID - 22, 44, 44), ...ghost, zIndex: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg viewBox="0 0 18 22" width="12" height="16"><polyline points={pts} fill="none" stroke="#111" strokeWidth="1.6" /></svg>
            </button>
          ))}
          {/* 2026-09-23 (owner): "I agree to the Terms & Conditions" at the
              bottom right of the folders' side, its right edge on the page
              margin, on the rule's foot. Its ring is our loader's wine glass
              (no dots), twice the text's height, standing on the text's
              baseline, half full. Agreeing brings a second glass in from the
              left, tilted and a little raised; it clinks this one and fades.
              The whole row — and a margin round it — takes the click. */}
          {(() => {
            const GH = 30, GW = GH * 150 / 305;
            const UL_LIFT = -1.9;         /* measured: puts the glass's foot on the underline */
            const glass = (fill: number, key: string) => (
              <svg viewBox="225 100 150 305" width={GW} height={GH} style={{ display: "block", overflow: "visible" }}>
                <defs>
                  <clipPath id={"agr-" + key}>
                    <rect x="230" y={266.6 - fill * 95} width="140" height={fill * 95 + 4} style={{ transition: "y 600ms ease, height 600ms ease" }} />
                  </clipPath>
                </defs>
                <path fill="#BA141A" clipPath={`url(#agr-${key})`} d="M352.397 185.696 C353.872 199.478 353.325 211.872 350.76 222.63 C346.838 239.075 336.88 251.431 321.163 259.355 C311.285 264.336 301.979 266.038 298.571 266.527 C296.674 266.308 286.165 264.888 274.916 259.216 C259.199 251.292 249.241 238.936 245.319 222.491 C242.762 211.769 242.21 199.422 243.667 185.696 Z" />
                <g fill="none" stroke="#231F20" strokeWidth="9">
                  <path d="M254.813 401.491 L297.631 401.491 L297.631 276.2 C297.631 276.2 246.711 271.948 235.438 224.682 C222.211 169.219 254.078 108.466 254.078 108.466 L341.155 108.635 C341.155 108.635 373.068 169.358 359.84 224.821 C348.568 272.087 297.648 276.339 297.648 276.339" />
                  <path d="M297.8 276.2 L297.8 401.491 L340.618 401.491" />
                </g>
              </svg>
            );
            return (
              <div style={{ position: "absolute", right: W - 1302.86, top: baseTop(RULE_FOOT, 15) - (GH - 15) - 10, display: "flex", alignItems: "flex-end", columnGap: 9, padding: "10px 0 10px 16px", zIndex: 5 }}
                onClick={() => setAgree((a) => { const v = !a; if (v) setClinkN((n) => n + 1); return v; })}>
                {/* the glass, with the one that comes to clink it */}
                {/* its foot on the line that underlines "Terms & Conditions" */}
                <span style={{ position: "relative", width: GW, height: GH, flex: "0 0 auto", cursor: "pointer", marginBottom: UL_LIFT }}>
                  {clinkN > 0 && (
                    <span key={"clink" + clinkN} style={{ position: "absolute", left: 0, bottom: 0, transformOrigin: "50% 100%", animation: `nuiClinkIn 1150ms cubic-bezier(.3,.7,.3,1) both`, pointerEvents: "none" }}>
                      {glass(0.5, "b" + clinkN)}
                    </span>
                  )}
                  {/* 2026-09-23 (owner): empty until agreed — it fills as the
                      other glass comes to clink it */}
                  <span key={"g" + clinkN} style={{ position: "absolute", left: 0, bottom: 0, transformOrigin: "50% 100%", animation: clinkN > 0 ? `nuiClinkHit 1150ms ease both` : "none" }}>
                    {glass(agree ? 0.55 : 0, "a")}
                  </span>
                </span>
                <span style={{ font: `italic 15px ${HNW}`, lineHeight: "15px", color: "#111", whiteSpace: "nowrap", cursor: "pointer" }}>
                  {t("By clinking this glass, I agree to the")}{" "}
                  <span onClick={(e) => { e.stopPropagation(); setTermsOpen(true); setTermsPos(0); }} style={{ textDecoration: "underline", cursor: "pointer" }}>{t("Terms & Conditions")}</span>
                </span>
              </div>
            );
          })()}
          {/* round 52 #1: the agree gate message under the Pay bar */}
          {warn && (
            <span style={{ ...px(822.86, 700, 480, 16), font: `13px ${HNW}`, color: "#BA141A", textAlign: "right", display: "block" }}>{warn}</span>
          )}
          {/* ROUND 52 #3: Terms & Conditions modal — lorem body behind the
              house-style scroll (1px track + black dot, draggable), black
              Agree / Disagree bar and a ✕ */}
          {termsOpen && (() => {
            const TRACK = { x: 628, y: 104, h: 240 };
            const syncFromClientY = (clientY: number, el: HTMLElement) => {
              const r = el.getBoundingClientRect();
              const ratio = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
              const sc = termsRef.current;
              if (sc) sc.scrollTop = ratio * (sc.scrollHeight - sc.clientHeight);
            };
            return (<>
              <div style={{ ...px(0, 0, W, H), zIndex: 30 }} onClick={() => setTermsOpen(false)} />
              <div style={{ ...px(0, VEIL_TOP, W, VEIL_BOT - VEIL_TOP), background: "rgba(255,255,255,0.88)", zIndex: 30, pointerEvents: "none" }} />
              <div style={{ ...px(W / 2 - 340, 144, 680, 440), background: "#fff", border: "1px solid #111", zIndex: 31, boxSizing: "border-box" }}>
                <button aria-label="close terms" onClick={() => setTermsOpen(false)}
                  style={{ position: "absolute", right: 6, top: 4, ...ghost, font: `15px ${HNW}`, color: "#111", width: 24, height: 24 }}>✕</button>
                <span style={{ position: "absolute", left: 32, top: 20, font: `700 60px ${HNW}`, lineHeight: "64px", whiteSpace: "nowrap" }}>{t("Terms & Conditions")}</span>
                <div ref={termsRef} className="nui-noscroll"
                  onScroll={(e) => { const el = e.currentTarget; setTermsPos(el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)); }}
                  style={{ position: "absolute", left: 32, top: TRACK.y, width: 576, height: TRACK.h, overflowY: "scroll" }}>
                  {TERMS_TEXT.map((par, i) => (
                    <p key={i} style={{ font: `13px ${HNW}`, lineHeight: "19px", color: "#111", margin: "0 0 14px" }}>{par}</p>
                  ))}
                </div>
                {/* the scroll: a hairline with a black dot riding it */}
                <div style={{ position: "absolute", left: TRACK.x + 11.5, top: TRACK.y, width: 1, height: TRACK.h, background: "#111" }} />
                <div style={{ position: "absolute", left: TRACK.x, top: TRACK.y, width: 24, height: TRACK.h, cursor: "grab" }}
                  onPointerDown={(e) => { dragRef.current = "terms"; e.currentTarget.setPointerCapture(e.pointerId); syncFromClientY(e.clientY, e.currentTarget); }}
                  onPointerMove={(e) => { if (dragRef.current === "terms") syncFromClientY(e.clientY, e.currentTarget); }}
                  onPointerUp={() => { dragRef.current = ""; }}>
                  <span style={{ position: "absolute", left: 6.5, top: termsPos * (TRACK.h - 11), width: 11, height: 11, borderRadius: 6, background: "#111" }} />
                </div>
                <button onClick={() => { setAgree(true); setTermsOpen(false); }}
                  style={{ position: "absolute", left: 32, top: 372, width: 292, height: 34.3, cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: "#111", color: "#fff", border: "none", paddingBottom: 4 }}>
                  {t("Agree")}</button>
                <button onClick={() => { setAgree(false); setTermsOpen(false); }}
                  style={{ position: "absolute", left: 356, top: 372, width: 292, height: 34.3, cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: "#fff", color: "#111", border: "1px solid #111", boxSizing: "border-box", paddingBottom: 4 }}>
                  {t("Disagree")}</button>
              </div>
            </>);
          })()}
        </>);
      }

      default:
        return null;
    }
  };

  /* round 68 #1: any open modal freezes the bar (it still paints on top) */
  const modalOpen = !!confirmModal || termsOpen || marketOpen;
  const barPage: PageKey = page === "blank" ? blankFrom.current : page;
  const step = tut >= 0 ? tut : STEP_OF[barPage];
  /* round 71 #4: while the walkthrough runs, the bar follows IT — the
     button rides the stop being explained and the line follows it home */
  const tutLast = TUT_CARDS.length - 1;
  const tutX = tut < 0 ? null : tut < STEPS.length ? STEPS[tut].x : NEXT_X;
  const thick = tut >= 0 ? (tut < STEPS.length ? STEPS[tut].x : CIRCLE_X[CIRCLE_X.length - 1]) : THICK[barPage];
  const onArtists = page === "artists" || page === "artist";
  const bandBottom = BAND_BOTTOM[page];
  /* ROUND 108 #20 (owner): NOTHING ever slides over the header, the rules
     or the bar — so every transition, the welcome page's included, moves
     inside the content band only (it used to slide the whole 1440x823,
     which dragged the boards' own baked chrome across ours). */
  const fullSlide = false;

  return (
    <main style={{ background: "#fff", minHeight: "100vh", margin: 0, padding: 0, maxWidth: "none", width: "100%" }}>
      <style>{`html, body { margin: 0; padding: 0; background: #000; font-synthesis: none; }
        @font-face { font-family: 'HNW'; src: url('/newui/fonts/HNW-55Roman.woff2') format('woff2'), url('/newui/fonts/HNW-55Roman.ttf'); font-weight: 400; font-style: normal; font-display: block; }
        @font-face { font-family: 'HNW'; src: url('/newui/fonts/HNW-56It.woff2') format('woff2'), url('/newui/fonts/HNW-56It.ttf'); font-weight: 400; font-style: italic; font-display: block; }
        @font-face { font-family: 'HNW'; src: url('/newui/fonts/HNW-75Bold.woff2') format('woff2'), url('/newui/fonts/HNW-75Bold.ttf'); font-weight: 700; font-style: normal; font-display: block; }
        @font-face { font-family: 'HNW'; src: url('/newui/fonts/HNW-45Lt.woff2') format('woff2'), url('/newui/fonts/HNW-45Lt.ttf'); font-weight: 300; font-style: normal; font-display: block; }
        @font-face { font-family: 'HelveticaNeueWorld-55Roman'; src: url('/newui/fonts/HNW-55Roman.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: block; }
        @font-face { font-family: 'HelveticaNeueWorld-56It'; src: url('/newui/fonts/HNW-56It.woff2') format('woff2'); font-weight: 400; font-style: italic; font-display: block; }
        @font-face { font-family: 'HelveticaNeueWorld-75Bold'; src: url('/newui/fonts/HNW-75Bold.woff2') format('woff2'); font-weight: 700; font-style: normal; font-display: block; }
        @font-face { font-family: 'HelveticaNeueWorld-45Light'; src: url('/newui/fonts/HNW-45Lt.woff2') format('woff2'); font-weight: 300; font-style: normal; font-display: block; }
        @font-face { font-family: 'Helvetica Neue World'; src: url('/newui/fonts/HNW-55Roman.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: block; }
        @font-face { font-family: 'Helvetica Neue World'; src: url('/newui/fonts/HNW-56It.woff2') format('woff2'); font-weight: 400; font-style: italic; font-display: block; }
        @font-face { font-family: 'Helvetica Neue World'; src: url('/newui/fonts/HNW-75Bold.woff2') format('woff2'); font-weight: 700; font-style: normal; font-display: block; }
        @font-face { font-family: 'Helvetica Neue World'; src: url('/newui/fonts/HNW-45Lt.woff2') format('woff2'); font-weight: 300; font-style: normal; font-display: block; }
        input::placeholder, textarea::placeholder { color: #B3B3B3; opacity: 1; font-style: italic; }
        .nui-next:hover { transform: scale(1.09); }
        .nui-next:active { transform: scale(1.03); }
        .nui-noscroll { scrollbar-width: none; -ms-overflow-style: none; }
        .nui-noscroll::-webkit-scrollbar { display: none; }
        @keyframes nuiDot { 0% { opacity: 0.15 } 30% { opacity: 1 } 60%, 100% { opacity: 0.15 } }
        @keyframes nuiWineRise { from { transform: translateY(92px) } to { transform: translateY(4px) } }
        @keyframes nuiIn { from { transform: translateX(${dir > 0 ? "100%" : "-100%"}) } to { transform: translateX(0) } }
        @keyframes nuiOut { from { transform: translateX(0) } to { transform: translateX(${dir > 0 ? "-100%" : "100%"}) } }
        @keyframes nuiInPx { from { transform: translateX(${dir > 0 ? 1440 : -1440}px) } to { transform: translateX(0) } }
        @keyframes nuiOutPx { from { transform: translateX(0) } to { transform: translateX(${dir > 0 ? -1440 : 1440}px) } }
        @keyframes nuiTap { 0% { transform: scale(0.3); opacity: 0 } 22% { opacity: 1 } 100% { transform: scale(1.3); opacity: 0 } }
        @keyframes nuiNudge { 0%, 100% { transform: scale(1) } 22% { transform: scale(1.14) } 44% { transform: scale(1) } 66% { transform: scale(1.14) } 88% { transform: scale(1) } }
        @keyframes nuiPress { 0%, 100% { transform: scale(1) } 45% { transform: scale(1.09) } }
        @keyframes nuiGrowY { from { transform: scaleY(0) } to { transform: scaleY(1) } }
        @keyframes nuiGrowXR { from { transform: scaleX(0) } to { transform: scaleX(1) } }
        @keyframes nuiPop { from { opacity: 0; transform: scale(0.82) } 70% { transform: scale(1.03) } to { opacity: 1; transform: scale(1) } }
        @keyframes nuiFadeUp { from { opacity: 0; transform: translateY(5px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes nuiFly { 0% { transform: translate(0,0) scale(1) rotate(0deg); opacity: 1 } 28% { transform: translate(calc(var(--dx) * 0.14), calc(var(--dy) * 0.3 - 26px)) scale(0.86) rotate(-3deg); opacity: 1 } 100% { transform: translate(var(--dx), var(--dy)) scale(var(--s)) rotate(5deg); opacity: 0.2 } }
        @keyframes nuiFlyBack { 0% { transform: translate(var(--dx), var(--dy)) scale(var(--s)) rotate(5deg); opacity: 0.2 } 72% { transform: translate(calc(var(--dx) * 0.14), calc(var(--dy) * 0.3 - 26px)) scale(0.86) rotate(-3deg); opacity: 1 } 100% { transform: translate(0,0) scale(1) rotate(0deg); opacity: 1 } }
        @keyframes nuiFolderBump { 0%, 100% { transform: scale(1) } 40% { transform: scale(1.14) } 72% { transform: scale(0.97) } }
        @keyframes btnFly { from { left: ${WELCOME_X - NEXT_R}px } to { left: ${NEXT_X - NEXT_R}px } }
        @keyframes nuiFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes nuiHomeIn { from { transform: translateX(1440px) } to { transform: translateX(0) } }
        @keyframes nuiClinkIn {
          0% { opacity: 0; transform: translate(-44px, -2px) rotate(8deg) }
          40% { opacity: 1; transform: translate(-23px, -5px) rotate(16deg) }
          52% { opacity: 1; transform: translate(-21px, -5px) rotate(19deg) }
          64% { opacity: 1; transform: translate(-24px, -5px) rotate(15deg) }
          100% { opacity: 0; transform: translate(-40px, -2px) rotate(9deg) }
        }
        @keyframes nuiClinkHit { 0%, 46% { transform: rotate(0) } 54% { transform: rotate(5deg) } 66% { transform: rotate(-2deg) } 78%, 100% { transform: rotate(0) } }
        @keyframes nuiRing { 0%, 100% { transform: scale(1); opacity: .95 } 50% { transform: scale(1.06); opacity: .35 } }
        @keyframes nuiBlink { 0%, 100% { opacity: .25 } 50% { opacity: 1 } }
        @keyframes nuiFadeOut { from { opacity: 1 } to { opacity: 0 } }
        @keyframes szGrow { from { transform: scale(0) } to { transform: scale(1) } }`}</style>
      {/* round 40: the page bands extend to the window edges so the 80%
          artboard doesn't float like a card. ROUND 106 (owner's new
          artboards): the bands are all WHITE now — the header and the
          footer are told apart by ONE 1px black rule each, drawn out here
          at window width so they stay exactly one device pixel at any
          page scale (the same weight as the folder mark's outline). */}
      <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: FOOT_RULE_Y * scale, background: "#fff" }} />
      {/* the two rules run the whole width of the window. They are drawn
          in a layer carrying the PAGE'S OWN transform, so the stretch in
          the margins rasterises exactly like the stretch across the page
          (the page redraws them over its boards, which cover this one) */}
      {(["left", "right"] as const).map((side) => (
        /* ROUND 113 #1 (owner): the gallery's veil goes over EVERYTHING,
           and these two rules run past the page into the window margins,
           where no veil inside the page box can reach them. They fade to
           the same 6 % the veil leaves of any black — so the rule reads
           identically inside the page and out in the margins. */
        <div key={side} style={{ position: "absolute", [side]: 0, top: 0, width: `calc(50% - ${(W * scale) / 2}px)`, height: FOOT_RULE_Y * scale + 2, overflow: "hidden", pointerEvents: "none", opacity: gallery ? 0.06 : 1 }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: 4000, height: PAGE_H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <div style={{ position: "absolute", left: 0, top: HEADER_H - 0.5, width: 4000, height: 1, background: HAIRLINE }} />
            <div style={{ position: "absolute", left: 0, top: FOOT_RULE_Y - 0.5, width: 4000, height: 1, background: HAIRLINE }} />
          </div>
        </div>
      ))}
      <div style={{ width: W * scale, height: PAGE_H * scale, position: "relative", margin: "0 auto" }}>
        {/* the page box paints no ground of its own: the bands above are
            the white, so the two hairlines are never covered */}
        <div style={{ width: W, height: PAGE_H, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", overflow: "hidden" }}>

          {/* sliding zone: every layer carries its board AND its live
              content, so nothing pops in after the slide; slides move as
              three vertical bands with a small stagger (parallax) */}
          {(() => {
            const zoneH = fullSlide ? H : bandBottom - BAND_TOP;
            const pageTop = fullSlide ? 0 : -BAND_TOP;
            const pageSpace = (p: PageKey, inSlide: boolean, layer?: HomeLayer) => layer && layer !== "base" ? <>{renderOverlay(p, inSlide, layer)}</> : (
              <>
                <div style={{ position: "absolute", inset: 0, userSelect: "none" }} dangerouslySetInnerHTML={{ __html: (lang === "ge" ? boardsGe[p] : boards[p]) || boards[p] || "" }} />
                {/* ROUND 63: the boards still carry the OLD baked progress bar
                    (line at 685, words at 720) — wipe that strip, the new bar
                    rides the band edge. The Final-Pack board has no bar, only
                    a baked back arrow to hide. */}
                {p === "checkout" ? null : patch(0, 660, W, FOOTER_Y - 660, "barwipe")}
                {/* ROUND 106: the boards also bake the OLD black header
                    band; on a full-page slide it would show above the
                    content, so it is wiped the same way */}
                {/* round 108 #20: a hair wider than the baked band, so no
                    sliver of it survives at a slice's clipped edge */}
                {fullSlide ? patch(-2, -2, W + 4, HEADER_H + 2, "hdrwipe") : null}
                {/* round 108 #15: checkout also bakes the old, bigger folder
                    mark — its edges stuck out around the live one */}
                {p === "checkout" ? patch(1210, HEADER_H, 128, 54, "fldwipe") : null}
                {/* round 108 #17 (owner: "the red circle is bigger above the
                    line than below"): the board bakes its own r34 button at
                    1268.86,719.89 — the live r27 one sat inside it, so the
                    baked ring showed above the rule (below it the white
                    footer hid it). Wiped. */}
                {p === "checkout" ? patch(1262, 700, 82, FOOTER_Y - 700, "btnwipe") : null}
                {/* ROUND 63 (owner): page titles grew with the merged pages —
                    the baked 19px title is covered and redrawn live at 24 */}
                {PAGE_TITLE[p] && (<>
                  {patch(130, 126, 620, 32, "ttl" + p)}
                  <span style={{ ...px(137.14, baseTop(149.08, 24), 620, 24), font: `700 24px ${HNW}`, lineHeight: "24px", color: "#111", whiteSpace: "nowrap" }}>{t(PAGE_TITLE[p]!)}</span>
                </>)}
                {renderOverlay(p, inSlide, layer)}
              </>
            );
            /* content-aware slices (round 16 #3): clip rects with per-slice
               delays; 'fade' slices animate in place (front size box) */
            const slices = (p: PageKey, dirIn: boolean) => sliceDefs(p).map((s, si) => {
              const x0 = s.x0 ?? 0, x1 = s.x1 ?? W;
              const py0 = s.y0 ?? (fullSlide ? 0 : BAND_TOP);
              const py1 = s.y1 ?? (fullSlide ? H : bandBottom);
              const zy0 = Math.max(0, Math.min(zoneH, py0 + pageTop));
              const zy1 = Math.max(0, Math.min(zoneH, py1 + pageTop));
              if (zy1 <= zy0 || x1 <= x0) return null;
              /* 2026-09-23 (owner: "the home page's slide-out looks like the
                 assets cluster, like a glitch — clean that phase up"): the
                 arriving page comes in two halves with a gap between them,
                 and through that gap the home layers showed at different
                 offsets. A layered page therefore LEAVES as one sheet —
                 every layer at once — and only its arrival cascades */
              const d0 = (!dirIn && s.layer ? 0 : s.delay) + (dirIn ? outBase : 0);
              const anim = s.mode === "fade"
                ? `${dirIn ? "nuiFadeIn" : "nuiFadeOut"} ${FADE_MS}ms ${EASE} ${d0}ms both`
                : `${dirIn ? "nuiInPx" : "nuiOutPx"} ${SLIDE_MS}ms ${EASE} ${d0}ms both`;
              return (
                <div key={`${p}-${si}`} style={{ position: "absolute", left: x0, top: zy0, width: x1 - x0, height: zy1 - zy0, overflow: "hidden", animation: anim, pointerEvents: "none" }}>
                  {/* round 28 #3: OPAQUE page behind each slice — an arriving
                      slice covers the outgoing page's late-delay ghosts the
                      moment it lands (no text-over-text mid-flight either) */}
                  <div style={{ position: "absolute", left: -x0, top: pageTop - zy0, width: W, height: H, background: s.layer && s.layer !== "base" ? "transparent" : "#fff" }}>{pageSpace(p, true, s.layer)}</div>
                </div>
              );
            }).filter(Boolean);
            /* round 21 #1: leaving the loader, the glass fades out FIRST on
               clean white, THEN the labels slide in (baseDelay on slices) */
            const outBase = prev === "loader" ? FADE_MS - 40 : 0;
            const faded = (p: PageKey, anim: string, delay = 0) => (
              <div key={p} style={{ position: "absolute", inset: 0, animation: `${anim} ${FADE_MS}ms ${EASE} ${delay}ms both`, pointerEvents: "none" }}>
                <div style={{ position: "absolute", left: 0, top: pageTop, width: W, height: H }}>{pageSpace(p, true)}</div>
              </div>
            );
            return (
              <div style={{ position: "absolute", left: 0, top: fullSlide ? 0 : BAND_TOP, width: W, height: zoneH, overflow: "hidden" }}>
                {/* round 9 #1: entering the loader, the old page fully slides
                    out FIRST, then the loader fades in */}
                {prev && (prev === "loader" ? faded(prev, "nuiFadeOut") : slices(prev, false))}
                {prev
                  ? (page === "loader" ? faded(page, "nuiFadeIn", SLIDE_MS + maxSliceDelay(prev)) : slices(page, true))
                  : intro && page === "welcome" ? slices(page, true)
                  : <div style={{ position: "absolute", left: 0, top: pageTop, width: W, height: H }}>{pageSpace(page, false)}</div>}
              </div>
            );
          })()}

          {/* ROUND 106: the header and footer rules again, over the pages
              (the boards paint their own ground over the ones behind the
              box) — one page unit, the folder mark passes in front */}
          <div style={{ ...px(0, HEADER_H - 0.5, W, 1), background: HAIRLINE, zIndex: 13 }} />
          <div style={{ ...px(0, FOOT_RULE_Y - 0.5, W, 1), background: HAIRLINE, zIndex: 13 }} />

          {/* ROUND 71 #2 (owner): the folder mark, traced verbatim out of the
              artboard (two st4 paths: white fill, 0.75 black stroke) and
              placed at its own coordinates — it straddles the header edge,
              reading as a white shape on the black and as an outline on the
              white below. Functionality still to come from the owner. */}
          {/* ROUND 88 #6: the saving films — each image shrinks and glides
              into the folder mark; the mark bumps as the last one lands */}
          {flights.map((fl) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img key={"fly" + fl.id} src={fl.src} alt=""
              style={{ ...px(fl.x, fl.y, fl.w, fl.h), objectFit: "contain", zIndex: 60, pointerEvents: "none", transformOrigin: "center",
                animation: `${fl.back ? "nuiFlyBack" : "nuiFly"} 1150ms cubic-bezier(.5,.02,.18,1) ${fl.delay}ms both`,
                ...({ "--dx": `${FOLDER_C.x - (fl.x + fl.w / 2)}px`, "--dy": `${FOLDER_C.y - (fl.y + fl.h / 2)}px`, "--s": `${Math.min(0.14 * ICON_SCALE, (52 * ICON_SCALE) / Math.max(fl.w, fl.h)).toFixed(3)}` } as React.CSSProperties) }} />
          ))}
          {/* the folder mark. Round 93 made it a button to the Final Pack;
              ROUND 107 #4 (owner) takes the click back off — it is a MARK,
              the place saved things fly into, nothing to press.
              round 94 #15: no thumbnails inside — the mark stays clean.
              ROUND 106/107: it hangs off the rule by its tab, its outline
              is 1px like the rules, and it is a fifth smaller. */}
          <div key={"fm" + folderBump} aria-hidden
            style={{ ...px(FOLDER_X, FOLDER_TOP, ICON_W, ICON_H), zIndex: 55, pointerEvents: "none", transformOrigin: "50% 62%", animation: folderBump > 0 ? `nuiFolderBump 560ms ${EASE} both` : "none", overflow: "visible" }}>
            <svg viewBox="1232.5 33.9 85.1 70" style={{ position: "absolute", left: 0, top: 0, width: ICON_W, height: ICON_H }}>{FOLDER_MARK}</svg>
          </div>
          {/* STATIC header (real fonts, extracted geometry). ROUND 106: no
              ground of its own — the white band behind it carries the rule */}
          <div style={{ ...px(0, 0, W, HEADER_H), background: "transparent", zIndex: 44 }}>
            {/* round 56 #3 — TEMP DEV SWITCHES (remove before launch). 2026-09-23
                (owner): moved from the top corner to under the footer line,
                on the same left side */}
            <button aria-label="toggle live generation"
              onClick={() => { const v = !liveGen; setLiveGen(v); liveGenRef.current = v; try { localStorage.setItem("nui-live-gen", v ? "1" : "0"); } catch { } }}
              style={{ ...px(18, 768, 110, 16), ...ghost, display: "flex", alignItems: "center", columnGap: 6, textTransform: "none" }}>
              <span style={{ width: 22, height: 12, borderRadius: 7, border: "1px solid #bbb", position: "relative", background: "#fff", boxSizing: "border-box", flex: "0 0 auto" }}>
                <span style={{ position: "absolute", top: 1.5, left: liveGen ? 11.5 : 1.5, width: 7, height: 7, borderRadius: 4, background: liveGen ? "#3fd05e" : "#bbb", transition: "left 160ms" }} />
              </span>
              <span style={{ font: `300 9px ${HNW}`, color: "#aaa", whiteSpace: "nowrap" }}>live gen</span>
            </button>
            {/* 2026-09-23 — TEMP DEV SWITCH: fill the details with a random wine */}
            <button aria-label="toggle fill details"
              onClick={() => { const v = !fillOn; setFillOn(v); fillDetails(v); try { localStorage.setItem("nui-fill", v ? "1" : "0"); } catch { } }}
              style={{ ...px(18, 784, 110, 16), ...ghost, display: "flex", alignItems: "center", columnGap: 6, textTransform: "none" }}>
              <span style={{ width: 22, height: 12, borderRadius: 7, border: "1px solid #bbb", position: "relative", background: "#fff", boxSizing: "border-box", flex: "0 0 auto" }}>
                <span style={{ position: "absolute", top: 1.5, left: fillOn ? 11.5 : 1.5, width: 7, height: 7, borderRadius: 4, background: fillOn ? "#3fd05e" : "#bbb", transition: "left 160ms" }} />
              </span>
              <span style={{ font: `300 9px ${HNW}`, color: "#aaa", whiteSpace: "nowrap" }}>fill details</span>
            </button>
            {/* 2026-09-23 — DEV SWITCH: the guided tour instead of the demo walkthrough */}
            <button aria-label="toggle guided tour"
              onClick={() => { const v = !guideOn; setGuideOn(v); if (!v) setGuide(-1); try { localStorage.setItem("nui-guide", v ? "1" : "0"); } catch { } }}
              style={{ ...px(18, 800, 110, 16), ...ghost, display: "flex", alignItems: "center", columnGap: 6, textTransform: "none" }}>
              <span style={{ width: 22, height: 12, borderRadius: 7, border: "1px solid #bbb", position: "relative", background: "#fff", boxSizing: "border-box", flex: "0 0 auto" }}>
                <span style={{ position: "absolute", top: 1.5, left: guideOn ? 11.5 : 1.5, width: 7, height: 7, borderRadius: 4, background: guideOn ? "#3fd05e" : "#bbb", transition: "left 160ms" }} />
              </span>
              <span style={{ font: `300 9px ${HNW}`, color: "#aaa", whiteSpace: "nowrap" }}>guided tour</span>
            </button>
            {/* 2026-09-23 (owner): the name is "8K.WINE ©", white on a black
                block — the block's foot ON the header's rule, the same air
                above and at the sides, its left edge on the page margin; the
                name and the menu share one size and one baseline, their
                capitals' tops level with the folder mark's top */}
            {(() => {
              const CAP = 13 * 0.72, TOPS = FOLDER_TOP, BASE = TOPS + CAP;
              const PAD = HEADER_H - BASE;
              /* the block takes the name's REAL width (a measured estimate
                 came out short and left the right side tighter than the left) */
              return (
                <button onClick={() => { if (tutRef.current >= 0) stopTutorial(); go("welcome", -1); }}
                  style={{ position: "absolute", left: 137.14, top: TOPS - PAD, height: HEADER_H - (TOPS - PAD), ...ghost, padding: `0 ${PAD}px`, background: "#111", display: "flex", alignItems: "flex-start", textTransform: "none" }}>
                  <span style={{ display: "block", position: "relative", top: baseTop(BASE, 13) - (TOPS - PAD), font: `700 13px ${HNW}`, lineHeight: "13px", color: "#fff", whiteSpace: "nowrap" }}>8K.WINE ©</span>
                </button>
              );
            })()}
            {/* menu + ENG/GEO: one baseline, even gaps, right edge on the
               progress line's right edge x1303 (round 22 #11) */}
            {/* measured: the menu's letters stood 6 below the folder's top */}
            <div style={{ position: "absolute", right: W - 1200, top: baseTop(FOLDER_TOP + 13 * 0.72, 13) - 6, lineHeight: "13px", display: "flex", alignItems: "baseline", columnGap: 44 }}>
              {/* 2026-09-23 (owner): the menu in capitals, both languages
                  (Georgian turns to Mtavruli) */}
              <span style={{ font: `700 13px ${HNW}`, color: INK, whiteSpace: "nowrap", textTransform: "uppercase" }}>{t("About Us")}</span>
              {/* ROUND 112 #4 (owner): Gallery became ARTISTS — the people
                  whose hands the labels are painted in */}
              <button onClick={openArtists}
                style={{ ...ghost, font: `700 13px ${HNW}`, color: page === "artists" || page === "artist" ? BAR_RED : INK, whiteSpace: "nowrap", textTransform: "uppercase" }}>{t("About artists")}</button>
              <span style={{ font: `700 13px ${HNW}`, color: INK, whiteSpace: "nowrap", textTransform: "uppercase" }}>{t("Contact")}</span>
              <span style={{ display: "flex", alignItems: "baseline", columnGap: 5, whiteSpace: "nowrap" }}>
                <button onClick={() => pickLang("en")} style={{ ...ghost, font: `${lang === "en" ? 700 : 300} 13px ${HNW}`, color: lang === "en" ? INK : "#8a8a8a" }}>ENG</button>
                <span style={{ font: `300 13px ${HNW}`, color: "#8a8a8a" }}>/</span>
                <button onClick={() => pickLang("ge")} style={{ ...ghost, font: `${lang === "ge" ? 700 : 300} 13px ${HNW}`, color: lang === "ge" ? INK : "#8a8a8a" }}>GEO</button>
              </span>
            </div>
          </div>

          {/* ROUND 63 PROGRESS BAR (owner's mocks): the line and its dots ride
              the white/black boundary, the station labels sit in the black
              footer, and the NEXT action is a big red round button — at the
              right on working pages, at the left on the welcome page. */}
          {/* ROUND 68 #1 (owner): the bar stays crisp ABOVE a modal's veil —
              it just stops taking clicks while one is open */}
          <div style={{ ...px(0, 0, W, H), pointerEvents: "none", zIndex: 45 }}>
            {thick !== null && (<>
              <div style={{ ...px(BAR_X0, PROG_Y - LINE_H / 2, Math.max(0, thick - BAR_X0), LINE_H), background: BAR_RED, borderRadius: LINE_H / 2, transition: `width ${SLIDE_MS}ms ${EASE}` }} />
              <div style={{ ...px(BAR_X0 - START_R, PROG_Y - START_R, START_R * 2, START_R * 2), background: BAR_RED, borderRadius: START_R }} />
              {STEPS.map((st, i) => {
                /* round 71: big dot = a result page, small dot = a page you
                   fill in; a future big dot is white with a black ring, a
                   future small dot is solid black */
                const r = st.big ? DOT_BIG : DOT_SMALL;
                const done = step >= i;
                return (
                  <button key={"d" + i} aria-label={st.label} tabIndex={-1}
                    /* 2026-09-23 (owner: "no clicks anywhere on the progress
                       bar — its stops, its names, the bar itself; only the red
                       button"): the bar is a picture, always */
                    style={{ ...px(st.x - 13, PROG_Y - 13, 26, 26), ...ghost, cursor: "default", pointerEvents: "none" }}>
                    <span style={{
                      position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
                      width: r * 2, height: r * 2, borderRadius: r, boxSizing: "border-box",
                      background: done ? BAR_RED : st.big ? "#fff" : "#111",
                      border: !done && st.big ? "1px solid #111" : "none",
                      transition: `background 300ms ${EASE}`,
                    }} />
                  </button>
                );
              })}
              {/* 2026-09-23 (owner): SKIP rides the progress bar — centred over
                  the red dot the thick line stands on, a clear gap above the
                  line, and it travels with the line. Front label pages skip
                  to the back label details, back label pages to the bottle,
                  the bottle to the Final Pack; not on Marketing Assets, the
                  Final Pack, or while the tutorial tells its story. */}
              {SKIP_TO[page] && tut < 0 && guide < 0 && (
                <button onClick={() => go(SKIP_TO[page]!)}
                  style={{ ...px(thick - 60, baseTop(PROG_Y - 14, BAR_FS), 120, BAR_FS + 4), ...ghost, pointerEvents: modalOpen ? "none" : "auto",
                    font: `700 ${BAR_FS}px/${BAR_FS}px ${HNW}`, color: BAR_RED, textAlign: "center", textTransform: "none", whiteSpace: "nowrap",
                    transition: `left ${SLIDE_MS}ms ${EASE}` }}>
                  {t("SKIP")}
                </button>
              )}
              {STEPS.map((st, i) => (
                <button key={st.label + i} tabIndex={-1}
                  style={{
                    ...px(st.x - 130, baseTop(LABEL_BASE, BAR_FS), 260, 20), ...ghost,
                    cursor: "default", pointerEvents: "none",
                    font: `${st.big ? 700 : 300} ${BAR_FS}px/${BAR_FS}px ${HNW}`,
                    color: INK, textAlign: "center", textTransform: "none", whiteSpace: "nowrap",
                    /* round 72 #6: in the walkthrough a stop stays unnamed
                       until it is REACHED. Round 109 (the owner's artboards):
                       the stop the button stands on is named — its name is
                       the card's title. Outside the walkthrough, all show. */
                    opacity: tut >= 0 && i > tut ? 0 : 1,
                    transition: `opacity ${SLIDE_MS}ms ${EASE}`,
                  }}>
                  {t(st.label)}</button>
              ))}
            </>)}
            {/* ROUND 109 (owner's re-cut artboards): the walkthrough's card
                sits under the bar, its left edge on the left edge of the
                station's own LABEL — that label is the title, so the card
                is just "STEP N" in red and two italic lines. The closing
                card is ONE red word on the labels' own baseline, centred
                under the button at the end of the bar. */}
            {tut >= 0 && tutX !== null && (() => {
              const card = TUT_CARDS[Math.min(tut, TUT_CARDS.length - 1)];
              const solo = card.body.length === 0;          /* the closing card */
              const fs = lang === "ge" ? CARD_FS - 2 : CARD_FS;
              const bfs = lang === "ge" ? CARD_BODY_FS - 1 : CARD_BODY_FS;
              const st = STEPS[tut];
              /* the label is centred on its stop; the card starts where the
                 label starts */
              const labelW = st ? textW(t(st.label), `${st.big ? 700 : 300} ${BAR_FS}px ${HNW}`) : 0;
              const L = solo ? tutX - 110 : tutX - labelW / 2;
              return (
                <div key={"tut" + tut} style={{ position: "absolute", left: L, top: 0, width: W - L, height: PAGE_H, pointerEvents: "none", animation: `nuiFadeIn 320ms ${EASE} both`, transition: `left ${SLIDE_MS}ms ${EASE}` }}>
                  {solo ? (
                    /* on the labels' baseline, centred under the button */
                    <span style={{ position: "absolute", left: 0, top: baseTop(LABEL_BASE + 0.22, fs), width: 220, textAlign: "center", font: `700 ${fs}px/${fs}px ${HNW}`, color: BAR_RED, whiteSpace: "nowrap" }}>{t(card.step)}</span>
                  ) : (<>
                    <span style={{ position: "absolute", left: 0, top: baseTop(CARD_BASE, fs), font: `700 ${fs}px/${fs}px ${HNW}`, color: BAR_RED, fontWeight: 700, whiteSpace: "nowrap" }}>{t(card.step)}</span>
                    {card.body.map((ln, i) => (
                      <span key={"b" + i} style={{ position: "absolute", left: 0, top: baseTop(CARD_BASE + CARD_BODY[i], bfs), font: `italic ${bfs}px/${bfs}px ${HNW}`, color: INK, whiteSpace: "nowrap" }}>{t(ln)}</span>
                    ))}
                    {/* round 72 #4: a way out at any point — the last line
                        of the card, so it never runs into the copy */}
                    <button data-tut-ok onClick={endTutorial}
                      style={{ position: "absolute", left: 0, top: baseTop(CARD_BASE + CARD_BODY[1] + 16.4, 12), ...ghost, pointerEvents: "auto", font: `12px ${HNW}`, color: BAR_RED, textDecoration: "underline", textTransform: "none", cursor: "pointer", lineHeight: "12px" }}>
                      {t("Skip")}</button>
                  </>)}
                </div>
              );
            })()}
            {/* the red round NEXT button. ROUND 108 #16 (owner): the grow-on-
                hover lives on a WRAPPER — the button's own pulse animation
                (`both`) outranks any :hover transform, so after one pulse the
                button had stopped answering the mouse. */}
            {(page !== "loader" || tut >= 0) && (
              <div className="nui-next"
                style={{
                  position: "absolute", left: (tutX !== null ? tutX : page === "welcome" ? WELCOME_X : onArtists ? BACK_X : NEXT_X) - NEXT_R, top: PROG_Y - NEXT_R,
                  width: NEXT_R * 2, height: NEXT_R * 2, borderRadius: NEXT_R,
                  transition: `${arrowFly ? "" : `left ${SLIDE_MS}ms ${EASE}, `}transform 200ms cubic-bezier(0.33, 1, 0.68, 1)`,
                  pointerEvents: modalOpen ? "none" : "auto",
                }}>
              <button data-tut-ok key={"next" + nudge + "-" + pressed} aria-label={page === "welcome" ? "start" : "next"}
                onClick={() => {
                  barJumped.current = false;
                  /* round 71 #4: inside the walkthrough the arrow only ever
                     turns the page of the story */
                  if (tut >= 0) {
                    if (tut >= tutLast) { endTutorial(); return; }
                    const nx = tut + 1;
                    setTut(nx);
                    /* round 72 #9: FRONT LABEL opens on the loader */
                    const pg: PageKey = nx === 1 ? "loader" : TUT_PAGES[nx];
                    if (pg !== page) go(pg);
                    return;
                  }
                  /* round 112 #4: on the artists' pages it walks back —
                     the artist's page to the index, the index to wherever
                     the visitor pressed ARTISTS */
                  if (page === "artist") { go("artists", -1); return; }
                  if (page === "artists") { go(artistsFrom.current || "welcome", -1); return; }
                  if (page === "welcome") {
                    /* round 72 #3 (owner, TEMP while we test): EVERY arrival
                       gets the walkthrough, refresh included. Later this
                       wants to be per-visitor, not per-load. */
                    /* 2026-09-23: with "guided tour" on, the visitor does the
                       round themselves, the notes beside them */
                    if (guideOn) { setGuide(0); go("vision"); return; }
                    startTutorial(); return;
                  }
                  else if (page === "vision") {
                    /* round 54 #2: a REAL generation asks for confirmation;
                       unchanged inputs just move along */
                    if (dreams.length && frontSig === sigFront()) nextFromFront();
                    else if (!FRONT_ROWS.some((k2) => (f[k2] || "").trim())) setEmptyWarn("front");
                    /* 2026-09-26 (owner): no "check your details" in the tour */
                    else if (guide >= 0) nextFromFront();
                    else openConfirm("labels", "vision");
                  }
                  else if (page === "options") {
                    /* round 7 #12: warn instead of silently ignoring */
                    if (selected >= 0) go("backdetails");
                    else { setWarn(t("Save a label design to continue")); setTimeout(() => setWarn(""), 3200); }
                  }
                  else if (page === "backdetails") {
                    if (!(markets.length || noComp)) { setWarn(t("Select at least one market to continue")); setTimeout(() => setWarn(""), 3200); }
                    else if (!BACK_ROWS.some((k2) => (b[k2] || "").trim()) && !(b.description || "").trim() && !gtin.trim()) setEmptyWarn("back");
                    else nextFromCompliance();
                  }
                  else if (page === "backdesign") go("bottle");
                  else if (page === "bottle") {
                    /* round 48 #5: every section needs a pick (finish is
                       moot under No Capsule — the wheel is deactivated) */
                    const full = wineColor && bottle.type && bottle.color && bottle.closure && (bottle.closure === "No Capsule" || bottle.finish);
                    if (full) go("assets");
                    else { setWarn(t("Pick an option in every section to continue")); setTimeout(() => setWarn(""), 3200); }
                  }
                  else if (page === "assets") go("checkout");
                  /* round 85 #3: on the Final Pack the button is the payment,
                     then the download */
                  /* 2026-09-23 (owner): no payment step for now — the button
                     downloads the pack as soon as the terms are agreed */
                  /* 2026-09-25 (owner): the payment step is back — the card pays,
                     then the tray downloads (the card only marks the order
                     paid until Paddle is connected) */
                  else if (page === "checkout") {
                    if (!paid) { if (requireAgree()) setPaid(true); }
                    else proceedToPayment();
                  }
                }}
                style={{
                  position: "absolute", inset: 0,
                  borderRadius: NEXT_R, background: BAR_RED, border: "none",
                  padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  animation: arrowFly ? `btnFly ${SLIDE_MS}ms ${EASE} both`
                    : ((tut >= 0 && (tutIdle || tut >= tutLast)) || page === "checkout") && nudge > 0 ? `nuiNudge 1200ms ${EASE} both`
                    : pressed > 0 ? `nuiPress 260ms ${EASE} both` : "none",
                }}>
                {/* ROUND 109: the artboard's smaller arrow — 18.25 long,
                    1.6 stroke, its head 5.6 deep; the pay and download
                    marks step down with it */}
                {onArtists ? (
                  /* the artboard's back arrow: the same 18.25 line, flipped */
                  <svg viewBox="-9.93 -6.4 20.05 12.8" width="20.05" height="12.8">
                    <line x1="9.12" y1="0" x2="-9.13" y2="0" stroke="#fff" strokeWidth="1.6" strokeMiterlimit="10" />
                    <polyline points="-3.53,5.6 -9.13,0 -3.53,-5.6" fill="none" stroke="#fff" strokeWidth="1.6" strokeMiterlimit="10" />
                  </svg>
                ) : page === "checkout" && paid ? (
                  /* the owner's download tray (Red_Buttons_Pay&Download.svg) */
                  <svg viewBox="0 0 40 40" width="21" height="21">
                    <path d="M8 20 V32 H32 V20" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinejoin="miter" />
                    <line x1="20" y1="6" x2="20" y2="24" stroke="#fff" strokeWidth="3.4" />
                    <polyline points="13,17 20,24.5 27,17" fill="none" stroke="#fff" strokeWidth="3.4" />
                  </svg>
                ) : page === "checkout" ? (
                  /* the owner's card — back 2026-09-25 with the payment step */
                  <svg viewBox="0 0 44 32" width="23.5" height="17">
                    <rect x="2.5" y="2.5" width="39" height="27" rx="3.5" fill="none" stroke="#fff" strokeWidth="3.4" />
                    <line x1="2.5" y1="11" x2="41.5" y2="11" stroke="#fff" strokeWidth="3.4" />
                    <rect x="29" y="19" width="7" height="4" fill="#fff" />
                  </svg>
                ) : (
                  <svg viewBox="-9.93 -6.4 20.05 12.8" width="20.05" height="12.8">
                    <line x1="-9.13" y1="0" x2="9.12" y2="0" stroke="#fff" strokeWidth="1.6" strokeMiterlimit="10" />
                    <polyline points="3.52,5.6 9.12,0 3.52,-5.6" fill="none" stroke="#fff" strokeWidth="1.6" strokeMiterlimit="10" />
                  </svg>
                )}
              </button>
              </div>
            )}
          </div>

          {/* ROUND 72 #1: the closing card stands on a clean white page */}
          {/* 2026-09-23 (owner: "when the red button reaches START, the
              home page content should slide in — not an empty page"): his
              Homepage_Visual IS this closing state, so its layers slide
              onto the sheet in the home page's own cascade */}
          {tut === TUT_CARDS.length - 1 && (
            <div style={{ ...px(0, VEIL_TOP, W, VEIL_BOT - VEIL_TOP), background: "#fff", zIndex: 11, overflow: "hidden", pointerEvents: "none", animation: `nuiFadeIn 280ms ${EASE} both` }}>
              {(PAGE_SLICES.welcome || []).map((sl) => (
                <div key={"tuthome" + sl.layer} style={{ position: "absolute", left: 0, top: -VEIL_TOP, width: W, height: H, animation: `nuiHomeIn ${SLIDE_MS}ms ${EASE} ${200 + sl.delay}ms both` }}>
                  {homeLayers(sl.layer)}
                </div>
              ))}
            </div>
          )}
          {/* 2026-09-23 — THE GUIDED TOUR's note (guide.ts): a small black
              box beside the thing to touch, its caret pointing at it (no
              frames — the owner took the red dashed lines out). It shows only
              once the page has slid in. Skip (red) ends the tour; Next is on
              every note that the visitor can pass by hand — and if they have
              not done what it asks, the first Next only asks "are you sure?"
              and the second lets them through (owner #10). A "press the red
              button" note has no Next: the red button IS its next. */}
          {guide >= 0 && GUIDE[guide] && !prev && (() => {
            const st: GuideStep = GUIDE[guide];
            const show = st.modal ? !!confirmModal : page === st.page && !confirmModal;
            if (!show) return null;
            const BW2 = 250, GAP = 14;
            const a = st.anchor === "create" ? createRect.current : st.at, cx = a.x + a.w / 2, cy = a.y + a.h / 2;
            const left = st.side === "left" ? a.x - GAP - BW2 : st.side === "right" ? a.x + a.w + GAP : Math.max(20, Math.min(W - BW2 - 20, cx - BW2 / 2));
            const top = st.side === "above" ? a.y - GAP : st.side === "below" ? a.y + a.h + GAP : cy;
            const shift = st.side === "above" ? "translateY(-100%)" : st.side === "left" || st.side === "right" ? "translateY(-50%)" : "none";
            const caretX = Math.max(14, Math.min(BW2 - 14, cx - left));
            const last = guide === GUIDE.length - 1;
            /* 2026-09-23 (owner): "Next" only where it is really needed — a
               note that is read, or one that asks for typing (the visitor
               says when they are done). A note that waits for an ACTION —
               a save, a pick, a press — moves on by that action alone. */
            const byHand = !st.done;
            /* the markets note changes its words once a market is picked */
            const phase2 = !!st.then && guideDoneNow(st.then.when);
            const press = phase2 ? st.then!.press : st.press;
            const okNow = guideOk === guide;
            /* ← back to the previous note, when it is a note to read on this page */
            const canBack = guide > 0 && GUIDE[guide - 1].page === page && !GUIDE[guide - 1].done;
            const met = st.done ? guideDoneNow(st.done) : guideNeedsMet(st.needs);
            const warned = guideWarn === guide && !met;
            const onNext = () => {
              if (!met && guideWarn !== guide) { setGuideWarn(guide); return; }
              setGuideWarn(-1);
              setGuide(last ? -1 : guide + 1);
            };
            const L = (en: string, ge: string) => (lang === "ge" ? ge : en);
            return (
              <>
              {/* the thing to press breathes with a red ring */}
              {press && !okNow && (
                <div style={{ position: "absolute", left: a.x - 5, top: a.y - 5, width: a.w + 10, height: a.h + 10, border: `2px solid ${BAR_RED}`, boxSizing: "border-box",
                  borderRadius: Math.abs(a.w - a.h) < 4 ? "50%" : 3, zIndex: 79, pointerEvents: "none", animation: "nuiRing 1.6s ease-in-out infinite" }} />
              )}
              <div key={"guide" + guide} style={{ position: "absolute", left, top, width: BW2, transform: shift, zIndex: 80, background: BAR_RED, color: "#fff", padding: "11px 13px 9px", boxSizing: "border-box", animation: `nuiFadeIn 360ms ${EASE} both`, pointerEvents: "auto" }}>
                {/* the caret, on the side that faces the target */}
                {/* 2026-09-27 (owner): the notes in our red, white text, a black Skip */}
                <span style={{ position: "absolute", width: 10, height: 10, background: BAR_RED, transform: "rotate(45deg)",
                  ...(st.side === "above" ? { bottom: -5, left: caretX - 5 } : st.side === "below" ? { top: -5, left: caretX - 5 }
                    : st.side === "left" ? { right: -5, top: "calc(50% - 5px)" } : { left: -5, top: "calc(50% - 5px)" }) }} />
                {/* 2026-09-23 (owner): Georgian ran with twice the leading it
                    needs; both languages now set their own, and the box's
                    line boxes are pinned so a language switch cannot leave
                    the other's spacing behind */}
                {/* 2026-09-27 (owner): no step count, no "optional" tag */}
                <div key={"gt" + lang} style={{ font: `${lang === "ge" ? 12 : 13}px/${lang === "ge" ? "15px" : "17px"} ${HNW}`, position: "relative" }}>
                  {warned
                    ? L("You haven't done this step yet. Continue anyway?", "ეს ნაბიჯი ჯერ არ გაგიკეთებია. მაინც გააგრძელებ?")
                    : phase2 ? L(st.then!.en, st.then!.ge)
                    : qrMode === "create" && st.enPage && st.gePage ? L(st.enPage, st.gePage) : L(st.en, st.ge)}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", columnGap: 10, marginTop: 9, position: "relative" }}>
                  <span style={{ justifySelf: "start", display: "flex", alignItems: "center", columnGap: 10 }}>
                    {canBack && (
                      <button aria-label="previous note" onClick={() => { setGuideWarn(-1); setGuide(guide - 1); }} style={{ ...ghost, font: `700 12px ${HNW}`, color: "#fff", textTransform: "none", padding: 0 }}>←</button>
                    )}
                    <button onClick={() => { setGuideWarn(-1); setGuide(-1); }} style={{ ...ghost, font: `11px ${HNW}`, color: "#111", textDecoration: "underline", textTransform: "none", padding: 0 }}>{t("Skip")}</button>
                  </span>
                  {/* the foot says what moves this note on — always in this place */}
                  {okNow ? (
                    <span style={{ justifySelf: "end", font: `700 11px ${HNW}`, whiteSpace: "nowrap" }}>✓ {L("Done", "მზადაა")}</span>
                  ) : byHand ? (
                    <button onClick={onNext} style={{ ...ghost, justifySelf: "end", font: `700 11px ${HNW}`, color: "#fff", textTransform: "none", whiteSpace: "nowrap" }}>
                      {warned ? L("Yes, continue", "კი, გავაგრძელოთ") : last ? t("Finish") : t("Next")} →
                    </button>
                  ) : st.wait ? (
                    <span style={{ justifySelf: "end", font: `italic 11px ${HNW}`, whiteSpace: "nowrap" }}>
                      {L("Being made", "მზადდება")}
                      {[0, 1, 2].map((k) => <span key={k} style={{ animation: `nuiBlink 1.2s ease-in-out ${k * 0.2}s infinite` }}>.</span>)}
                    </span>
                  ) : <span />}
                  {/* 2026-09-27 (owner): an action note names no button and
                      shows no pointer — the button itself pulses (ring above) */}
                </div>
              </div>
              </>
            );
          })()}
          {/* ROUND 72 #11: the pointer doing the work */}
          {tut >= 0 && cursor && (
            <svg viewBox="0 0 24 24" width="21" height="21" style={{
              /* round 112 #2 (owner): the ONE exception to "nothing over the
                 bar" — the story's pointer must be seen pressing the button */
              position: "absolute", left: cursor.x - 2, top: cursor.y - 1, zIndex: 70, pointerEvents: "none",
              transition: `left ${cursor.ms}ms cubic-bezier(.33,0,.2,1), top ${cursor.ms}ms cubic-bezier(.33,0,.2,1)`,
              willChange: "left, top",
            }}>
              <path d="M3 2 L3 18.2 L7.3 14.2 L10 20.6 L12.9 19.3 L10.3 13.1 L16.2 12.9 Z"
                fill="#111" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          )}
          {/* ROUND 72 #8: the ghost tap */}
          {tut >= 0 && ripple && (
            <div key={ripple.n} style={{
              position: "absolute", left: ripple.x - 19, top: ripple.y - 19, width: 38, height: 38,
              borderRadius: 19, border: `2px solid ${BAR_RED}`, boxSizing: "border-box",
              pointerEvents: "none", zIndex: 69, animation: `nuiTap 700ms ${EASE} both`,
            }} />
          )}
          {/* ROUND 71 #4: while the walkthrough plays, the page is a film —
              it swallows clicks so nothing the visitor prods can derail the
              story. The bar (z45) still takes its own. */}
          {tut >= 0 && <div style={{ ...px(0, VEIL_TOP, W, VEIL_BOT - VEIL_TOP), zIndex: 12, background: "transparent" }} />}
          {/* ROUND 59 #2: the gate message floats at ROOT level so it can
              sit truly midway between the selection row and the bar line */}
          {/* round 76 #2: checkout prints its own gate message under the
              payment button — this one would be the second copy */}
          {warn && thick !== null && page !== "checkout" && (
            <span style={{ ...px(0, 700, W, 16), font: `13px ${HNW}`, color: "#BA141A", textAlign: "center", display: "block", zIndex: 7, position: "absolute" }}>{warn}</span>
          )}

          {/* STATIC footer — ROUND 63: empty; the progress bar (drawn after
              it, so it paints on top) is the only thing down here.
              ROUND 106: white, and it covers the boards' own baked black
              footer; its rule is the one drawn at window width behind. */}
          <div style={{ ...px(0, FOOT_RULE_Y, W, PAGE_H - FOOT_RULE_Y), background: "#fff" }} />

          {busyMsg && <div style={{ ...px(1090, 78, 320, 20), font: `13px ${HNW}`, color: "#8a887e", textAlign: "right" }}>{busyMsg}</div>}

          {/* ROUND 93 #15/#16: THE GALLERY — the picture big on a white veil,
              arrows when there is more than one, ✕, and Save when the page
              offers one */}
          {gallery && (() => {
            const src = gallery.items[gallery.index] || "";
            const many = gallery.items.length > 1;
            const step = (d: number) => setGallery((g) => g ? { ...g, index: (g.index + d + g.items.length) % g.items.length } : g);
            /* ROUND 108 #13 (owner): the picture sits in the MIDDLE of the
               band between the two rules; the arrows are the Final Pack's
               own chevrons, on the page margins and a little outside them,
               at that same middle; the cross sits on the right margin. The
               veil covers the band ONLY — the header, the folder mark and
               the progress bar are never covered by anything (z 30/31/32
               all pass under the bar's 45 and the header's 44). */
            /* ROUND 113 #1 (owner): "in gallery view, put the white
               transparent background on top of everything" — the gallery
               is the ONE exception to round 108 #20. Its veil covers the
               whole page, header, folder mark and progress bar included,
               and rides above them (z 80+ clears the bar's 45, the
               header's 44 and the walkthrough pointer's 70). */
            const GTOP = 0, GBOT = PAGE_H;
            const res = gallery.save ? 78 : many ? 34 : 0;    /* room kept for the furniture */
            /* the same air top and bottom, so the picture sits on the
               page's own middle whatever furniture is under it */
            const pad = Math.max(56, res + 20);
            const boxY = GTOP + pad, boxH = (GBOT - pad) - boxY;
            const MID = GTOP + (GBOT - GTOP) / 2;
            const chev = (dir: -1 | 1) => (
              <svg viewBox="0 0 16 16" width="16" height="16" style={{ display: "block" }}>
                <polyline points={dir < 0 ? "12.74,1.83 6,8.57 12.74,15.31" : "3.26,1.83 10,8.57 3.26,15.31"}
                  fill="none" stroke="#111" strokeWidth="1.92" strokeMiterlimit="10" />
              </svg>
            );
            return (<>
              <div style={{ ...px(0, GTOP, W, GBOT - GTOP), zIndex: 80 }} onClick={() => setGallery(null)} />
              <div style={{ ...px(0, GTOP, W, GBOT - GTOP), background: "rgba(255,255,255,0.94)", zIndex: 80, pointerEvents: "none" }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" style={{ ...px(210, boxY, 1020, boxH), objectFit: "contain", zIndex: 81, animation: `nuiFadeIn 220ms ${EASE} both` }} />
              {many && (<>
                <button aria-label="previous" onClick={() => step(-1)} style={{ ...px(137.14 - 46, MID - 22, 44, 44), ...ghost, zIndex: 82, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{chev(-1)}</button>
                <button aria-label="next" onClick={() => step(1)} style={{ ...px(1302.86 + 2, MID - 22, 44, 44), ...ghost, zIndex: 82, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{chev(1)}</button>
                <span style={{ ...px(0, GBOT - res - 2, W, 16), font: `13px ${HNW}`, color: "#8a887e", textAlign: "center", display: "block", zIndex: 82 }}>{gallery.index + 1} / {gallery.items.length}</span>
              </>)}
              {/* ROUND 113 #1 (owner): "put the close icon X in black circle
                  and make X white" — the disc is centred on the right page
                  margin, at the height the ✕ always sat */}
              <button aria-label="close gallery" onClick={() => setGallery(null)} style={{ ...px(1302.86 - 17, 42 - 17, 34, 34), ...ghost, zIndex: 82, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg viewBox="0 0 34 34" width="34" height="34" style={{ display: "block" }}>
                  <circle cx="17" cy="17" r="17" fill="#111" />
                  <line x1="11" y1="11" x2="23" y2="23" stroke="#fff" strokeWidth="1.92" />
                  <line x1="23" y1="11" x2="11" y2="23" stroke="#fff" strokeWidth="1.92" />
                </svg>
              </button>
              {gallery.save && (
                <button onClick={() => { gallery.save?.(); setGallery((g) => g ? { ...g, saved: !g.saved } : g); }}
                  style={{ ...px(W / 2 - 120, GBOT - 48, 240, 34.3), zIndex: 82, cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: gallery.saved ? "#fff" : "#111", color: gallery.saved ? "#111" : "#fff", border: "1px solid #111", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4 }}>
                  {gallery.saved ? t("Saved") : t("Save")}</button>
              )}
            </>);
          })()}
          {/* ROUND 93 #8: "every field is empty" — asked once, before the
              confirmation or the next page */}
          {emptyWarn && (() => {
            const front = emptyWarn === "front";
            const proceed = () => { setEmptyWarn(""); if (front) { if (guide >= 0) nextFromFront(); else openConfirm("labels", "vision"); } else nextFromCompliance(); };
            const edit = () => { setEmptyWarn(""); if (!front) go("backdetails", -1); };
            const B2 = { x: 420, y: 250, w: 600, h: 250 };
            return (<>
              <div style={{ ...px(0, 0, W, H), zIndex: 40 }} onClick={() => setEmptyWarn("")} />
              <div style={{ ...px(0, VEIL_TOP, W, VEIL_BOT - VEIL_TOP), background: "rgba(255,255,255,0.88)", zIndex: 40, pointerEvents: "none" }} />
              <div style={{ ...px(B2.x, B2.y, B2.w, B2.h), background: "#fff", border: "1px solid #111", zIndex: 41, boxSizing: "border-box" }}>
                <span style={{ position: "absolute", left: 32, top: baseTop(52, 23), font: `700 23px ${HNW}`, lineHeight: "23px", whiteSpace: "nowrap" }}>{t("All fields are empty").toUpperCase()}</span>
                <span style={{ position: "absolute", left: 32, top: 78, width: B2.w - 64, font: `italic 15px ${HNW}`, lineHeight: "21px", color: "#111" }}>
                  {t(front
                    ? "You haven't filled in any front label details. The label will carry no wine name, producer or vintage. Is that what you want?"
                    : "You haven't filled in any back label details. The back label will carry no producer, importer, lot or description. Is that what you want?")}
                </span>
                <button onClick={edit} style={{ ...px(32, B2.h - 34.3 - 30, (B2.w - 64) / 2 - 8, 34.3), cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: "#fff", color: "#111", border: "1px solid #111", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4 }}>{t("Edit details")}</button>
                <button onClick={proceed} style={{ ...px(32 + (B2.w - 64) / 2 + 8, B2.h - 34.3 - 30, (B2.w - 64) / 2 - 8, 34.3), cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: "#111", color: "#fff", border: "1px solid #111", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4 }}>{t("Continue anyway")}</button>
              </div>
            </>);
          })()}
          {confirmModal && (() => {
            /* ROUND 65/66 (owner's two reference screens): one chrome —
               uppercase title, dashed rule, Edit/Create —
               with a layout per kind. LABELS: prompt + sketch on the left,
               the typed fields on the right. ASSETS: the bottle drawing,
               the two label boxes and the product list. ROUND 66 #3:
               nothing empty is ever announced — a block whose content is
               missing (and its title) simply isn't there, and the box
               shrinks to fit what remains. */
            const isL = confirmModal === "labels";
            /* the assets column is narrower (three blocks sit left of it),
               so its type steps down a notch */
            const fs = isL ? 15 : 14;
            /* round 108 #6 (owner: "the details list has its text cut off
               at the bottom"): a 15px line box clipped Georgian descenders —
               the line box now has the room the face asks for */
            const LH = `${fs + 6}px`;
            const cap = (txt: string) => <span style={{ font: `700 ${lang === "ge" ? fs - 2 : fs}px/${LH} ${HNW}`, whiteSpace: "nowrap" }}>{txt}</span>;
            const val = (txt: string) => <span style={{ font: `italic ${fs}px/${LH} ${HNW}`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{txt}</span>;
            const colTitle = (x: number, txt: string) => (
              <span style={{ position: "absolute", left: x, top: baseTop(162.8, 21), font: `700 ${lang === "ge" ? 15 : 18}px/21px ${HNW}`, whiteSpace: "nowrap" }}>{txt}</span>
            );
            /* ROUND 74 #1 (owner): the two label previews must stand the
               SAME height — they are the same physical height on the bottle,
               and object-fit sized each by its own aspect (a square back
               label came out half again as tall as a landscape front one).
               `imgH` forces a shared height and lets the widths follow. */
            const dashBox = (x: number, y: number, w2: number, h2: number, img?: string, imgH?: number) => (
              <div style={{ position: "absolute", left: x, top: y, width: w2, height: h2 }}>
                {dashedBox(0, 0, w2, h2)}
                {img && (imgH
                  ? (/* eslint-disable-next-line @next/next/no-img-element */
                    <img src={img} alt="" style={{ position: "absolute", left: 8, right: 8, top: (h2 - imgH) / 2, height: imgH, width: "calc(100% - 16px)", objectFit: "contain" }} />)
                  : (/* eslint-disable-next-line @next/next/no-img-element */
                    <img src={img} alt="" style={{ position: "absolute", inset: 8, width: "calc(100% - 16px)", height: "calc(100% - 16px)", objectFit: "contain" }} />))}
              </div>
            );
            const frontThumb = customLabel || viewedDream(selected)?.preview || viewedDream(selected)?.dream || "";
            const backThumb = !customLabel && backPng ? backPng : "";
            const prompt = vision.trim();
            /* only what the customer actually gave us */
            /* ROUND 67 (owner): every row is listed — a field the customer
               left empty shows its own grey placeholder, exactly like the
               form it came from. (Whole BLOCKS with nothing in them —
               prompt, sketch, back label — still disappear, round 66 #3.) */
            /* ROUND 86 #1 (owner): the check lists ONLY what the customer
               filled in — no placeholders, no empty rows (reverses round
               67's "every row with its grey placeholder") */
            const rows: [string, string, string][] = (isL
              ? (FRONT_LABELS.map((c, i) => [c, (f[FRONT_ROWS[i]] || "").trim(), t(FRONT_PH[i])] as [string, string, string])
                .concat([["Label size:", `${f.width || 110} × ${f.height || 80} ${t("mm")}`, ""]]))
              : ([
                ["Wine Name:", (f.wine || "").trim(), t("E.g. Château Margaux")],
                ["Wine Color", wineColor, "—"],
                ["Bottle Type", bottle.type, "—"],
                ["Bottle Color", bottle.color, "—"],
                ["Closure Type", bottle.closure, "—"],
                ["Closure Color", bottle.closure === "No Capsule" ? "" : bottle.finish, "—"],
                ["Label size:", `${customLabel ? customDims.w : f.width || 110} × ${customLabel ? customDims.h : f.height || 80} ${t("mm")}`, ""],
              ] as [string, string, string][])).filter(([, v]) => !!v);
            /* ── the columns, then the height that fits them ── */
            const left: React.ReactNode[] = [];
            let leftBottom = 140;
            if (isL) {
              let y = 162.8;
              if (prompt) {
                /* round 108 #7 (owner: "never cut the text"): the prompt
                   steps down 15 → 10px until it fits the 68 it was given,
                   and if it still does not, the block itself grows (the
                   popup is measured from it) up to a sane ceiling. */
                const PW = 329, NAT = 68;
                const fit = (() => {
                  for (const sz of [15, 14, 13, 12, 11, 10]) {
                    const lh = Math.round(sz * 1.18);
                    const lines = Math.ceil(prompt.length / Math.max(1, Math.floor(PW / (sz * 0.5))));
                    if (lines * lh <= NAT) return { sz, lh, h: NAT };
                    if (sz === 10) return { sz, lh, h: Math.min(260, lines * lh) };
                  }
                  return { sz: 10, lh: 12, h: NAT };
                })();
                left.push(<span key="pt">{colTitle(32, t("Prompt:"))}</span>);
                /* 2026-09-24: HNW's roman is taller than its line — the
                   scroll box clipped p/g descenders; 6 units of room below */
                left.push(<span key="pv" className="nui-noscroll" style={{ position: "absolute", left: 32, top: baseTop(y + 43, fit.sz), width: PW, maxHeight: fit.h + 6, paddingBottom: 6, boxSizing: "border-box", font: `${fit.sz}px/${fit.lh}px ${HNW}`, overflowY: "auto" }}>{prompt}</span>);
                y += 59 + fit.h;
                leftBottom = y - 4;
              } else if (!sketch) {
                /* 2026-09-26 (owner): no idea and no sketch → an abstraction
                   in the artist's own hand — the popup says so */
                left.push(<span key="pt">{colTitle(32, t("Prompt:"))}</span>);
                left.push(<span key="pv" style={{ position: "absolute", left: 32, top: baseTop(y + 43, 15), width: 329, font: `italic 15px/18px ${HNW}` }}>{t("An abstraction in the artist's own style")}</span>);
                leftBottom = y + 60;
              }
              if (sketch) {
                const ty = prompt ? y : 162.8;
                left.push(<span key="st" style={{ position: "absolute", left: 32, top: baseTop(ty, 21), font: `700 21px ${HNW}`, lineHeight: "21px" }}>{t("Sketch")}</span>);
                left.push(<span key="sb">{dashBox(32, ty + 13, 329, 158, sketch)}</span>);
                leftBottom = ty + 171;
              }
            } else {
              /* ROUND 67 (owner: "the bottle is small"): the drawing's INK
                 fills only 32.6% x 68.8% of its 800x1600 JPG — sized by the
                 ink, not the canvas, so the outline itself stands 155 tall
                 like the reference (ink centred on x78.6, top at y177.6) */
              /* 2026-09-23 (owner): the bottle has its title, like the two
                 labels and the details beside it */
              left.push(
                /* eslint-disable-next-line @next/next/no-img-element */
                <img key="bt" src={bottleSrc()} alt="" style={{ position: "absolute", left: 22, top: 140, width: 112.7, height: 225.3 }} />
              );
              /* after the drawing: its JPG's white ground would cover it */
              left.push(<span key="btt">{colTitle(32, t("Bottle"))}</span>);
              leftBottom = 333;
              /* the tallest height at which BOTH labels still fit their box */
              const inW = 160 - 16, inH = 155 - 16;
              const fAr = (imgDims[selected]?.w && imgDims[selected]?.h)
                ? imgDims[selected]!.w / imgDims[selected]!.h
                : (Number(f.width) || 110) / (Number(f.height) || 80);
              const bAr = backDims.h > 1 ? backDims.w / backDims.h : fAr;
              const shared = Math.min(inH, inW / fAr, backThumb ? inW / bAr : inH);
              if (frontThumb) left.push(<span key="fl">{colTitle(137.6, t("Front Label"))}{dashBox(137.6, 177.6, 160, 155, frontThumb, shared)}</span>);
              if (backThumb) left.push(<span key="bl">{colTitle(323.7, t("Back Label"))}{dashBox(323.7, 177.6, 159, 155, backThumb, shared)}</span>);
            }
            const detX = isL ? 385.5 : 500;
            /* round 114 (owner: "in the label details list the two columns
               overlap"). The value column stood at a fixed x, so a long
               caption — "Special mention:", "Region, Country:", and every
               Georgian one — ran straight under its own value. The column
               is now MEASURED off the longest caption actually listed. */
            const capFont = `700 ${lang === "ge" ? fs - 2 : fs}px ${HNW}`;
            const capW = rows.reduce((w, [c]) => {
              const txt = t(c).endsWith(":") ? t(c) : t(c) + ":";
              return Math.max(w, textW(txt, capFont));
            }, 0);
            const detX2 = isL ? 385.5 : 500;
            const valX = Math.min(detX2 + Math.ceil(capW) + 14, detX2 + 260);
            const rowsBottom = rows.length ? 212 + (rows.length - 1) * 19.2 + 6 : 140;
            const contentBottom = Math.max(leftBottom, rowsBottom);
            const btnTop = contentBottom + (isL ? 24 : 48);
            const H2 = btnTop + 30 + 46;
            const B = { x: 350, w: 740, h: H2, y: (HEADER_H + FOOTER_Y) / 2 - H2 / 2 };
            const onCreate = () => {
              setConfirmModal("");
              if (isL) nextFromFront();
              else { confirmedAssetsSig.current = pendingAssetsSig.current; setAssetsTick((t2) => t2 + 1); }
            };
            const onEdit = () => { setConfirmModal(""); if (isL) go("vision", -1, false); else go("bottle", -1); };
            /* the guided tour stands its popup note beside this button */
            createRect.current = { x: B.x + 385.5, y: B.y + btnTop, w: B.w - 385.5, h: 30 };
            return (<>
              <div style={{ ...px(0, 0, W, H), zIndex: 40 }} onClick={closeConfirm} />
              <div style={{ ...px(0, VEIL_TOP, W, VEIL_BOT - VEIL_TOP), background: "rgba(255,255,255,0.88)", zIndex: 40, pointerEvents: "none" }} />
              <div style={{ ...px(B.x, B.y, B.w, B.h), background: "#fff", border: "1px solid #111", zIndex: 41, boxSizing: "border-box" }}>
                <span style={{ position: "absolute", left: 32, top: baseTop(52, 23), font: `700 23px ${HNW}`, lineHeight: "23px", whiteSpace: "nowrap" }}>{t("CHECK YOUR DETAILS")}</span>
                <button aria-label="close confirm" onClick={closeConfirm}
                  style={{ position: "absolute", right: 24, top: 28, ...ghost, width: 26, height: 26 }}>
                  <svg viewBox="0 0 20 20" width="20" height="20"><line x1="2" y1="2" x2="18" y2="18" stroke="#111" strokeWidth="2" /><line x1="18" y1="2" x2="2" y2="18" stroke="#111" strokeWidth="2" /></svg>
                </button>
                {dashRule(32, 120, B.w - 64, false, "cfrule")}
                {left}
                {rows.length > 0 && colTitle(detX, t(isL ? "Label Details" : "Product Details"))}
                {rows.map(([c, v, ph], i) => (
                  <span key={c}>
                    <span style={{ position: "absolute", left: detX, top: baseTop(212 + i * 19.2, 15), width: valX - detX - 8 }}>{cap(t(c).endsWith(":") ? t(c) : t(c) + ":")}</span>
                    <span style={{ position: "absolute", left: valX, top: baseTop(212 + i * 19.2, 15), width: B.w - valX - 32, display: "flex", alignItems: "center", columnGap: 6 }}>
                      {v ? val(t(v)) : <span style={{ font: `italic ${fs}px/${LH} ${HNW}`, color: "#B3B3B3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ph}</span>}
                      {v && c === "Closure Color" && (
                        <span style={{ width: 13, height: 13, background: shadeRgb(), border: "1px solid #111", flex: "0 0 auto" }} />
                      )}
                    </span>
                  </span>
                ))}
                <button onClick={onEdit}
                  style={{ position: "absolute", left: 32, top: btnTop, width: 329, height: 30, cursor: "pointer", font: `13px ${HNW}`, letterSpacing: 0.3, background: "#fff", color: "#111", border: "1px solid #111", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4, textTransform: "none" }}>
                  {t("Edit Details")}</button>
                <button onClick={onCreate}
                  style={{ position: "absolute", left: 385.5, top: btnTop, width: 328.5, height: 30, cursor: "pointer", font: `700 13px ${HNW}`, letterSpacing: 0.3, background: "#111", color: "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", columnGap: 4, paddingBottom: 4, textTransform: "none" }}>
                  <span>{t("Create")}</span></button>
              </div>
            </>);
          })()}

        </div>
      </div>
    </main>
  );
}
