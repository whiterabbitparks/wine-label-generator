"use client";

/* THE LAYOUT BENCH (owner 2026-09-23: "let me generate a label and move
   the pieces until they sit right — don't load the interface with
   millimetres, keep that for yourself").

   So: the label, large. Take hold of any line, or the picture, and move
   it. The picture has a handle to resize. Guides appear when a line
   comes onto the left margin, the centre or the right margin, and it
   snaps there. Nothing else on screen.

   What he moves is written back into the TEMPLATE, at its reference
   size, in the units his artboard uses — so a correction carries to
   every label size, every seed and every customer's words. */

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminStyles as S } from "../legacy/LegacyAdmin";

type Tpl = { id: string; band: string; kind: string; refW: number; refH: number; touched: boolean };
type Line = { text: string; x: number; y: number; size: number; tracking: number; family: string; weight: number; anchor: string; colour: string; rot?: number; key: string; align: string };
type Bench = {
  png: string | null; layout: { W: number; H: number; ground: string };
  art: { x: number; y: number; w: number; h: number };
  lines: Line[]; widthMm: number; heightMm: number; refW: number; refH: number; warnings?: string[];
  template: { id: string; band: string; kind: string; art: { x: number; y: number; w: number; h: number } | null; texts: { fields: string[]; x: number; baseline: number; size: number; align: string }[] };
};
type Move = { dx: number; dy: number };

const SIZES: [number, number][] = [[110, 80], [104, 84], [90, 90], [80, 110], [70, 120], [130, 90]];
const PX_PER_MM = 12;

