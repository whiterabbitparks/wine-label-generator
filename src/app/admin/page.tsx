"use client";

/* DREAM ENGINE ADMIN — the ONE full admin (owner 2026-08-25).
   Tabs: Dream Studio (dream refs board + dream/judge/rebuild) · Image Refs
   (boards → derived style cards, unchanged from before) · Image Play
   (finetune image generation, unchanged) · Rules (hard rules + verified
   image rules merged; "min gap" and "artwork fill" retired — not imposed
   by the new engine) · Generations · Users. The complete previous admin
   stays reachable at /legacy and on the earlier branches. */

import { useCallback, useEffect, useState } from "react";
import {
  GenerationsTab, UsersTab, LoginForm, StylesTab, PlaygroundTab, ArtDirectionTab,
  AdminStyles as S,
} from "../legacy/LegacyAdmin";
import { StudioCore } from "../dream/studio";

const TABS = ["Dream Studio", "Image Refs", "Image Play", "Rules", "Generations", "Users"] as const;
type Tab = (typeof TABS)[number];

/* Rules for the NEW engine: the two fixed laws, plus the verified image
   rules (merged in below). Min-gap and artwork-fill are retired — the
   dream's geometry decides those now. */
function RulesTab() {
  const row = { display: "flex", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px solid #e5e4dc", fontSize: 13 } as const;
  return (
    <>
      <div style={S.card}>
        <p style={{ fontSize: 13, color: "#4a4a42", marginTop: 0 }}>
          Hard rules — <b>enforced in the rendering engine</b>, not wishes:
        </p>
        <div style={row}>
          <b style={{ width: 240 }}>Safe margin</b>
          <span>5 mm — no text may cross it; artwork may bleed to the edge</span>
          <span style={{ marginLeft: "auto", color: "#8a887e", fontSize: 11 }}>fixed</span>
        </div>
        <div style={row}>
          <b style={{ width: 240 }}>Minimum font size</b>
          <span>7 pt — nothing prints smaller</span>
          <span style={{ marginLeft: "auto", color: "#8a887e", fontSize: 11 }}>fixed</span>
        </div>
        <div style={row}>
          <b style={{ width: 240 }}>Legal line</b>
          <span>the alcohol/volume line always prints, complete</span>
          <span style={{ marginLeft: "auto", color: "#8a887e", fontSize: 11 }}>fixed</span>
        </div>
        <div style={{ ...row, borderBottom: "none" }}>
          <b style={{ width: 240 }}>Fonts</b>
          <span>the open Google library only — matched per dream, no curated list</span>
          <span style={{ marginLeft: "auto", color: "#8a887e", fontSize: 11 }}>fixed</span>
        </div>
        <p style={{ fontSize: 11.5, color: "#8a887e", marginBottom: 0 }}>
          retired for the new engine (the dream&rsquo;s geometry decides): minimum gap between texts · artwork fill of its free area
        </p>
      </div>
      <ArtDirectionTab />
    </>
  );
}

/* Dream references: the taste school for whole-label dreams. */
interface DreamRef { id: string; name: string; thumb: string }
function DreamRefsCard() {
  const [refs, setRefs] = useState<DreamRef[]>([]);
  const [charter, setCharter] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/dream-refs");
    if (r.ok) { const b = await r.json(); setRefs(b.refs || []); setCharter(b.charter || ""); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy("upload"); setErr("");
    for (const f of Array.from(files)) {
      const dataUrl = await new Promise<string>((res) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result)); rd.readAsDataURL(f); });
      const r = await fetch("/api/admin/dream-refs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, name: f.name }),
      });
      if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || "upload failed"); break; }
    }
    setBusy(""); load();
  }
  async function analyze() {
    setBusy("analyze"); setErr("");
    const r = await fetch("/api/admin/dream-refs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analyze: true }),
    });
    if (!r.ok) setErr((await r.json().catch(() => ({}))).error || "analysis failed");
    setBusy(""); load();
  }

  return (
    <div style={S.card}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 13 }}>Dream references</b>
        <span style={{ fontSize: 11.5, color: "#8a887e" }}>
          whole-label designs you admire — analyzed into a charter that steers every dream (images never go to the model)
        </span>
        <label style={{ ...S.btnGhost, display: "inline-block", cursor: "pointer" }}>
          {busy === "upload" ? "Uploading…" : "Upload"}
          <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => upload(e.target.files)} />
        </label>
        <button style={S.btn} disabled={!refs.length || busy === "analyze"} onClick={analyze}>
          {busy === "analyze" ? "Analyzing…" : "Analyze board"}
        </button>
      </div>
      {err && <p style={{ color: "#a33", fontSize: 12 }}>{err}</p>}
      {refs.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {refs.map((r) => (
            <div key={r.id} style={{ position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.thumb} alt={r.name} title={r.name} style={{ height: 84, border: "1px solid #ddd", display: "block" }} />
              <button
                style={{ position: "absolute", top: 2, right: 2, font: "inherit", fontSize: 10, background: "#fff", border: "1px solid #a33", color: "#a33", cursor: "pointer", lineHeight: 1.4, padding: "0 4px" }}
                onClick={async () => { await fetch(`/api/admin/dream-refs?id=${r.id}`, { method: "DELETE" }); load(); }}
              >×</button>
            </div>
          ))}
        </div>
      )}
      {charter && (
        <p style={{ fontSize: 11.5, color: "#5a5a52", background: "#f4f3ee", border: "1px solid #e2e1da", borderRadius: 6, padding: 10, marginBottom: 0 }}>
          <b>charter (rides every dream):</b> {charter}
        </p>
      )}
    </div>
  );
}

export default function DreamAdmin() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("Dream Studio");

  useEffect(() => {
    fetch("/api/admin/me").then((r) => r.json()).then((m) => setAuthed(m.authenticated));
  }, []);

  if (authed === null) return <main style={S.page}>Checking session…</main>;
  if (!authed) return <LoginForm onSuccess={() => setAuthed(true)} />;

  return (
    <main style={S.page}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h1 style={S.h1}>8K Labels — Dream Engine Admin</h1>
          <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
            <a href="/legacy" style={{ fontSize: 12, color: "#5a6b3b" }}>legacy admin</a>
            <button
              style={S.btnGhost}
              onClick={async () => {
                await fetch("/api/admin/logout", { method: "POST" });
                setAuthed(false);
              }}
            >
              Log out
            </button>
          </div>
        </div>

        <nav style={S.tabbar}>
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ ...S.tab, ...(tab === t ? S.tabActive : {}) }}>
              {t}
            </button>
          ))}
        </nav>

        {tab === "Dream Studio" && (
          <div style={{ marginTop: 4 }}>
            <DreamRefsCard />
            <StudioCore />
          </div>
        )}
        {tab === "Image Refs" && <StylesTab />}
        {tab === "Image Play" && <PlaygroundTab />}
        {tab === "Rules" && <RulesTab />}
        {tab === "Generations" && <GenerationsTab />}
        {tab === "Users" && <UsersTab onSessionLost={() => setAuthed(false)} />}
      </div>
    </main>
  );
}
