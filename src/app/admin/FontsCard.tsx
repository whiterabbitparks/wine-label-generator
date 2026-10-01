"use client";

/* THE FONT BANK (owner, 2026-10-01): one Google font at a time, set as a
   wine label, in three queues — serif, sans-serif, handwritten/decorative.
   ✓ = the whole label may be set in it; "Title only" = only the wine's
   name, a plain approved face sets the rest; ✗ = never shown again.
   Approved faces go live at once (src/lib/typeset/font-bank.ts). Keys:
   → approve, ↑ title only, ← reject, Backspace undo. */

import { useCallback, useEffect, useMemo, useState } from "react";

type Cat = "serif" | "sans" | "display";
type CatalogFont = { family: string; cat: Cat; popularity: number; weights: number[] };
type BankFont = { family: string; cat: Cat; verdict: "full" | "title" | "reject"; weights: number[]; at: string };
type Counts = Record<Cat, { full: number; title: number; reject: number }>;

const CATS: { id: Cat; name: string }[] = [
  { id: "serif", name: "Serif" },
  { id: "sans", name: "Sans-serif" },
  { id: "display", name: "Handwritten / decorative" },
];

const btn: React.CSSProperties = { border: "2px solid #111", background: "#fff", padding: "10px 22px", cursor: "pointer", font: "inherit", fontSize: 15, minWidth: 150 };

function weightsOf(ws: number[]) {
  const near = (t: number) => ws.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a), ws[0]);
  const text = near(400);
  const bold = ws.some((w) => w >= 600) ? near(700) : ws[ws.length - 1];
  const mids = ws.filter((w) => w > text && w < bold);
  return { text, mid: mids.length ? mids.reduce((a, b) => (Math.abs(b - 500) < Math.abs(a - 500) ? b : a)) : text, bold };
}

