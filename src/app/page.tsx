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
const SLIDE_TOTAL = SLIDE_MS + STRIP_DELAYS[STRIP_DELAYS.length - 1];
const HNW = "'HNW', 'Helvetica Neue', Helvetica, sans-serif";

const ORDER = ["welcome", "vision", "front", "loader", "options", "backdetails", "compliance", "backdesign", "bottle", "assets", "checkout"] as const;
type PageKey = (typeof ORDER)[number];

/* progress thick-line endpoint per page (extracted; null = no bar) */
const THICK: Record<PageKey, number | null> = {
  /* vision: bar visible but thick line not yet started (round 8 #1) —
     it slides in on the transition to front */
  welcome: null, vision: 142.06, front: 334.48, loader: 522.43, options: 522.43,
  backdetails: 527.35, compliance: 720.28, backdesign: 907.72, bottle: 912.65,
  assets: 1106.38, checkout: null,
};
const STEP_OF: Record<PageKey, number> = { welcome: -1, vision: 0, front: 0, loader: 0, options: 0, backdetails: 1, compliance: 1, backdesign: 1, bottle: 2, assets: 2, checkout: 3 };
const CIRCLE_X = [142.06, 527.4, 912.6, 1297.9];
const STEP_LABELS: [string, number][] = [["Front Label", 137.2], ["Back Label", 487.5], ["Marketing Assets", 850.2], ["Check out", 1228.2]];

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

