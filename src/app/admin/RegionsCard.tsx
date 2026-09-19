"use client";

/* REGIONS — the gazetteer (branch POPIKA_Back_To_Vector, 2026-09-19).
   Every painter drew Svaneti's towers for a Racha label: a region's name
   means nothing to a model, it needs what the region LOOKS like. One
   entry per region, two or three sentences — landscape, buildings,
   plants, and what must NOT appear. Read by the artwork ask whenever a
   brief's region matches. Claude's drafts are pre-filled; the owner
   corrects and saves. */

import { useEffect, useState } from "react";
import { AdminStyles as S } from "../legacy/LegacyAdmin";

export function RegionsCard() {
  const [map, setMap] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<"" | "ok" | "err">("");
  const [draft, setDraft] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    fetch("/api/admin/regions").then((r) => r.json()).then((b) => { setMap(b.map || {}); setDraft(!b.saved); });
  }, []);

  async function save() {
    const r = await fetch("/api/admin/regions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ map }) });
    setSaved(r.ok ? "ok" : "err"); if (r.ok) setDraft(false);
    setTimeout(() => setSaved(""), 2500);
  }

  const names = Object.keys(map);
  return (
    <div style={S.card}>
      <label style={{ ...S.label, margin: 0 }}>Regions — what each one looks like</label>
      <p style={{ fontSize: 12, color: "#6b6a60", margin: "6px 0 10px" }}>
        Two or three sentences per region: landscape, buildings, plants — and what must <b>not</b> appear.
        The painter gets this whenever a wine&rsquo;s region matches. {draft && <b>These are Claude&rsquo;s drafts — correct them and save.</b>}
      </p>
      {names.map((name) => (
        <div key={name} style={{ display: "grid", gridTemplateColumns: "150px 1fr 28px", gap: 8, alignItems: "start", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, paddingTop: 7 }}>{name}</span>
          <textarea value={map[name]} onChange={(e) => setMap({ ...map, [name]: e.target.value })} style={{ ...S.input, minHeight: 56, fontSize: 12 }} />
          <button title="remove" onClick={() => { const m = { ...map }; delete m[name]; setMap(m); }} style={{ ...S.linkBtn, fontSize: 14, paddingTop: 6 }}>✕</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
        <input value={newName} placeholder="add a region…" onChange={(e) => setNewName(e.target.value)} style={{ ...S.input, width: 200 }} />
        <button style={S.btnGhost} onClick={() => { const n = newName.trim(); if (n && !map[n]) setMap({ ...map, [n]: "" }); setNewName(""); }}>Add</button>
        <button style={{ ...S.btn, marginLeft: "auto" }} onClick={save}>Save regions</button>
        {saved === "ok" && <span style={{ fontSize: 12, color: "#5a6b3b" }}>Saved ✓ — applies to the next painting</span>}
        {saved === "err" && <span style={{ fontSize: 12, color: "#a33" }}>could not save</span>}
      </div>
    </div>
  );
}
