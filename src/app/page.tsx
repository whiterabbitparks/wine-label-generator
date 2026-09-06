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
const SLIDE_MS = 520;
const HNW = "'HNW', 'Helvetica Neue', Helvetica, sans-serif";

const ORDER = ["welcome", "vision", "front", "loader", "options", "backdetails", "compliance", "backdesign", "bottle", "assets", "checkout"] as const;
type PageKey = (typeof ORDER)[number];

/* progress thick-line endpoint per page (extracted; null = no bar) */
const THICK: Record<PageKey, number | null> = {
  welcome: null, vision: 334.48, front: 334.48, loader: 522.43, options: 522.43,
  backdetails: 527.35, compliance: 720.28, backdesign: 907.72, bottle: 912.65,
  assets: 1106.38, checkout: null,
};
const STEP_OF: Record<PageKey, number> = { welcome: -1, vision: 0, front: 0, loader: 0, options: 0, backdetails: 1, compliance: 1, backdesign: 1, bottle: 2, assets: 2, checkout: 3 };
const CIRCLE_X = [142.06, 527.4, 912.6, 1297.9];
const STEP_LABELS: [string, number][] = [["Front Label", 137.2], ["Back Label", 487.5], ["Marketing Assets", 850.2], ["Check out", 1228.2]];

/* content band bottom per page (checkout content reaches the footer) */
const BAND_BOTTOM: Record<PageKey, number> = Object.fromEntries(ORDER.map((p) => [p, p === "checkout" || p === "welcome" ? FOOTER_Y : 660])) as Record<PageKey, number>;

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

/* dominant ground colour of a label image (corner sampling) */
async function groundOf(url: string): Promise<string> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas"); c.width = 40; c.height = 40;
        const cx = c.getContext("2d")!;
        cx.drawImage(img, 0, 0, 40, 40);
        const pts = [[2, 2], [37, 2], [2, 37], [37, 37], [20, 2]];
        let r = 0, g = 0, b = 0;
        for (const [x, y] of pts) { const d = cx.getImageData(x, y, 1, 1).data; r += d[0]; g += d[1]; b += d[2]; }
        const hx = (v: number) => Math.round(v / pts.length).toString(16).padStart(2, "0");
        res("#" + hx(r) + hx(g) + hx(b));
      } catch { res("#FFFFFF"); }
    };
    img.onerror = () => res("#FFFFFF");
    img.src = url;
  });
}