/* TEMP dev fill (owner #13: keep the template texts — remove before launch) */
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
        const inset = 4, rs: number[] = [], gs: number[] = [], bs: number[] = [];
        for (let i = 0; i < 28; i++) {
          const t = inset + Math.round((i / 27) * (S - 2 * inset - 1));
          for (const [x, y] of [[t, inset], [t, S - 1 - inset], [inset, t], [S - 1 - inset, t]]) {
            const o = (y * S + x) * 4;
            rs.push(d[o]); gs.push(d[o + 1]); bs.push(d[o + 2]);
          }
        }
        const med = (a: number[]) => a.sort((p, q) => p - q)[Math.floor(a.length / 2)];
        const hx = (v: number) => v.toString(16).padStart(2, "0");
        res("#" + hx(med(rs)) + hx(med(gs)) + hx(med(bs)));
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
    const q = new URLSearchParams(window.location.search).get("page");
    if (q && (ORDER as readonly string[]).includes(q)) setPage(q as PageKey);
  }, []);
  const [prev, setPrev] = useState<PageKey | null>(null);
  const [dir, setDir] = useState(1);
  const [scale, setScale] = useState(1);
  const [arrowFly, setArrowFly] = useState(false);

  const [vision, setVision] = useState("");
  const [sketch, setSketch] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>({ width: "110", height: "80" });
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [selected, setSelected] = useState(-1);
  const [genProgress, setGenProgress] = useState(0);
  const [frontSig, setFrontSig] = useState("");
  const [b, setB] = useState<Record<string, string>>({});
  const [markets, setMarkets] = useState<string[]>([]);   /* round 8 #7: none preselected */
  const [barcodeImg, setBarcodeImg] = useState("");
  const [qrImg, setQrImg] = useState("");
  const [backPng, setBackPng] = useState("");
  const [backPayload, setBackPayload] = useState<Record<string, unknown> | null>(null);
  const [backSig, setBackSig] = useState("");
  const [backDims, setBackDims] = useState({ w: 1, h: 1 });
  const [bottle, setBottle] = useState<Record<string, string>>({ type: "Bordeaux", color: "Olive Green", closure: "Cork", finish: "Matte" });
  /* round 7 #20: marker starts centred; result box starts WHITE */
  const [wheel, setWheel] = useState({ x: 0.5, y: 0.5, rgb: [255, 255, 255] as number[] });
  const [shade, setShade] = useState(0.5);
  const [heroAsset, setHeroAsset] = useState(0);
  /* marketing assets (round 13): 2 product shots + 5 lifestyle images */
  const [assets, setAssets] = useState<{ front?: { full: string; prev: string }; back?: { full: string; prev: string }; life: { full: string; prev: string }[] }>({ life: [] });
  const [assetsSig, setAssetsSig] = useState("");
  const [assetsStage, setAssetsStage] = useState("");
  const assetsRunning = useRef(false);
  const [packSel, setPackSel] = useState<boolean[]>([true, true, true, true, false]);
  const [agree, setAgree] = useState(false);
  const [gallery, setGallery] = useState<{ imgs: string[]; i: number } | null>(null);
  const [warn, setWarn] = useState("");
  const [barcodeMode, setBarcodeMode] = useState<"" | "create" | "upload">("");
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
  /* round 8 #13: entering checkout, Barcode/QR rows follow the back-details
     choice (uploaded → unchecked, created/unset → checked); designer-edit
     always starts unmarked */
  useEffect(() => {
    if (page === "checkout") setPackSel((ps) => [ps[0], barcodeMode !== "upload", qrMode !== "upload", ps[3], false]);
  }, [page, barcodeMode, qrMode]);

  /* MARKETING ASSETS (round 13): entering the assets page kicks off the
     generation run (2 product shots + 5 lifestyle) unless the same brief
     is already generated. Sequential on the server (~5 imgs/min cap). */
  useEffect(() => {
    if (page !== "assets" || selected < 0 || !dreams[selected] || assetsRunning.current) return;
    const sel = dreams[selected];
    const sig = JSON.stringify({ fs: frontSig, bs: backSig, bottle, rgb: wheel.rgb, shade, sel: sel.style });
    if (sig === assetsSig) return;
    assetsRunning.current = true;
    (async () => {
      try {
        setAssets({ life: [] });
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
            if (m.type === "progress") setAssetsStage(m.stage || "");
            else if (m.type === "shot") setAssets((a) => ({ ...a, [m.side]: { full: m.image, prev: m.preview || m.image } }));
            else if (m.type === "life") setAssets((a) => { const life = [...a.life]; life[m.i] = { full: m.image, prev: m.preview || m.image }; return { ...a, life }; });
          }
        }
        setAssetsSig(sig);
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
  const [boards, setBoards] = useState<Record<string, string>>({});
  useEffect(() => {
    /* inline the artboards: SVG-in-<img> cannot use page fonts (the
       owner's Safari font complaint) — inline SVG can */
    ORDER.forEach((p) => {
      fetch(`/newui/${p}.svg`).then((r) => r.text()).then((t) =>
        setBoards((m) => ({ ...m, [p]: namespaceSvg(t, p).replace(/<\?xml[^>]*\?>/, "").replace(/<svg /, '<svg preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%" ') }))
      ).catch(() => {});
    });
  }, []);
  const wheelCanvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const fit = () => setScale(Math.max(1, window.innerWidth / W));
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

  const go = useCallback((next: PageKey, d = 1) => {
    setPrev(page); setDir(d); setPage(next);
    /* into the loader the fade starts only after the slide-out (round 9 #1) */
    setTimeout(() => setPrev(null), (next === "loader" ? SLIDE_TOTAL + FADE_MS : SLIDE_TOTAL) + 60);
  }, [page]);

  const goBack = useCallback(() => {
    const i = ORDER.indexOf(page);
    if (i > 0) go(ORDER[i - 1] === "loader" ? "front" : ORDER[i - 1], -1);
  }, [page, go]);

  const sigFront = () => JSON.stringify({ vision, sketch: !!sketch, f });
  const sigBack = () => JSON.stringify({ b, markets, barcodeImg: !!barcodeImg, qrImg: !!qrImg, w: f.width, h: f.height, sel: dreams[selected]?.style });

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
      const settled = await Promise.allSettled(["traditional", "contemporary", "punk"].map(one));
      const ok = settled.filter((x): x is PromiseFulfilledResult<Dream> => x.status === "fulfilled").map((x) => x.value);
      if (!ok.length) throw new Error("all generations failed — try again");
      setDreams(ok); setSelected(-1); setFrontSig(sigFront()); setBackSig("");
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
        description: b.description || "", importer: [b.importer, b.importerAddress].filter(Boolean).join(", "),
        bottlingDate: b.bottlingDate || "", lot: b.lot || "", web: b.web || "",
        alcohol: (f.alcohol || "12.5").replace("%", ""), volume: (f.volume || "750").replace(/\D/g, "") || "750",
        countryOfOrigin: (f.regionCountry || DEMO_FRONT.regionCountry).split(",")[1]?.trim() || "Georgia",
        barcodeImage: barcodeImg, qrImage: qrImg,
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

  const PACK = [
    { name: "Front & Back Labels", price: 199, base: 536.5 },
    { name: "Barcode", price: 99, base: 570.8 },
    { name: "QR & Product Page", price: 29, base: 605.1 },
    { name: "Marketing Assets", price: 19, base: 639.4 },
    { name: "Edit with human designer", price: 99, base: 673.7 },
  ];
  const total = PACK.reduce((s, it, i) => s + (packSel[i] ? it.price : 0), 0);

  async function proceedToPayment() {
    if (!agree) { alert("Please agree to the Terms & Conditions."); return; }
    setBusyMsg("Preparing your files…");
    try {
      if (selected >= 0 && dreams[selected]) {
        const r = await fetch("/api/dream-tiff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: dreams[selected].dream, name: f.wine || "front-label" }) });
        if (r.ok) { const u = URL.createObjectURL(await r.blob()); const a = document.createElement("a"); a.href = u; a.download = `${(f.wine || "front-label").replace(/[^\w-]+/g, "-")}-front-300dpi.tiff`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 800); }
      }
      if (backPayload) {
        const r = await fetch("/api/back-label", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...backPayload, format: "svg" }) });
        if (r.ok) { const u = URL.createObjectURL(await r.blob()); const a = document.createElement("a"); a.href = u; a.download = "back-label.svg"; a.click(); setTimeout(() => URL.revokeObjectURL(u), 800); }
      }
    } catch { alert("download failed — try again"); }
    setBusyMsg("");
  }

  /* helpers */
  const px = (x: number, y: number, w?: number, h?: number): React.CSSProperties => ({ position: "absolute", left: x, top: y, width: w, height: h });
  const ghost: React.CSSProperties = { background: "transparent", border: "none", cursor: "pointer", padding: 0 };
  const patch = (x: number, y: number, w: number, h: number, key?: string) => <div key={key} style={{ ...px(x, y, w, h), background: "#fff" }} />;
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
  /* mini loader glass for asset boxes (round 14 #10): half the label
     loader's size; the ACTIVE one fills over ~45s as its image renders */
  const miniGlass = (key: string, active: boolean) => (
    <svg key={key} viewBox="0 0 595.276 609.089" width="119" style={{ display: "block" }}>
      <defs>
        <clipPath id={`mg-${key.replace(/[^a-z0-9]/gi, "")}`}>
          <rect x="230" y="171.6" width="140" height="99"
            style={active ? { animation: "nuiWineRise 45s cubic-bezier(0.2, 0.6, 0.5, 1) forwards" } : { transform: "translateY(92px)" }} />
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
          <span style={{ ...px(1178, 422, 110, 15), font: `11px ${HNW}`, color: "#111", textAlign: "right" }}>{vision.trim() ? vision.trim().split(/\s+/).length : 0} / 300 words</span>
          <textarea value={vision} onChange={(e) => setVision(e.target.value)} maxLength={2200}
            style={{ ...px(148, 246, 1144, 168), ...inputStyle, fontStyle: "normal", textDecoration: "none", resize: "none", lineHeight: 1.5, overflow: "auto", background: "transparent" }} />
          <button title="Give me an idea" onClick={() => setVision(IDEAS[Math.floor(Math.random() * IDEAS.length)])}
            style={{ ...px(960, 480, 342.9, 34.3), ...ghost }} />
          <label style={{ ...px(137.1, 480, 342.9, 34.3), cursor: "pointer" }}>
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
              const file = e.target.files?.[0]; if (!file) { setSketch(null); return; }
              const rd = new FileReader(); rd.onload = () => setSketch(String(rd.result)); rd.readAsDataURL(file);
            }} />
            {sketch && <span style={{ ...px(0, 38, 300, 16), font: `12px ${HNW}`, color: "#3f6d2a" }}>✓ sketch attached</span>}
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
          {patch(134, 166, 560, 46, "intro")}
          <span style={{ ...px(136.97, 183.62 - 15.5, 560, 20), font: `15px ${HNW}`, color: "#111", lineHeight: "20px" }}>
            Feel free to leave out fields you don&apos;t want on your front label.
          </span>
          {/* cover baked E.g. column incl. its underlines */}
          {patch(263, 234, 572, 390, "phcol")}
          {FRONT_ROWS.map((k2, i) => {
            const base = 251.27 + i * 30;   /* design pitch 30 (round 8 #2) */
            return (
              <span key={k2}>
                <input value={f[k2] || ""} placeholder={FRONT_PH[i]}
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
              width/height transitions (quick-in, prolonged-out easing);
              hidden while ghosted so the grow plays once the page lands */}
          {!inSlide && <div key="szf" style={{
            position: "absolute", right: W - area.right - 16.5, top: area.top - 16.5,
            width: bw + 33, height: bh + 33,
            transition: `width 600ms ${EASE_IO}, height 600ms ${EASE_IO}`,
            animation: `szGrow 780ms ${EASE_IO}`, transformOrigin: "calc(100% - 16.5px) 16.5px",
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
                <span style={{ font: `700 14px ${HNW}`, lineHeight: "15px" }}>{cap}</span>
                <input value={f[key2]} onChange={(e) => setF((m) => ({ ...m, [key2]: e.target.value.replace(/[^\d.]/g, "") }))}
                  style={{ width: Math.max(1, (f[key2] || "").length) * 8.2 + 4, font: `italic 14px ${HNW}`, lineHeight: "15px", border: "none", borderBottom: "1px solid #111", outline: "none", background: "transparent", padding: 0, textAlign: "center", marginLeft: 3 }} />
                <span style={{ font: `italic 14px ${HNW}`, lineHeight: "15px", marginLeft: 4 }}>mm</span>
              </span>
            ))}
          </div>
        </>);
      }
      case "loader": {
        const fill = Math.max(0.04, genProgress);
        return (<>
          {patch(400, 120, 640, 480, "lcover")}
          {/* glass optically centred in the window (round 7 #10) */}
          <div style={{ ...px(601, 309.5, 238, 320) }}>
            <svg viewBox="0 0 595.276 609.089" width="238" aria-label="Designing your label">
              <clipPath id="nuiWineClip"><rect x="230" y={266.6 - fill * 95} width="140" height={fill * 95 + 4} style={{ transition: `all 650ms ${EASE}` }} /></clipPath>
              <path fill="#BA141A" clipPath="url(#nuiWineClip)" d="M352.397 185.696 C353.872 199.478 353.325 211.872 350.76 222.63 C346.838 239.075 336.88 251.431 321.163 259.355 C311.285 264.336 301.979 266.038 298.571 266.527 C296.674 266.308 286.165 264.888 274.916 259.216 C259.199 251.292 249.241 238.936 245.319 222.491 C242.762 211.769 242.21 199.422 243.667 185.696 Z" />
              <g fill="none" stroke="#231F20" strokeWidth="7.426">
                <path d="M254.813 401.491 L297.631 401.491 L297.631 276.2 C297.631 276.2 246.711 271.948 235.438 224.682 C222.211 169.219 254.078 108.466 254.078 108.466 L341.155 108.635 C341.155 108.635 373.068 169.358 359.84 224.821 C348.568 272.087 297.648 276.339 297.648 276.339" />
                <path d="M297.8 276.2 L297.8 401.491 L340.618 401.491" />
              </g>
            </svg>
          </div>
          <span style={{ ...px(0, 492, W, 20), font: `15px ${HNW}`, textAlign: "center", display: "block" }}>
            Designing your label
            {[0, 1, 2].map((d) => (
              <span key={d} style={{ animation: `nuiDot 1.2s ${d * 0.2}s infinite` }}>.</span>
            ))}
          </span>
          {/* round 9 #2 */}
          <span style={{ ...px(0, 520, W, 18), font: `italic 13px ${HNW}`, color: "#555", textAlign: "center", display: "block" }}>
            Please stay on this page — preparing your labels usually takes 15–35 seconds.
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
                <img src={d.preview || d.dream} alt={d.style} onClick={() => setGallery({ imgs: dreams.map((dd) => dd.preview || dd.dream), i })}
                  style={{ ...px(lx, ly, lw, lh), cursor: "zoom-in", objectFit: "fill" }} />
                {cross(lx, ly, `tl${i}`)}{cross(lx + lw, ly, `tr${i}`)}
                {cross(lx, ly + lh, `bl${i}`)}{cross(lx + lw, ly + lh, `br${i}`)}
              </div>
            );
          })}
          {OPT_FRAMES.map((fr, i) => (
            <button key={"s" + i} onClick={() => { setSelected(i); setWarn(""); }}
              style={{
                ...px(fr.x + 0.2, 548.6, OPT_W, 34.3), cursor: "pointer",
                /* round 7 #11: WHITE by default, inverts to black "Selected" */
                font: `12px ${HNW}`, letterSpacing: 0.3, transition: `all 240ms ${EASE}`,
                background: selected === i ? "#111" : "#fff",
                color: selected === i ? "#fff" : "#111",
                border: "1px solid #111", boxSizing: "border-box",
                display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4,
              }}>{selected === i ? "Selected" : "Select"}</button>
          ))}
          {/* round 7 #12: gate message when proceeding without a selection */}
          {warn && (
            <span style={{ ...px(0, 604, W, 18), font: `13px ${HNW}`, color: "#BA141A", textAlign: "center", display: "block" }}>{warn}</span>
          )}
        </>);
      }
      case "backdetails":
        return (<>
          {patch(560, 421, 122, 17, "cnt2")}
          <span style={{ ...px(552, 422, 116, 15), font: `11px ${HNW}`, textAlign: "right" }}>{(b.description || "").trim() ? (b.description || "").trim().split(/\s+/).length : 0} / 300 words</span>
          <textarea value={b.description || ""} onChange={(e) => setB((m) => ({ ...m, description: e.target.value }))}
            style={{ ...px(148, 251, 528, 168), ...inputStyle, fontStyle: "normal", textDecoration: "none", fontSize: 14, resize: "none", lineHeight: 1.45, overflow: "auto", background: "transparent" }} />
          {/* cover baked E.g. column incl. its underlines (they overrun the
              right margin in the artboard) */}
          {patch(985, 228, 380, 242, "bpcol")}
          {BACK_ROWS.map((k, i) => {
            const base = 247.11 + i * 32;   /* design pitch 32 (round 8 #2) */
            return (
              <span key={k}>
                <input value={b[k] || ""} placeholder={BACK_PH[i]}
                  onChange={(e) => setB((m) => ({ ...m, [k]: e.target.value }))}
                  style={{ ...px(989.6, base - IN_BASE, 310, 20), ...inputStyle }} />
                {rowLine(989.6, base + 2.5, 313.3, `bln${i}`)}
              </span>
            );
          })}
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
              <button onClick={() => { setBarcodeImg(""); setBarcodeMode(barcodeMode === "create" ? "" : "create"); }} style={{ ...px(138.04, 480, 239.1, 34.3), ...modeStyle(barcodeMode === "create") }}>Create Barcode</button>
              <label style={{ ...px(445.71, 480, 240, 34.3), ...modeStyle(barcodeMode === "upload") }}>
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
                  const file = e.target.files?.[0]; if (!file) return;
                  const rd = new FileReader(); rd.onload = () => { setBarcodeImg(String(rd.result)); setBarcodeMode("upload"); }; rd.readAsDataURL(file);
                }} />
                Upload Barcode
                {barcodeImg && <span style={{ position: "absolute", left: 0, top: 38, width: 240, font: `11px ${HNW}`, color: "#3f6d2a", textAlign: "center" }}>✓ barcode uploaded</span>}
              </label>
              <button onClick={() => { setQrImg(""); setQrMode(qrMode === "create" ? "" : "create"); }} style={{ ...px(754.29, 480, 240.1, 34.3), ...modeStyle(qrMode === "create") }}>Create QR Code</button>
              <label style={{ ...px(1063.99, 480, 238.4, 34.3), ...modeStyle(qrMode === "upload") }}>
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
                  const file = e.target.files?.[0]; if (!file) return;
                  const rd = new FileReader(); rd.onload = () => { setQrImg(String(rd.result)); setQrMode("upload"); }; rd.readAsDataURL(file);
                }} />
                Upload QR Code
                {qrImg && <span style={{ position: "absolute", left: 0, top: 38, width: 238, font: `11px ${HNW}`, color: "#3f6d2a", textAlign: "center" }}>✓ QR uploaded</span>}
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
          {patch(598, 500, 138, 20, "arab")}
          <div style={{ ...px(536.4 - 13, 509.89 - 13, 26, 27), background: "#fff" }} />
          {RC.map(({ code, col, row }) => {
            const on = markets.includes(code);
            const cx0 = RING_X[col], cy0 = ROW_C[row];
            const NAME_X = [347.05, 601.76, 851.43, 1107.64];
            const toggle = () => setMarkets((ms) => on ? ms.filter((m) => m !== code) : [...ms, code]);
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
          {backPng && (<>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={backPng} alt="back label" onClick={() => setGallery({ imgs: [backPng], i: 0 })}
              style={{ ...px(lx, ly, fit.w, fit.h), cursor: "zoom-in", objectFit: "fill" }} />
            {cross(lx, ly, "b1")}{cross(lx + fit.w, ly, "b2")}{cross(lx, ly + fit.h, "b3")}{cross(lx + fit.w, ly + fit.h, "b4")}
            <button onClick={() => go("backdetails", -1)}
              style={{ ...px(lx, 548.6, fit.w, 34.3), cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: "#111", color: "#fff", border: "1px solid #111", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 4 }}>Edit</button>
          </>)}
        </>);
      }
      case "bottle": {
        /* ring centres extracted from bottle.svg circle paths (round 7 #19) */
        const cols: { key: string; cx: number; items: [string, number][] }[] = [
          { key: "type", cx: 385.64, items: [["Bordeaux", 283.07], ["Bordeaux Prestige", 312.07], ["Burgundy", 341.07], ["Sparkling", 371.07], ["Alsace / Rhine", 400.07], ["Ice Wine", 429.07]] },
          { key: "color", cx: 625.64, items: [["Olive Green", 283.07], ["Transparent", 312.07], ["Amber", 341.07]] },
          { key: "closure", cx: 864.64, items: [["Cork", 283.07], ["Screw Cap", 312.07], ["Wax Seal", 341.07], ["Crown Cap", 371.07], ["Sparkling Cork", 400.07]] },
        ];
        const finish: [string, number, number][] = [["Matte", 1104.64, 281.78], ["Glossy", 1173.21, 281.78], ["No cap", 1104.64, 312.58]];
        return (<>
          {cols.map(({ key, cx, items }) => items.map(([opt, cy], i) =>
            /* first rows carry the design's baked preselect dots — cover them */
            dotBtn(cx, cy, bottle[key] === opt, () => setBottle((m) => ({ ...m, [key]: opt })), key + opt, { coverDot: i === 0 })
          ))}
          {finish.map(([opt, cx0, cy0]) =>
            dotBtn(cx0, cy0, bottle.finish === opt, () => setBottle((m) => ({ ...m, finish: opt })), "f" + opt, { coverDot: opt === "Matte" })
          )}
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
              = the area's exact 1:2 ratio); keyed by type so a change
              re-fades softly */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={bottle.type} alt={bottle.type}
            src={`/newui/bottles/${({ "Bordeaux": "bordeaux", "Bordeaux Prestige": "bordeaux-prestige", "Burgundy": "burgundy", "Sparkling": "sparkling", "Alsace / Rhine": "alsace-rhine", "Ice Wine": "ice-wine" } as Record<string, string>)[bottle.type] || "bordeaux"}.jpg`}
            style={{ ...px(139.2, 174, 201.6, 407.4), objectFit: "cover", animation: inSlide ? "none" : `nuiFadeIn 240ms ${EASE}`, pointerEvents: "none" }} />
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
            <img src={it.prev} alt={label} onClick={() => { const g = gal?.length ? gal : [it.full]; setGallery({ imgs: g, i: Math.max(0, g.indexOf(it.full)) }); }}
              style={{ width: w2, height: h2, objectFit: fit, display: "block", cursor: "zoom-in", animation: `nuiFadeIn ${FADE_MS}ms ${EASE}` }} />
          ) : (
            <div style={{ width: w2, height: h2, background: "#F4F3EE", display: "flex", alignItems: "center", justifyContent: "center", font: `${fs}px ${HNW}`, color: "#999", textAlign: "center" }}>
              {/* round 14 #10: while a run is live, every waiting box holds a
                  mini glass; the one being generated fills up */}
              {assetsStage && loadKey ? miniGlass(loadKey, assetsStage === loadKey) : <>[ {label} ]</>}
            </div>
          );
        return (<>
          {/* round 14 #3: number words in the titles */}
          {patch(136, 542, 132, 18, "t1")}
          {patch(547.5, 542, 162, 18, "t2")}
          <span style={{ ...px(138.16, 556.39 - (IN_BASE - 2), 200, 16), font: `700 15px ${HNW}`, lineHeight: "16px" }}>Two Product Shots</span>
          <span style={{ ...px(548.57, 556.39 - (IN_BASE - 2), 220, 16), font: `700 15px ${HNW}`, lineHeight: "16px" }}>Five Marketing Images</span>
          {/* round 14 #6: status message in the 12px subtitle style, on the
              titles' line, left-aligned with the small-thumb block */}
          {assetsStage && (
            <span style={{ ...px(994.3, 556.39 - 12.4, 310, 32), font: `12px ${HNW}`, color: "#111", lineHeight: "16px" }}>
              Creating your marketing assets — {assetsStage}… please stay on the page.
            </span>
          )}
          {!assetsStage && selected < 0 && (
            <span style={{ ...px(994.3, 556.39 - 12.4, 310, 32), font: `12px ${HNW}`, color: "#BA141A", lineHeight: "16px" }}>
              Select a front label first — assets are built from it.
            </span>
          )}
          <div style={{ ...px(548.6, 171.9, 338.6, 338.6) }}>{pic(assets.life[order[0]], 338.6, 338.6, `Context ${order[0] + 1}`, 14, "cover", lifeGallery, `lifestyle ${order[0] + 1}/5`)}</div>
          {cross(548.6, 171.9, "ah1")}{cross(887.2, 171.9, "ah2")}{cross(548.6, 510.5, "ah3")}{cross(887.2, 510.5, "ah4")}
          {cross(994.3, 171.5, "at1")}{cross(1303.7, 171.5, "at2")}{cross(994.3, 515.3, "at3")}{cross(1303.7, 515.3, "at4")}
          {thumbs.map((t, k) => (
            <button key={k} onClick={() => setHeroAsset(order[k + 1])} style={{ ...px(t.x, t.y, 137.9, 137.9), ...ghost }}>
              {pic(assets.life[order[k + 1]], 137.9, 137.9, `Context ${order[k + 1] + 1}`, 12, "cover", lifeGallery, `lifestyle ${order[k + 1] + 1}/5`)}
            </button>
          ))}
          {/* product shots in the CROSS-MARKED area (137.1–411.4 × 171.9–514.8) */}
          <div style={{ ...px(139, 174, 133, 339) }}>{pic(assets.front, 133, 339, "Shot: Face", 12, "contain", shotGallery, "front shot")}</div>
          <div style={{ ...px(276.3, 174, 133, 339) }}>{pic(assets.back, 133, 339, "Shot: Back", 12, "contain", shotGallery, "back shot")}</div>
          {/* round 8 #10: pluses over everything */}
          {cross(137.1, 171.9, "as1")}{cross(411.4, 171.9, "as2")}{cross(137.1, 514.8, "as3")}{cross(411.4, 514.8, "as4")}
        </>);
      }
      case "checkout":
        return (<>
          {selected >= 0 && dreams[selected] && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={dreams[selected].preview || dreams[selected].dream} alt="front" onClick={() => setGallery({ imgs: [dreams[selected].preview || dreams[selected].dream], i: 0 })}
              style={{ ...px(171, 279.3, 245.8, 163.8), objectFit: "contain", cursor: "zoom-in" }} />
          )}
          {backPng && (<>
            {/* slot 2 — cover the baked mock WITHOUT touching the dashed
                divider at x685.7 (round 8 #12), centre the real back label
                on the dashed band's midline (round 14 #8) */}
            {patch(452, 268, 230, 180, "bmock2")}
            {(() => {
              const fit2 = fitIn(227, 160, backDims.w, backDims.h);
              return (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={backPng} alt="back" onClick={() => setGallery({ imgs: [backPng], i: 0 })}
                  style={{ ...px(452 + fit2.dx, 280 + fit2.dy, fit2.w, fit2.h), objectFit: "fill", cursor: "zoom-in" }} />
              );
            })()}
          </>)}
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
                <img key={`${label}@${x}`} src={it.prev} alt={label} onClick={() => { const g = gal?.length ? gal : [it.full]; setGallery({ imgs: g, i: Math.max(0, g.indexOf(it.full)) }); }}
                  style={{ ...px(x, y, w2, h2), objectFit: fit, cursor: "zoom-in" }} />
              ) : (
                <div key={`${label}@${x}`} style={{ ...px(x, y, w2, h2), background: "#F4F3EE", display: "flex", alignItems: "center", justifyContent: "center", font: `${fs}px ${HNW}`, color: "#999", textAlign: "center" }}>{label ? `[ ${label} ]` : ""}</div>
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
              {box(1112, 284, 176, 150, undefined, "Landing Page", "cover")}
            </>);
          })()}
          {/* round 8 #11/#15: the whole pricing block re-rendered 20.5px
              higher — no top dashed rule, agree row lands on the back
              arrow's line, ring+dot+text aligned by construction */}
          {patch(130, 503, 1180, 240, "pricing")}
          {(() => {
            const SH = 20.5, B = IN_BASE - 2;   /* baseline offset in a 16px line */
            const rows = [536.49, 570.78, 604.93, 639.35, 673.77].map((y) => y - SH);
            return (<>
              {[548.84, 582.86, 617.14, 651.7].map((y, i) => (
                <div key={"dsh" + i} style={{ ...px(137.14, y - SH, 1302.47 - 137.14, 1), background: "repeating-linear-gradient(90deg, #000 0 5px, transparent 5px 10px)" }} />
              ))}
              {PACK.map((it, i) => (
                <span key={it.name}>
                  <span style={{ ...px(171.43, rows[i] - B, 500, 16), font: `700 15px ${HNW}`, lineHeight: "16px" }}>{it.name}</span>
                  <span style={{ ...px(1152.9, rows[i] - B, 150, 16), font: `700 15px ${HNW}`, lineHeight: "16px", textAlign: "right", display: "block" }}>${it.price}</span>
                  {dotBtn(144.64, rows[i] - 4.93, !!packSel[i], () => setPackSel((ps) => ps.map((v, k) => (k === i ? !v : v))), "pk" + i, { ring: true })}
                </span>
              ))}
              {dotBtn(144.64, 686, agree, () => setAgree(!agree), "agree", { ring: true })}
              <span style={{ ...px(171.43, 691.3 - B, 400, 16), font: `15px ${HNW}`, lineHeight: "16px" }}>I agree to the <u>Terms &amp; Conditions</u></span>
              <span style={{ ...px(852.24, 691.3 - B - 3, 240, 20), font: `700 19px ${HNW}`, lineHeight: "20px" }}>TOTAL SUM: ${total}</span>
              <button onClick={proceedToPayment} style={{ ...px(1032, 669.5, 268, 32), cursor: "pointer", font: `12px ${HNW}`, letterSpacing: 0.3, background: "#111", color: "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>Proceed to payment</button>
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
    <main style={{ background: "#000", minHeight: "100vh", margin: 0, padding: 0 }}>
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
        @keyframes arrowFly { from { left: 122px } to { left: 1324px } }
        @keyframes nuiFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes nuiFadeOut { from { opacity: 1 } to { opacity: 0 } }
        @keyframes szGrow { from { transform: scale(0) } to { transform: scale(1) } }`}</style>
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
                <div style={{ position: "absolute", inset: 0, userSelect: "none" }} dangerouslySetInnerHTML={{ __html: boards[p] || "" }} />
                {renderOverlay(p, inSlide)}
              </>
            );
            const strips = (p: PageKey, anim: string) => {
              const cuts = [0, ...STRIP_BOUNDS[p].map((b) => Math.min(zoneH, Math.max(0, Math.round(b + pageTop)))), zoneH];
              return cuts.slice(0, -1).map((y0, si) => (
                <div key={`${p}-${si}`} style={{ position: "absolute", left: 0, top: y0, width: W, height: cuts[si + 1] - y0, overflow: "hidden", animation: `${anim} ${SLIDE_MS}ms ${EASE} ${STRIP_DELAYS[si]}ms both`, pointerEvents: "none" }}>
                  <div style={{ position: "absolute", left: 0, top: pageTop - y0, width: W, height: H }}>{pageSpace(p, true)}</div>
                </div>
              ));
            };
            const faded = (p: PageKey, anim: string, delay = 0) => (
              <div key={p} style={{ position: "absolute", inset: 0, animation: `${anim} ${FADE_MS}ms ${EASE} ${delay}ms both`, pointerEvents: "none" }}>
                <div style={{ position: "absolute", left: 0, top: pageTop, width: W, height: H }}>{pageSpace(p, true)}</div>
              </div>
            );
            return (
              <div style={{ position: "absolute", left: 0, top: fullSlide ? 0 : BAND_TOP, width: W, height: zoneH, overflow: "hidden" }}>
                {/* round 9 #1: entering the loader, the old page fully slides
                    out FIRST, then the loader fades in */}
                {prev && (prev === "loader" ? faded(prev, "nuiFadeOut") : strips(prev, "nuiOut"))}
                {prev
                  ? (page === "loader" ? faded(page, "nuiFadeIn", SLIDE_TOTAL) : strips(page, "nuiIn"))
                  : <div style={{ position: "absolute", left: 0, top: pageTop, width: W, height: H }}>{pageSpace(page, false)}</div>}
              </div>
            );
          })()}

          {/* STATIC header (real fonts, extracted geometry) */}
          <div style={{ ...px(0, 0, W, HEADER_H), background: "#000" }}>
            <span style={{ ...px(138.2, 25.5, 100, 20), font: `700 19px ${HNW}`, color: "#fff" }}>8K</span>
            <span style={{ ...px(1056, 27.5, 90, 16), font: `700 13px ${HNW}`, color: "#fff" }}>About Us</span>
            <span style={{ ...px(1160, 27.5, 80, 16), font: `700 13px ${HNW}`, color: "#fff" }}>Gallery</span>
            <span style={{ ...px(1253.5, 27.5, 80, 16), font: `700 13px ${HNW}`, color: "#fff" }}>Contact</span>
          </div>

          {/* STATIC progress bar (hidden on welcome & checkout) */}
          {thick !== null && (
            <div style={{ ...px(0, 660, W, FOOTER_Y - 660), background: "#fff" }}>
              <div style={{ ...px(137.14, 685.09 - 660, 1297.9 - 137.14, 1), background: "#111" }} />
              <div style={{ ...px(142.06, 684.09 - 660, thick - 142.06, 3), background: "#111", transition: `width ${SLIDE_MS}ms ${EASE}` }} />
              {CIRCLE_X.map((cx0, i) => (
                <span key={i} style={{ ...px(cx0 - 4.9, 685.59 - 4.9 - 660, 9.8, 9.8), borderRadius: 5, border: "1px solid #111", background: step >= i ? "#111" : "#fff", transition: `background 300ms ${EASE}`, boxSizing: "border-box" }} />
              ))}
              {STEP_LABELS.map(([t, x0]) => (
                <span key={t} style={{ ...px(x0, 708.5 - 660, 260, 18), font: `700 15px ${HNW}`, color: "#111", lineHeight: "15px" }}>{t}</span>
              ))}
              {/* back arrow */}
              {(
                <button aria-label="back" onClick={goBack} style={{ ...px(56, 666 - 660, 60, 40), ...ghost }}>
                  <svg viewBox="0 0 60 40" width="60" height="40"><line x1="47" y1="20" x2="13" y2="20" stroke="#000" strokeWidth="3" /><polyline points="23,9.5 12.5,20 23,30.5" fill="none" stroke="#000" strokeWidth="3" /></svg>
                </button>
              )}
              {/* forward arrow */}
              <button aria-label="next"
                onClick={() => {
                  if (page === "vision") go("front");
                  else if (page === "front") nextFromFront();
                  else if (page === "options") {
                    /* round 7 #12: warn instead of silently ignoring */
                    if (selected >= 0) go("backdetails");
                    else { setWarn("Select a label design to continue"); setTimeout(() => setWarn(""), 3200); }
                  }
                  else if (page === "backdetails") go("compliance");
                  else if (page === "compliance") {
                    if (markets.length) nextFromCompliance();
                    else { setWarn("Select at least one market to continue"); setTimeout(() => setWarn(""), 3200); }
                  }
                  else if (page === "backdesign") go("bottle");
                  else if (page === "bottle") go("assets");
                  else if (page === "assets") go("checkout");
                }}
                style={{ ...px(1324, 666 - 660, 60, 40), ...ghost }}>
                <svg viewBox="0 0 60 40" width="60" height="40"><line x1="13" y1="20" x2="47" y2="20" stroke="#000" strokeWidth="3" /><polyline points="37,9.5 47.5,20 37,30.5" fill="none" stroke="#000" strokeWidth="3" /></svg>
              </button>
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
            <span style={{ ...px(138.4, 779.4 - FOOTER_Y, 700, 16), font: `300 11px ${HNW}`, color: "#fff" }}>© 8K Labels — a demo interface built from your uploaded mockup</span>
            <a href="/classic" style={{ ...px(1240, 779.4 - FOOTER_Y, 160, 16), font: `300 11px ${HNW}`, color: "#888", textDecoration: "none" }}>classic interface</a>
          </div>

          {busyMsg && <div style={{ ...px(1090, 78, 320, 20), font: `13px ${HNW}`, color: "#8a887e", textAlign: "right" }}>{busyMsg}</div>}

          {/* gallery mode (owner #21) */}
          {gallery && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(17,17,17,0.92)", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => setGallery(null)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={gallery.imgs[gallery.i]} alt="" onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: W * 0.82, maxHeight: H * 0.82, background: "#fff", boxShadow: "0 8px 60px rgba(0,0,0,0.5)" }} />
              {gallery.imgs.length > 1 && (<>
                <button onClick={(e) => { e.stopPropagation(); setGallery((g) => g && { ...g, i: (g.i + g.imgs.length - 1) % g.imgs.length }); }}
                  style={{ ...px(40, H / 2 - 30, 60, 60), ...ghost, color: "#fff", font: `300 46px ${HNW}` }}>‹</button>
                <button onClick={(e) => { e.stopPropagation(); setGallery((g) => g && { ...g, i: (g.i + 1) % g.imgs.length }); }}
                  style={{ ...px(W - 100, H / 2 - 30, 60, 60), ...ghost, color: "#fff", font: `300 46px ${HNW}` }}>›</button>
              </>)}
              <button onClick={() => setGallery(null)} style={{ ...px(W - 80, 30, 50, 50), ...ghost, color: "#fff", font: `300 34px ${HNW}` }}>×</button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
