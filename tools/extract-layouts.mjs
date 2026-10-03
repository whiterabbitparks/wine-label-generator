/* THE FINAL-ROUND LAYOUTS, READ OFF THE OWNER'S .ai (2026-10-03, branch
   POPIKA_FINAL_ROUND — "a clean sheet; forget the old rules").

   Layout_Options_New.ai is PDF-compatible: 45 pages, each 104 × 84 or
   104 × 170 mm — a 100 × 80 (or 100 × 166) label with his 2 mm bleed.
   Every number here is HIS, measured from the trim's top-left.

     node tools/extract-layouts.mjs "<path to Layout_Options_New.ai>"
       → src/lib/layout2/layouts.data.ts

   What the pages say, and how it is read:
   - the grey (#e6e6e6) shape is the IMAGE ZONE — the most the picture may
     cover (a guide, never a mask); where it touches the page edge the
     picture bleeds there;
   - each landscape page has a TALL TWIN with the same type: the lines that
     keep their distance from the top are anchored top, those that keep
     their distance from the bottom are anchored bottom, and the zone
     takes the rest — so his own two sizes tell the anchors;
   - a line's horizontal hold: centred, or hugging the left / right safe
     margin (5 mm inside the trim);
   - arced words come glyph by glyph and are stitched back, with the
     circle they sit on. */
import fs from "node:fs";
import path from "node:path";
import { geom } from "./pdf-geometry.mjs";

const PT_MM = 25.4 / 72;
const mm = (v) => +(v * PT_MM).toFixed(3);
const MARGIN_PT = 5 / PT_MM;

const FIELDS = [
  [/^GRAND VIN$/i, "producer"],
  [/CH.?TEAU\s+MARGAUX/i, "wineName"],
  [/^Margaux\s+AOC$/i, "appellation"],
  [/Grand\s+Cru\s+Class/i, "classification"],
  [/^20\d\d$/, "vintage"],
  [/Cabernet/i, "grape"],
  [/Bordeaux,\s*France/i, "regionCountry"],
  [/Vieilles\s+Vignes/i, "special"],
  [/Dry\s+Red\s+Wine/i, "wineTypeLine"],
  [/Alc\./i, "alcVol"],
];
function fieldsOf(s) {
  const parts = s.split(/\s*\/\s*(?=[A-Z0-9])/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) { const hit = FIELDS.find(([re]) => re.test(p)); if (hit && !out.includes(hit[1])) out.push(hit[1]); }
  if (out.length) return out;
  const hit = FIELDS.find(([re]) => re.test(s.trim()));
  return hit ? [hit[1]] : [];
}
const isAccent = (hex) => { const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); return r > 120 && r > g * 2 && r > b * 2; };

/* glyphs of one arced word come one by one; stitch them and fit their circle */
function stitch(texts) {
  const runs = [];
  for (const t of texts) {
    const last = runs[runs.length - 1];
    const near = last && Math.hypot(t.x - last.x2, t.y - last.y2) < Math.max(6, t.size * 0.8);
    if (last && near && Math.abs(last.size - t.size) < 0.05 && last.font === t.font && Math.abs(t.rot - last.rot) > 0.01) {
      last.s += t.s; last.x2 = t.x + t.w; last.y2 = t.y; last.pts.push([t.x, t.y]); last.rots.push(t.rot); last.arc = true;
      continue;
    }
    runs.push({ ...t, x2: t.x + t.w, y2: t.y, pts: [[t.x, t.y]], rots: [t.rot], arc: false });
  }
  return runs;
}
function fitCircle(pts) {
  const n = pts.length; let sx = 0, sy = 0;
  for (const [x, y] of pts) { sx += x; sy += y; }
  const mx = sx / n, my = sy / n;
  let suu = 0, suv = 0, svv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const [x, y] of pts) { const u = x - mx, v = y - my; suu += u * u; suv += u * v; svv += v * v; suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u; }
  const d = 2 * (suu * svv - suv * suv); if (!d) return null;
  const uc = (svv * (suuu + suvv) - suv * (svvv + svuu)) / d, vc = (suu * (svvv + svuu) - suv * (suuu + suvv)) / d;
  return { cx: mx + uc, cy: my + vc, r: Math.sqrt(uc * uc + vc * vc + (suu + svv) / n) };
}

