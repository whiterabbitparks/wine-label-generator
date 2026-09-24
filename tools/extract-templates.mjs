/* THE OWNER'S LAYOUT TEMPLATES, READ OFF HIS PDF (2026-09-22).

   He designs the templates in Illustrator and hands over one PDF, one
   artboard per template. This turns that file into
   src/lib/typeset/templates.data.ts — so every number in the engine is
   HIS number, measured, never typed by hand. When he re-draws a
   template, re-run this and the engine follows:

     node tools/extract-templates.mjs "<path to Layout_Options.pdf>"

   What it reads per template: the picture's box (the one filled shape
   that is neither the paper nor the ink), and every text run with its
   baseline, size, face, colour, tracking, rotation and — for the arced
   ones — the circle his letters sit on.

   Fields are recognised by the PLACEHOLDER STRINGS, which are the same
   ones the site's own form shows ("E.g. Château Margaux"), so he never
   has to label anything. */

import fs from "node:fs";
import path from "node:path";
import { geom } from "./pdf-geometry.mjs";

const PT_MM = 25.4 / 72;
const mm = (v) => +(v * PT_MM).toFixed(3);

/* the placeholder the owner types → the field the customer fills */
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
/* a line may carry several fields joined by a slash (templates 11/12) */
function fieldsOf(s) {
  const parts = s.split(/\s*\/\s*(?=[A-Z])/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const hit = FIELDS.find(([re]) => re.test(p));
    if (hit && !out.includes(hit[1])) out.push(hit[1]);
  }
  if (out.length) return out;
  const hit = FIELDS.find(([re]) => re.test(s.trim()));
  return hit ? [hit[1]] : [];
}

/* the wine name is the hero; producer, appellation and vintage carry the
   label; everything else is small print */
const ROLE = { wineName: "hero", producer: "secondary", appellation: "secondary", vintage: "secondary" };

/* his two reds are one accent */
const isAccent = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return r > 120 && r > g * 2 && r > b * 2;
};

/* glyphs of one arced word come through one by one, each with its own
   rotation; stitch them back into a word and fit the circle they sit on */
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
/* least-squares circle through the glyph origins */
function fitCircle(pts) {
  const n = pts.length;
  let sx = 0, sy = 0;
  for (const [x, y] of pts) { sx += x; sy += y; }
  const mx = sx / n, my = sy / n;
  let suu = 0, suv = 0, svv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const [x, y] of pts) {
    const u = x - mx, v = y - my;
    suu += u * u; suv += u * v; svv += v * v;
    suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u;
  }
  const d = 2 * (suu * svv - suv * suv);
  if (!d) return null;
  const uc = (svv * (suuu + suvv) - suv * (svvv + svuu)) / d;
  const vc = (suu * (svvv + svuu) - suv * (suuu + suvv)) / d;
  const cx = mx + uc, cy = my + vc;
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
  return { cx, cy, r };
}

const src = process.argv[2] || path.join(process.env.HOME, "Documents/PROJECTS/WAIN/NEW UI/Comments/Achive/Layout_Options.pdf");
const pages = await geom(src);

/* the owner's three columns, classical → contemporary → free. Centred
   serif stacks are classical, the two-column ones contemporary, and the
   arced and vertical ones carry the free column (2026-09-22: "first
   option classical… second contemporary… third more free"). */
const BAND = { 1: "classical", 2: "classical", 3: "classical", 4: "classical", 5: "free",
               6: "contemporary", 7: "contemporary", 8: "contemporary", 9: "contemporary", 10: "contemporary",
               11: "free", 12: "free" };

