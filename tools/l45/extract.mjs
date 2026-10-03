/* THE OWNER'S 45 LAYOUTS, READ OFF HIS .ai (final round, 2026-10-04).

     node tools/l45/extract.mjs ["<path to Layout_Options_New.ai>"]
       → src/lib/layout45/layouts.data.ts

   One layout per artboard, named by his PNG export ("Artboard 2 copy 14"
   → A14), so he can point at a layout by the number he sees. Every number
   is HIS, measured from the TRIM (his 2 mm bleed is outside): every text
   line's baseline, its side, its size, face role, weight, tracking, and
   for arcs the circle his letters sit on; the grey image zone and which
   sides of it bleed. A landscape artboard and its tall twin are paired;
   each line records which edge holds it (the edge whose distance the twin
   keeps). Fields are recognised by his placeholder words. */
import fs from "node:fs";
import path from "node:path";
import { geom } from "../pdf-geometry.mjs";

const PT = 25.4 / 72;
const mm = (v) => +(v * PT).toFixed(3);
const SRC = process.argv[2] || path.join(process.env.HOME, "Documents/PROJECTS/WAIN/NEW UI/Comments/New/Layout_Options_New.ai");
const PNG_DIR = path.dirname(SRC);

/* his PNG numbers in page order */
const pngNums = fs.readdirSync(PNG_DIR).map((f) => f.match(/^Artboard 2 copy (\d+)@3x\.png$/)).filter(Boolean).map((m) => +m[1]).sort((a, b) => a - b);

const FIELDS = [
  [/^GRAND VIN$/i, "producer"], [/CH.?TEAU\s+MARGAUX/i, "wineName"], [/^Margaux\s+AOC$/i, "appellation"],
  [/Grand\s+Cru\s+Class/i, "classification"], [/^20\d\d$/, "vintage"], [/Cabernet/i, "grape"],
  [/Bordeaux,\s*France/i, "regionCountry"], [/Vieilles\s+Vignes/i, "special"], [/Dry\s+Red\s+Wine/i, "wineTypeLine"], [/Alc\./i, "alcVol"],
];
function fieldsOf(s) {
  const t = s.trim();
  const whole = FIELDS.find(([re]) => re.test(t));
  /* "Bordeaux, France / Cabernet…" and "Vieilles Vignes / Dry Red Wine / Alc.: 13.5% / 750 ml." */
  const parts = t.split(/\s+\/\s+(?=[A-Z])/);
  if (parts.length > 1) {
    const out = [];
    for (const p of parts) { const h = FIELDS.find(([re]) => re.test(p.trim())); if (h && !out.includes(h[1])) out.push(h[1]); }
    if (out.length > 1) return out;
  }
  return whole ? [whole[1]] : [];
}

