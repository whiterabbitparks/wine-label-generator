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
import { UI_GE, SVG_GE, translateSvg } from "./newui-i18n";

const W = 1440, H = 823;
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
const ORDER = ["welcome", "vision", "loader", "options", "backdetails", "backdesign", "bottle", "assets", "checkout"] as const;
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
const LABEL_BASE = 788.6;      /* white station labels' baseline */
const NEXT_R = 27;             /* red round button — round 87: 20% smaller (was 34) */
const NEXT_X = 1302.86;        /* its centre on working pages … */
const WELCOME_X = 168.1;       /* … and on the welcome page */
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
  checkout: NEXT_X - NEXT_R,                     /* up to the red button */
};
/* highest station index REACHED — that dot (and earlier ones) turn red */
const STEP_OF: Record<PageKey, number> = { welcome: -1, vision: 0, loader: 0, options: 1, backdetails: 2, backdesign: 3, bottle: 4, assets: 5, checkout: 5 };

/* ROUND 63: the bar no longer eats a white strip — every page's content
   band runs to the footer edge and the bar paints on top of it. */
const BAND_BOTTOM: Record<PageKey, number> = Object.fromEntries(ORDER.map((p) => [p, FOOTER_Y])) as Record<PageKey, number>;

/* parallax strip boundaries (page-coordinate y) — each pair sits in that
   artboard's natural empty bands so the cut never crosses a text row or a
   drawn box (loader entry fades, so its entry is unused) */
const STRIP_BOUNDS: Record<PageKey, [number, number]> = {
  welcome: [360, 560], vision: [225, 460], loader: [225, 460],
  options: [225, 543], backdetails: [225, 468],
  backdesign: [165, 540], bottle: [225, 515], assets: [165, 540], checkout: [250, 500],
};

/* CONTENT-AWARE PARALLAX (owner round 16 #3): these pages slice by their
   actual content instead of three bands. Each slice is a clip rect in
   page coordinates with its own delay; mode 'fade' animates in place
   (the front size box grows during the slide instead of sliding).
   front: every input row cascades; compliance: country rows cascade;
   bottle: VERTICAL column slices, each carrying its own dashed divider. */
