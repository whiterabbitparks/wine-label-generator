"use client";

/* DREAM STUDIO (branch POPIKA_No_Vector, owner 2026-09-03).
   NO VECTOR: the dream IS the label. Flow: brief (+optional sketch) →
   ChatGPT dreams complete labels (steered by layout cards, illustration
   style cards, image rules and past feedback) → owner approves/rejects
   WITH COMMENTS (comments steer all future dreams) → the final file is a
   300dpi TIFF of the dream itself. Admin views use medium-res JPEGs; the
   full PNG stays the print source. Replication/vector lives on branch
   POPIKA_ALTERNATIVE_ENGINE, untouched. */

import { useCallback, useState } from "react";

export const INK = "#111";

export const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#fff", color: INK, fontFamily: "'Special Elite', monospace", padding: "28px 20px" },
  wrap: { maxWidth: 1080, margin: "0 auto" },
  h1: { fontSize: 20, letterSpacing: 2, fontWeight: 400, margin: 0 },
  sub: { fontSize: 12, color: "#8a887e" },
  card: { border: `2px solid ${INK}`, padding: 14, marginTop: 14, background: "#fff" },
  label: { display: "block", fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: "#8a887e", margin: "10px 0 4px" },
  input: { width: "100%", boxSizing: "border-box", font: "inherit", fontSize: 13, padding: "6px 8px", border: `2px solid ${INK}`, background: "#fff" },
  btn: { font: "inherit", fontSize: 13, background: INK, color: "#fff", border: `2px solid ${INK}`, padding: "8px 18px", cursor: "pointer" },
  btnGhost: { font: "inherit", fontSize: 12.5, background: "#fff", color: INK, border: `2px solid ${INK}`, padding: "7px 14px", cursor: "pointer" },
};

interface DreamCard {
  id: number;
  dream: string;          // full-res PNG — the print source
  preview?: string;       // medium-res JPEG for display
  mood: string;
  verdict?: string;
  comment: string;
  downloading?: boolean;
}

