/* WHAT DID HE CHANGE? (owner, 2026-09-23). Reads his edited copy of the
   review sheet (tools/review-pdf.mts) and compares it, label by label and
   line by line, with what the engine made (data/eval/layout-review-
   manifest.json):

     · a line moved     — by how much, across and down, in mm
     · a line resized   — old and new size in pt
     · a line re-weighted, re-coloured, added or deleted
     · the picture's zone moved or resized
     · every BLUE note, attached to the label it sits on or beside

     npx tsx tools/review-diff.mts "<his edited pdf>" [manifest.json]
*/
import fs from "node:fs";
// @ts-expect-error — plain ESM helper
import { geom } from "./pdf-geometry.mjs";

const PT = 72 / 25.4;
const file = process.argv[2];
if (!file) { console.error("usage: review-diff.mts <edited.pdf> [manifest.json]"); process.exit(2); }
const man = JSON.parse(fs.readFileSync(process.argv[3] || "data/eval/layout-review-manifest.json", "utf8")) as {
  page: { w: number; h: number };
  cases: { case: string; frame: { x: number; y: number; w: number; h: number }; art: { kind: string; x: number; y: number; w: number; h: number }; lines: { text: string; x: number; y: number; pt: number; family: string; weight: number; anchor: string; rot: number; colour: string }[] }[];
};
type GText = { s: string; x: number; y: number; size: number; rot: number; font: string; fill: string; w: number };
type GPath = { x: number; y: number; w: number; h: number; curves: number; fill: string; stroke: string; op: string };
const page = (await geom(file))[0] as { w: number; h: number; texts: GText[]; paths: GPath[]; rects: GPath[] };
const Hmm = page.h / PT;
/* page geometry in mm from the TOP-LEFT, like the manifest */
const mmBox = (p: { x: number; y: number; w: number; h: number }) => ({ x: p.x / PT, y: Hmm - (p.y + p.h) / PT, w: p.w / PT, h: p.h / PT });
const isBlue = (hex: string) => { const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255; return b > 150 && b > r + 60 && b > g + 30; };
const isGrey = (hex: string) => { const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255; return Math.abs(r - g) < 8 && Math.abs(g - b) < 8 && r > 200 && r < 245; };