const out = [];
for (let i = 0; i < pages.length; i++) {
  /* 2026-09-24 (owner: "you used the label with the bleed included"):
     his artboards are 104 × 84 with a 2 mm bleed round a 100 × 80 TRIM
     (the PDF's TrimBox). Everything is measured from the trim — the
     engine's label is the trim, its 5 mm margin is his 5 mm margin. A
     picture that runs into the bleed is cut back to the trim edge (it
     is marked as bleeding there, and the engine bleeds it again). */
  const pg = pages[i], tr = pg.trim, n = i + 1, W = tr.w, H = tr.h;
  const sh = (o) => ({ ...o, x: o.x - tr.x, y: o.y - tr.y });
  const clip = (r) => { const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y), x1 = Math.min(W, r.x + r.w), y1 = Math.min(H, r.y + r.h); return { ...r, x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
  const p = { ...pg, texts: pg.texts.map(sh), rects: pg.rects.map((r) => clip(sh(r))), paths: pg.paths.map((r) => clip(sh(r))) };
  const shapes = p.rects.concat(p.paths).filter((r) => r.fill !== "#ffffff" && !isAccent(r.fill) && r.fill !== "#231f20" && r.w > 20 && r.h > 20);
  const art = shapes.sort((a, b) => b.w * b.h - a.w * a.h)[0];
  const texts = [];
  for (const t of stitch(p.texts)) {
    const fields = fieldsOf(t.s);
    if (!fields.length) continue;
    const vertical = Math.abs(Math.abs(t.rot) - 90) < 5;
    const width = t.arc ? t.x2 - t.x : t.w;
    const mid = t.x + width / 2;
    let align = "left";
    if (!vertical) {
      if (Math.abs(mid - W / 2) < 3) align = "center";
      else if (Math.abs(W - (t.x + t.w) - 14.17) < 3) align = "right";   /* 5 mm from the trim */
    }
    /* his rule: the type keeps its distance from the nearer edge and the
       picture absorbs the rest, so every line records which edge holds it */
    const topGap = H - t.y, botGap = t.y;
    const anchor = topGap <= botGap ? "top" : "bottom";
    const e = {
      fields, join: fields.length > 1 ? " / " : undefined,
      role: ROLE[fields[0]] || "small",
      x: mm(align === "center" ? W / 2 : align === "right" ? t.x + t.w : t.x),
      baseline: mm(H - t.y),
      fromBottom: mm(t.y),
      anchor, align, size: +t.size.toFixed(2),
      caps: t.s === t.s.toUpperCase() && /[A-Z]/.test(t.s),
      accent: isAccent(t.fill),
      tracking: +t.track.toFixed(4) || 0,
      rot: vertical ? -90 : 0,
      serif: /Times|Garamond/i.test(t.font),
      /* his weight, read off the face he set it in (2026-09-23: "one
         family, different weights, as on my artboards") */
      bold: /Bold|Black|Heavy|Semi.?bold|Demi/i.test(t.font),
      /* his own words on the artboard — the test lays these and must get
         his artboard back */
      sample: t.s.trim(),
    };
    if (t.arc) {
      const c = fitCircle(t.pts);
      /* the angle his word spans on the circle, first letter's origin to
         the last letter's end — his letter-spacing lives in where each
         glyph sits, not in a tracking value */
      const ang = (x, y) => Math.atan2(y - c.cy, x - c.cx);
      const sweep = c ? Math.abs(ang(t.pts[0][0], t.pts[0][1]) - ang(t.x2, t.y2)) * 180 / Math.PI : 0;
      if (c) e.arc = { cx: mm(c.cx), cy: mm(H - c.cy), r: mm(c.r), up: c.cy < t.y, sweep: +sweep.toFixed(2) };
    }
    texts.push(e);
  }
  texts.sort((a, b) => a.baseline - b.baseline);
  out.push({
    id: `t${String(n).padStart(2, "0")}`,
    band: BAND[n],
    refW: mm(W), refH: mm(H),
    art: art ? { kind: art.curves ? "oval" : "rect", x: mm(art.x), y: mm(H - art.y - art.h), w: mm(art.w), h: mm(art.h) } : null,
    texts,
  });
}

const header = `/* GENERATED by tools/extract-templates.mjs from the owner's
   Layout_Options.pdf — do not edit by hand. Re-run the tool when he
   re-draws a template. Millimetres, measured from the TRIM's top-left
   (his 2 mm bleed is outside);
   sizes in points at the reference size. */\n\nimport type { Template } from "./templates";\n\n`;
const body = `export const TEMPLATES: Template[] = ${JSON.stringify(out, null, 2)};\n`;
const dest = path.join(process.cwd(), "src", "lib", "typeset", "templates.data.ts");
fs.writeFileSync(dest, header + body);
console.log(`${out.length} templates → ${path.relative(process.cwd(), dest)}`);
for (const t of out) console.log(`  ${t.id} ${t.band.padEnd(13)} art ${t.art ? `${t.art.kind} ${t.art.w}x${t.art.h}` : "none"}  ${t.texts.length} lines`);
