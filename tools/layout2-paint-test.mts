/* REAL PAINTINGS THROUGH THE FINAL-ROUND PIPELINE (2026-10-04), small
   resolution, a handful of labels: artists × layout families × sizes.

     npx tsx tools/layout2-paint-test.mts [N]      → ~/Desktop/8K-final-round/painted/
*/
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const { paintLayout2Label } = await import("../src/lib/layout2/paint");

const OUT = path.join(process.env.HOME!, "Desktop", "8K-final-round", "painted");
fs.mkdirSync(path.join(OUT, "art"), { recursive: true });
const N = Number(process.argv[2] || 6);

const LOTS = { producer: "Marani Tsinandali Estate", wine: "Saperavi Reserve", appellation: "Mukuzani PDO", classification: "Grand Reserve", vintage: "2019", grape: "Saperavi", region: "Kakheti", country: "Georgia", special: "Qvevri Aged 18 Months", sweetness: "Dry", wineColorName: "Red", wineType: "Wine", alcohol: "13.5", volume: "750" };
const MID = { producer: "Giorgi's Marani", wine: "Korra", vintage: "2023", grape: "Rkatsiteli", region: "Kakheti", country: "Georgia", sweetness: "Dry", wineColorName: "White", wineType: "Pet-Nat", alcohol: "12", volume: "750" };
const FEW = { wine: "Tsitska", vintage: "2022", sweetness: "Dry", wineColorName: "White", wineType: "Wine", alcohol: "11.5", volume: "750" };
const ROSE = { producer: "Château Lumière", wine: "Rosé de Saignée", appellation: "Côtes de Provence AOC", vintage: "2024", grape: "Grenache, Cinsault", region: "Provence", country: "France", sweetness: "Dry", wineColorName: "Rosé", wineType: "Wine", alcohol: "12.5", volume: "750" };

const JOBS = [
  { artist: "levan-amashukeli", family: "L01", w: 100, h: 80, data: LOTS, idea: "Two old friends share a jug of wine under a fig tree at dusk" },
  { artist: "mariam-kvashilava", family: "L07", w: 100, h: 80, data: MID, idea: "A woman floating a few centimetres above a vineyard path, hair and dress hanging naturally" },
  { artist: "niko-pirosmani", family: "L13", w: 100, h: 80, data: FEW, idea: "A feast table with a roasted lamb, bread and a deer looking in from the dark" },
  { artist: "oskar-schmerling", family: "L19", w: 100, h: 166, data: LOTS, idea: "A plump merchant asleep on a wine barrel while a cat drinks from his glass" },
  { artist: "levan-amashukeli", family: "L23", w: 100, h: 80, data: ROSE, idea: "A long table on a hill, sunset, everybody lifting a glass at once" },
  { artist: "petre-otskheli", family: "L45", w: 90, h: 120, data: MID, idea: "A tall figure in a black cloak carrying a lantern through a vineyard at night" },
  { artist: "grigol-tatishvili", family: "L13", w: 100, h: 80, data: LOTS, idea: "A village wedding dance under a walnut tree" },
  { artist: "dachi-mindadze", family: "L01", w: 100, h: 140, data: ROSE, idea: "Two profiles face to face, one continuous line flowing from mouth to mouth" },
];
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const cells: { img: Buffer; w: number; h: number; cap: string }[] = [];
async function one(i: number) {
  const j = JOBS[i];
  const n = String(i + 1).padStart(2, "0");
  try {
    const r = await paintLayout2Label({ vision: j.idea, data: j.data, widthMm: j.w, heightMm: j.h, artistId: j.artist, family: j.family, small: true });
    const png = Buffer.from(r.png.slice(r.png.indexOf(",") + 1), "base64");
    const file = `${n}-${j.artist.split("-")[0]}-${r.lay.id}-${j.w}x${j.h}.png`;
    fs.writeFileSync(path.join(OUT, file), png);
    fs.writeFileSync(path.join(OUT, "art", `${n}.png`), Buffer.from(r.art.slice(r.art.indexOf(",") + 1), "base64"));
    fs.writeFileSync(path.join(OUT, "art", `${n}.json`), JSON.stringify({ job: j, lay: r.lay.id, ground: r.ground, inks: r.inks, faces: r.facesName, fit: r.fit, picture: r.picture, warnings: r.warnings, sheet: r.sheet, main: r.mainColour, prompt: r.prompt }, null, 1));
    const cw = 420, ch = Math.round(cw * j.h / j.w);
    cells[i] = { img: await sharp(png).resize(cw, ch).png().toBuffer(), w: cw, h: ch, cap: `${n} ${r.artist} · ${r.lay.id} ${j.w}×${j.h} · ground ${r.ground.source}${r.inks.allColoured ? " · all coloured" : ""} · ${r.picture ? "placed" : "no picture"}${r.warnings.length ? " · " + r.warnings[0] : ""}` };
    log(`${n} done — ${r.lay.id} ${r.artist} ground ${r.ground.ground} (${r.ground.note}) picture ${r.picture ? "placed" : "no picture"} ${r.warnings.join("; ")}`);
  } catch (e) {
    log(`${n} FAILED`, e instanceof Error ? e.message : e);
  }
}
const idx = Array.from({ length: Math.min(N, JOBS.length) }, (_, i) => i);
for (let k = 0; k < idx.length; k += 2) await Promise.all(idx.slice(k, k + 2).map(one));

/* the sheet */
const live = cells.filter(Boolean);
if (live.length) {
  const pad = 16, capH = 34, cols = 4, cw = 420;
  const rows: typeof live[] = []; for (let i = 0; i < live.length; i += cols) rows.push(live.slice(i, i + cols));
  const rowH = rows.map((r) => Math.max(...r.map((c) => c.h)) + capH + pad);
  const H = rowH.reduce((s, h) => s + h, pad), W = cols * (cw + pad) + pad;
  const comps: sharp.OverlayOptions[] = []; let y = pad;
  rows.forEach((r, ri) => { r.forEach((c, ci) => { const x = pad + ci * (cw + pad); comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${capH}"><text x="0" y="14" font-family="Helvetica" font-size="12" fill="#111">${c.cap.split(" · ").slice(0, 2).join(" · ").replace(/&/g, "&amp;")}</text><text x="0" y="29" font-family="Helvetica" font-size="11" fill="#555">${c.cap.split(" · ").slice(2).join(" · ").replace(/&/g, "&amp;")}</text></svg>`), top: y, left: x }); comps.push({ input: c.img, top: y + capH, left: x }); }); y += rowH[ri]; });
  await sharp({ create: { width: W, height: H, channels: 3, background: "#e9e9e9" } }).composite(comps).png().toFile(path.join(OUT, "sheet.png"));
}
log("sheet →", path.join(OUT, "sheet.png"));
