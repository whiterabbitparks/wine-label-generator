/* THE FINAL-ROUND COMPOSER ON STORED PAINTINGS — no model call, nothing
   spent (2026-10-03). Recent panel paintings from data/labels (their
   art.png, painted on a plain sheet) are laid into several of his
   layouts at two sizes, with the new ground method (painting-dictated /
   white / warm light) and the 60/40 ink rule, and gathered on a sheet.

     npx tsx tools/layout2-compose-test.mts [N labels]   → ~/Desktop/8K-final-round/compose/
*/
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { LAYOUTS } from "../src/lib/layout2/layouts.data";
import { familyOf, pickLayout, suits } from "../src/lib/layout2/engine";
import { composeLayout2 } from "../src/lib/layout2/compose";
import { paletteOf, chooseGround, chooseInks } from "../src/lib/layout2/ground";
import { cleanPaper } from "../src/lib/typeset/palette";
import { listArtists } from "../src/lib/label/artists";
import type { Faces } from "../src/lib/layout2/place";

const OUT = path.join(process.env.HOME!, "Desktop", "8K-final-round", "compose");
fs.mkdirSync(OUT, { recursive: true });
const N = Number(process.argv[2] || 8);

const FACES: Faces = { hero: { family: "Tinos", weight: 700 }, bold: { family: "Tinos", weight: 700 }, title: { family: "Tinos", weight: 400 }, text: { family: "EB Garamond", weight: 400 } };
const LOTS = { producer: "Marani Tsinandali Estate", wineName: "Saperavi Reserve", appellation: "Mukuzani PDO", classification: "Grand Reserve", vintage: "2019", grape: "Saperavi", regionCountry: "Kakheti, Georgia", special: "Qvevri Aged 18 Months", wineTypeLine: "Dry Red Wine", alcVol: "13.5% Alc. by Vol. / 750 mL" };
const FEW = { wineName: "Tsitska", vintage: "2022", wineTypeLine: "Dry White Wine", alcVol: "11.5% Alc. by Vol. / 750 mL" };
const WINE = { LOTS: "Red", FEW: "White" } as const;

/* recent paintings on a sheet, one per artist first */
const dirs = fs.readdirSync("data/labels").filter((d) => d >= "2026-09-29").sort().reverse();
const picks: { dir: string; artist: string; w: number; h: number }[] = [];
const seenArtist = new Set<string>();
for (const pass of [0, 1]) for (const d of dirs) {
  if (picks.length >= N) break;
  const mp = path.join("data/labels", d, "meta.json"), ap = path.join("data/labels", d, "art.png");
  if (!fs.existsSync(mp) || !fs.existsSync(ap)) continue;
  const m = JSON.parse(fs.readFileSync(mp, "utf8"));
  if (!m.hasPaper || m.scene || picks.some((p) => p.dir === d)) continue;
  if (pass === 0 && seenArtist.has(m.artist)) continue;
  seenArtist.add(m.artist);
  picks.push({ dir: d, artist: m.artist, w: m.widthMm, h: m.heightMm });
}
const profiles = listArtists();
const profileOf = (name: string) => profiles.find((a) => a.profile.name === name)?.profile as { keepGround?: string; paper?: string } | undefined;