/* an arced word comes letter by letter, each turned; stitch them */
function stitch(texts) {
  const runs = [];
  for (const t of texts) {
    const last = runs[runs.length - 1];
    const near = last && Math.hypot(t.x - last.x2, t.y - last.y2) < Math.max(6, t.size * 0.8);
    if (last && near && Math.abs(last.size - t.size) < 0.05 && last.font === t.font && Math.abs(t.rot - last.rot) > 0.01 && Math.abs(t.rot) < 60) {
      last.s += t.s; last.x2 = t.x + t.w; last.y2 = t.y; last.pts.push([t.x, t.y]); last.glyphs.push(t); last.arc = true;
      continue;
    }
    runs.push({ ...t, x2: t.x + t.w, y2: t.y, pts: [[t.x, t.y]], glyphs: [t], arc: false });
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
const isAccent = (h) => { const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16); return r > 120 && r > g * 2 && r > b * 2; };

const pages = await geom(SRC);
if (pages.length !== pngNums.length) console.warn(`! ${pages.length} pages but ${pngNums.length} PNGs in ${PNG_DIR}`);

/* ---- read every page ---- */
const read = pages.map((pg, i) => {
  const tr = pg.trim, W = tr.w, H = tr.h;
  /* PDF y runs up; we keep PDF units here, converted at the end */
  const shapes = pg.rects.concat(pg.paths).filter((r) => r.w > 20 && r.h > 20 && r.fill !== "#ffffff" && !isAccent(r.fill) && !/^#(23|00)/.test(r.fill));
  const z = shapes.sort((a, b) => b.w * b.h - a.w * a.h)[0] || null;
  const lines = [];
  for (const t0 of stitch(pg.texts)) {
    const fields = fieldsOf(t0.s);
    if (!fields.length) continue;
    const vertical = Math.abs(Math.abs(t0.rot) - 90) < 5;
    /* the line's true width: Illustrator counts the tracking after the last letter too */
    const w = (t0.arc ? t0.x2 - t0.x : t0.w) - (t0.track || 0) * t0.size;
    lines.push({ ...t0, fields, vertical, wid: w, xs: t0.x - tr.x, ys: t0.y - tr.y });
  }
  return { i, num: pngNums[i] ?? i + 1, tr, W, H, z, lines };
});

/* ---- twins: a landscape page and a tall page carrying the same lines ---- */
const sig = (p) => p.lines.map((l) => `${l.fields.join("+")}|${l.size.toFixed(1)}|${l.vertical ? "v" : "h"}|${/Bold/.test(l.font) ? "b" : "r"}`).sort().join(";");
const twin = new Map();
const land = read.filter((p) => p.H < p.W), tall = read.filter((p) => p.H > p.W);
for (const l of land) { const t = tall.find((x) => !twin.has(x.i) && sig(x) === sig(l)); if (t) { twin.set(l.i, t.i); twin.set(t.i, l.i); } }
/* the vertical designs regroup their lines in the tall version (owner,
   2026-10-03: "where there is much space I moved some elements to the top
   and so narrowed the text block") — paired by their zone's side and
   bleed (A36↔A37, A38↔A39, A44↔A53, A54↔A55) */
for (const [a, b] of [[36, 37], [38, 39], [44, 53], [54, 55]]) {
  const pa = read.find((p) => p.num === a), pb = read.find((p) => p.num === b);
  if (pa && pb) { twin.set(pa.i, pb.i); twin.set(pb.i, pa.i); }
}

/* ---- the layouts ---- */
const E = 2;   /* pt: a zone edge at the page edge bleeds */
const out = read.map((p) => {
  const { W, H, tr } = p;
  const tw = twin.has(p.i) ? read[twin.get(p.i)] : null;
  let zone = null;
  if (p.z) {
    const z = p.z, x0 = z.x - tr.x, x1 = z.x + z.w - tr.x, yb = z.y - tr.y, yt = z.y + z.h - tr.y;
    const bl = { left: z.x <= E, right: z.x + z.w >= p.tr.x * 2 + W - E, top: z.y + z.h >= p.tr.y * 2 + H - E, bottom: z.y <= E };
    /* in trim coordinates, y from the TOP; a bleeding side runs to the bleed line (−2 mm / W+2 mm) */
    zone = { kind: z.curves ? "oval" : "rect", x: mm(x0), y: mm(H - yt), w: mm(x1 - x0), h: mm(yt - yb), bleeds: bl };
  }
  const zoneMidFromTop = zone ? zone.y + zone.h / 2 : mm(H) / 2;
  const texts = p.lines.map((l) => {
    const bold = /Bold|Black|Heavy|Semi.?bold|Demi/i.test(l.font), italic = /Italic|Oblique/i.test(l.font);
    const role = /Garamond/i.test(l.font) ? "body" : "title";
    const e = { fields: l.fields, sample: l.s.trim(), size: +l.size.toFixed(2), bold, italic, role, caps: l.s === l.s.toUpperCase() && /[A-Z]/.test(l.s), tracking: +(l.track || 0).toFixed(4), accent: isAccent(l.fill) };
    if (l.vertical) {
      /* reads upward (rot +90): its baseline is a column at x, its start at the bottom */
      e.rot = 90;
      e.colX = mm(l.xs);                       /* baseline x from the trim's left */
      e.start = mm(l.ys);                      /* lower end, from the trim's bottom */
      e.end = mm(H - (l.ys + l.wid));          /* upper end, from the trim's top */
      e.side = l.xs > W / 2 ? "right" : "left";
      /* along its length: held by the end whose distance the twin keeps; else the nearer end */
      let anchor = e.start <= e.end ? "bottom" : "top";
      if (tw) { const m = tw.lines.find((x) => x.vertical && x.fields.join("+") === l.fields.join("+")); if (m) { const s2 = mm(m.ys), e2 = mm(tw.H - (m.ys + m.wid)); anchor = Math.abs(s2 - e.start) <= Math.abs(e2 - e.end) ? "bottom" : "top"; } }
      e.anchor = anchor;
      return e;
    }
    e.rot = 0;
    const left = mm(l.xs), right = mm(W - (l.xs + l.wid)), mid = left + mm(l.wid) / 2;
    e.align = Math.abs(mid - mm(W) / 2) < 2.5 ? "center" : left < right ? "left" : "right";
    e.left = left; e.right = right;
    e.fromTop = mm(H - l.ys); e.fromBottom = mm(l.ys);
    if (l.arc) {
      const c = fitCircle(l.pts.map(([x, y]) => [x - tr.x, y - tr.y]));
      const ang = (x, y) => Math.atan2(y - c.cy, x - c.cx);
      const a0 = ang(l.pts[0][0] - tr.x, l.pts[0][1] - tr.y), a1 = ang(l.x2 - tr.x, l.y2 - tr.y);
      e.arc = { cx: mm(c.cx), cyFromTop: mm(H - c.cy), r: mm(c.r), up: c.cy < l.ys, sweep: +(Math.abs(a0 - a1) * 180 / Math.PI).toFixed(2) };
      e.fromTop = mm(H - Math.max(...l.pts.map((q) => q[1] - tr.y)));   /* the arc's highest baseline point */
      e.fromBottom = mm(Math.min(...l.pts.map((q) => q[1] - tr.y)));
    }
    let anchor;
    if (tw) {
      const m = tw.lines.find((x) => !x.vertical && x.fields.join("+") === l.fields.join("+") && Math.abs(x.size - l.size) < 0.1);
      if (m) anchor = Math.abs(mm(tw.H - m.ys) - e.fromTop) <= Math.abs(mm(m.ys) - e.fromBottom) ? "top" : "bottom";
    }
    if (!anchor) anchor = e.fromTop < zoneMidFromTop ? "top" : "bottom";
    e.anchor = anchor;
    return e;
  }).sort((a, b) => (a.fromTop ?? a.end) - (b.fromTop ?? b.end));
  return { id: `A${p.num}`, page: p.i + 1, twin: tw ? `A${tw.num}` : null, refW: mm(W), refH: mm(H), zone, texts };
});

const dest = path.join(process.cwd(), "src", "lib", "layout45", "layouts.data.ts");
fs.writeFileSync(dest, `/* GENERATED by tools/l45/extract.mjs from the owner's Layout_Options_New.ai — do not edit by hand.
   Ids are his PNG numbers (Artboard 2 copy 14 → A14). Millimetres from the TRIM's top-left
   (his 2 mm bleed is outside); sizes in points at the reference size. */
import type { Layout } from "./spec";

export const LAYOUTS: Layout[] = ${JSON.stringify(out, null, 1)};
`);
console.log(`${out.length} layouts → ${path.relative(process.cwd(), dest)}`);
for (const l of out) console.log(`  ${l.id.padEnd(4)} ${l.refW}×${Math.round(l.refH)} twin ${(l.twin || "—").padEnd(4)} zone ${l.zone ? `${l.zone.kind} ${l.zone.w.toFixed(0)}×${l.zone.h.toFixed(0)} bleeds ${Object.entries(l.zone.bleeds).filter(([, v]) => v).map(([k]) => k[0]).join("") || "-"}` : "none"}  ${l.texts.length} lines ${l.texts.map((t) => (t.anchor === "top" ? "↑" : "↓")).join("")}`);
