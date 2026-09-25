"use client";

/* 8K LABELS — ADMIN. Reorganised 2026-09-24 (owner: "the admin seems
   outdated, things doubled, maybe some missing — remove what is not
   needed and organise it"). Five tabs, each one job:
     Layouts   — the queue: make five labels, fix or pass each one
     Artists   — who paints (model, the owner's sets of works, consent,
                 labels painted) and the regions the painters are told about
     Marketing — the photo boards and charters, and the standing rules
     Evaluate  — the six frozen briefs, marked per painter
     System    — what the site has painted (with counts), users
   Gone on 2026-09-24: the old Layout bench (it wrote straight into the
   templates — the queue's fixes go through Claude and the owner instead)
   and the per-column artist picker (every run mixes the artists now).
   Before that (round 97): Dream Studio, dream rules and boards, /legacy
   and /dream. The legacy component library (LegacyAdmin.tsx) stays as
   the source of the shared cards. */

import { useCallback, useEffect, useState } from "react";
import { UsersTab, LoginForm, AdminStyles as S } from "../legacy/LegacyAdmin";
import { RegionsCard } from "./RegionsCard";
import { ArtistsCard } from "./ArtistsCard";
import { EvalPanel } from "./EvalPanel";
import { LayoutEditor } from "./LayoutEditor";

const TABS = ["Layouts", "Artists", "Marketing", "Evaluate", "System"] as const;
/* bookmarks made before the tidy still land */
const OLD_TABS: Record<string, Tab> = { "Layout editor": "Layouts", "Artists & Rules": "Artists" };
type Tab = (typeof TABS)[number];

function LinesRulesCard({ title, note, api }: { title: string; note: string; api: string }) {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { fetch(api).then((r) => r.json()).then((b) => setText(b.global || "")); }, [api]);
  async function save() {
    const r = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ global: text }) });
    if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
  }
  return (
    <div style={S.card}>
      <label style={{ ...S.label, margin: 0 }}>{title}</label>
      <p style={{ fontSize: 12, color: "#8a887e", margin: "6px 0 10px" }}>{note}</p>
      <textarea style={{ ...S.input, minHeight: 70 }} value={text} onChange={(e) => setText(e.target.value)} />
      <button style={{ ...S.btn, marginTop: 8 }} onClick={save}>{saved ? "Saved ✓" : "Save"}</button>
    </div>
  );
}

interface DreamRef { id: string; name: string; thumb: string; style: string }
/* the boards the marketing engine reads (MARKETING_BOARDS; traditional
   was retired by the owner 2026-09-24) and the studio shots board */
