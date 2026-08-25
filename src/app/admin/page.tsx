"use client";

/* NEW ENGINE ADMIN (owner directive 2026-08-25, branch POPIKA_ALTERNATIVE_ENGINE).
   Only what the Dream Engine needs:
     Dream Studio — dream, judge with comments, rebuild as vector
     Hard Rules   — the surviving laws (7pt, 5mm margins, gaps)
     Generations  — cost / history log
     Users        — admin accounts
   Gone (they belonged to the old engine): Image Refs, Image Rules,
   Image Play, Layout Refs, Layout Play, Fonts (standing rule instead:
   the open Google font library is the only font source). The old admin
   lives on at /legacy and forever on the previous branches. */

import { useEffect, useState } from "react";
import { HardRulesTab, GenerationsTab, UsersTab, LoginForm, AdminStyles as S } from "../legacy/LegacyAdmin";
import { StudioCore } from "../dream/studio";

const TABS = ["Dream Studio", "Hard Rules", "Generations", "Users"] as const;
type Tab = (typeof TABS)[number];

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
        <p style={{ fontSize: 11.5, color: "#8a887e", margin: "4px 0 0" }}>
          standing rule: fonts come from the open Google library only — matched per dream, no curated list
        </p>

        <nav style={S.tabbar}>
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ ...S.tab, ...(tab === t ? S.tabActive : {}) }}>
              {t}
            </button>
          ))}
        </nav>

        {tab === "Dream Studio" && <div style={{ marginTop: 4 }}><StudioCore /></div>}
        {tab === "Hard Rules" && <HardRulesTab />}
        {tab === "Generations" && <GenerationsTab />}
        {tab === "Users" && <UsersTab onSessionLost={() => setAuthed(false)} />}
      </div>
    </main>
  );
}
