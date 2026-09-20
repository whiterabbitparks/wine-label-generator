"use client";

/* 8K LABELS — ADMIN (round 97, owner: "keep only the admin, tidy the UX/UI,
   one rating language, nothing changes functionally"). Four tabs:
     Painters & Rules — who paints each style, the regions gazetteer, the
                        marketing standing orders, the illustration rules
     References       — the illustration boards and their derived style
                        cards; the marketing boards and charters
     Evaluate         — the evaluation loop (six frozen briefs, 1–5 with
                        faults — a 4 or 5 also boosts the style card that
                        was dealt, a 1 or 2 marks it as a rejected
                        attempt: the one rating language) and the art
                        director's notes that ride every ask
     System           — recent labels, users
   Gone (the old whole-label "dream" engine, no effect on the hybrid
   engine): Dream Studio, dream rules, dream reference boards, the frozen
   hard-rules card, /legacy and /dream. The legacy component library
   (LegacyAdmin.tsx) stays as the source of the shared cards. */

import { useCallback, useEffect, useState } from "react";
import { UsersTab, LoginForm, StylesTab, AdminStyles as S } from "../legacy/LegacyAdmin";
import { RegionsCard } from "./RegionsCard";
import { PaintersCard } from "./PaintersCard";
import { EvalPanel } from "./EvalPanel";

const TABS = ["Painters & Rules", "References", "Evaluate", "System"] as const;
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

function IllustrationRulesCard() {
  const [rules, setRules] = useState<{ global: string; perStyle: Record<string, string> } | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { fetch("/api/admin/image-rules").then((r) => r.json()).then((b) => setRules({ global: b.rules?.global || "", perStyle: b.rules?.perStyle || {} })); }, []);
  async function save() {
    if (!rules) return;
    const r = await fetch("/api/admin/image-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rules) });
    if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
  }
  if (!rules) return <div style={S.card}>Loading illustration rules…</div>;
  return (
    <div style={S.card}>
      <label style={{ ...S.label, margin: 0 }}>Illustration rules</label>
      <p style={{ fontSize: 12, color: "#8a887e", margin: "6px 0 10px" }}>
        One rule per line — steers the <b>Image Play test batches</b> and is checked on them by a vision model
        (the wizard&rsquo;s artwork ask carries its own style lines and the no-text law). Global first, then per style.
      </p>
      <label style={S.label}>Global — every style</label>
      <textarea style={{ ...S.input, minHeight: 60 }} value={rules.global} onChange={(e) => setRules({ ...rules, global: e.target.value })} />
      {["traditional", "contemporary", "punk"].map((st) => (
        <div key={st}>
          <label style={S.label}>{st === "punk" ? "Funky" : st}</label>
          <textarea style={{ ...S.input, minHeight: 40 }} value={rules.perStyle[st] || ""}
            onChange={(e) => setRules({ ...rules, perStyle: { ...rules.perStyle, [st]: e.target.value } })} />
        </div>
      ))}
      <button style={{ ...S.btn, marginTop: 8 }} onClick={save}>{saved ? "Saved ✓" : "Save"}</button>
    </div>
  );
}

interface DreamRef { id: string; name: string; thumb: string; style: string }
const DREAM_STYLES = ["traditional", "contemporary", "punk"] as const;
function MarketingRefsCard() {
  const [refs, setRefs] = useState<DreamRef[]>([]);
  const [charters, setCharters] = useState<Record<string, string>>({});
  const [style, setStyle] = useState<string>("traditional");
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
          per-style LIFESTYLE boards + one PRODUCT SHOTS board (studio bottle photography) — each analyzed into a charter that steers its images; the photos never go to the model
        </span>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
        {[...DREAM_STYLES, "shots"].map((st) => (
          <button key={st} onClick={() => setStyle(st)}
            style={{ font: "inherit", fontSize: 12, padding: "4px 12px", borderRadius: 12, cursor: "pointer", border: "1px solid #111", background: style === st ? "#111" : "transparent", color: style === st ? "#fff" : "#111" }}>
            {st === "shots" ? "product shots" : st} ({refs.filter((r) => r.style === st).length}){charters[st] ? " ✓" : ""}
          </button>
        ))}
        <label style={{ ...S.btnGhost, display: "inline-block", cursor: "pointer", marginLeft: 8 }}>
          {busy === "upload" ? "Uploading…" : `Upload to ${style}`}
          <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => upload(e.target.files)} />
        </label>
        <button style={S.btn} disabled={!styleRefs.length || busy === "analyze"} onClick={analyze}>
          {busy === "analyze" ? "Analyzing…" : `Analyze ${style} board`}
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
          <b style={{ fontSize: 12.5 }}>Marketing charter — edit freely, it rides every {style === "shots" ? "studio product shot" : `${style} lifestyle image`} verbatim</b>
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

