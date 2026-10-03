"use client";

/* THE FINAL ROUND ON TRIAL (owner, 2026-10-04: "launch nothing on the
   site yet — first I will see in the admin what comes out with the new
   layouts, then we decide"). Pick artists, an idea, the wine's details
   and a size; a handful of labels is painted (small — cheap) with the new
   engine. Under each: the layout, the ground (where it came from), the
   type colours, the faces, and what the engine had to reduce. "Other
   layout" and "Other ground" re-set the SAME painting for nothing. */
import { useCallback, useEffect, useRef, useState } from "react";

type Ground = { ground: string; source: string; note: string };
type Item = { id: string; n: number; artist: string; artistId: string; lay: string; family: string; widthMm: number; heightMm: number; ground: Ground; inks: { text: string; accent: string; allColoured: boolean }; facesName: string; sheet: string; mainColour: string | null; warnings: string[]; fit: { reduced: string[]; wrapped: string[]; problems: string[] }; png: string; parent?: string; error?: string };
type Run = { id: string; at: string; status: "painting" | "done"; want: number; items: Item[]; note: string };
type Artist = { id: string; name: string; grounds: { hex: string; works: number }[] };
type Family = { id: string; ids: string[]; sizes: string[] };

const btn: React.CSSProperties = { border: "2px solid #111", background: "#fff", padding: "6px 12px", cursor: "pointer", font: "inherit", fontSize: 12 };
const input: React.CSSProperties = { border: "1px solid #999", padding: "6px 8px", font: "inherit", fontSize: 13, background: "#fff" };
const PRESETS: Record<string, Record<string, string>> = {
  "a lot": { producer: "Marani Tsinandali Estate", wine: "Saperavi Reserve", appellation: "Mukuzani PDO", classification: "Grand Reserve", vintage: "2019", grape: "Saperavi", region: "Kakheti", country: "Georgia", special: "Qvevri Aged 18 Months", sweetness: "Dry", wineColorName: "Red", wineType: "Wine", alcohol: "13.5", volume: "750" },
  medium: { producer: "Giorgi's Marani", wine: "Korra", vintage: "2023", grape: "Rkatsiteli", region: "Kakheti", country: "Georgia", sweetness: "Dry", wineColorName: "White", wineType: "Pet-Nat", alcohol: "12", volume: "750" },
  few: { wine: "Tsitska", vintage: "2022", sweetness: "Dry", wineColorName: "White", wineType: "Wine", alcohol: "11.5", volume: "750" },
  rosé: { producer: "Château Lumière", wine: "Rosé de Saignée", appellation: "Côtes de Provence AOC", vintage: "2024", grape: "Grenache, Cinsault", region: "Provence", country: "France", sweetness: "Dry", wineColorName: "Rosé", wineType: "Wine", alcohol: "12.5", volume: "750" },
};
const IDEAS = ["Two old friends share a jug of wine under a fig tree at dusk", "A woman floating a few centimetres above a vineyard path", "A feast table with bread, cheese and a deer looking in from the dark", "A long table on a hill at sunset, everybody lifting a glass at once", "A tall figure in a cloak carrying a lantern through a vineyard at night"];

