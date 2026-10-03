"use client";

/* THE ARTISTS (2026-09-24, the admin tidy — replaces the old "who paints
   each column" picker, which stopped meaning anything once every run
   mixes the artists across the columns). One card per artist: on or off,
   the trained model, the owner's sets of works (turned one a label), how
   many labels they have painted, and — first, in red when missing — the
   artist's consent. 2026-09-29 (owner): the SETS are arranged here by drag
   and drop — every work in the pool, dragged into a set (at most four a
   set), out of it to remove, then Save. Switching an artist on or off is
   still a word to Claude. */

import { useEffect, useState } from "react";
import { AdminStyles as S } from "../legacy/LegacyAdmin";

type A = {
  id: string; name: string; active: boolean; page: boolean; consent: string; status: string; note: string; fontCats?: string[];
  works: string[]; refSets: string[][]; abstractSet?: number; lora: { trigger: string; trainedAt: string; works: number } | null; painted: number;
};

const small = { fontSize: 11.5, color: "#6b6a60" } as React.CSSProperties;

/* the sets editor of one artist */
function SetsEditor({ a, thumb }: { a: A; thumb: (f: string) => string }) {
  const [sets, setSets] = useState<string[][]>(a.refSets.length ? a.refSets.map((x) => [...x]) : [[]]);
  const [state, setState] = useState<"" | "dirty" | "saving" | "saved" | "error">("");
  const [drag, setDrag] = useState<{ file: string; from: number } | null>(null);   /* from −1 = the pool */
  const change = (next: string[][]) => { setSets(next); setState("dirty"); };
  const dropInto = (to: number) => {
    if (!drag) return;
    const next = sets.map((x) => [...x]);
    if (drag.from >= 0) next[drag.from] = next[drag.from].filter((f) => f !== drag.file);
    if (to >= 0 && !next[to].includes(drag.file)) {
      if (next[to].length >= 4) { setDrag(null); return; }
      next[to].push(drag.file);
    }
    change(next); setDrag(null);
  };
  const save = async () => {
    setState("saving");
    const r = await fetch("/api/admin/artists", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id, refSets: sets.filter((x) => x.length) }) }).catch(() => null);
    setState(r?.ok ? "saved" : "error");
  };
  const used = new Set(sets.flat());
  const tile = (f: string, from: number, remove?: () => void) => (
    <span key={f + from} draggable onDragStart={() => setDrag({ file: f, from })} onDragEnd={() => setDrag(null)}
      style={{ position: "relative", display: "inline-block", cursor: "grab", opacity: from < 0 && used.has(f) ? 0.35 : 1 }} title={f}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumb(f)} alt={f} draggable={false} style={{ height: 64, border: "1px solid #E3E3E1", display: "block" }} />
      {remove && <button onClick={remove} aria-label="remove" style={{ position: "absolute", top: -6, right: -6, width: 16, height: 16, borderRadius: 8, border: "1px solid #111", background: "#fff", fontSize: 10, lineHeight: "12px", padding: 0, cursor: "pointer" }}>×</button>}
    </span>
  );
  const zone = (to: number, children: React.ReactNode, label: string, wide = false) => (
    <div onDragOver={(e) => e.preventDefault()} onDrop={() => dropInto(to)}
      style={{ border: `1px dashed ${drag ? "#B71318" : "#C9C7BF"}`, padding: 6, minHeight: 78, minWidth: wide ? undefined : 150, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 700 }}>{label}</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        {sets.map((st, i) => zone(i, st.map((f) => tile(f, i, () => change(sets.map((x, k) => (k === i ? x.filter((y) => y !== f) : x))))),
          `Set ${String.fromCharCode(65 + i)}${a.abstractSet === i ? " — abstractions only" : ""}${st.length >= 4 ? " (full)" : ""}`))}
        {sets.length < 8 && <button onClick={() => change([...sets, []])} style={{ ...small, border: "1px solid #111", background: "#fff", padding: "4px 8px", cursor: "pointer", alignSelf: "center" }}>+ set</button>}
      </div>
      <div style={{ marginTop: 8 }}>
        {zone(-1, a.works.map((f) => tile(f, -1)), "All works — drag into a set; drag a set's work back here to take it out", true)}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
        <button onClick={save} disabled={state === "saving" || state === "" || state === "saved"}
          style={{ ...small, color: "#fff", background: state === "dirty" ? "#111" : "#9a9890", border: "none", padding: "6px 14px", cursor: state === "dirty" ? "pointer" : "default" }}>
          {state === "saving" ? "Saving…" : "Save sets"}</button>
        <span style={{ ...small, color: state === "error" ? "#B71318" : "#6b6a60" }}>
          {state === "saved" ? "Saved — the next labels use these sets." : state === "error" ? "Couldn't save — try again." : state === "dirty" ? "Not saved yet." : "One set is shown to the painter per label, in turn."}</span>
      </div>
    </div>
  );
}