const BOARDS: [string, string][] = [["contemporary", "contemporary"], ["punk", "funky"], ["shots", "product shots"]];
function MarketingRefsCard() {
  const [refs, setRefs] = useState<DreamRef[]>([]);
  const [charters, setCharters] = useState<Record<string, string>>({});
  const [style, setStyle] = useState<string>("contemporary");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [savedTx, setSavedTx] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/marketing-refs");
    if (r.ok) { const b = await r.json(); setRefs(b.refs || []); setCharters(b.charters || {}); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy("upload"); setErr("");
    for (const f of Array.from(files)) {
      const dataUrl = await new Promise<string>((res) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result)); rd.readAsDataURL(f); });
      const r = await fetch("/api/admin/marketing-refs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, name: f.name, style }),
      });
      if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || "upload failed"); break; }
    }
    setBusy(""); load();
  }
  async function analyze() {
    setBusy("analyze"); setErr("");
    const r = await fetch("/api/admin/marketing-refs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analyze: true, style }),
    });
    if (!r.ok) setErr((await r.json().catch(() => ({}))).error || "analysis failed");
    setBusy(""); load();
  }
  async function saveTexts() {
    setBusy("save"); setErr("");
    const r = await fetch("/api/admin/marketing-refs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saveTexts: true, style, charter: charters[style] || "" }),
    });
    if (!r.ok) setErr((await r.json().catch(() => ({}))).error || "save failed");
    else { setSavedTx(true); setTimeout(() => setSavedTx(false), 2500); }
    setBusy("");
  }
  const styleRefs = refs.filter((r) => r.style === style);
  return (
    <div style={S.card}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 13 }}>Marketing references</b>
        <span style={{ fontSize: 11.5, color: "#8a887e" }}>
          two LIFESTYLE boards (contemporary, funky) + one PRODUCT SHOTS board (studio bottle photography) — each analysed into a charter that steers its images; the photos never go to the model
        </span>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
        {BOARDS.map(([st, title]) => (
          <button key={st} onClick={() => setStyle(st)}
            style={{ font: "inherit", fontSize: 12, padding: "4px 12px", borderRadius: 12, cursor: "pointer", border: "1px solid #111", background: style === st ? "#111" : "transparent", color: style === st ? "#fff" : "#111" }}>
            {title} ({refs.filter((r) => r.style === st).length}){charters[st] ? " ✓" : ""}
          </button>
        ))}
        <label style={{ ...S.btnGhost, display: "inline-block", cursor: "pointer", marginLeft: 8 }}>
          {busy === "upload" ? "Uploading…" : `Upload to ${BOARDS.find((b) => b[0] === style)?.[1] || style}`}
          <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => upload(e.target.files)} />
        </label>
        <button style={S.btn} disabled={!styleRefs.length || busy === "analyze"} onClick={analyze}>
          {busy === "analyze" ? "Analysing…" : `Analyse the ${BOARDS.find((b) => b[0] === style)?.[1] || style} board`}
        </button>
      </div>
      {err && <p style={{ color: "#a33", fontSize: 12 }}>{err}</p>}
      {styleRefs.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginTop: 10 }}>
          {styleRefs.map((r, i) => (
            <div key={r.id} style={{ position: "relative", border: "1px solid #ddd", padding: 6 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.thumb} alt={r.name} title={r.name} style={{ height: 100, maxWidth: "100%", display: "block" }} />
              <span style={{ position: "absolute", bottom: 4, left: 4, fontSize: 11, background: "#111", color: "#fff", padding: "0 5px", lineHeight: 1.6 }}>{i + 1}</span>
              <button
                style={{ position: "absolute", top: 2, right: 2, font: "inherit", fontSize: 10, background: "#fff", border: "1px solid #a33", color: "#a33", cursor: "pointer", lineHeight: 1.4, padding: "0 4px" }}
                onClick={async () => { await fetch(`/api/admin/marketing-refs?id=${r.id}`, { method: "DELETE" }); load(); }}
              >×</button>
            </div>
          ))}
        </div>
      )}
      {charters[style] && (
        <div style={{ marginTop: 12, borderTop: "1px dashed #ccc", paddingTop: 10 }}>
          <b style={{ fontSize: 12.5 }}>Marketing charter — edit freely, it rides every {style === "shots" ? "studio product shot" : `${BOARDS.find((b) => b[0] === style)?.[1] || style} lifestyle image`} verbatim</b>
          <p style={{ fontSize: 11, color: "#a06a2c", margin: "4px 0 8px" }}>
            ⚠ &ldquo;Analyze board&rdquo; regenerates this from the images (your saved edits survive until the next image change).
          </p>
          <textarea style={{ ...S.input, minHeight: 90, fontSize: 12 }} value={charters[style] || ""}
            onChange={(e) => setCharters((m) => ({ ...m, [style]: e.target.value }))} />
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
            <button style={S.btn} disabled={busy === "save"} onClick={saveTexts}>{busy === "save" ? "Saving…" : "Save charter"}</button>
            {savedTx && <span style={{ fontSize: 12, color: "#3f6d2a" }}>Saved ✓ — applies to the next asset run</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ROUND 98 #2: the hybrid engine's own log — the labels under data/labels */
function RecentLabelsCard() {
  const [rows, setRows] = useState<{ id: string; style: string; widthMm: number; heightMm: number; faces: string; createdAt: string; fit?: string; artist?: string; refSet?: string; template?: string }[]>([]);
  const [counts, setCounts] = useState<{ total: number; today: number; week: number } | null>(null);
  useEffect(() => { fetch("/api/admin/labels").then((r) => r.json()).then((b) => { setRows(b.labels || []); setCounts(b.counts || null); }); }, []);
  return (
    <div style={S.card}>
      <label style={{ ...S.label, margin: 0 }}>Recent labels (last 40)</label>
      {/* every painting is a paid model call — the count is the spend */}
      {counts && <p style={{ fontSize: 12, margin: "6px 0 0" }}>Paintings: <b>{counts.today}</b> today · <b>{counts.week}</b> in 7 days · <b>{counts.total}</b> in all <span style={{ color: "#8a887e" }}>(re-sets of type on the same painting not counted)</span></p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14, marginTop: 12 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ border: "1px solid #E3E3E1", padding: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/admin/labels?id=${r.id}&part=thumb`} alt={r.id} loading="lazy" style={{ width: "100%", display: "block", background: "#F4F3EE" }} />
            <div style={{ fontSize: 11, color: "#8a887e", marginTop: 6 }}>{r.createdAt.slice(0, 16).replace("T", " ")} · {r.template || (r.style === "punk" ? "funky" : r.style)} · {r.widthMm}×{r.heightMm} mm</div>
            <div style={{ fontSize: 11, marginTop: 2 }}>{r.faces}</div>
            {r.artist && <div style={{ fontSize: 11, marginTop: 2 }}>{r.artist}{r.refSet ? ` · works set ${r.refSet}` : ""}</div>}
          </div>
        ))}
        {!rows.length && <span style={{ fontSize: 12, color: "#8a887e" }}>nothing painted yet</span>}
      </div>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, fontFamily: "inherit" }}>{title}</h2>
      {note && <p style={{ fontSize: 13, color: "#8a887e", margin: "4px 0 0" }}>{note}</p>}
      {children}
    </section>
  );
}

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTabState] = useState<Tab>("Layouts");
  /* the tab rides the URL (?tab=Evaluate), so /eval and bookmarks land right */
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("tab") || "";
      if ((TABS as readonly string[]).includes(q)) setTabState(q as Tab); else if (OLD_TABS[q]) setTabState(OLD_TABS[q]);
    } catch {}
  }, []);
  const setTab = (t: Tab) => { setTabState(t); try { window.history.replaceState(null, "", `?tab=${encodeURIComponent(t)}`); } catch {} };

  useEffect(() => {
    fetch("/api/admin/me").then((r) => r.json()).then((m) => setAuthed(m.authenticated));
  }, []);

  const fontCss = `
    @font-face { font-family: 'HNW'; src: url('/newui/fonts/HNW-55Roman.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: block; }
    @font-face { font-family: 'HNW'; src: url('/newui/fonts/HNW-56It.woff2') format('woff2'); font-weight: 400; font-style: italic; font-display: block; }
    @font-face { font-family: 'HNW'; src: url('/newui/fonts/HNW-75Bold.woff2') format('woff2'); font-weight: 700; font-style: normal; font-display: block; }
    @font-face { font-family: 'HNW'; src: url('/newui/fonts/HNW-45Lt.woff2') format('woff2'); font-weight: 300; font-style: normal; font-display: block; }
    body { margin: 0; }
    .adm select, .adm input, .adm textarea, .adm button { font-family: inherit; }
    .adm textarea { resize: vertical; }
    .adm a { color: #111; }`;

  if (authed === null) return <main style={S.page}><style>{fontCss}</style>Checking session…</main>;
  if (!authed) return <><style>{fontCss}</style><LoginForm onSuccess={() => setAuthed(true)} /></>;

  return (
    <main style={S.page} className="adm">
      <style>{fontCss}</style>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <h1 style={S.h1}>8K LABELS — ADMIN</h1>
            <span style={{ fontSize: 12, color: "#8a887e" }}>the art director&rsquo;s desk · layouts, artists, marketing, evaluation</span>
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
            <a href="/" style={{ fontSize: 12 }}>the site →</a>
            <button style={S.btnGhost} onClick={async () => { await fetch("/api/admin/logout", { method: "POST" }); setAuthed(false); }}>Log out</button>
          </div>
        </div>

        <nav style={S.tabbar}>
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ ...S.tab, ...(tab === t ? S.tabActive : {}) }}>{t}</button>
          ))}
        </nav>

        {tab === "Layouts" && (
          <Section title="Layouts" note="Press “Make 5 new labels”: five fresh labels are painted exactly as the wizard makes them (all twelve templates in turn, mixed sizes, the artists taking turns). Correct each by hand, then “Save my fix” or “The layout is fine” — either way it leaves the queue. Claude reads your fixes and proposes rules for you to approve; nothing changes the engine by itself.">
            <LayoutEditor />
          </Section>
        )}

        {tab === "Artists" && (<>
          <Section title="Artists" note="Every run mixes the active artists across the three columns. Each label is painted from the next of the artist’s sets of works; the type is always set by code.">
            <ArtistsCard />
          </Section>
          <Section title="Regions" note="What each region looks like — the painters are told this whenever a wine’s region matches.">
            <RegionsCard />
          </Section>
        </>)}

        {tab === "Marketing" && (<>
          <Section title="Marketing references" note="The photographic world: the lifestyle boards and the product-shot board, each with the charter that steers its images.">
            <MarketingRefsCard />
          </Section>
          <Section title="Marketing rules">
            <LinesRulesCard
              title="Standing orders"
              note="One rule per line, plain English — rides EVERY marketing prompt (studio shots and lifestyle scenes). Example: 'never show drinking glasses half-empty' or 'always natural daylight'."
              api="/api/admin/marketing-rules"
            />
          </Section>
        </>)}

        {tab === "Evaluate" && (
          <Section title="Evaluation runs">
            <EvalPanel />
          </Section>
        )}

        {tab === "System" && (<>
          <Section title="Labels" note="What the site painted lately — template, size, artist, faces."><RecentLabelsCard /></Section>
          <Section title="Users"><UsersTab onSessionLost={() => setAuthed(false)} /></Section>
        </>)}
      </div>
    </main>
  );
}