const src = process.argv[2] || path.join(process.env.HOME, "Documents/PROJECTS/WAIN/NEW UI/Layout_Options_New.ai");
const pages = await geom(src);

/* ---- one page → its raw reading (trim coordinates, points) ----------- */
function readPage(pg) {
  const tr = pg.trim, W = tr.w, H = tr.h;
  const sh = (o) => ({ ...o, x: o.x - tr.x, y: o.y - tr.y });
  const texts = pg.texts.map(sh);
  const shapes = pg.rects.concat(pg.paths).map(sh).filter((r) => r.fill === "#e6e6e6" && r.w > 20 && r.h > 20);
  const zone = shapes.sort((a, b) => b.w * b.h - a.w * a.h)[0] || null;
  const lines = [];
  for (const t of stitch(texts)) {
    const fields = fieldsOf(t.s);
    if (!fields.length) continue;
    const vertical = Math.abs(Math.abs(t.rot) - 90) < 5;
    const width = t.arc ? t.x2 - t.x : t.w;
    const mid = t.x + width / 2;
    /* his horizontal hold */
    let align = "left";
    if (!vertical) {
      if (Math.abs(mid - W / 2) < 3) align = "center";
      else if (Math.abs(W - (t.x + width) - MARGIN_PT) < 3) align = "right";
      else if (Math.abs(t.x - MARGIN_PT) < 3) align = "left";
      else align = mid < W / 2 ? "left" : "right";
    }
    const e = {
      fields, join: fields.length > 1 ? " / " : undefined,
      align,
      /* the measure that holds the line horizontally */
      left: t.x, right: W - (t.x + width), centre: mid,
      top: H - t.y, bottom: t.y,   /* baseline from each edge */
      size: +t.size.toFixed(2), bold: /Bold|Black|Heavy|Semi.?bold|Demi/i.test(t.font), accent: isAccent(t.fill),
      /* his artboards set the title lines in Times and the small lines in
         EB Garamond: two roles the label's own fonts take over */
      role: /Garamond/i.test(t.font) ? "body" : "title", italic: /Italic|Oblique/i.test(t.font),
      caps: t.s === t.s.toUpperCase() && /[A-Z]/.test(t.s), tracking: +(t.track || 0).toFixed(4),
      rot: vertical ? (t.rot > 0 ? 90 : -90) : 0, sample: t.s.trim(), width,
      arc: null,
    };
    if (vertical) {
      /* a vertical line: its anchor along the length is the end nearer
         an edge; its hold across is the column's x */
      e.vStart = t.y; e.vEnd = t.y + width;   /* rot 90 reads upward from its origin */
    }
    if (t.arc) {
      const c = fitCircle(t.pts);
      if (c) {
        const ang = (x, y) => Math.atan2(y - c.cy, x - c.cx);
        const sweep = Math.abs(ang(t.pts[0][0], t.pts[0][1]) - ang(t.x2, t.y2)) * 180 / Math.PI;
        e.arc = { cx: c.cx, cy: c.cy, r: c.r, up: c.cy < t.y, sweep: +sweep.toFixed(2) };
      }
    }
    lines.push(e);
  }
  return { W, H, zone, lines };
}

const read = pages.map(readPage);

/* ---- pairing: a landscape page and its tall twin carry the same lines */
const sig = (p) => p.lines.map((l) => `${l.fields.join("+")}|${l.align}|${l.size}|${l.rot}|${l.bold}`).sort().join(";");
const landscape = read.map((p, i) => ({ p, i })).filter((x) => x.p.H < x.p.W);
const tall = read.map((p, i) => ({ p, i })).filter((x) => x.p.H > x.p.W);
const twinOf = new Map();
for (const l of landscape) {
  const m = tall.find((t) => !twinOf.has(t.i) && sig(t.p) === sig(l.p));
  if (m) { twinOf.set(l.i, m.i); twinOf.set(m.i, l.i); }
}
/* the vertical designs regroup in their tall version (owner, 2026-10-03:
   "when there is a lot of space I moved some elements to the top and so
   narrowed the text block") — the signature cannot see that, so these
   pairs are set by hand (page numbers): bleeding zone left L23↔L24,
   inset zone left L27↔L36, bleeding zone right L25↔L26, inset zone right
   L37↔L38. L29, L32, L33 stay single. */