type Slice = { x0?: number; y0?: number; x1?: number; y1?: number; delay: number; mode?: "slide" | "fade" };
const PAGE_SLICES: Partial<Record<PageKey, Slice[]>> = {
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

const IDEAS = [
  "An old dog sleeps in the shade of a vine while the harvest happens around him",
  "Two hands passing a single grape across a wooden table",
  "A moth circling a lantern between the rows at night",
  "Grandmother's scissors, a ball of twine and one perfect grape cluster",
  "A bicycle leaning against a barrel, its basket full of grapes",
  "The village cat walking along the top of a stone wall at dusk",
  "A pair of muddy boots by the cellar door after the first rain",
  "Swallows drawing loops above the vineyard at sunset",
  "A long table set for everyone who helped with the harvest",
  "The moon reflected in a glass left out overnight",
  "A ladder disappearing into an old fruit tree",
  "Wind carrying leaves across freshly turned earth",
  "A child's drawing of the family vineyard pinned above the press",
  "One rooster supervising the sorting of grapes",
  "An accordion resting on a chair between songs",
  "The shadow of a vine leaf falling on an open notebook",
  "A wool blanket and two cups on the hood of an old truck",
  "Bees around a broken honeycomb near the vineyard fence",
  "A stack of empty baskets waiting before dawn",
  "The first snow settling on the last unpicked row",
];

/* TEMP demo fill (owner RESTORED 2026-09-07 for testing speed — switch
   off before launch): empty fields fall back to these sample texts in
   GENERATED results only; the form stays empty */
/* ROUND 86 (owner): the walkthrough plays the owner's own KORRA pack —
   exactly the fields they filled in, nothing invented */
const DEMO_FRONT: Record<string, string> = {
  producer: "Giorgi's Marani", wine: "KORRA", appellation: "",
  classification: "", vintage: "2023", grape: "Rkatsiteli",
  regionCountry: "", special: "", sweetness: "Dry",
  colour: "White", wineType: "Pet-Nat", alcohol: "12", volume: "750",
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
const TUT_LABELS = [TUT_D + "label1.jpg", TUT_D + "label2.jpg", TUT_D + "label3.jpg"];
const TUT_LIFE = [1, 2, 3, 4, 5].map((n) => `${TUT_D}life${n}.jpg`);
/* round 72 #1: the closing card sits on a BLANK page — the walkthrough
   stays on the assets page and a white sheet covers the band */
const TUT_PAGES: PageKey[] = ["vision", "options", "backdetails", "backdesign", "bottle", "assets", "assets"];
/* the black card above the arrow — copy as approved, typos fixed */
const TUT_CARDS: { step: string; title: string[]; body: string[] }[] = [
  { step: "STEP 1", title: ["Your Vision &", "Front Label Details"], body: ["Tell me what you picture,", "and the details that belong", "on your front label."] },
  { step: "STEP 2", title: ["Front Label"], body: ["Voilà — three designs to", "choose from.", "Pick your favourite."] },
  { step: "STEP 3", title: ["Back Label Details,", "Barcode & QR Code"], body: ["A few more details, and I'll", "build a back label that meets", "your market's rules."] },
  { step: "STEP 4", title: ["Back Label"], body: ["Done. Print-ready, and", "compliant with the markets", "you chose."] },
  /* round 73 #5: three lines each — a fourth line crowded the card's foot */
  { step: "STEP 5", title: ["Bottle Details"], body: ["Tell me about the bottle and", "the closure — I'll shoot it", "as it will look on the shelf."] },
  { step: "STEP 6", title: ["Marketing Assets"], body: ["Two product shots, five", "marketing images, and your", "product page if you asked."] },
  { step: "", title: ["Let's build", "your pack!"], body: [] },
];
const DEMO_VISION = "The village cat walking along the top of a stone wall at dusk";
const DEMO_DESC = "A dry, naturally sparkling pét-nat from Rkatsiteli. Pale straw with a fine, lively bead; green apple, white peach and a touch of bread crust on the nose; crisp acidity and a clean, saline finish. Bottled unfiltered, before the first fermentation ended.";
const DEMO_BACK: Record<string, string> = {
  producerCompany: '"Popiashvili Cellars" LLC', producerAddress: "#36 S. Chikovani st. 0171 Tbilisi, Georgia",
  importer: '"Teller Wines" LLC', importerAddress: "148 W 68 st. 10023 NYC, USA",
  bottlingDate: "29/04/2026", lot: "L2606142", web: "www.popiashvili.com",
};
/* round 73 #4: where the bottle step ENDS (it starts on Bordeaux / Olive
   Green / Wax Seal and is changed on camera). Round 86: KORRA's bottle —
   a clear Sparkling bottle, cork, black matte hood. */
/* round 88 #4: a Sparkling bottle offers only "Sparkling Cork" / "Crown
   Cap" — "Cork" left the ring empty */
const DEMO_BOTTLE = { type: "Sparkling", color: "Transparent", closure: "Sparkling Cork", finish: "Matte" };
const DEMO_BOTTLE_0 = { type: "Bordeaux", color: "Olive Green", closure: "Wax Seal", finish: "Matte" };
const DEMO_WHEEL = { x: 0.44, y: 0.1, rgb: [250, 27, 31] };   /* the pick; the shade drag takes it to black */
const DEMO_SHADE = 0.97;
/* round 72 #8: the ghost taps — a red ring blooms where a hand would be */
const TAP = {
  visionBox: [250, 400], width: [476, 645], height: [650, 645],
  firstField: [1060, 279],          /* round 76 #3: on "GRAND VIN" itself */
  optSelect: [720, 627],            /* round 88 #9: the Save button, column 2 */
  descBox: [250, 265], barcode: [360, 468], qrBtn: [874.5, 467],
  market: [873.5, 670], eu: [873, 330],
  backFirst: [1050, 212],            /* round 73 #1: up to the details */
  /* round 86: the variation plays on the PUNK column (KORRA's yellow →
     blue re-layout); column 3's centre is 960 + 342.9/2 */
  varBtn: [1131.45, 582], dot0: [1120.25, 516.85], dot1: [1142.25, 516.85],
  wheel: [1137.89 + 0.44 * 137.2, 368 + 0.1 * 137.2],
  bottleRings: [[386.06, 283.57], [577.98, 283.57], [769.9, 283.57], [961.82, 283.57], [1153.74, 283.57]],
} as const;
/* the bottle page's option rows and the lightness knob, from its own code:
   ring cx = COLS_X[ci] + 43.2, cy = 283.57 + row * 29.8;
   knob cx = 1144.83 + shade * 121.64 on y 532.5 */
const BRING = (ci: number, row: number) => [[342.86, 534.78, 726.7, 918.62, 1110.54][ci] + 43.2, 283.57 + row * 29.8] as [number, number];
const SHADE_X = (v: number) => 1144.83 + v * 121.64;
/* the card's own geometry, straight off the artboard */
const TB = {
  w: 191.2, bottom: 685.72, pad: 16.4, full: 171.43, short: 102.86,
  tipY: 706.31, tipW: 20.6, rule: 155.5,
};

/* round 52 #3: placeholder terms text — long enough to need the scroll */
const TERMS_TEXT = Array.from({ length: 9 }, (_, i) => (
  `${i + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.`
));

/* round 84: `id` names the label on the server — its SVG with live type
   waits there for the delivery package */
interface Dream { style: string; dream: string; preview: string | null; id?: string }

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
    if (q && (ORDER as readonly string[]).includes(q)) { pageNow.current = q as PageKey; setPage(q as PageKey); }
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
  const [flights, setFlights] = useState<{ id: number; src: string; x: number; y: number; w: number; h: number; delay: number }[]>([]);
  const flightN = useRef(0);
  const [folderBump, setFolderBump] = useState(0);
  const FOLDER_C = { x: 1275, y: 66 };
  const flyToFolder = (items: { src: string; x: number; y: number; w: number; h: number }[]) => {
    const batch = items.filter((it) => it.src).map((it, i) => ({ ...it, id: ++flightN.current, delay: i * 150 }));
    if (!batch.length) return;
    const last = batch[batch.length - 1].delay;
    setFlights((fl) => [...fl, ...batch]);
    setTimeout(() => setFolderBump((n) => n + 1), last + 760);
    setTimeout(() => setFlights((fl) => fl.filter((x) => !batch.some((b2) => b2.id === x.id))), last + 1500);
  };
  const [backSaved, setBackSaved] = useState(false);
  const [assetsSaved, setAssetsSaved] = useState(false);
  const [treeN, setTreeN] = useState(0);        /* round 88 #1: replays the tree reveal */
  const [styleView, setStyleView] = useState<number[]>([0, 0, 0]);
  const [varBusyCol, setVarBusyCol] = useState(-1);
  const STYLES3 = ["traditional", "contemporary", "punk"];
  const viewedDream = (col: number): Dream | null => {
    if (col < 0) return null;
    const v = styleView[col] || 0;
    return v === 0 ? dreams[col] || null : styleVars[col]?.[v - 1] || null;
  };
  const varT = useRef(0);
  /* ROUND 49 #2 (owner): the variations buttons never disappear — the
     FIRST run is free, every later run asks for an email once (kept in
     localStorage; real send-a-code verification needs an email provider
     and plugs in here later). emailModal holds the pending style. */
  const [varEmail, setVarEmail] = useState("");
  const [emailModal, setEmailModal] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [emailErr, setEmailErr] = useState(false);
  useEffect(() => { try { const e = localStorage.getItem("nui-var-email"); if (e) setVarEmail(e); } catch { } }, []);
  /* ROUND 50 #2 (owner): from the THIRD variations run on, generation is
     paid — a generation-credit balance (1 credit = 1 image, one run = 3)
     bought on the checkout page via a single-select top-up list. TEMP:
     Pay simply adds the credits (no real payment yet, "before IP reset"). */
  /* round 54: CREDITS — 1 credit = one 3-label run OR one assets pack */
  const GENS = [
    { name: "3 Credits", price: 2.99, gens: 3 },
    { name: "5 Credits", price: 3.99, gens: 5 },
    { name: "10 Credits", price: 7.99, gens: 10 },
    { name: "100 Credits", price: 69.99, gens: 100 },
  ];
  const [gensMode, setGensMode] = useState(false);
  /* ROUND 54 #2: pre-generation confirmation popups — a run starts only
     after the customer reviews everything that shapes the result */
  const [confirmModal, setConfirmModal] = useState<"" | "labels" | "assets">("");
  const [assetsTick, setAssetsTick] = useState(0);
  const pendingAssetsSig = useRef("");
  const confirmedAssetsSig = useRef("");
  /* round 52 #3: Terms & Conditions modal with the house-style scroll */
  const [termsOpen, setTermsOpen] = useState(false);
  const [termsPos, setTermsPos] = useState(0);
  const termsRef = useRef<HTMLDivElement | null>(null);
  const [gensSel, setGensSel] = useState(0);
  const [genCredits, setGenCredits] = useState(0);
  /* ROUND 56 #7 (owner): every visitor STARTS with 3 credits; every
     generation (labels run, variations run, assets pack, more
     variations) costs 1. At zero: no email yet → the mailing-list gift
     modal (+1); email known → the CREDITS purchase page. */
  /* round 57 #1 (owner): every browser refresh starts the balance over */
  useEffect(() => { setGenCredits(5); }, []);
  const saveCredits = (n: number) => setGenCredits(n);
  const gensReturn = useRef<PageKey>("options");
  /* round 56 #8: the mailing-list gift spins the indicator like a slot
     machine up to the new balance */
  const [spinning, setSpinning] = useState(false);
  const [spinDigit, setSpinDigit] = useState(0);
  const grantCredit = (n: number) => {
    saveCredits(genCredits + n);
    setSpinning(true);
    let k = 0;
    const iv = setInterval(() => {
      k++; setSpinDigit(Math.floor(Math.random() * 10));
      if (k > 13) { clearInterval(iv); setSpinning(false); }
    }, 65);
  };
  /* ONE gate for every paid action: spends a credit or routes to the
     gift modal / purchase page. Returns true when the action may run. */
  const requestCredit = (from: PageKey, cost = 1): boolean => {
    /* round 62 #3: 1 credit = 1 label — the initial 3-label run costs 3 */
    if (genCredits >= cost) { saveCredits(genCredits - cost); return true; }
    if (!varEmail) { setEmailInput(""); setEmailErr(false); setEmailModal("gift"); return false; }
    gensReturn.current = from; setGensMode(true); setGensSel(0); go("checkout");
    return false;
  };
  /* round 56 #3 (owner, TEMP DEV TOOL — remove before launch): the
     footer switch fakes every generation with already-made images */
  const [liveGen, setLiveGen] = useState(true);
  const liveGenRef = useRef(true);
  useEffect(() => { try { if (localStorage.getItem("nui-live-gen") === "0") { setLiveGen(false); liveGenRef.current = false; } } catch { } }, []);
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
  const ASSET_STAGES = ["front shot", "back shot", "lifestyle 1/4", "lifestyle 2/4", "lifestyle 3/4", "lifestyle 4/4"];
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
  useEffect(() => { if (page === "checkout") setTreeN((n) => n + 1); }, [page]);
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
    if (sig !== assetsSig && confirmedAssetsSig.current !== sig) {
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
            bottle: { type: bottle.type, color: bottle.color, closure: bottle.closure, finish: bottle.finish, closureColour: shadeRgb() },
            wine: { colour: wineColor || f.colour || DEMO_FRONT.colour, name: f.wine || DEMO_FRONT.wine },
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
  const swapHero = (slotIdx: number) => setLifeOrder((o) => {
    const n = [...o]; [n[0], n[slotIdx]] = [n[slotIdx], n[0]]; return n;
  });
  const moreRunning = useRef(false);
  async function moreVariations() {
    if (assetsRunning.current || moreRunning.current || assetsStage) return;
    const sel = customLabel ? { style: "contemporary", dream: customLabel, preview: null as string | null } : viewedDream(selected);
    if (!sel) return;
    if (!requestCredit("assets")) return;
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
            front: sel.dream, back: null,
            bottle: { type: bottle.type, color: bottle.color, closure: bottle.closure, finish: bottle.finish, closureColour: shadeRgb() },
            wine: { colour: wineColor || f.colour || DEMO_FRONT.colour, name: f.wine || DEMO_FRONT.wine },
            labelMM: customLabel ? customDims : { w: Number(f.width) || 110, h: Number(f.height) || 80 },
            style: sel.style, seed, lifeOnly: true, batch,
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
  const [boards, setBoards] = useState<Record<string, string>>({});
  const [boardsGe, setBoardsGe] = useState<Record<string, string>>({});
  useEffect(() => {
    /* inline the artboards: SVG-in-<img> cannot use page fonts (the
       owner's Safari font complaint) — inline SVG can */
    ORDER.forEach((p) => {
      fetch(`/newui/${p}.svg`).then((r) => r.text()).then((t) =>
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
            .replace("incorporate all required regulatory information", "incorporate required regulatory information");
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
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const st = (e.state || {}) as { page?: string };
      const target = st.page && (ORDER as readonly string[]).includes(st.page) ? (st.page as PageKey) : "welcome";
      if (target === pageNow.current) return;
      setGensMode(false);
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
    new Image().src = TUT_D + "back-label.png";
    go("vision");
  }, [go, tutReset]);

  const endTutorial = useCallback(() => {
    tutTok.current++;
    tutRef.current = -1; setTut(-1);
    tutReset(); setRipple(null); setCursor(null); setTutLanding(false);
    /* round 72 #2: straight into the real Your Vision page, not the home
       page — they have just watched the whole story, so they start work */
    go("vision");
  }, [go, tutReset]);

  useEffect(() => {
    if (tut < 0) return;
    const tok = ++tutTok.current;
    const live = () => tok === tutTok.current;
    /* round 88 #3 (owner: "feels rushed"): every pause runs at 1.45× */
    const TUT_PACE = 1.45;
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
        setDreams(["traditional", "contemporary", "punk"].map((st2, i) => ({ style: st2, dream: TUT_LABELS[i], preview: TUT_LABELS[i] })));
        setSelected(1);
      }
      if (tut > 2) {
        setB({ description: DEMO_DESC, ...DEMO_BACK });
        setGtin("4860012345676"); setQrMode("create"); setMarkets(["EU"]); setNoComp(false);
      }
      /* round 72 #12: the back label is set the instant the step begins —
         the image is preloaded when the walkthrough starts, so its empty
         "not yet created" slot is never on screen */
      if (tut >= 3) {
        const pr = new Image();
        pr.onload = () => { setBackDims({ w: pr.width, h: pr.height }); setBackPng(pr.src); };
        pr.src = TUT_D + "back-label.png";
      }
      if (tut > 4) {
        bottleTouched.current = true; setBottle({ ...DEMO_BOTTLE }); setWineColor("White");
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
          front: { full: TUT_D + "shot-front.jpg", prev: TUT_D + "shot-front.jpg" },
          back: { full: TUT_D + "shot-back.jpg", prev: TUT_D + "shot-back.jpg" },
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
          if (!(await type("120", (v) => setF((m) => ({ ...m, width: v })), 150))) return;
          if (!(await hold(260))) return;
          if (!(await tap(TAP.height, 300))) return;
          if (!(await type("95", (v) => setF((m) => ({ ...m, height: v })), 150))) return;
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
          for (const g of [0.2, 0.45, 0.68, 0.88, 0.97]) {
            setGenProgress(g);
            if (!(await hold(420))) return;
          }
          if (!(await hold(260))) return;
          setDreams(["traditional", "contemporary", "punk"].map((st2, i) => ({ style: st2, dream: TUT_LABELS[i], preview: TUT_LABELS[i] })));
          go("options");
          setGenProgress(0);
          if (!(await hold(SLIDE_MS + 1200))) return;
          /* round 89 #1 (owner): no variation play — the pointer goes
             straight to Save on the favourite, and the label flies into
             the folder (round 73 #7's re-roll demo retired) */
          /* not saveFront(): this closure was made before the demo labels
             existed, so its `dreams` is empty — set and fly directly (the
             sample labels are 1024×683 → 342.9×228.6 in column 2) */
          if (!(await tap(TAP.optSelect, 200, 520, () => { setSelected(1); flyToFolder([{ src: TUT_LABELS[1], x: 548.5, y: 240, w: 342.9, h: 228.6 }]); }))) return;
          if (!(await hold(1900))) return;
          break;
        }
        case 2: {
          if (!(await tap(TAP.descBox))) return;
          if (!(await type(DEMO_DESC, (v) => setB((m) => ({ ...m, description: v })), 8))) return;
          if (!(await hold(320))) return;
          if (!(await tap(TAP.barcode, 300))) return;
          if (!(await type("4860012345676", setGtin, 55))) return;
          if (!(await hold(240))) return;
          if (!(await tap(TAP.qrBtn, 300, 520, () => setQrMode("create")))) return;
          if (!(await beat(560))) return;
          /* round 73 #1: up to the details column, and a click, before a
             single character of it is typed */
          if (!(await tap(TAP.backFirst, 340, 620))) return;
          for (const k of ["producerCompany", "producerAddress", "importer", "importerAddress", "bottlingDate", "lot", "web"]) {
            if (!(await backField(k, DEMO_BACK[k]))) return;
            if (!(await hold(80))) return;
          }
          /* the market picker opens, takes its pick and closes again */
          if (!(await hold(360))) return;
          if (!(await tap(TAP.market, 320, 520, () => setMarketOpen(true)))) return;
          if (!(await hold(800))) return;
          if (!(await tap(TAP.eu, 320, 520, () => { setMarkets(["EU"]); setNoComp(false); }))) return;
          if (!(await hold(700))) return;
          if (!(await tap(TAP.market, 320, 520, () => setMarketOpen(false)))) return;
          break;
        }
        case 3: {
          /* round 72 #12: seed() already put it there — nothing to play */
          break;
        }
        case 4: {
          /* round 73 #4: it opens already filled in — only the changes play */
          bottleTouched.current = true;
          setWineColor("White"); setBottle({ ...DEMO_BOTTLE_0 });
          setWheel({ x: 0.5, y: 0.5, rgb: [255, 255, 255] }); setShade(0.5);
          /* ROUND 73 #4 (owner's exact order): the page OPENS already set
             to White / Bordeaux / Olive Green / Wax Seal / Matte. The
             pointer then changes the bottle type, the glass colour and the
             closure, picks a colour off the wheel and finally darkens it
             (round 86: to KORRA's clear Sparkling bottle, cork, black hood). */
          if (!(await beat(700))) return;
          /* Bordeaux -> Sparkling */
          if (!(await tap(BRING(1, 3), 560, 520, () => setBottle((m) => ({ ...m, type: "Sparkling" }))))) return;
          if (!(await beat(620))) return;
          /* Olive Green -> Transparent */
          if (!(await tap(BRING(2, 1), 480, 520, () => setBottle((m) => ({ ...m, color: "Transparent" }))))) return;
          if (!(await beat(620))) return;
          /* Wax Seal -> Sparkling Cork (row 0 of the sparkling list) */
          if (!(await tap(BRING(3, 0), 480, 520, () => setBottle((m) => ({ ...m, closure: "Sparkling Cork" }))))) return;
          if (!(await beat(680))) return;
          /* the hood's colour, then down to black */
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
          if (!(await hold(1500))) return;
          setAssets((a) => ({ ...a, front: { full: TUT_D + "shot-front.jpg", prev: TUT_D + "shot-front.jpg" } }));
          setAssetsStage("back shot");
          if (!(await hold(1200))) return;
          setAssets((a) => ({ ...a, back: { full: TUT_D + "shot-back.jpg", prev: TUT_D + "shot-back.jpg" } }));
          for (let i = 0; i < 5; i++) {
            setAssetsStage(`lifestyle ${i + 1}/5`);
            if (!(await beat(900))) return;
            setAssets((a) => { const life = [...a.life]; life[i] = { full: TUT_LIFE[i], prev: TUT_LIFE[i] }; return { ...a, life }; });
          }
          /* round 72 #14: only now does the product page get published */
          setAssetsStage("publishing");
          if (!(await hold(1400))) return;
          setTutLanding(true);
          setAssetsStage("");
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
      if (!live()) return;
      if (tut >= TUT_CARDS.length - 1) { setNudge((n) => n + 1); return; }
      if (!(await hold(1900))) return;
      setPressed((n) => n + 1);
      if (!(await hold(260))) return;
      const nx = tut + 1;
      setTut(nx);
      const pg: PageKey = nx === 1 ? "loader" : TUT_PAGES[nx];
      if (pg !== page) go(pg);
    })();
    return () => { /* the token bump in the next run cancels this one */ };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tut]);

  const sigFront = () => JSON.stringify({ vision, sketch: !!sketch, f });
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
    const { data, aspectKey, width, height } = buildDreamPayload();
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
     — no model call, so no credit (round 56 #7's gate is lifted here) */
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
    const CUBE = 34.3, AREA_TOP = 240, AREA_BOT = 519;
    let lw: number, lh: number;
    if (ar >= 1) { lw = OPT_W; lh = OPT_W / ar; if (lh > AREA_BOT - AREA_TOP) { lh = AREA_BOT - AREA_TOP; lw = lh * ar; } }
    else { lh = AREA_BOT - AREA_TOP; lw = lh * ar; if (lw > OPT_W - 2 * CUBE) { lw = OPT_W - 2 * CUBE; lh = lw / ar; } }
    return { lx: OPT_FRAMES[fi].x + (OPT_W - lw) / 2, ly: AREA_TOP + (ar >= 1 ? 0 : (AREA_BOT - AREA_TOP - lh) / 2), lw, lh };
  };
  /* ROUND 88 #9 (owner): "Select" became SAVE — a black button under the
     variations; saving marks the column and flies the label into the folder */
  const saveFront = (fi: number) => {
    if (!dreams[fi]) return;
    setSelected(fi); setWarn("");
    const dv = viewedDream(fi);
    const g = optGeom(fi);
    if (dv) flyToFolder([{ src: dv.preview || dv.dream, x: g.lx, y: g.ly, w: g.lw, h: g.lh }]);
  };
  /* round 52 #1 (owner: "it let me download without agreeing!"):
     every pay path checks the T&C ring first */
  const requireAgree = () => {
    if (agree) return true;
    setWarn(t("Agree to the Terms & Conditions to continue"));
    setTimeout(() => setWarn(""), 3200);
    return false;
  };
  /* TEMP (owner, "before IP reset"): Pay just adds the credits; if a
     style click brought us here, that run fires right away (minus its 3) */
  const payForGenerations = () => {
    /* ROUND 51 #4 (owner): buying does NOT auto-generate — back to
       where they came from; they press the button themselves */
    saveCredits(genCredits + GENS[gensSel].gens);
    setGensMode(false);
    go(gensReturn.current || "options", -1);
  };
  const submitVarEmail = () => {
    const e = emailInput.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) { setEmailErr(true); return; }
    setVarEmail(e); try { localStorage.setItem("nui-var-email", e); } catch { }
    setEmailModal("");
    /* round 56 #8: the gift button NEVER generates — it grants the
       credit and the indicator rolls up like a slot machine */
    grantCredit(1);
  };

  async function nextFromFront() {
    /* owner #14: regenerate ONLY when inputs changed */
    if (dreams.length && frontSig === sigFront()) { go("options"); return; }
    go("loader");
    setGenProgress(0);
    const genT0 = Date.now();   /* round 46: feed the loader's REAL average */
    /* round 84: ONE payload builder — this copy still carried the demo
       fallback that round 78 removed from buildDreamPayload */
    const { data, aspectKey, width, height } = buildDreamPayload();
    const one = async (style: string): Promise<Dream> => {
      /* round 56 #3 (TEMP dev switch): fake the run with existing art */
      if (!liveGenRef.current) {
        await sleep(500);
        setGenProgress((p) => p + 1 / 3);
        const d0 = dreams.find(Boolean);
        return { style, dream: d0?.dream || FAKE_IMG, preview: d0?.preview || FAKE_IMG };
      }
      const r = await fetch("/api/dream-label", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vision, style, data, sketch, aspect: aspectKey, width, height }),
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
          if (m.type === "result") res = m;
          else if (m.type === "error") throw new Error(m.error);
        }
      }
      setGenProgress((p) => p + 1 / 3);
      return { style, dream: res.dream || "", preview: res.preview || null, id: res.id };
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
      setDreams(ok); setSelected(-1); setFrontSig(sigFront()); setBackSig("");
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
  const dashedBox = (x: number, y: number, w: number, h: number, key?: string) => (
    <svg key={key} style={{ ...px(x - 1, y - 1, w + 2, h + 2), pointerEvents: "none", overflow: "visible" }} viewBox={`0 0 ${w + 2} ${h + 2}`}>
      <rect x="1.5" y="1.5" width={w - 1} height={h - 1} fill="none" stroke="#000" strokeWidth="1" strokeDasharray="4.12 4.12" shapeRendering="crispEdges" />
    </svg>
  );
  /* ROUND 85 #2 (owner, fourth time: "FIX THE DOTS INSIDE THE CIRCLES"):
     a CSS dot centred with translate(-50%,-50%) inside a CSS ring rounds
     to the pixel grid separately from the ring, so at most page scales the
     dot sat a hair off. Two SVG circles on the SAME centre cannot drift —
     the renderer places both from one fractional point. */
  /* one dashed hairline (round 85 #7): same pattern, same crisp pixel row */
  const dashRule = (x: number, y: number, len: number, vertical = false, key?: string, color = "#000") => (
    <svg key={key} style={{ ...px(x, y, vertical ? 1 : len, vertical ? len : 1), pointerEvents: "none", overflow: "visible" }} viewBox={`0 0 ${vertical ? 1 : len} ${vertical ? len : 1}`}>
      <line x1={vertical ? 0.5 : 0} y1={vertical ? 0 : 0.5} x2={vertical ? 0.5 : len} y2={vertical ? len : 0.5} stroke={color} strokeWidth="1" strokeDasharray="4.12 4.12" shapeRendering="crispEdges" />
    </svg>
  );
  const ringSvg = (size: number, on: boolean, o?: { stroke?: number; color?: string; dot?: number; noRing?: boolean }) => {
    const sw = o?.stroke ?? 2, col = o?.color || "#111", dot = o?.dot ?? size / 2;
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", flex: "0 0 auto" }}>
        {!o?.noRing && <circle cx={size / 2} cy={size / 2} r={(size - sw) / 2} fill="#fff" stroke={col} strokeWidth={sw} />}
        {on && <circle cx={size / 2} cy={size / 2} r={dot / 2} fill={col} />}
      </svg>
    );
  };
  /* owner #15 / round 7 #2: input text italic (design st16); the underline is
     a SEPARATE fixed-length row line, not text-decoration */
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

  const OPT_FRAMES = [{ x: 137.1 }, { x: 548.5 }, { x: 960 }];
  const OPT_TOP = 240, OPT_BOT = 468.6, OPT_W = 342.9;
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

  /* inSlide = rendered inside a moving slide layer (inert, entry
     animations suppressed — the slide itself is the entry) */
  const renderOverlay = (p: PageKey, inSlide = false) => {
    switch (p) {
      case "welcome":
        /* ROUND 63: the start action is the red round button on the bar */
        return patch(118, 658, 70, 54, "welarrow");

      case "vision": {
        /* ROUND 63 (owner's "Your Vision@3x" mock, measured off the 3x
           artboard): YOUR VISION and FRONT LABEL DETAILS share one page,
           split by a dashed column rule at x788. Everything is drawn live
           — the old baked board is covered wholesale. */
        const BOX = { x: 136, y: 342, w: 551, h: 207 };
        const words = vision.trim() ? vision.trim().split(/\s+/).length : 0;
        return (<>
          {patch(0, HEADER_H, W, FOOTER_Y - HEADER_H, "viswipe")}
          {/* ── left: the vision ── */}
          <span style={{ ...px(137.14, baseTop(149.08, 24), 600, 24), font: `700 24px ${HNW}`, lineHeight: "24px", color: "#111", whiteSpace: "nowrap" }}>{t("YOUR VISION")}</span>
          <span style={{ ...px(137.14, baseTop(183, 14), 600, 40), font: `italic 14px ${HNW}`, lineHeight: "18px", color: "#111" }}>
            {t("If you have a specific idea for the front label, describe it in simple words")}<br />
            {t("or upload a sketch or photo reference. Or, let us suggest ideas for you.")}
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
          <textarea value={vision} onChange={(e) => setVision(e.target.value)} maxLength={2200}
            style={{ ...px(BOX.x + 14, BOX.y + 12, BOX.w - 28, BOX.h - 40), ...inputStyle, fontStyle: "normal", fontSize: 14, textDecoration: "none", resize: "none", lineHeight: 1.5, overflow: "auto", background: "transparent", padding: 0 }} />
          <span style={{ ...px(BOX.x + BOX.w - 174, baseTop(BOX.y + BOX.h - 13, 11), 160, 14), font: `11px ${HNW}`, lineHeight: "11px", color: "#8a8a8a", textAlign: "right" }}>{words} / 300 {t("words")}</span>
          <div style={{ position: "absolute", right: W - 686.8, top: baseTop(650.8, 14), display: "flex", alignItems: "baseline" }}>
            {([["Label Width:", "width"], ["Label Height:", "height"]] as const).map(([cap, key2], gi) => (
              <span key={key2} style={{ display: "flex", alignItems: "baseline", marginLeft: gi ? 28 : 0 }}>
                <span style={{ font: `700 14px ${HNW}`, lineHeight: "14px" }}>{t(cap)}</span>
                <input value={f[key2]} onChange={(e) => setF((m) => ({ ...m, [key2]: e.target.value.replace(/[^\d.]/g, "") }))}
                  style={{ width: Math.max(1, (f[key2] || "").length) * 8.2 + 4, font: `italic 14px ${HNW}`, lineHeight: "14px", border: "none", borderBottom: "1px solid #111", outline: "none", background: "transparent", padding: 0, textAlign: "center", marginLeft: 4 }} />
                <span style={{ font: `italic 14px ${HNW}`, lineHeight: "14px", marginLeft: 4 }}>{t("mm")}</span>
              </span>
            ))}
          </div>
          {/* the dashed column rule */}
          {dashRule(788, 133, 522, true, "vrule")}
          {/* ── right: the label's own details ── */}
          <span style={{ ...px(891.8, baseTop(149.08, 24), 500, 24), font: `700 24px ${HNW}`, lineHeight: "24px", color: "#111", whiteSpace: "nowrap" }}>{t("FRONT LABEL DETAILS")}</span>
          <span style={{ ...px(891.8, baseTop(183, 14), 400, 40), font: `italic 14px ${HNW}`, lineHeight: "18px", color: "#111" }}>
            {t("Feel free to leave out fields you don't want on your front label.")}</span>
          {FRONT_ROWS.map((k2, i) => {
            const base = 284.5 + i * 30;
            return (
              <span key={k2}>
                <span style={{ ...px(891.8, baseTop(base, 14), 130, 14), font: `700 ${lang === "ge" ? 13 : 14}px ${HNW}`, lineHeight: "14px", color: "#111", whiteSpace: "nowrap" }}>{t(FRONT_LABELS[i])}</span>
                <input value={f[k2] || ""} placeholder={t(FRONT_PH[i])}
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
        const CUBE = 34.3, AREA_TOP = 240, AREA_BOT = 519;
        const STYLE_NAMES = ["Traditional", "Contemporary", "Punk"];
        const anyVars = styleVars.some((v) => v.length > 0);
        return (<>
          {covers}
          {patch(135, 164, 1170, 26, "stynames")}
          {!anyVars && (
            <span style={{ ...px(136.97, 183.62 - 15.5, 500, 20), font: `15px ${HNW}`, color: "#111", lineHeight: "20px" }}>
              {t("Variations are limited, so choose wisely.")}</span>
          )}
          {OPT_FRAMES.map((fr, fi) => {
            const orig = dreams[fi];
            if (!orig?.preview && !orig?.dream) return null;
            const dv = viewedDream(fi);
            const nat = imgDims[fi];
            const ar = nat ? nat.w / nat.h : (Number(f.width) || 110) / (Number(f.height) || 80);
            let lw: number, lh: number;
            if (ar >= 1) { lw = OPT_W; lh = OPT_W / ar; if (lh > AREA_BOT - AREA_TOP) { lh = AREA_BOT - AREA_TOP; lw = lh * ar; } }
            else { lh = AREA_BOT - AREA_TOP; lw = lh * ar; if (lw > OPT_W - 2 * CUBE) { lw = OPT_W - 2 * CUBE; lh = lw / ar; } }
            const lx = fr.x + (OPT_W - lw) / 2;
            const ly = AREA_TOP + (ar >= 1 ? 0 : (AREA_BOT - AREA_TOP - lh) / 2);
            const nDots = 1 + (styleVars[fi]?.length || 0);
            return (
              <div key={fi}>
                {dv ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={dv.preview || dv.dream} alt={orig.style} onClick={() => { setSelected(fi); setWarn(""); }}
                    style={{ ...px(lx, ly, lw, lh), cursor: "pointer", objectFit: "fill" }} />
                ) : (
                  /* a variation is being born — label-shaped loader */
                  <div style={{ ...px(lx, ly, lw, lh), background: "#F4F3EE", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {/* round 86 #3: a re-layout takes seconds, not a minute */}
                    {miniGlass("var" + fi, Math.min(0.9, 0.2 + ((Date.now() - varT.current) / 6000) * 0.7 + tick * 0))}
                  </div>
                )}
                {/* ROUND 85 #6 (owner's board): the selection frame stands
                    OFF the label — 10px out on every side — and the corner
                    crosses sit on the frame's corners, not the label's */}
                {selected === fi && dashedBox(lx - 10, ly - 10, lw + 20, lh + 20, "selD" + fi)}
                {cross(lx - 10, ly - 10, `tl${fi}`)}{cross(lx + lw + 10, ly - 10, `tr${fi}`)}
                {cross(lx - 10, ly + lh + 10, `bl${fi}`)}{cross(lx + lw + 10, ly + lh + 10, `br${fi}`)}
                {/* the column's dot switcher, centered to the label — round
                    88 #9: up to two rows of 15, the rows centred on the
                    midline between label and button */}
                {nDots > 1 && Array.from({ length: nDots }, (_, k) => {
                  const rows = Math.ceil(nDots / DOTS_PER_ROW), row = Math.floor(k / DOTS_PER_ROW), col = k % DOTS_PER_ROW;
                  const inRow = Math.min(nDots - row * DOTS_PER_ROW, DOTS_PER_ROW);
                  const dx = lx + lw / 2 + (col - (inRow - 1) / 2) * 22 - 9;
                  const dy = (ly + lh + 565) / 2 - 9 + (row - (rows - 1) / 2) * 17;
                  return (
                  <button key={"vd" + fi + k} onClick={() => setStyleView((p) => { const n = [...p]; n[fi] = k; return n; })}
                    aria-label={`view ${fi}-${k}`}
                    style={{ ...px(dx, dy, 18, 18), ...ghost }}>
                    <svg width="18" height="18" viewBox="0 0 18 18" style={{ position: "absolute", left: 0, top: 0, display: "block" }}>
                      <circle cx="9" cy="9" r="4" fill={(styleView[fi] || 0) === k ? "#111" : "#fff"} stroke="#111" strokeWidth="1" />
                    </svg>
                  </button>
                  );
                })}
              </div>
            );
          })}
          {dreams.length === 0 && OPT_FRAMES.map((fr, i) =>
            notMade(fr.x, OPT_TOP, OPT_W, OPT_BOT - OPT_TOP, "front", "nmopt" + i))}
          {/* ROUND 53 #8: a bar-jump before generation shows the REAL page
              furniture, deactivated and grey */}
          {dreams.length === 0 && OPT_FRAMES.map((fr, fi) => (
            <span key={"grey" + fi}>
              <div style={{ ...px(fr.x + 0.2, 565, OPT_W, 34.3), background: "#ECECEA", color: "#B3B1A8", font: `12px ${HNW}`, letterSpacing: 0.3, display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4 }}>
                {t(STYLE_NAMES[fi] + " Variation")}</div>
              <div style={{ ...px(fr.x + 0.2, 610, OPT_W, 34.3), background: "#ECECEA", color: "#B3B1A8", font: `12px ${HNW}`, letterSpacing: 0.3, display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4 }}>
                {t("Save")}</div>
            </span>
          ))}
          {/* the buttons live on every state (round 51 #4); round 88 #9: the
              variations button greys out once its two rows of dots are full */}
          {dreams.length > 0 && OPT_FRAMES.map((fr, fi) => {
            const full = (styleVars[fi]?.length || 0) >= MAX_VARS;
            return (
              <button key={"cv" + fi} onClick={() => requestVariations(fi)} disabled={full}
                style={{ ...px(fr.x + 0.2, 565, OPT_W, 34.3), cursor: full ? "default" : "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: full ? "#ECECEA" : "#111", color: full ? "#B3B1A8" : "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4, transition: `background 240ms ${EASE}` }}>
                {t(STYLE_NAMES[fi] + " Variation")}</button>
            );
          })}
          {/* ROUND 88 #9 (owner): SAVE — a black button under the variations,
              in place of the "Select" ring; it marks the column and flies the
              label into the folder */}
          {dreams.length > 0 && OPT_FRAMES.map((fr, fi) => {
            const on = selected === fi;
            return (
              <button key={"sv" + fi} onClick={() => saveFront(fi)}
                style={{ ...px(fr.x + 0.2, 610, OPT_W, 34.3), cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: on ? "#fff" : "#111", color: "#111", border: "1px solid #111", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4, transition: `background 240ms ${EASE}, color 240ms ${EASE}`, ...(on ? {} : { color: "#fff" }) }}>
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
          <textarea value={b.description || ""}
            onChange={(e) => setB((m) => ({ ...m, description: e.target.value }))}
            style={{ ...px(BOX.x + 17, BOX.y + 16, BOX.w - 34, BOX.h - 48), ...inputStyle, fontStyle: "normal", textDecoration: "none", fontSize: 14, resize: "none", lineHeight: 1.45, overflow: "auto", background: "transparent", padding: 0 }} />
          <span style={{ ...px(BOX.x + BOX.w - 174, baseTop(BOX.y + BOX.h - 11, 11), 160, 14), font: `11px ${HNW}`, lineHeight: "11px", color: "#8a8a8a", textAlign: "right" }}>{dwords} / 300 {t("words")}</span>
          {/* ── right: the regulated fields ── */}
          {BACK_ROWS.map((k, i) => {
            const base = 215.6 + i * 32;
            return (
              <span key={k}>
                <span style={{ ...px(755.5, baseTop(base, 14), 230, 14), font: `700 ${lang === "ge" ? 13 : 14}px ${HNW}`, lineHeight: "14px", color: "#111", whiteSpace: "nowrap" }}>{t(BACK_LABELS[i])}</span>
                <input value={b[k] || ""} placeholder={t(BACK_PH[i])}
                  onChange={(e) => setB((m) => ({ ...m, [k]: e.target.value }))}
                  style={{ ...px(989, base - IN_BASE * (14 / 15) - 2, 311, 20), ...inputStyle, fontSize: 14 }} />
                {rowLine(990, base + 2.5, 1302.86 - 990, `bln${i}`)}
              </span>
            );
          })}
          {/* ── barcode (ROUND 27's honest GTIN, in the mock's button row) ── */}
          <span style={{ ...px(139, baseTop(472, 14), 112, 14), font: `700 14px ${HNW}`, lineHeight: "14px" }}>{t("Barcode:")}</span>
          <input value={gtin} onChange={(e) => setGtin(e.target.value)} placeholder="E.g. 4860012345676"
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
          <span style={{ ...px(lang === "ge" ? 139 : 446.2, baseTop(lang === "ge" ? 700.34 : 661.23, 14), lang === "ge" ? 560 : 270, 60), font: `14px ${HNW}`, lineHeight: "18px", color: "#111" }}>
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
            const ring = (on: boolean) => (
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", width: 11, height: 11 }}>
                {ringSvg(11, on, { stroke: 1.4, dot: 5.5 })}
              </span>
            );
            return (<>
              <button onClick={() => setMarketOpen((o) => !o)}
                /* while the panel is open the button rides ABOVE its
                   click-blocker, so pressing it closes the menu */
                style={{ ...px(MB.x, MB.y, MB.w, MB.h), background: dark ? "#111" : "#fff", border: "1px solid #111", cursor: "pointer", padding: 0, textTransform: "none", boxSizing: "border-box", transition: `all 240ms ${EASE}`, zIndex: marketOpen ? 13 : undefined }}>
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
                <div style={{ ...px(MB.x, MB.y - panelH, MB.w, panelH), background: "#fff", border: "1px solid #111", boxSizing: "border-box", zIndex: 13, padding: `${PAD}px 0` }}>
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
        return (<>
          {/* cover baked mock + its corner crosses + Edit/magnifier row */}
          {patch(BD_AREA.x - 12, BD_AREA.y - 12, BD_AREA.w + 24, BD_AREA.h + 24, "bdmock")}
          {patch(546, 546, 350, 40, "bdrow")}
          {!backPng && (<>
            {notMade(BD_AREA.x, BD_AREA.y, BD_AREA.w, BD_AREA.h, "back", "nmbd")}
            {/* round 53 #8: deactivated grey furniture on the empty page */}
            <div style={{ position: "absolute", left: BD_AREA.x, top: 559, width: BD_AREA.w, display: "flex", justifyContent: "center", alignItems: "baseline", columnGap: 24, pointerEvents: "none" }}>
              {(["Width:", "Height:"] as const).map((cap) => (
                <span key={cap} style={{ display: "flex", alignItems: "baseline" }}>
                  <span style={{ font: `700 14px ${HNW}`, lineHeight: "15px", color: "#C9C7BF" }}>{t(cap)}</span>
                  <span style={{ font: `italic 14px ${HNW}`, lineHeight: "15px", marginLeft: 4, color: "#C9C7BF" }}>— {t("mm")}</span>
                </span>
              ))}
            </div>
            <div style={{ ...px(548.6, 589, 341.4, 34.3), background: "#ECECEA", color: "#B3B1A8", font: `12px ${HNW}`, letterSpacing: 0.3, display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4 }}>{t("Edit")}</div>
          </>)}
          {backPng && (<>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={backPng} alt="back label"
              style={{ ...px(lx, ly, fit.w, fit.h), objectFit: "fill" }} />
            {/* round 88 #8: the frame stands 10px off the label, crosses on its corners */}
            {cross(lx - 10, ly - 10, "b1")}{cross(lx + fit.w + 10, ly - 10, "b2")}{cross(lx - 10, ly + fit.h + 10, "b3")}{cross(lx + fit.w + 10, ly + fit.h + 10, "b4")}
            {dashedBox(lx - 10, ly - 10, fit.w + 20, fit.h + 20, "bdD")}
            <button onClick={() => go("backdetails", -1)}
              style={{ ...px(548.6, 589, 341.4, 34.3), cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: "#111", color: "#fff", border: "1px solid #111", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4 }}>{t("Edit")}</button>
            {/* round 88 #7 (owner): SAVE under Edit — flies the back label into the folder */}
            <button onClick={() => { setBackSaved(true); flyToFolder([{ src: backPng, x: lx, y: ly, w: fit.w, h: fit.h }]); }}
              style={{ ...px(548.6, 633.3, 341.4, 34.3), cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: backSaved ? "#fff" : "#111", color: backSaved ? "#111" : "#fff", border: "1px solid #111", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4, transition: `background 240ms ${EASE}, color 240ms ${EASE}` }}>{backSaved ? t("Saved") : t("Save")}</button>
            {/* ROUND 51 #7/#8 (owner): informational size caption — same
                type as the front page's Width/Height, no input, no
                underline, centered between the label and Edit. The width
                falls out of the composed PNG's aspect and rounds to 5mm;
                the height is the customer's own front-label height. */}
            {(() => {
              const hmm = Number(f.height) || 80;
              const wmm = Math.round((hmm * (backDims.w / backDims.h)) / 5) * 5;
              const yMid = (ly + fit.h + 589) / 2;
              return (
                <div style={{ position: "absolute", left: BD_AREA.x, top: yMid - 7.5, width: BD_AREA.w, display: "flex", justifyContent: "center", alignItems: "baseline", columnGap: 24, pointerEvents: "none" }}>
                  {([["Width:", wmm], ["Height:", hmm]] as const).map(([cap, v]) => (
                    <span key={cap} style={{ display: "flex", alignItems: "baseline" }}>
                      <span style={{ font: `700 14px ${HNW}`, lineHeight: "15px" }}>{t(cap)}</span>
                      <span style={{ font: `italic 14px ${HNW}`, lineHeight: "15px", marginLeft: 4 }}>{v} {t("mm")}</span>
                    </span>
                  ))}
                </div>
              );
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
          {/* wipe the baked column content (frame lines stay) */}
          {patch(344.4, 173.3, 956.5, 408.5, "bzone")}
          {/* live dividers + thin crosses at the new column boundaries */}
          {COLS_X.slice(1).map((dx, i) => (
            <span key={"dv" + i}>
              {dashRule(dx, 171.71, 411.43, true, "bdrule")}
              {cross(dx, 171.77, "dvt" + i)}{cross(dx, 583.41, "dvb" + i)}
            </span>
          ))}
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
          {/* round 12 #3: corner pluses back ON TOP of the photo */}
          {cross(137.14, 172, "bt1")}{cross(342.84, 172, "bt2")}{cross(137.14, 583.41, "bt3")}{cross(342.84, 583.41, "bt4")}
          {/* ROUND 47 (owner): customers who already have their labels
              upload one here and go straight to marketing assets.
              ROUND 48: the confirmation is GREEN like every other ✓, and
              a fresh upload UNSELECTS every section — the customer picks
              each one before the next arrow lets them through. */}
          <label style={{ ...px(137.14, 596, 205.7, 18), font: `13px ${HNW}`, color: customLabel ? "#3f6d2a" : "#111", textDecoration: "underline", textTransform: "none", textAlign: "center", cursor: "pointer", display: "block", lineHeight: "18px" }}>
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
            <div key={loadKey} style={{ ...px(x, y, w2, h2), background: assetsStage ? "#F4F3EE" : "#ECECEA", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingBottom: h2 < 80 ? 10 : 0, boxSizing: "border-box" }}>
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
        /* the four thumbs, in whichever shape this layout calls for */
        const thumbs = landingCol
          ? Array.from({ length: 4 }, (_, k) => ({ x: 757.5, y: Y0 + k * 70.83, s: 62 }))
          : Array.from({ length: 4 }, (_, k) => ({ x: 754 + (k % 2) * 152, y: Y0 + Math.floor(k / 2) * 152, s: 122 }));
        const vrule = (x: number, key: string) => (
          <span key={key}>
            {dashRule(x, BOX.y, BOX.h, true, "boxrule" + x)}
            {cross(x, BOX.y, key + "a")}{cross(x, BOX.y + BOX.h, key + "b")}
          </span>
        );
        return (<>
          {patch(0, 160, W, 500, "aswipe")}
          {custom
            ? head(137.14, "Product Shot", "Face", "Transparent PNG / 700x2500px / 72dpi")
            : head(137.14, "Two Product Shots", "Face & Back", "Transparent PNG / 700x2500px / 72dpi")}
          {head(R2 + 0.3, "Five Marketing Images", "Product placed in contextual environments", "JPEG / 2500x2500px / 72dpi")}
          {landingCol && head(R3 + 0.3, "Product Landing Page", "You will be provided with the link\nto your product page.", "")}
          {/* status line above the progress bar (round 47) */}
          {assetsStage && (
            <span style={{ ...px(0, 646, W, 16), font: `italic 12px ${HNW}`, color: "#BA141A", lineHeight: "15px", textAlign: "center", display: "block" }}>
              {t("Creating your marketing assets")} — {tStage(assetsStage)}…</span>
          )}
          {dashedBox(BOX.x, BOX.y, BOX.w, BOX.h, "asd1")}
          {!custom && vrule(R1, "asr1")}
          {vrule(R2, "asr2")}
          {landingCol && vrule(R3, "asr3")}
          {cross(BOX.x, BOX.y, "as1")}{cross(BOX.x, BOX.y + BOX.h, "as2")}
          {cross(BOX.x + BOX.w, BOX.y, "as3")}{cross(BOX.x + BOX.w, BOX.y + BOX.h, "as4")}
          {/* product shots — split col 1, centred in each half */}
          {custom
            ? slot((BOX.x + R2) / 2 - 60, Y0, 120, CH, assets.front, "front shot", "contain", false, undefined, SHOT_ZOOM)
            : (<>
              {slot((BOX.x + R1) / 2 - 60, Y0, 120, CH, assets.front, "front shot", "contain", false, undefined, SHOT_ZOOM)}
              {slot((R1 + R2) / 2 - 60, Y0, 120, CH, assets.back, "back shot", "contain", false, undefined, SHOT_ZOOM)}
            </>)}
          {/* ROUND 88 #10 (owner): SAVE under the dashed area's left corner,
              outside it, on its left edge — every image flies into the
              folder in sequence */}
          {!assetsStage && assets.front && (
            <button onClick={() => {
              setAssetsSaved(true);
              const items: { src: string; x: number; y: number; w: number; h: number }[] = [];
              /* the shots fly from their zoomed box */
              const zw = 120 * SHOT_ZOOM, zh = CH * SHOT_ZOOM, zdx = (zw - 120) / 2, zdy = (zh - CH) / 2;
              if (assets.front) items.push({ src: assets.front.prev, x: (custom ? (BOX.x + R2) / 2 : (BOX.x + R1) / 2) - 60 - zdx, y: Y0 - zdy, w: zw, h: zh });
              if (!custom && assets.back) items.push({ src: assets.back.prev, x: (R1 + R2) / 2 - 60 - zdx, y: Y0 - zdy, w: zw, h: zh });
              const hero = assets.life[lifeOrder[0]];
              if (hero) items.push({ src: hero.prev, x: HERO.x, y: Y0, w: HERO.w, h: CH });
              thumbs.forEach((th, k) => { const it = assets.life[lifeOrder[k + 1]]; if (it) items.push({ src: it.prev, x: th.x, y: th.y, w: th.s, h: th.s }); });
              flyToFolder(items);
            }}
              style={{ ...px(BOX.x, BOX.y + BOX.h + 14, 274, 34.3), cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: assetsSaved ? "#fff" : "#111", color: assetsSaved ? "#111" : "#fff", border: "1px solid #111", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4, transition: `background 240ms ${EASE}, color 240ms ${EASE}` }}>
              {assetsSaved ? t("Saved") : t("Save")}</button>
          )}
          {/* the hero, then its four thumbs */}
          {slot(HERO.x, Y0, HERO.w, CH, assets.life[lifeOrder[0]], `lifestyle ${lifeOrder[0] + 1}/5`, "cover")}
          {thumbs.map((th, k) => {
            const idx = lifeOrder[k + 1];
            return (
              <span key={"mi" + k}>
                {slot(th.x, th.y, th.s, th.s, assets.life[idx], `lifestyle ${(idx % N) + 1}/5`, "cover", true,
                  assets.life[idx] ? () => swapHero(k + 1) : undefined)}
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
              <div style={{ ...px(921.5, 310.5, BW, BH), background: "#F4F3EE", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {miniGlass("landing", Math.min(0.92, 0.2 + assets.life.filter(Boolean).length * 0.16))}
              </div>
            );
            if (tut >= 0) return (<>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${TUT_D}landing.jpg`} alt="product page"
                style={{ ...px(921.5, 310.5, BW, BH), objectFit: "cover", borderRadius: 5, boxShadow: "0 8px 22px rgba(0,0,0,0.2)", animation: `nuiFadeIn ${FADE_MS}ms ${EASE}` }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/qr?u=${encodeURIComponent("https://8klabels.com/p/demo")}`} alt="QR" style={{ ...px(925.5, 548.5, 34.3, 34.3) }} />
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
                  <div style={{ position: "absolute", inset: 0, background: assetsStage || ready ? "#F4F3EE" : "#ECECEA", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
        const CAR = { x: 160, y: 205.71, w: 434.28, h: 205.71 };   /* the slide's own space */
        const CAR_MID = 308.57;
        const TC_B = 468.28;
        const ROWB = [502.2, 536.49, 570.64, 605.06];
        const TOT_B = 639.48;
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
          <span key={"pr" + baseline + right} style={{ ...px(right - 160, baseTop(baseline, 15), 160, 18), font: `${bold ? 700 : 400} 15px ${HNW}`, lineHeight: "15px", textAlign: "right", display: "block" }}>{v}</span>
        );
        const rowLabel = (baseline: number, text: string, click: () => void, key: string) => (
          <button key={key} onClick={click}
            style={{ ...px(LBL_X, baseline - 17, 360, 24), ...ghost, textAlign: "left", textTransform: "none", font: `15px ${HNW}`, color: "#111", display: "flex", alignItems: "center" }}>{text}</button>
        );
        return (<>
          {/* ── the right-hand column: what the pack contains ───────────── */}
          {/* the artboard's paragraph is OUTLINED, so it cannot follow the
              language switch — it is covered and redrawn as live text */}
          {!gensMode && patch(COL_R, 542, COL_W, 82, "parawipe")}
          {!gensMode && ["After payment, you’ll be able to download your", "Final Pack with high-resolution, print-ready files,", "instructions, and a Read Me containing", "the link to your published product page."].map((ln, i) => (
            <span key={"pp" + i} style={{ ...px(COL_R, baseTop(559.8 + i * 18, 15), COL_W, 20), font: `italic 15px ${HNW}`, lineHeight: "15px", color: "#111", whiteSpace: "nowrap" }}>{t(ln)}</span>
          ))}
          {/* ROUND 88 #1 (owner): the baked tree is wiped and REDRAWN LIVE —
              it reveals from the folder mark downward (trunk, bar, branches,
              icons, names, arrows, then the files line by line) and lists
              the REAL files of the ZIP under the wine's name (Wine_Name
              until one is typed). Unselected rows drop their branch; an
              own-label order has no tree (round 50). */}
          {!gensMode && patch(760, 92, 600, 450, "notree")}
          {!gensMode && !customLabel && (() => {
            const base = (f.wine || "").trim().replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "") || "Wine_Name";
            const slug = (f.wine || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "wine-name";
            type Branch = { x: number; kind: "doc" | "folder"; name: string[]; files: string[] };
            const branches: Branch[] = [
              { x: 856, kind: "doc", name: ["READ ME"], files: ["Instructions.pdf", "Terms&Conditions.pdf", ...(packSel[1] ? [`www.8klabels.com/${slug}`] : [])] },
              ...(packSel[2] ? [{ x: 1055, kind: "folder" as const, name: ["MARKETING", "ASSETS"], files: [`${base}_Bottle_Front.png`, `${base}_Bottle_Back.png`, ...[1, 2, 3, 4, 5].map((n) => `${base}_Image0${n}.png`)] }] : []),
              ...(packSel[0] ? [{ x: 1275, kind: "folder" as const, name: ["LABELS"], files: [`${base}_Front_Label.pdf`, `${base}_Front_Label.svg`, `Links/${base}_Front_Artwork.png`, `Fonts/`, `${base}_Back_Label.svg`] }] : []),
            ];
            const TX = 1275, BAR_Y = 205, TRUNK_TOP = 152;
            const leftX = Math.min(...branches.map((b2) => b2.x));
            const A = (delay: number, name: string, ms = 320): React.CSSProperties => ({ animation: `${name} ${ms}ms ${EASE} ${delay}ms both` });
            const folderPath = (
              <>
                <path d="M1233.31,103.1V38.26c0-1.98,1.34-3.59,2.99-3.59h25.27c.79,0,1.55.38,2.11,1.05l7.74,9.3c.56.67,1.32,1.05,2.11,1.05h25.27c1.65,0,2.99,1.61,2.99,3.59v7.81" fill="#fff" stroke="#000" strokeWidth="0.75" strokeMiterlimit="10" />
                <path d="M1233.31,103.1h68.49l15.03-40.57c.88-2.38-.57-5.05-2.73-5.05h-61.95c-1.18,0-2.25.84-2.73,2.13l-16.11,43.49" fill="#fff" stroke="#000" strokeWidth="0.75" strokeMiterlimit="10" />
              </>
            );
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
                  <span key={b2.name[0]}>
                    <div style={{ ...px(b2.x - 0.5, BAR_Y, 1, 44), transformOrigin: "top", ...A(600 + i * 90, "nuiGrowY", 220) }}>{dashRule(0, 0, 44, true)}</div>
                    <div style={{ ...px(b2.x - 4, BAR_Y + 43, 8, 1), background: "#000", ...A(780 + i * 90, "nuiFadeIn", 160) }} />
                    {/* the icon */}
                    <div style={{ ...px(b2.x - 42.5, 255, 85, 70), ...A(880 + i * 120, "nuiPop", 360) }}>
                      {b2.kind === "folder"
                        ? <svg viewBox="1232.5 33.9 85.1 70" width="85" height="70" style={{ display: "block" }}>{folderPath}</svg>
                        : <svg viewBox="0 0 85 70" width="85" height="70" style={{ display: "block" }}>
                            <path d="M14 3 H70 V52 Q70 66 56 66 H14 Z" fill="#fff" stroke="#000" strokeWidth="0.9" />
                            <path d="M14 66 Q2 66 2 56 V50 H56 V52 Q56 66 70 66" fill="#fff" stroke="#000" strokeWidth="0.9" />
                            {[15, 23, 31, 39].map((yy) => <line key={yy} x1="24" y1={yy} x2="60" y2={yy} stroke="#000" strokeWidth="0.9" />)}
                          </svg>}
                    </div>
                    {/* the name */}
                    {b2.name.map((ln, j) => (
                      <span key={ln} style={{ ...px(b2.x - 80, baseTop(345 + j * 18, 15), 160, 18), font: `15px ${HNW}`, lineHeight: "15px", textAlign: "center", whiteSpace: "nowrap", ...A(1080 + i * 120, "nuiFadeUp", 300) }}>{t(ln)}</span>
                    ))}
                    {/* the arrow down to the files */}
                    <div style={{ ...px(b2.x - 4, 372, 8, 1), background: "#000", ...A(1300 + i * 120, "nuiFadeIn", 160) }} />
                    <div style={{ ...px(b2.x - 0.5, 372, 1, 32), transformOrigin: "top", ...A(1300 + i * 120, "nuiGrowY", 240) }}>{dashRule(0, 0, 32, true)}</div>
                    <svg viewBox="0 0 10 6" style={{ ...px(b2.x - 5, 402, 10, 6), ...A(1500 + i * 120, "nuiFadeIn", 160) }}><polyline points="0.5,0.5 5,5.5 9.5,0.5" fill="none" stroke="#000" strokeWidth="1" /></svg>
                    {/* the files, one line after another */}
                    {b2.files.map((fn, j) => (
                      <span key={fn} style={{ ...px(b2.x - 110, baseTop(434.45 + j * 10, 9.5), 220, 12), font: `9.5px ${HNW}`, lineHeight: "9.5px", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...A(1620 + i * 120 + j * 70, "nuiFadeUp", 260) }}>{fn}</span>
                    ))}
                  </span>
                ))}
              </div>
            );
          })()}
          {/* an own-label (assets-only) order buys no labels: no tree, no caption (round 50) */}
          {customLabel && !gensMode && patch(1225, 108, 120, 40, "nofpcap")}
          {/* ROUND 85 #3 (owner): no "Proceed to payment" bar, no "Download"
              bar — the red round button does both: a card until the payment
              lands, a download tray after. Both baked bars are wiped. */}
          {!gensMode && patch(COL_R - 2, BTN.y - 2, COL_W + 4, BTN.h + 4, "dlwipe")}
          {patch(COL_L - 2, BTN.y - 2, COL_W + 4, BTN.h + 4, "paywipe")}
          {/* ── the left-hand column: the order ─────────────────────────── */}
          {/* the live slide, centred between the baked chevrons */}
          {gensMode ? null : sl.landing ? (
            productUrl && selected >= 0 ? (
              <div style={{ ...px(CAR.x + (CAR.w - 320) / 2, CAR.y, 320, 320 / W * 823 + 13), background: "#fff", borderRadius: 5, boxShadow: "0 8px 22px rgba(0,0,0,0.2)", overflow: "hidden" }}>
                <div style={{ height: 13, background: "#E8E8E6", display: "flex", alignItems: "center", gap: 3, padding: "0 6px" }}>
                  {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <span key={c} style={{ width: 4.5, height: 4.5, borderRadius: 3, background: c }} />)}
                  <span style={{ flex: 1, margin: "0 8px", height: 7, background: "#fff", borderRadius: 3, font: `5px ${HNW}`, color: "#999", paddingLeft: 4, lineHeight: "7px" }}>8klabels.com{productUrl}</span>
                </div>
                <iframe src={productUrl} title="product page" style={{ width: W, height: 823, transform: `scale(${320 / W})`, transformOrigin: "0 0", border: 0, pointerEvents: "none" }} />
              </div>
            ) : notMade(CAR.x + 40, CAR.y, CAR.w - 80, CAR.h, "front", "nmCar")
          ) : sl.img ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={sl.img} alt={sl.name} style={{ ...px(CAR.x, CAR.y, CAR.w, CAR.h), objectFit: "contain" }} />
          ) : notMade(CAR.x + 40, CAR.y, CAR.w - 80, CAR.h, sl.kind || "front", "nmCar")}
          {!gensMode && (<>
            {/* the baked chevrons get their click zones */}
            <button aria-label="prev slide" onClick={() => setCarIdx((c) => (c + slides.length - 1) % slides.length)}
              style={{ ...px(COL_L - 8, CAR_MID - 22, 44, 44), ...ghost }} />
            <button aria-label="next slide" onClick={() => setCarIdx((c) => (c + 1) % slides.length)}
              style={{ ...px(PRICE_R - 36, CAR_MID - 22, 44, 44), ...ghost }} />
            {/* T&C — the ring's dot and both click zones are live */}
            {dotBtn(RING_X, ringY(TC_B), agree, () => setAgree((a) => !a), "agree")}
            <button onClick={() => setAgree((a) => !a)} style={{ ...px(206, TC_B - 15, 94, 20), ...ghost }} />
            <button aria-label="terms" onClick={() => { setTermsOpen(true); setTermsPos(0); }} style={{ ...px(298, TC_B - 15, 130, 20), ...ghost, cursor: "pointer" }} />
          </>)}
          {gensMode ? (<>
            {/* ROUND 52 #2 / 53 #1: the credit top-up borrows the same order
                column — the right half and the divider come off entirely. */}
            {patch(700, 92, 660, 600, "notreeg")}
            {patch(130, 126, 620, 32, "gtitle")}
            <span style={{ ...px(COL_L, baseTop(149.02, 23), 300, 26), font: `700 23px ${HNW}`, lineHeight: "23px" }}>{t("CREDITS")}</span>
            {dashedBox(CAR.x, CAR.y, CAR.w, CAR.h, "genFrame")}
            {cross(CAR.x, CAR.y, "gf1")}{cross(CAR.x + CAR.w, CAR.y, "gf2")}
            {cross(CAR.x, CAR.y + CAR.h, "gf3")}{cross(CAR.x + CAR.w, CAR.y + CAR.h, "gf4")}
            {/* the four baked product rows become the four credit bundles */}
            {patch(LBL_X - 2, 486, 380, 134, "growwipe")}
            {GENS.map((g, i) => (
              <span key={g.name}>
                {dotBtn(RING_X, ringY(ROWB[i]), gensSel === i, () => setGensSel(i), "gen" + i)}
                {rowLabel(ROWB[i], t(g.name), () => setGensSel(i), "gr" + i)}
                {priceAt(ROWB[i], "$" + g.price.toFixed(2))}
              </span>
            ))}
            {priceAt(TOT_B, "$" + GENS[gensSel].price.toFixed(2), true)}
          </>) : customLabel ? (<>
            {/* own-label order: only Marketing Assets and its price */}
            {patch(LBL_X - 2, 486, 380, 134, "custrows")}
            {patch(PRICE_R - 160, 486, 160, 134, "custprices")}
            {dotBtn(RING_X, ringY(ROWB[0]), !!packSel[2], () => setPackSel((ps) => ps.map((v, k) => (k === 2 ? !v : v))), "pkc")}
            {[1, 2, 3].map((i) => <span key={"nr" + i} style={{ ...px(RING_X - 13, ringY(ROWB[i]) - 13, 26, 26), background: "#fff" }} />)}
            {rowLabel(ROWB[0], t("Marketing Assets"), () => setPackSel((ps) => ps.map((v, k) => (k === 2 ? !v : v))), "clm")}
            {priceAt(ROWB[0], "$" + PACK[2].price)}
            {priceAt(TOT_B, "$" + total, true)}
          </>) : (<>
            {/* live dots on the baked rings + the row click zones */}
            {PACK.map((it, i) => (
              <span key={it.name}>
                {dotBtn(RING_X, ringY(ROWB[i]), !!packSel[i], () => setPackSel((ps) => ps.map((v, k) => (k === i ? !v : v))), "pk" + i)}
                <button onClick={() => setPackSel((ps) => ps.map((v, k) => (k === i ? !v : v)))}
                  style={{ ...px(LBL_X, ROWB[i] - 17, 360, 24), ...ghost }} />
                {priceAt(ROWB[i], "$" + it.price)}
              </span>
            ))}
            {priceAt(TOT_B, "$" + total, true)}
          </>)}
          {/* round 52 #1: the agree gate message under the Pay bar */}
          {warn && (
            <span style={{ ...px(137.14, 694, 480, 16), font: `13px ${HNW}`, color: "#BA141A", textAlign: "center", display: "block" }}>{warn}</span>
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
              <div style={{ ...px(0, HEADER_H, W, FOOTER_Y - HEADER_H), background: "rgba(255,255,255,0.88)", zIndex: 30, pointerEvents: "none" }} />
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
  const modalOpen = !!confirmModal || !!emailModal || termsOpen || marketOpen;
  const step = tut >= 0 ? tut : STEP_OF[page];
  /* round 71: Mtavruli runs much wider than Latin — six stops 166.6 apart
     only clear each other in Georgian at a smaller size */
  const BAR_FS = lang === "ge" ? 11 : 13;
  /* round 71 #4: while the walkthrough runs, the bar follows IT — the
     button rides the stop being explained and the line follows it home */
  const tutLast = TUT_CARDS.length - 1;
  const tutX = tut < 0 ? null : tut < STEPS.length ? STEPS[tut].x : NEXT_X;
  const thick = tut >= 0 ? (tut < STEPS.length ? STEPS[tut].x : CIRCLE_X[CIRCLE_X.length - 1]) : THICK[page];
  const bandBottom = BAND_BOTTOM[page];
  const fullSlide = (page === "vision" && prev === "welcome") || page === "welcome";

  return (
    <main style={{ background: "#000", minHeight: "100vh", margin: 0, padding: 0, maxWidth: "none", width: "100%" }}>
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
        .nui-next { transition: transform 200ms cubic-bezier(0.33, 1, 0.68, 1); }
        .nui-next:hover { transform: scale(1.09); }
        .nui-next:active { transform: scale(1.02); }
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
        @keyframes nuiFolderBump { 0%, 100% { transform: scale(1) } 40% { transform: scale(1.14) } 72% { transform: scale(0.97) } }
        @keyframes btnFly { from { left: ${WELCOME_X - NEXT_R}px } to { left: ${NEXT_X - NEXT_R}px } }
        @keyframes nuiFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes nuiFadeOut { from { opacity: 1 } to { opacity: 0 } }
        @keyframes szGrow { from { transform: scale(0) } to { transform: scale(1) } }`}</style>
      {/* round 40: the page bands extend to the window edges so the 80%
          artboard doesn't float like a card — black header stripe, white
          content stripe, black below (the main background) */}
      <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: HEADER_H * scale, background: "#000" }} />
      <div style={{ position: "absolute", left: 0, top: HEADER_H * scale, width: "100%", height: (FOOTER_Y - HEADER_H) * scale, background: "#fff" }} />
      <div style={{ width: W * scale, height: H * scale, position: "relative", margin: "0 auto" }}>
        <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", overflow: "hidden", background: "#fff" }}>

          {/* sliding zone: every layer carries its board AND its live
              content, so nothing pops in after the slide; slides move as
              three vertical bands with a small stagger (parallax) */}
          {(() => {
            const zoneH = fullSlide ? H : bandBottom - BAND_TOP;
            const pageTop = fullSlide ? 0 : -BAND_TOP;
            const pageSpace = (p: PageKey, inSlide: boolean) => (
              <>
                <div style={{ position: "absolute", inset: 0, userSelect: "none" }} dangerouslySetInnerHTML={{ __html: (lang === "ge" ? boardsGe[p] : boards[p]) || boards[p] || "" }} />
                {/* ROUND 63: the boards still carry the OLD baked progress bar
                    (line at 685, words at 720) — wipe that strip, the new bar
                    rides the band edge. The Final-Pack board has no bar, only
                    a baked back arrow to hide. */}
                {p === "checkout" ? null : patch(0, 660, W, FOOTER_Y - 660, "barwipe")}
                {/* ROUND 63 (owner): page titles grew with the merged pages —
                    the baked 19px title is covered and redrawn live at 24 */}
                {PAGE_TITLE[p] && (<>
                  {patch(130, 126, 620, 32, "ttl" + p)}
                  <span style={{ ...px(137.14, baseTop(149.08, 24), 620, 24), font: `700 24px ${HNW}`, lineHeight: "24px", color: "#111", whiteSpace: "nowrap" }}>{t(PAGE_TITLE[p]!)}</span>
                </>)}
                {renderOverlay(p, inSlide)}
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
              const d0 = s.delay + (dirIn ? outBase : 0);
              const anim = s.mode === "fade"
                ? `${dirIn ? "nuiFadeIn" : "nuiFadeOut"} ${FADE_MS}ms ${EASE} ${d0}ms both`
                : `${dirIn ? "nuiInPx" : "nuiOutPx"} ${SLIDE_MS}ms ${EASE} ${d0}ms both`;
              return (
                <div key={`${p}-${si}`} style={{ position: "absolute", left: x0, top: zy0, width: x1 - x0, height: zy1 - zy0, overflow: "hidden", animation: anim, pointerEvents: "none" }}>
                  {/* round 28 #3: OPAQUE page behind each slice — an arriving
                      slice covers the outgoing page's late-delay ghosts the
                      moment it lands (no text-over-text mid-flight either) */}
                  <div style={{ position: "absolute", left: -x0, top: pageTop - zy0, width: W, height: H, background: "#fff" }}>{pageSpace(p, true)}</div>
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
                  : <div style={{ position: "absolute", left: 0, top: pageTop, width: W, height: H }}>{pageSpace(page, false)}</div>}
              </div>
            );
          })()}

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
                animation: `nuiFly 1150ms cubic-bezier(.5,.02,.18,1) ${fl.delay}ms both`,
                ...({ "--dx": `${FOLDER_C.x - (fl.x + fl.w / 2)}px`, "--dy": `${FOLDER_C.y - (fl.y + fl.h / 2)}px`, "--s": `${Math.min(0.14, 52 / Math.max(fl.w, fl.h)).toFixed(3)}` } as React.CSSProperties) }} />
          ))}
          <svg key={"fm" + folderBump} viewBox="1232.5 33.9 85.1 70" style={{ ...px(1232.5, 33.9, 85.1, 70), zIndex: 13, pointerEvents: "none", transformOrigin: "50% 62%", animation: folderBump > 0 ? `nuiFolderBump 560ms ${EASE} both` : "none" }}>
            <path d="M1233.31,103.1V38.26c0-1.98,1.34-3.59,2.99-3.59h25.27c.79,0,1.55.38,2.11,1.05l7.74,9.3c.56.67,1.32,1.05,2.11,1.05h25.27c1.65,0,2.99,1.61,2.99,3.59v7.81" fill="#fff" stroke="#000" strokeWidth="0.75" strokeMiterlimit="10" />
            <path d="M1233.31,103.1h68.49l15.03-40.57c.88-2.38-.57-5.05-2.73-5.05h-61.95c-1.18,0-2.25.84-2.73,2.13l-16.11,43.49" fill="#fff" stroke="#000" strokeWidth="0.75" strokeMiterlimit="10" />
          </svg>
          {/* STATIC header (real fonts, extracted geometry) */}
          <div style={{ ...px(0, 0, W, HEADER_H), background: "#000" }}>
            {/* round 56 #3 — TEMP DEV SWITCH (remove before launch); ROUND 63
                moved out of the footer, to the left of the logo */}
            <button aria-label="toggle live generation"
              onClick={() => { const v = !liveGen; setLiveGen(v); liveGenRef.current = v; try { localStorage.setItem("nui-live-gen", v ? "1" : "0"); } catch { } }}
              style={{ ...px(18, 26, 110, 16), ...ghost, display: "flex", alignItems: "center", columnGap: 6, textTransform: "none" }}>
              <span style={{ width: 22, height: 12, borderRadius: 7, border: "1px solid #666", position: "relative", background: "#111", boxSizing: "border-box", flex: "0 0 auto" }}>
                <span style={{ position: "absolute", top: 1.5, left: liveGen ? 11.5 : 1.5, width: 7, height: 7, borderRadius: 4, background: liveGen ? "#3fd05e" : "#666", transition: "left 160ms" }} />
              </span>
              <span style={{ font: `300 9px ${HNW}`, color: "#666", whiteSpace: "nowrap" }}>live gen</span>
            </button>
            <button onClick={() => go("welcome", -1)} style={{ ...px(138.2, 25.5, 100, 20), ...ghost, font: `700 19px ${HNW}`, color: "#fff", textAlign: "left", textTransform: "none" }}>8K</button>
            {/* menu + ENG/GEO: one baseline, even gaps, right edge on the
               progress line's right edge x1303 (round 22 #11) */}
            <div style={{ position: "absolute", right: W - 1200, top: 27.5, display: "flex", alignItems: "baseline", columnGap: 44 }}>
              {/* ROUND 63: the credit balance rides the header now (the
                  footer holds nothing but the bar) */}
              <span style={{ font: `700 13px ${HNW}`, color: "#fff", whiteSpace: "nowrap" }}>
                {t("Credits available:")}{" "}
                {spinning ? (
                  <span style={{ color: BAR_RED, fontWeight: 700 }}>{spinDigit}</span>
                ) : genCredits === 0 ? (
                  <button onClick={() => { gensReturn.current = pageNow.current; setGensMode(true); setGensSel(0); go("checkout"); }}
                    style={{ ...ghost, font: `700 13px ${HNW}`, color: BAR_RED, textDecoration: "underline", textTransform: "none", display: "inline" }}>{t("Add credit")}</button>
                ) : (
                  <span style={{ color: BAR_RED, fontWeight: 700 }}>{genCredits}</span>
                )}
              </span>
              <span style={{ font: `700 13px ${HNW}`, color: "#fff", whiteSpace: "nowrap" }}>{t("About Us")}</span>
              <span style={{ font: `700 13px ${HNW}`, color: "#fff", whiteSpace: "nowrap" }}>{t("Gallery")}</span>
              <span style={{ font: `700 13px ${HNW}`, color: "#fff", whiteSpace: "nowrap" }}>{t("Contact")}</span>
              <span style={{ display: "flex", alignItems: "baseline", columnGap: 5, whiteSpace: "nowrap" }}>
                <button onClick={() => pickLang("en")} style={{ ...ghost, font: `${lang === "en" ? 700 : 300} 13px ${HNW}`, color: lang === "en" ? "#fff" : "#8a8a8a" }}>ENG</button>
                <span style={{ font: `300 13px ${HNW}`, color: "#8a8a8a" }}>/</span>
                <button onClick={() => pickLang("ge")} style={{ ...ghost, font: `${lang === "ge" ? 700 : 300} 13px ${HNW}`, color: lang === "ge" ? "#fff" : "#8a8a8a" }}>GEO</button>
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
                  <button key={"d" + i} aria-label={st.label}
                    onClick={() => { if (tut >= 0) { if (i !== tut) { setTut(i); go(TUT_PAGES[i], i > tut ? 1 : -1); } } else if (st.page !== page) { barJumped.current = true; go(st.page, ORDER.indexOf(st.page) > ORDER.indexOf(page) ? 1 : -1); } }}
                    style={{ ...px(st.x - 13, PROG_Y - 13, 26, 26), ...ghost, pointerEvents: modalOpen ? "none" : "auto" }}>
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
              {STEPS.map((st, i) => (
                <button key={st.label + i} onClick={() => { if (tut >= 0) { if (i !== tut) { setTut(i); go(TUT_PAGES[i], i > tut ? 1 : -1); } } else if (st.page !== page) { barJumped.current = true; go(st.page, ORDER.indexOf(st.page) > ORDER.indexOf(page) ? 1 : -1); } }}
                  style={{
                    ...px(st.x - 130, baseTop(LABEL_BASE, BAR_FS), 260, 20), ...ghost,
                    pointerEvents: modalOpen ? "none" : "auto",
                    font: `${st.big ? 700 : 300} ${BAR_FS}px ${HNW}`, lineHeight: `${BAR_FS}px`,
                    color: "#fff", textAlign: "center", textTransform: "none", whiteSpace: "nowrap",
                    /* round 72 #6: in the walkthrough a stop stays unnamed
                       until the button moves OFF it — the name fades in as
                       the button travels on. Outside it, every name shows. */
                    opacity: tut >= 0 && i >= tut ? 0 : 1,
                    transition: `opacity ${SLIDE_MS}ms ${EASE}`,
                  }}>
                  {t(st.label)}</button>
              ))}
            </>)}
            {/* ROUND 71 #4: the walkthrough's black card — geometry lifted
                straight off the artboard (191.2 wide, its foot on 685.72,
                a 20.6 pointer down to 706.31), centred on the arrow and
                travelling with it. */}
            {tut >= 0 && tutX !== null && (() => {
              const card = TUT_CARDS[Math.min(tut, TUT_CARDS.length - 1)];
              const solo = card.body.length === 0;          /* the closing card */
              /* round 73 #6: same box as every other card, text still
                 sitting in its top-left corner */
              const h = TB.full;
              const top = TB.bottom - h;
              const L = tutX - TB.w / 2;
              return (
                <div key={"tut" + tut} style={{ ...px(L, top, TB.w, TB.bottom + (TB.tipY - TB.bottom) - top), pointerEvents: "none", animation: `nuiFadeIn 320ms ${EASE} both`, transition: `left ${SLIDE_MS}ms ${EASE}` }}>
                  <div style={{ position: "absolute", left: 0, top: 0, width: TB.w, height: h, background: "#111" }} />
                  {/* the pointer. ROUND 76 #4: it used to be a CSS triangle
                      butted against the card, and at fractional page scales
                      the two shapes left a hairline between them — one SVG
                      path, overlapping the card by a pixel, cannot. */}
                  <svg width={TB.w} height={TB.tipY - TB.bottom + 2} viewBox={`0 0 ${TB.w} ${TB.tipY - TB.bottom + 2}`}
                    style={{ position: "absolute", left: 0, top: h - 1, display: "block" }}>
                    <path d={`M${TB.w / 2 - TB.tipW} 0 H${TB.w / 2 + TB.tipW} L${TB.w / 2} ${TB.tipY - TB.bottom + 1} Z`} fill="#111" />
                  </svg>
                  {/* round 72 #4: a way out at any point — but not on the
                      closing card, whose own arrow does exactly that */}
                  {!solo && <button onClick={endTutorial}
                    style={{ position: "absolute", right: TB.pad, top: baseTop(solo ? 22 : 26, 12), ...ghost, pointerEvents: "auto", font: `12px ${HNW}`, color: BAR_RED, textDecoration: "underline", textTransform: "none", cursor: "pointer", lineHeight: "12px" }}>
                    {t("Skip")}</button>}
                  {solo ? (
                    card.title.map((ln, i) => (
                      <span key={i} style={{ position: "absolute", left: TB.pad, top: baseTop(34.71 + i * 27.6, 23), width: TB.w - TB.pad, font: `700 23px ${HNW}`, lineHeight: "23px", color: "#fff", whiteSpace: "nowrap" }}>{t(ln)}</span>
                    ))
                  ) : (<>
                    <span style={{ position: "absolute", left: TB.pad, top: baseTop(32.06, 23), width: TB.w - TB.pad, font: `700 23px ${HNW}`, lineHeight: "23px", color: "#fff" }}>{t(card.step)}</span>
                    {card.title.map((ln, i) => (
                      <span key={"t" + i} style={{ position: "absolute", left: TB.pad, top: baseTop(58.06 + i * 18, 15), width: TB.w - TB.pad, font: `700 15px ${HNW}`, lineHeight: "15px", color: "#fff", whiteSpace: "nowrap" }}>{t(ln)}</span>
                    ))}
                    <div style={{ position: "absolute", left: TB.pad + 0.63, top: 93.67, width: TB.rule, height: 1, backgroundImage: "repeating-linear-gradient(90deg,#fff 0 5px,transparent 5px 10px)" }} />
                    {card.body.map((ln, i) => (
                      <span key={"b" + i} style={{ position: "absolute", left: TB.pad, top: baseTop(118.57 + i * 14.4, 12), width: TB.w - TB.pad + 6, font: `italic 12px ${HNW}`, lineHeight: "12px", color: "#fff", whiteSpace: "nowrap" }}>{t(ln)}</span>
                    ))}
                  </>)}
                </div>
              );
            })()}
            {/* the red round NEXT button */}
            {(page !== "loader" || tut >= 0) && (
              <button key={"next" + nudge + "-" + pressed} aria-label={page === "welcome" ? "start" : "next"} className="nui-next"
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
                  if (page === "welcome") {
                    /* round 72 #3 (owner, TEMP while we test): EVERY arrival
                       gets the walkthrough, refresh included. Later this
                       wants to be per-visitor, not per-load. */
                    startTutorial(); return;
                  }
                  else if (page === "vision") {
                    /* round 54 #2: a REAL generation asks for confirmation;
                       unchanged inputs just move along */
                    if (dreams.length && frontSig === sigFront()) nextFromFront();
                    else setConfirmModal("labels");
                  }
                  else if (page === "options") {
                    /* round 7 #12: warn instead of silently ignoring */
                    if (selected >= 0) go("backdetails");
                    else { setWarn(t("Save a label design to continue")); setTimeout(() => setWarn(""), 3200); }
                  }
                  else if (page === "backdetails") {
                    if (markets.length || noComp) nextFromCompliance();
                    else { setWarn(t("Select at least one market to continue")); setTimeout(() => setWarn(""), 3200); }
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
                  else if (page === "checkout") {
                    if (gensMode) { if (requireAgree()) payForGenerations(); }
                    else if (!paid) { if (requireAgree()) setPaid(true); }
                    else proceedToPayment();
                  }
                }}
                style={{
                  position: "absolute", left: (tutX !== null ? tutX : page === "welcome" ? WELCOME_X : NEXT_X) - NEXT_R, top: PROG_Y - NEXT_R,
                  transition: arrowFly ? "none" : `left ${SLIDE_MS}ms ${EASE}`,
                  width: NEXT_R * 2, height: NEXT_R * 2, borderRadius: NEXT_R, background: BAR_RED, border: "none",
                  padding: 0, cursor: "pointer", pointerEvents: modalOpen ? "none" : "auto", display: "flex", alignItems: "center", justifyContent: "center",
                  animation: arrowFly ? `btnFly ${SLIDE_MS}ms ${EASE} both`
                    : ((tut >= 0 && tut >= tutLast) || page === "checkout") && nudge > 0 ? `nuiNudge 1200ms ${EASE} both`
                    : pressed > 0 ? `nuiPress 260ms ${EASE} both` : "none",
                }}>
                {/* round 71: the artboard's arrow — 34.3 long, 3px stroke,
                    its head 10.52 deep */}
                {page === "checkout" && !gensMode && paid ? (
                  /* the owner's download tray (Red_Buttons_Pay&Download.svg) */
                  <svg viewBox="0 0 40 40" width="32" height="32">
                    <path d="M8 20 V32 H32 V20" fill="none" stroke="#fff" strokeWidth="3" strokeLinejoin="miter" />
                    <line x1="20" y1="6" x2="20" y2="24" stroke="#fff" strokeWidth="3" />
                    <polyline points="13,17 20,24.5 27,17" fill="none" stroke="#fff" strokeWidth="3" />
                  </svg>
                ) : page === "checkout" ? (
                  /* the owner's card */
                  <svg viewBox="0 0 44 32" width="35" height="25.5">
                    <rect x="2.5" y="2.5" width="39" height="27" rx="3.5" fill="none" stroke="#fff" strokeWidth="3" />
                    <line x1="2.5" y1="11" x2="41.5" y2="11" stroke="#fff" strokeWidth="3" />
                    <rect x="29" y="19" width="7" height="4" fill="#fff" />
                  </svg>
                ) : (
                  <svg viewBox="-1.5 -12.02 37.3 24.04" width="29.8" height="19.2">
                    <line x1="0" y1="0" x2="34.3" y2="0" stroke="#fff" strokeWidth="3" />
                    <polyline points="23.78,-10.52 34.3,0 23.78,10.52" fill="none" stroke="#fff" strokeWidth="3" />
                  </svg>
                )}
              </button>
            )}
          </div>

          {/* ROUND 72 #1: the closing card stands on a clean white page */}
          {tut === TUT_CARDS.length - 1 && (
            <div style={{ ...px(0, HEADER_H, W, FOOTER_Y - HEADER_H), background: "#fff", zIndex: 11, animation: `nuiFadeIn 280ms ${EASE} both` }} />
          )}
          {/* ROUND 72 #11: the pointer doing the work */}
          {tut >= 0 && cursor && (
            <svg viewBox="0 0 24 24" width="21" height="21" style={{
              position: "absolute", left: cursor.x - 2, top: cursor.y - 1, zIndex: 14, pointerEvents: "none",
              transition: `left ${cursor.ms}ms cubic-bezier(.33,0,.2,1), top ${cursor.ms}ms cubic-bezier(.33,0,.2,1)`,
              filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))",
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
              pointerEvents: "none", zIndex: 13, animation: `nuiTap 700ms ${EASE} both`,
            }} />
          )}
          {/* ROUND 71 #4: while the walkthrough plays, the page is a film —
              it swallows clicks so nothing the visitor prods can derail the
              story. The bar (z45) still takes its own. */}
          {tut >= 0 && <div style={{ ...px(0, HEADER_H, W, FOOTER_Y - HEADER_H), zIndex: 12, background: "transparent" }} />}
          {/* ROUND 59 #2: the gate message floats at ROOT level so it can
              sit truly midway between the selection row and the bar line */}
          {/* round 76 #2: checkout prints its own gate message under the
              payment button — this one would be the second copy */}
          {warn && thick !== null && page !== "checkout" && (
            <span style={{ ...px(0, 648, W, 16), font: `13px ${HNW}`, color: "#BA141A", textAlign: "center", display: "block", zIndex: 7, position: "absolute" }}>{warn}</span>
          )}

          {/* STATIC footer bar — ROUND 63: empty; the progress bar (drawn
              after it, so it paints on top) is the only thing down here */}
          <div style={{ ...px(0, FOOTER_Y, W, H - FOOTER_Y + 4), background: "#000" }} />

          {busyMsg && <div style={{ ...px(1090, 78, 320, 20), font: `13px ${HNW}`, color: "#8a887e", textAlign: "right" }}>{busyMsg}</div>}

          {/* ROUND 56 #7/#8: the mailing-list GIFT modal — global, because
              the credit gate can fire from vision, options or assets */}
          {emailModal && (<>
            <div style={{ ...px(0, 0, W, H), zIndex: 20 }} onClick={() => setEmailModal("")} />
            <div style={{ ...px(0, HEADER_H, W, FOOTER_Y - HEADER_H), background: "rgba(255,255,255,0.88)", zIndex: 20, pointerEvents: "none" }} />
            <div style={{ ...px(W / 2 - 290, 240, 580, 248), background: "#fff", border: "1px solid #111", zIndex: 21, boxSizing: "border-box" }}>
              <button aria-label="close" onClick={() => setEmailModal("")}
                style={{ position: "absolute", right: 6, top: 4, ...ghost, font: `15px ${HNW}`, color: "#111", width: 24, height: 24 }}>✕</button>
              <span style={{ position: "absolute", left: 32, top: 22, font: `700 60px ${HNW}`, lineHeight: "64px", whiteSpace: "nowrap" }}>{t("1 free credit")}</span>
              <span style={{ position: "absolute", left: 32, top: 100, width: 516, font: `13px ${HNW}`, lineHeight: "18px" }}>
                {t("Join our mailing list and we'll gift you 1 extra credit.")}</span>
              <input value={emailInput} placeholder="your@email.com" autoFocus
                onChange={(e) => { setEmailInput(e.target.value); setEmailErr(false); }}
                onKeyDown={(e) => { if (e.key === "Enter") submitVarEmail(); }}
                style={{ position: "absolute", left: 32, top: 152, width: 320, font: `italic 15px ${HNW}`, border: "none", outline: "none", background: "transparent", padding: "0 0 2px 2px", color: "#111" }} />
              <div style={{ position: "absolute", left: 32, top: 174, width: 324, height: 1, background: "#111" }} />
              {emailErr && <span style={{ position: "absolute", left: 32, top: 180, font: `11px ${HNW}`, color: "#8e2b2b" }}>{t("Enter a valid email")}</span>}
              <button onClick={submitVarEmail}
                style={{ position: "absolute", left: 402, top: 144, width: 146, height: 34.3, cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: "#111", color: "#fff", border: "none", paddingBottom: 4 }}>
                {t("Add credit")}</button>
            </div>
          </>)}

          {confirmModal && (() => {
            /* ROUND 65/66 (owner's two reference screens): one chrome —
               uppercase title, credits line, dashed rule, Edit/Create —
               with a layout per kind. LABELS: prompt + sketch on the left,
               the typed fields on the right. ASSETS: the bottle drawing,
               the two label boxes and the product list. ROUND 66 #3:
               nothing empty is ever announced — a block whose content is
               missing (and its title) simply isn't there, and the box
               shrinks to fit what remains. */
            const isL = confirmModal === "labels";
            const cost = isL ? 3 : 1;
            /* the assets column is narrower (three blocks sit left of it),
               so its type steps down a notch */
            const fs = isL ? 15 : 14;
            const cap = (txt: string) => <span style={{ font: `700 ${lang === "ge" ? fs - 2 : fs}px ${HNW}`, lineHeight: "15px", whiteSpace: "nowrap" }}>{txt}</span>;
            const val = (txt: string) => <span style={{ font: `italic ${fs}px ${HNW}`, lineHeight: "15px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{txt}</span>;
            const colTitle = (x: number, txt: string) => (
              <span style={{ position: "absolute", left: x, top: baseTop(162.8, 21), font: `700 21px ${HNW}`, lineHeight: "21px", whiteSpace: "nowrap" }}>{txt}</span>
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
                left.push(<span key="pt">{colTitle(32, t("Prompt:"))}</span>);
                left.push(<span key="pv" style={{ position: "absolute", left: 32, top: baseTop(y + 43, 15), width: 329, maxHeight: 68, font: `15px ${HNW}`, lineHeight: "17px", overflow: "hidden" }}>{prompt}</span>);
                y += 127;
                leftBottom = y - 4;
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
              left.push(
                /* eslint-disable-next-line @next/next/no-img-element */
                <img key="bt" src={bottleSrc()} alt="" style={{ position: "absolute", left: 22, top: 140, width: 112.7, height: 225.3 }} />
              );
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
            const valX = isL ? (lang === "ge" ? 530 : 500) : (lang === "ge" ? 612 : 604);
            const rowsBottom = rows.length ? 212 + (rows.length - 1) * 19.2 + 6 : 140;
            const contentBottom = Math.max(leftBottom, rowsBottom);
            const btnTop = contentBottom + (isL ? 24 : 48);
            const H2 = btnTop + 30 + 46;
            const B = { x: 350, w: 740, h: H2, y: (HEADER_H + FOOTER_Y) / 2 - H2 / 2 };
            const onCreate = () => {
              /* round 56 #7: creating SPENDS credits (or routes to the gift
                 modal / purchase page) */
              setConfirmModal("");
              if (isL) { if (requestCredit("vision", 3)) nextFromFront(); }
              else if (requestCredit("assets")) { confirmedAssetsSig.current = pendingAssetsSig.current; setAssetsTick((t2) => t2 + 1); }
            };
            const onEdit = () => { setConfirmModal(""); go(isL ? "vision" : "bottle", -1); };
            return (<>
              <div style={{ ...px(0, 0, W, H), zIndex: 40 }} onClick={() => setConfirmModal("")} />
              <div style={{ ...px(0, HEADER_H, W, FOOTER_Y - HEADER_H), background: "rgba(255,255,255,0.88)", zIndex: 40, pointerEvents: "none" }} />
              <div style={{ ...px(B.x, B.y, B.w, B.h), background: "#fff", border: "1px solid #111", zIndex: 41, boxSizing: "border-box" }}>
                <span style={{ position: "absolute", left: 32, top: baseTop(52, 23), font: `700 23px ${HNW}`, lineHeight: "23px", whiteSpace: "nowrap" }}>{t("CHECK YOUR DETAILS")}</span>
                <button aria-label="close confirm" onClick={() => setConfirmModal("")}
                  style={{ position: "absolute", right: 24, top: 28, ...ghost, width: 26, height: 26 }}>
                  <svg viewBox="0 0 20 20" width="20" height="20"><line x1="2" y1="2" x2="18" y2="18" stroke="#111" strokeWidth="2" /><line x1="18" y1="2" x2="2" y2="18" stroke="#111" strokeWidth="2" /></svg>
                </button>
                <span style={{ position: "absolute", left: 32, top: baseTop(104, 13), font: `italic 13px ${HNW}`, lineHeight: "13px" }}>
                  {t("Each creation costs")} {cost} {cost === 1 ? t("credit") : t("credits")}</span>
                <span style={{ position: "absolute", left: 300, top: baseTop(104, 13), width: B.w - 332, textAlign: "right", font: `italic 13px ${HNW}`, lineHeight: "13px" }}>
                  {t("You have")} <span style={{ fontWeight: 700, fontStyle: "normal", color: BAR_RED }}>{genCredits}</span> {t("Credits")}</span>
                {dashRule(32, 120, B.w - 64, false, "cfrule")}
                {left}
                {rows.length > 0 && colTitle(detX, t(isL ? "Label Details" : "Product Details"))}
                {rows.map(([c, v, ph], i) => (
                  <span key={c}>
                    <span style={{ position: "absolute", left: detX, top: baseTop(212 + i * 19.2, 15), width: 150 }}>{cap(t(c).endsWith(":") ? t(c) : t(c) + ":")}</span>
                    <span style={{ position: "absolute", left: valX, top: baseTop(212 + i * 19.2, 15), width: B.w - valX - 32, display: "flex", alignItems: "center", columnGap: 6 }}>
                      {v ? val(t(v)) : <span style={{ font: `italic ${fs}px ${HNW}`, lineHeight: "15px", color: "#B3B3B3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ph}</span>}
                      {v && c === "Closure Color" && (
                        <span style={{ width: 13, height: 13, background: shadeRgb(), border: "1px solid #111", flex: "0 0 auto" }} />
                      )}
                    </span>
                  </span>
                ))}
                <button onClick={onEdit}
                  style={{ position: "absolute", left: 32, top: btnTop, width: 329, height: 30, cursor: "pointer", font: `13px ${HNW}`, letterSpacing: 0.3, background: "#fff", color: "#111", border: "1px solid #111", boxSizing: "border-box", paddingBottom: 3, textTransform: "none" }}>
                  {t("Edit Details")}</button>
                <button onClick={onCreate}
                  style={{ position: "absolute", left: 385.5, top: btnTop, width: 328.5, height: 30, cursor: "pointer", font: `700 13px ${HNW}`, letterSpacing: 0.3, background: "#111", color: "#fff", border: "none", paddingBottom: 3, textTransform: "none" }}>
                  {t("Create")} <span style={{ fontWeight: 400, fontStyle: "italic" }}>({cost} {cost === 1 ? t("Credit") : t("Credits")})</span></button>
              </div>
            </>);
          })()}

        </div>
      </div>
    </main>
  );
}