export function LayoutBench() {
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [id, setId] = useState("");
  const [size, setSize] = useState(0);
  const [fill, setFill] = useState("full");
  const [b, setB] = useState<Bench | null>(null);
  const [busy, setBusy] = useState(false);
  const [moves, setMoves] = useState<Record<string, Move>>({});
  const [artMove, setArtMove] = useState<{ dx: number; dy: number; dw: number }>({ dx: 0, dy: 0, dw: 0 });
  const [guide, setGuide] = useState<number | null>(null);
  const [saved, setSaved] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/admin/layouts").then((r) => r.json()).then((d) => {
      setTpls(d.templates || []);
      if (d.templates?.[0]) setId(d.templates[0].id);
    }).catch(() => { });
  }, []);

  const load = useCallback(() => {
    if (!id) return;
    setBusy(true); setMoves({}); setArtMove({ dx: 0, dy: 0, dw: 0 }); setSaved("");
    fetch("/api/admin/layouts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, widthMm: SIZES[size][0], heightMm: SIZES[size][1], fill }),
    }).then((r) => r.json()).then((d) => setB(d.error ? null : d)).finally(() => setBusy(false));
  }, [id, size, fill]);
  useEffect(() => { load(); }, [load]);

  /* the label is drawn at this many screen pixels per label pixel */
  const zoom = b ? Math.min(760 / b.layout.W, 520 / b.layout.H) : 1;
  const snapsAt = b ? [5 * PX_PER_MM, b.layout.W / 2, b.layout.W - 5 * PX_PER_MM] : [];

  const drag = (onMove: (dx: number, dy: number, e: PointerEvent) => void) => (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY;
    const move = (ev: PointerEvent) => onMove((ev.clientX - x0) / zoom, (ev.clientY - y0) / zoom, ev);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); setGuide(null); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const save = () => {
    if (!b) return;
    const mmPerPx = 1 / PX_PER_MM;
    const kx = b.refW / b.widthMm, ky = b.refH / b.heightMm;   /* back to the artboard's size */
    const texts: Record<string, { x?: number; baseline?: number }> = {};
    for (const [key, m] of Object.entries(moves)) {
      if (!m.dx && !m.dy) continue;
      const t = b.template.texts.find((x) => x.fields.join("+") === key);
      if (!t) continue;
      texts[key] = { x: +(t.x + m.dx * mmPerPx * kx).toFixed(2), baseline: +(t.baseline + m.dy * mmPerPx * ky).toFixed(2) };
    }
    const art = b.template.art && (artMove.dx || artMove.dy || artMove.dw)
      ? {
        x: +(b.template.art.x + artMove.dx * mmPerPx * kx).toFixed(2),
        y: +(b.template.art.y + artMove.dy * mmPerPx * ky).toFixed(2),
        w: +(b.template.art.w + artMove.dw * mmPerPx * kx).toFixed(2),
        h: +(b.template.art.h + artMove.dw * mmPerPx * ky * (b.template.art.h / b.template.art.w)).toFixed(2),
      } : undefined;
    setSaved("saving");
    fetch("/api/admin/layouts", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: b.template.id, correction: { texts, art } }),
    }).then((r) => r.json()).then(() => { setSaved("kept"); load(); setTimeout(() => setSaved(""), 2200); })
      .catch(() => setSaved("failed"));
  };
  const reset = () => {
    if (!b) return;
    fetch("/api/admin/layouts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.template.id, correction: null }) })
      .then(() => load());
  };

  const dirty = Object.values(moves).some((m) => m.dx || m.dy) || artMove.dx || artMove.dy || artMove.dw;

  return (
    <section style={S.card}>
      <h3 style={{ margin: "0 0 14px", fontSize: 15, letterSpacing: 0.2 }}>Layouts</h3>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <select value={id} onChange={(e) => setId(e.target.value)} style={S.input}>
          {tpls.map((t) => <option key={t.id} value={t.id}>{t.id.toUpperCase()} · {t.band} · {t.kind}{t.touched ? " ·" : ""}</option>)}
        </select>
        <select value={size} onChange={(e) => setSize(Number(e.target.value))} style={S.input}>
          {SIZES.map(([w, h], i) => <option key={i} value={i}>{w} × {h} mm</option>)}
        </select>
        <select value={fill} onChange={(e) => setFill(e.target.value)} style={S.input}>
          <option value="full">All details</option>
          <option value="sparse">Few details</option>
          <option value="long">Long names</option>
        </select>
        <span style={{ flex: 1 }} />
        <button onClick={reset} style={S.btnGhost}>Put back</button>
        <button onClick={save} disabled={!dirty} style={{ ...S.btn, opacity: dirty ? 1 : 0.4 }}>
          {saved === "kept" ? "Kept" : saved === "saving" ? "…" : "Keep"}
        </button>
      </div>

      <div style={{ background: "#e9e7e1", padding: 24, display: "flex", justifyContent: "center", borderRadius: 4 }}>
        {busy && !b && <div style={{ padding: 60, color: "#777" }}>…</div>}
        {b && (
          <div ref={box} style={{
            position: "relative", width: b.layout.W * zoom, height: b.layout.H * zoom,
            background: b.layout.ground, boxShadow: "0 2px 14px rgba(0,0,0,0.18)", overflow: "hidden", touchAction: "none",
          }}>
            {/* the label as the engine made it, without its words */}
            {b.png && (
              <div style={{
                position: "absolute", inset: 0,
                backgroundImage: `url(${b.png})`, backgroundSize: "100% 100%",
                transform: `translate(${artMove.dx * zoom}px, ${artMove.dy * zoom}px) scale(${1 + artMove.dw / Math.max(1, b.art.w)})`,
                transformOrigin: "center",
              }} />
            )}
            {/* take hold of the picture here */}
            <div
              onPointerDown={drag((dx, dy) => setArtMove((a) => ({ ...a, dx, dy })))}
              style={{
                position: "absolute", cursor: "move",
                left: (b.art.x + artMove.dx) * zoom, top: (b.art.y + artMove.dy) * zoom,
                width: (b.art.w + artMove.dw) * zoom, height: (b.art.h + artMove.dw * (b.art.h / Math.max(1, b.art.w))) * zoom,
                outline: "1px dashed rgba(0,0,0,0.3)",
              }}>
              <span
                onPointerDown={(e) => { e.stopPropagation(); drag((dx) => setArtMove((a) => ({ ...a, dw: dx })))(e); }}
                style={{ position: "absolute", right: -6, bottom: -6, width: 12, height: 12, background: "#fff", border: "1px solid #444", borderRadius: 2, cursor: "nwse-resize" }} />
            </div>
            {/* the lines */}
            {b.lines.map((l, i) => {
              const m = moves[l.key] || { dx: 0, dy: 0 };
              const x = (l.x + m.dx) * zoom, y = (l.y + m.dy) * zoom;
              return (
                <span key={i}
                  onPointerDown={l.key ? drag((dx, dy) => {
                    const nx = l.x + dx;
                    const near = snapsAt.find((sx) => Math.abs(nx - sx) < 4);
                    setGuide(near ?? null);
                    setMoves((p) => ({ ...p, [l.key]: { dx: (near ?? nx) - l.x, dy } }));
                  }) : undefined}
                  style={{
                    position: "absolute", left: x, top: y, transform: `translateY(-100%) ${l.rot ? `rotate(${l.rot}deg)` : ""}`,
                    transformOrigin: "left bottom",
                    font: `${l.weight} ${l.size * zoom}px "${l.family}", serif`,
                    letterSpacing: l.tracking * zoom, color: l.colour, whiteSpace: "nowrap",
                    cursor: l.key ? "move" : "default", userSelect: "none",
                    ...(l.anchor === "middle" ? { translate: "-50% 0" } : l.anchor === "end" ? { translate: "-100% 0" } : {}),
                  }}>{l.text}</span>
              );
            })}
            {guide !== null && (
              <div style={{ position: "absolute", left: guide * zoom, top: 0, bottom: 0, width: 1, background: "#c0392b", pointerEvents: "none" }} />
            )}
            {/* the safe margin, faint */}
            <div style={{ position: "absolute", inset: 5 * PX_PER_MM * zoom, border: "1px dashed rgba(0,0,0,0.12)", pointerEvents: "none" }} />
          </div>
        )}
      </div>
      {b?.warnings?.length ? <p style={{ fontSize: 12, color: "#b33", marginTop: 10 }}>{b.warnings.join(" · ")}</p> : null}
    </section>
  );
}