export function FinalRoundCard() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [idea, setIdea] = useState(IDEAS[0]);
  const [preset, setPreset] = useState<keyof typeof PRESETS>("a lot");
  const [w, setW] = useState(100), [h, setH] = useState(80), [count, setCount] = useState(4);
  const [fam, setFam] = useState("");
  const [busy, setBusy] = useState<string>("");
  const [msg, setMsg] = useState("");
  const [big, setBig] = useState<Item | null>(null);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/layout2");
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(b.error || `error ${r.status}`); return; }
    setRuns(b.runs); setArtists(b.artists); setFamilies(b.families);
    if (b.runs.some((x: Run) => x.status === "painting")) { if (timer.current) window.clearTimeout(timer.current); timer.current = window.setTimeout(load, 4000); }
  }, []);
  useEffect(() => { load(); return () => { if (timer.current) window.clearTimeout(timer.current); }; }, [load]);

  const paint = async () => {
    setBusy("paint"); setMsg("");
    const r = await fetch("/api/admin/layout2", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "paint", artists: picked, idea, data: PRESETS[preset], widthMm: w, heightMm: h, count, families: fam ? [fam] : [] }) });
    const b = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) { setMsg(b.error || `error ${r.status}`); return; }
    setMsg(`Painting ${count} label${count > 1 ? "s" : ""} — small resolution, two at a time.`);
    load();
  };
  const act = async (action: "layout" | "ground", it: Item, want?: string) => {
    setBusy(it.id + action); setMsg("");
    const r = await fetch("/api/admin/layout2", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id: it.id, want }) });
    const b = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) { setMsg(b.error || `error ${r.status}`); return; }
    await load();
  };
  const src = (it: Item) => `/api/admin/layout2?file=${encodeURIComponent(it.id.split("/")[0] + "/" + it.png)}`;
  const Swatch = ({ hex, title }: { hex: string; title?: string }) => <span title={title || hex} style={{ display: "inline-block", width: 14, height: 14, background: hex, border: "1px solid #999", verticalAlign: "middle", marginRight: 4 }} />;

  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 12 }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Artists <span style={{ color: "#8a887e", fontWeight: 400 }}>— none picked = all, in turn. The swatches are the grounds read off each artist&apos;s originals.</span></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {artists.map((a) => (
              <label key={a.id} style={{ border: "1px solid #ccc", padding: "4px 8px", background: picked.includes(a.id) ? "#E3E3E1" : "#fff", cursor: "pointer" }}>
                <input type="checkbox" checked={picked.includes(a.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, a.id] : p.filter((x) => x !== a.id)))} style={{ marginRight: 6 }} />
                {a.name} {a.grounds.map((g) => <Swatch key={g.hex} hex={g.hex} title={`${g.hex} — ${g.works} works`} />)}
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label>Idea <select value={IDEAS.includes(idea) ? idea : "custom"} onChange={(e) => e.target.value !== "custom" && setIdea(e.target.value)} style={{ ...input, marginLeft: 6 }}>{IDEAS.map((i) => <option key={i} value={i}>{i}</option>)}<option value="custom">(typed below)</option></select></label>
          <textarea value={idea} onChange={(e) => setIdea(e.target.value)} rows={2} style={{ ...input, width: "100%", boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label>Details <select value={preset} onChange={(e) => setPreset(e.target.value as keyof typeof PRESETS)} style={{ ...input, marginLeft: 6 }}>{Object.keys(PRESETS).map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
            <label>Size <input type="number" value={w} onChange={(e) => setW(+e.target.value)} style={{ ...input, width: 60, marginLeft: 6 }} /> × <input type="number" value={h} onChange={(e) => setH(+e.target.value)} style={{ ...input, width: 60 }} /> mm</label>
            <label>Labels <input type="number" min={1} max={12} value={count} onChange={(e) => setCount(+e.target.value)} style={{ ...input, width: 50, marginLeft: 6 }} /></label>
            <label>Layout <select value={fam} onChange={(e) => setFam(e.target.value)} style={{ ...input, marginLeft: 6 }}><option value="">any (centred / sides / vertical in turn)</option>{families.map((f) => <option key={f.id} value={f.id}>{f.ids.join(" / ")} ({f.sizes.join(", ")})</option>)}</select></label>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button style={{ ...btn, background: "#111", color: "#fff", padding: "8px 18px" }} disabled={busy === "paint"} onClick={paint}>Paint</button>
            <span style={{ color: "#8a887e" }}>{msg}</span>
          </div>
        </div>
      </div>

      {runs.map((run) => (
        <div key={run.id} style={{ marginTop: 24 }}>
          <div style={{ fontWeight: 700 }}>{run.at.slice(0, 16).replace("T", " ")} · {run.items.filter((i) => !i.parent && !i.error).length}/{run.want} painted{run.status === "painting" ? " — painting…" : ""} {run.note && <span style={{ color: "#8a887e", fontWeight: 400 }}>· {run.note}</span>}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 8 }}>
            {run.items.map((it) => it.error ? (
              <div key={it.id} style={{ width: 300, color: "#c0392b" }}>{it.n} · {it.artistId}: {it.error}</div>
            ) : (
              <div key={it.id} style={{ width: 300 }}>
                <img src={src(it)} alt={it.lay} style={{ width: 300, display: "block", border: "1px solid #ccc", cursor: "zoom-in" }} onClick={() => setBig(it)} />
                <div style={{ marginTop: 4 }}><b>{it.n}</b> · {it.artist} · <b>{it.lay}</b>{it.parent ? " · re-set" : ""} · {it.widthMm}×{it.heightMm}</div>
                <div><Swatch hex={it.ground.ground} /> ground: {it.ground.source} <span style={{ color: "#8a887e" }}>({it.ground.note})</span></div>
                <div><Swatch hex={it.inks.accent} /><Swatch hex={it.inks.text} /> {it.inks.allColoured ? "all the type in one colour" : "name in colour, rest black"} · {it.facesName}</div>
                {(it.fit.reduced.length > 0 || it.fit.wrapped.length > 0) && <div style={{ color: "#8a887e" }}>reduced: {it.fit.reduced.join(", ")}{it.fit.wrapped.length ? ` · broken in two: ${it.fit.wrapped.join(", ")}` : ""}</div>}
                {(it.warnings.length > 0) && <div style={{ color: "#c0392b" }}>{it.warnings.join("; ")}</div>}
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  <button style={btn} disabled={!!busy} onClick={() => act("layout", it)}>Other layout</button>
                  <button style={btn} disabled={!!busy} onClick={() => act("ground", it)}>Other ground</button>
                  <select defaultValue="" onChange={(e) => { if (e.target.value) { act("ground", it, e.target.value); e.target.value = ""; } }} style={{ ...input, padding: "4px 6px", fontSize: 12 }} disabled={!!busy}>
                    <option value="">ground from…</option><option value="originals">the originals</option><option value="painting">the painting</option><option value="white">white</option><option value="warm">warm light</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {big && (
        <div onClick={() => setBig(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, cursor: "zoom-out" }}>
          <img src={src(big)} alt={big.lay} style={{ maxWidth: "92vw", maxHeight: "92vh", boxShadow: "0 0 40px #000" }} />
        </div>
      )}
    </div>
  );
}
