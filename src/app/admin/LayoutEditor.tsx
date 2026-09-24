"use client";

/* THE LAYOUT EDITOR (owner, 2026-09-23: "let layouts be made in the admin
   where I can move elements about, and you analyse what I corrected and
   work out what to fix — properly this time").

   He opens a REAL label the wizard made, and every line of its type and
   its picture are live: drag them, nudge them with the arrow keys
   (0.1 mm; Shift 1 mm), change a line's size, weight or alignment, hide a
   line, move or scale the picture. The 5 mm margins and the centre lines
   are drawn — black-and-white dashes, so they show on any ground — with a
   grid that starts ON the margin lines (2026-09-24). Shift-click adds or
   removes an element from the selection; the selection moves together.
   He works through a QUEUE (2026-09-24): "Make 5" paints five new labels
   the way the wizard does, across all twelve templates at mixed sizes;
   each leaves the queue once he saves his fix or says the layout is fine.
   Save sends before and after — exact numbers — with a note on why;
   nothing turns into a rule until Claude has read the edits and the
   owner has agreed what they mean (tools/layout-edits-report.mts). */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Line = { text: string; x: number; y: number; size: number; tracking: number; family: string; weight: number; italic: boolean; anchor: "start" | "middle" | "end"; colour: string; rot?: number; key?: string; hidden?: boolean };
type Box = { x: number; y: number; w: number; h: number };
type Layout = { W: number; H: number; ground: string; art: Box; artCrop?: Box; lines: Line[] };
type State = { lines: Line[]; art: Box };
type Meta = { id: string; template?: string; style: string; widthMm: number; heightMm: number; createdAt: string; artist?: string };
type Item = { id: string; template: string; widthMm: number; heightMm: number; artist: string; idea: string };
type Batch = { open: Item[]; fixed: number; ok: number; running: { total: number; done: number; failed: string[] } | null };

const PX_PER_MM = 12;
const PT_PX = PX_PER_MM * 0.3528;          /* 1 pt in label pixels */
const VIEW_W = 760;                         /* the label's width on screen */

/* labels made before lines carried their element's name: an arced line
   was laid letter by letter — consecutive turned single letters of one
   size and face are one element, so they move together */
export const keyed = (ls: Line[]): Line[] => {
  let arc = 0;
  return ls.map((l, i) => {
    if (l.key) return l;
    const prev = ls[i - 1];
    const glyph = l.text.length === 1 && l.rot !== undefined;
    if (glyph) {
      const cont = prev && !prev.key && prev.text.length === 1 && prev.rot !== undefined && prev.size === l.size && prev.family === l.family;
      if (!cont) arc++;
      return { ...l, key: `arc${arc}` };
    }
    return { ...l, key: `line${i}` };
  });
};

const ui = {
  btn: { border: "1px solid #111", background: "#fff", padding: "4px 10px", cursor: "pointer", font: "inherit", fontSize: 12 } as React.CSSProperties,
  btnDark: { border: "1px solid #111", background: "#111", color: "#fff", padding: "5px 14px", cursor: "pointer", font: "inherit", fontSize: 12 } as React.CSSProperties,
  small: { fontSize: 11, color: "#8a887e" } as React.CSSProperties,
};