const CASES = [
  { id: "L01", w: 100, h: 80 }, { id: "L07", w: 100, h: 80 }, { id: "L13", w: 100, h: 80 }, { id: "L19", w: 100, h: 80 }, { id: "L23", w: 100, h: 80 }, { id: "L45", w: 100, h: 80 },
  { id: "L01", w: 100, h: 140 }, { id: "L07", w: 90, h: 120 },
];
const cells: { img: Buffer; w: number; h: number; cap: string; bad: boolean }[][] = [];
const used: typeof picks = [];
let k = 0;
for (const p of picks) {
  const buf = fs.readFileSync(path.join("data/labels", p.dir, "art.png"));
  const art = `data:image/png;base64,${buf.toString("base64")}`;
  let c = await cleanPaper(art);
  if (!c.cleaned) c = await cleanPaper(art, undefined, undefined, { lenient: true });
  /* a painting without a plain sheet round it is not what the final round
     paints (the painter is asked for a panel on a sheet and checked) — skipped here */
  if (!c.cleaned) { console.log(`${p.artist} (${p.dir}) — no sheet round the painting, skipped`); continue; }
  const pal = await paletteOf(c.art, c.ground);
  const prof = profileOf(p.artist);
  const row: typeof cells[0] = [];
  console.log(`${p.artist} (${p.dir}) sheet ${c.ground}${c.cleaned ? "" : " NOT FOUND"} main ${pal.main}`);
  for (let ci = 0; ci < CASES.length; ci++) {
    const cs = CASES[ci];
    const fam = familyOf(cs.id)!;
    const lay = pickLayout(fam, cs.w, cs.h);
    const fieldsKey = ci % 3 === 2 ? "FEW" : "LOTS";
    const fields = fieldsKey === "FEW" ? FEW : LOTS;
    const seed = (k++ * 7919 + ci * 104729) >>> 0;
    const g = chooseGround(pal, seed, { keepGround: prof?.keepGround, paper: prof?.paper, wineColour: WINE[fieldsKey] });
    const inks = chooseInks(pal, g.ground, seed, WINE[fieldsKey]);
    try {
      const r = await composeLayout2({ lay, fields, widthMm: cs.w, heightMm: cs.h, faces: FACES, artwork: c.art, ground: g.ground, inks: { text: inks.text, accent: inks.accent } });
      const png = Buffer.from(r.png.slice(r.png.indexOf(",") + 1), "base64");
      const file = `${p.artist.replace(/\s+/g, "-")}-${lay.id}-${cs.w}x${cs.h}.png`;
      fs.writeFileSync(path.join(OUT, file), png);
      const cw = 300, ch = Math.round(cw * cs.h / cs.w);
      row.push({ img: await sharp(png).resize(cw, ch).png().toBuffer(), w: cw, h: ch, cap: `${lay.id} ${cs.w}×${cs.h} · ${g.source}${inks.allColoured ? " · all coloured" : ""} · ${r.picture?.by || "no picture"}${r.warnings.length ? " · " + r.warnings[0] : ""}${!suits(fam, cs.w, cs.h) ? " · not offered" : ""}`, bad: r.warnings.length > 0 });
      console.log(`  ${lay.id} ${cs.w}×${cs.h}: ground ${g.ground} (${g.note}); inks ${inks.text}/${inks.accent}; picture ${r.picture?.by}${r.warnings.length ? "; " + r.warnings.join("; ") : ""}`);
    } catch (e) {
      console.log(`  ${lay.id} FAILED`, e instanceof Error ? e.message : e);
    }
  }
  cells.push(row); used.push(p);
}
/* the sheet: a row per painting, the artist's name in front */
const cw = 300, pad = 14, capH = 36, nameW = 170;
const rowH = cells.map((r) => Math.max(...r.map((c) => c.h)) + capH + pad);
const H = rowH.reduce((s, h) => s + h, pad), W = nameW + CASES.length * (cw + pad) + pad;
const comps: sharp.OverlayOptions[] = []; let y = pad;
cells.forEach((r, ri) => {
  const p = used[ri];
  comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${nameW}" height="${rowH[ri]}"><text x="0" y="20" font-family="Helvetica" font-size="15" fill="#111">${p.artist.replace(/&/g, "&amp;")}</text></svg>`), top: y, left: pad });
  r.forEach((c, ci) => {
    const x = nameW + pad + ci * (cw + pad);
    const [l1, ...rest] = c.cap.split(" · ");
    comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${capH}"><text x="0" y="13" font-family="Helvetica" font-size="12" fill="#111">${l1}</text><text x="0" y="29" font-family="Helvetica" font-size="11" fill="${c.bad ? "#c0392b" : "#555"}">${rest.join(" · ").replace(/&/g, "&amp;")}</text></svg>`), top: y, left: x });
    comps.push({ input: c.img, top: y + capH, left: x });
  });
  y += rowH[ri];
});
await sharp({ create: { width: W, height: H, channels: 3, background: "#e9e9e9" } }).composite(comps).png().toFile(path.join(OUT, "sheet.png"));
console.log(`\n${used.length} paintings × ${CASES.length} cases → ${path.join(OUT, "sheet.png")}`);
