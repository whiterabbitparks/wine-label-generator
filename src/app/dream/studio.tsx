"use client";

/* DREAM STUDIO (owner directive 2026-08-25, branch POPIKA_ALTERNATIVE_ENGINE).
   The new engine's own admin — separate from /admin so the previous
   architecture stays intact and reachable. Flow: brief (+optional sketch)
   → ChatGPT dreams complete labels → owner approves/rejects WITH COMMENTS
   (comments steer all future dreams) → a chosen dream is rebuilt: the
   engine replicates it as real vector text + reference-guided artwork.
   Laws kept: 7pt, 5mm text margins, legal line. Everything else: the dream. */

import { useCallback, useEffect, useState } from "react";

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
  dream: string;
  mood: string;
  verdict?: string;
  comment: string;
  rebuilding?: boolean;
  rebuilt?: { svg: string; artwork: string | null; fidelity?: number | null };
  rebuildErr?: string;
  overlay?: boolean;
}

/* Render a case-matched sample in each candidate font and pixel-compare
   against the dream's glyph crop; the winner replaces the guess. */
async function matchFontsAgainstDream(dreamUrl: string, spec: { elements?: { role?: string; box?: { x: number; y: number; w: number; h: number }; font?: string; fontAlts?: string[]; weight?: number; caps?: boolean; snapped?: boolean }[] }) {
  const els = (spec.elements || []).filter((e) => e.snapped && e.box && (e.fontAlts?.length || 0) > 0);
  if (!els.length) return;
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); img.src = dreamUrl; });
  const fams = [...new Set(els.flatMap((e) => [e.font, ...(e.fontAlts || [])]).filter(Boolean))] as string[];
  const href = "https://fonts.googleapis.com/css2?" + fams.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@300;400;500;600;700;800`).join("&") + "&display=swap";
  if (!document.querySelector(`link[href="${href}"]`)) {
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href;
    document.head.appendChild(l);
    await new Promise((r) => setTimeout(r, 1000));
  }
  const SAMPLE_W = 96, SAMPLE_H = 24;
  const gray = (cv: HTMLCanvasElement) => {
    const g = cv.getContext("2d")!.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
    const out = new Float32Array(SAMPLE_W * SAMPLE_H);
    for (let i = 0; i < out.length; i++) out[i] = (g[i * 4] + g[i * 4 + 1] + g[i * 4 + 2]) / 765;
    let mn = 1, mx = 0;
    for (const v of out) { if (v < mn) mn = v; if (v > mx) mx = v; }
    const sp = mx - mn || 1;
    for (let i = 0; i < out.length; i++) out[i] = (out[i] - mn) / sp;
    return out;
  };
  for (const e of els) {
    const b = e.box!;
    const crop = document.createElement("canvas"); crop.width = SAMPLE_W; crop.height = SAMPLE_H;
    crop.getContext("2d")!.drawImage(img, b.x * img.width, b.y * img.height, b.w * img.width, b.h * img.height, 0, 0, SAMPLE_W, SAMPLE_H);
    const target = gray(crop);
    const candidates = [...new Set([e.font, ...(e.fontAlts || [])])].filter(Boolean) as string[];
    if (candidates.length < 2) continue;
    const sample = e.caps ? "RESERVE CELLARS" : "Reserve Cellars";
    let best = candidates[0], bestScore = -Infinity;
    for (const fam of candidates) {
      const cv = document.createElement("canvas"); cv.width = SAMPLE_W; cv.height = SAMPLE_H;
      const cx = cv.getContext("2d")!;
      cx.fillStyle = "#fff"; cx.fillRect(0, 0, SAMPLE_W, SAMPLE_H);
      cx.fillStyle = "#000"; cx.textBaseline = "middle";
      cx.font = `${e.weight || 400} ${Math.round(SAMPLE_H * 0.8)}px '${fam}'`;
      const tw = cx.measureText(sample).width || 1;
      cx.save(); cx.scale(Math.min(1, (SAMPLE_W - 4) / tw), 1);
      cx.fillText(sample, 2, SAMPLE_H / 2); cx.restore();
      const got = gray(cv);
      let score = 0;
      for (let i = 0; i < got.length; i++) score -= Math.abs(got[i] - target[i]);
      if (score > bestScore) { bestScore = score; best = fam; }
    }
    e.font = best;
  }
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
  const [engineReady, setEngineReady] = useState(false);

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

  async function dreamOne() {
    setBusy(true); setErr("");
    const one = async (i: number) => {
      const res = await fetch("/api/admin/dream", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "dream", vision, style: styleMood, data: briefData(), sketch }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error || `dream failed (${res.status})`);
      setCards((cs) => [{ id: Date.now() + i, dream: b.dream, mood: styleMood, comment: "" }, ...cs]);
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

  async function rebuild(id: number) {
    const c = cards.find((x) => x.id === id); if (!c) return;
    setCards((cs) => cs.map((x) => (x.id === id ? { ...x, rebuilding: true, rebuildErr: "" } : x)));
    try {
      const res = await fetch("/api/admin/dream", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "rebuild", dream: c.dream, vision, data: briefData(), style: c.mood === "free" ? "contemporary" : c.mood }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error || `rebuild failed (${res.status})`);
      // load whatever fonts the spec chose (open library — no restrictions)
      const fams = [...new Set(((b.spec?.elements || []) as { font?: string }[]).map((e) => e.font).filter(Boolean))] as string[];
      if (fams.length) {
        const href = "https://fonts.googleapis.com/css2?" + fams.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@300;400;500;600;700;800`).join("&") + "&display=swap";
        if (!document.querySelector(`link[href="${href}"]`)) {
          const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href;
          document.head.appendChild(l);
          await new Promise((r) => setTimeout(r, 900)); // let the faces land
        }
      }
      if (b.artworkError) setErr(`artwork failed on this rebuild (${String(b.artworkError).slice(0, 90)}) — the text layout still rendered; rebuild again to retry`);
      // FONTS ARE MEASURED (owner round 3): render the real text in the
      // candidate fonts and pixel-compare against the dream's glyph crop.
      try { await matchFontsAgainstDream(c.dream, b.spec); } catch {}
      const w = window as unknown as { LabelEngine: { renderDreamFitted: (spec: unknown, d: unknown, o: unknown, art: string | null, align?: string, mode?: string, ink?: unknown) => { svg: string; fidelity: number | null } } };
      // replica renders at the DREAM'S aspect — the fixed 110x80 canvas was
      // silently squeezing every position ~9% vertically
      const fit = w.LabelEngine.renderDreamFitted(b.spec, briefData(), { widthMM: 110, heightMM: 73.3 }, b.artwork, b.artAlign, b.artworkMode, b.artInk);
      setCards((cs) => cs.map((x) => (x.id === id ? { ...x, rebuilding: false, rebuilt: { svg: fit.svg, artwork: b.artwork, fidelity: fit.fidelity } } : x)));
    } catch (e) {
      setCards((cs) => cs.map((x) => (x.id === id ? { ...x, rebuilding: false, rebuildErr: e instanceof Error ? e.message : String(e) } : x)));
    }
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
                {["traditional", "contemporary", "punk"].map((c) => <option key={c}>{c}</option>)}
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
            <span style={S.sub}>each dream ≈ a few cents · comment + verdict teaches the next dreams</span>
          </div>
          {err && <p style={{ color: "#a03030", fontSize: 13 }}>{err}</p>}
        </div>

        {cards.map((c) => (
          <div key={c.id} style={S.card}>
            <div style={{ display: "grid", gridTemplateColumns: c.rebuilt ? "1fr 1fr" : "1fr 260px", gap: 14 }}>
              <div>
                <div style={S.sub}>the dream</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.dream} alt="dream" style={{ width: "100%", border: `2px solid ${INK}`, marginTop: 4 }} />
              </div>
              {c.rebuilt ? (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div style={S.sub}>the replica (real text · vector · 7pt + 5mm laws only){typeof c.rebuilt.fidelity === "number" ? ` · geometry fidelity ~${c.rebuilt.fidelity}%` : ""}</div>
                    <button style={{ ...S.btnGhost, padding: "2px 8px", fontSize: 11 }}
                      onClick={() => setCards((cs) => cs.map((x) => (x.id === c.id ? { ...x, overlay: !x.overlay } : x)))}>
                      {c.overlay ? "overlay off" : "overlay dream"}
                    </button>
                  </div>
                  <div style={{ border: `2px solid ${INK}`, marginTop: 4, position: "relative" }}>
                    <div dangerouslySetInnerHTML={{ __html: c.rebuilt.svg.replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'width="100%"') }} />
                    {c.overlay && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={c.dream} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", opacity: 0.35, pointerEvents: "none" }} />
                    )}
                  </div>
                </div>
              ) : (
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
                    <button style={S.btn} disabled={!!c.rebuilding || !engineReady} onClick={() => rebuild(c.id)}>
                      {c.rebuilding ? "Replicating…" : "Rebuild as vector"}
                    </button>
                  </div>
                  {c.rebuildErr && <p style={{ color: "#a03030", fontSize: 12 }}>{c.rebuildErr}</p>}
                </div>
              )}
            </div>
          </div>
        ))}
    </div>
  );
}