/* the font is loaded straight from Google for the preview */
function useGoogleFont(family: string | undefined, ws: number[]) {
  useEffect(() => {
    if (!family) return;
    const id = `gf-${family.replace(/\s+/g, "-")}`;
    if (document.getElementById(id)) return;
    const l = document.createElement("link");
    l.id = id; l.rel = "stylesheet";
    l.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${[...new Set(ws)].sort((a, b) => a - b).join(";")}&display=block`;
    document.head.appendChild(l);
  }, [family, ws]);
}

function Specimen({ f, compact = false }: { f: CatalogFont | BankFont; compact?: boolean }) {
  const w = weightsOf(f.weights.length ? f.weights : [400]);
  useGoogleFont(f.family, [w.text, w.mid, w.bold]);
  const ff = `"${f.family}", ${f.cat === "serif" ? "serif" : "sans-serif"}`;
  const k = compact ? 0.45 : 1;
  return (
    <div style={{ background: "#f4f1ea", border: "1px solid #ccc", width: 560 * k, height: 400 * k, padding: 28 * k, boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", color: "#2a2420", fontFamily: ff }}>
      <div style={{ fontWeight: w.mid, fontSize: 15 * k, letterSpacing: "0.22em", textTransform: "uppercase" }}>Domaine du Vieux Chêne</div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontWeight: w.bold, fontSize: 64 * k, lineHeight: 1.05 }}>La Source</div>
        <div style={{ fontWeight: w.mid, fontSize: 22 * k, marginTop: 6 * k }}>Pommard Premier Cru</div>
        <div style={{ fontWeight: w.text, fontSize: 30 * k, marginTop: 10 * k }}>2019</div>
      </div>
      <div style={{ width: "100%", display: "flex", justifyContent: "space-between", fontWeight: w.text, fontSize: 9.5 * k }}>
        <span>Pinot Noir · Dry Red Wine</span>
        <span>13% Alc. by Vol. / 750 mL</span>
      </div>
    </div>
  );
}

export function FontsCard() {
  const [cat, setCat] = useState<Cat>("serif");
  const [next, setNext] = useState<CatalogFont[]>([]);
  const [decided, setDecided] = useState<BankFont[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async (c: Cat) => {
    setMsg("");
    const r = await fetch(`/api/admin/font-bank?cat=${c}`);
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(b.error || `error ${r.status}`); return; }
    setNext(b.next); setDecided(b.decided); setCounts(b.counts);
  }, []);
  useEffect(() => { load(cat); }, [cat, load]);

  const cur = next[0];
  /* the next two are warmed up so the swipe never waits for Google */
  useGoogleFont(next[1]?.family, next[1] ? [weightsOf(next[1].weights).text, weightsOf(next[1].weights).bold] : []);
  useGoogleFont(next[2]?.family, next[2] ? [weightsOf(next[2].weights).text, weightsOf(next[2].weights).bold] : []);

  const judge = useCallback(async (verdict: "full" | "title" | "reject" | "undo", family = cur?.family) => {
    if (busy || (!family && verdict !== "undo")) return;
    setBusy(true);
    setMsg(verdict === "full" || verdict === "title" ? `Installing ${family}…` : "");
    const r = await fetch("/api/admin/font-bank", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ family, verdict }) });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(b.error || `error ${r.status}`); return; }
    setMsg(verdict === "full" ? `${family} — approved, live now` : verdict === "title" ? `${family} — titles only, live now` : verdict === "undo" ? "Undone" : "");
    await load(cat);
  }, [busy, cur, cat, load]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight") { e.preventDefault(); judge("full"); }
      else if (e.key === "ArrowUp") { e.preventDefault(); judge("title"); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); judge("reject"); }
      else if (e.key === "Backspace") { e.preventDefault(); judge("undo"); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [judge]);

  const kept = useMemo(() => decided.filter((f) => f.verdict !== "reject"), [decided]);

  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {CATS.map((c) => (
          <button key={c.id} onClick={() => setCat(c.id)} style={{ ...btn, minWidth: 0, fontSize: 13, padding: "6px 14px", background: cat === c.id ? "#E3E3E1" : "#fff" }}>
            {c.name}{counts ? ` — ${counts[c.id].full} ✓ · ${counts[c.id].title} title` : ""}
          </button>
        ))}
      </div>

      {cur ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 18 }}>{cur.family} <span style={{ color: "#8a887e", fontSize: 12 }}>· weights {cur.weights.join(", ")} · Google popularity #{cur.popularity}</span></div>
          <Specimen f={cur} />
          <div style={{ display: "flex", gap: 12 }}>
            <button style={btn} disabled={busy} onClick={() => judge("reject")}>✗ Reject  ←</button>
            <button style={btn} disabled={busy} onClick={() => judge("title")}>Title only  ↑</button>
            <button style={{ ...btn, background: "#111", color: "#fff" }} disabled={busy} onClick={() => judge("full")}>✓ Approve  →</button>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", color: "#8a887e" }}>
            <button style={{ ...btn, minWidth: 0, fontSize: 12, padding: "4px 10px" }} disabled={busy} onClick={() => judge("undo")}>Undo last (Backspace)</button>
            <span>{msg}</span>
          </div>
        </div>
      ) : (
        <div>{msg || "No more fonts in this category."}</div>
      )}

      <div style={{ marginTop: 28, fontWeight: 700 }}>In use — {CATS.find((c) => c.id === cat)?.name}</div>
      {!kept.length && <div style={{ color: "#8a887e" }}>None approved yet — until one is, this column keeps its old faces.</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
        {kept.map((f) => (
          <div key={f.family} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <Specimen f={f} compact />
            <div>{f.family} — {f.verdict === "full" ? "whole label" : "titles only"}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={{ ...btn, minWidth: 0, fontSize: 11, padding: "2px 8px" }} disabled={busy} onClick={() => judge(f.verdict === "full" ? "title" : "full", f.family)}>{f.verdict === "full" ? "Make titles only" : "Make whole label"}</button>
              <button style={{ ...btn, minWidth: 0, fontSize: 11, padding: "2px 8px" }} disabled={busy} onClick={() => judge("reject", f.family)}>Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