/* ---- his label frames: the white boxes with a hairline edge ---------- */
const shapes = [...page.paths, ...page.rects].map((p) => ({ ...p, mm: mmBox(p) }));
const frames = shapes.filter((p) => /^#f[a-f0-9]f[a-f0-9]f[a-f0-9]$/i.test(p.fill) && p.mm.w > 30 && p.mm.h > 30);
const used = new Set<number>();
const lines: string[] = [];
const say = (s = "") => lines.push(s);

/* a word he set as live text: its anchor point in page mm, like the engine's */
const anchorOf = (t: GText, anchor: string) => {
  /* a PDF adds the letter-spacing after EVERY glyph, the last one too;
     the word's visible width does not include that last step */
  const x0 = t.x / PT, y0 = Hmm - t.y / PT, w = (t.w - (t as GText & { track?: number }).track! * t.size) / PT, rad = (t.rot * Math.PI) / 180;
  const k = anchor === "middle" ? 0.5 : anchor === "end" ? 1 : 0;
  return { x: x0 + Math.cos(rad) * w * k, y: y0 - Math.sin(rad) * w * k };
};
const weightOf = (font: string) => (/Black|Heavy|ExtraBold/i.test(font) ? "extra-bold" : /Bold|Semi|Demi/i.test(font) ? "bold" : /Medium/i.test(font) ? "medium" : "regular");
const weightName = (w: number) => (w >= 800 ? "extra-bold" : w >= 600 ? "bold" : w >= 500 ? "medium" : "regular");

let changes = 0;
const blue = page.texts.filter((t) => isBlue(t.fill));
const claimedNotes = new Set<GText>();
for (const c of man.cases) {
  /* the frame he left nearest where this label was */
  let best = -1, bd = Infinity;
  frames.forEach((f, i) => { if (used.has(i)) return; const d = Math.hypot(f.mm.x - c.frame.x, f.mm.y - c.frame.y) + Math.abs(f.mm.w - c.frame.w) * 2 + Math.abs(f.mm.h - c.frame.h) * 2; if (d < bd) { bd = d; best = i; } });
  const out: string[] = [];
  if (best < 0 || bd > 60) { say(`\n■ ${c.case}: label not found in his file (deleted?)`); changes++; continue; }
  used.add(best);
  const F = frames[best].mm;
  if (Math.abs(F.w - c.frame.w) > 0.3 || Math.abs(F.h - c.frame.h) > 0.3) out.push(`label size changed: ${c.frame.w}×${c.frame.h} → ${F.w.toFixed(1)}×${F.h.toFixed(1)} mm`);
  const inF = (x: number, y: number) => x >= F.x - 2 && x <= F.x + F.w + 2 && y >= F.y - 2 && y <= F.y + F.h + 2;

  /* the type he left inside this label (not blue) */
  const his = page.texts.filter((t) => !isBlue(t.fill) && inF(t.x / PT, Hmm - t.y / PT));
  const taken = new Set<GText>();
  for (const l of c.lines) {
    const want = { x: F.x + l.x, y: F.y + l.y };
    const cands = his.filter((t) => !taken.has(t) && t.s.trim() === l.text.trim());
    if (!cands.length) { out.push(`✗ "${l.text}" — deleted (or its words changed)`); continue; }
    const t = cands.reduce((m, q) => { const a = anchorOf(q, l.anchor), b = anchorOf(m, l.anchor); return Math.hypot(a.x - want.x, a.y - want.y) < Math.hypot(b.x - want.x, b.y - want.y) ? q : m; });
    taken.add(t);
    const a = anchorOf(t, l.anchor);
    const dx = a.x - want.x, dy = a.y - want.y;
    const dPt = t.size - l.pt;
    const wOld = weightName(l.weight), wNew = weightOf(t.font);
    const bits: string[] = [];
    if (Math.hypot(dx, dy) > 0.25) bits.push(`moved ${dx >= 0 ? "right" : "left"} ${Math.abs(dx).toFixed(1)} mm, ${dy >= 0 ? "down" : "up"} ${Math.abs(dy).toFixed(1)} mm`);
    if (Math.abs(dPt) > 0.2) bits.push(`size ${l.pt.toFixed(1)} → ${t.size.toFixed(1)} pt`);
    if (wOld !== wNew) bits.push(`weight ${wOld} → ${wNew} (${t.font})`);
    if (t.fill.toLowerCase() !== l.colour.toLowerCase() && !(isGrey(t.fill) && isGrey(l.colour))) bits.push(`colour ${l.colour} → ${t.fill}`);
    if (Math.abs(t.rot - -(l.rot || 0)) > 1 && [...l.text].length > 1) bits.push(`turned ${(-l.rot).toFixed(0)}° → ${t.rot.toFixed(0)}°`);
    if (bits.length) out.push(`"${l.text}": ${bits.join("; ")}  [now at ${(a.x - F.x).toFixed(1)}, ${(a.y - F.y).toFixed(1)} mm from the label's top-left]`);
  }
  for (const t of his.filter((q) => !taken.has(q) && q.s.trim())) out.push(`+ new text "${t.s}" ${t.size.toFixed(1)} pt ${weightOf(t.font)} at ${(t.x / PT - F.x).toFixed(1)}, ${(Hmm - t.y / PT - F.y).toFixed(1)} mm`);

  /* the picture's zone */
  const zones = shapes.filter((p) => isGrey(p.fill) && p.mm.w > 5 && p.mm.h > 5 && inF(p.mm.x + p.mm.w / 2, p.mm.y + p.mm.h / 2));
  const want = c.art;
  if (!zones.length) out.push(`✗ picture zone deleted`);
  else {
    const z = zones.reduce((m, q) => (q.mm.w * q.mm.h > m.mm.w * m.mm.h ? q : m)).mm;
    const r = { x: z.x - F.x, y: z.y - F.y, w: z.w, h: z.h };
    const d = Math.max(Math.abs(r.x - want.x), Math.abs(r.y - want.y), Math.abs(r.w - want.w), Math.abs(r.h - want.h));
    if (d > 0.3) out.push(`picture zone: x ${want.x.toFixed(1)}→${r.x.toFixed(1)}, y ${want.y.toFixed(1)}→${r.y.toFixed(1)}, w ${want.w.toFixed(1)}→${r.w.toFixed(1)}, h ${want.h.toFixed(1)}→${r.h.toFixed(1)} mm`);
  }

  /* his notes: blue text on or beside this label (not its own caption) */
  const notes = blue.filter((t) => {
    const x = t.x / PT, y = Hmm - t.y / PT;
    if (/^T\d\d · \d+ × \d+ mm/.test(t.s)) return false;
    return x >= F.x - 10 && x <= F.x + F.w + 25 && y >= F.y - 8 && y <= F.y + F.h + 25;
  });
  notes.forEach((n) => claimedNotes.add(n));
  for (const n of notes) out.push(`✎ NOTE: "${n.s}"`);

  if (out.length) { changes += out.length; say(`\n■ ${c.case}`); for (const o of out) say("   " + o); }
}
const loose = blue.filter((t) => !claimedNotes.has(t) && !/^T\d\d · /.test(t.s) && !/^LAYOUT REVIEW|^Top: the twelve/.test(t.s));
if (loose.length) { say("\n■ notes not beside any one label"); for (const n of loose) say(`   ✎ "${n.s}"`); changes += loose.length; }
console.log(changes ? lines.join("\n") : "no changes — his file matches the engine's sheet");
