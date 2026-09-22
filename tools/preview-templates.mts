/* PREVIEW THE TEMPLATES (2026-09-22). Sets real labels on the owner's
   twelve templates with a real painting, calling no image model, and
   writes one contact sheet. This is the sheet he checks before the
   templates go anywhere near the wizard.

     npx tsx tools/preview-templates.mts [--art <png>] [--size 104x84]
                                         [--long] [--sparse] [--out <png>]

   --long    a long wine name and producer, to see the collapse and the fit
   --sparse  only the name, the vintage and the legal line, to see a block
             collapse and the next item inherit its anchor */

import fs from "node:fs";
import sharp from "sharp";
import { composeTemplateLabel } from "../src/lib/typeset/compose-template";
import { cleanPaper } from "../src/lib/typeset/palette";
import { TEMPLATES } from "../src/lib/typeset/templates.data";
import type { Template } from "../src/lib/typeset/templates";

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k: string) => process.argv.includes(k);

const ART = arg("--art", "data/eval/2026-09-20T23-12-34-story-test-9-mariam/chateau-bordeaux--traditional--1--art.png")!;
const [W, H] = (arg("--size", "104x84")!).split("x").map(Number);
const OUT = arg("--out", "/tmp/template-sheet.png")!;

const FULL = {
  producer: "GRAND VIN", wine: "Château Margaux", appellation: "Margaux AOC",
  classification: "Premier Grand Cru Classé", vintage: "2018", grape: "Cabernet Sauvignon, Merlot",
  region: "Bordeaux", country: "France", special: "Vieilles Vignes",
  sweetness: "Dry", wineColorName: "Red", wineType: "Wine", alcohol: "13.5", volume: "750",
};
const LONG = { ...FULL, wine: "Château Marceau de Beauregard", producer: "DOMAINE DE LA ROMANÉE-CONTI", classification: "Grand Cru Classé en 1855, Premier Cru" };
const SPARSE = { wine: "Korra", vintage: "2023", sweetness: "Dry", wineColorName: "Amber", wineType: "Wine", alcohol: "12.5", volume: "750" } as Record<string, string>;
const data = has("--long") ? LONG : has("--sparse") ? SPARSE : FULL;

const raw = `data:image/png;base64,${fs.readFileSync(ART).toString("base64")}`;
const art = (await cleanPaper(raw)).art;

const tiles: Buffer[] = [];
let problems = 0;
for (const tpl of TEMPLATES as Template[]) {
  const out = await composeTemplateLabel({
    artwork: art, template: tpl.id, band: tpl.band, data,
    widthMm: W, heightMm: H, seed: 4242, wineColour: data.wineColorName,
  });
  if (out.warnings.length) { problems++; console.log(`  ! ${tpl.id} ${out.warnings.join("; ")}`); }
  console.log(`  ${tpl.id} ${tpl.band.padEnd(13)} ${out.faces}`);
  const img = await sharp(Buffer.from(out.png.slice(out.png.indexOf(",") + 1), "base64")).resize(420).png().toBuffer();
  const m = await sharp(img).metadata();
  const pad = await sharp(img).extend({ top: 24, bottom: 10, left: 10, right: 10, background: "#ffffff" }).png().toBuffer();
  const mm = await sharp(pad).metadata();
  const label = Buffer.from(`<svg width="${mm.width}" height="${mm.height}"><text x="12" y="17" font-family="Helvetica" font-size="14" font-weight="bold" fill="${out.warnings.length ? "#c00" : "#333"}">${tpl.id.toUpperCase()}  ${tpl.band}${out.warnings.length ? "  ⚠" : ""}</text></svg>`);
  tiles.push(await sharp(pad).composite([{ input: label }]).png().toBuffer());
  void m;
}
const t0 = await sharp(tiles[0]).metadata();
const cols = 4, rows = Math.ceil(tiles.length / cols);
await sharp({ create: { width: t0.width! * cols, height: t0.height! * rows, channels: 3, background: "#e9e9e9" } })
  .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * t0.width!, top: Math.floor(i / cols) * t0.height! })))
  .png().toFile(OUT);
console.log(`\n${tiles.length} templates at ${W}x${H} mm → ${OUT}${problems ? `  (${problems} with warnings)` : "  (no warnings)"}`);
