"use client";

/* THE LAYOUT EDITOR (owner, 2026-09-23: "let layouts be made in the admin
   where I can move elements about, and you analyse what I corrected and
   work out what to fix — properly this time").

   He opens a REAL label the wizard made, and every line of its type and
   its picture are live: drag them, nudge them with the arrow keys
   (0.1 mm; Shift 1 mm), change a line's size, weight or alignment, hide a
   line, move or scale the picture. The 5 mm margins and the centre lines
   are drawn. Save sends before and after — exact numbers — with a note on
   why; nothing turns into a rule until Claude has read the edits and the
   owner has agreed what they mean (tools/layout-edits-report.mts). */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Line = { text: string; x: number; y: number; size: number; tracking: number; family: string; weight: number; italic: boolean; anchor: "start" | "middle" | "end"; colour: string; rot?: number; key?: string; hidden?: boolean };
type Box = { x: number; y: number; w: number; h: number };
type Layout = { W: number; H: number; ground: string; art: Box; artCrop?: Box; lines: Line[] };
type State = { lines: Line[]; art: Box };
type Meta = { id: string; template?: string; style: string; widthMm: number; heightMm: number; createdAt: string; artist?: string };

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
  const [list, setList] = useState<Meta[]>([]);
  const [id, setId] = useState("");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [artSize, setArtSize] = useState({ w: 1, h: 1 });
  const [faces, setFaces] = useState<Record<string, number[]>>({});
  const [st, setSt] = useState<State | null>(null);
  const [hist, setHist] = useState<State[]>([]);
  const [sel, setSel] = useState<string>("");          /* a line group's key, or "art" */
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ x: number; y: number; from: State } | null>(null);

  useEffect(() => {
    fetch("/api/admin/labels").then((r) => r.json()).then((b) => setList((b.labels || []).filter((m: Meta) => m.template)));
    fetch("/api/admin/layout-edits").then((r) => r.json()).then((b) => setSavedCount((b.edits || []).length)).catch(() => {});
  }, []);

  const open = useCallback(async (lid: string) => {
    setId(lid); setSel(""); setMsg(""); setNote(""); setHist([]);
    const b = await (await fetch(`/api/admin/labels?id=${lid}&part=layout`)).json();
    if (!b.layout) { setMsg("This label has no layout on disk."); return; }
    setMeta(b.meta); setLayout(b.layout); setArtSize(b.art); setFaces(b.faces || {});
    setSt({ lines: keyed(b.layout.lines), art: { ...b.layout.art } });
  }, []);

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
  const mapGroup = (key: string, f: (l: Line) => Line) => st && push({ ...st, lines: st.lines.map((l) => (l.key === key ? f(l) : l)) });
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

  /* moving: drag, or the arrow keys */
  const move = (dx: number, dy: number, from?: State) => {
    const base = from || st; if (!base || !sel) return;
    const next = sel === "art"
      ? { ...base, art: { ...base.art, x: base.art.x + dx, y: base.art.y + dy } }
      : { ...base, lines: base.lines.map((l) => (l.key === sel ? { ...l, x: l.x + dx, y: l.y + dy } : l)) };
    if (from) setSt(next); else push(next);
  };
  const toLabel = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!; const r = svg.getBoundingClientRect();
    return { x: (e.clientX - r.left) * ((layout?.W || 1) / r.width), y: (e.clientY - r.top) * ((layout?.H || 1) / r.height) };
  };
  const onDown = (key: string) => (e: React.PointerEvent) => {
    e.stopPropagation(); if (!st) return;
    setSel(key);
    const p = toLabel(e);
    drag.current = { x: p.x, y: p.y, from: st };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !st) return;
    const p = toLabel(e);
    const base = drag.current.from;
    const dx = p.x - drag.current.x, dy = p.y - drag.current.y;
    const next = sel === "art"
      ? { ...base, art: { ...base.art, x: base.art.x + dx, y: base.art.y + dy } }
      : { ...base, lines: base.lines.map((l) => (l.key === sel ? { ...l, x: l.x + dx, y: l.y + dy } : l)) };
    setSt(next);
  };
  const onUp = () => {
    if (drag.current) { const from = drag.current.from; drag.current = null; setHist((h) => [...h.slice(-60), from]); }
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!st || !sel || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
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

  /* the selected line's tools */
  const selLine = st && sel && sel !== "art" ? st.lines.find((l) => l.key === sel) : null;
  const resize = (dPt: number) => mapGroup(sel, (l) => ({ ...l, size: Math.max(5 * PT_PX, l.size + dPt * PT_PX) }));
  const toggleBold = () => {
    if (!selLine) return;
    const ws = (faces[selLine.family.replace(/\s+/g, "")] || [400, 700]).sort((a, b) => a - b);
    const heavy = ws[ws.length - 1], light = ws.find((w) => w >= 400) || ws[0];
    mapGroup(sel, (l) => ({ ...l, weight: l.weight >= 600 ? light : heavy }));
  };
  const align = (a: Line["anchor"]) => {
    if (!selLine || groupOf(sel).length > 1) return;            /* an arced name keeps its arc */
    const b = bboxOf(sel); if (!b) return;
    const edge = (an: Line["anchor"]) => (an === "start" ? b.x : an === "middle" ? b.x + b.w / 2 : b.x + b.w);
    mapGroup(sel, (l) => ({ ...l, anchor: a, x: edge(a) }));
  };
  const hide = () => mapGroup(sel, (l) => ({ ...l, hidden: !l.hidden }));
  const scaleArt = (k: number) => st && push({ ...st, art: { x: st.art.x + (st.art.w * (1 - k)) / 2, y: st.art.y + (st.art.h * (1 - k)) / 2, w: st.art.w * k, h: st.art.h * k } });

  const save = async () => {
    if (!st || !layout) return;
    setMsg("Saving…");
    const r = await fetch("/api/admin/layout-edits", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ labelId: id, note, before: { lines: keyed(layout.lines), art: layout.art }, after: { lines: st.lines, art: st.art } }),
    });
    const b = await r.json().catch(() => ({}));
    if (r.ok) { setMsg("Saved. Claude will read it with the others."); setSavedCount(b.count ?? null); }
    else setMsg("Could not save: " + (b.error || r.status));
  };

  const changed = !!(st && layout && JSON.stringify({ l: st.lines, a: st.art }) !== JSON.stringify({ l: keyed(layout.lines), a: layout.art }));
  const scaleView = layout ? VIEW_W / layout.W : 1;
  const M = 5 * PX_PER_MM;
  const selBox = st && sel ? (sel === "art" ? st.art : bboxOf(sel)) : null;

  return (
    <div>
      <style>{fontCss}</style>
      {/* the labels to pick from */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8 }}>
        {list.map((m) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={m.id} src={`/api/admin/labels?id=${m.id}`} alt={m.id} title={`${m.template} · ${m.artist || ""} · ${m.createdAt.slice(0, 16)}`}
            onClick={() => open(m.id)}
            style={{ height: 70, border: m.id === id ? "2px solid #B71318" : "1px solid #E3E3E1", cursor: "pointer", flex: "0 0 auto" }} />
        ))}
        {!list.length && <span style={ui.small}>No labels yet — make some in the wizard.</span>}
      </div>

      {st && layout && meta && (
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start", marginTop: 10 }}>
          <div>
            <svg ref={svgRef} viewBox={`0 0 ${layout.W} ${layout.H}`} width={VIEW_W} height={layout.H * scaleView}
              style={{ display: "block", border: "1px solid #E3E3E1", touchAction: "none", userSelect: "none", background: layout.ground }}
              onPointerMove={onMove} onPointerUp={onUp} onPointerDown={() => setSel("")}>
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
              {/* the 5 mm margin and the centre lines */}
              <rect x={M} y={M} width={layout.W - 2 * M} height={layout.H - 2 * M} fill="none" stroke="#00A0E0" strokeWidth={1.5} strokeDasharray="10 8" pointerEvents="none" />
              <line x1={layout.W / 2} y1={0} x2={layout.W / 2} y2={layout.H} stroke="#00A0E0" strokeWidth={1} strokeDasharray="4 10" opacity={0.6} pointerEvents="none" />
              <line x1={0} y1={layout.H / 2} x2={layout.W} y2={layout.H / 2} stroke="#00A0E0" strokeWidth={1} strokeDasharray="4 10" opacity={0.6} pointerEvents="none" />
              {selBox && <rect x={selBox.x - 4} y={selBox.y - 4} width={selBox.w + 8} height={selBox.h + 8} fill="none" stroke="#B71318" strokeWidth={2} pointerEvents="none" />}
            </svg>
            <div style={{ ...ui.small, marginTop: 6 }}>
              {meta.template} · {meta.widthMm} × {meta.heightMm} mm · {meta.artist || meta.style} · blue dashes = 5 mm margin and centre lines
            </div>
          </div>

          {/* the tools */}
          <div style={{ width: 280, display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
            <div style={{ fontWeight: 700 }}>
              {sel === "art" ? "Picture" : selLine ? `${selLine.key} — ${(selLine.size / PT_PX).toFixed(1)} pt, ${selLine.weight >= 600 ? "bold" : "regular"}` : "Click a line or the picture"}
            </div>
            {sel && <div style={ui.small}>Drag it, or use the arrow keys: 0.1 mm a press, 1 mm with Shift.</div>}
            {selLine && (<>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button style={ui.btn} onClick={() => resize(-0.5)}>size −</button>
                <button style={ui.btn} onClick={() => resize(0.5)}>size +</button>
                <button style={ui.btn} onClick={toggleBold}>bold on/off</button>
                <button style={ui.btn} onClick={hide}>{selLine.hidden ? "show" : "hide"}</button>
              </div>
              {groupOf(sel).length === 1 && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={ui.btn} onClick={() => align("start")}>align left</button>
                  <button style={ui.btn} onClick={() => align("middle")}>centre</button>
                  <button style={ui.btn} onClick={() => align("end")}>right</button>
                </div>
              )}
            </>)}
            {sel === "art" && (
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
            <button style={{ ...ui.btnDark, opacity: changed ? 1 : 0.4 }} disabled={!changed} onClick={save}>Save the edit</button>
            {msg && <div style={ui.small}>{msg}</div>}
            {savedCount !== null && <div style={ui.small}>{savedCount} edit{savedCount === 1 ? "" : "s"} saved so far.</div>}
          </div>
        </div>
      )}
      {msg && !st && <div style={ui.small}>{msg}</div>}
    </div>
  );
}
