"use client";

/* EVALUATE — THE EVALUATION LOOP (branch POPIKA_Back_To_Vector, 2026-09-18;
   round 97: a tab of /admin, the owner: "keep the ratings, bring it into
   the admin, no duplicated functions").

   One panel, one job: the same six frozen briefs, painted through every
   style on every engine change, laid next to the reference boards, marked
   by the owner.

   Per output the owner marks: which of the five things is wrong first
   (subject / technique / composition / type / colour), an overall 1–5, the
   reference it should have resembled (click one), and a note. Two runs
   can be laid side by side, brief by brief. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminStyles as S } from "../legacy/LegacyAdmin";
import type { EvalBrief, EvalItem, EvalRating, EvalRun, EvalFault, EvalMode } from "@/lib/eval/briefs";

type RunWithRatings = EvalRun & { ratings: Record<string, EvalRating> };
interface Ref { id: string; name: string; url: string }
interface Payload {
  briefs: EvalBrief[]; styles: readonly string[]; faults: readonly EvalFault[];
  models: { id: string; name: string }[];
  runs: RunWithRatings[]; refs: Record<string, Ref[]>;
}

const FAULT_LABEL: Record<EvalFault, string> = {
  subject: "Subject", technique: "Technique", composition: "Composition", type: "Type", colour: "Colour",
};
const STYLE_TITLE: Record<string, string> = { traditional: "Traditional", contemporary: "Contemporary", punk: "Funky" };

export function EvalPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [runA, setRunA] = useState("");
  const [runB, setRunB] = useState("");
  const [style, setStyle] = useState("traditional");
  const [busy, setBusy] = useState<{ done: number; total: number; run: string } | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [perBrief, setPerBrief] = useState(1);
  const [mode, setMode] = useState<EvalMode>("artwork");
  const [model, setModel] = useState("gpt-image");
  /* BLIND: run names and painters hidden — runs are "#1, #2…" in the order
     they were made, so the marks are about the pictures, not the brand */
  const [blind, setBlind] = useState(false);
  const [pickRefFor, setPickRefFor] = useState<string | null>(null);   /* item id awaiting a reference click */
  const [showPrompt, setShowPrompt] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/eval");
    if (r.status === 401) { window.location.reload(); return; }
    const b = (await r.json()) as Payload;
    setData(b);
    if (!runA && b.runs[0]) setRunA(b.runs[0].id);
  }, [runA]);

  useEffect(() => { load(); }, [load]);

  const A = useMemo(() => data?.runs.find((r) => r.id === runA) || null, [data, runA]);
  const B = useMemo(() => data?.runs.find((r) => r.id === runB) || null, [data, runB]);

  async function generate() {
    if (busy) return;
    if (!confirm(`Dream ${(data?.briefs.length || 6) * 3 * perBrief} labels with the LIVE model? This spends real credits.`)) return;
    setBusy({ done: 0, total: 0, run: "" });
    const r = await fetch("/api/eval", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", name: name || "run", note, perBrief, mode, model }) });
    if (!r.ok || !r.body) { setBusy(null); alert(`generation failed (${r.status})`); return; }
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        const m = JSON.parse(line);
        if (m.type === "start") setBusy({ done: 0, total: m.total, run: m.run });
        else if (m.type === "item") { setBusy((b) => b && { ...b, done: m.done }); await load(); }
        else if (m.type === "done") { setRunA(m.run); await load(); }
      }
    }
    setBusy(null);
  }

  async function rate(run: RunWithRatings, item: EvalItem, patch: Partial<EvalRating> | null) {
    const cur = run.ratings[item.id] || { faults: [], at: "" };
    const next: EvalRating | null = patch === null ? null : { ...cur, ...patch, at: new Date().toISOString() };
    /* optimistic — the page must feel instant while marking eighteen labels */
    setData((d) => d && ({ ...d, runs: d.runs.map((r) => r.id !== run.id ? r : { ...r, ratings: next ? { ...r.ratings, [item.id]: next } : Object.fromEntries(Object.entries(r.ratings).filter(([k]) => k !== item.id)) }) }));
    await fetch("/api/eval", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rate", run: run.id, item: item.id, rating: next }) });
  }

  if (!data) return <div style={{ padding: "16px 0", color: "#8a887e" }}>Loading…</div>;

  const refs = data.refs[style] || [];
  const byAge = [...data.runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const runLabel = (r: RunWithRatings) => blind
    ? `#${byAge.findIndex((x) => x.id === r.id) + 1} · ${r.createdAt.slice(0, 16).replace("T", " ")}`
    : `${r.name} · ${r.mode} · ${data.models.find((m) => m.id === r.model)?.name || r.model} · ${r.createdAt.slice(0, 16).replace("T", " ")} · ${r.commit}`;
  const summary = (run: RunWithRatings | null) => {
    if (!run) return null;
    const items = run.items.filter((i) => i.style === style && !i.error);
    const rated = items.map((i) => run.ratings[i.id]).filter(Boolean);
    const scores = rated.map((r) => r.score).filter((s): s is number => !!s);
    const faultCount: Record<string, number> = {};
    rated.forEach((r) => r.faults.forEach((f) => { faultCount[f] = (faultCount[f] || 0) + 1; }));
    return { n: items.length, rated: rated.length, avg: scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : "–", faultCount };
  };
  const sumA = summary(A), sumB = summary(B);

  const card = (run: RunWithRatings, item: EvalItem | undefined, brief: EvalBrief) => {
    if (!item) return <div style={{ ...cell, color: "#8a887e", fontSize: 12 }}>not in this run</div>;
    if (item.error) return <div style={{ ...cell, color: "#a33", fontSize: 12 }}>failed: {item.error.slice(0, 160)}</div>;
    const rt = run.ratings[item.id];
    const src = `/api/eval/img?run=${encodeURIComponent(run.id)}&file=${encodeURIComponent(item.file)}`;
    const portrait = brief.height > brief.width;
    return (
      <div style={cell}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={item.id} style={{ width: portrait ? 200 : 300, height: portrait ? 300 : brief.width === brief.height ? 300 : 200, objectFit: "contain", background: "#fafaf8", border: "1px solid #e2e1da", display: "block" }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
          {data.faults.map((f) => {
            const on = rt?.faults.includes(f);
            return (
              <button key={f} onClick={() => rate(run, item, { faults: on ? (rt?.faults || []).filter((x) => x !== f) : [...(rt?.faults || []), f] })}
                style={{ ...S.btnGhost, padding: "3px 8px", fontSize: 11, background: on ? "#a33" : "transparent", color: on ? "#fff" : "#a33", borderColor: "#a33" }}>
                {FAULT_LABEL[f]}</button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 6, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#5a5a52", marginRight: 4 }}>overall</span>
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} onClick={() => rate(run, item, { score: rt?.score === s ? undefined : s })}
              style={{ ...S.btnGhost, padding: "2px 8px", fontSize: 12, background: rt?.score === s ? "#111" : "transparent", color: rt?.score === s ? "#fff" : "#111" }}>{s}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => setPickRefFor(pickRefFor === item.id ? null : item.id)} style={{ ...S.linkBtn, fontSize: 12 }}>
            {pickRefFor === item.id ? "click a reference above…" : rt?.ref ? "should resemble: " : "should resemble…"}</button>
          {rt?.ref && (() => { const r = refs.find((x) => x.id === rt.ref); return r ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={r.url} alt={r.name} title={r.name} style={{ height: 34, border: "1px solid #ccc", cursor: "pointer" }} onClick={() => rate(run, item, { ref: undefined })} />
          ) : <span style={{ fontSize: 11 }}>{rt.ref}</span>; })()}
        </div>
        <input value={rt?.note || ""} placeholder="note…" onChange={(e) => rate(run, item, { note: e.target.value })}
          style={{ ...S.input, marginTop: 6, fontSize: 12, padding: "4px 7px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          {!blind && <button onClick={() => setShowPrompt(showPrompt === item.id ? null : item.id)} style={{ ...S.linkBtn, fontSize: 11 }}>{showPrompt === item.id ? "hide prompt" : "prompt"}</button>}
          <span style={{ fontSize: 11, color: "#8a887e" }}>{(item.ms / 1000).toFixed(0)}s{rt ? " · marked" : ""}</span>
        </div>
        {showPrompt === item.id && <pre style={{ ...S.mono, fontSize: 10, maxHeight: 220, overflow: "auto", marginTop: 6 }}>{item.prompt}</pre>}
      </div>
    );
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: "#8a887e", margin: "12px 0 0" }}>Six frozen briefs · every style · every engine change · marked by the art director. Faults first, an overall 1–5, the reference it should have resembled, a note.</p>

      {/* ---- new run ---- */}
      <div style={S.card}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 180px" }}>
            <label style={{ ...S.label, marginTop: 0 }}>Run name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. baseline, model-flux, hybrid-v1" style={S.input} />
          </div>
          <div style={{ flex: "2 1 260px" }}>
            <label style={{ ...S.label, marginTop: 0 }}>What changed since the last run</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="engine notes for the record" style={S.input} />
          </div>
          <div>
            <label style={{ ...S.label, marginTop: 0 }}>Mode</label>
            <select value={mode} onChange={(e) => { const m = e.target.value as EvalMode; setMode(m); if (m === "hybrid") setModel("gpt-image-masked"); }} style={{ ...S.input, width: 190 }}>
              <option value="hybrid">hybrid — full label, new engine</option>
              <option value="artwork">artwork only</option>
              <option value="label">whole label (old engine)</option>
            </select>
          </div>
          <div>
            <label style={{ ...S.label, marginTop: 0 }}>Painter</label>
            <select value={mode === "label" ? "gpt-image" : model} disabled={mode === "label"} onChange={(e) => setModel(e.target.value)} style={{ ...S.input, width: 230 }}>
              {data.models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ ...S.label, marginTop: 0 }}>Per brief</label>
            <select value={perBrief} onChange={(e) => setPerBrief(Number(e.target.value))} style={{ ...S.input, width: 70 }}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <button style={{ ...S.btn, opacity: busy ? 0.5 : 1 }} disabled={!!busy} onClick={generate}>
            {busy ? `Dreaming ${busy.done}/${busy.total}…` : `Generate run (${data.briefs.length * 3 * perBrief} labels)`}</button>
        </div>
        {busy && <div style={{ marginTop: 10, height: 4, background: "#e2e1da", borderRadius: 2 }}><div style={{ width: `${busy.total ? (busy.done / busy.total) * 100 : 2}%`, height: 4, background: "#111", borderRadius: 2, transition: "width 400ms" }} /></div>}
      </div>

      {/* ---- which runs, which style ---- */}
      <div style={{ ...S.card, display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <label style={{ ...S.label, marginTop: 0 }}>Run A</label>
          <select value={runA} onChange={(e) => setRunA(e.target.value)} style={{ ...S.input, width: 300 }}>
            <option value="">—</option>
            {data.runs.map((r) => <option key={r.id} value={r.id}>{runLabel(r)}</option>)}
          </select>
        </div>
        <div>
          <label style={{ ...S.label, marginTop: 0 }}>Run B (compare)</label>
          <select value={runB} onChange={(e) => setRunB(e.target.value)} style={{ ...S.input, width: 300 }}>
            <option value="">—</option>
            {data.runs.filter((r) => r.id !== runA).map((r) => <option key={r.id} value={r.id}>{runLabel(r)}</option>)}
          </select>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#5a5a52", cursor: "pointer" }}>
          <input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} /> blind
        </label>
        <div style={{ display: "flex", gap: 2, marginLeft: "auto" }}>
          {data.styles.map((st) => (
            <button key={st} onClick={() => setStyle(st)} style={{ ...S.tab, ...(style === st ? S.tabActive : {}), fontSize: 12 }}>{STYLE_TITLE[st] || st}</button>
          ))}
        </div>
      </div>

      {/* ---- the reference board for this style ---- */}
      <div style={S.card}>
        <label style={{ ...S.label, marginTop: 0 }}>{STYLE_TITLE[style]} references ({refs.length}){pickRefFor ? " — click the one this output should have resembled" : ""}</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {refs.map((r) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img key={r.id} src={r.url} alt={r.name} title={r.name}
              onClick={() => { if (pickRefFor && A) { const it = A.items.find((i) => i.id === pickRefFor); if (it) rate(A, it, { ref: r.id }); setPickRefFor(null); } }}
              style={{ height: 96, border: pickRefFor ? "2px solid #111" : "1px solid #ddd", cursor: pickRefFor ? "pointer" : "default", background: "#fff" }} />
          ))}
          {!refs.length && <span style={{ fontSize: 12, color: "#8a887e" }}>no references uploaded for this style</span>}
        </div>
      </div>

      {/* ---- the tally ---- */}
      {(sumA || sumB) && (
        <div style={{ ...S.card, display: "flex", gap: 24, fontSize: 12, flexWrap: "wrap" }}>
          {([["A", A, sumA], ["B", B, sumB]] as [string, RunWithRatings | null, ReturnType<typeof summary>][]).map(([k, run, sm]) => sm && run ? (
            <div key={k}>
              <b>{k} · {runLabel(run)}</b> — {sm.rated}/{sm.n} marked · overall <b>{sm.avg}</b>
              {Object.keys(sm.faultCount).length > 0 && <> · faults: {Object.entries(sm.faultCount).sort((a, b) => b[1] - a[1]).map(([f, c]) => `${FAULT_LABEL[f as EvalFault]} ${c}`).join(", ")}</>}
              {run.note && !blind && <div style={{ color: "#8a887e", marginTop: 2 }}>{run.note}</div>}
            </div>
          ) : null)}
        </div>
      )}

      {/* ---- brief by brief ---- */}
      {!A && <div style={{ ...S.card, color: "#8a887e" }}>No runs yet. Generate the baseline first — that is today&rsquo;s engine on the six frozen briefs.</div>}
      {A && data.briefs.map((brief) => {
        const itemsA = A.items.filter((i) => i.briefId === brief.id && i.style === style);
        const itemsB = B ? B.items.filter((i) => i.briefId === brief.id && i.style === style) : [];
        const n = Math.max(itemsA.length, itemsB.length, 1);
        return (
          <div key={brief.id} style={S.card}>
            <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
              <b style={{ fontSize: 14 }}>{brief.title}</b>
              <span style={{ fontSize: 12, color: "#8a887e" }}>{brief.width}×{brief.height} mm · {brief.data.wineColorName} · {brief.data.wineType}</span>
            </div>
            <div style={{ fontSize: 12, color: "#5a5a52", marginTop: 4, fontStyle: "italic" }}>“{brief.vision}”</div>
            <div style={{ display: "flex", gap: 18, marginTop: 10, flexWrap: "wrap" }}>
              {Array.from({ length: n }, (_, k) => (
                <div key={k} style={{ display: "flex", gap: 12 }}>
                  <div><div style={colHead}>A{n > 1 ? ` · ${k + 1}` : ""}</div>{card(A, itemsA[k], brief)}</div>
                  {B && <div><div style={colHead}>B{n > 1 ? ` · ${k + 1}` : ""}</div>{card(B, itemsB[k], brief)}</div>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const cell: React.CSSProperties = { width: 300, minHeight: 60 };
const colHead: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#5a5a52", marginBottom: 4 };
