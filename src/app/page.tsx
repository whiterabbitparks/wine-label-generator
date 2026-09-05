"use client";

/* NEW UI v2 (owner's Illustrator redesign, 2026-09-05).
   LESSON FROM v1 (owner: "header deformed, arrow not clickable"): never
   recreate the owner's pixels — the artboards' own baked chrome IS the
   header/footer (black bars, white type, progress line, step circles,
   nav arrows). All overlays sit at coordinates EXTRACTED from the SVGs
   themselves (text transforms / line endpoints), not guessed. Pages
   slide as full boards; chrome pixels are identical between boards so
   the bars read as static. Fixed 1440×823 canvas, scaled as one unit. */

import { useCallback, useEffect, useRef, useState } from "react";

const W = 1440, H = 823;
const EASE = "cubic-bezier(0.33, 1, 0.68, 1)";
const SLIDE_MS = 520;
const HN = "'Helvetica Neue World', 'Helvetica Neue', Helvetica, Arial, sans-serif";

const PAGES = ["welcome", "vision", "front", "loader", "options", "backdetails", "compliance", "backdesign", "bottle", "assets", "checkout"] as const;
type PageKey = (typeof PAGES)[number];
const ORDER: PageKey[] = [...PAGES];

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

  const [vision, setVision] = useState("");
  const [sketch, setSketch] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>({ width: "110", height: "80" });
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [selected, setSelected] = useState(-1);
  const [b, setB] = useState<Record<string, string>>({});
  const [markets, setMarkets] = useState<string[]>(["EU"]);
  const [barcodeMode, setBarcodeMode] = useState("create");
  const [qrMode, setQrMode] = useState("create");
  const [backPng, setBackPng] = useState("");
  const [backPayload, setBackPayload] = useState<Record<string, unknown> | null>(null);
  const [bottle, setBottle] = useState<Record<string, string>>({ type: "Bordeaux", color: "Olive Green", closure: "Cork", finish: "Matte" });
  const [shade, setShade] = useState(0.3);
  const [heroAsset, setHeroAsset] = useState(0);
  const [agree, setAgree] = useState(false);
  const [busyMsg, setBusyMsg] = useState("");
  const dragRef = useRef(false);

  useEffect(() => {
    /* owner 2026-09-05: UI fits the browser width exactly — stretches
       proportionally when the window is wider than the design; never
       shrinks below the design's 1440 minimum (scrolls instead). */
    const fit = () => setScale(Math.max(1, window.innerWidth / W));
    fit(); window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const go = useCallback((next: PageKey, d = 1) => {
    setPrev(page); setDir(d); setPage(next);
    setTimeout(() => setPrev(null), SLIDE_MS + 60);
  }, [page]);
  const goNext = useCallback(() => {
    const i = ORDER.indexOf(page);
    if (i < ORDER.length - 1) go(ORDER[i + 1], 1);
  }, [page, go]);
  const goBack = useCallback(() => {
    const i = ORDER.indexOf(page);
    if (i > 0) go(ORDER[i - 1] === "loader" ? "front" : ORDER[i - 1], -1);
  }, [page, go]);

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

  const px = (x: number, y: number, w?: number, h?: number): React.CSSProperties =>
    ({ position: "absolute", left: x, top: y, width: w, height: h });
  const ghost: React.CSSProperties = { background: "transparent", border: "none", cursor: "pointer", padding: 0 };
  const inputBase: React.CSSProperties = { font: `14px ${HN}`, border: "none", outline: "none", background: "transparent", padding: 0 };

  /* nav arrows are baked at the bottom bar: back 69–103, next 1337–1371 (y≈686) */
  const NavButtons = ({ next, canNext = true }: { next?: () => void; canNext?: boolean }) => (<>
    <button aria-label="back" onClick={goBack} style={{ ...px(56, 664, 60, 44), ...ghost }} />
    <button aria-label="next" disabled={!canNext} onClick={next || goNext}
      style={{ ...px(1324, 664, 60, 44), ...ghost, cursor: canNext ? "pointer" : "default" }} />
  </>);

  /* front details: label block baseline 251.3, 13 rows, ~30.3 spacing; inputs start x264.9 */
  const FRONT_ROWS: [string, number][] = Array.from({ length: 13 }, (_, i) => {
    const keys = ["producer", "wine", "appellation", "classification", "vintage", "grape", "regionCountry", "special", "sweetness", "colour", "wineType", "alcohol", "volume"];
    return [keys[i], 251.3 + i * 30.33];
  }) as [string, number][];
  /* back details right column: labels baseline 247.1, 7 rows, ~33 spacing; values x989.6 */
  const BACK_ROWS: [string, number][] = Array.from({ length: 7 }, (_, i) => {
    const keys = ["producerCompany", "producerAddress", "importer", "importerAddress", "bottlingDate", "lot", "web"];
    return [keys[i], 247.1 + i * 33.1];
  }) as [string, number][];
  /* compliance grid: columns x 347.1/601.8/851.4/1107.6, rows baseline 357.9 + i*52.3 */
  const COMP: { code: string; col: number; row: number }[] = [
    { code: "EU", col: 0, row: 0 }, { code: "US", col: 0, row: 1 }, { code: "GB", col: 0, row: 2 }, { code: "JP", col: 0, row: 3 },
    { code: "AU", col: 1, row: 0 }, { code: "NZ", col: 1, row: 1 }, { code: "CN", col: 1, row: 2 },
    { code: "KR", col: 2, row: 0 }, { code: "BR", col: 2, row: 1 }, { code: "MX", col: 2, row: 2 },
    { code: "IL", col: 3, row: 0 }, { code: "GE", col: 3, row: 1 }, { code: "CA", col: 3, row: 2 },
  ];
  const COMP_X = [347.1, 601.8, 851.4, 1107.6];

  const OPT_FRAMES = [{ x: 137.1, y: 240 }, { x: 548.6, y: 240 }, { x: 960, y: 240 }];
  const OPT_W = 337.9, OPT_H = 225.3;
  const SELECT_XC = [286.6, 698, 1109.5]; // centres of the baked Select texts

  const renderOverlay = (p: PageKey) => {
    switch (p) {
      case "welcome":
        /* baked arrow: 134–169 at y686 */
        return <button aria-label="start" onClick={() => go("vision")} style={{ ...px(122, 662, 60, 48), ...ghost }} />;
      case "vision":
        return (<>
          <textarea value={vision} onChange={(e) => setVision(e.target.value)} maxLength={2200}
            style={{ ...px(139, 214, 1155, 205), ...inputBase, resize: "none", lineHeight: 1.5, fontSize: 15 }} />
          <button title="Give me an idea" onClick={() => setVision(IDEAS[Math.floor(Math.random() * IDEAS.length)])}
            style={{ ...px(1050, 478, 262, 40), ...ghost }} />
          <label style={{ ...px(139, 478, 380, 40), cursor: "pointer" }}>
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
              const file = e.target.files?.[0]; if (!file) { setSketch(null); return; }
              const rd = new FileReader(); rd.onload = () => setSketch(String(rd.result)); rd.readAsDataURL(file);
            }} />
            {sketch && <span style={{ font: `12px ${HN}`, position: "absolute", left: 0, top: 42, color: "#3f6d2a" }}>✓ sketch attached</span>}
          </label>
          <NavButtons />
        </>);
      case "front":
        return (<>
          {FRONT_ROWS.map(([k, base]) => (
            <input key={k} value={f[k] || ""} onChange={(e) => setF((m) => ({ ...m, [k]: e.target.value }))}
              style={{ ...px(264.9, base - 15, 540, 22), ...inputBase }} />
          ))}
          <input value={f.width} onChange={(e) => setF((m) => ({ ...m, width: e.target.value }))}
            style={{ ...px(1000, 586, 58, 22), ...inputBase, textAlign: "left" }} />
          <input value={f.height} onChange={(e) => setF((m) => ({ ...m, height: e.target.value }))}
            style={{ ...px(1130, 586, 58, 22), ...inputBase, textAlign: "left" }} />
          <NavButtons next={generateFront} />
        </>);
      case "loader":
        return (
          <div style={{ ...px(660, 528, 130, 20), display: "flex", gap: 12, justifyContent: "center" }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ width: 8, height: 8, background: "#111", animation: `nuiPulse 1.05s ${i * 0.18}s infinite ${EASE}` }} />
            ))}
          </div>
        );
      case "options":
        return (<>
          {OPT_FRAMES.map((fr, i) => (
            <div key={i} style={{ ...px(fr.x, fr.y, OPT_W, OPT_H) }}>
              {(dreams[i]?.preview || dreams[i]?.dream) && (
                /* label anchored TOP-RIGHT on the corner plus (owner rule) */
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={dreams[i].preview || dreams[i].dream} alt={dreams[i].style}
                  style={{ position: "absolute", top: 0, right: 0, maxWidth: OPT_W, maxHeight: OPT_H, display: "block" }} />
              )}
            </div>
          ))}
          {SELECT_XC.map((xc, i) => (
            <button key={i} onClick={() => setSelected(i)}
              style={{
                ...px(xc - 70, 545, 140, 40), cursor: "pointer",
                font: `15px ${HN}`, transition: `all 180ms ${EASE}`,
                background: selected === i ? "#fff" : "#111",
                color: selected === i ? "#111" : "#fff",
                border: "2px solid #111",
              }}>Select</button>
          ))}
          <NavButtons canNext={selected >= 0} />
        </>);
      case "backdetails":
        return (<>
          <textarea value={b.description || ""} onChange={(e) => setB((m) => ({ ...m, description: e.target.value }))}
            style={{ ...px(139, 210, 440, 205), ...inputBase, resize: "none", lineHeight: 1.45, fontSize: 14 }} />
          {BACK_ROWS.map(([k, base]) => (
            <input key={k} value={b[k] || ""} onChange={(e) => setB((m) => ({ ...m, [k]: e.target.value }))}
              style={{ ...px(989.6, base - 15, 320, 22), ...inputBase }} />
          ))}
          {([["create", 165, "barcode"], ["upload", 472, "barcode"], ["create", 780, "qr"], ["upload", 1087, "qr"]] as const).map(([mode, x, kind]) => {
            const active = (kind === "barcode" ? barcodeMode : qrMode) === mode;
            return <button key={kind + mode} onClick={() => (kind === "barcode" ? setBarcodeMode(mode) : setQrMode(mode))}
              style={{ ...px(x, 480, 205, 34), ...ghost, border: active ? "2px solid #111" : "2px solid transparent", transition: `border 140ms ${EASE}` }} />;
          })}
          <NavButtons />
        </>);
      case "compliance":
        return (<>
          {/* Arabic Markets removed (owner) — cover the baked text */}
          <div style={{ ...px(598, 505, 160, 22), background: "#fff" }} />
          {COMP.map(({ code, col, row }) => {
            const on = markets.includes(code);
            const bx = COMP_X[col] - 34, by = 357.9 + row * 52.3 - 17;
            return <button key={code} onClick={() => setMarkets((ms) => on ? ms.filter((m) => m !== code) : [...ms, code])}
              style={{ ...px(bx, by, 24, 24), cursor: "pointer", background: on ? "#111" : "transparent", border: "2px solid #111", borderRadius: 12, transition: `background 150ms ${EASE}` }} />;
          })}
          <NavButtons next={generateBack} />
        </>);
      case "backdesign":
        return (<>
          {backPng && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={backPng} alt="back label" style={{ ...px(565.9, 182, 0, 0), width: "auto", height: "auto", maxWidth: 520, maxHeight: 355, border: "1px solid #e5e5e5", background: "#fff" }} />
          )}
          {/* baked mock text hides under the live render; Edit at 675,569.9 */}
          <button aria-label="edit" onClick={() => go("backdetails", -1)} style={{ ...px(655, 548, 80, 34), ...ghost }} />
          <NavButtons />
        </>);
      case "bottle": {
        const cols: [string, string[], number][] = [
          ["type", ["Bordeaux", "Bordeaux Prestige", "Burgundy", "Sparkling", "Alsace / Rhine", "Ice Wine"], 405.1],
          ["color", ["Olive Green", "Transparent", "Amber"], 645.1],
          ["closure", ["Cork", "Screw Cap", "Wax Seal", "Crown Cap", "Sparkling Cork"], 884.1],
        ];
        return (<>
          {cols.map(([key, opts, xb]) => opts.map((opt, i) => {
            const on = bottle[key] === opt;
            return <button key={String(key) + opt} onClick={() => setBottle((m) => ({ ...m, [key]: opt }))}
              style={{ ...px(Number(xb) - 27, 284.6 + i * 29.8 - 13, 17, 17), cursor: "pointer", borderRadius: 9, border: "2px solid #111", background: on ? "#111" : "transparent", transition: `background 130ms ${EASE}` }} />;
          }))}
          {(["Matte", "Glossy", "No cap"] as const).map((opt, i) => {
            const xs = [1120.1, 1187.6, 1120.2][i], ys = [285.3, 285.3, 316.1][i];
            const on = bottle.finish === opt;
            return <button key={opt} onClick={() => setBottle((m) => ({ ...m, finish: opt }))}
              style={{ ...px(xs - 27, ys - 13, 17, 17), cursor: "pointer", borderRadius: 9, border: "2px solid #111", background: on ? "#111" : "transparent" }} />;
          })}
          {/* shade slider: baked track x1261.1, y358.8→495.4 — drag the circle */}
          <div style={{ ...px(1236, 348, 50, 158) }}
            onPointerDown={(e) => { dragRef.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
            onPointerUp={() => { dragRef.current = false; }}
            onPointerMove={(e) => {
              if (!dragRef.current) return;
              const r = e.currentTarget.getBoundingClientRect();
              setShade(Math.min(1, Math.max(0, (e.clientY - r.top - 10 * scale) / (r.height - 20 * scale))));
            }}>
            <div style={{ position: "absolute", left: 25 - 11, top: 10.8 + shade * 136.6 - 11, width: 22, height: 22, borderRadius: 11, background: "#111", border: "2px solid #fff", boxShadow: "0 0 0 1px #111", cursor: "grab" }} />
          </div>
          {/* closure colour preview swatch (frame 1093.7,355.1,150.5) */}
          <div style={{ ...px(1093.7, 355.1, 150.5, 150.5), background: `hsl(0 0% ${Math.round((1 - shade) * 100)}%)`, border: "1px solid #111" }} />
          {/* bottle photo placeholder (owner will upload option images) */}
          <div style={{ ...px(60, 160, 260, 420), display: "flex", alignItems: "center", justifyContent: "center", font: `12px ${HN}`, color: "#999", background: "#F4F3EE", border: "1px dashed #ccc", textAlign: "center" }}>
            [ bottle photo<br />{bottle.type} · {bottle.color}<br />{bottle.closure} · {bottle.finish} ]
          </div>
          <NavButtons />
        </>);
      }
      case "assets": {
        const thumbs = [{ x: 994.3, y: 171.5 }, { x: 1165.8, y: 171.5 }, { x: 994.3, y: 376.9 }, { x: 1165.7, y: 377.4 }];
        const names = ["Context 1", "Context 2", "Context 3", "Context 4", "Context 5"];
        const order = [heroAsset, ...names.map((_, i) => i).filter((i) => i !== heroAsset)];
        const ph = (i: number, w: number, h: number, fs = 12) => (
          <div style={{ width: w, height: h, background: "#F4F3EE", border: "1px dashed #ccc", display: "flex", alignItems: "center", justifyContent: "center", font: `${fs}px ${HN}`, color: "#999" }}>
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
          <div style={{ ...px(127.4, 192.5, 151.8, 285), background: "#F4F3EE", border: "1px dashed #ccc", display: "flex", alignItems: "center", justifyContent: "center", font: `12px ${HN}`, color: "#999" }}>[ Shot: Face ]</div>
          <div style={{ ...px(266.1, 190.9, 152.2, 291.3), background: "#F4F3EE", border: "1px dashed #ccc", display: "flex", alignItems: "center", justifyContent: "center", font: `12px ${HN}`, color: "#999" }}>[ Shot: Back ]</div>
          <NavButtons />
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
            <img src={backPng} alt="back" style={{ ...px(1108.6, 283.6, 177.4, 88.7), objectFit: "contain", background: "#fff" }} />
          )}
          <button onClick={() => setAgree(!agree)}
            style={{ ...px(146, 692, 22, 22), cursor: "pointer", background: agree ? "#111" : "transparent", border: "2px solid #111", transition: `background 130ms ${EASE}` }} />
          <button aria-label="pay" onClick={proceedToPayment} style={{ ...px(1090, 682, 250, 46), ...ghost }} />
          <button aria-label="back" onClick={goBack} style={{ ...px(56, 664, 60, 44), ...ghost }} />
        </>);
      default:
        return null;
    }
  };

  return (
    <main style={{ background: "#000", minHeight: "100vh", margin: 0, padding: 0 }}>
      <style>{`html, body { margin: 0; padding: 0; background: #000; }
        @keyframes nuiPulse { 0%,100% { opacity: .15 } 45% { opacity: 1 } }
        @keyframes nuiIn { from { transform: translateX(${dir > 0 ? "100%" : "-100%"}) } to { transform: translateX(0) } }
        @keyframes nuiOut { from { transform: translateX(0) } to { transform: translateX(${dir > 0 ? "-100%" : "100%"}) } }`}</style>
      <div style={{ width: W * scale, height: H * scale, position: "relative", margin: "0 auto" }}>
        <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", overflow: "hidden", background: "#fff" }}>
          {prev && (
            <div style={{ position: "absolute", inset: 0, animation: `nuiOut ${SLIDE_MS}ms ${EASE} forwards` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/newui/${prev}.svg`} alt="" style={{ position: "absolute", inset: 0, width: W, height: H }} />
            </div>
          )}
          <div style={{ position: "absolute", inset: 0, animation: prev ? `nuiIn ${SLIDE_MS}ms ${EASE}` : "none" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/newui/${page}.svg`} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: W, height: H, userSelect: "none" }} />
            {renderOverlay(page)}
          </div>
          {/* switch to classic — white link inside the baked black footer bar */}
          <a href="/classic" style={{ position: "absolute", right: 46, bottom: 24, font: `11px ${HN}`, color: "#bbb", textDecoration: "none", zIndex: 5 }}>
            classic interface
          </a>
          {busyMsg && <div style={{ position: "absolute", right: 46, top: 78, font: `13px ${HN}`, color: "#8a887e" }}>{busyMsg}</div>}
        </div>
      </div>
    </main>
  );
}
