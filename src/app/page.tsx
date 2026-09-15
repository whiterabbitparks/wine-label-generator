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
const ORDER = ["welcome", "front", "vision", "loader", "options", "backdetails", "compliance", "backdesign", "bottle", "assets", "checkout"] as const;
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

/* ROUND 45 (owner's New_Progressbar mocks): FOUR dots — an unlabeled RED
   start dot + three labeled stations. The red line grows continuously
   page by page; a station's dot turns red when its group is reached. */
const BAR_RED = "#BA141A";
const CIRCLE_X = [142.06, 527.36, 912.66, 1297.96];
/* round 53 #8 (owner): the bar words jump to the RESULT pages */
const STEPS: { label: string; page: PageKey }[] = [
  { label: "", page: "front" },
  { label: "Front Label", page: "options" },
  { label: "Back Label", page: "backdesign" },
  { label: "Marketing Assets", page: "bottle" },   /* round 57 #4 */
];
/* red-line endpoint per page (null = no bar). ROUND 46 (owner: "Red line
   must grow in thirds"): each dot-to-dot segment splits EVENLY by its page
   count — segment 1 (front 1/3, vision 2/3), segment 2 (backdetails 1/3,
   compliance 2/3), segment 3 (bottle 1/2). On assets the red line ends
   flush with the last circle's right edge (1297.96 + 4.9). */
const THICK: Record<PageKey, number | null> = {
  welcome: null, front: 270.49, vision: 398.93, loader: 527.36, options: 527.36,
  backdetails: 655.79, compliance: 784.23, backdesign: 912.66, bottle: 1108.04,
  assets: 1302.86, checkout: null,
};
/* highest station index REACHED — that dot (and earlier ones) turn red */
const STEP_OF: Record<PageKey, number> = { welcome: 0, front: 0, vision: 0, loader: 0, options: 1, backdetails: 1, compliance: 1, backdesign: 2, bottle: 2, assets: 3, checkout: 3 };

/* content band bottom per page (checkout content reaches the footer) */
const BAND_BOTTOM: Record<PageKey, number> = Object.fromEntries(ORDER.map((p) => [p, p === "checkout" || p === "welcome" ? FOOTER_Y : 660])) as Record<PageKey, number>;

/* parallax strip boundaries (page-coordinate y) — each pair sits in that
   artboard's natural empty bands so the cut never crosses a text row or a
   drawn box (loader entry fades, so its entry is unused) */
