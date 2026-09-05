"use client";

/* NEW UI (owner's Illustrator redesign, 2026-09-05 — NEW UI/*.svg).
   PIXEL-FIRST: every page renders the owner's own artboard SVG as the
   base layer on a FIXED 1440×823 canvas (scaled as one unit, no reflow);
   interactive elements are transparent overlays at design coordinates.
   Header/footer are STATIC (owner note 1): recreated as fixed bars that
   cover the identical strips baked into each artboard, so page slides
   happen only in the middle band. Pages slide LEFT on advance with a
   quick smooth ease; the welcome arrow travels to its resting spot
   (owner notes). Classic interface stays at /classic (switch in footer).
   Mock raster content was stripped from the artboards — live content
   (generated labels, back label, placeholders) fills the same frames
   (public/newui/frames.json). */

import { useCallback, useEffect, useRef, useState } from "react";

const W = 1440, H = 823;
const EASE = "cubic-bezier(0.33, 1, 0.68, 1)"; // quick out, no rigidity
const SLIDE_MS = 520;

const PAGES = ["welcome", "vision", "front", "loader", "options", "backdetails", "compliance", "backdesign", "bottle", "assets", "checkout"] as const;
type PageKey = (typeof PAGES)[number];

const STEP_OF: Record<PageKey, number> = { welcome: -1, vision: 0, front: 0, loader: 0, options: 0, backdetails: 1, compliance: 1, backdesign: 1, bottle: 2, assets: 2, checkout: 3 };
const STEPS = [
  { label: "Front Label", x: 0.09 },
  { label: "Back Label", x: 0.335 },
  { label: "Marketing Assets", x: 0.588 },
  { label: "Check out", x: 0.845 },
];

/* generic story ideas (owner: no specific architecture/locations) */
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

interface Dream { style: string; dream: string; preview: string | null }

