"use client";

/* THE DREAM PAGE (owner 2026-08-25, branch POPIKA_ALTERNATIVE_ENGINE).
   The customer flow on the new engine: story + label texts (their roles
   carry the hierarchy) + optional sketch → the model designs the complete
   label (charter-steered per style) → the engine replicates it as real
   vector type over board-styled, LoRA-crafted artwork. The old
   configurator lives on at /classic; house UI rules apply (Special
   Elite, white ground, black 2px lines). */

import { useCallback, useEffect, useState } from "react";

const INK = "#111";
const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#fff", color: INK, fontFamily: "'Special Elite', monospace", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 16px" },
  col: { width: "min(1020px, 94vw)", flex: 1 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "22px 0 12px", borderBottom: `2px solid ${INK}` },
  h1: { fontSize: 19, letterSpacing: 2, margin: 0, fontWeight: 400 },
  sub: { fontSize: 12, color: "#8a887e" },
  card: { border: `2px solid ${INK}`, padding: 16, marginTop: 16 },
  label: { display: "block", fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: "#8a887e", margin: "10px 0 4px" },
  input: { width: "100%", boxSizing: "border-box", font: "inherit", fontSize: 13.5, padding: "7px 9px", border: `2px solid ${INK}`, background: "#fff" },
  btn: { font: "inherit", fontSize: 14, background: INK, color: "#fff", border: `2px solid ${INK}`, padding: "10px 26px", cursor: "pointer" },
  btnGhost: { font: "inherit", fontSize: 12.5, background: "#fff", color: INK, border: `2px solid ${INK}`, padding: "7px 14px", cursor: "pointer" },
  bar: { height: 3, background: "#E3E3E1", width: "100%", position: "relative", marginTop: 14 },
};

const STAGES: Record<string, [string, number]> = {
  dreaming: ["The designer is dreaming your label…", 0.35],
  reading: ["Reading the design… setting your text in real type…", 0.75],
};

interface ResultState {
  dream: string; svg: string;
}