for (const [a, b] of [[23, 24], [27, 36], [25, 26], [37, 38]]) { twinOf.set(a - 1, b - 1); twinOf.set(b - 1, a - 1); }

/* ---- the layouts ---------------------------------------------------- */
const out = [];
for (let i = 0; i < read.length; i++) {
  const p = read[i], tw = twinOf.has(i) ? read[twinOf.get(i)] : null;
  const zoneTopEdge = p.zone ? p.H - (p.zone.y + p.zone.h) : p.H / 2;
  const zoneBotEdge = p.zone ? p.zone.y : p.H / 2;
  const texts = p.lines.map((l) => {
    /* the twin decides the anchor; without one, the edge the line is nearer than the zone's middle */
    let anchor;
    if (l.rot) {
      /* a vertical line is held by the edge its start is nearer */
      anchor = l.vStart < p.H - l.vEnd ? "bottom" : "top";
    } else if (tw) {
      const t = tw.lines.find((x) => x.fields.join("+") === l.fields.join("+") && x.align === l.align && Math.abs(x.size - l.size) < 0.05 && x.rot === l.rot);
      anchor = t ? (Math.abs(t.top - l.top) <= Math.abs(t.bottom - l.bottom) ? "top" : "bottom") : (l.top < l.bottom ? "top" : "bottom");
    } else {
      const zoneMid = p.zone ? (zoneTopEdge + (p.H - zoneBotEdge)) / 2 : p.H / 2;
      anchor = l.top < zoneMid ? "top" : "bottom";
    }
    const e = {
      fields: l.fields, join: l.join, align: l.align, anchor,
      fromTop: mm(l.top), fromBottom: mm(l.bottom),
      left: mm(l.left), right: mm(l.right), centre: mm(l.centre),
      size: l.size, bold: l.bold, role: l.role, italic: l.italic, accent: l.accent, caps: l.caps, tracking: l.tracking, rot: l.rot,
      sample: l.sample,
    };
    if (l.rot) { e.vStart = mm(l.vStart); e.vEndFromTop = mm(p.H - l.vEnd); }
    if (l.arc) e.arc = { cx: mm(l.arc.cx), cyFromTop: mm(p.H - l.arc.cy), r: mm(l.arc.r), up: l.arc.up, sweep: l.arc.sweep };
    return e;
  }).sort((a, b) => a.fromTop - b.fromTop);
  const z = p.zone;
  const E = 1.5;   /* touching the page edge = bleeding (the zone reaches 2 mm past the trim) */
  const zone = z ? {
    kind: z.curves ? "oval" : "rect",
    x: mm(z.x), y: mm(p.H - z.y - z.h), w: mm(z.w), h: mm(z.h),
    bleeds: { left: z.x < -E / PT_MM + 1, right: z.x + z.w > p.W + E / PT_MM - 1, top: p.H - (z.y + z.h) < -E / PT_MM + 1, bottom: z.y < -E / PT_MM + 1 },
  } : null;
  out.push({ id: `L${String(i + 1).padStart(2, "0")}`, page: i + 1, twin: twinOf.has(i) ? `L${String(twinOf.get(i) + 1).padStart(2, "0")}` : null, refW: mm(p.W), refH: mm(p.H), zone, texts });
}

const header = `/* GENERATED by tools/extract-layouts.mjs from the owner's
   Layout_Options_New.ai (2026-10-03) — do not edit by hand. Millimetres
   from the TRIM's top-left (his 2 mm bleed is outside); type sizes in
   points at the reference size. */\n\nimport type { Layout2 } from "./spec";\n\n`;
const dest = path.join(process.cwd(), "src", "lib", "layout2", "layouts.data.ts");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, header + `export const LAYOUTS: Layout2[] = ${JSON.stringify(out, null, 1)};\n`);
console.log(`${out.length} layouts → ${path.relative(process.cwd(), dest)}`);
for (const t of out) {
  const an = t.texts.map((x) => x.anchor[0]).join("");
  console.log(`  ${t.id} ${t.refW}x${t.refH} twin ${(t.twin || "-").padEnd(4)} zone ${t.zone ? `${t.zone.kind} ${t.zone.x},${t.zone.y} ${t.zone.w}x${t.zone.h} bleeds ${Object.entries(t.zone.bleeds).filter(([, v]) => v).map(([k]) => k[0]).join("") || "-"}` : "none"}  ${t.texts.length} lines [${an}]`);
}