/* the artist's font categories (owner, 2026-10-02: "Grigol Tatishvili only
   serifs, or serif and artistic") — saved at once; none = every approved font */
const FONT_CATS: [string, string][] = [["serif", "Serif"], ["sans", "Sans-serif"], ["display", "Artistic"]];
function FontCatsRow({ a }: { a: A }) {
  const [cats, setCats] = useState<string[]>(a.fontCats || []);
  const [msg, setMsg] = useState("");
  const flip = async (c: string) => {
    const next = cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c];
    setCats(next); setMsg("saving…");
    const r = await fetch("/api/admin/artists", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id, fontCats: next }) }).catch(() => null);
    setMsg(r && r.ok ? "saved" : "could not save");
    setTimeout(() => setMsg(""), 1500);
  };
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontSize: 12 }}>
      <span style={{ fontWeight: 700 }}>Fonts:</span>
      {FONT_CATS.map(([c, label]) => (
        <button key={c} onClick={() => flip(c)} style={{ border: "1px solid #111", padding: "2px 10px", cursor: "pointer", font: "inherit", background: cats.includes(c) ? "#111" : "#fff", color: cats.includes(c) ? "#fff" : "#111" }}>
          {cats.includes(c) ? "✓ " : ""}{label}</button>
      ))}
      <span style={{ color: "#8a887e" }}>{msg || (cats.length ? "" : "none ticked = all approved fonts")}</span>
    </div>
  );
}

export function ArtistsCard() {
  const [list, setList] = useState<A[] | null>(null);
  useEffect(() => { fetch("/api/admin/artists").then((r) => r.json()).then((b) => setList(b.artists || [])); }, []);
  if (!list) return <div style={S.card}>Loading…</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
      {list.map((a) => {
        const noConsent = /NOT OBTAINED/i.test(a.consent);
        const thumb = (f: string) => `/api/admin/artists?id=${a.id}&work=${encodeURIComponent(f)}`;
        return (
          <div key={a.id} style={{ ...S.card, margin: 0, opacity: a.active ? 1 : 0.55 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
              <b style={{ fontSize: 15 }}>{a.name}</b>
              <span style={{ fontSize: 11, padding: "1px 8px", border: "1px solid #111", background: a.active ? "#111" : "#fff", color: a.active ? "#fff" : "#111" }}>{a.active ? "painting" : "switched off"}</span>
              <span style={small}>{a.painted} labels painted · {a.works.length} works{a.page ? " · has a page on the site" : ""}</span>
            </div>
            <div style={{ ...small, marginTop: 6, color: noConsent ? "#B71318" : "#6b6a60", fontWeight: noConsent ? 700 : 400 }}>
              Consent: {a.consent || "—"}
            </div>
            <div style={{ ...small, marginTop: 4 }}>
              Model: {a.lora ? `trained ${a.lora.trainedAt.slice(0, 10)} on ${a.lora.works} works (trigger ${a.lora.trigger})` : "not trained yet"}
            </div>
            {a.note && <div style={{ ...small, marginTop: 4 }}>Your note on the hand: “{a.note}”</div>}
            <FontCatsRow a={a} />
            <SetsEditor a={a} thumb={thumb} />
          </div>
        );
      })}
      <p style={small}>To switch an artist on or off, tell Claude. Sets saved here take effect at once.</p>
    </div>
  );
}
