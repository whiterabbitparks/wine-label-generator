"use client";

/* THE DREAM PAGE (branch POPIKA_No_Vector, owner 2026-09-03).
   The customer flow: story + label texts (their roles carry the
   hierarchy) + optional sketch → the model designs the complete label,
   steered per style by layout cards, illustration style cards, image
   rules and the art director's feedback. THE DREAM IS THE LABEL — the
   final file is a 300dpi TIFF of the dream itself. The old configurator
   lives on at /classic; house UI rules apply (Special Elite, white
   ground, black 2px lines). */

import { useCallback, useState } from "react";

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

interface ResultState {
  dream: string;
  preview: string | null;
  downloading?: boolean;
}

export default function DreamPage() {
  const [vision, setVision] = useState("");
  const [wine, setWine] = useState("");
  const [producer, setProducer] = useState("");
  const [colour, setColour] = useState("Red");
  const [grape, setGrape] = useState("");
  const [region, setRegion] = useState("");
  const [vintage, setVintage] = useState("");
  const [styleMood, setStyleMood] = useState("traditional");
  const [sketch, setSketch] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [results, setResults] = useState<ResultState[]>([]);

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
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/dream-label", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vision, style: styleMood, data: briefData(), sketch }),
      });
      if (!res.ok || !res.body) throw new Error(`the press jammed (${res.status})`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = ""; let result: { dream: string; preview?: string | null } | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line) continue;
          const msg = JSON.parse(line);
          if (msg.type === "result") result = msg;
          else if (msg.type === "error") throw new Error(msg.error || "generation failed");
        }
      }
      if (!result) throw new Error("the stream ended unexpectedly");
      setResults((rs) => [{ dream: result!.dream, preview: result!.preview || null }, ...rs]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  async function downloadTiff(i: number) {
    const r = results[i]; if (!r) return;
    setResults((rs) => rs.map((x, k) => (k === i ? { ...x, downloading: true } : x)));
    try {
      const res = await fetch("/api/dream-tiff", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: r.dream, name: wine || "label" }),
      });
      if (!res.ok) throw new Error("print file failed — try again");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${(wine || "label").replace(/[^\w-]+/g, "-")}-300dpi.tiff`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setResults((rs) => rs.map((x, k) => (k === i ? { ...x, downloading: false } : x)));
  }

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
                {["traditional", "contemporary", "punk"].map((c) => <option key={c}>{c}</option>)}
              </select></div>
            <div><label style={S.label}>Sketch (optional)</label>
              <input type="file" accept="image/*" style={{ fontSize: 11 }} onChange={(e) => {
                const f = e.target.files?.[0]; if (!f) { setSketch(null); return; }
                const r = new FileReader(); r.onload = () => setSketch(String(r.result)); r.readAsDataURL(f);
              }} /></div>
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center" }}>
            <button style={S.btn} disabled={busy} onClick={createLabel}>
              {busy ? "The designer is dreaming your label…" : "Design my label"}
            </button>
            {busy && <span style={S.sub}>about half a minute — real design takes a moment</span>}
          </div>
          {busy && <div style={S.bar}><div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "45%", background: INK, transition: "width .6s" }} /></div>}
          {err && <p style={{ color: "#a03030", fontSize: 13 }}>{err}</p>}
        </div>

        {results.map((r, i) => (
          <div key={results.length - i} style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={S.sub}>your label — designed for your story</span>
              <button style={{ ...S.btnGhost, padding: "3px 10px", fontSize: 11 }} disabled={!!r.downloading}
                onClick={() => downloadTiff(i)}>
                {r.downloading ? "preparing…" : "download print file (300dpi TIFF)"}
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.preview || r.dream} alt="your label" style={{ width: "100%", border: "1px solid #ddd", marginTop: 8 }} />
          </div>
        ))}

        <p style={{ fontSize: 10.5, color: "#8a887e", padding: "22px 0 14px", textAlign: "center" }}>
          the dream engine — every label is designed for your story
        </p>
      </div>
    </main>
  );
}