export function StudioCore() {
  const [vision, setVision] = useState("An old man in a wool cap plays the panduri under a fig tree, a rooster pecking at his feet");
  const [wine, setWine] = useState("Saperavi Reserve");
  const [producer, setProducer] = useState("Popiashvili Cellars");
  const [colour, setColour] = useState("Red");
  const [grape, setGrape] = useState("Saperavi");
  const [region, setRegion] = useState("Kakheti, Georgia");
  const [vintage, setVintage] = useState("2023");
  const [styleMood, setStyleMood] = useState("traditional");
  const [count, setCount] = useState(1);
  const [sketch, setSketch] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [cards, setCards] = useState<DreamCard[]>([]);

  const briefData = useCallback(() => {
    const [reg, country] = region.split(",").map((x) => x.trim());
    return {
      producer, wine, appellation: "", classification: "", grape,
      region: reg || "", country: country || "", special: "", vintage,
      wineColorName: colour, wineType: "Still Wine", sweetness: "Dry",
      alcohol: "12.5", volume: "750",
    };
  }, [producer, wine, grape, region, vintage, colour]);

  async function dreamOne() {
    setBusy(true); setErr("");
    const one = async (i: number) => {
      const res = await fetch("/api/admin/dream", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "dream", vision, style: styleMood, data: briefData(), sketch }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error || `dream failed (${res.status})`);
      setCards((cs) => [{ id: Date.now() + i, dream: b.dream, preview: b.preview, mood: styleMood, comment: "" }, ...cs]);
    };
    const settled = await Promise.allSettled(Array.from({ length: count }, (_, i) => one(i)));
    const bad = settled.find((x) => x.status === "rejected") as PromiseRejectedResult | undefined;
    if (bad) setErr(bad.reason instanceof Error ? bad.reason.message : String(bad.reason));
    setBusy(false);
  }

  async function verdict(id: number, v: "approve" | "reject") {
    const c = cards.find((x) => x.id === id); if (!c) return;
    await fetch("/api/admin/dream-feedback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verdict: v, comment: c.comment, vision, style: styleMood, wine }),
    });
    setCards((cs) => cs.map((x) => (x.id === id ? { ...x, verdict: v } : x)));
  }

  async function downloadTiff(id: number) {
    const c = cards.find((x) => x.id === id); if (!c) return;
    setCards((cs) => cs.map((x) => (x.id === id ? { ...x, downloading: true } : x)));
    try {
      const res = await fetch("/api/dream-tiff", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: c.dream, name: wine || "label" }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as { error?: string }).error || `TIFF failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${(wine || "label").replace(/[^\w-]+/g, "-")}-300dpi.tiff`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setCards((cs) => cs.map((x) => (x.id === id ? { ...x, downloading: false } : x)));
  }

  return (
    <div>
        <div style={S.card}>
          <label style={S.label}>Story / vision</label>
          <textarea style={{ ...S.input, minHeight: 52 }} value={vision} onChange={(e) => setVision(e.target.value)} />
          <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr", gap: 8 }}>
            <div><label style={S.label}>Wine</label><input style={S.input} value={wine} onChange={(e) => setWine(e.target.value)} /></div>
            <div><label style={S.label}>Producer</label><input style={S.input} value={producer} onChange={(e) => setProducer(e.target.value)} /></div>
            <div><label style={S.label}>Colour</label>
              <select style={S.input} value={colour} onChange={(e) => setColour(e.target.value)}>
                {["Red", "White", "Rosé", "Orange"].map((c) => <option key={c}>{c}</option>)}
              </select></div>
            <div><label style={S.label}>Vintage</label><input style={S.input} value={vintage} onChange={(e) => setVintage(e.target.value)} /></div>
            <div><label style={S.label}>Grape</label><input style={S.input} value={grape} onChange={(e) => setGrape(e.target.value)} /></div>
            <div><label style={S.label}>Region, Country</label><input style={S.input} value={region} onChange={(e) => setRegion(e.target.value)} /></div>
            <div><label style={S.label}>Mood</label>
              <select style={S.input} value={styleMood} onChange={(e) => setStyleMood(e.target.value)}>
                {["traditional", "contemporary", "punk", "minimalist"].map((c) => <option key={c}>{c}</option>)}
              </select></div>
            <div><label style={S.label}>Sketch (optional)</label>
              <input type="file" accept="image/*" style={{ fontSize: 11 }} onChange={(e) => {
                const f = e.target.files?.[0]; if (!f) { setSketch(null); return; }
                const r = new FileReader(); r.onload = () => setSketch(String(r.result)); r.readAsDataURL(f);
              }} /></div>
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
            <select style={{ ...S.input, width: 64 }} value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button style={S.btn} disabled={busy} onClick={dreamOne}>{busy ? "Dreaming…" : count > 1 ? `Dream ${count} labels` : "Dream a label"}</button>
            <span style={S.sub}>each dream ≈ a few cents · comment + verdict teaches the next dreams · the dream IS the label</span>
          </div>
          {err && <p style={{ color: "#a03030", fontSize: 13 }}>{err}</p>}
        </div>

        {cards.map((c) => (
          <div key={c.id} style={S.card}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 14 }}>
              <div>
                <div style={S.sub}>the label ({c.mood})</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.preview || c.dream} alt="label" style={{ width: "100%", border: `2px solid ${INK}`, marginTop: 4 }} />
              </div>
              <div>
                <div style={S.sub}>judge it</div>
                <input style={{ ...S.input, marginTop: 4 }} placeholder="comment — this steers future dreams"
                  value={c.comment}
                  onChange={(e) => setCards((cs) => cs.map((x) => (x.id === c.id ? { ...x, comment: e.target.value } : x)))} />
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {c.verdict ? (
                    <span style={{ fontSize: 12, color: c.verdict === "approve" ? "#3f6d2a" : "#a03030" }}>
                      {c.verdict === "approve" ? "✓ recorded" : "✗ recorded"}
                    </span>
                  ) : (
                    <>
                      <button style={S.btnGhost} onClick={() => verdict(c.id, "approve")}>✓ Good dream</button>
                      <button style={S.btnGhost} onClick={() => verdict(c.id, "reject")}>✗ Bad dream</button>
                    </>
                  )}
                </div>
                <div style={{ marginTop: 12 }}>
                  <button style={S.btn} disabled={!!c.downloading} onClick={() => downloadTiff(c.id)}>
                    {c.downloading ? "Preparing…" : "Download 300dpi TIFF"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}
