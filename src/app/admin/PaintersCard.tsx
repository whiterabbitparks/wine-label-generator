"use client";

/* ARTISTS PER COLUMN (round 90 → 105). The wizard shows three columns,
   each headed by an artist's name and painted by that artist (gpt-image
   → FLUX + her LoRA). One select per column. Saved to settings "painters". */

import { useEffect, useState } from "react";
import { AdminStyles as S } from "../legacy/LegacyAdmin";

const COLUMNS: [string, string][] = [["traditional", "Column 1"], ["contemporary", "Column 2"], ["punk", "Column 3"]];

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
      <label style={{ ...S.label, margin: 0 }}>Artists — who paints each column of the wizard</label>
      <p style={{ fontSize: 12, color: "#6b6a60", margin: "6px 0 10px" }}>
        Every picture is painted the same way: gpt-image paints the story with four of the artist&rsquo;s works beside it, then FLUX with her LoRA repaints it in her hand. Applies to the next generation.
      </p>
      {COLUMNS.map(([key, title]) => (
        <div key={key} style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{title}</span>
          <select value={map[key] || ""} onChange={(e) => setMap({ ...map, [key]: e.target.value })} style={{ ...S.input, width: 360 }}>
            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
        <button style={{ ...S.btn, marginLeft: "auto" }} onClick={save}>Save</button>
        {saved === "ok" && <span style={{ fontSize: 12, color: "#5a6b3b" }}>Saved ✓ — applies to the next painting</span>}
        {saved === "err" && <span style={{ fontSize: 12, color: "#a33" }}>could not save</span>}
      </div>
    </div>
  );
}