export default function DreamPage() {
  const [vision, setVision] = useState("");
  const [wine, setWine] = useState("");
  const [producer, setProducer] = useState("");
  const [colour, setColour] = useState("Red");
  const [grape, setGrape] = useState("");
  const [region, setRegion] = useState("");
  const [vintage, setVintage] = useState("");
  const [styleMood, setStyleMood] = useState("free");
  const [sketch, setSketch] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [err, setErr] = useState("");
  const [results, setResults] = useState<ResultState[]>([]);
  const [engineReady, setEngineReady] = useState(false);
  const [showDream, setShowDream] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const w = window as unknown as { LabelEngine?: { ensureFonts: () => Promise<void> } };
    if (w.LabelEngine) { setEngineReady(true); return; }
    const sc = document.createElement("script");
    sc.src = "/engine/label-engine.js";
    sc.onload = () => { w.LabelEngine?.ensureFonts().then(() => setEngineReady(true)); };
    document.body.appendChild(sc);
  }, []);

  const briefData = useCallback(() => {
    const [reg, country] = region.split(",").map((x) => x.trim());
    return {
      producer, wine, appellation: "", classification: "", grape,
      region: reg || "", country: country || "", special: "", vintage,
      wineColorName: colour, wineType: "Still Wine", sweetness: "Dry",
      alcohol: "12.5", volume: "750",
    };
  }, [producer, wine, grape, region, vintage, colour]);

  async function createLabel() {
    if (!wine.trim()) { setErr("give your wine a name — it goes biggest on the label"); return; }
    setBusy(true); setErr(""); setStage("dreaming");
    try {
      const res = await fetch("/api/dream-label", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vision, style: styleMood, data: briefData(), sketch }),
      });
      if (!res.ok || !res.body) throw new Error(`the press jammed (${res.status})`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = ""; let result: { dream: string; spec: unknown; artwork: string | null; artAlign?: string; artworkMode?: string } | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line) continue;
          const msg = JSON.parse(line);
          if (msg.type === "progress") setStage(msg.stage);
          else if (msg.type === "result") result = msg;
          else if (msg.type === "error") throw new Error(msg.error || "generation failed");
        }
      }
      if (!result) throw new Error("the stream ended unexpectedly");
      // load the fonts the design chose, then set the real text
      const fams = [...new Set((((result.spec as { elements?: { font?: string }[] })?.elements) || []).map((e) => e.font).filter(Boolean))] as string[];
      if (fams.length) {
        const href = "https://fonts.googleapis.com/css2?" + fams.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@300;400;500;600;700;800`).join("&") + "&display=swap";
        if (!document.querySelector(`link[href="${href}"]`)) {
          const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href;
          document.head.appendChild(l);
          await new Promise((r) => setTimeout(r, 900));
        }
      }
      const w = window as unknown as { LabelEngine: { renderDreamFitted: (spec: unknown, d: unknown, o: unknown, art: string | null, align?: string, mode?: string) => { svg: string } } };
      const fit = w.LabelEngine.renderDreamFitted(result.spec, briefData(), { widthMM: 110, heightMM: 80 }, result.artwork, result.artAlign, result.artworkMode);
      setResults((rs) => [{ dream: result!.dream, svg: fit.svg }, ...rs]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(false); setStage("");
  }

  const [stageText, stageFrac] = STAGES[stage] || ["", 0];

  return (
    <main style={S.page}>
      <div style={S.col}>
        <div style={S.header}>
          <h1 style={S.h1}>8K LABELS</h1>
          <span style={S.sub}>your story, designed and printed · <a href="/classic" style={{ color: "#8a887e" }}>classic version</a></span>
        </div>

        <div style={S.card}>
          <label style={S.label}>Your story — one true thing about this wine</label>
          <textarea style={{ ...S.input, minHeight: 56 }} placeholder="One summer the whole village helped with the harvest…"
            value={vision} onChange={(e) => setVision(e.target.value)} />
          <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr", gap: 10 }}>
            <div><label style={S.label}>Wine name</label><input style={S.input} value={wine} onChange={(e) => setWine(e.target.value)} placeholder="goes biggest" /></div>
            <div><label style={S.label}>Producer</label><input style={S.input} value={producer} onChange={(e) => setProducer(e.target.value)} /></div>
            <div><label style={S.label}>Colour</label>
              <select style={S.input} value={colour} onChange={(e) => setColour(e.target.value)}>
                {["Red", "White", "Rosé", "Orange"].map((c) => <option key={c}>{c}</option>)}
              </select></div>
            <div><label style={S.label}>Vintage</label><input style={S.input} value={vintage} onChange={(e) => setVintage(e.target.value)} /></div>
            <div><label style={S.label}>Grape</label><input style={S.input} value={grape} onChange={(e) => setGrape(e.target.value)} /></div>
            <div><label style={S.label}>Region, Country</label><input style={S.input} value={region} onChange={(e) => setRegion(e.target.value)} /></div>
            <div><label style={S.label}>Direction</label>
              <select style={S.input} value={styleMood} onChange={(e) => setStyleMood(e.target.value)}>
                {["free", "traditional", "contemporary", "punk"].map((c) => <option key={c}>{c}</option>)}
              </select></div>
            <div><label style={S.label}>Sketch (optional)</label>
              <input type="file" accept="image/*" style={{ fontSize: 11 }} onChange={(e) => {
                const f = e.target.files?.[0]; if (!f) { setSketch(null); return; }
                const r = new FileReader(); r.onload = () => setSketch(String(r.result)); r.readAsDataURL(f);
              }} /></div>
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center" }}>
            <button style={S.btn} disabled={busy || !engineReady} onClick={createLabel}>
              {busy ? "At work…" : engineReady ? "Design my label" : "Warming up the press…"}
            </button>
            {busy && <span style={S.sub}>{stageText} (about a minute — real design takes a moment)</span>}
          </div>
          {busy && <div style={S.bar}><div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.round(stageFrac * 100)}%`, background: INK, transition: "width .6s" }} /></div>}
          {err && <p style={{ color: "#a03030", fontSize: 13 }}>{err}</p>}
        </div>

        {results.map((r, i) => (
          <div key={results.length - i} style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={S.sub}>your label — real text, print-ready vector</span>
              <button style={{ ...S.btnGhost, padding: "3px 10px", fontSize: 11 }}
                onClick={() => setShowDream((m) => ({ ...m, [i]: !m[i] }))}>
                {showDream[i] ? "hide the designer's sketch" : "see the designer's sketch"}
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: showDream[i] ? "1fr 1fr" : "1fr", gap: 12, marginTop: 8 }}>
              <div style={{ border: "1px solid #ddd" }}
                dangerouslySetInnerHTML={{ __html: r.svg.replace(/width="110mm" height="80mm"/, 'width="100%"') }} />
              {showDream[i] && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={r.dream} alt="the designer's sketch" style={{ width: "100%", border: "1px solid #ddd", alignSelf: "start" }} />
              )}
            </div>
          </div>
        ))}

        <p style={{ fontSize: 10.5, color: "#8a887e", padding: "22px 0 14px", textAlign: "center" }}>
          the dream engine — every label is designed for your story, then set in real type
        </p>
      </div>
    </main>
  );
}
