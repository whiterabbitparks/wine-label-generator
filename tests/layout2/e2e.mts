/* the site's path with the final-round engine: paint (small) → store →
   details-only re-set → another layout → PDF */
import fs from "node:fs"; import path from "node:path";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
const { paintHybridLabel, relayoutLabel } = await import("../../src/lib/label/hybrid");
const { saveLabel, readLabel } = await import("../../src/lib/label/store");
const { labelPdf } = await import("../../src/lib/label/pdf");
const OUT = path.join(process.env.HOME!, "Desktop", "8K-final-round", "e2e"); fs.mkdirSync(OUT, { recursive: true });
const data = { producer: "Giorgi's Marani", wine: "Korra", vintage: "2023", grape: "Rkatsiteli", region: "Kakheti", country: "Georgia", sweetness: "Dry", wineColorName: "White", wineType: "Pet-Nat", alcohol: "12", volume: "750" };
const b64 = (u: string) => Buffer.from(u.slice(u.indexOf(",") + 1), "base64");
const t0 = Date.now();
const out = await paintHybridLabel({ vision: "A woman reading a letter by a window, a glass of wine beside her", style: "contemporary", data, widthMm: 100, heightMm: 80, order: "e2e-run-1", pool: ["levan-amashukeli"], small: true });
console.log("painted", out.template, out.artist, out.faces, "ground", out.ground, "in", ((Date.now() - t0) / 1000).toFixed(0), "s; lines", out.layout.lines.length, "art", JSON.stringify(out.layout.art));
const id = saveLabel({ style: "contemporary", widthMm: 100, heightMm: 80, faces: out.faces, ground: out.ground, svg: out.svg, png: out.png, art: out.art, prompt: out.prompt, layout: out.layout, fit: out.fit, template: out.template, hasPaper: out.hasPaper, artist: out.artist, refSet: out.refSet, panel: out.panel, layout2: (out as any).layout2 });
fs.writeFileSync(path.join(OUT, "1-painted.png"), b64(out.png));
const stored = readLabel(id)!;
console.log("stored meta", JSON.stringify({ template: stored.meta.template, layout2: !!stored.meta.layout2 }));
/* details changed: year and producer */
const keep = await relayoutLabel(stored, { ...data, vintage: "1999", producer: "Château de Kakheti" }, [], {}, true);
console.log("keep →", keep.template, keep.faces);
fs.writeFileSync(path.join(OUT, "2-details-changed.png"), b64(keep.png));
/* another layout of the same painting */
const v = await relayoutLabel(stored, data, [out.tag], {}, false);
console.log("variant →", v.template, v.faces);
fs.writeFileSync(path.join(OUT, "3-other-layout.png"), b64(v.png));
/* the PDF */
const pdf = await labelPdf(out.layout, stored.art, 100, 80);
fs.writeFileSync(path.join(OUT, "4-label.pdf"), pdf);
console.log("pdf", pdf.length, "bytes →", OUT);
