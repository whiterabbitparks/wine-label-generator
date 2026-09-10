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

const ORDER = ["welcome", "vision", "front", "loader", "options", "backdetails", "compliance", "backdesign", "bottle", "assets", "checkout"] as const;
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
const CAP_ZONES: Record<string, [number, number][]> = {
  "Cork": [[0.005, 0.145]],
  /* round 43 #1: was far shorter than the capsule — match Cork's span */
  "Screw Cap": [[0, 0.145]],
  "Wax Seal": [[0, 0.1]],
  "Crown Cap": [[0, 0.028]],
  "Sparkling Cork": [[0, 0.505]],
};
type PageKey = (typeof ORDER)[number];

/* ROUND 40 (owner's ProgressBarModifications mock): SEVEN stages, flow
   unchanged — big dots + bold labels for the four main stations, small
   dots + regular labels for the added sub-stations. Every stage is
   CLICKABLE and navigates to its page. */
const CIRCLE_X = [142.06, 334.71, 527.36, 720.01, 912.66, 1105.31, 1297.96];
const STEPS: { label: string; big: boolean; page: PageKey }[] = [
  { label: "Front Label", big: true, page: "vision" },
  { label: "Details", big: false, page: "front" },
  { label: "Back Label", big: true, page: "backdetails" },
  { label: "Market Compliance", big: false, page: "compliance" },
  { label: "Bottle", big: true, page: "bottle" },
  { label: "Marketing Assets", big: false, page: "assets" },
  { label: "Download", big: true, page: "checkout" },
];
/* progress thick-line endpoint per page (null = no bar) */
const THICK: Record<PageKey, number | null> = {
  /* vision: bar visible but thick line not yet started (round 8 #1) —
     it slides in on the transition to front */
  /* round 41 #2: on intermediate pages the thick line already REACHES the
     next station's dot — the dot itself fills only when its page arrives */
  welcome: null, vision: 142.06, front: 334.71, loader: 527.36, options: 527.36,
  backdetails: 527.36, compliance: 720.01, backdesign: 912.66, bottle: 912.66,
  assets: 1105.31, checkout: null,
};
const STEP_OF: Record<PageKey, number> = { welcome: -1, vision: 0, front: 1, loader: 1, options: 1, backdetails: 2, compliance: 3, backdesign: 3, bottle: 4, assets: 5, checkout: 6 };

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
  bottle: [
    { x1: 344.1, delay: 0 },
    { x0: 344.1, x1: 584.1, delay: 60 },
    { x0: 584.1, x1: 824.1, delay: 120 },
    { x0: 824.1, x1: 1064.1, delay: 180 },
    { x0: 1064.1, delay: 240 },
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
  const bottleScans = useRef<Record<string, { top: number; bottom: number; cx: number; spans: [number, number][] }>>({});
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
      bottleScans.current[src] = { top, bottom, cx: cx0, spans };
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
    if (bottle.finish === "No cap") return;
    const zones = CAP_ZONES[bottle.closure] || [];
    const bh = scan.bottom - scan.top;
    g.fillStyle = shadeRgb();
    for (const [a, b2] of zones)
      for (let y = Math.max(0, Math.round(scan.top + a * bh)); y <= Math.min(1599, Math.round(scan.top + b2 * bh)); y++) {
        const [l, r] = scan.spans[y] || [0, -1];
        if (r - l > 3) g.fillRect(l + 2, y, r - l - 3, 1);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bottleScanKey, wheel, shade, bottle.closure, bottle.finish, page]);
  const [heroAsset, setHeroAsset] = useState(0);
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
     follows the back-details choice; designer-edit always starts unmarked */
  useEffect(() => {
    if (page === "checkout") setPackSel((ps) => [ps[0], qrMode !== "upload", ps[2], false]);
  }, [page, qrMode]);

  /* MARKETING ASSETS (round 13): entering the assets page kicks off the
     generation run (2 product shots + 5 lifestyle) unless the same brief
     is already generated. Sequential on the server (~5 imgs/min cap). */
  useEffect(() => {
    if (page !== "assets" || selected < 0 || !dreams[selected] || assetsRunning.current) return;
    /* round 40 #3: a progress-bar JUMP never starts a paid generation —
       placeholders show "Not yet created"; the run starts only when the
       page is reached through the normal flow (bottle → next) */
    if (barJumped.current && !assets.front && !assets.back) return;
    const sel = dreams[selected];
    /* round 21 #7: NO client-side "same inputs" skip — it knew nothing
       about admin charter changes and replayed stale sets. The server
       cache (charter-aware since round 19) answers true duplicates
       instantly, so refetching costs nothing. */
    const sig = JSON.stringify({ fs: frontSig, bs: backSig, bottle, rgb: wheel.rgb, shade, sel: sel.style });
    assetsRunning.current = true;
    (async () => {
      const got = { front: "", back: "", life: [] as string[] };
      try {
        setAssets({ life: [] });
        assetT.current = { run: Date.now(), stage: Date.now() };
        setAssetsStage("preparing");
        let backData: string | null = null;
        if (backPng) {
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
            wine: { colour: f.colour || DEMO_FRONT.colour, name: f.wine || DEMO_FRONT.wine },
            labelMM: { w: Number(f.width) || 110, h: Number(f.height) || 80 },
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
           /p/<code> from everything known at this moment */
        if (qrMode === "create") {
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
  }, [page]);
  const [imgDims, setImgDims] = useState<Record<number, { w: number; h: number }>>({});
  useEffect(() => {
    dreams.forEach((d, i) => {
      const im = new Image();
      im.onload = () => setImgDims((m) => ({ ...m, [i]: { w: im.width, h: im.height } }));
      im.src = d.preview || d.dream;
    });
  }, [dreams]);
  const [busyMsg, setBusyMsg] = useState("");
  const dragRef = useRef<"" | "wheel" | "shade">("");
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
            .replace(/'Helvetica Neue World'/g, "'Helvetica Neue World','Helvetica Neue'");
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
    if (i > 0) go(ORDER[i - 1] === "loader" ? "front" : ORDER[i - 1], -1);
  }, [page, go]);

  const sigFront = () => JSON.stringify({ vision, sketch: !!sketch, f });
  const sigBack = () => JSON.stringify({ b, markets, gtin: gtinValid ? gtinNorm : "", qrImg: !!qrImg, w: f.width, h: f.height, sel: dreams[selected]?.style });

  async function nextFromFront() {
    /* owner #14: regenerate ONLY when inputs changed */
    if (dreams.length && frontSig === sigFront()) { go("options"); return; }
    go("loader");
    setGenProgress(0);
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
      /* round 43 #3 (owner: "landing page thumb shows the previous bottle"):
         a freshly generated wine invalidates any earlier published page —
         the restored productUrl (round 28b, meant to survive a reload of
         the SAME in-progress order) must not leak into a NEW wine. Mint a
         fresh order code too, so a later publish never reuses the old one. */
      setProductUrl(""); productCode.current = Math.random().toString(36).slice(2, 10);
      try { localStorage.removeItem("nui-product-code"); } catch { }
      go("options");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      go("front", -1);
    }
  }

  async function nextFromCompliance() {
    if (backPng && backSig === sigBack()) { go("backdesign"); return; }
    setBusyMsg("Composing back label…");
    const sel = dreams[selected];
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
        barcodeDigits: gtinValid ? gtinNorm : "", qrImage: qrImg,
        qrUrl: `https://8klabels.com/p/${productCode.current}`,
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

  /* round 27: Barcode row removed — GTIN entry is part of the back label */
  const PACK = [
    { name: "Front & Back Labels", price: 199, base: 536.5 },
    { name: "QR & Product Page", price: 29, base: 605.1 },
    { name: "Marketing Assets", price: 19, base: 639.4 },
    { name: "Edit with human designer", price: 99, base: 673.7 },
  ];
  const total = PACK.reduce((s, it, i) => s + (packSel[i] ? it.price : 0), 0);

  /* round 18 #4: ONE delivery ZIP named after the wine — labels + fonts,
     marketing assets, sample contract (TEMP free until payments exist) */
  async function proceedToPayment() {
    if (!agree) { alert("Please agree to the Terms & Conditions."); return; }
    setBusyMsg("Packing your delivery…");
    try {
      const r = await fetch("/api/package", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wineName: f.wine || "Wine",
          front: selected >= 0 ? dreams[selected]?.dream : null,
          back: backPayload,
          shots: { front: assets.front?.full, back: assets.back?.full },
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
    <button key={key} onClick={() => go(kind === "front" ? "vision" : "backdetails", -1)}
      style={{ ...px(x, y, w, h), background: "#ECECEA", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", font: `12px ${HNW}`, color: "#8a887e", textAlign: "center", textTransform: "none", padding: 4 }}>
      {msg ? t(kind === "front" ? "Create a front label first" : "Create a back label first") : ""}
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
    /* 15% bigger downwards: top edge stays (marginTop compensates the
       flex-centring shift) — round 19 */
    <svg key={key} viewBox="215 95 170 315" width="22" style={{ display: "block", marginTop: 4 }}>
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
        return <button aria-label="start" onClick={() => { setArrowFly(true); go("vision"); setTimeout(() => setArrowFly(false), SLIDE_MS + 80); }}
          style={{ ...px(122, 662, 60, 48), ...ghost }} />;
      case "vision":
        return (<>
          {patch(1213, 421, 87, 17, "cnt")}
          <span style={{ ...px(1178, 422, 110, 15), font: `11px ${HNW}`, color: "#111", textAlign: "right" }}>{vision.trim() ? vision.trim().split(/\s+/).length : 0} / 300 {t("words")}</span>
          <textarea value={vision} onChange={(e) => setVision(e.target.value)} maxLength={2200}
            style={{ ...px(148, 246, 1144, 168), ...inputStyle, fontStyle: "normal", textDecoration: "none", resize: "none", lineHeight: 1.5, overflow: "auto", background: "transparent" }} />
          <button onClick={() => { setVision(IDEAS[Math.floor(Math.random() * IDEAS.length)]); setIdeaN((n) => n + 1); }}
            style={{ ...px(960, 480, 342.9, 34.3), cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: "#111", color: "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4 }}>
            {ideaN ? t("Next idea") : t("Give me an idea")}
          </button>
          <label style={{ ...px(137.1, 480, 342.9, 34.3), cursor: "pointer" }}>
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
              const file = e.target.files?.[0]; if (!file) { setSketch(null); return; }
              const rd = new FileReader(); rd.onload = () => setSketch(String(rd.result)); rd.readAsDataURL(file);
            }} />
            {sketch && <span style={{ ...px(0, 38, 300, 16), font: `12px ${HNW}`, color: "#3f6d2a" }}>{t("✓ sketch attached")}</span>}
          </label>
        </>);
      case "front": {
        /* size area: top = the Producer row's input RULE (round 9 #4),
           bottom = Wine Type's baseline (design row pitch 30) */
        const area = { right: 1302.86, top: 253.77, w: 488.43, h: 297.5 };
        const wmm = Number(f.width) || 110, hmm = Number(f.height) || 80;
        const k = Math.min(area.w / wmm, area.h / hmm);
        const bw = wmm * k, bh = hmm * k;
        return (<>
          {/* round 7 #3: shorter intro replaces the baked paragraph */}
          {patch(134, 166, 700, 46, "intro")}
          <span style={{ ...px(136.97, 183.62 - 15.5, 560, 20), font: `15px ${HNW}`, color: "#111", lineHeight: "20px" }}>
            {t("Feel free to leave out fields you don't want on your front label.")}
          </span>
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
            {t("Please stay on this page — preparing your labels usually takes 15–35 seconds.")}
          </span>
        </>);
      }
      case "options": {
        const covers: React.ReactNode[] = [];
        covers.push(patch(255, 503, 930, 24, "dots"));
        covers.push(patch(135, 546, 1172, 40, "selrow"));
        for (const fx0 of [137.1, 480, 548.5, 891.4, 960, 1302.9])
          for (const fy0 of [240, 468.6]) covers.push(patch(fx0 - 11, fy0 - 11, 22, 22, `c${fx0}-${fy0}`));
        const CUBE = 34.3, AREA_TOP = 240, AREA_BOT = 528;   /* space below labels (owner) */
        return (<>
          {covers}
          {OPT_FRAMES.map((fr, i) => {
            const d = dreams[i];
            if (!d?.preview && !d?.dream) return null;
            const nat = imgDims[i];
            const ar = nat ? nat.w / nat.h : (Number(f.width) || 110) / (Number(f.height) || 80);
            let lw: number, lh: number;
            if (ar >= 1) { lw = OPT_W; lh = OPT_W / ar; if (lh > AREA_BOT - AREA_TOP) { lh = AREA_BOT - AREA_TOP; lw = lh * ar; } }
            else { lh = AREA_BOT - AREA_TOP; lw = lh * ar; if (lw > OPT_W - 2 * CUBE) { lw = OPT_W - 2 * CUBE; lh = lw / ar; } }
            const lx = fr.x + (OPT_W - lw) / 2;
            const ly = AREA_TOP + (ar >= 1 ? 0 : (AREA_BOT - AREA_TOP - lh) / 2);
            return (
              <div key={i}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.preview || d.dream} alt={d.style} onClick={() => { setSelected(i); setWarn(""); }}
                  style={{ ...px(lx, ly, lw, lh), cursor: "pointer", objectFit: "fill" }} />
                {selected === i && dashedBox(lx, ly, lw, lh, "selD" + i)}
                {cross(lx, ly, `tl${i}`)}{cross(lx + lw, ly, `tr${i}`)}
                {cross(lx, ly + lh, `bl${i}`)}{cross(lx + lw, ly + lh, `br${i}`)}
              </div>
            );
          })}
          {dreams.length === 0 && OPT_FRAMES.map((fr, i) =>
            notMade(fr.x, OPT_TOP, OPT_W, OPT_BOT - OPT_TOP, "front", "nmopt" + i))}
          {OPT_FRAMES.map((fr, i) => (
            <button key={"s" + i} onClick={() => { setSelected(i); setWarn(""); }}
              style={{
                /* round 21 #2: one button-height lower (top = old bottom) */
                ...px(fr.x + 0.2, 582.9, OPT_W, 34.3), cursor: "pointer",
                /* round 7 #11: WHITE by default, inverts to black "Selected" */
                font: `12px ${HNW}`, letterSpacing: 0.3, transition: `all 240ms ${EASE}`,
                background: selected === i ? "#111" : "#fff",
                color: selected === i ? "#fff" : "#111",
                border: "1px solid #111", boxSizing: "border-box",
                display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4,
              }}>{selected === i ? t("Selected") : t("Select")}</button>
          ))}
          {/* round 7 #12: gate message when proceeding without a selection */}
          {warn && (
            <span style={{ ...px(0, 632, W, 18), font: `13px ${HNW}`, color: "#BA141A", textAlign: "center", display: "block" }}>{warn}</span>
          )}
        </>);
      }
      case "backdetails":
        return (<>
          {patch(560, 421, 122, 17, "cnt2")}
          <span style={{ ...px(552, 422, 116, 15), font: `11px ${HNW}`, textAlign: "right" }}>{(b.description || "").trim() ? (b.description || "").trim().split(/\s+/).length : 0} / 300 {t("words")}</span>
          <textarea value={b.description || ""} onChange={(e) => setB((m) => ({ ...m, description: e.target.value }))}
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
            style={{ ...px(601.76, 509.89 - 12, 190, 24), ...ghost, font: `15px ${HNW}`, color: "#111", textAlign: "left", textTransform: "none", lineHeight: "24px" }}>
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
          {warn && (
            <span style={{ ...px(0, 600, W, 18), font: `13px ${HNW}`, color: "#BA141A", textAlign: "center", display: "block" }}>{warn}</span>
          )}
        </>);
      }
      case "backdesign": {
        const fit = fitIn(BD_AREA.w, BD_AREA.h, backDims.w, backDims.h);
        const lx = BD_AREA.x + fit.dx, ly = BD_AREA.y + fit.dy;
        return (<>
          {/* cover baked mock + its corner crosses + Edit/magnifier row */}
          {patch(BD_AREA.x - 12, BD_AREA.y - 12, BD_AREA.w + 24, BD_AREA.h + 24, "bdmock")}
          {patch(546, 546, 350, 40, "bdrow")}
          {!backPng && notMade(BD_AREA.x, BD_AREA.y, BD_AREA.w, BD_AREA.h, "back", "nmbd")}
          {backPng && (<>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={backPng} alt="back label"
              style={{ ...px(lx, ly, fit.w, fit.h), objectFit: "fill" }} />
            {cross(lx, ly, "b1")}{cross(lx + fit.w, ly, "b2")}{cross(lx, ly + fit.h, "b3")}{cross(lx + fit.w, ly + fit.h, "b4")}
            {dashedBox(lx, ly, fit.w, fit.h, "bdD")}
            <button onClick={() => go("backdetails", -1)}
              style={{ ...px(548.6, 589, 341.4, 34.3), cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: "#111", color: "#fff", border: "1px solid #111", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4 }}>{t("Edit")}</button>
          </>)}
        </>);
      }
      case "bottle": {
        /* ring centres extracted from bottle.svg circle paths (round 7 #19) */
        const cols: { key: string; cx: number; items: [string, number][] }[] = [
          /* round 41 #16: baked rings measured +0.42/+0.5px off the old
             coords — dots now sit dead-centre (like compliance) */
          { key: "type", cx: 386.06, items: [["Bordeaux", 283.57], ["Bordeaux Prestige", 312.57], ["Burgundy", 341.57], ["Sparkling", 371.57], ["Alsace / Rhine", 400.57], ["Ice Wine", 429.57]] },
          { key: "color", cx: 626.06, items: [["Olive Green", 283.57], ["Transparent", 312.57], ["Amber", 341.57]] },
          { key: "closure", cx: 865.06, items: [["Cork", 283.57], ["Screw Cap", 312.57], ["Wax Seal", 341.57], ["Crown Cap", 371.57], ["Sparkling Cork", 400.57]] },
        ];
        /* round 22 #10: Glossy's ring+text sit a bit further right (the
           baked pair is covered) so the ring clears the word before it */
        const finish: [string, number, number][] = [["Matte", 1105.06, 282.28], ["Glossy", 1181.42, 282.28], ["No cap", 1105.06, 313.08]];
        return (<>
          {cols.map(({ key, cx, items }) => items
            /* round 17 #2: Sparkling Cork exists only for the Sparkling bottle;
               round 38 #1: Crown Cap only for Burgundy / Sparkling / Alsace */
            .filter(([opt]) => !(key === "closure" && opt === "Sparkling Cork" && bottle.type !== "Sparkling"))
            .filter(([opt]) => !(key === "closure" && opt === "Crown Cap" && !CROWN_TYPES.includes(bottle.type)))
            .map(([opt, cy], i) => {
              const pick = () => {
                if (key === "type") bottleTouched.current = true;
                setBottle((m) => ({
                  ...m, [key]: opt,
                  ...(key === "type" && opt !== "Sparkling" && m.closure === "Sparkling Cork" ? { closure: "Cork" } : {}),
                  ...(key === "type" && !CROWN_TYPES.includes(opt) && m.closure === "Crown Cap" ? { closure: "Cork" } : {}),
                }));
              };
              return (
                <span key={key + opt}>
                  {dotBtn(cx, cy, bottle[key] === opt, pick, key + opt + "d", { cover: 26, ring: true, r: 9 })}
                  {/* round 41 #3: the word beside the circle selects too */}
                  <button onClick={pick} style={{ ...px(cx + 14, cy - 12, 168, 24), ...ghost }} />
                </span>
              );
            }))}
          {/* cover the baked Sparkling Cork / Crown Cap rows when hidden */}
          {bottle.type !== "Sparkling" && patch(854, 388, 132, 26, "spcork")}
          {!CROWN_TYPES.includes(bottle.type) && patch(854, 359, 132, 26, "crowncap")}
          <div style={{ ...px(1173.21 - 11, 281.78 - 11, 22, 22), background: "#fff", borderRadius: 11 }} />
          {patch(1185, 271.5, 66, 20, "glossytxt")}
          <span style={{ ...px(1196.5, 285.28 - 12.4, 70, 16), font: `12px ${HNW}`, color: "#111", lineHeight: "16px" }}>{t("Glossy")}</span>
          {finish.map(([opt, cx0, cy0]) => (
            <span key={"f" + opt}>
              {dotBtn(cx0, cy0, bottle.finish === opt, () => setBottle((m) => ({ ...m, finish: opt })), "f" + opt + "d", opt === "No cap" ? {} : { cover: opt === "Glossy" ? 22 : 26, ring: true, r: 9 })}
              <button onClick={() => setBottle((m) => ({ ...m, finish: opt }))} style={{ ...px(cx0 + 14, cy0 - 12, 78, 24), ...ghost }} />
            </span>
          ))}
          {/* round 8 #9: the baked cursor ring's stroke pokes 1px past the
              capsule on both sides — erase it fully, then repaint the capsule */}
          <div style={{ ...px(1261.07 - 11, 417.77 - 11, 22, 22), background: "#fff", borderRadius: 11 }} />
          {/* round 7 #21: the design's gradient capsule rebuilt 1:1 in CSS —
              covers the frozen baked cursor without erasing the gradient */}
          <div style={{ ...px(1253.57, 359.19, 15, 136.64), borderRadius: 7.5, background: "linear-gradient(#fff, #000)", pointerEvents: "none" }} />
          {/* colour wheel (restored artwork) + picker dot */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/newui/colorwheel.png" alt="" style={{ ...px(1097.1, 359.2, 137.2, 137.2), pointerEvents: "none" }} />
          <div style={{ ...px(1097.1, 359.2, 137.2, 137.2), cursor: "crosshair" }}
            onPointerDown={(e) => { dragRef.current = "wheel"; e.currentTarget.setPointerCapture(e.pointerId); wheelPick(e.clientX, e.clientY, e.currentTarget); }}
            onPointerMove={(e) => { if (dragRef.current === "wheel") wheelPick(e.clientX, e.clientY, e.currentTarget); }}
            onPointerUp={() => { dragRef.current = ""; }}>
            <span style={{ position: "absolute", left: `${wheel.x * 100}%`, top: `${wheel.y * 100}%`, transform: "translate(-50%,-50%)", width: 15.2, height: 15.2, borderRadius: 8, background: "transparent", border: "1.5px solid #111", pointerEvents: "none", boxSizing: "border-box" }} />
          </div>
          {/* lightness drag: cursor travels between the capsule's cap centres */}
          <div style={{ ...px(1245, 352, 32, 152), cursor: "grab" }}
            onPointerDown={(e) => { dragRef.current = "shade"; e.currentTarget.setPointerCapture(e.pointerId); }}
            onPointerMove={(e) => {
              if (dragRef.current !== "shade") return;
              const r = e.currentTarget.getBoundingClientRect();
              const yy = (e.clientY - r.top) / r.height * 152;
              setShade(Math.min(1, Math.max(0, (yy - 14.69) / 121.64)));
            }}
            onPointerUp={() => { dragRef.current = ""; }}>
            <span style={{ position: "absolute", left: 1261.07 - 1245 - 7.6, top: 14.69 + shade * 121.64 - 7.6, width: 15.2, height: 15.2, borderRadius: 8, background: "transparent", border: "1.5px solid #111", boxSizing: "border-box" }} />
          </div>
          {/* result colour bar (baked rect 1097.1,532.6,171.4×18.3) */}
          <div style={{ ...px(1095.6, 531.1, 174.4, 21.3), background: shadeRgb(), border: "1px solid #111", boxSizing: "border-box" }} />
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
            const lab = selected >= 0 ? dreams[selected] : null;
            let labelEl: React.ReactNode = null;
            /* round 41 #8: no label yet → grey placeholder at the true
               position and default size from the front-details page */
            if (scan && !lab) {
              const bhD = (scan.bottom - scan.top) * s;
              const topD = 174 + scan.top * s;
              const pxPerCm = bhD / (bottle.type === "Alsace / Rhine" ? 35 : 30);
              const lw = ((Number(f.width) || 110) / 10) * pxPerCm;
              const lh = ((Number(f.height) || 80) / 10) * pxPerCm;
              const anc = LABEL_ANCHOR[bottle.type] || LABEL_ANCHOR["Bordeaux"];
              const ly = anc.anchor === "top" ? topD + anc.pct * bhD : topD + bhD - anc.pct * bhD - lh;
              labelEl = <div style={{ position: "absolute", left: xoff + scan.cx * s - lw / 2, top: ly, width: lw, height: lh, background: "#ECECEA", pointerEvents: "none" }} />;
            }
            if (scan && lab) {
              const bhD = (scan.bottom - scan.top) * s;
              const topD = 174 + scan.top * s;
              const pxPerCm = bhD / (bottle.type === "Alsace / Rhine" ? 35 : 30);
              const lw = ((Number(f.width) || 110) / 10) * pxPerCm;
              const lh = ((Number(f.height) || 80) / 10) * pxPerCm;
              const anc = LABEL_ANCHOR[bottle.type] || LABEL_ANCHOR["Bordeaux"];
              const ly = anc.anchor === "top" ? topD + anc.pct * bhD : topD + bhD - anc.pct * bhD - lh;
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
        </>);
      }
      case "assets": {
        const thumbs = [{ x: 994.3, y: 171.5 }, { x: 1165.8, y: 171.5 }, { x: 994.3, y: 376.9 }, { x: 1165.7, y: 377.4 }];
        const order = [heroAsset, ...[0, 1, 2, 3, 4].filter((i) => i !== heroAsset)];
        const lifeGallery = assets.life.filter(Boolean).map((l) => l.full);
        const shotGallery = [assets.front, assets.back].filter(Boolean).map((s) => s!.full);
        const pic = (it: { full: string; prev: string } | undefined, w2: number, h2: number, label: string, fs = 12, fit: "cover" | "contain" = "cover", gal?: string[], loadKey?: string) =>
          it ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={it.prev} alt={label}
              style={{ width: w2, height: h2, objectFit: fit, display: "block", animation: `nuiFadeIn ${FADE_MS}ms ${EASE}` }} />
          ) : (
            <button onClick={() => { if (!assetsStage) go("vision", -1); }}
              style={{ width: w2, height: h2, background: assetsStage ? "#F4F3EE" : "#ECECEA", border: "none", cursor: assetsStage ? "default" : "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", font: `12px ${HNW}`, color: assetsStage ? "#999" : "#8a887e", textAlign: "center", textTransform: "none", padding: 4 }}>
              {/* round 17 #1: rising glass + three-dot indicator below it */}
              {assetsStage && loadKey ? (<>
                {miniGlass(loadKey, assetFill(loadKey))}
                <span style={{ marginTop: 10, font: `16.5px ${HNW}`, color: "#111", letterSpacing: 2.2, lineHeight: "11px" }}>
                  {[0, 1, 2].map((dd) => <span key={dd} style={{ animation: `nuiDot 1.2s ${dd * 0.2}s infinite` }}>.</span>)}
                </span>
              </>) : <>{t("Create a front label first")}</>}
            </button>
          );
        return (<>
          {/* round 14 #3: number words in the titles */}
          {patch(136, 542, 132, 18, "t1")}
          {patch(547.5, 542, 162, 18, "t2")}
          <span style={{ ...px(138.16, 556.39 - (IN_BASE - 2), 200, 16), font: `700 15px ${HNW}`, lineHeight: "16px" }}>{t("Two Product Shots")}</span>
          <span style={{ ...px(548.57, 556.39 - (IN_BASE - 2), 220, 16), font: `700 15px ${HNW}`, lineHeight: "16px" }}>{t("Five Marketing Images")}</span>
          {/* round 14 #6: status message in the 12px subtitle style, on the
              titles' line, left-aligned with the small-thumb block */}
          {assetsStage && (
            <span style={{ ...px(994.3, 556.39 - 12.4, 310, 32), font: `italic 12px ${HNW}`, color: "#BA141A", lineHeight: "16px" }}>
              {t("Creating your marketing assets")} — {tStage(assetsStage)}… {t("please stay on the page.")}
            </span>
          )}
          {!assetsStage && selected < 0 && (
            <span style={{ ...px(994.3, 556.39 - 12.4, 310, 32), font: `italic 12px ${HNW}`, color: "#BA141A", lineHeight: "16px" }}>
              {t("Select a front label first — assets are built from it.")}
            </span>
          )}
          <div style={{ ...px(548.6, 171.9, 338.6, 338.6) }}>{pic(assets.life[order[0]], 338.6, 338.6, `Context ${order[0] + 1}`, 14, "cover", lifeGallery, `lifestyle ${order[0] + 1}/5`)}</div>
          {cross(548.6, 171.9, "ah1")}{cross(887.2, 171.9, "ah2")}{cross(548.6, 510.5, "ah3")}{cross(887.2, 510.5, "ah4")}
          {cross(994.3, 171.5, "at1")}{cross(1303.7, 171.5, "at2")}{cross(994.3, 515.3, "at3")}{cross(1303.7, 515.3, "at4")}
          {thumbs.map((t, k) => {
            const img = assets.life[order[k + 1]];
            const inner = pic(img, 137.9, 137.9, `Context ${order[k + 1] + 1}`, 12, "cover", lifeGallery, `lifestyle ${order[k + 1] + 1}/5`);
            /* round 42: the thumb (placeholder + glass) is ALWAYS there —
               only the hero-swap click needs the image to exist */
            return img ? (
              <button key={k} onClick={() => setHeroAsset(order[k + 1])} style={{ ...px(t.x, t.y, 137.9, 137.9), ...ghost }}>{inner}</button>
            ) : (
              <div key={k} style={{ ...px(t.x, t.y, 137.9, 137.9) }}>{inner}</div>
            );
          })}
          {/* product shots in the CROSS-MARKED area (137.1–411.4 × 171.9–514.8) */}
          <div style={{ ...px(139, 174, 133, 339) }}>{pic(assets.front, 133, 339, "Shot: Face", 12, "contain", shotGallery, "front shot")}</div>
          <div style={{ ...px(276.3, 174, 133, 339) }}>{pic(assets.back, 133, 339, "Shot: Back", 12, "contain", shotGallery, "back shot")}</div>
          {/* round 8 #10: pluses over everything */}
          {cross(137.1, 171.9, "as1")}{cross(411.4, 171.9, "as2")}{cross(137.1, 514.8, "as3")}{cross(411.4, 514.8, "as4")}
        </>);
      }
      case "checkout":
        return (<>
          {selected >= 0 && dreams[selected] ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={dreams[selected].preview || dreams[selected].dream} alt="front"
              style={{ ...px(171, 279.3, 245.8, 163.8), objectFit: "contain" }} />
          ) : notMade(171, 279.3, 245.8, 163.8, "front", "nmFront")}
          {!backPng && (<>
            {patch(452, 268, 230, 180, "bmock2e")}
            {notMade(452, 280, 227, 160, "back", "nmBack")}
          </>)}
          {backPng && (<>
            {/* slot 2 — cover the baked mock WITHOUT touching the dashed
                divider at x685.7 (round 8 #12), centre the real back label
                on the dashed band's midline (round 14 #8) */}
            {patch(452, 268, 230, 180, "bmock2")}
            {(() => {
              const fit2 = fitIn(227, 160, backDims.w, backDims.h);
              return (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={backPng} alt="back"
                  style={{ ...px(452 + fit2.dx, 280 + fit2.dy, fit2.w, fit2.h), objectFit: "fill" }} />
              );
            })()}
          </>)}
          {/* slot-1 heading is OUTLINED in the artboard (not live text) —
              covered and re-rendered so ENG/GEO both translate (2026-09-07) */}
          {patch(136, 168, 185, 38, "slot1h")}
          <span style={{ ...px(137.14, 183.93 - (IN_BASE - 2), 200, 16), font: `700 15px ${HNW}`, lineHeight: "16px" }}>{t("Front label")}</span>
          <span style={{ ...px(137.14, 198.33 - 12.4, 300, 16), font: `12px ${HNW}`, lineHeight: "16px", whiteSpace: "nowrap" }}>{t("Print ready high resolution file")}</span>
          {/* round 8 #14 / round 14 #9: real sizes instead of ???x???, in the
              design's own 12px subtitle size on its baseline 227.13 */}
          {patch(137, 214, 208, 19, "fmt1")}
          {patch(445.7, 214, 208, 19, "fmt2")}
          <span style={{ ...px(137.14, 227.13 - 12.4, 280, 16), font: `12px ${HNW}`, lineHeight: "16px" }}>
            Tiff / {f.width || "110"}x{f.height || "80"}mm / 300dpi / CMYK</span>
          <span style={{ ...px(445.71, 227.13 - 12.4, 280, 16), font: `12px ${HNW}`, lineHeight: "16px" }}>
            SVG / {backDims.w > 1 ? Math.round((backDims.w / 300) * 25.4) : f.width || "110"}x{f.height || "80"}mm / 300dpi / CMYK</span>
          {/* round 14 #2: slots 3-4 at the DESIGN's exact geometry — two tall
              shots; marketing = hero square + a row of 4 small thumbs */}
          {(() => {
            const box = (x: number, y: number, w2: number, h2: number, it: { full: string; prev: string } | undefined, label: string, fit: "cover" | "contain", gal?: string[], fs = 10) =>
              it ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img key={`${label}@${x}`} src={it.prev} alt={label}
                  style={{ ...px(x, y, w2, h2), objectFit: fit }} />
              ) : (
                <button key={`${label}@${x}`} onClick={() => go("vision", -1)} style={{ ...px(x, y, w2, h2), background: "#ECECEA", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", font: `12px ${HNW}`, color: "#8a887e", textAlign: "center", textTransform: "none", padding: 3 }}>{label ? t("Create a front label first") : ""}</button>
              );
            const lifeG = assets.life.filter(Boolean).map((l) => l.full);
            const shotG = [assets.front, assets.back].filter(Boolean).map((s) => s!.full);
            const others = [0, 1, 2, 3, 4].filter((i) => i !== heroAsset);
            return (<>
              {box(688, 266.3, 97.6, 184.9, assets.front, "Shot: Face", "contain", shotG)}
              {box(791.1, 265.7, 96.9, 185.4, assets.back, "Shot: Back", "contain", shotG)}
              {box(925.71, 273.84, 137.9, 137.9, assets.life[heroAsset], "Context", "cover", lifeG)}
              {[925.71, 963.75, 1001.89, 1040.03].map((tx, k) =>
                box(tx, 422.44, 25.1, 25.1, assets.life[others[k]], "", "cover", lifeG))}
              {productUrl && selected >= 0 ? (
                <span key="pp">
                  {/* browser-framed live page (owner's reference: soft shadow,
                      traffic lights, URL bar), QR and the link below */}
                  <div style={{ ...px(1112, 273, 178, 116), background: "#fff", borderRadius: 5, boxShadow: "0 10px 26px rgba(0,0,0,0.22)", overflow: "hidden" }}>
                    <div style={{ height: 13, background: "#E8E8E6", display: "flex", alignItems: "center", gap: 3, padding: "0 6px" }}>
                      {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <span key={c} style={{ width: 4.5, height: 4.5, borderRadius: 3, background: c }} />)}
                      <span style={{ flex: 1, margin: "0 8px", height: 7, background: "#fff", borderRadius: 3, font: `5px ${HNW}`, color: "#999", paddingLeft: 4, lineHeight: "7px" }}>8klabels.com{productUrl}</span>
                    </div>
                    <iframe src={productUrl} title="product page" onLoad={() => setPpLoaded(true)} style={{ width: W, height: 823, transform: "scale(0.1236)", transformOrigin: "0 0", border: 0, pointerEvents: "none" }} />
                    {/* round 30 #5: while the live page builds, the little
                        wine glass fills in the thumb's centre */}
                    {!ppLoaded && (
                      <div style={{ position: "absolute", left: 0, top: 13, right: 0, bottom: 0, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {miniGlass("ppload", ppFill)}
                      </div>
                    )}
                  </div>
                  {/* round 41 #18: QR at small-thumb size on the thumbs' line;
                      "Copy the link" bottom-aligned to the QR, right-aligned
                      to the browser frame's edge */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/qr?u=${encodeURIComponent(`https://8klabels.com${productUrl}`)}`} alt="QR"
                    style={{ ...px(1112, 422.44, 25.1, 25.1) }} />
                  {/* round 43: writeText is async — a bare try/catch never
                      caught its rejection, so a blocked clipboard failed
                      silently with no sign anything happened; now confirmed
                      visually and with a textarea fallback */}
                  <button onClick={() => {
                    const link = `https://8klabels.com${productUrl}`;
                    const done = () => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1800); };
                    navigator.clipboard?.writeText(link).then(done).catch(() => {
                      try {
                        const ta = document.createElement("textarea");
                        ta.value = link; ta.style.position = "fixed"; ta.style.opacity = "0";
                        document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
                        done();
                      } catch { }
                    });
                  }}
                    style={{ ...px(1150, 422.44 + 25.1 - 14, 140, 14), ...ghost, font: `italic 11px ${HNW}`, color: "#111", textDecoration: "underline", textAlign: "right", textTransform: "none" }}>
                    {linkCopied ? t("Copied ✓") : t("Copy the link")}</button>
                </span>
              ) : notMade(1112, 284, 176, 150, "front", "nmLanding")}
            </>);
          })()}
          {/* round 8 #11/#15: the whole pricing block re-rendered 20.5px
              higher — no top dashed rule, agree row lands on the back
              arrow's line, ring+dot+text aligned by construction */}
          {patch(130, 503, 1180, 240, "pricing")}
          {(() => {
            const SH = 20.5, B = IN_BASE - 2;   /* baseline offset in a 16px line */
            const rows = [536.49, 570.78, 604.93, 639.35].map((y) => y - SH);
            return (<>
              {[548.84, 582.86, 617.14].map((y, i) => (
                <div key={"dsh" + i} style={{ ...px(137.14, y - SH, 1302.47 - 137.14, 1), background: `repeating-linear-gradient(90deg,${DASH})` }} />
              ))}
              {PACK.map((it, i) => (
                <span key={it.name}>
                  <span style={{ ...px(171.43, rows[i] - B, 500, 16), font: `700 15px ${HNW}`, lineHeight: "16px" }}>{t(it.name)}</span>
                  <span style={{ ...px(1152.9, rows[i] - B, 150, 16), font: `700 15px ${HNW}`, lineHeight: "16px", textAlign: "right", display: "block" }}>${it.price}</span>
                  {dotBtn(144.64, rows[i] - 4.93, !!packSel[i], () => setPackSel((ps) => ps.map((v, k) => (k === i ? !v : v))), "pk" + i, { ring: true })}
                </span>
              ))}
              {dotBtn(144.64, 686, agree, () => setAgree(!agree), "agree", { ring: true })}
              <span style={{ ...px(171.43, 691.3 - B, 400, 16), font: `15px ${HNW}`, lineHeight: "16px" }}>{t("I agree to the")} <u>{t("Terms & Conditions")}</u></span>
              <span style={{ ...px(852.24, 691.3 - B - 3, 240, 20), font: `700 19px ${HNW}`, lineHeight: "20px" }}>{t("TOTAL SUM:")} ${total}</span>
              {/* paddingBottom 5 measured-in: HNW's tall ascent leaves the
                  glyphs 2.5px low in a naively-centred flex line */}
              <button onClick={proceedToPayment} style={{ ...px(1032, 669.5, 268, 32), cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: "#111", color: "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 0 5px" }}>{t("Proceed to payment")}</button>
            </>);
          })()}
          <button aria-label="back" onClick={goBack} style={{ ...px(56, 664, 60, 44), ...ghost }} />
        </>);
      default:
        return null;
    }
  };

  const step = STEP_OF[page];
  const thick = THICK[page];
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
              <div style={{ ...px(137.14, 685.09 - 660, 1297.9 - 137.14, 1), background: "#111" }} />
              <div style={{ ...px(142.06, 684.09 - 660, thick - 142.06, 3), background: "#111", transition: `width ${SLIDE_MS}ms ${EASE}` }} />
              {STEPS.map((st, i) => {
                const r = st.big ? 4.9 : 3.1;
                return (
                  /* round 41 #10: the dots navigate too */
                  <button key={"d" + i} onClick={() => { if (st.page !== page) { barJumped.current = true; go(st.page, ORDER.indexOf(st.page) > ORDER.indexOf(page) ? 1 : -1); } }}
                    style={{ ...px(CIRCLE_X[i] - 12, 685.59 - 12 - 660, 24, 24), ...ghost }}>
                    <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: r * 2, height: r * 2, borderRadius: r + 1, border: "1px solid #111", background: step >= i ? "#111" : "#fff", transition: `background 300ms ${EASE}`, boxSizing: "border-box" }} />
                  </button>
                );
              })}
              {STEPS.map((st, i) => {
                /* hit zones must never overlap a neighbour (dot pitch 192.65) */
                const pos: React.CSSProperties =
                  i === 0 ? { left: 137.14, width: 120, textAlign: "left" }
                  : i === STEPS.length - 1 ? { left: 1303 - 120, width: 120, textAlign: "right" }
                  : { left: CIRCLE_X[i] - 85, width: 170, textAlign: "center" };
                return (
                  /* round 40 #3: every stage navigates to its page; jumping
                     ahead never auto-generates (Not-yet-created placeholders) */
                  <button key={st.label} onClick={() => { if (st.page !== page) { barJumped.current = true; go(st.page, ORDER.indexOf(st.page) > ORDER.indexOf(page) ? 1 : -1); } }}
                    style={{ position: "absolute", top: 708.5 - 660, height: 18, ...pos, ...ghost, font: `${st.big ? 700 : 400} 15px ${HNW}`, color: "#111", lineHeight: "15px", textTransform: "none" }}>{t(st.label)}</button>
                );
              })}
              {/* back arrow */}
              {(
                <button aria-label="back" onClick={() => { barJumped.current = false; goBack(); }} style={{ ...px(56, 666 - 660, 60, 40), ...ghost }}>
                  <svg viewBox="0 0 60 40" width="60" height="40"><line x1="47" y1="20" x2="13" y2="20" stroke="#000" strokeWidth="3" /><polyline points="23,9.5 12.5,20 23,30.5" fill="none" stroke="#000" strokeWidth="3" /></svg>
                </button>
              )}
              {/* forward arrow */}
              <button aria-label="next"
                onClick={() => {
                  barJumped.current = false;
                  if (page === "vision") go("front");
                  else if (page === "front") nextFromFront();
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
                  else if (page === "bottle") go("assets");
                  else if (page === "assets") go("checkout");
                }}
                style={{ ...px(1324, 666 - 660, 60, 40), ...ghost }}>
                <svg viewBox="0 0 60 40" width="60" height="40"><line x1="13" y1="20" x2="47" y2="20" stroke="#000" strokeWidth="3" /><polyline points="37,9.5 47.5,20 37,30.5" fill="none" stroke="#000" strokeWidth="3" /></svg>
              </button>
              </>)}
            </div>
          )}

          {/* welcome→vision: the arrow flies right while the page slides (owner #3) */}
          {arrowFly && (
            <div style={{ position: "absolute", top: 662, left: 122, width: 60, height: 48, animation: `arrowFly ${SLIDE_MS}ms ${EASE} forwards`, pointerEvents: "none", zIndex: 6 }}>
              <svg viewBox="0 0 60 40" width="60" height="40"><line x1="13" y1="24" x2="47" y2="24" stroke="#000" strokeWidth="3" /><polyline points="37,13.5 47.5,24 37,34.5" fill="none" stroke="#000" strokeWidth="3" /></svg>
            </div>
          )}

          {/* STATIC footer bar */}
          <div style={{ ...px(0, FOOTER_Y, W, H - FOOTER_Y), background: "#000" }}>
            <span style={{ ...px(138.4, 779.4 - FOOTER_Y, 700, 16), font: `300 11px ${HNW}`, color: "#fff" }}>{t("© 8K Labels — a demo interface built from your uploaded mockup")}</span>
            <a href="/classic" style={{ ...px(1240, 779.4 - FOOTER_Y, 160, 16), font: `300 11px ${HNW}`, color: "#888", textDecoration: "none" }}>{t("classic interface")}</a>
          </div>

          {busyMsg && <div style={{ ...px(1090, 78, 320, 20), font: `13px ${HNW}`, color: "#8a887e", textAlign: "right" }}>{busyMsg}</div>}

        </div>
      </div>
    </main>
  );
}
