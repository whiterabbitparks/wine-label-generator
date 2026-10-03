/* stored paintings (data/labels, painted as panels on a sheet) laid into
   every family whose zone has their shape — free, no model call */
import fs from "node:fs"; import path from "node:path"; import sharp from "sharp";
import { FAMILIES, pickRef, companion } from "../../src/lib/layout45/engine";
import { place } from "../../src/lib/layout45/place";
import { composeLabel, visibleZone, shapeFits } from "../../src/lib/layout45/compose";
import { mainColourOf, inksFor } from "../../src/lib/layout45/colour";
import { cleanPaper } from "../../src/lib/typeset/palette";

const OUT = process.env.OUT || "tests/l45/out"; fs.mkdirSync(OUT, { recursive: true });
const FIELDS = { producer: "Marani Tsinandali Estate", wineName: "Saperavi Reserve", appellation: "Mukuzani PDO", classification: "Grand Reserve", vintage: "2019", grape: "Saperavi", regionCountry: "Kakheti, Georgia", special: "Qvevri Aged 18 Months", wineTypeLine: "Dry Red Wine", alcVol: "13.5% Alc. by Vol. / 750 mL" };
const faces = { hero: { family: "Playfair Display", weight: 700 }, ...companion("Source Serif 4", 400, 700) };
const [W, H] = (process.argv[2] || "110x80").split("x").map(Number);
const dirs = fs.readdirSync("data/labels").filter((d) => d >= "2026-09-25" && fs.existsSync(path.join("data/labels", d, "art.png"))).sort().reverse().slice(0, 40);
const cells: { img: Buffer; h: number; cap: string }[] = [];
for (const d of dirs) {
  if (cells.length >= 24) break;
  const art0 = `data:image/png;base64,${fs.readFileSync(path.join("data/labels", d, "art.png")).toString("base64")}`;
  const c = await cleanPaper(art0); if (!c.cleaned) continue;
  const m = await sharp(Buffer.from(c.art.slice(c.art.indexOf(",") + 1), "base64")).metadata();
  const pa = (c.ink.w * m.width!) / (c.ink.h * m.height!);
  const main = await mainColourOf(c.art, c.ground);
  let used = 0;
  for (const fam of FAMILIES) {
    if (used >= 2) break;
    const lay = pickRef(fam, W, H), pl = place(lay, FIELDS, W, H, faces);
    const v = visibleZone(pl); if (!v || pl.problems.length || !shapeFits(pa, v.aspect)) continue;
    const inks = inksFor(main, c.ground, "Red", cells.length * 7919);
    const r = await composeLabel({ lay, fields: FIELDS, widthMm: W, heightMm: H, faces, art: c.art, ink: c.ink, ground: c.ground, inks, placement: pl });
    const cw = 420, ch = Math.round(cw * H / W);
    cells.push({ img: await sharp(Buffer.from(r.png.slice(r.png.indexOf(",") + 1), "base64")).resize(cw, ch).png().toBuffer(), h: ch, cap: `${lay.id} · ${d} · panel ${pa.toFixed(2)} zone ${v.aspect.toFixed(2)} · ground ${c.ground}` });
    used++;
  }
}
const cw = 420, pad = 12, capH = 18, cols = 4, rows: typeof cells[] = [];
for (let i = 0; i < cells.length; i += cols) rows.push(cells.slice(i, i + cols));
const rh = rows.map((r) => Math.max(...r.map((c) => c.h)) + capH + pad), Ht = rh.reduce((s, x) => s + x, pad);
const comps: sharp.OverlayOptions[] = []; let y = pad;
rows.forEach((r, ri) => { r.forEach((c, ci) => { const x = pad + ci * (cw + pad); comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${capH}"><text x="0" y="13" font-family="Helvetica" font-size="11">${c.cap}</text></svg>`), top: y, left: x }); comps.push({ input: c.img, top: y + capH, left: x }); }); y += rh[ri]; });
await sharp({ create: { width: cols * (cw + pad) + pad, height: Ht, channels: 3, background: "#d8d8d8" } }).composite(comps).png().toFile(path.join(OUT, `place-${W}x${H}.png`));
console.log(cells.length, "labels →", path.join(OUT, `place-${W}x${H}.png`));