const STRIP_BOUNDS: Record<PageKey, [number, number]> = {
  welcome: [360, 560], vision: [225, 460], front: [225, 472], loader: [225, 460],
  options: [225, 543], backdetails: [225, 468], compliance: [270, 555],
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
  front: [
    { y1: 234.77, delay: 0 },
    ...Array.from({ length: 13 }, (_, i) => ({ x1: 806, y0: 234.77 + i * 30, y1: 264.77 + i * 30, delay: 40 + i * 18 })),
    { x1: 806, y0: 624.77, delay: 40 + 13 * 18 },
    { x0: 806, y0: 234.77, delay: 80, mode: "fade" as const },
  ],
  compliance: [
    { y1: 326, delay: 0 },
    { y0: 326, y1: 378.8, delay: 60 },
    { y0: 378.8, y1: 431, delay: 130 },
    { y0: 431, y1: 483.6, delay: 200 },
    { y0: 483.6, y1: 536, delay: 270 },
    { y0: 536, delay: 270 },
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
const DEMO_FRONT: Record<string, string> = {
  producer: "GRAND VIN", wine: "Château Margaux", appellation: "Margaux AOC",
  classification: "Grand Cru Classé", vintage: "2018", grape: "Cabernet Sauvignon",
  regionCountry: "Bordeaux, France", special: "Vieilles Vignes", sweetness: "Dry",
  colour: "Red", wineType: "Still Wine", alcohol: "12.5", volume: "750",
};

/* round 52 #3: placeholder terms text — long enough to need the scroll */
const TERMS_TEXT = Array.from({ length: 9 }, (_, i) => (
  `${i + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.`
));

interface Dream { style: string; dream: string; preview: string | null }

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
  const tStage = (s: string) => (lang === "ge" ? s.replace("front shot", "წინა ფოტო").replace("back shot", "უკანა ფოტო").replace("lifestyle", "სურათი").replace("preparing", "მზადდება") : s);
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
  useEffect(() => { setGenCredits(3); }, []);
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
  const requestCredit = (from: PageKey): boolean => {
    if (genCredits >= 1) { saveCredits(genCredits - 1); return true; }
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
    if (idx === cur) return Math.min(0.9, 0.14 + Math.floor((now - assetT.current.stage) / 2500) * 0.045);
    return Math.min(0.5, 0.08 + Math.floor((now - assetT.current.run) / 4000) * 0.03);   // waiting: 4s nudges
  };

  /* round 17 #2: the front label's wording suggests the bottle type */
  useEffect(() => {
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
  const [packSel, setPackSel] = useState<boolean[]>([true, true, true, false]);
  const [agree, setAgree] = useState(false);
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
    setAgree(false);
    if (customLabel) setPackSel([false, false, true, false]);
    else setPackSel((ps) => [ps[0], qrMode !== "upload", ps[2], false]);
  }, [page, qrMode, customLabel]);

  /* MARKETING ASSETS (round 13): entering the assets page kicks off the
     generation run (2 product shots + 5 lifestyle) unless the same brief
     is already generated. Sequential on the server (~5 imgs/min cap). */
  useEffect(() => {
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
        setAssets({ life: [] }); setLifeTarget(4);
        assetT.current = { run: Date.now(), stage: Date.now() };
        const lab = sel.preview || sel.dream;
        setAssetsStage("front shot"); await sleep(700);
        setAssets((a2) => ({ ...a2, front: { full: lab, prev: lab } }));
        if (backPng && !customLabel) {
          setAssetsStage("back shot"); await sleep(550);
          setAssets((a2) => ({ ...a2, back: { full: backPng, prev: backPng } }));
        }
        for (let i = 0; i < 4; i++) {
          setAssetsStage(`lifestyle ${i + 1}/4`); await sleep(420);
          setAssets((a2) => { const life = [...a2.life]; life[i] = { full: lab, prev: lab }; return { ...a2, life }; });
        }
        setAssetsSig(sig);
        setAssetsStage("");
        assetsRunning.current = false;
        return;
      }
      const got = { front: "", back: "", life: [] as string[] };
      try {
        setAssets({ life: [] }); setLifeTarget(4);
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
            const fx2 = (k: string) => f[k]?.trim() || DEMO_FRONT[k] || "";
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
      } catch { /* placeholders remain; revisiting the page retries */ }
      setAssetsStage("");
      assetsRunning.current = false;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, assetsTick]);
  /* ROUND 56 (owner's PSD): "More Variations" — each press buys 5 more
     lifestyle images; the thumbs grid densifies to fit them all */
  const [lifeTarget, setLifeTarget] = useState(4);
  const moreRunning = useRef(false);
  async function moreVariations() {
    if (assetsRunning.current || moreRunning.current || assetsStage) return;
    const sel = customLabel ? { style: "contemporary", dream: customLabel, preview: null as string | null } : viewedDream(selected);
    if (!sel) return;
    if (!requestCredit("assets")) return;
    const base = lifeTarget;
    const batch = Math.floor(base / 4);
    setLifeTarget(base + 4);
    moreRunning.current = true;
    assetT.current = { run: Date.now(), stage: Date.now() };
    try {
      if (!liveGenRef.current) {
        for (let i = 0; i < 4; i++) {
          setAssetsStage(`lifestyle ${i + 1}/4`); await sleep(450);
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
  const go = useCallback((next: PageKey, d = 1) => {
    const cur = pageNow.current;
    if (next === cur) return;
    pageNow.current = next;
    setPrev(cur); setDir(d); setPage(next);
    /* into the loader the fade starts only after the slide-out (round 9 #1);
       out of the loader the fade completes before the slide (round 21 #1);
       slice cascades extend the settle per page (round 16 #3) */
    const md = SLIDE_MS + Math.max(maxSliceDelay(cur), maxSliceDelay(next));
    const extra = next === "loader" || cur === "loader" ? FADE_MS : 0;
    setTimeout(() => setPrev(null), md + extra + 60);
  }, []);

  const goBack = useCallback(() => {
    const i = ORDER.indexOf(page);
    if (i > 0) go(ORDER[i - 1] === "loader" ? "vision" : ORDER[i - 1], -1);
  }, [page, go]);

  const sigFront = () => JSON.stringify({ vision, sketch: !!sketch, f });
  /* round 60 #4: qrMode AND the viewed variation are part of the brief —
     ANY back-details change births a fresh back label */
  const sigBack = () => JSON.stringify({ b, markets, gtin: gtinValid ? gtinNorm : "", qrImg: !!qrImg, qm: qrMode, w: f.width, h: f.height, sel: selected >= 0 ? `${selected}:${styleView[selected] || 0}` : "" });

  const buildDreamPayload = () => {
    const aspect = (Number(f.width) || 110) / (Number(f.height) || 80);
    const aspectKey = aspect > 1.15 ? "landscape" : aspect < 0.87 ? "portrait" : "square";
    const fx = (k: string) => f[k]?.trim() || DEMO_FRONT[k] || "";
    return {
      aspectKey,
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
    const { data, aspectKey } = buildDreamPayload();
    const r = await fetch("/api/dream-label", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vision, style, data, sketch, aspect: aspectKey }),
    });
    if (!r.ok || !r.body) throw new Error(`generation failed (${r.status})`);
    const reader = r.body.getReader(); const dec = new TextDecoder();
    let buf = ""; let res: { dream?: string; preview?: string | null } = {};
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
    return { style, dream: res.dream, preview: res.preview || null };
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
  /* ROUND 56 #7: every variation spends 1 credit through the gate */
  const requestVariations = (fi: number) => {
    if (varBusyCol >= 0) return;
    if (requestCredit("options")) createVariation(fi);
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
    const aspect = (Number(f.width) || 110) / (Number(f.height) || 80);
    const aspectKey = aspect > 1.15 ? "landscape" : aspect < 0.87 ? "portrait" : "square";
    const fx = (k: string) => f[k]?.trim() || DEMO_FRONT[k] || "";
    const data = {
      producer: fx("producer"), wine: fx("wine"), appellation: fx("appellation"),
      classification: fx("classification"), grape: fx("grape"),
      region: fx("regionCountry").split(",")[0]?.trim() || "",
      country: fx("regionCountry").split(",")[1]?.trim() || "",
      special: fx("special"), vintage: fx("vintage"),
      wineColorName: fx("colour"), wineType: fx("wineType"),
      sweetness: fx("sweetness"), alcohol: fx("alcohol").replace("%", ""),
      volume: fx("volume").replace(/\D/g, "") || "750",
    };
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
        body: JSON.stringify({ vision, style, data, sketch, aspect: aspectKey }),
      });
      if (!r.ok || !r.body) throw new Error(`generation failed (${r.status})`);
      const reader = r.body.getReader(); const dec = new TextDecoder();
      let buf = ""; let res: { dream?: string; preview?: string | null } = {};
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
      return { style, dream: res.dream || "", preview: res.preview || null };
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
      go("front", -1);
    }
  }

  async function nextFromCompliance() {
    if (backPng && backSig === sigBack()) { go("backdesign"); return; }
    setBusyMsg("Composing back label…");
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
        countryOfOrigin: (f.regionCountry || DEMO_FRONT.regionCountry).split(",")[1]?.trim() || "",
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
    setBusyMsg("Packing your delivery…");
    try {
      const r = await fetch("/api/package", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wineName: f.wine || "Wine",
          /* ROUND 47: an own-label order ships marketing assets only —
             the customer already has their printed labels */
          front: customLabel ? null : viewedDream(selected)?.dream || null,
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
    setBusyMsg("");
  }

  /* helpers */
  const px = (x: number, y: number, w?: number, h?: number): React.CSSProperties => ({ position: "absolute", left: x, top: y, width: w, height: h });
  const ghost: React.CSSProperties = { background: "transparent", border: "none", cursor: "pointer", padding: 0 };
  const patch = (x: number, y: number, w: number, h: number, key?: string) => <div key={key} style={{ ...px(x, y, w, h), background: "#fff" }} />;
  /* round 41 #4/#5/#11: grey placeholder — clickable, takes you where the
     missing thing is created; message in the 12px subtitle size */
  const notMade = (x: number, y: number, w: number, h: number, kind: "front" | "back" = "front", key?: string, msg = true) => (
    <button key={key} onClick={() => go(kind === "front" ? "front" : "backdetails", -1)}
      style={{ ...px(x, y, w, h), background: "#ECECEA", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", font: `12px ${HNW}`, color: "#8a887e", textAlign: "center", textTransform: "none", padding: 4 }}>
      {msg ? t(kind === "front" ? "Create front label" : "Create back label") : ""}
    </button>
  );
  /* round 41 #19: ONE dash style everywhere — the final-pack slot dashes
     (baked stroke-dasharray 4.12) are the sample */
  const DASH = "#000 0 4.12px, transparent 4.12px 8.24px";
  const dashedBox = (x: number, y: number, w: number, h: number, key?: string) => (
    <div key={key} style={{ ...px(x, y, w, h), pointerEvents: "none",
      backgroundImage: `repeating-linear-gradient(90deg,${DASH}),repeating-linear-gradient(90deg,${DASH}),repeating-linear-gradient(180deg,${DASH}),repeating-linear-gradient(180deg,${DASH})`,
      backgroundPosition: "0 0, 0 100%, 0 0, 100% 0", backgroundSize: "100% 1px, 100% 1px, 1px 100%, 1px 100%", backgroundRepeat: "no-repeat" }} />
  );
  /* owner #15 / round 7 #2: input text italic (design st16); the underline is
     a SEPARATE fixed-length row line, not text-decoration */
  const inputStyle: React.CSSProperties = { font: `italic 15px ${HNW}`, border: "none", outline: "none", background: "transparent", padding: "0 0 0 5px", color: "#111", lineHeight: "20px" };
  /* baseline offset of a 15px/20px-line input, computed from the REAL
     font metrics at runtime (round 8 #2): Safari and Chrome center line
     boxes with different ascent/descent values, so a hardcoded offset
     can never align both — the canvas metrics give each browser's own */
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
    const c: React.CSSProperties = { position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", borderRadius: "50%" };
    return (
      <button key={key} onClick={click} style={{ ...px(cx - 13, cy - 13, 26, 26), ...ghost }}>
        {opts?.coverDot && <span style={{ ...c, width: 11, height: 11, background: "#fff" }} />}
        {opts?.cover && <span style={{ ...c, width: opts.cover, height: opts.cover, background: "#fff" }} />}
        {opts?.ring && <span style={{ ...c, width: 2 * r, height: 2 * r, border: "2px solid #111", background: "#fff", boxSizing: "border-box" }} />}
        {on && <span style={{ ...c, width: 7.5, height: 7.5, background: "#111" }} />}
      </button>
    );
  };
  const cross = (cx: number, cy: number, key: string, thick = false) => (
    /* thick arms = 33px, matching the baked st14 pluses (532.06→565.02) */
    <svg key={key} style={{ ...px(cx - (thick ? 16.5 : 9), cy - (thick ? 16.5 : 9), thick ? 33 : 18, thick ? 33 : 18), pointerEvents: "none", zIndex: 5 }} viewBox={thick ? "0 0 33 33" : "0 0 18 18"}>
      <line x1={thick ? 16.5 : 9} y1="0.5" x2={thick ? 16.5 : 9} y2={thick ? 32.5 : 17.5} stroke="#000" strokeWidth={thick ? 3 : 1} />
      <line x1="0.5" y1={thick ? 16.5 : 9} x2={thick ? 32.5 : 17.5} y2={thick ? 16.5 : 9} stroke="#000" strokeWidth={thick ? 3 : 1} />
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
  const FRONT_PH = ["E.g. GRAND VIN", "E.g. Château Margaux", "E.g. Margaux AOC", "E.g. Grand Cru Classé", "E.g. 2018", "E.g. Cabernet Sauvignon", "E.g. Bordeaux, France", "E.g. Vieilles Vignes", "Dry, etc.", "E.g. Red, White etc.", "E.g. Wine, Sparkling Wine, etc.", "E.g. 12.5%", "E.g. 750 mL"];
  const BACK_ROWS = ["producerCompany", "producerAddress", "importer", "importerAddress", "bottlingDate", "lot", "web"];
  const BACK_PH = ['E.g. "Popiashvili Cellar" LLC', "E.g. #36 S. Chikovani st. 0171 Tbilisi, Georgia", 'E.g. "Teller Wines" LLC', "E.g. #36 S. Chikovani st. 0171 Tbilisi, Georgia", "E.g. 22/04/2019", "E.g. L206026342", "E.g. www.popiashvili.com"];

  const COMP_COLS = [347.1, 601.8, 851.4, 1107.6];
  const COMP: { code: string; col: number; row: number }[] = [
    { code: "EU", col: 0, row: 0 }, { code: "US", col: 0, row: 1 }, { code: "GB", col: 0, row: 2 }, { code: "JP", col: 0, row: 3 },
    { code: "AU", col: 1, row: 0 }, { code: "NZ", col: 1, row: 1 }, { code: "CN", col: 1, row: 2 },
    { code: "KR", col: 2, row: 0 }, { code: "BR", col: 2, row: 1 }, { code: "MX", col: 2, row: 2 },
    { code: "IL", col: 3, row: 0 }, { code: "GE", col: 3, row: 1 }, { code: "CA", col: 3, row: 2 },
  ];

  const OPT_FRAMES = [{ x: 137.1 }, { x: 548.5 }, { x: 960 }];
  const OPT_TOP = 240, OPT_BOT = 468.6, OPT_W = 342.9;
  const BD_AREA = { x: 548.6, y: 171.5, w: 342.9, h: 342.9 };

  const sizeBox = () => {
    const area = { x: 815.5, y: 173.4, w: 486.2, h: 374.9 };
    const wmm = Number(f.width) || 110, hmm = Number(f.height) || 80;
    const k = Math.min(area.w / wmm, area.h / hmm) * 0.92;
    const bw = wmm * k, bh = hmm * k;
    return { x: area.x + (area.w - bw) / 2, y: area.y + (area.h - bh) / 2, w: bw, h: bh };
  };

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
        return (<>
          {patch(118, 658, 70, 54, "welarrow")}
          <button aria-label="start" onClick={() => { setArrowFly(true); go("front"); setTimeout(() => setArrowFly(false), SLIDE_MS + 80); }}
            style={{ ...px(122, 662, 60, 48), ...ghost }}>
            <svg viewBox="0 0 60 40" width="60" height="40"><line x1="13" y1="24" x2="47" y2="24" stroke={BAR_RED} strokeWidth="3" /><polyline points="37,13.5 47.5,24 37,34.5" fill="none" stroke={BAR_RED} strokeWidth="3" /></svg>
          </button>
        </>);
      case "vision":
        return (<>
          {patch(1213, 421, 87, 17, "cnt")}
          <span style={{ ...px(1178, 422, 110, 15), font: `11px ${HNW}`, color: "#111", textAlign: "right" }}>{vision.trim() ? vision.trim().split(/\s+/).length : 0} / 300 {t("words")}</span>
          <textarea value={vision} onChange={(e) => setVision(e.target.value)} maxLength={2200}
            style={{ ...px(148, 246, 1144, 168), ...inputStyle, fontStyle: "normal", textDecoration: "none", resize: "none", lineHeight: 1.5, overflow: "auto", background: "transparent" }} />
          {/* round 45: two BLACK buttons per mock — upload (with "(Optional)")
              and "Surprise me", which cycles ideas on every click */}
          {patch(134, 476, 745, 44, "visbtns")}
          {patch(950, 470, 360, 56, "visbtn2")}
          <label style={{ ...px(137.1, 480, 342.9, 34.3), cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: "#111", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4, textTransform: "none" }}>
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
              const file = e.target.files?.[0]; if (!file) { setSketch(null); return; }
              const rd = new FileReader(); rd.onload = () => setSketch(String(rd.result)); rd.readAsDataURL(file);
            }} />
            {t("Upload a sketch or a photo (Optional)")}
            {sketch && <span style={{ position: "absolute", left: 0, top: 38, width: 343, font: `12px ${HNW}`, color: "#3f6d2a", textAlign: "center" }}>{t("✓ sketch attached")}</span>}
          </label>
          <button onClick={() => { setVision(IDEAS[Math.floor(Math.random() * IDEAS.length)]); setIdeaN((n) => n + 1); }}
            style={{ ...px(532, 480, 341.4, 34.3), cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: "#111", color: "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4 }}>
            {t("Surprise me")}
          </button>
        </>);
      case "front": {
        /* size area: top = the Producer row's input RULE (round 9 #4),
           bottom = Wine Type's baseline (design row pitch 30) */
        const area = { right: 1302.86, top: 253.77, w: 488.43, h: 297.5 };
        const wmm = Number(f.width) || 110, hmm = Number(f.height) || 80;
        const k = Math.min(area.w / wmm, area.h / hmm);
        const bw = wmm * k, bh = hmm * k;
        return (<>
          {/* round 47 removed the vision intro; ROUND 51 #1 (owner): the
              fields-are-optional note returns under the title */}
          {patch(134, 166, 700, 46, "intro")}
          <span style={{ ...px(136.97, 183.62 - 15.5, 660, 20), font: `15px ${HNW}`, color: "#111", lineHeight: "20px" }}>
            {t("Feel free to leave out fields you don't want on your front label.")}</span>
          {/* cover baked E.g. column incl. its underlines */}
          {patch(263, 234, 572, 390, "phcol")}
          {FRONT_ROWS.map((k2, i) => {
            const base = 251.27 + i * 30;   /* design pitch 30 (round 8 #2) */
            return (
              <span key={k2}>
                <input value={f[k2] || ""} placeholder={t(FRONT_PH[i])}
                  onChange={(e) => setF((m) => ({ ...m, [k2]: e.target.value }))}
                  style={{ ...px(264.9, base - IN_BASE, 450, 20), ...inputStyle }} />
                {/* rule ends exactly at the window's horizontal centre (#3) */}
                {rowLine(264.9, base + 2.5, 720 - 264.9, `ln${i}`)}
              </span>
            );
          })}
          {/* cover the ENTIRE baked size area (rect + diagonal + pluses whose
              arms reach x1319.34 / y154.95-565.02 + dashed line y617.1) */}
          {patch(806, 148, 517, 480, "szarea")}
          {/* left tips of the baked corner pluses reach x798, past the big patch */}
          {patch(796, 155, 11, 36, "szl1")}
          {patch(796, 531, 11, 36, "szl2")}
          {/* the ANIMATED OUTER FRAME: 1px black + corner pluses + the
              design's corner-to-corner diagonal (round 7 #9). Edge-anchored
              layout: the top-right plus NEVER moves; size changes glide via
              width/height transitions (quick-in, prolonged-out easing).
              Round 16 #3: the frame GROWS DURING the slide (its slice fades
              in place), timed to land together with the last input row */}
          {<div key="szf" style={{
            position: "absolute", right: W - area.right - 16.5, top: area.top - 16.5,
            width: bw + 33, height: bh + 33,
            transition: `width 600ms ${EASE_IO}, height 600ms ${EASE_IO}`,
            animation: inSlide ? `szGrow 800ms ${EASE_IO} 90ms both` : "none",
            transformOrigin: "calc(100% - 16.5px) 16.5px",
            pointerEvents: "none",
          }}>
            {/* inset 16 (not 16.5): the 1px border draws INSIDE the box, so
                its centreline lands exactly on the pluses' 16.5 axis
                (round 12 #2 — left pluses looked shifted off the line) */}
            <div style={{ position: "absolute", inset: 16, border: "1px solid #111" }} />
            <svg style={{ position: "absolute", left: 16.5, top: 16.5, width: "calc(100% - 33px)", height: "calc(100% - 33px)" }} viewBox="0 0 100 100" preserveAspectRatio="none">
              <line x1="100" y1="0" x2="0" y2="100" stroke="#000" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            </svg>
            {([["left", "top"], ["right", "top"], ["left", "bottom"], ["right", "bottom"]] as const).map(([hx, vy], ci) => (
              <svg key={ci} style={{ position: "absolute", [hx]: 0, [vy]: 0, width: 33, height: 33 }} viewBox="0 0 33 33">
                <line x1="16.5" y1="0.5" x2="16.5" y2="32.5" stroke="#000" strokeWidth="3" />
                <line x1="0.5" y1="16.5" x2="32.5" y2="16.5" stroke="#000" strokeWidth="3" />
              </svg>
            ))}
          </div>}
          {/* Width/Height block right-aligned to the size box's right edge
              (round 10 #1), all on Volume's baseline; caption, number and
              unit share ONE baseline-aligned flex line; only the NUMBER
              carries the underline, sized to its digits */}
          <div style={{ position: "absolute", right: W - 1302.86, top: 611.27 - WH_BASE, display: "flex", alignItems: "baseline" }}>
            {([["Width:", "width"], ["Height:", "height"]] as const).map(([cap, key2], gi) => (
              <span key={key2} style={{ display: "flex", alignItems: "baseline", marginLeft: gi ? 24 : 0 }}>
                <span style={{ font: `700 14px ${HNW}`, lineHeight: "15px" }}>{t(cap)}</span>
                <input value={f[key2]} onChange={(e) => setF((m) => ({ ...m, [key2]: e.target.value.replace(/[^\d.]/g, "") }))}
                  style={{ width: Math.max(1, (f[key2] || "").length) * 8.2 + 4, font: `italic 14px ${HNW}`, lineHeight: "15px", border: "none", borderBottom: "1px solid #111", outline: "none", background: "transparent", padding: 0, textAlign: "center", marginLeft: 3 }} />
                <span style={{ font: `italic 14px ${HNW}`, lineHeight: "15px", marginLeft: 4 }}>{t("mm")}</span>
              </span>
            ))}
          </div>
        </>);
      }
      case "loader": {
        /* round 19: VISIBLE, never-stalling movement — fast creep for the
           first ~25s (1.2%/s), then a slow trickle; monotonic via fillMax */
        const el = Date.now() - dreamT.current + tick * 0;
        const creep = el < 25000 ? (el / 1000) * 0.012 : Math.min(0.45, 0.3 + ((el - 25000) / 1000) * 0.003);
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
          <span style={{ ...px(0, 522, W, 18), font: `italic 13px ${HNW}`, color: "#555", textAlign: "center", display: "block" }}>
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
                    {miniGlass("var" + fi, Math.min(0.9, 0.14 + ((Date.now() - varT.current) / 45000) * 0.75 + tick * 0))}
                  </div>
                )}
                {selected === fi && dashedBox(lx, ly, lw, lh, "selD" + fi)}
                {cross(lx, ly, `tl${fi}`)}{cross(lx + lw, ly, `tr${fi}`)}
                {cross(lx, ly + lh, `bl${fi}`)}{cross(lx + lw, ly + lh, `br${fi}`)}
                {/* the column's dot switcher, centered to the label */}
                {nDots > 1 && Array.from({ length: nDots }, (_, k) => (
                  <button key={"vd" + fi + k} onClick={() => setStyleView((p) => { const n = [...p]; n[fi] = k; return n; })}
                    aria-label={`view ${fi}-${k}`}
                    /* round 61 #1: dots sit midway between label and button */
                    style={{ ...px(lx + lw / 2 + (k - (nDots - 1) / 2) * 22 - 9, (ly + lh + 565) / 2 - 9, 18, 18), ...ghost }}>
                    <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 9, height: 9, borderRadius: 5, border: "1px solid #111", background: (styleView[fi] || 0) === k ? "#111" : "#fff", boxSizing: "border-box" }} />
                  </button>
                ))}
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
                {t("Create " + STYLE_NAMES[fi] + " Variations")}</div>
              <div style={{ ...px(fr.x, 634 - 13, OPT_W, 26), display: "flex", alignItems: "center", justifyContent: "center", columnGap: 10 }}>
                <span style={{ width: 15, height: 15, borderRadius: "50%", border: "2px solid #C9C7BF", background: "#fff", boxSizing: "border-box" }} />
                <span style={{ font: `700 15px ${HNW}`, color: "#C9C7BF", lineHeight: `${fm.a + fm.d}px`, transform: `translateY(${(17 - ((26 - (fm.a + fm.d)) / 2 + fm.a)).toFixed(2)}px)` }}>{t("Select")}</span>
              </div>
            </span>
          ))}
          {/* the buttons live on every state (round 51 #4) */}
          {dreams.length > 0 && OPT_FRAMES.map((fr, fi) => (
            <button key={"cv" + fi} onClick={() => requestVariations(fi)}
              style={{ ...px(fr.x + 0.2, 565, OPT_W, 34.3), cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: "#111", color: "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4 }}>
              {t("Create " + STYLE_NAMES[fi] + " Variations")}</button>
          ))}
          {/* Select radios — one per column, marking the VIEWED version */}
          {dreams.length > 0 && OPT_FRAMES.map((fr, fi) => {
            const on = selected === fi;
            const lbl = t("Select");
            return (
              <button key={"sr" + fi} onClick={() => { if (!dreams[fi]) return; setSelected(selected === fi ? -1 : fi); setWarn(""); }}
                style={{ ...px(fr.x, 634 - 13, OPT_W, 26), ...ghost, display: "flex", alignItems: "center", justifyContent: "center", columnGap: 10, textTransform: "none", cursor: "pointer" }}>
                <span style={{ position: "relative", width: 15, height: 15, borderRadius: "50%", border: "2px solid #111", background: "#fff", boxSizing: "border-box", flex: "0 0 auto" }}>
                  {on && <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 7.5, height: 7.5, borderRadius: "50%", background: "#111" }} />}
                </span>
                {/* round 47: one explicit baseline in every browser */}
                <span style={{ font: `700 15px ${HNW}`, color: "#111", lineHeight: `${fm.a + fm.d}px`, whiteSpace: "nowrap", transform: `translateY(${(17 - ((26 - (fm.a + fm.d)) / 2 + fm.a)).toFixed(2)}px)` }}>{lbl}</span>
              </button>
            );
          })}
        </>);
      }
      case "backdetails":
        return (<>
          {patch(560, 421, 122, 17, "cnt2")}
          <span style={{ ...px(552, 422, 116, 15), font: `11px ${HNW}`, textAlign: "right" }}>{(b.description || "").trim() ? (b.description || "").trim().split(/\s+/).length : 0} / 300 {t("words")}</span>
          {/* round 45: "Wine Description" lives INSIDE the box as a
              placeholder; the baked heading above is covered */}
          {patch(134, 168, 300, 44, "wdesc")}
          <textarea value={b.description || ""} placeholder={t("Wine Description")}
            onChange={(e) => setB((m) => ({ ...m, description: e.target.value }))}
            style={{ ...px(148, 251, 528, 168), ...inputStyle, fontStyle: "normal", textDecoration: "none", fontSize: 14, resize: "none", lineHeight: 1.45, overflow: "auto", background: "transparent" }} />
          {/* cover baked E.g. column incl. its underlines (they overrun the
              right margin in the artboard) */}
          {patch(985, 228, 380, 242, "bpcol")}
          {BACK_ROWS.map((k, i) => {
            const base = 247.11 + i * 32;   /* design pitch 32 (round 8 #2) */
            return (
              <span key={k}>
                <input value={b[k] || ""} placeholder={t(BACK_PH[i])}
                  onChange={(e) => setB((m) => ({ ...m, [k]: e.target.value }))}
                  style={{ ...px(989.6, base - IN_BASE, 310, 20), ...inputStyle }} />
                {rowLine(989.6, base + 2.5, 313.3, `bln${i}`)}
              </span>
            );
          })}
          {/* ROUND 27: honest barcode. "Create Barcode" invented random
              digits — gone. The winery types its own GS1 GTIN; we validate
              the checksum live and draw a print-perfect EAN-13 on the back
              label. The GS1 link is deliberately quiet (owner: don't
              disturb the design). Baked button rects are covered white. */}
          {patch(136, 476, 556, 44, "bcbtns")}
          {patch(136, 542, 440, 66, "bcnote")}
          {/* round 28 #1: "Barcode:" label — same 700 15px as the baked
              form labels ("Producer Company:" is class st3) */}
          <span style={{ ...px(138.04, 500 - 12.9, 112, 16), font: `700 15px ${HNW}`, lineHeight: "16px" }}>{t("Barcode:")}</span>
          {/* input starts at 252 — the Georgian label is ~40px wider than
              the English one and must never touch the placeholder */}
          <input value={gtin} onChange={(e) => setGtin(e.target.value)} placeholder="E.g. 4860012345676"
            style={{ ...px(252, 500 - IN_BASE, 240, 20), ...inputStyle }} />
          {rowLine(252, 502.5, 243.3, "gtln")}
          {gtin.trim() && (
            <span style={{ ...px(252, 518, 320, 16), font: `11px ${HNW}`, lineHeight: "16px", color: gtinValid ? "#3f6d2a" : "#8e2b2b" }}>
              {gtinValid ? t("✓ barcode will be drawn") : t("needs 12 or 13 digits")}
            </span>
          )}
          {(lang === "ge"
            ? ["ჩაწერე შენი GS1 GTIN ნომერი და ბეჭდვისთვის", "მზა შტრიხკოდს უკანა ეტიკეტზე ჩვენ დავიტანთ."]
            : ["Enter your GS1 GTIN number and we'll draw", "a print-perfect barcode into your back label."]
          ).map((ln, i) => (
            <span key={"bc" + i} style={{ ...px(138.7, 557.83 + i * 18 - 12.9, 440, 16), font: `13px ${HNW}`, color: "#111", lineHeight: "16px", whiteSpace: "nowrap" }}>{ln}</span>
          ))}
          <a href="https://www.gs1.org/standards/get-barcodes" target="_blank" rel="noreferrer"
            style={{ ...px(138.7, 557.83 + 2 * 18 - 12.9, 320, 15), font: `italic 11px ${HNW}`, color: "#8a8a8a", textDecoration: "underline", lineHeight: "15px" }}>
            {t("No GTIN yet? Register at gs1.org")}</a>
          {/* round 22 #7: the QR note is OUTLINED in the artboard — covered
              and rendered live so it translates, plus the price line */}
          {patch(748, 542, 400, 64, "qrnote")}
          {(lang === "ge"
            ? ["უნიკალური QR კოდი და პროდუქტის", "ვებ-გვერდი ინგრედიენტებით."]
            : ["If you don't have a QR code, we'll generate", "one and link it to a dedicated page with your wine's", "ingredients, nutrition, and product information."]
          ).map((ln, i) => (
            <span key={i} style={{ ...px(752.4, 557.83 + i * 18 - 12.9, 400, 16), font: `13px ${HNW}`, color: "#111", lineHeight: "16px", whiteSpace: "nowrap" }}>{ln}</span>
          ))}
          {/* round 8 #5: all four buttons start WHITE; the clicked mode
              (create, or upload once a file is picked) stays black */}
          {(() => {
            const modeStyle = (active: boolean): React.CSSProperties => ({
              /* classic theme's global CSS uppercases <label> — undo it */
              cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, textTransform: "none", transition: `all 240ms ${EASE}`,
              background: active ? "#111" : "#fff", color: active ? "#fff" : "#111",
              border: "1px solid #111", boxSizing: "border-box",
              display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4,
            });
            return (<>
              <button onClick={() => { setQrImg(""); setQrMode(qrMode === "create" ? "" : "create"); }} style={{ ...px(754.29, 480, 240.1, 34.3), ...modeStyle(qrMode === "create") }}>{t("Create QR Code")}</button>
              {/* owner 2026-09-07 / round 28 #2: with Create QR active, the
                  ingredients upload is an underlined TEXT line one empty row
                  under the QR paragraph — no button shape */}
              {qrMode === "create" && (
                <label style={{ ...px(752.4, 557.83 + ((lang === "ge" ? 3 : 4) + 1) * 18 - 12.9, 300, 16), font: `13px ${HNW}`, lineHeight: "16px", color: "#111", textDecoration: "underline", textTransform: "none", cursor: "pointer", whiteSpace: "nowrap" }}>
                  <input type="file" accept=".txt,.md,.csv,text/plain" style={{ display: "none" }} onChange={(e) => {
                    const file = e.target.files?.[0]; if (!file) return;
                    const rd = new FileReader(); rd.onload = () => setIngredients(String(rd.result).slice(0, 20000)); rd.readAsText(file);
                  }} />
                  {ingredients ? t("Ingredients uploaded ✓") : t("Upload Ingredients")}
                </label>
              )}
              <label style={{ ...px(1063.99, 480, 238.4, 34.3), ...modeStyle(qrMode === "upload") }}>
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
                  const file = e.target.files?.[0]; if (!file) return;
                  const rd = new FileReader(); rd.onload = () => { setQrImg(String(rd.result)); setQrMode("upload"); }; rd.readAsDataURL(file);
                }} />
                {t("Upload QR Code")}
                {qrImg && <span style={{ position: "absolute", left: 0, top: 38, width: 238, font: `11px ${HNW}`, color: "#3f6d2a", textAlign: "center" }}>{t("✓ QR uploaded")}</span>}
              </label>
            </>);
          })()}
        </>);
      case "compliance": {
        /* round 7 #15-17: flags.png contains a RASTER copy of the country
           names (old font) and rings — it used to cover the SVG's real
           Helvetica names AND its perfectly-placed vector rings. Now only
           small per-flag windows of the image are shown; the vector names
           and rings show through; dots sit at the rings' exact centres. */
        const RING_X = [282.87, 536.4, 788.92, 1045.54];   /* baked VECTOR ring centres (compliance.svg paths) */
        const FLAG_X = [317.7, 570.2, 822.6, 1075.0];      /* flag centres inside flags.png */
        const PNG_ROW = [351.8, 403.5, 455.5, 505.8];      /* flag row centres inside flags.png */
        /* the VISIBLE baked rings are the r=9.06 st3 paths (there is a
           second, hidden r=7.5 set 1.6px higher — round 9 trap). Their
           row pitch is IRREGULAR — exact centres from the paths
           (round 10 #3: the uniform +52 guess left a sliver of the
           baked Japan ring peeking under the cover) */
        const ROW_C = [352.87, 404.68, 457.29, 509.89];
        const RC: { code: string; col: number; row: number }[] = [
          { code: "EU", col: 0, row: 0 }, { code: "US", col: 0, row: 1 }, { code: "GB", col: 0, row: 2 }, { code: "JP", col: 0, row: 3 },
          { code: "AU", col: 1, row: 0 }, { code: "NZ", col: 1, row: 1 }, { code: "CN", col: 1, row: 2 },
          { code: "KR", col: 2, row: 0 }, { code: "BR", col: 2, row: 1 }, { code: "MX", col: 2, row: 2 },
          { code: "IL", col: 3, row: 0 }, { code: "GE", col: 3, row: 1 }, { code: "CA", col: 3, row: 2 },
        ];
        return (<>
          {/* Arabic Markets removed — cover the SVG name text + its baked ring */}
          {patch(598, 500, 170, 20, "arab")}
          {/* round 43 #2: match the flag rows' own ring size (r 7.5), not
             the bottle page's r 9 */}
          {dotBtn(536.4, 509.89, noComp, () => { if (noComp) setNoComp(false); else { setMarkets([]); setNoComp(true); } }, "nocomp", { cover: 26, ring: true, r: 7.5 })}
          <button onClick={() => { if (noComp) setNoComp(false); else { setMarkets([]); setNoComp(true); } }}
            style={{ ...px(557.2, 509.89 - 12, 200, 24), ...ghost, font: `700 15px ${HNW}`, color: "#111", textAlign: "left", textTransform: "none", lineHeight: "24px" }}>
            {t("No compliance needed")}</button>
          {RC.map(({ code, col, row }) => {
            const on = markets.includes(code);
            const cx0 = RING_X[col], cy0 = ROW_C[row];
            const NAME_X = [347.05, 601.76, 851.43, 1107.64];
            const toggle = () => setMarkets((ms) => {
              const nxt = on ? ms.filter((m) => m !== code) : [...ms, code];
              setNoComp(nxt.length === 0);
              return nxt;
            });
            return (
              <span key={code}>
                {/* round 14 #1: the whole row (ring→flag→name) is clickable */}
                <button onClick={toggle} aria-label={code}
                  style={{ ...px(cx0 - 14, cy0 - 14, NAME_X[col] + 165 - (cx0 - 14), 28), ...ghost }} />
                {/* flag window sliced from flags.png, centred on the row line */}
                <div style={{
                  ...px(FLAG_X[col] - 13, cy0 - 10, 26, 20),
                  backgroundImage: "url(/newui/flags.png)", backgroundSize: "959.8px 261.1px",
                  backgroundPosition: `${-(FLAG_X[col] - 13 - 250.9)}px ${-(PNG_ROW[row] - 10 - 289.8)}px`,
                  pointerEvents: "none",
                }} />
                {/* round 9 #5: cover the baked ring, draw our own — the
                    exact circles the final-pack page uses */}
                {dotBtn(cx0, cy0, on, () => setMarkets((ms) => on ? ms.filter((m) => m !== code) : [...ms, code]), `d${code}`, { ring: true, cover: 23 })}
              </span>
            );
          })}
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
            {cross(lx, ly, "b1")}{cross(lx + fit.w, ly, "b2")}{cross(lx, ly + fit.h, "b3")}{cross(lx + fit.w, ly + fit.h, "b4")}
            {dashedBox(lx, ly, fit.w, fit.h, "bdD")}
            <button onClick={() => go("backdetails", -1)}
              style={{ ...px(548.6, 589, 341.4, 34.3), cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: "#111", color: "#fff", border: "1px solid #111", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4 }}>{t("Edit")}</button>
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
          }));
        };
        /* round 17 #2 / round 38 #1 filters, then No Capsule always last */
        const closures = ["Cork", "Screw Cap", "Wax Seal"]
          .concat(CROWN_TYPES.includes(bottle.type) ? ["Crown Cap"] : [])
          .concat(bottle.type === "Sparkling" ? ["Sparkling Cork"] : [])
          .concat(["No Capsule"]);
        return (<>
          {/* wipe the baked column content (frame lines stay) */}
          {patch(344.4, 173.3, 956.5, 408.5, "bzone")}
          {/* live dividers + thin crosses at the new column boundaries */}
          {COLS_X.slice(1).map((dx, i) => (
            <span key={"dv" + i}>
              <div style={{ ...px(dx, 171.71, 1, 411.43), background: `repeating-linear-gradient(180deg,${DASH})`, pointerEvents: "none" }} />
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
                <button onClick={() => go("front", -1)}
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
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
              const file = e.target.files?.[0]; if (!file) return;
              const rd = new FileReader();
              rd.onload = () => {
                const url = String(rd.result);
                const im = new Image();
                im.onload = () => {
                  /* round 57 #5: BEST-GUESS real size — fit the image's
                     aspect inside a typical 110×120mm label window and
                     round to 5mm, so an oversized file can never claim
                     half the bottle */
                  const ar = im.width / Math.max(1, im.height);
                  let wmm = Math.min(110, 120 * ar);
                  let hmm = wmm / ar;
                  wmm = Math.max(40, Math.round(wmm / 5) * 5);
                  hmm = Math.max(30, Math.round(hmm / 5) * 5);
                  setCustomDims({ w: wmm, h: hmm });
                  setCustomLabel(url);
                  setAssets({ life: [] }); setAssetsSig("");
                  setBottle({ type: "", color: "", closure: "", finish: "" });
                  setWineColor("");
                  bottleTouched.current = true;
                };
                im.src = url;
              };
              rd.readAsDataURL(file);
            }} />
            {customLabel ? t("Your label ✓ — upload another") : t("Upload Another Label")}
          </label>
        </>);
      }
      case "assets": {
        /* ROUND 59 #5 (owner's Assets@3x mocks, rebuilt 1:1): FOUR equal
           marketing images in a 2×2 grid (densifying 3×3/4×4 with More
           Variations), the two shots in a SPLIT first column, and the
           Product-Landing-Page column (browser 340 + QR under it) ONLY
           when a page was requested — or on an empty preview jump.
           Otherwise the dashed frame simply ENDS after the grid.
           Geometry from the mock: frame y 243.5 h 343.5; dividers 273.5 /
           410 / 821; grid box 273² at (479, 278.75), cells 122 + 29 gaps;
           browser at (892, 279); QR 36² at (892, 522). */
        const custom = !!customLabel;
        const emptyJump = !custom && selected < 0;
        const landingCol = !custom && (qrMode === "create" || emptyJump);
        const BOX = { x: 137.5, y: 243.5, w: landingCol ? 1165.5 : 683.5, h: 343.5 };
        const GRID = 273, G2 = 29, GX = 479, GY = 278.75;
        const N = Math.max(4, lifeTarget);
        const cols = N <= 4 ? 2 : N <= 9 ? 3 : 4;
        const T = (GRID - (cols - 1) * G2) / cols;
        const head = (x: number, title: string, sub: string, spec: string) => (
          <span key={"h" + x}>
            <span style={{ ...px(x, 180 - 13, 320, 16), font: `700 15px ${HNW}`, lineHeight: "16px" }}>{t(title)}</span>
            <span style={{ ...px(x, 198 - 12, 320, 30), font: `12px ${HNW}`, color: "#111", lineHeight: "15px", whiteSpace: "pre-line" }}>{t(sub)}</span>
            <span style={{ ...px(x, 232 - 12, 320, 16), font: `12px ${HNW}`, color: "#111", lineHeight: "15px" }}>{spec}</span>
          </span>
        );
        /* round 57 #3: `quiet` cells show NO message — just the grey box */
        const slot = (x: number, y: number, w2: number, h2: number, it: { full: string; prev: string } | undefined, loadKey: string, fit: "cover" | "contain", quiet = false) =>
          it ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img key={loadKey} src={it.prev} alt="" style={{ ...px(x, y, w2, h2), objectFit: fit, animation: `nuiFadeIn ${FADE_MS}ms ${EASE}` }} />
          ) : (
            <div key={loadKey} style={{ ...px(x, y, w2, h2), background: assetsStage ? "#F4F3EE" : "#ECECEA", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              {assetsStage ? (<>
                {miniGlass(loadKey, assetFill(loadKey))}
                <span style={{ marginTop: 8, font: `14px ${HNW}`, color: "#111", letterSpacing: 2, lineHeight: "10px" }}>
                  {[0, 1, 2].map((dd) => <span key={dd} style={{ animation: `nuiDot 1.2s ${dd * 0.2}s infinite` }}>.</span>)}
                </span>
              </>) : quiet ? null : custom ? (
                <span style={{ font: `12px ${HNW}`, color: "#8a887e" }}>{t("Not yet created")}</span>
              ) : (
                <button onClick={() => go("front", -1)} style={{ ...ghost, position: "relative", width: "100%", height: "100%", font: `12px ${HNW}`, color: "#8a887e", textTransform: "none", cursor: "pointer" }}>{t("Create front label")}</button>
              )}
            </div>
          );
        return (<>
          {patch(0, 160, W, 500, "aswipe")}
          {custom
            ? head(137.5, "Product Shot", "Face", "Transparent PNG / 700x2500px / 72dpi")
            : head(137.5, "Two Product Shots", "Face & Back", "Transparent PNG / 700x2500px / 72dpi")}
          {head(411, "Four Marketing Images", "Product placed in contextual environments", "JPEG / 2500x2500px / 72dpi")}
          {landingCol && head(857, "Product Landing Page", "You will be provided with the link\nto your product page.", "")}
          {/* status line above the progress bar (round 47) */}
          {assetsStage && (
            <span style={{ ...px(0, 634, W, 16), font: `italic 12px ${HNW}`, color: "#BA141A", lineHeight: "15px", textAlign: "center", display: "block" }}>
              {t("Creating your marketing assets")} — {tStage(assetsStage)}…</span>
          )}
          {dashedBox(BOX.x, BOX.y, BOX.w, BOX.h, "asd1")}
          {!custom && <div style={{ ...px(273.5, BOX.y, 1, BOX.h), background: `repeating-linear-gradient(180deg,${DASH})`, pointerEvents: "none" }} />}
          <div style={{ ...px(410, BOX.y, 1, BOX.h), background: `repeating-linear-gradient(180deg,${DASH})`, pointerEvents: "none" }} />
          {landingCol && <div style={{ ...px(821, BOX.y, 1, BOX.h), background: `repeating-linear-gradient(180deg,${DASH})`, pointerEvents: "none" }} />}
          {cross(BOX.x, BOX.y, "as1")}{cross(BOX.x, BOX.y + BOX.h, "as2")}
          {cross(BOX.x + BOX.w, BOX.y, "as3")}{cross(BOX.x + BOX.w, BOX.y + BOX.h, "as4")}
          {!custom && (<>{cross(273.5, BOX.y, "as5")}{cross(273.5, BOX.y + BOX.h, "as6")}</>)}
          {cross(410, BOX.y, "as7")}{cross(410, BOX.y + BOX.h, "as8")}
          {landingCol && (<>{cross(821, BOX.y, "as9")}{cross(821, BOX.y + BOX.h, "as10")}</>)}
          {/* product shots — split col 1, centered per half */}
          {custom
            ? slot(213.75, 277, 120, 274, assets.front, "front shot", "contain")
            : (<>
              {slot(145.5, 277, 120, 274, assets.front, "front shot", "contain")}
              {slot(281.75, 277, 120, 274, assets.back, "back shot", "contain")}
            </>)}
          {/* the marketing grid — equal squares, no hero */}
          {Array.from({ length: N }, (_, k) => {
            const x = GX + (k % cols) * (T + G2);
            const y = GY + Math.floor(k / cols) * (T + G2);
            return <span key={"mi" + k}>{slot(x, y, T, T, assets.life[k], `lifestyle ${(k % 4) + 1}/4`, "cover", k > 0)}</span>;
          })}
          {/* landing column: browser + QR under it (mock) */}
          {landingCol && (() => {
            /* round 60 #2 (owner: "two loaders"): ONE box, ONE glass —
               the same loader carries from generation into the iframe
               load; only then the page appears */
            const ready = !!productUrl && selected >= 0;
            const BH = 340 / W * 823 + 13;
            return (<>
              <div style={{ ...px(892, 279, 340, BH), background: "#fff", borderRadius: ready ? 5 : 0, boxShadow: ready ? "0 8px 22px rgba(0,0,0,0.2)" : "none", overflow: "hidden" }}>
                {ready && (<>
                  <div style={{ height: 13, background: "#E8E8E6", display: "flex", alignItems: "center", gap: 3, padding: "0 6px" }}>
                    {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <span key={c} style={{ width: 4.5, height: 4.5, borderRadius: 3, background: c }} />)}
                    <span style={{ flex: 1, margin: "0 8px", height: 7, background: "#fff", borderRadius: 3, font: `5px ${HNW}`, color: "#999", paddingLeft: 4, lineHeight: "7px" }}>8klabels.com{productUrl}</span>
                  </div>
                  <iframe src={productUrl} title="product page" onLoad={() => setPpLoaded(true)} style={{ width: W, height: 823, transform: `scale(${340 / W})`, transformOrigin: "0 0", border: 0, pointerEvents: "none" }} />
                </>)}
                {(!ready || !ppLoaded) && (
                  <div style={{ position: "absolute", inset: 0, background: assetsStage || ready ? "#F4F3EE" : "#ECECEA", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {assetsStage || ready
                      ? miniGlass("landing", ready ? Math.max(ppFill, 0.55) : Math.min(0.9, assetFill("lifestyle 4/4")))
                      : <button onClick={() => go("front", -1)} style={{ ...ghost, position: "relative", width: "100%", height: "100%", font: `12px ${HNW}`, color: "#8a887e", textTransform: "none", cursor: "pointer" }}>{t("Create front label")}</button>}
                  </div>
                )}
              </div>
              {ready && ppLoaded && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={`/api/qr?u=${encodeURIComponent("https://8klabels.com" + productUrl)}`} alt="QR"
                  style={{ ...px(892, 522, 36, 36) }} />
              )}
            </>);
          })()}
        </>);
      }

      case "checkout": {
        /* ROUND 50 #13 (owner's Check Out copy 2 mock, rebuilt 1:1): the
           BOARD carries the whole layout — left folder-tree diagram +
           paragraph, right carousel frame with thin baked arrows, T&C
           row, four dashed pricing rows, black Pay bar, back arrow. The
           mock label raster, its caption and the five price texts were
           stripped from the SVG at build time; the overlay adds ONLY the
           live parts: slide image, caption, ring dots, prices, total and
           ghost click zones. Geometry from the SVG: frame 822.86,137.14
           480x274.29; rings cx 857.14 cy 497.28+34.43k (T&C 859.38,
           445.71); text baselines 502.2+; prices right-aligned to 1234;
           button rect 822.86,651.43,480x34.29. */
        const FR = { x: 822.86, y: 137.14, w: 480, h: 274.29 };
        type Slide = { name: string; img?: string; landing?: boolean; kind?: "front" | "back" };
        /* ROUND 47: own-label orders deliver ONLY the marketing assets */
        const slides: Slide[] = customLabel ? [
          { name: "Product_Shot_Front.png", img: assets.front?.prev, kind: "front" },
          ...Array.from({ length: Math.max(4, assets.life.length) }, (_, i) => ({ name: `Marketing_Image_${i + 1}.jpg`, img: assets.life[i]?.prev, kind: "front" as const })),
        ] : [
          { name: "Front_Label.svg", img: viewedDream(selected)?.preview || viewedDream(selected)?.dream || undefined, kind: "front" },
          { name: "Back_Label.svg", img: backPng || undefined, kind: "back" },
          { name: "Product_Shot_Front.png", img: assets.front?.prev, kind: "front" },
          { name: "Product_Shot_Back.png", img: assets.back?.prev, kind: "front" },
          ...Array.from({ length: Math.max(4, assets.life.length) }, (_, i) => ({ name: `Marketing_Image_${i + 1}.jpg`, img: assets.life[i]?.prev, kind: "front" as const })),
          /* round 53 #7: no requested QR/page → no landing slide */
          ...(qrMode === "create" ? [{ name: "Product_Page", landing: true, kind: "front" as const }] : []),
        ];
        const sl = slides[carIdx % slides.length];
        const ROWC = [497.28, 531.29, 565.71, 600.14];   // baked ring centres
        const priceAtX = (right: number, baseline: number, v: string, bold = false) => (
          <span key={"prx" + right + baseline} style={{ ...px(right - 140, baseline - (bold ? 14 : 13.5), 140, 16), font: `${bold ? 700 : 400} ${bold ? 16 : 15}px ${HNW}`, lineHeight: "16px", textAlign: "right", display: "block" }}>{v}</span>
        );
        const priceAt = (baseline: number, v: string, bold = false) => (
          /* the span's own baseline lands exactly on the baked row's */
          <span key={"pr" + baseline} style={{ ...px(1234 - 140, baseline - (bold ? 14 : 13.5), 140, 16), font: `${bold ? 700 : 400} ${bold ? 16 : 15}px ${HNW}`, lineHeight: "16px", textAlign: "right", display: "block" }}>{v}</span>
        );
        return (<>
          {/* ROUND 50 (owner follow-up): the folder tree + paragraph
              describe the FULL pack — an own-label (assets-only) order
              hides that whole left block */}
          {customLabel && !gensMode && patch(126, 158, 706, 470, "notree")}
          {/* owner (New folder): unselected rows prune their tree branch —
              row 1 (labels) removes the LABELS folder+files and its arm of
              the connector; row 3 removes the MARKETING ASSETS branch */}
          {!customLabel && !gensMode && !packSel[0] && (<>
            {patch(262, 344, 104, 232, "nolabels")}
            {patch(306, 339, 138, 7, "nolabelsline")}
          </>)}
          {!customLabel && !gensMode && !packSel[2] && patch(396, 344, 104, 275, "nomarketing")}
          {/* round 56 #6: no QR/page row → the domain line leaves the
              READ ME file list */}
          {!customLabel && !gensMode && !packSel[1] && patch(521, 566, 175, 13, "noqrfile")}
          {/* live slide inside the baked dashed frame (hidden entirely on
              the round-52 centered top-up card) */}
          {gensMode ? null : sl.landing ? (
            productUrl && selected >= 0 ? (
              <div style={{ ...px(FR.x + (FR.w - 340) / 2, FR.y + 16, 340, 340 / W * 823 + 13), background: "#fff", borderRadius: 5, boxShadow: "0 8px 22px rgba(0,0,0,0.2)", overflow: "hidden" }}>
                <div style={{ height: 13, background: "#E8E8E6", display: "flex", alignItems: "center", gap: 3, padding: "0 6px" }}>
                  {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <span key={c} style={{ width: 4.5, height: 4.5, borderRadius: 3, background: c }} />)}
                  <span style={{ flex: 1, margin: "0 8px", height: 7, background: "#fff", borderRadius: 3, font: `5px ${HNW}`, color: "#999", paddingLeft: 4, lineHeight: "7px" }}>8klabels.com{productUrl}</span>
                </div>
                <iframe src={productUrl} title="product page" style={{ width: W, height: 823, transform: `scale(${340 / W})`, transformOrigin: "0 0", border: 0, pointerEvents: "none" }} />
              </div>
            ) : notMade(FR.x + 20, FR.y + 16, FR.w - 40, FR.h - 66, "front", "nmCar")
          ) : sl.img ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={sl.img} alt={sl.name} style={{ ...px(FR.x + 20, FR.y + 15, FR.w - 40, 226), objectFit: "contain" }} />
          ) : notMade(FR.x + 20, FR.y + 16, FR.w - 40, FR.h - 66, sl.kind || "front", "nmCar")}
          {!gensMode && (<>
            {/* caption (stripped from the board, drawn live at its spot) */}
            <span style={{ ...px(FR.x, 396.04 - 12, FR.w, 16), font: `12px ${HNW}`, color: "#111", textAlign: "center", display: "block" }}>{sl.name}</span>
            {/* baked thin chevrons get ghost click zones */}
            <button aria-label="prev slide" onClick={() => setCarIdx((c) => (c + slides.length - 1) % slides.length)}
              style={{ ...px(834, 252, 36, 44), ...ghost }} />
            <button aria-label="next slide" onClick={() => setCarIdx((c) => (c + 1) % slides.length)}
              style={{ ...px(1256, 252, 36, 44), ...ghost }} />
          </>)}
          {/* T&C — baked ring + underlined text; the dot and toggle are
              live, the underlined words open the terms modal (round 52) */}
          {!gensMode && (<>
            {dotBtn(859.38, 445.71, agree, () => setAgree((a) => !a), "agree")}
            <button onClick={() => setAgree((a) => !a)} style={{ ...px(880, 436, 96, 20), ...ghost }} />
            <button aria-label="terms" onClick={() => { setTermsOpen(true); setTermsPos(0); }} style={{ ...px(977, 436, 122, 20), ...ghost, cursor: "pointer" }} />
          </>)}
          {gensMode ? (<>
            {/* ROUND 52 #2 / ROUND 53 #1 (owner): the top-up card keeps
                the thumbnail box (empty for now — image arrives later),
                same rhythm as the standard pack, centered on the page:
                everything at baked y, shifted dx -342.86. */}
            {patch(126, 158, 706, 470, "notreeg")}
            {patch(818, 128, 494, 565, "nocarg")}
            {/* owner (New folder): the top-up page is titled CREDITS */}
            {patch(130, 132, 260, 28, "gtitle")}
            <span style={{ ...px(137.15, 151.8 - 16, 300, 22), font: `700 19px ${HNW}`, lineHeight: "22px" }}>{t("CREDITS")}</span>
            {dashedBox(480, 137.14, 480, 274.29, "genFrame")}
            {cross(480, 137.14, "gf1")}{cross(960, 137.14, "gf2")}
            {cross(480, 411.43, "gf3")}{cross(960, 411.43, "gf4")}
            {dotBtn(516.52, 445.71, agree, () => setAgree((a) => !a), "agreeg", { ring: true, r: 7.5 })}
            <span style={{ ...px(542.9, 445.71 - 8.1, 340, 16), font: `15px ${HNW}`, lineHeight: "16px" }}>
              <span onClick={() => setAgree((a) => !a)} style={{ cursor: "pointer" }}>{t("I agree to the")} </span>
              <span onClick={() => { setTermsOpen(true); setTermsPos(0); }} style={{ textDecoration: "underline", cursor: "pointer" }}>{t("Terms & Conditions")}</span>
            </span>
            {[480, 514.56, 548.57, 582.86, 617.41].map((ly) => (
              <div key={"gl" + ly} style={{ ...px(480, ly, 480, 1), backgroundImage: `repeating-linear-gradient(90deg,${DASH})`, backgroundSize: "100% 1px", backgroundRepeat: "no-repeat" }} />
            ))}
            {GENS.map((g, i) => (
              <span key={g.name}>
                {dotBtn(514.28, ROWC[i], gensSel === i, () => setGensSel(i), "gen" + i, { ring: true, r: 7.5 })}
                <button onClick={() => setGensSel(i)} style={{ ...px(537, ROWC[i] - 12, 340, 24), ...ghost, textAlign: "left", textTransform: "none", font: `15px ${HNW}`, color: "#111" }}>{t(g.name)}</button>
                {priceAtX(891.14, ROWC[i] + 4.9, "$" + g.price.toFixed(2))}
              </span>
            ))}
            <span style={{ ...px(548.54, 639.48 - 14, 200, 18), font: `700 16px ${HNW}`, lineHeight: "18px" }}>{t("Total:")}</span>
            {priceAtX(891.14, 639.48, "$" + GENS[gensSel].price.toFixed(2), true)}
            <div style={{ ...px(480, 651.43, 480, 34.29), background: "#111", display: "flex", alignItems: "center", justifyContent: "center", font: `12px ${HNW}`, letterSpacing: 0.3, color: "#fff", paddingBottom: 4 }}>{t("Proceed to Payment")}</div>
            <button aria-label="pay" onClick={() => { if (requireAgree()) payForGenerations(); }} style={{ ...px(480, 651.43, 480, 34.29), ...ghost }} />
          </>) : customLabel ? (<>
            {/* own-label order: only Marketing Assets and its price */}
            {patch(822.5, 469, 481, 150, "custrows")}
            {[480, 514.56].map((ly) => (
              <div key={"cl" + ly} style={{ ...px(822.86, ly, 480, 1), backgroundImage: `repeating-linear-gradient(90deg,${DASH})`, backgroundSize: "100% 1px", backgroundRepeat: "no-repeat" }} />
            ))}
            {dotBtn(857.14, ROWC[0], !!packSel[2], () => setPackSel((ps) => ps.map((v, k) => (k === 2 ? !v : v))), "pkc", { ring: true, r: 7.5 })}
            <button onClick={() => setPackSel((ps) => ps.map((v, k) => (k === 2 ? !v : v)))}
              style={{ ...px(880, ROWC[0] - 12, 340, 24), ...ghost, textAlign: "left", textTransform: "none", font: `15px ${HNW}`, color: "#111" }}>{t("Marketing Assets")}</button>
            {priceAt(ROWC[0] + 4.9, "$" + PACK[2].price)}
            {priceAt(639.48, "$" + total, true)}
            <button aria-label="pay" onClick={() => { if (requireAgree()) proceedToPayment(); }} style={{ ...px(822.86, 651.43, 480, 34.29), ...ghost }} />
          </>) : (<>
            {/* live dots on the baked rings + row click zones */}
            {PACK.map((it, i) => (
              <span key={it.name}>
                {dotBtn(857.14, ROWC[i], !!packSel[i], () => setPackSel((ps) => ps.map((v, k) => (k === i ? !v : v))), "pk" + i)}
                <button onClick={() => setPackSel((ps) => ps.map((v, k) => (k === i ? !v : v)))}
                  style={{ ...px(880, ROWC[i] - 12, 340, 24), ...ghost }} />
                {priceAt(ROWC[i] + 4.9, "$" + it.price)}
              </span>
            ))}
            {priceAt(639.48, "$" + total, true)}
            <button aria-label="pay" onClick={() => { if (requireAgree()) proceedToPayment(); }} style={{ ...px(822.86, 651.43, 480, 34.29), ...ghost }} />
          </>)}
          {/* round 52 #1: the agree gate message under the Pay bar */}
          {warn && (
            <span style={{ ...px(gensMode ? 480 : 822.86, 694, 480, 16), font: `13px ${HNW}`, color: "#BA141A", textAlign: "center", display: "block" }}>{warn}</span>
          )}
          {/* back arrow is baked — ghost zone; a gens visit returns to the
              options page it came from */}
          <button aria-label="back" onClick={() => { if (gensMode) { setGensMode(false); go(gensReturn.current || "options", -1); } else goBack(); }}
            style={{ ...px(72, 666, 52, 40), ...ghost }} />
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
              <div style={{ ...px(0, HEADER_H, W, FOOTER_Y - HEADER_H), background: "rgba(255,255,255,0.88)", zIndex: 30 }} onClick={() => setTermsOpen(false)} />
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

  const step = STEP_OF[page];
  const thick = THICK[page];
  const bandBottom = BAND_BOTTOM[page];
  const fullSlide = (page === "front" && prev === "welcome") || page === "welcome";

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
        .nui-noscroll { scrollbar-width: none; -ms-overflow-style: none; }
        .nui-noscroll::-webkit-scrollbar { display: none; }
        @keyframes nuiDot { 0% { opacity: 0.15 } 30% { opacity: 1 } 60%, 100% { opacity: 0.15 } }
        @keyframes nuiWineRise { from { transform: translateY(92px) } to { transform: translateY(4px) } }
        @keyframes nuiIn { from { transform: translateX(${dir > 0 ? "100%" : "-100%"}) } to { transform: translateX(0) } }
        @keyframes nuiOut { from { transform: translateX(0) } to { transform: translateX(${dir > 0 ? "-100%" : "100%"}) } }
        @keyframes nuiInPx { from { transform: translateX(${dir > 0 ? 1440 : -1440}px) } to { transform: translateX(0) } }
        @keyframes nuiOutPx { from { transform: translateX(0) } to { transform: translateX(${dir > 0 ? -1440 : 1440}px) } }
        @keyframes arrowFly { from { left: 122px } to { left: 1324px } }
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

          {/* STATIC header (real fonts, extracted geometry) */}
          <div style={{ ...px(0, 0, W, HEADER_H), background: "#000" }}>
            <button onClick={() => go("welcome", -1)} style={{ ...px(138.2, 25.5, 100, 20), ...ghost, font: `700 19px ${HNW}`, color: "#fff", textAlign: "left", textTransform: "none" }}>8K</button>
            {/* menu + ENG/GEO: one baseline, even gaps, right edge on the
               progress line's right edge x1303 (round 22 #11) */}
            <div style={{ position: "absolute", right: W - 1303, top: 27.5, display: "flex", alignItems: "baseline", columnGap: 44 }}>
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

          {/* STATIC progress bar (hidden on welcome & checkout); round 41
              #13: while sliding INTO checkout the white zone stays, so the
              outgoing board's baked OLD bar can never flash through */}
          {(thick !== null || (page === "checkout" && prev !== null)) && (
            <div style={{ ...px(0, 660, W, FOOTER_Y - 660), background: "#fff" }}>
              {thick === null ? null : (<>
              {/* round 46: baseline ends where the last circle ends */}
              <div style={{ ...px(137.14, 685.09 - 660, 1302.86 - 137.14, 1), background: "#111" }} />
              <div style={{ ...px(142.06, 684.09 - 660, thick - 142.06, 3), background: BAR_RED, transition: `width ${SLIDE_MS}ms ${EASE}` }} />
              {STEPS.map((st, i) => {
                const on = step >= i;
                return (
                  /* dots navigate (round 41 #10); reached dots are RED */
                  <button key={"d" + i} onClick={() => { if (st.page !== page) { barJumped.current = true; go(st.page, ORDER.indexOf(st.page) > ORDER.indexOf(page) ? 1 : -1); } }}
                    style={{ ...px(CIRCLE_X[i] - 12, 685.59 - 12 - 660, 24, 24), ...ghost }}>
                    <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 9.8, height: 9.8, borderRadius: 5, border: on ? "none" : "1px solid #111", background: on ? BAR_RED : "#fff", transition: `background 300ms ${EASE}`, boxSizing: "border-box" }} />
                  </button>
                );
              })}
              {STEPS.map((st, i) => i > 0 && (
                <button key={st.label} onClick={() => { if (st.page !== page) { barJumped.current = true; go(st.page, ORDER.indexOf(st.page) > ORDER.indexOf(page) ? 1 : -1); } }}
                  style={{ position: "absolute", top: 708.5 - 660, height: 18, ...ghost, font: `700 15px ${HNW}`, color: "#111", lineHeight: "15px", textTransform: "none",
                    ...(i === STEPS.length - 1 ? { left: 1303.41 - 260, width: 260, textAlign: "right" as const } : { left: CIRCLE_X[i] - 130, width: 260, textAlign: "center" as const }) }}>
                  {t(st.label)}</button>
              ))}
              {/* back arrow — hidden while the loader runs (round 46) */}
              {page !== "loader" && (
                <button aria-label="back" onClick={() => { barJumped.current = false; goBack(); }} style={{ ...px(56, 666 - 660, 60, 40), ...ghost }}>
                  <svg viewBox="0 0 60 40" width="60" height="40"><line x1="47" y1="20" x2="13" y2="20" stroke="#000" strokeWidth="3" /><polyline points="23,9.5 12.5,20 23,30.5" fill="none" stroke="#000" strokeWidth="3" /></svg>
                </button>
              )}
              {/* forward arrow — RED, hidden while the loader runs */}
              {page !== "loader" && <button aria-label="next"
                onClick={() => {
                  barJumped.current = false;
                  if (page === "front") go("vision");
                  else if (page === "vision") {
                    /* round 54 #2: a REAL generation asks for confirmation;
                       unchanged inputs just move along */
                    if (dreams.length && frontSig === sigFront()) nextFromFront();
                    else setConfirmModal("labels");
                  }
                  else if (page === "options") {
                    /* round 7 #12: warn instead of silently ignoring */
                    if (selected >= 0) go("backdetails");
                    else { setWarn(t("Select a label design to continue")); setTimeout(() => setWarn(""), 3200); }
                  }
                  else if (page === "backdetails") go("compliance");
                  else if (page === "compliance") {
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
                }}
                style={{ ...px(1324, 666 - 660, 60, 40), ...ghost }}>
                <svg viewBox="0 0 60 40" width="60" height="40"><line x1="13" y1="20" x2="47" y2="20" stroke={BAR_RED} strokeWidth="3" /><polyline points="37,9.5 47.5,20 37,30.5" fill="none" stroke={BAR_RED} strokeWidth="3" /></svg>
              </button>}
              </>)}
            </div>
          )}

          {/* ROUND 59 #2: the gate message floats at ROOT level so it can
              sit truly midway between the selection row and the bar line */}
          {warn && thick !== null && (
            <span style={{ ...px(0, 648, W, 16), font: `13px ${HNW}`, color: "#BA141A", textAlign: "center", display: "block", zIndex: 7, position: "absolute" }}>{warn}</span>
          )}

          {/* welcome→vision: the arrow flies right while the page slides (owner #3) */}
          {arrowFly && (
            <div style={{ position: "absolute", top: 662, left: 122, width: 60, height: 48, animation: `arrowFly ${SLIDE_MS}ms ${EASE} forwards`, pointerEvents: "none", zIndex: 6 }}>
              <svg viewBox="0 0 60 40" width="60" height="40"><line x1="13" y1="24" x2="47" y2="24" stroke={BAR_RED} strokeWidth="3" /><polyline points="37,13.5 47.5,24 37,34.5" fill="none" stroke={BAR_RED} strokeWidth="3" /></svg>
            </div>
          )}

          {/* STATIC footer bar */}
          <div style={{ ...px(0, FOOTER_Y, W, H - FOOTER_Y), background: "#000" }}>
            <span style={{ ...px(138.4, 779.4 - FOOTER_Y, 700, 16), font: `300 11px ${HNW}`, color: "#fff" }}>{t("© 8K Labels — a demo interface built from your uploaded mockup")}</span>
            {/* ROUND 60 #3 (owner): the credit balance lives HERE — white
                text, red number, right edge flush with the bar's last dot */}
            <div style={{ ...px(700, 779.4 - FOOTER_Y - 2, 602.86, 18), display: "flex", justifyContent: "flex-end", alignItems: "baseline", columnGap: 16 }}>
              <span style={{ font: `300 11px ${HNW}`, color: "#8a8a8a", whiteSpace: "nowrap" }}>{t("1 Credit = 3 new labels")}</span>
              <span style={{ font: `700 13px ${HNW}`, color: "#fff", whiteSpace: "nowrap" }}>
                {t("Credits available:")}{" "}
                {spinning ? (
                  <span style={{ color: BAR_RED }}>{spinDigit}</span>
                ) : genCredits === 0 ? (
                  <button onClick={() => { gensReturn.current = pageNow.current; setGensMode(true); setGensSel(0); go("checkout"); }}
                    style={{ ...ghost, font: `700 13px ${HNW}`, color: BAR_RED, textDecoration: "underline", textTransform: "none", display: "inline" }}>{t("Add credit")}</button>
                ) : (
                  <span style={{ color: BAR_RED }}>{genCredits}</span>
                )}
              </span>
            </div>
            {/* round 56 #3 — TEMP DEV SWITCH (remove before launch): off =
                every generation is faked with already-made images */}
            <button aria-label="toggle live generation"
              onClick={() => { const v = !liveGen; setLiveGen(v); liveGenRef.current = v; try { localStorage.setItem("nui-live-gen", v ? "1" : "0"); } catch { } }}
              style={{ ...px(600, 779.4 - FOOTER_Y - 3, 130, 18), ...ghost, display: "flex", alignItems: "center", columnGap: 6, textTransform: "none" }}>
              <span style={{ width: 22, height: 12, borderRadius: 7, border: "1px solid #666", position: "relative", background: "#111", boxSizing: "border-box", flex: "0 0 auto" }}>
                <span style={{ position: "absolute", top: 1.5, left: liveGen ? 11.5 : 1.5, width: 7, height: 7, borderRadius: 4, background: liveGen ? "#3fd05e" : "#666", transition: "left 160ms" }} />
              </span>
              <span style={{ font: `300 9px ${HNW}`, color: "#666", whiteSpace: "nowrap" }}>live generation</span>
            </button>

          </div>

          {busyMsg && <div style={{ ...px(1090, 78, 320, 20), font: `13px ${HNW}`, color: "#8a887e", textAlign: "right" }}>{busyMsg}</div>}

          {/* ROUND 56 #7/#8: the mailing-list GIFT modal — global, because
              the credit gate can fire from vision, options or assets */}
          {emailModal && (<>
            <div style={{ ...px(0, HEADER_H, W, 660 - HEADER_H), background: "rgba(255,255,255,0.88)", zIndex: 20 }} onClick={() => setEmailModal("")} />
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

          {/* ROUND 54 #2: pre-generation confirmation popups — every
              detail that shapes the result, laid out clean, with Create /
              Edit Details / ✕ in the house style */}
          {confirmModal && (() => {
            /* round 59 #3/#4: centered in the white band; title 4x, the
               credits sentence 2x */
            const B = { x: 350, y: 84, w: 740, h: 560 };
            const cap = (txt: string) => <span style={{ font: `700 12px ${HNW}`, lineHeight: "16px", whiteSpace: "nowrap" }}>{txt}</span>;
            const val = (txt: string) => <span style={{ font: `italic 12px ${HNW}`, lineHeight: "16px", marginLeft: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{txt || "—"}</span>;
            const isL = confirmModal === "labels";
            const FR_CAPS = ["Producer:", "Wine Name:", "Appellation:", "Classification:", "Vintage:", "Grape Variety:", "Region, Country:", "Special mention:", "Sweetness:", "Colour:", "Wine Type:", "Alcohol:", "Volume:"];
            const frontThumb = customLabel || viewedDream(selected)?.preview || viewedDream(selected)?.dream || "";
            const onCreate = () => {
              /* round 56 #7: creating SPENDS a credit (or routes to the
                 gift modal / purchase page) */
              setConfirmModal("");
              if (isL) { if (requestCredit("vision")) nextFromFront(); }
              else if (requestCredit("assets")) { confirmedAssetsSig.current = pendingAssetsSig.current; setAssetsTick((t2) => t2 + 1); }
            };
            const onEdit = () => { setConfirmModal(""); go(isL ? "front" : "bottle", -1); };
            return (<>
              <div style={{ ...px(0, HEADER_H, W, FOOTER_Y - HEADER_H), background: "rgba(255,255,255,0.88)", zIndex: 40 }} onClick={() => setConfirmModal("")} />
              <div style={{ ...px(B.x, B.y, B.w, B.h), background: "#fff", border: "1px solid #111", zIndex: 41, boxSizing: "border-box" }}>
                <button aria-label="close confirm" onClick={() => setConfirmModal("")}
                  style={{ position: "absolute", right: 6, top: 4, ...ghost, font: `15px ${HNW}`, color: "#111", width: 24, height: 24 }}>✕</button>
                <span style={{ position: "absolute", left: 32, top: 24, font: `700 60px ${HNW}`, lineHeight: "64px", whiteSpace: "nowrap" }}>{t("Check your details")}</span>
                <span style={{ position: "absolute", left: 32, top: 102, width: B.w - 64, font: `26px ${HNW}`, lineHeight: "34px" }}>
                  {t(isL ? "Make sure everything is correct — creating labels costs credits." : "Make sure everything is correct — creating marketing assets costs credits.")} {t("You have")} <span style={{ fontWeight: 700, color: BAR_RED }}>{genCredits}</span>.
                </span>
                <div style={{ position: "absolute", left: 32, top: 180, width: B.w - 64, height: 1, background: "#111" }} />
                {isL ? (<>
                  <div style={{ position: "absolute", left: 32, top: 196, width: 500, display: "flex" }}>
                    {cap(t("Prompt:"))}
                    <span style={{ font: `italic 12px ${HNW}`, lineHeight: "16px", marginLeft: 5, height: 32, overflow: "hidden" }}>{vision.trim() || "—"}</span>
                  </div>
                  <div style={{ position: "absolute", left: 566, top: 196, display: "flex" }}>{cap(t("Sketch:"))}{val(sketch ? t("attached ✓") : "—")}</div>
                  {sketch && (/* eslint-disable-next-line @next/next/no-img-element */
                    <img src={sketch} alt="" style={{ position: "absolute", left: 566, top: 216, width: 60, height: 42, objectFit: "cover", border: "1px solid #111" }} />)}
                  {FR_CAPS.map((c, i) => (
                    <div key={c} style={{ position: "absolute", left: 32 + (i % 2) * 345, top: 250 + Math.floor(i / 2) * 26, width: 335, display: "flex" }}>
                      {cap(t(c))}{val(f[FRONT_ROWS[i]] || "")}
                    </div>
                  ))}
                  <div style={{ position: "absolute", left: 377, top: 250 + 6 * 26, width: 335, display: "flex" }}>
                    {cap(t("Size:"))}{val(`${f.width || 110} × ${f.height || 80} ${t("mm")}`)}
                  </div>
                </>) : (<>
                  <div style={{ position: "absolute", left: 32, top: 196, display: "flex" }}>{cap(`${t("Front Label")}:`)}</div>
                  {frontThumb ? (/* eslint-disable-next-line @next/next/no-img-element */
                    <img src={frontThumb} alt="" style={{ position: "absolute", left: 32, top: 216, maxWidth: 190, maxHeight: 120, border: "1px solid #111" }} />
                  ) : <span style={{ position: "absolute", left: 32, top: 218, font: `italic 12px ${HNW}` }}>—</span>}
                  <div style={{ position: "absolute", left: 32, top: 352, display: "flex" }}>{cap(`${t("Back Label")}:`)}</div>
                  {backPng && !customLabel ? (/* eslint-disable-next-line @next/next/no-img-element */
                    <img src={backPng} alt="" style={{ position: "absolute", left: 32, top: 372, maxWidth: 190, maxHeight: 105, border: "1px solid #111" }} />
                  ) : <span style={{ position: "absolute", left: 32, top: 374, font: `italic 12px ${HNW}` }}>—</span>}
                  {([
                    ["Wine Name:", f.wine || (customLabel ? "—" : DEMO_FRONT.wine)],
                    ["Wine Color", wineColor],
                    ["Bottle Type", bottle.type],
                    ["Bottle Color", bottle.color],
                    ["Closure Type", bottle.closure],
                    ["Closure Color", bottle.closure === "No Capsule" ? "—" : bottle.finish],
                    ["Label size:", `${customLabel ? customDims.w : f.width || 110} × ${customLabel ? customDims.h : f.height || 80} ${t("mm")}`],
                  ] as const).map(([c, v], i) => (
                    <div key={c} style={{ position: "absolute", left: 300, top: 198 + i * 30, width: 400, display: "flex", alignItems: "center" }}>
                      {cap(t(c).endsWith(":") ? t(c) : t(c) + ":")}{val(v ? t(v) : "")}
                      {c === "Closure Color" && bottle.closure !== "No Capsule" && (
                        <span style={{ width: 14, height: 14, background: shadeRgb(), border: "1px solid #111", marginLeft: 8, flex: "0 0 auto" }} />
                      )}
                    </div>
                  ))}
                </>)}
                <button onClick={onCreate}
                  style={{ position: "absolute", left: 32, top: B.h - 76, width: 328, height: 34.3, cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: "#111", color: "#fff", border: "none", paddingBottom: 4 }}>
                  {t("Create")}</button>
                <button onClick={onEdit}
                  style={{ position: "absolute", left: 380, top: B.h - 76, width: 328, height: 34.3, cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: "#fff", color: "#111", border: "1px solid #111", boxSizing: "border-box", paddingBottom: 4 }}>
                  {t("Edit Details")}</button>
              </div>
            </>);
          })()}

        </div>
      </div>
    </main>
  );
}