export default function NewUI() {
  const [page, setPage] = useState<PageKey>("welcome");
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
  const [markets, setMarkets] = useState<string[]>(["EU"]);
  const [barcodeImg, setBarcodeImg] = useState("");
  const [qrImg, setQrImg] = useState("");
  const [backPng, setBackPng] = useState("");
  const [backPayload, setBackPayload] = useState<Record<string, unknown> | null>(null);
  const [backSig, setBackSig] = useState("");
  const [backDims, setBackDims] = useState({ w: 1, h: 1 });
  const [bottle, setBottle] = useState<Record<string, string>>({ type: "Bordeaux", color: "Olive Green", closure: "Cork", finish: "Matte" });
  const [wheel, setWheel] = useState({ x: 0.5, y: 0.5, rgb: [180, 40, 40] as number[] });
  const [shade, setShade] = useState(0.5);
  const [heroAsset, setHeroAsset] = useState(0);
  const [packSel, setPackSel] = useState<boolean[]>([true, true, true, true, false]);
  const [agree, setAgree] = useState(false);
  const [gallery, setGallery] = useState<{ imgs: string[]; i: number } | null>(null);
  const [busyMsg, setBusyMsg] = useState("");
  const dragRef = useRef<"" | "wheel" | "shade">("");
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
    setTimeout(() => setPrev(null), SLIDE_MS + 60);
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
  /* owner #15: input text matches placeholder style — italic (design st16) */
  const inputStyle: React.CSSProperties = { font: `italic 15px ${HNW}`, border: "none", outline: "none", background: "#fff", padding: 0, color: "#111" };
  const cross = (cx: number, cy: number, key: string) => (
    <svg key={key} style={{ ...px(cx - 9, cy - 9, 18, 18), pointerEvents: "none" }} viewBox="0 0 18 18">
      <line x1="9" y1="0.5" x2="9" y2="17.5" stroke="#000" strokeWidth="1" />
      <line x1="0.5" y1="9" x2="17.5" y2="9" stroke="#000" strokeWidth="1" />
    </svg>
  );
  /* centred contain-fit inside an area (owner #12) */
  const fitIn = (areaW: number, areaH: number, imgW: number, imgH: number) => {
    const k = Math.min(areaW / imgW, areaH / imgH);
    const w = imgW * k, h = imgH * k;
    return { w, h, dx: (areaW - w) / 2, dy: (areaH - h) / 2 };
  };

  const FRONT_ROWS = ["producer", "wine", "appellation", "classification", "vintage", "grape", "regionCountry", "special", "sweetness", "colour", "wineType", "alcohol", "volume"];
  const FRONT_PH = ["E.G. GRAND VIN", "E.g. Château Margaux", "E.g. Margaux AOC", "E.g. Grand Cru Classé", "E.g. 2018", "E.g. Cabernet Sauvignon", "E.g. Bordeaux, France", "E.g. Vieilles Vignes", "Dry, etc.", "E.g. Red, White etc.", "E.g. Wine, Sparkling Wine, etc.", "E.g. 12.5%", "E.g. 750 mL"];
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

  const renderOverlay = (p: PageKey) => {
    switch (p) {
      case "welcome":
        return <button aria-label="start" onClick={() => { setArrowFly(true); go("vision"); setTimeout(() => setArrowFly(false), SLIDE_MS + 80); }}
          style={{ ...px(122, 662, 60, 48), ...ghost }} />;
      case "vision":
        return (<>
          {patch(1215, 419, 100, 20, "cnt")}
          <span style={{ ...px(1221.8, 421, 100, 16), font: `11px ${HNW}`, color: "#111" }}>{vision.trim() ? vision.trim().split(/\s+/).length : 0} / 300 words</span>
          <textarea value={vision} onChange={(e) => setVision(e.target.value)} maxLength={2200}
            style={{ ...px(139, 212, 1160, 195), ...inputStyle, fontStyle: "normal", resize: "none", lineHeight: 1.5, overflow: "auto" }} />
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
        const sb = sizeBox();
        return (<>
          {/* cover baked E.g. column; live italic inputs with placeholders */}
          {patch(263, 234, 550, 372, "phcol")}
          {FRONT_ROWS.map((k, i) => (
            <input key={k} value={f[k] || ""} placeholder={FRONT_PH[i]}
              onChange={(e) => setF((m) => ({ ...m, [k]: e.target.value }))}
              style={{ ...px(264.9, 251.3 + i * 30.33 - 16, 540, 22), ...inputStyle }} />
          ))}
          {/* size area: cover baked interior (kills the diagonal), animated box */}
          {patch(815.6, 173.5, 486, 374.7, "szint")}
          <div style={{ ...px(sb.x, sb.y, sb.w, sb.h), border: "3px solid #111", transition: `all 380ms ${EASE}`, boxSizing: "border-box" }} />
          {/* size inputs: cover baked values, live captions */}
          {patch(948, 585, 175, 24, "szw")}
          {patch(1073, 585, 175, 24, "szh")}
          <span style={{ ...px(951.3, 587, 60, 18), font: `14px ${HNW}` }}>Width:</span>
          <input value={f.width} onChange={(e) => setF((m) => ({ ...m, width: e.target.value.replace(/[^\d.]/g, "") }))}
            style={{ ...px(1003, 587, 40, 18), ...inputStyle, fontStyle: "normal", fontSize: 14 }} />
          <span style={{ ...px(1041, 587, 30, 18), font: `14px ${HNW}` }}>mm</span>
          <span style={{ ...px(1076.8, 587, 60, 18), font: `14px ${HNW}` }}>Height:</span>
          <input value={f.height} onChange={(e) => setF((m) => ({ ...m, height: e.target.value.replace(/[^\d.]/g, "") }))}
            style={{ ...px(1133, 587, 40, 18), ...inputStyle, fontStyle: "normal", fontSize: 14 }} />
          <span style={{ ...px(1171, 587, 30, 18), font: `14px ${HNW}` }}>mm</span>
        </>);
      }
      case "loader": {
        /* glass at ~x690-760; wine rises with progress (owner #7) */
        return (<>
          {patch(600, 498, 260, 24, "ltxt")}
          <span style={{ ...px(0, 500, W, 20), font: `15px ${HNW}`, textAlign: "center", display: "block" }}>Designing your label…</span>
          <div style={{ ...px(700, 396, 42, 48), overflow: "hidden", pointerEvents: "none" }}>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${Math.round(genProgress * 100)}%`, background: "#7A1E2B", mixBlendMode: "multiply", transition: `height 600ms ${EASE}` }} />
          </div>
        </>);
      }
      case "options": {
        /* cover: dots rows, Select+magnifier boxes, baked corner crosses */
        const covers: React.ReactNode[] = [];
        covers.push(patch(255, 503, 930, 24, "dots"));
        covers.push(patch(135, 546, 1172, 40, "selrow"));
        for (const fx0 of [137.1, 480, 548.5, 891.4, 960, 1302.9])
          for (const fy0 of [240, 468.6]) covers.push(patch(fx0 - 11, fy0 - 11, 22, 22, `c${fx0}-${fy0}`));
        return (<>
          {covers}
          {OPT_FRAMES.map((fr, i) => {
            const d = dreams[i];
            if (!d?.preview && !d?.dream) return null;
            const ar = (Number(f.width) || 110) / (Number(f.height) || 80);
            const fit = fitIn(OPT_W, OPT_BOT - OPT_TOP, ar, 1);
            const lx = fr.x + fit.dx, ly = OPT_TOP + fit.dy;
            return (
              <div key={i}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.preview || d.dream} alt={d.style} onClick={() => setGallery({ imgs: dreams.map((dd) => dd.preview || dd.dream), i })}
                  style={{ ...px(lx, ly, fit.w, fit.h), cursor: "zoom-in", objectFit: "fill" }} />
                {cross(lx, ly, `tl${i}`)}{cross(lx + fit.w, ly, `tr${i}`)}
                {cross(lx, ly + fit.h, `bl${i}`)}{cross(lx + fit.w, ly + fit.h, `br${i}`)}
              </div>
            );
          })}
          {OPT_FRAMES.map((fr, i) => (
            <button key={"s" + i} onClick={() => setSelected(i)}
              style={{
                ...px(fr.x + 0.2, 548.6, OPT_W, 34.3), cursor: "pointer",
                font: `700 15px ${HNW}`, letterSpacing: 0.3, transition: `all 180ms ${EASE}`,
                background: selected === i ? "#fff" : "#111",
                color: selected === i ? "#111" : "#fff",
                border: "2px solid #111", boxSizing: "border-box",
              }}>Select</button>
          ))}
        </>);
      }
      case "backdetails":
        return (<>
          {patch(596, 424, 110, 18, "cnt2")}
          <span style={{ ...px(600.2, 425, 110, 16), font: `11px ${HNW}` }}>{(b.description || "").trim() ? (b.description || "").trim().split(/\s+/).length : 0} / 300 words</span>
          <textarea value={b.description || ""} onChange={(e) => setB((m) => ({ ...m, description: e.target.value }))}
            style={{ ...px(139, 212, 460, 195), ...inputStyle, fontStyle: "normal", fontSize: 14, resize: "none", lineHeight: 1.45, overflow: "auto" }} />
          {patch(987, 230, 330, 300, "bpcol")}
          {BACK_ROWS.map((k, i) => (
            <input key={k} value={b[k] || ""} placeholder={BACK_PH[i]}
              onChange={(e) => setB((m) => ({ ...m, [k]: e.target.value }))}
              style={{ ...px(989.6, 247.1 + i * 33.1 - 16, 325, 22), ...inputStyle, fontSize: 14 }} />
          ))}
          {/* create/upload toggles on the baked outline boxes; uploads are real */}
          <button onClick={() => { setBarcodeImg(""); }} style={{ ...px(138, 480, 239.1, 34.3), ...ghost, outline: !barcodeImg ? "2px solid #111" : "none", outlineOffset: -4 }} />
          <label style={{ ...px(445.7, 480, 240, 34.3), cursor: "pointer", outline: barcodeImg ? "2px solid #111" : "none", outlineOffset: -4, position: "absolute" }}>
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
              const file = e.target.files?.[0]; if (!file) return;
              const rd = new FileReader(); rd.onload = () => setBarcodeImg(String(rd.result)); rd.readAsDataURL(file);
            }} />
          </label>
          <button onClick={() => { setQrImg(""); }} style={{ ...px(754.3, 480, 240.1, 34.3), ...ghost, outline: !qrImg ? "2px solid #111" : "none", outlineOffset: -4 }} />
          <label style={{ ...px(1064, 480, 238.4, 34.3), cursor: "pointer", outline: qrImg ? "2px solid #111" : "none", outlineOffset: -4, position: "absolute" }}>
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
              const file = e.target.files?.[0]; if (!file) return;
              const rd = new FileReader(); rd.onload = () => setQrImg(String(rd.result)); rd.readAsDataURL(file);
            }} />
          </label>
        </>);
      case "compliance":
        return (<>
          <div style={{ ...px(598, 500, 165, 24), background: "#fff" }} />{/* Arabic removed */}
          {COMP.map(({ code, col, row }) => {
            const on = markets.includes(code);
            const cx = COMP_COLS[col] - 19.5, cy = 357.9 + row * 52.3 - 5.5;
            return (
              <button key={code} onClick={() => setMarkets((ms) => on ? ms.filter((m) => m !== code) : [...ms, code])}
                style={{ ...px(cx - 12, cy - 12, 24, 24), ...ghost }}>
                {on && <span style={{ position: "absolute", left: 7, top: 7, width: 10, height: 10, borderRadius: 5, background: "#111" }} />}
              </button>
            );
          })}
        </>);
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
              style={{ ...px(lx, 548.6, fit.w, 34.3), cursor: "pointer", font: `700 15px ${HNW}`, background: "#111", color: "#fff", border: "2px solid #111", boxSizing: "border-box" }}>Edit</button>
          </>)}
        </>);
      }
      case "bottle": {
        const cols: [string, string[], number][] = [
          ["type", ["Bordeaux", "Bordeaux Prestige", "Burgundy", "Sparkling", "Alsace / Rhine", "Ice Wine"], 385.6],
          ["color", ["Olive Green", "Transparent", "Amber"], 625.6],
          ["closure", ["Cork", "Screw Cap", "Wax Seal", "Crown Cap", "Sparkling Cork"], 864.6],
        ];
        return (<>
          {cols.map(([key, opts, cx0]) => opts.map((opt, i) => {
            const on = bottle[key] === opt;
            return (
              <button key={String(key) + opt} onClick={() => setBottle((m) => ({ ...m, [key]: opt }))}
                style={{ ...px(Number(cx0) - 12, 283.1 + i * 29.8 - 12, 24, 24), ...ghost }}>
                {on && <span style={{ position: "absolute", left: 8, top: 8, width: 8, height: 8, borderRadius: 4, background: "#111" }} />}
              </button>
            );
          }))}
          {([["Matte", 1104.6, 281.8], ["Glossy", 1172.1, 281.8], ["No cap", 1104.6, 312.6]] as const).map(([opt, cx0, cy0]) => {
            const on = bottle.finish === opt;
            return (
              <button key={opt} onClick={() => setBottle((m) => ({ ...m, finish: opt }))}
                style={{ ...px(cx0 - 12, cy0 - 12, 24, 24), ...ghost }}>
                {on && <span style={{ position: "absolute", left: 8, top: 8, width: 8, height: 8, borderRadius: 4, background: "#111" }} />}
              </button>
            );
          })}
          {/* colour wheel (restored artwork) + picker dot */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/newui/colorwheel.png" alt="" style={{ ...px(1097.1, 359.2, 137.2, 137.2), pointerEvents: "none" }} />
          <div style={{ ...px(1097.1, 359.2, 137.2, 137.2), cursor: "crosshair" }}
            onPointerDown={(e) => { dragRef.current = "wheel"; e.currentTarget.setPointerCapture(e.pointerId); wheelPick(e.clientX, e.clientY, e.currentTarget); }}
            onPointerMove={(e) => { if (dragRef.current === "wheel") wheelPick(e.clientX, e.clientY, e.currentTarget); }}
            onPointerUp={() => { dragRef.current = ""; }}>
            <span style={{ position: "absolute", left: `${wheel.x * 100}%`, top: `${wheel.y * 100}%`, transform: "translate(-50%,-50%)", width: 9.8, height: 9.8, borderRadius: 5, background: "#111", border: "1.5px solid #fff", pointerEvents: "none" }} />
          </div>
          {/* lightness track (baked line x1261.1 y358.8–495.4) */}
          <div style={{ ...px(1245, 350, 34, 155), cursor: "grab" }}
            onPointerDown={(e) => { dragRef.current = "shade"; e.currentTarget.setPointerCapture(e.pointerId); }}
            onPointerMove={(e) => {
              if (dragRef.current !== "shade") return;
              const r = e.currentTarget.getBoundingClientRect();
              setShade(Math.min(1, Math.max(0, (e.clientY - r.top - 8.8 * scale) / (r.height - 17.6 * scale))));
            }}
            onPointerUp={() => { dragRef.current = ""; }}>
            <span style={{ position: "absolute", left: 16.1 - 4.9, top: 8.8 + shade * 136.6 - 4.9, width: 9.8, height: 9.8, borderRadius: 5, background: "#111", border: "1.5px solid #fff", boxShadow: "0 0 0 1px #111" }} />
          </div>
          {/* result colour bar (baked rect 1097.1,532.6,171.4×18.3) */}
          <div style={{ ...px(1097.6, 533.1, 170.4, 17.3), background: shadeRgb() }} />
          {/* bottle photo in its area (owner's artwork) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/newui/bottle-photo.png" alt="bottle" style={{ ...px(137.1, 172, 205.7, 411.4), objectFit: "contain", objectPosition: "center" }} />
        </>);
      }
      case "assets": {
        const thumbs = [{ x: 994.3, y: 171.5 }, { x: 1165.8, y: 171.5 }, { x: 994.3, y: 376.9 }, { x: 1165.7, y: 377.4 }];
        const names = ["Context 1", "Context 2", "Context 3", "Context 4", "Context 5"];
        const order = [heroAsset, ...names.map((_, i) => i).filter((i) => i !== heroAsset)];
        const ph = (i: number, w2: number, h2: number, fs = 12) => (
          <div style={{ width: w2, height: h2, background: "#F4F3EE", display: "flex", alignItems: "center", justifyContent: "center", font: `${fs}px ${HNW}`, color: "#999" }}>
            [ {names[i]} ]
          </div>
        );
        return (<>
          <div style={{ ...px(548.6, 171.9, 338.6, 338.6) }}>{ph(order[0], 338.6, 338.6, 14)}</div>
          {thumbs.map((t, k) => (
            <button key={k} onClick={() => setHeroAsset(order[k + 1])} style={{ ...px(t.x, t.y, 137.9, 137.9), ...ghost }}>
              {ph(order[k + 1], 137.9, 137.9)}
            </button>
          ))}
          {/* product shots in the CROSS-MARKED area (137.1–411.4 × 171.9–514.8) */}
          <div style={{ ...px(139, 174, 133, 339), background: "#F4F3EE", display: "flex", alignItems: "center", justifyContent: "center", font: `12px ${HNW}`, color: "#999" }}>[ Shot: Face ]</div>
          <div style={{ ...px(276.3, 174, 133, 339), background: "#F4F3EE", display: "flex", alignItems: "center", justifyContent: "center", font: `12px ${HNW}`, color: "#999" }}>[ Shot: Back ]</div>
        </>);
      }
      case "checkout":
        return (<>
          {selected >= 0 && dreams[selected] && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={dreams[selected].preview || dreams[selected].dream} alt="front" onClick={() => setGallery({ imgs: [dreams[selected].preview || dreams[selected].dream], i: 0 })}
              style={{ ...px(171, 279.3, 245.8, 163.8), objectFit: "contain", cursor: "zoom-in" }} />
          )}
          {backPng && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={backPng} alt="back" onClick={() => setGallery({ imgs: [backPng], i: 0 })}
              style={{ ...px(1108.6, 283.6, 177.4, 88.7), objectFit: "contain", cursor: "zoom-in" }} />
          )}
          {/* pack selection dots (owner #24) + live total */}
          {PACK.map((it, i) => (
            <button key={it.name} onClick={() => setPackSel((ps) => ps.map((v, k) => (k === i ? !v : v)))}
              style={{ ...px(139, it.base - 18, 24, 24), ...ghost }}>
              <span style={{ position: "absolute", left: 3, top: 3, width: 16, height: 16, borderRadius: 8, border: "1px solid #111" }} />
              {packSel[i] && <span style={{ position: "absolute", left: 7, top: 7, width: 8, height: 8, borderRadius: 4, background: "#111" }} />}
            </button>
          ))}
          {patch(985, 684, 100, 24, "tot")}
          <span style={{ ...px(850.2, 686, 240, 20), font: `700 19px ${HNW}` }}>TOTAL SUM: ${total}</span>
          {/* agree: circle like the others (owner #24) */}
          {patch(140, 688, 26, 26, "agr")}
          <button onClick={() => setAgree(!agree)} style={{ ...px(139, 687, 26, 26), ...ghost }}>
            <span style={{ position: "absolute", left: 4, top: 4, width: 16, height: 16, borderRadius: 8, border: "1px solid #111" }} />
            {agree && <span style={{ position: "absolute", left: 8, top: 8, width: 8, height: 8, borderRadius: 4, background: "#111" }} />}
          </button>
          <button aria-label="pay" onClick={proceedToPayment} style={{ ...px(1090, 682, 250, 46), ...ghost }} />
          <button aria-label="back" onClick={goBack} style={{ ...px(56, 664, 60, 44), ...ghost }} />
        </>);
      default:
        return null;
    }
  };

  const step = STEP_OF[page];
  const thick = THICK[page];
  const bandBottom = BAND_BOTTOM[page];
  const fullSlide = page === "vision" && prev === "welcome" || page === "welcome";

  return (
    <main style={{ background: "#000", minHeight: "100vh", margin: 0, padding: 0 }}>
      <style>{`html, body { margin: 0; padding: 0; background: #000; }
        @font-face { font-family: 'HNW'; src: url('/newui/fonts/HNW-55Roman.ttf'); font-weight: 400; font-style: normal; }
        @font-face { font-family: 'HNW'; src: url('/newui/fonts/HNW-56It.ttf'); font-weight: 400; font-style: italic; }
        @font-face { font-family: 'HNW'; src: url('/newui/fonts/HNW-75Bold.ttf'); font-weight: 700; font-style: normal; }
        @font-face { font-family: 'HNW'; src: url('/newui/fonts/HNW-45Lt.ttf'); font-weight: 300; font-style: normal; }
        input::placeholder, textarea::placeholder { color: #111; opacity: 1; font-style: italic; }
        @keyframes nuiIn { from { transform: translateX(${dir > 0 ? "100%" : "-100%"}) } to { transform: translateX(0) } }
        @keyframes nuiOut { from { transform: translateX(0) } to { transform: translateX(${dir > 0 ? "-100%" : "100%"}) } }
        @keyframes arrowFly { from { left: 122px } to { left: 1324px } }`}</style>
      <div style={{ width: W * scale, height: H * scale, position: "relative", margin: "0 auto" }}>
        <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", overflow: "hidden", background: "#fff" }}>

          {/* sliding zone: full page on welcome transitions, content band otherwise */}
          <div style={{ position: "absolute", left: 0, top: fullSlide ? 0 : BAND_TOP, width: W, height: (fullSlide ? H : bandBottom - BAND_TOP), overflow: "hidden" }}>
            {prev && (
              <div style={{ position: "absolute", inset: 0, animation: `nuiOut ${SLIDE_MS}ms ${EASE} forwards` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/newui/${prev}.svg`} alt="" style={{ position: "absolute", left: 0, top: fullSlide ? 0 : -BAND_TOP, width: W, height: H }} />
              </div>
            )}
            <div style={{ position: "absolute", inset: 0, animation: prev ? `nuiIn ${SLIDE_MS}ms ${EASE}` : "none" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/newui/${page}.svg`} alt="" draggable={false} style={{ position: "absolute", left: 0, top: fullSlide ? 0 : -BAND_TOP, width: W, height: H, userSelect: "none" }} />
            </div>
          </div>

          {/* interactive overlays live in full-canvas coordinates */}
          <div style={{ position: "absolute", inset: 0 }}>{renderOverlay(page)}</div>

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
              <div style={{ ...px(137.14, 685.09 - 660, 1166.3, 1), background: "#111" }} />
              <div style={{ ...px(142.06, 684.09 - 660, thick - 142.06, 3), background: "#111", transition: `width ${SLIDE_MS}ms ${EASE}` }} />
              {CIRCLE_X.map((cx0, i) => (
                <span key={i} style={{ ...px(cx0 - 4.9, 685.59 - 4.9 - 660, 9.8, 9.8), borderRadius: 5, border: "1px solid #111", background: step >= i ? "#111" : "#fff", transition: `background 300ms ${EASE}`, boxSizing: "border-box" }} />
              ))}
              {STEP_LABELS.map(([t, x0]) => (
                <span key={t} style={{ ...px(x0, 706 - 660, 260, 22), font: `700 19px ${HNW}`, color: "#111" }}>{t}</span>
              ))}
              {/* back arrow */}
              {page !== "vision" && (
                <button aria-label="back" onClick={goBack} style={{ ...px(56, 666 - 660, 60, 40), ...ghost }}>
                  <svg viewBox="0 0 60 40" width="60" height="40"><line x1="47" y1="20" x2="13" y2="20" stroke="#000" strokeWidth="3" /><polyline points="23,9.5 12.5,20 23,30.5" fill="none" stroke="#000" strokeWidth="3" /></svg>
                </button>
              )}
              {/* forward arrow */}
              <button aria-label="next" disabled={page === "options" && selected < 0}
                onClick={() => {
                  if (page === "vision") go("front");
                  else if (page === "front") nextFromFront();
                  else if (page === "options") { if (selected >= 0) go("backdetails"); }
                  else if (page === "backdetails") go("compliance");
                  else if (page === "compliance") nextFromCompliance();
                  else if (page === "backdesign") go("bottle");
                  else if (page === "bottle") go("assets");
                  else if (page === "assets") go("checkout");
                }}
                style={{ ...px(1324, 666 - 660, 60, 40), ...ghost, opacity: page === "options" && selected < 0 ? 0.25 : 1 }}>
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