function IllustrationTextsCard() {
  const [style, setStyle] = useState<string>("traditional");
  const [charter, setCharter] = useState("");
  const [variants, setVariants] = useState<{ key: string; language: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const load = useCallback(async (st: string) => {
    const r = await fetch("/api/admin/style-refs");
    if (!r.ok) return;
    const b = await r.json();
    const prof = (b.profiles || {})[st] as { charter?: string; variants?: { key: string; language?: string; medium?: string; mood?: string }[] } | undefined;
    setCharter(prof?.charter || "");
    setVariants((prof?.variants || []).map((v) => ({ key: v.key, language: v.language || [v.medium, v.mood].filter(Boolean).join("; ") })));
    const tm: Record<string, string> = {};
    for (const ref of (b.refs || []) as { id: string; thumb?: string; style?: string }[]) if (ref.thumb) tm[ref.id] = ref.thumb;
    setThumbs(tm);
  }, []);
  useEffect(() => { load(style); }, [style, load]);
  async function save() {
    setBusy(true); setErr("");
    const r = await fetch("/api/admin/style-refs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saveTexts: true, style, charter, variants }),
    });
    if (!r.ok) setErr((await r.json().catch(() => ({}))).error || "save failed");
    else { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    setBusy(false);
  }
  return (
    <div style={S.card}>
      <b style={{ fontSize: 13 }}>Illustration steering texts</b>
      <span style={{ fontSize: 11.5, color: "#8a887e", marginLeft: 8 }}>
        edit freely — the style cards feed the dream&rsquo;s illustration line verbatim; ⚠ Analyze overwrites edits
      </span>
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        {DREAM_STYLES.map((st) => (
          <button key={st} onClick={() => setStyle(st)}
            style={{ font: "inherit", fontSize: 12, padding: "4px 12px", borderRadius: 12, cursor: "pointer", border: "1px solid #111", background: style === st ? "#111" : "transparent", color: style === st ? "#fff" : "#111" }}>
            {st}
          </button>
        ))}
      </div>
      {err && <p style={{ color: "#a33", fontSize: 12 }}>{err}</p>}
      <label style={{ ...S.label, marginTop: 8 }}>Illustration charter</label>
      <textarea style={{ ...S.input, minHeight: 80, fontSize: 12 }} value={charter} onChange={(e) => setCharter(e.target.value)} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12, marginTop: 8 }}>
        {variants.map((v, i) => (
          <div key={v.key} style={{ border: "1px solid #ddd", padding: 8 }}>
            <div style={{ position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {thumbs[v.key] ? <img src={thumbs[v.key]} alt="" style={{ height: 110, maxWidth: "100%", border: "1px solid #ddd", display: "block" }} />
                : <div style={{ height: 110, background: "#f4f3ee" }} />}
              <span style={{ position: "absolute", bottom: 2, left: 2, fontSize: 11, background: "#111", color: "#fff", padding: "0 5px", lineHeight: 1.6 }}>{i + 1}</span>
            </div>
            <textarea style={{ ...S.input, minHeight: 84, fontSize: 11.5, marginTop: 6 }} value={v.language}
              onChange={(e) => setVariants((vs) => vs.map((x) => (x.key === v.key ? { ...x, language: e.target.value } : x)))} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
        <button style={S.btn} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save illustration texts"}</button>
        {saved && <span style={{ fontSize: 12, color: "#3f6d2a" }}>Saved ✓ — applies to the next dream</span>}
      </div>
    </div>
  );
}


/* THE ART DIRECTOR'S NOTES (was Dream Studio's "saved comments"): the
   praised / criticised notes per style that ride every artwork ask
   (artworkGuidance quotes the latest twelve). Same store, same effect —
   only the whole-label "dream a label" generator around it is gone. */
function ArtNotesCard() {
  const [rows, setRows] = useState<{ id: string; at: string; verdict: string; comment: string; style: string; wine?: string }[]>([]);
  const [style, setStyle] = useState("traditional");
  const [verdict, setVerdict] = useState<"approve" | "reject">("approve");
  const [comment, setComment] = useState("");
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/dream-feedback"); if (r.ok) setRows(((await r.json()).rows || []).filter((x: { comment: string }) => x.comment));
  }, []);
  useEffect(() => { load(); }, [load]);
  async function add() {
    if (!comment.trim()) return;
    await fetch("/api/admin/dream-feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verdict, comment, style }) });
    setComment(""); load();
  }
  const NAMES: Record<string, string> = { traditional: "Traditional", contemporary: "Contemporary", punk: "Funky" };
  return (
    <div style={S.card}>
      <label style={{ ...S.label, margin: 0 }}>Art director&rsquo;s notes — what the painter is told every time</label>
      <p style={{ fontSize: 12, color: "#8a887e", margin: "6px 0 10px" }}>
        Per style: what you praised and what you criticised. The latest twelve notes of a style ride every artwork ask for it, verbatim (&ldquo;the art director praised… / criticised… — avoid these&rdquo;). Delete what no longer applies.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select value={style} onChange={(e) => setStyle(e.target.value)} style={{ ...S.input, width: 160 }}>
          {Object.entries(NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={verdict} onChange={(e) => setVerdict(e.target.value as "approve" | "reject")} style={{ ...S.input, width: 140 }}>
          <option value="approve">praise</option><option value="reject">criticism</option>
        </select>
        <input value={comment} placeholder="e.g. keep the sky empty above the subject" onChange={(e) => setComment(e.target.value)} style={{ ...S.input, flex: "1 1 300px" }} />
        <button style={S.btn} onClick={add}>Add note</button>
      </div>
      {["traditional", "contemporary", "punk"].map((st) => {
        const mine = rows.filter((r) => r.style === st);
        if (!mine.length) return null;
        return (
          <div key={st} style={{ marginTop: 14 }}>
            <label style={{ ...S.label, marginTop: 0 }}>{NAMES[st]} ({mine.length})</label>
            {mine.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "6px 0", borderBottom: "1px solid #E3E3E1", fontSize: 13 }}>
                <span style={{ width: 70, flex: "0 0 auto", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3, color: r.verdict === "approve" ? "#3f6d2a" : "#BA141A", paddingTop: 2 }}>{r.verdict === "approve" ? "praise" : "criticism"}</span>
                <span style={{ flex: 1 }}>{r.comment}{r.wine ? <span style={{ color: "#8a887e" }}> — {r.wine}</span> : null}</span>
                <span style={{ fontSize: 11, color: "#8a887e", whiteSpace: "nowrap" }}>{r.at.slice(0, 10)}</span>
                <button title="delete" onClick={async () => { await fetch(`/api/admin/dream-feedback?id=${r.id}`, { method: "DELETE" }); load(); }} style={{ ...S.linkBtn, fontSize: 14, textDecoration: "none" }}>✕</button>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ROUND 98 #2: the hybrid engine's own log — the labels under data/labels */
function RecentLabelsCard() {
  const [rows, setRows] = useState<{ id: string; style: string; widthMm: number; heightMm: number; faces: string; createdAt: string; fit?: string }[]>([]);
  useEffect(() => { fetch("/api/admin/labels").then((r) => r.json()).then((b) => setRows(b.labels || [])); }, []);
  return (
    <div style={S.card}>
      <label style={{ ...S.label, margin: 0 }}>Recent labels (last 40)</label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14, marginTop: 12 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ border: "1px solid #E3E3E1", padding: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/admin/labels?id=${r.id}`} alt={r.id} style={{ width: "100%", display: "block", background: "#F4F3EE" }} />
            <div style={{ fontSize: 11, color: "#8a887e", marginTop: 6 }}>{r.createdAt.slice(0, 16).replace("T", " ")} · {r.style === "punk" ? "funky" : r.style} · {r.widthMm}×{r.heightMm} mm</div>
            <div style={{ fontSize: 11, marginTop: 2 }}>{r.faces}</div>
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
  const [tab, setTabState] = useState<Tab>("Painters & Rules");
  /* the tab rides the URL (?tab=Evaluate), so /eval and bookmarks land right */
  useEffect(() => {
    try { const q = new URLSearchParams(window.location.search).get("tab"); if (q && (TABS as readonly string[]).includes(q)) setTabState(q as Tab); } catch {}
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
            <span style={{ fontSize: 12, color: "#8a887e" }}>the art director&rsquo;s desk · painters, rules, references, evaluation</span>
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

        {tab === "Painters & Rules" && (<>
          <Section title="Painters" note="Which painter paints the artwork of each style. The type is always set by code.">
            <PaintersCard />
          </Section>
          <Section title="Regions" note="What each region looks like — read by the ask whenever a wine's region matches.">
            <RegionsCard />
          </Section>
          <Section title="Rules">
            <LinesRulesCard
              title="Marketing rules"
              note="One rule per line, plain English — rides EVERY marketing prompt (studio shots and lifestyle scenes) as the art director's standing orders. Example: 'never show drinking glasses half-empty' or 'always natural daylight'."
              api="/api/admin/marketing-rules"
            />
            <IllustrationRulesCard />
          </Section>
        </>)}

        {tab === "References" && (<>
          <Section title="Illustration references" note="The boards per style and the style cards derived from them — the sub-styles the painter is dealt.">
            <IllustrationTextsCard />
            <StylesTab />
          </Section>
          <Section title="Marketing references" note="The photographic world per style: boards, charters and scenes for product shots and lifestyle images.">
            <MarketingRefsCard />
          </Section>
        </>)}

        {tab === "Evaluate" && (<>
          <Section title="Evaluation runs">
            <EvalPanel />
          </Section>
          <Section title="Art director's notes">
            <ArtNotesCard />
          </Section>
        </>)}

        {tab === "System" && (<>
          <Section title="Recent labels" note="What the wizard painted lately — painter, faces, ground, the foot decision."><RecentLabelsCard /></Section>
          <Section title="Users"><UsersTab onSessionLost={() => setAuthed(false)} /></Section>
        </>)}
      </div>
    </main>
  );
}