export default function NewUI() {
  const [page, setPage] = useState<PageKey>("welcome");
  const [prev, setPrev] = useState<PageKey | null>(null);
  const [dir, setDir] = useState(1);
  const [scale, setScale] = useState(1);

  /* form state */
  const [vision, setVision] = useState("");
  const [sketch, setSketch] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>({ width: "110", height: "80" });
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [selected, setSelected] = useState<number>(-1);
  const [b, setB] = useState<Record<string, string>>({});
  const [markets, setMarkets] = useState<string[]>(["EU"]);
  const [barcodeMode, setBarcodeMode] = useState("create");
  const [qrMode, setQrMode] = useState("create");
  const [backPng, setBackPng] = useState<string>("");
  const [backPayload, setBackPayload] = useState<Record<string, unknown> | null>(null);
  const [bottle, setBottle] = useState<Record<string, string>>({ type: "Bordeaux", color: "Olive Green", closure: "Cork", finish: "Matte" });
  const [shade, setShade] = useState(0.35); // closure colour lightness (drag)
  const [heroAsset, setHeroAsset] = useState(0);
  const [agree, setAgree] = useState(false);
  const [busyMsg, setBusyMsg] = useState("");
  const dragRef = useRef(false);

  useEffect(() => {
    const fit = () => setScale(Math.min(1, window.innerWidth / W));
    fit(); window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const go = useCallback((next: PageKey, d = 1) => {
    setPrev(page); setDir(d); setPage(next);
    setTimeout(() => setPrev(null), SLIDE_MS + 60);
  }, [page]);

  /* front generation: ONE label per style (owner: no variations yet) */
  async function generateFront() {
    go("loader");
    const aspect = (Number(f.width) || 110) / (Number(f.height) || 80);
    const aspectKey = aspect > 1.15 ? "landscape" : aspect < 0.87 ? "portrait" : "square";
    const data = {
      producer: f.producer || "", wine: f.wine || "", appellation: f.appellation || "",
      classification: f.classification || "", grape: f.grape || "",
      region: (f.regionCountry || "").split(",")[0]?.trim() || "",
      country: (f.regionCountry || "").split(",")[1]?.trim() || "",
      special: f.special || "", vintage: f.vintage || "",
      wineColorName: f.colour || "Red", wineType: f.wineType || "Still Wine",
      sweetness: f.sweetness || "Dry", alcohol: (f.alcohol || "12.5").replace("%", ""),
      volume: (f.volume || "750").replace(/\D/g, "") || "750",
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
      return { style, dream: res.dream || "", preview: res.preview || null };
    };
    try {
      const settled = await Promise.allSettled(["traditional", "contemporary", "punk"].map(one));
      const ok = settled.filter((x): x is PromiseFulfilledResult<Dream> => x.status === "fulfilled").map((x) => x.value);
      if (!ok.length) throw new Error("all generations failed — try again");
      setDreams(ok); setSelected(-1);
      go("options");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      go("front", -1);
    }
  }

  async function generateBack() {
    setBusyMsg("Composing back label…");
    const payload = {
      data: {
        wine: f.wine || "", producer: [b.producerCompany, b.producerAddress].filter(Boolean).join(", "),
        description: b.description || "", importer: [b.importer, b.importerAddress].filter(Boolean).join(", "),
        bottlingDate: b.bottlingDate || "", lot: b.lot || "", web: b.web || "",
        alcohol: (f.alcohol || "12.5").replace("%", ""), volume: (f.volume || "750").replace(/\D/g, "") || "750",
        countryOfOrigin: (f.regionCountry || "").split(",")[1]?.trim() || "Georgia",
      },
      markets, heightMM: Number(f.height) || 80,
    };
    try {
      const r = await fetch("/api/back-label", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, format: "png" }) });
      if (!r.ok) throw new Error("back label failed");
      setBackPng(URL.createObjectURL(await r.blob()));
      setBackPayload(payload);
      go("backdesign");
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    setBusyMsg("");
  }

  async function proceedToPayment() {
    /* TEMP: downloads the pack directly — payment phase comes later */
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

  /* ---------- shared overlay helpers (design px) ---------- */
  const px = (x: number, y: number, w?: number, h?: number): React.CSSProperties =>
    ({ position: "absolute", left: x, top: y, width: w, height: h });
  const HN = "'Helvetica Neue', Helvetica, Arial, sans-serif";
  const inputBase: React.CSSProperties = { font: `15px ${HN}`, border: "none", outline: "none", background: "transparent", padding: 0 };

  const fieldRows: [string, number][] = [
    ["producer", 226], ["wine", 257], ["appellation", 288], ["classification", 318],
    ["vintage", 349], ["grape", 380], ["regionCountry", 410], ["special", 441],
    ["sweetness", 472], ["colour", 502], ["wineType", 533], ["alcohol", 564], ["volume", 594],
  ];
  const backRows: [string, number][] = [
    ["producerCompany", 226], ["producerAddress", 259], ["importer", 292], ["importerAddress", 325],
    ["bottlingDate", 358], ["lot", 391], ["web", 424],
  ];
  const MARKET_GRID: { code: string; x: number; y: number }[] = [
    { code: "EU", x: 0.24, y: 0.42 }, { code: "AU", x: 0.42, y: 0.42 }, { code: "KR", x: 0.59, y: 0.42 }, { code: "IL", x: 0.735, y: 0.42 },
    { code: "US", x: 0.24, y: 0.48 }, { code: "NZ", x: 0.42, y: 0.48 }, { code: "BR", x: 0.59, y: 0.48 }, { code: "GE", x: 0.735, y: 0.48 },
    { code: "GB", x: 0.24, y: 0.545 }, { code: "CN", x: 0.42, y: 0.545 }, { code: "MX", x: 0.59, y: 0.545 }, { code: "CA", x: 0.735, y: 0.545 },
    { code: "JP", x: 0.24, y: 0.61 },
  ];

  /* frames from the stripped artboards */
  const OPT_FRAMES = [{ x: 137.1, y: 240 }, { x: 548.6, y: 240 }, { x: 960, y: 240 }];
  const OPT_W = 337.9, OPT_H = 225.3;

  const label = (dream: Dream | undefined, frameW: number, frameH: number) => {
    if (!dream?.preview && !dream?.dream) return null;
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img src={dream.preview || dream.dream} alt={dream.style}
        style={{ position: "absolute", top: 0, right: 0, maxWidth: frameW, maxHeight: frameH, display: "block" }} />
    );
  };

  const renderOverlay = (p: PageKey) => {
    switch (p) {
      case "welcome":
        return <button aria-label="start" onClick={() => go("vision")}
          style={{ ...px(1180, 380, 200, 120), background: "transparent", border: "none", cursor: "pointer" }} />;
      case "vision":
        return (<>
          <textarea value={vision} onChange={(e) => setVision(e.target.value)} maxLength={2200}
            style={{ ...px(132, 250, 900, 210), ...inputBase, resize: "none", lineHeight: 1.45 }} />
          <button onClick={() => setVision(IDEAS[Math.floor(Math.random() * IDEAS.length)])}
            style={{ ...px(1060, 250, 260, 60), background: "transparent", border: "none", cursor: "pointer" }}
            title="Give me an idea" />
          <label style={{ ...px(132, 470, 420, 46), cursor: "pointer" }}>
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
              const file = e.target.files?.[0]; if (!file) { setSketch(null); return; }
              const rd = new FileReader(); rd.onload = () => setSketch(String(rd.result)); rd.readAsDataURL(file);
            }} />
            {sketch && <span style={{ font: `12px ${HN}`, position: "absolute", left: 0, top: 46 }}>✓ sketch attached</span>}
          </label>
          <button aria-label="next" onClick={() => go("front")}
            style={{ ...px(1310, 640, 90, 90), background: "transparent", border: "none", cursor: "pointer" }} />
        </>);
      case "front":
        return (<>
          {fieldRows.map(([k, y]) => (
            <input key={k} value={f[k] || ""} onChange={(e) => setF((m) => ({ ...m, [k]: e.target.value }))}
              style={{ ...px(259, y, 620, 24), ...inputBase }} />
          ))}
          <input value={f.width} onChange={(e) => setF((m) => ({ ...m, width: e.target.value }))}
            style={{ ...px(1130, 300, 60, 24), ...inputBase }} />
          <input value={f.height} onChange={(e) => setF((m) => ({ ...m, height: e.target.value }))}
            style={{ ...px(1130, 336, 60, 24), ...inputBase }} />
          <button aria-label="generate" onClick={generateFront}
            style={{ ...px(1310, 640, 90, 90), background: "transparent", border: "none", cursor: "pointer" }} />
        </>);
      case "loader":
        return (
          <div style={{ ...px(620, 520, 200, 30), display: "flex", gap: 14, justifyContent: "center" }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ width: 9, height: 9, background: "#111", borderRadius: 0, animation: `nuiPulse 1.05s ${i * 0.18}s infinite ${EASE}` }} />
            ))}
          </div>
        );
      case "options":
        return (<>
          {OPT_FRAMES.map((fr, i) => (
            <div key={i} style={{ ...px(fr.x, fr.y, OPT_W, OPT_H) }}>
              {label(dreams[i], OPT_W, OPT_H)}
            </div>
          ))}
          {OPT_FRAMES.map((fr, i) => (
            <button key={"s" + i} onClick={() => setSelected(i)}
              style={{
                ...px(fr.x + 100, 545, 140, 42), cursor: "pointer",
                font: `15px ${HN}`, transition: `all 200ms ${EASE}`,
                background: selected === i ? "#fff" : "#111",
                color: selected === i ? "#111" : "#fff",
                border: "2px solid #111",
              }}>Select</button>
          ))}
          <button aria-label="next" disabled={selected < 0} onClick={() => go("backdetails")}
            style={{ ...px(1310, 640, 90, 90), background: "transparent", border: "none", cursor: selected >= 0 ? "pointer" : "default", opacity: selected >= 0 ? 1 : 0.25 }} />
        </>);
      case "backdetails":
        return (<>
          <textarea value={b.description || ""} onChange={(e) => setB((m) => ({ ...m, description: e.target.value }))}
            style={{ ...px(132, 210, 430, 200), ...inputBase, resize: "none", lineHeight: 1.4 }} />
          {backRows.map(([k, y]) => (
            <input key={k} value={b[k] || ""} onChange={(e) => setB((m) => ({ ...m, [k]: e.target.value }))}
              style={{ ...px(985, y, 380, 24), ...inputBase }} />
          ))}
          {[["create", 190, "barcode"], ["upload", 495, "barcode"], ["create", 800, "qr"], ["upload", 1120, "qr"]].map(([mode, x, kind]) => {
            const active = (kind === "barcode" ? barcodeMode : qrMode) === mode;
            return <button key={String(kind) + mode} onClick={() => (kind === "barcode" ? setBarcodeMode(String(mode)) : setQrMode(String(mode)))}
              style={{ ...px(Number(x), 478, 200, 40), background: "transparent", border: active ? "2px solid #111" : "2px solid transparent", cursor: "pointer" }} />;
          })}
          <button aria-label="next" onClick={() => go("compliance")}
            style={{ ...px(1310, 640, 90, 90), background: "transparent", border: "none", cursor: "pointer" }} />
        </>);
      case "compliance":
        return (<>
          {MARKET_GRID.map(({ code, x, y }) => {
            const on = markets.includes(code);
            return <button key={code} onClick={() => setMarkets((ms) => on ? ms.filter((m) => m !== code) : [...ms, code])}
              style={{ ...px(x * W - 34, y * H - 6, 26, 26), cursor: "pointer", background: on ? "#111" : "transparent", border: "2px solid #111", borderRadius: 13, transition: `background 160ms ${EASE}` }} />;
          })}
          <button aria-label="next" onClick={generateBack}
            style={{ ...px(1310, 640, 90, 90), background: "transparent", border: "none", cursor: "pointer" }} />
        </>);
      case "backdesign":
        return (<>
          {backPng && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={backPng} alt="back label" style={{ ...px(561, 185, 526, 0), maxHeight: 350, width: "auto", maxWidth: 526, border: "1px solid #ddd" }} />
          )}
          <button onClick={() => go("backdetails", -1)}
            style={{ ...px(660, 545, 90, 36), background: "transparent", border: "none", cursor: "pointer", font: `15px ${HN}`, textDecoration: "underline" }} />
          <button aria-label="next" onClick={() => go("bottle")}
            style={{ ...px(1310, 640, 90, 90), background: "transparent", border: "none", cursor: "pointer" }} />
        </>);
      case "bottle": {
        const cols: [string, string[], number][] = [
          ["type", ["Bordeaux", "Bordeaux Prestige", "Burgundy", "Sparkling", "Alsace / Rhine", "Ice Wine"], 0.28],
          ["color", ["Olive Green", "Transparent", "Amber"], 0.43],
          ["closure", ["Cork", "Screw Cap", "Wax Seal", "Crown Cap", "Sparkling Cork", "No cap"], 0.59],
          ["finish", ["Matte", "Glossy"], 0.78],
        ];
        return (<>
          {cols.map(([key, opts, xf]) => opts.map((opt, i) => {
            const on = bottle[key] === opt;
            return <button key={String(key) + opt} onClick={() => setBottle((m) => ({ ...m, [key]: opt }))}
              style={{ ...px(Number(xf) * W - 26, (0.335 + i * 0.036) * H - 5, 16, 16), cursor: "pointer", borderRadius: 8, border: "2px solid #111", background: on ? "#111" : "transparent", transition: `background 140ms ${EASE}` }} />;
          }))}
          {/* closure colour shade: vertical drag (owner note 9) */}
          <div style={{ ...px(1093.7, 355.1, 150.5, 150.5) }}
            onPointerDown={(e) => { dragRef.current = true; (e.target as HTMLElement).setPointerCapture?.((e as unknown as PointerEvent).pointerId); }}
            onPointerUp={() => { dragRef.current = false; }}
            onPointerMove={(e) => {
              if (!dragRef.current) return;
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setShade(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
            }}>
            <div style={{ position: "absolute", inset: 0, background: `linear-gradient(#fff, #000)`, border: "1px solid #111" }} />
            <div style={{ position: "absolute", left: "50%", top: `${shade * 100}%`, transform: "translate(-50%,-50%)", width: 22, height: 22, borderRadius: 11, background: "#111", border: "2px solid #fff", cursor: "grab" }} />
          </div>
          <div style={{ ...px(-40, 139.5, 500, 430), background: "#EFEEE8", border: "1px dashed #bbb", display: "flex", alignItems: "center", justifyContent: "center", font: `13px ${HN}`, color: "#999" }}>
            [ bottle photo — {bottle.type} · {bottle.color} · {bottle.closure} ]
          </div>
          <button aria-label="next" onClick={() => go("assets")}
            style={{ ...px(1310, 640, 90, 90), background: "transparent", border: "none", cursor: "pointer" }} />
        </>);
      }
      case "assets": {
        const thumbs = [
          { x: 994.3, y: 171.5 }, { x: 1165.8, y: 171.5 }, { x: 994.3, y: 376.9 }, { x: 1165.7, y: 377.4 },
        ];
        const names = ["Context 1", "Context 2", "Context 3", "Context 4", "Context 5"];
        const order = [heroAsset, ...names.map((_, i) => i).filter((i) => i !== heroAsset)];
        const ph = (i: number, w: number, h: number) => (
          <div style={{ width: w, height: h, background: "#EFEEE8", border: "1px dashed #bbb", display: "flex", alignItems: "center", justifyContent: "center", font: `12px ${HN}`, color: "#999" }}>
            [ {names[i]} ]
          </div>
        );
        return (<>
          <div style={{ ...px(548.6, 171.9, 338.6, 338.6) }}>{ph(order[0], 338.6, 338.6)}</div>
          {thumbs.map((t, k) => (
            <button key={k} onClick={() => setHeroAsset(order[k + 1])}
              style={{ ...px(t.x, t.y, 137.9, 137.9), padding: 0, border: "none", background: "transparent", cursor: "pointer" }}>
              {ph(order[k + 1], 137.9, 137.9)}
            </button>
          ))}
          <div style={{ ...px(127.4, 192.5, 151.8, 285) }}>{
            <div style={{ width: 151.8, height: 285, background: "#EFEEE8", border: "1px dashed #bbb", display: "flex", alignItems: "center", justifyContent: "center", font: `12px ${HN}`, color: "#999" }}>[ Shot: Face ]</div>
          }</div>
          <div style={{ ...px(266.1, 190.9, 152.2, 291.3) }}>{
            <div style={{ width: 152.2, height: 291.3, background: "#EFEEE8", border: "1px dashed #bbb", display: "flex", alignItems: "center", justifyContent: "center", font: `12px ${HN}`, color: "#999" }}>[ Shot: Back ]</div>
          }</div>
          <button aria-label="next" onClick={() => go("checkout")}
            style={{ ...px(1310, 640, 90, 90), background: "transparent", border: "none", cursor: "pointer" }} />
        </>);
      }
      case "checkout":
        return (<>
          {selected >= 0 && dreams[selected] && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={dreams[selected].preview || dreams[selected].dream} alt="front" style={{ ...px(171, 279.3, 245.8, 163.8), objectFit: "contain" }} />
          )}
          {backPng && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={backPng} alt="back" style={{ ...px(1108.6, 283.6, 177.4, 88.7), objectFit: "contain" }} />
          )}
          <button onClick={() => setAgree(!agree)}
            style={{ ...px(148, 694, 22, 22), cursor: "pointer", background: agree ? "#111" : "transparent", border: "2px solid #111" }} />
          <button onClick={proceedToPayment}
            style={{ ...px(1100, 686, 240, 44), background: "transparent", border: "none", cursor: "pointer" }} />
        </>);
      default:
        return null;
    }
  };

  const pageEl = (p: PageKey, tx: string, anim: boolean) => (
    <div key={p + String(anim)} style={{
      position: "absolute", inset: 0,
      transform: `translateX(${tx})`,
      transition: anim ? `transform ${SLIDE_MS}ms ${EASE}` : "none",
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/newui/${p}.svg`} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: W, height: H, userSelect: "none" }} />
      {renderOverlay(p)}
    </div>
  );

  const step = STEP_OF[page];
  return (
    <main style={{ background: "#fff", minHeight: "100vh", display: "flex", justifyContent: "center", overflow: "hidden" }}>
      <style>{`@keyframes nuiPulse { 0%,100% { opacity: .15 } 45% { opacity: 1 } }
        @keyframes nuiIn { from { transform: translateX(${dir > 0 ? "100%" : "-100%"}) } to { transform: translateX(0) } }
        @keyframes nuiOut { from { transform: translateX(0) } to { transform: translateX(${dir > 0 ? "-100%" : "100%"}) } }`}</style>
      <div style={{ width: W * scale, height: H * scale, position: "relative" }}>
        <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", overflow: "hidden", background: "#fff" }}>
          {/* sliding pages */}
          {prev && (
            <div style={{ position: "absolute", inset: 0, animation: `nuiOut ${SLIDE_MS}ms ${EASE} forwards` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/newui/${prev}.svg`} alt="" style={{ position: "absolute", inset: 0, width: W, height: H }} />
            </div>
          )}
          <div style={{ position: "absolute", inset: 0, animation: prev ? `nuiIn ${SLIDE_MS}ms ${EASE}` : "none" }}>
            {pageEl(page, "0", false)}
          </div>

          {/* STATIC header (owner note 1) — covers each artboard's identical strip */}
          <div style={{ position: "absolute", left: 0, top: 0, width: W, height: 58, background: "#fff", display: "flex", alignItems: "center" }}>
            <span style={{ position: "absolute", left: 0.09 * W, font: `700 21px ${HN}` }}>8K</span>
            <span style={{ position: "absolute", left: 0.73 * W, font: `15px ${HN}` }}>About Us</span>
            <span style={{ position: "absolute", left: 0.808 * W, font: `15px ${HN}` }}>Gallery</span>
            <span style={{ position: "absolute", left: 0.868 * W, font: `15px ${HN}` }}>Contact</span>
          </div>

          {/* STATIC footer: step bar + copyright + switch */}
          <div style={{ position: "absolute", left: 0, bottom: 0, width: W, height: 118, background: "#fff" }}>
            {page !== "welcome" && (<>
              <div style={{ position: "absolute", left: 0.09 * W, right: W * 0.06, top: 24, height: 2, background: "#111" }} />
              {STEPS.map((s, i) => (
                <div key={s.label}>
                  <div style={{
                    position: "absolute", left: s.x * W - 7, top: 18, width: 14, height: 14, borderRadius: 7,
                    border: "2px solid #111", transition: `background 300ms ${EASE}`,
                    background: step > i || (step === i && page !== "loader") ? "#111" : "#fff",
                  }} />
                  <span style={{ position: "absolute", left: s.x * W, top: 44, font: `15px ${HN}` }}>{s.label}</span>
                </div>
              ))}
            </>)}
            <span style={{ position: "absolute", left: 0.09 * W, bottom: 14, font: `11px ${HN}`, color: "#8a887e" }}>
              © 8K Labels
            </span>
            <a href="/classic" style={{ position: "absolute", right: 0.06 * W, bottom: 14, font: `11px ${HN}`, color: "#8a887e" }}>
              classic interface
            </a>
          </div>

          {busyMsg && <div style={{ position: "absolute", right: 30, top: 70, font: `13px ${HN}`, color: "#8a887e" }}>{busyMsg}</div>}
        </div>
      </div>
    </main>
  );
}
