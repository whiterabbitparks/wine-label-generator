/* THE ARTBOARD TEST (owner, 2026-09-23: "lay it over my reference and
   compare where everything is and how big"). With his words at his size
   the engine must give back HIS artboard: every line on his baseline, at
   his size, in his weight, and the picture's zone where he drew it.
   Fails (exit 1) on any line off by more than 0.3 mm or any size/weight
   change.   npx tsx tools/match-artboards.mts */
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
    const dy = l.y / 12 - x.baseline, dx = l.x / 12 - x.x, sz = l.size / 12 / PT, isBold = l.weight === bold;
    const ok = Math.abs(dy) <= 0.3 && Math.abs(dx) <= 0.3 && Math.abs(sz - Math.min(20, Math.max(7, x.size))) < 0.3 && (x.bold === undefined || isBold === x.bold);
    if (!ok) bad++;
    out.push(`${ok ? "  " : "✗ "}${want.padEnd(28)} baseline ${dy >= 0 ? "+" : ""}${dy.toFixed(2)}mm  x ${dx >= 0 ? "+" : ""}${dx.toFixed(2)}mm  size ${sz.toFixed(1)}pt (his ${x.size})  ${isBold ? "bold" : "regular"}${x.bold !== undefined && isBold !== x.bold ? ` (his ${x.bold ? "bold" : "regular"})` : ""}`);
  }
  const a = t.art!, z = lay.art, k = 12;
  const dz = Math.max(Math.abs(z.x / k - a.x), Math.abs(z.y / k - a.y), Math.abs(z.w / k - a.w), Math.abs(z.h / k - a.h));
  if (dz > 0.3) bad++;
  console.log(`\n${t.id} ${t.band}  zone ${dz > 0.3 ? "✗" : "ok"} (off by ${dz.toFixed(2)}mm)${lay.warnings.length ? "  ⚠ " + lay.warnings.join("; ") : ""}`);
  for (const o of out) console.log("   " + o);
}
console.log(bad ? `\n${bad} mismatches` : "\nall 12 artboards reproduced");
process.exit(bad ? 1 : 0);
