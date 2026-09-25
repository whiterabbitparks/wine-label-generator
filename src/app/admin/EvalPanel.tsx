"use client";

/* EVALUATE (round 104 — the owner: "slick and clean; just the picture, the
   prompt, the model's name, two marks — Visual and Story — and a note").

   The same six frozen briefs painted on every engine change, marked by the
   owner. Per picture: which painter made it (its name, nothing more), a
   VISUAL mark (the hand — is it the artist's / the style's?), a STORY mark
   (is the brief's story in the picture?), a note, and the prompt on demand.
   The picture shown is the ARTWORK; the composed label sits behind a
   switch, because the layout is not what is being judged here. Faults,
   references, sizes, timings and the blind switch are gone. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminStyles as S } from "../legacy/LegacyAdmin";
import type { EvalBrief, EvalItem, EvalRating, EvalRun } from "@/lib/eval/briefs";

type RunWithRatings = EvalRun & { ratings: Record<string, EvalRating> };
interface Payload {
  briefs: EvalBrief[]; styles: readonly string[];
  models: { id: string; name: string }[];
  runs: RunWithRatings[];
}

const STYLE_TITLE: Record<string, string> = { traditional: "Traditional", contemporary: "Contemporary", punk: "Funky" };
const MARK = "#111";

export function EvalPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [runA, setRunA] = useState("");
  const [runB, setRunB] = useState("");
  const [view, setView] = useState<"art" | "label">("art");
  const [busy, setBusy] = useState<{ done: number; total: number; run: string } | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [perBrief, setPerBrief] = useState(1);
  const [model, setModel] = useState("wizard");
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
    if (!confirm(`Paint ${(data?.briefs.length || 6) * 3 * perBrief} pictures with the live painters? This spends real credits.`)) return;
    setBusy({ done: 0, total: 0, run: "" });
    const r = await fetch("/api/eval", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", name: name || "run", note, perBrief, mode: "hybrid", model }) });
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

  async function rate(run: RunWithRatings, item: EvalItem, patch: Partial<EvalRating>) {
    const cur = run.ratings[item.id] || { faults: [], at: "" };
    const next: EvalRating = { ...cur, ...patch, at: new Date().toISOString() };
    /* optimistic — the page must feel instant while marking eighteen pictures */
    setData((d) => d && ({ ...d, runs: d.runs.map((r) => r.id !== run.id ? r : { ...r, ratings: { ...r.ratings, [item.id]: next } }) }));
    await fetch("/api/eval", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rate", run: run.id, item: item.id, rating: next }) });
  }

  if (!data) return <div style={{ padding: "16px 0", color: "#8a887e" }}>Loading…</div>;

  const painterName = (id?: string) => (id && data.models.find((m) => m.id === id)?.name) || id || "";
  const when = (r: EvalRun) => r.createdAt.slice(0, 16).replace("T", " ");
  const runLabel = (r: RunWithRatings) => `${r.name} · ${when(r)}`;
  const summary = (run: RunWithRatings | null) => {
    if (!run) return null;
    const items = run.items.filter((i) => !i.error);
    const rated = items.map((i) => run.ratings[i.id]).filter((r) => r && (r.score || r.story));
    const avgOf = (a: number[]) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : "–");
    return { n: items.length, rated: rated.length, visual: avgOf(rated.map((r) => r.score).filter((s): s is number => !!s)), story: avgOf(rated.map((r) => r.story).filter((s): s is number => !!s)) };
  };

  /* the prompt without its technical first line ("[faces: … · ink …]") */
  const cleanPrompt = (p: string) => p.replace(/^\[faces:[^\n]*\]\n?/, "").trim();

  const marks = (run: RunWithRatings, item: EvalItem, key: "score" | "story", title: string) => {
    const rt = run.ratings[item.id];
    const cur = rt?.[key];
    return (
      <div style={{ display: "flex", gap: 4, marginTop: 6, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#5a5a52", width: 52 }}>{title}</span>
        {[1, 2, 3, 4, 5].map((s) => (
          <button key={s} onClick={() => rate(run, item, { [key]: cur === s ? undefined : s })}
            style={{ ...S.btnGhost, padding: "3px 10px", fontSize: 12, background: cur === s ? MARK : "transparent", color: cur === s ? "#fff" : MARK }}>{s}</button>
        ))}
      </div>
    );
  };

  const card = (run: RunWithRatings, item: EvalItem, brief: EvalBrief, count: number, showStyle: boolean) => {
    const rt = run.ratings[item.id];
    const file = view === "art" && item.art ? `${item.id}--art.png` : item.file;
    const src = `/api/eval/img?run=${encodeURIComponent(run.id)}&file=${encodeURIComponent(file)}`;
    const portrait = brief.height > brief.width, square = brief.width === brief.height;
    const box = view === "art" || !item.art ? { width: 300, height: 300 } : { width: portrait ? 200 : 300, height: portrait || square ? 300 : 200 };
    return (
      <div key={item.id} style={{ width: 300 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={painterName(item.painter)}>
          {painterName(item.painter) || "—"}
          {showStyle && <span style={{ fontWeight: 400, color: "#8a887e" }}> · {STYLE_TITLE[item.style] || item.style}{count > 1 ? ` · ${item.n}` : ""}</span>}
        </div>
        {item.error ? <div style={{ ...box, color: "#a33", fontSize: 12, border: "1px solid #e2e1da", padding: 10 }}>failed: {item.error.slice(0, 160)}</div> : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={src} alt={item.id} style={{ ...box, objectFit: "contain", background: "#fff", border: "1px solid #e2e1da", display: "block" }} />
        )}
        {!item.error && (
          <>
            {marks(run, item, "score", "Visual")}
            {marks(run, item, "story", "Story")}
            <input value={rt?.note || ""} placeholder="note…" onChange={(e) => rate(run, item, { note: e.target.value })}
              style={{ ...S.input, marginTop: 8, fontSize: 12, padding: "5px 8px" }} />
            <button onClick={() => setShowPrompt(showPrompt === item.id ? null : item.id)} style={{ ...S.linkBtn, fontSize: 11, marginTop: 4 }}>{showPrompt === item.id ? "hide prompt" : "prompt"}</button>
            {showPrompt === item.id && <pre style={{ ...S.mono, fontSize: 10, maxHeight: 220, overflow: "auto", marginTop: 4, whiteSpace: "pre-wrap" }}>{cleanPrompt(item.prompt)}</pre>}
          </>
        )}
      </div>
    );
  };

  const row = (run: RunWithRatings, brief: EvalBrief, titled: boolean) => {
    const items = run.items.filter((i) => i.briefId === brief.id).sort((a, b) => data.styles.indexOf(a.style) - data.styles.indexOf(b.style) || a.n - b.n);
    const perStyle = Math.max(...data.styles.map((s) => items.filter((i) => i.style === s).length), 1);
    /* the style tag matters only when ONE painter painted every column;
       when the columns are different painters (artists, a bake-off) the
       painter's name is the column's name */
    const showStyle = new Set(items.map((i) => painterName(i.painter))).size <= 1;
    return (
      <div key={run.id} style={{ marginTop: titled ? 16 : 10 }}>
        {titled && <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: "#8a887e", marginBottom: 6 }}>{runLabel(run)}</div>}
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          {items.length ? items.map((it) => card(run, it, brief, perStyle, showStyle)) : <span style={{ fontSize: 12, color: "#8a887e" }}>not in this run</span>}
        </div>
      </div>
    );
  };

  const tally = (run: RunWithRatings | null) => {
    const sm = summary(run);
    if (!run || !sm) return null;
    return (
      <div key={run.id} style={{ fontSize: 12 }}>
        <b>{run.name}</b> · {sm.rated}/{sm.n} marked · Visual <b>{sm.visual}</b> · Story <b>{sm.story}</b>
        {run.note && <div style={{ color: "#8a887e", marginTop: 2 }}>{run.note}</div>}
      </div>
    );
  };

  return (
    <div>
      {/* ---- new run ---- */}
      <div style={S.card}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 160px" }}>
            <label style={{ ...S.label, marginTop: 0 }}>Run name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. mariam-v2" style={S.input} />
          </div>
          <div style={{ flex: "2 1 240px" }}>
            <label style={{ ...S.label, marginTop: 0 }}>Note</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="what this run tests (optional)" style={S.input} />
          </div>
          <div>
            <label style={{ ...S.label, marginTop: 0 }}>Painter</label>
            <select value={model} onChange={(e) => setModel(e.target.value)} style={{ ...S.input, width: 230 }}>
              <option value="wizard">One artist per column (in their page order)</option>
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
            {busy ? `Painting ${busy.done}/${busy.total}…` : `Generate (${data.briefs.length * 3 * perBrief} pictures)`}</button>
        </div>
        {busy && <div style={{ marginTop: 10, height: 4, background: "#e2e1da", borderRadius: 2 }}><div style={{ width: `${busy.total ? (busy.done / busy.total) * 100 : 2}%`, height: 4, background: MARK, borderRadius: 2, transition: "width 400ms" }} /></div>}
      </div>

      {/* ---- which run(s), what to look at ---- */}
      <div style={{ ...S.card, display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <label style={{ ...S.label, marginTop: 0 }}>Run</label>
          <select value={runA} onChange={(e) => setRunA(e.target.value)} style={{ ...S.input, width: 300 }}>
            <option value="">—</option>
            {data.runs.map((r) => <option key={r.id} value={r.id}>{runLabel(r)}</option>)}
          </select>
        </div>
        <div>
          <label style={{ ...S.label, marginTop: 0 }}>Compare with</label>
          <select value={runB} onChange={(e) => setRunB(e.target.value)} style={{ ...S.input, width: 300 }}>
            <option value="">—</option>
            {data.runs.filter((r) => r.id !== runA).map((r) => <option key={r.id} value={r.id}>{runLabel(r)}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 2, marginLeft: "auto" }}>
          {(["art", "label"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} style={{ ...S.tab, ...(view === v ? S.tabActive : {}), fontSize: 12 }}>{v === "art" ? "Artwork" : "Label"}</button>
          ))}
        </div>
      </div>

      {/* ---- the tally ---- */}
      {A && (
        <div style={{ ...S.card, display: "flex", gap: 28, flexWrap: "wrap" }}>
          {tally(A)}{tally(B)}
        </div>
      )}

      {/* ---- brief by brief ---- */}
      {!A && <div style={{ ...S.card, color: "#8a887e" }}>No runs yet. Generate one — the six frozen briefs through today&rsquo;s painters.</div>}
      {A && data.briefs.map((brief) => (
        <div key={brief.id} style={S.card}>
          <b style={{ fontSize: 14 }}>{brief.title}</b>
          <div style={{ fontSize: 12, color: "#5a5a52", marginTop: 4, fontStyle: "italic" }}>“{brief.vision}”</div>
          {row(A, brief, !!B)}
          {B && row(B, brief, true)}
        </div>
      ))}
    </div>
  );
}