export function LayoutEditor() {
  const [batch, setBatch] = useState<Batch>({ open: [], fixed: 0, ok: 0, running: null });
  const [pictureBad, setPictureBad] = useState(false);
  const [id, setId] = useState("");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [artSize, setArtSize] = useState({ w: 1, h: 1 });
  const [faces, setFaces] = useState<Record<string, number[]>>({});
  const [st, setSt] = useState<State | null>(null);
  const [hist, setHist] = useState<State[]>([]);
  const [sel, setSel] = useState<string[]>([]);       /* line group keys, and/or "art" */
  const [showGrid, setShowGrid] = useState(true);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ x: number; y: number; from: State; keys: string[] } | null>(null);
  /* the selection boxes are measured off the drawn letters — one more
     paint once they are drawn */
  const [, repaint] = useState(0);
  useEffect(() => { repaint((n) => n + 1); }, [st, sel]);

  const refresh = useCallback(async () => {
    const b = await (await fetch("/api/admin/layout-batch")).json().catch(() => null);
    if (b && Array.isArray(b.open)) setBatch(b);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  /* while a batch paints, look every few seconds for the ones that are in */
  useEffect(() => {
    if (!batch.running) return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [batch.running, refresh]);
  const make = async () => {
    await fetch("/api/admin/layout-batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "make" }) });
    refresh();
  };

  const open = useCallback(async (lid: string) => {
    setId(lid); setSel([]); setMsg(""); setNote(""); setHist([]); setPictureBad(false);
    const b = await (await fetch(`/api/admin/labels?id=${lid}&part=layout`)).json();
    if (!b.layout) { setMsg("This label has no layout on disk."); return; }
    setMeta(b.meta); setLayout(b.layout); setArtSize(b.art); setFaces(b.faces || {});
    setSt({ lines: keyed(b.layout.lines), art: { ...b.layout.art } });
  }, []);
  /* nothing open → the first label waiting in the queue */
  useEffect(() => { if (!id && batch.open.length) open(batch.open[0].id); }, [id, batch.open, open]);

  /* the faces the label uses, and their bold / regular twins */
  const fontCss = useMemo(() => {
    if (!st) return "";
    const seen = new Set<string>();
    const out: string[] = [];
    for (const l of st.lines) {
      const fam = l.family.replace(/\s+/g, "");
      for (const w of faces[fam] || [l.weight]) {
        const k = `${l.family}-${w}`;
        if (seen.has(k)) continue; seen.add(k);
        out.push(`@font-face{font-family:"${l.family}";font-weight:${w};src:url(/fonts/labels/${fam}-${w}.ttf) format("truetype");}`);
      }
    }
    return out.join("\n");
  }, [st, faces]);

  const push = (next: State) => { if (st) setHist((h) => [...h.slice(-60), st]); setSt(next); };
  const groupOf = (key: string) => (st ? st.lines.map((l, i) => (l.key === key ? i : -1)).filter((i) => i >= 0) : []);
  const mapSel = (f: (l: Line) => Line) => st && push({ ...st, lines: st.lines.map((l) => (sel.includes(l.key || "") ? f(l) : l)) });
  const bboxOf = (key: string): Box | null => {
    const svg = svgRef.current; if (!svg) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    svg.querySelectorAll<SVGGraphicsElement>(`[data-key="${CSS.escape(key)}"]`).forEach((el) => {
      const b = el.getBBox(); const m = el.getCTM(); const r = svg.getCTM();
      if (!m || !r) return;
      const inv = r.inverse().multiply(m);
      for (const [px, py] of [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]) {
        const p = new DOMPoint(px, py).matrixTransform(inv);
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
      }
    });
    return x0 < Infinity ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  };

  /* moving: drag, or the arrow keys — everything selected, together */
  const shifted = (base: State, keys: string[], dx: number, dy: number): State => ({
    art: keys.includes("art") ? { ...base.art, x: base.art.x + dx, y: base.art.y + dy } : base.art,
    lines: base.lines.map((l) => (keys.includes(l.key || "") ? { ...l, x: l.x + dx, y: l.y + dy } : l)),
  });
  const move = (dx: number, dy: number) => { if (st && sel.length) push(shifted(st, sel, dx, dy)); };
  const toLabel = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!; const r = svg.getBoundingClientRect();
    return { x: (e.clientX - r.left) * ((layout?.W || 1) / r.width), y: (e.clientY - r.top) * ((layout?.H || 1) / r.height) };
  };
  const onDown = (key: string) => (e: React.PointerEvent) => {
    e.stopPropagation(); if (!st) return;
    /* Shift adds or takes away; a plain click on something already
       selected keeps the selection, so the group can be dragged */
    let keys = sel;
    if (e.shiftKey) keys = sel.includes(key) ? sel.filter((k) => k !== key) : [...sel, key];
    else if (!sel.includes(key)) keys = [key];
    setSel(keys);
    if (!keys.includes(key)) return;
    const p = toLabel(e);
    drag.current = { x: p.x, y: p.y, from: st, keys };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !st) return;
    const p = toLabel(e);
    setSt(shifted(drag.current.from, drag.current.keys, p.x - drag.current.x, p.y - drag.current.y));
  };
  const onUp = () => {
    if (drag.current) { const from = drag.current.from; drag.current = null; setHist((h) => [...h.slice(-60), from]); }
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!st || !sel.length || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      const step = (e.shiftKey ? 1 : 0.1) * PX_PER_MM;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (d) { e.preventDefault(); move(d[0], d[1]); }
      if ((e.metaKey || e.ctrlKey) && e.key === "z") { e.preventDefault(); undo(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const undo = () => setHist((h) => { if (!h.length) return h; setSt(h[h.length - 1]); return h.slice(0, -1); });
  const reset = () => { if (layout) push({ lines: keyed(layout.lines), art: { ...layout.art } }); };

  /* the selected lines' tools — size, weight and hide work on every
     selected line; alignment only on one straight line */
  const selKeys = sel.filter((k) => k !== "art");
  const selLine = st && selKeys.length ? st.lines.find((l) => l.key === selKeys[0]) : null;
  const one = sel.length === 1 && !!selLine && groupOf(selKeys[0]).length === 1;
  const resize = (dPt: number) => mapSel((l) => ({ ...l, size: Math.max(5 * PT_PX, l.size + dPt * PT_PX) }));
  const toggleBold = () => {
    if (!selLine) return;
    const heavier = selLine.weight < 600;                        /* all follow the first */
    mapSel((l) => {
      const ws = (faces[l.family.replace(/\s+/g, "")] || [400, 700]).sort((a, b) => a - b);
      return { ...l, weight: heavier ? ws[ws.length - 1] : ws.find((w) => w >= 400) || ws[0] };
    });
  };
  const align = (a: Line["anchor"]) => {
    if (!one) return;                                            /* an arced name keeps its arc */
    const b = bboxOf(selKeys[0]); if (!b) return;
    const edge = (an: Line["anchor"]) => (an === "start" ? b.x : an === "middle" ? b.x + b.w / 2 : b.x + b.w);
    mapSel((l) => ({ ...l, anchor: a, x: edge(a) }));
  };
  const hide = () => { const h = !selLine?.hidden; mapSel((l) => ({ ...l, hidden: h })); };
  const scaleArt = (k: number) => st && push({ ...st, art: { x: st.art.x + (st.art.w * (1 - k)) / 2, y: st.art.y + (st.art.h * (1 - k)) / 2, w: st.art.w * k, h: st.art.h * k } });

  /* the label leaves the queue: with his fix saved, or as fine */
  const finish = async (outcome: "fixed" | "ok") => {
    if (!st || !layout) return;
    setMsg("Saving…");
    if (outcome === "fixed") {
      const r = await fetch("/api/admin/layout-edits", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labelId: id, note, pictureBad, before: { lines: keyed(layout.lines), art: layout.art }, after: { lines: st.lines, art: st.art } }),
      });
      if (!r.ok) { const b = await r.json().catch(() => ({})); setMsg("Could not save: " + (b.error || r.status)); return; }
    }
    await fetch("/api/admin/layout-batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "close", id, outcome, pictureBad, note }) });
    setId(""); setSt(null); setLayout(null); setMeta(null); setMsg("");
    refresh();
  };

  const changed = !!(st && layout && JSON.stringify({ l: st.lines, a: st.art }) !== JSON.stringify({ l: keyed(layout.lines), a: layout.art }));
  const scaleView = layout ? VIEW_W / layout.W : 1;
  const M = 5 * PX_PER_MM;
  const selBoxes = st ? sel.map((k) => (k === "art" ? st.art : bboxOf(k))).filter((b): b is Box => !!b) : [];
  /* the grid starts ON the margin lines and ends on them: the space
     between is cut into equal steps of about 5 mm */
  const grid = (() => {
    if (!layout) return { xs: [] as number[], ys: [] as number[] };
    const steps = (len: number) => { const n = Math.max(1, Math.round(len / (5 * PX_PER_MM))); return Array.from({ length: n - 1 }, (_, i) => M + ((i + 1) * len) / n); };
    return { xs: steps(layout.W - 2 * M), ys: steps(layout.H - 2 * M) };
  })();
  /* a guide that shows on ANY ground: white under, black dashes over */
  const guide = (key: string, x1: number, y1: number, x2: number, y2: number, w: number, dash: string, op = 1) => (
    <g key={key} opacity={op} pointerEvents="none">
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={w} />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#000" strokeWidth={w} strokeDasharray={dash} />
    </g>
  );


  return (
    <div>
      <style>{fontCss}</style>
      {/* the queue: labels still waiting to be looked at */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8, fontSize: 12 }}>
        <button style={{ ...ui.btnDark, opacity: batch.running ? 0.4 : 1 }} disabled={!!batch.running} onClick={make}>Make 5 new labels</button>
        {batch.running
          ? <span>Painting… {batch.running.done} / {batch.running.total} ready (about a minute each, three at a time)</span>
          : <span style={ui.small}>{batch.open.length} waiting · {batch.fixed} fixed · {batch.ok} fine so far</span>}
        {batch.running && batch.running.failed.length > 0 && <span style={{ color: "#B71318" }}>{batch.running.failed.length} failed</span>}
      </div>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, minHeight: 74 }}>
        {batch.open.map((m) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={m.id} src={`/api/admin/labels?id=${m.id}`} alt={m.id} title={`${m.template} · ${m.widthMm}×${m.heightMm} · ${m.artist} · ${m.idea}`}
            onClick={() => open(m.id)}
            style={{ height: 70, border: m.id === id ? "2px solid #B71318" : "1px solid #E3E3E1", cursor: "pointer", flex: "0 0 auto" }} />
        ))}
        {!batch.open.length && !batch.running && <span style={ui.small}>The queue is empty — press “Make 5 new labels”.</span>}
      </div>

      {st && layout && meta && (
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start", marginTop: 10 }}>
          <div>
            <svg ref={svgRef} viewBox={`0 0 ${layout.W} ${layout.H}`} width={VIEW_W} height={layout.H * scaleView}
              style={{ display: "block", border: "1px solid #E3E3E1", touchAction: "none", userSelect: "none", background: layout.ground }}
              onPointerMove={onMove} onPointerUp={onUp} onPointerDown={(e) => { if (!e.shiftKey) setSel([]); }}>
              <rect width={layout.W} height={layout.H} fill={layout.ground} />
              {/* the picture, cropped as the label shows it */}
              <svg x={st.art.x} y={st.art.y} width={st.art.w} height={st.art.h} preserveAspectRatio="none" overflow="hidden"
                viewBox={layout.artCrop ? `${layout.artCrop.x} ${layout.artCrop.y} ${layout.artCrop.w} ${layout.artCrop.h}` : `0 0 ${artSize.w} ${artSize.h}`}>
                <image href={`/api/admin/labels?id=${id}&part=art`} width={artSize.w} height={artSize.h} preserveAspectRatio="none" />
              </svg>
              <rect x={st.art.x} y={st.art.y} width={st.art.w} height={st.art.h} fill="transparent" style={{ cursor: "move" }} onPointerDown={onDown("art")} />
              {/* the type */}
              {st.lines.map((l, i) => (
                <text key={i} data-key={l.key} x={l.x} y={l.y} fontFamily={`"${l.family}"`} fontWeight={l.weight} fontSize={l.size}
                  letterSpacing={l.tracking || undefined} textAnchor={l.anchor} fill={l.colour} opacity={l.hidden ? 0.15 : 1}
                  transform={l.rot ? `rotate(${l.rot} ${l.x} ${l.y})` : undefined}
                  style={{ cursor: "move", whiteSpace: "pre" }} onPointerDown={onDown(l.key || `line${i}`)}>{l.text}</text>
              ))}
              {/* the grid, from margin line to margin line */}
              {showGrid && grid.xs.map((x) => guide(`gx${x}`, x, M, x, layout.H - M, 1, "3 5", 0.35))}
              {showGrid && grid.ys.map((y) => guide(`gy${y}`, M, y, layout.W - M, y, 1, "3 5", 0.35))}
              {/* the centre lines and the 5 mm margin */}
              {guide("cx", layout.W / 2, 0, layout.W / 2, layout.H, 1, "4 8", 0.7)}
              {guide("cy", 0, layout.H / 2, layout.W, layout.H / 2, 1, "4 8", 0.7)}
              {guide("mt", M, M, layout.W - M, M, 2, "10 8")}
              {guide("mb", M, layout.H - M, layout.W - M, layout.H - M, 2, "10 8")}
              {guide("ml", M, M, M, layout.H - M, 2, "10 8")}
              {guide("mr", layout.W - M, M, layout.W - M, layout.H - M, 2, "10 8")}
              {selBoxes.map((b, i) => <rect key={"sel" + i} x={b.x - 4} y={b.y - 4} width={b.w + 8} height={b.h + 8} fill="none" stroke="#B71318" strokeWidth={2} pointerEvents="none" />)}
            </svg>
            <div style={{ ...ui.small, marginTop: 6 }}>
              {meta.template} · {meta.widthMm} × {meta.heightMm} mm · {meta.artist || meta.style} · bold dashes = 5 mm margin from the trim, fine dashes = centre lines and grid
              <label style={{ marginLeft: 12, cursor: "pointer" }}><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> grid</label>
            </div>
          </div>

          {/* the tools */}
          <div style={{ width: 280, display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
            <div style={{ fontWeight: 700 }}>
              {sel.length > 1 ? `${sel.length} selected` : sel[0] === "art" ? "Picture" : selLine ? `${selLine.key} — ${(selLine.size / PT_PX).toFixed(1)} pt, ${selLine.weight >= 600 ? "bold" : "regular"}` : "Click a line or the picture"}
            </div>
            <div style={ui.small}>Shift-click adds or removes a line (or the picture) from the selection.</div>
            {sel.length > 0 && <div style={ui.small}>Drag, or use the arrow keys: 0.1 mm a press, 1 mm with Shift. Everything selected moves together.</div>}
            {selLine && (<>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button style={ui.btn} onClick={() => resize(-0.5)}>size −</button>
                <button style={ui.btn} onClick={() => resize(0.5)}>size +</button>
                <button style={ui.btn} onClick={toggleBold}>bold on/off</button>
                <button style={ui.btn} onClick={hide}>{selLine.hidden ? "show" : "hide"}</button>
              </div>
              {one && (
                <div style={{ display: "flex", gap: 6 }}>
                  {/* the line's current alignment is the black button */}
                  {([["start", "align left"], ["middle", "centre"], ["end", "right"]] as const).map(([a, t]) => (
                    <button key={a} style={selLine?.anchor === a ? { ...ui.btn, background: "#111", color: "#fff" } : ui.btn} onClick={() => align(a)}>{t}</button>
                  ))}
                </div>
              )}
            </>)}
            {sel.includes("art") && (
              <div style={{ display: "flex", gap: 6 }}>
                <button style={ui.btn} onClick={() => scaleArt(0.97)}>smaller</button>
                <button style={ui.btn} onClick={() => scaleArt(1 / 0.97)}>bigger</button>
              </div>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              <button style={ui.btn} onClick={undo} disabled={!hist.length}>undo (⌘Z)</button>
              <button style={ui.btn} onClick={reset}>reset</button>
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why? (optional — e.g. 'the grape reads too small next to the name')"
              style={{ width: "100%", height: 80, border: "1px solid #111", padding: 6, font: "inherit", fontSize: 12, boxSizing: "border-box" }} />
            <label style={{ cursor: "pointer" }}><input type="checkbox" checked={pictureBad} onChange={(e) => setPictureBad(e.target.checked)} /> the picture itself is wrong (say why in the note)</label>
            <button style={{ ...ui.btnDark, opacity: changed ? 1 : 0.4 }} disabled={!changed} onClick={() => finish("fixed")}>Save my fix — next label</button>
            <button style={{ ...ui.btn, opacity: changed ? 0.4 : 1 }} disabled={changed} onClick={() => finish("ok")}>The layout is fine — next label</button>
            {msg && <div style={ui.small}>{msg}</div>}
          </div>
        </div>
      )}
      {msg && !st && <div style={ui.small}>{msg}</div>}
    </div>
  );
}
