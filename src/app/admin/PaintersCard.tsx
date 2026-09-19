"use client";

/* PAINTERS (round 90, owner: "let's plug in the other models and get
   those visuals"). One select per style: which painter paints the
   artwork in the wizard. The type is always set by code, so any painter
   that respects the type zone can join. Saved to settings "painters". */

import { useEffect, useState } from "react";
import { AdminStyles as S } from "../legacy/LegacyAdmin";

const STYLES = ["traditional", "contemporary", "punk"];

export function PaintersCard() {
  const [map, setMap] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const [saved, setSaved] = useState<"" | "ok" | "err">("");

  useEffect(() => {
    fetch("/api/admin/painters").then((r) => r.json()).then((b) => { setMap(b.map || {}); setOptions(b.options || []); });
  }, []);

  async function save() {
    const r = await fetch("/api/admin/painters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ map }) });
    setSaved(r.ok ? "ok" : "err");
    setTimeout(() => setSaved(""), 2500);
  }

  return (
    <div style={S.card}>
      <label style={{ ...S.label, margin: 0 }}>Painters — who paints the artwork, per style</label>
      <p style={{ fontSize: 12, color: "#6b6a60", margin: "6px 0 10px" }}>
        The type is always set by code; the painter only paints the picture. Compare painters in Evaluate first, then choose here. Applies to the next generation.
      </p>
      {STYLES.map((st) => (
        <div key={st} style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, textTransform: "capitalize" }}>{st === "punk" ? "Funky" : st}</span>
          <select value={map[st] || ""} onChange={(e) => setMap({ ...map, [st]: e.target.value })} style={{ ...S.input, width: 360 }}>
            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
        <button style={{ ...S.btn, marginLeft: "auto" }} onClick={save}>Save painters</button>
        {saved === "ok" && <span style={{ fontSize: 12, color: "#5a6b3b" }}>Saved ✓ — applies to the next painting</span>}
        {saved === "err" && <span style={{ fontSize: 12, color: "#a33" }}>could not save</span>}
      </div>
    </div>
  );
}
