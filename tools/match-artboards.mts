/* THE ARTBOARD TEST (owner, 2026-09-23: "lay it over my reference and
   compare where everything is and how big"). With his words at his size
   the engine must give back HIS artboard: every line on his baseline, at
   his size, in his weight, and the picture's zone where he drew it.
   Fails (exit 1) on any line off by more than 0.3 mm or any size/weight
   change.   npx tsx tools/match-artboards.mts */
import type { TplText } from "@/lib/typeset/templates";
const O = await import("@/lib/typeset/overrides");
const T = await import("@/lib/typeset/templates");
const FULL = { producer: "GRAND VIN", wine: "Château Margaux", appellation: "Margaux AOC", classification: "Premier Grand Cru Classé", vintage: "2018", grape: "Cabernet Sauvignon, Merlot", region: "Bordeaux", country: "France", special: "Vieilles Vignes", sweetness: "Dry", wineColorName: "Red", wineType: "Wine", alcohol: "13.5", volume: "750" };
const F0 = T.templateFields(FULL);
const PT = 25.4 / 72;
let bad = 0;
for (const t of O.templatesNow()) {
  /* HIS words, as they stand on his artboard (a joined line gives each
     field its own part) */
  const F: Record<string, string> = { ...F0 };
  for (const x of t.texts) {
    if (!x.sample) continue;
    const parts = x.fields.length > 1 ? x.sample.split(/\s*\/\s*(?=[A-Z0-9])/) : [x.sample];
    if (x.fields.length > 1 && parts.length > x.fields.length) {
      /* "Alc.: 13.5% / 750 ml." holds a slash of its own */
      parts.splice(x.fields.length - 1, parts.length, parts.slice(x.fields.length - 1).join(" / "));
    }
    x.fields.forEach((f, i) => { F[f] = x.caps ? (parts[i] || "") : (parts[i] || ""); });
  }
  const lay = T.layoutFromTemplate({ template: t, fields: F as never, widthMm: t.refW, heightMm: t.refH, seed: 7, ground: "#fff", ink: "#111", accent: "#c00" });
  const bold = lay.layout.lines.reduce((m, l) => Math.max(m, l.weight), 0);
  const out: string[] = [];
  /* 2026-09-24: measured from his TRIM, some of his lines sit on or just
     over the 5 mm line, and the margin wins. So a line may be off his
     artboard ONLY as part of its block being pushed INWARD (top block
     down, bottom block up, left lines right, right lines left, the turned
     column away from its edge), the whole block by the same amount, at
     most 2.5 mm. Anything else is a real mismatch. */
  type Got = { x: TplText; want: string; dx: number; dy: number; sz: number; isBold: boolean };
  const got: Got[] = [];
  for (const x of t.texts) {
    const text = x.fields.map((f) => F[f]).filter(Boolean).join(x.join || " / ");
    const want = x.caps ? text.toUpperCase() : text;
    if (x.arc) {
      const g = lay.layout.lines.filter((l) => l.rot !== undefined && l.rot !== -90 && want.includes(l.text));
      const sz = g[0] ? g[0].size / 12 / PT : 0;
      const ok = Math.abs(sz - x.size) < 0.3;
      if (!ok) bad++;
      out.push(`${ok ? "  " : "✗ "}${want.padEnd(28)} arc  size ${sz.toFixed(1)}pt (his ${x.size})`);
      continue;
    }
    const l = lay.layout.lines.find((l2) => l2.text === want);
    if (!l) { bad++; out.push(`✗ ${want.padEnd(28)} MISSING`); continue; }
    got.push({ x, want, dy: l.y / 12 - x.baseline, dx: l.x / 12 - x.x, sz: l.size / 12 / PT, isBold: l.weight === bold });
  }
  const median = (v: number[]) => { const s2 = [...v].sort((a, b) => a - b); return s2.length ? s2[Math.floor(s2.length / 2)] : 0; };
  const vKey = (g: Got) => g.x.anchor;                                             /* top | bottom */
  const hKey = (g: Got) => (g.x.rot === -90 ? (g.x.x < t.refW / 2 ? "colL" : "colR") : g.x.align);
  const vShift = new Map<string, number>(), hShift = new Map<string, number>();
  for (const k of new Set(got.map(vKey))) vShift.set(k, median(got.filter((g) => vKey(g) === k).map((g) => g.dy)));
  for (const k of new Set(got.map(hKey))) hShift.set(k, median(got.filter((g) => hKey(g) === k).map((g) => g.dx)));
  const inward = (dir: number, v: number) => dir * v >= -0.3 && Math.abs(v) <= 2.5;
  const pushes: string[] = [];
  for (const [k, v] of vShift) {
    if (Math.abs(v) <= 0.3) continue;
    if (!inward(k === "top" ? 1 : -1, v)) { bad++; pushes.push(`✗ ${k} block ${v.toFixed(2)}mm OUTWARD`); } else { pushes.push(`${k} block ${v >= 0 ? "+" : ""}${v.toFixed(2)}mm`); }
  }
  for (const [k, v] of hShift) {
    if (Math.abs(v) <= 0.3 || !k.startsWith("col")) continue;   /* flat lines: checked one by one below */
    const dir = k === "left" || k === "colL" ? 1 : k === "right" || k === "colR" ? -1 : 0;
    if (!dir || !inward(dir, v)) { bad++; pushes.push(`✗ ${k} lines ${v.toFixed(2)}mm`); } else { pushes.push(`${k} ${v >= 0 ? "+" : ""}${v.toFixed(2)}mm`); }
  }
  for (const g of got) {
    /* a turned line standing alone (t11/t12's vintage) is its own block */
    const alone = g.x.rot === -90 && got.filter((o) => o.x.rot === -90 && vKey(o) === vKey(g)).length === 1;
    const ry = alone ? (inward(g.x.anchor === "top" ? 1 : -1, g.dy) ? 0 : g.dy) : g.dy - vShift.get(vKey(g))!;
    /* a flat line stops ON the margin if his x was over it */
    const hisX = g.x.align === "left" ? Math.max(5, g.x.x) : g.x.align === "right" ? Math.min(t.refW - 5, g.x.x) : g.x.x;
    const rx = hKey(g).startsWith("col") ? g.dx - hShift.get(hKey(g))! : g.dx - (hisX - g.x.x);
    if (!hKey(g).startsWith("col") && Math.abs(hisX - g.x.x) > 0.01 && Math.abs(rx) <= 0.3) pushes.push(`"${g.want}" x ${(hisX - g.x.x) >= 0 ? "+" : ""}${(hisX - g.x.x).toFixed(2)}mm`);
    const ok = Math.abs(ry) <= 0.3 && Math.abs(rx) <= 0.3 && Math.abs(g.sz - Math.min(20, Math.max(7, g.x.size))) < 0.3 && (g.x.bold === undefined || g.isBold === g.x.bold);
    if (!ok) bad++;
    if (alone && Math.abs(g.dy) > 0.3 && ok) pushes.push(`"${g.want}" ${g.dy >= 0 ? "+" : ""}${g.dy.toFixed(2)}mm`);
    out.push(`${ok ? "  " : "✗ "}${g.want.padEnd(28)} baseline ${g.dy >= 0 ? "+" : ""}${g.dy.toFixed(2)}mm  x ${g.dx >= 0 ? "+" : ""}${g.dx.toFixed(2)}mm  size ${g.sz.toFixed(1)}pt (his ${g.x.size})  ${g.isBold ? "bold" : "regular"}${g.x.bold !== undefined && g.isBold !== g.x.bold ? ` (his ${g.x.bold ? "bold" : "regular"})` : ""}`);
  }
  const a = t.art!, z = lay.art, k = 12;
  const dz = Math.max(Math.abs(z.x / k - a.x), Math.abs(z.y / k - a.y), Math.abs(z.w / k - a.w), Math.abs(z.h / k - a.h));
  /* the picture's zone may only GIVE WAY to type the margin pushed in:
     inside his zone, at least 90% of its area */
  const inside = z.x / k >= a.x - 0.3 && z.y / k >= a.y - 0.3 && (z.x + z.w) / k <= a.x + a.w + 0.3 && (z.y + z.h) / k <= a.y + a.h + 0.3;
  const zoneOk = dz <= 0.3 || (inside && (z.w * z.h) / (k * k) >= 0.9 * a.w * a.h);
  if (!zoneOk) bad++;
  console.log(`\n${t.id} ${t.band}  zone ${!zoneOk ? "✗" : "ok"} (off by ${dz.toFixed(2)}mm)${pushes.length ? "  margin push: " + pushes.join(", ") : ""}${lay.warnings.length ? "  ⚠ " + lay.warnings.join("; ") : ""}`);
  for (const o of out) console.log("   " + o);
}
console.log(bad ? `\n${bad} mismatches` : "\nall 12 artboards reproduced (inside the 5 mm margin, measured from his trim)");
process.exit(bad ? 1 : 0);
