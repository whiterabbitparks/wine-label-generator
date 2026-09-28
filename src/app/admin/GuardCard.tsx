"use client";

/* PROTECTION (2026-09-27): the guard's numbers (src/lib/guard.ts), editable
   here without a deploy, and what today looks like. */

import { useEffect, useState } from "react";
import { AdminStyles as S } from "../legacy/LegacyAdmin";

type G = {
  settings: Record<string, number>; defaults: Record<string, number>; spentToday: number;
  newVisitors24h: number; visitorsWithRuns24h: number; confirmedEmails: number; mail: boolean; alerts: boolean;
};
const LABELS: Record<string, string> = {
  dailyFreeUsd: "Daily free budget ($) — free painting pauses when it is spent; an e-mail at half",
  paintUsd: "Cost of one painted label ($, for the budget)",
  marketingUsd: "Cost of one marketing run ($, for the budget)",
  ipRunsPerHour: "New free runs one network may start in an hour",
  marketingPerDay: "Marketing runs one visitor may start a day",
  paintsPerRun: "Paintings one run may make (3 columns + retries)",
  freeRuns: "Free TRIES every visitor starts with — one try = 3 new versions (1 at launch — raise it while people test)",
};
const small = { fontSize: 11.5, color: "#6b6a60" } as React.CSSProperties;

export function GuardCard() {
  const [g, setG] = useState<G | null>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const load = () => fetch("/api/admin/guard").then((r) => r.json()).then((b: G) => {
    setG(b); setEdit(Object.fromEntries(Object.entries(b.settings).map(([k, v]) => [k, String(v)])));
  });
  useEffect(() => { load(); }, []);
  if (!g) return <div style={S.card}>Loading…</div>;
  const save = async () => {
    const r = await fetch("/api/admin/guard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(edit) });
    setMsg(r.ok ? "Saved." : "Could not save."); load();
  };
  const pct = Math.min(100, Math.round((g.spentToday / Math.max(0.01, g.settings.dailyFreeUsd)) * 100));
  return (
    <div style={{ ...S.card, margin: 0 }}>
      <div style={{ fontSize: 14 }}>
        Free painting today: <b>${g.spentToday.toFixed(2)}</b> of ${g.settings.dailyFreeUsd} ({pct}%){pct >= 100 ? " — PAUSED until tomorrow" : ""}
      </div>
      <div style={{ ...small, marginTop: 4 }}>
        Last 24 h: {g.newVisitors24h} new visitors, {g.visitorsWithRuns24h} made labels · {g.confirmedEmails} confirmed e-mails in all
      </div>
      <div style={{ ...small, marginTop: 4, color: g.mail ? "#6b6a60" : "#B71318", fontWeight: g.mail ? 400 : 700 }}>
        E-mail sending: {g.mail ? "on" : "OFF — set RESEND_API_KEY and MAIL_FROM on the server (until then only an admin gets the link, on the page)"}
        {" · "}Half-budget alert: {g.alerts ? "on" : "off (set ALERT_EMAIL)"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: "6px 12px", marginTop: 12, alignItems: "center", maxWidth: 640 }}>
        {Object.keys(LABELS).map((k) => (
          <label key={k} style={{ display: "contents" }}>
            <span style={{ fontSize: 12.5 }}>{LABELS[k]} <span style={small}>(default {g.defaults[k]})</span></span>
            <input value={edit[k] ?? ""} onChange={(e) => setEdit((m) => ({ ...m, [k]: e.target.value }))} style={{ border: "1px solid #111", padding: "3px 6px", fontSize: 13 }} />
          </label>
        ))}
      </div>
      <button onClick={save} style={{ marginTop: 12, background: "#111", color: "#fff", border: "none", padding: "6px 16px", cursor: "pointer" }}>Save</button>
      {msg && <span style={{ ...small, marginLeft: 10 }}>{msg}</span>}
      <p style={small}>
        A visitor gets the free runs above (one at launch); a confirmed e-mail gives one more (once per address); more are bought ($9 = one run, $19 = three).
        An admin logged in on the same browser is never stopped, and is the only one whose &ldquo;Pay&rdquo; counts until Paddle is connected.
      </p>
    </div>
  );
}
