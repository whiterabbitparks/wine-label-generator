/* THE 45 ON OTHER SIZES, WITH MISSING AND LONG TEXTS, IN BANK FONTS —
   one sheet per size; each label with its grey zone and the engine's own
   notes under it (reduced lines, a narrower face, problems, "not offered").
     npx tsx tools/l45/stress.mts [110x80 …]   → OUT (default tests/l45/out/stress-<size>.png) */
import fs from "node:fs"; import path from "node:path"; import sharp from "sharp";
import { FAMILIES, layoutLabel, suits, pickRef, facesFromBank, companion } from "../../src/lib/layout45/engine";
import { PX, type Faces } from "../../src/lib/layout45/place";
import { typeSvg, zoneSvg } from "../../src/lib/layout45/render";
import type { FieldKey } from "../../src/lib/layout45/spec";

const OUT = process.env.OUT || "tests/l45/out"; fs.mkdirSync(OUT, { recursive: true });
const SIZES = (process.argv.slice(2).length ? process.argv.slice(2) : ["110x80", "90x90", "80x110", "120x80", "100x120", "70x100", "90x140"]).map((s) => s.split("x").map(Number));
type F = Partial<Record<FieldKey, string>>;
const ALL: F = { producer: "Marani Tsinandali Estate", wineName: "Saperavi Reserve", appellation: "Mukuzani PDO", classification: "Grand Reserve", vintage: "2019", grape: "Saperavi", regionCountry: "Kakheti, Georgia", special: "Qvevri Aged 18 Months", wineTypeLine: "Dry Red Wine", alcVol: "13.5% Alc. by Vol. / 750 mL" };
const FEW: F = { wineName: "Tsitska", vintage: "2022", wineTypeLine: "Dry White Wine", alcVol: "11.5% Alc. by Vol. / 750 mL" };
const LONG: F = { ...ALL, producer: "Domaine des Collines de Racha-Lechkhumi", wineName: "Khvanchkara Old Vineyard Selection", grape: "Cabernet Sauvignon, Cabernet Franc, Merlot, Petit Verdot", regionCountry: "Racha-Lechkhumi, Georgia" };
const SETS: [string, F][] = [["all", ALL], ["few", FEW], ["long", LONG]];
/* three companions of different widths from the bank */
const FACES: [string, Faces][] = [
  ["Tinos", { hero: { family: "Tinos", weight: 700 }, ...companion("Tinos", 400, 700) }],
  ["Playfair+Poppins", { hero: { family: "Playfair Display", weight: 700 }, ...companion("Poppins", 400, 600) }],
  ["Bebas+Mulish", { hero: { family: "Oswald", weight: 600 }, ...companion("Mulish", 400, 700) }],
];
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
for (const [W, H] of SIZES) {
  const cw = 260, cells: { img: Buffer; h: number; cap: string; red: boolean }[] = [];
  let k = 0, notOffered = 0, probs = 0;
  for (const fam of FAMILIES) for (const [sn, f] of SETS) {
    const [fn, faces] = FACES[k++ % FACES.length];
    const p = layoutLabel(fam, f, W, H, faces);
    const ok = suits(fam, f, W, H, faces);
    if (!ok) notOffered++; if (p.problems.length) probs++;
    const b = 2 * PX, w = W * PX + 2 * b, h = H * PX + 2 * b;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${-b} ${-b} ${w} ${h}"><rect x="${-b}" y="${-b}" width="${w}" height="${h}" fill="#fff"/>${zoneSvg(p)}<rect x="0" y="0" width="${W * PX}" height="${H * PX}" fill="none" stroke="#bbb" stroke-width="2"/><rect x="${5 * PX}" y="${5 * PX}" width="${(W - 10) * PX}" height="${(H - 10) * PX}" fill="none" stroke="#f0b0b0" stroke-width="1.5" stroke-dasharray="6 6"/>${typeSvg(p, { text: "#1a1a1a", accent: "#9b1c1c" })}</svg>`;
    const ch = Math.round(cw * (H + 4) / (W + 4));
    const img = await sharp(Buffer.from(svg), { density: 12 * 25.4 }).resize(cw, ch).png().toBuffer();
    const notes = [p.narrowed ? `narrower: ${p.narrowed}` : "", Object.keys(p.reduced).length ? "reduced " + Object.entries(p.reduced).map(([a, v]) => `${a} ${Math.round(v * 100)}%`).join(", ") : "", ...p.problems, ok ? "" : "NOT OFFERED"].filter(Boolean).join(" · ");
    cells.push({ img, h: ch, cap: `${pickRef(fam, W, H).id} · ${sn} · ${fn}|${notes}`, red: !ok });
  }
  const cols = 6, pad = 12, capH = 40, rows: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += cols) rows.push(cells.slice(i, i + cols));
  const rowH = rows.map((r) => Math.max(...r.map((c) => c.h)) + capH + pad), Ht = rowH.reduce((s, x) => s + x, pad), Wt = cols * (cw + pad) + pad;
  const comps: sharp.OverlayOptions[] = []; let y = pad;
  rows.forEach((r, ri) => { r.forEach((c, ci) => { const x = pad + ci * (cw + pad); const [a, bnote] = c.cap.split("|");
    comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${capH}"><text x="0" y="13" font-family="Helvetica" font-size="12">${esc(a)}</text><text x="0" y="28" font-family="Helvetica" font-size="10" fill="${c.red ? "#c0392b" : "#666"}">${esc(bnote.slice(0, 60))}</text><text x="0" y="39" font-family="Helvetica" font-size="10" fill="${c.red ? "#c0392b" : "#666"}">${esc(bnote.slice(60, 120))}</text></svg>`), top: y, left: x });
    comps.push({ input: c.img, top: y + capH, left: x }); }); y += rowH[ri]; });
  const file = path.join(OUT, `stress-${W}x${H}.png`);
  await sharp({ create: { width: Wt, height: Ht, channels: 3, background: "#e8e8e8" } }).composite(comps).png().toFile(file);
  console.log(`${W}×${H}: ${cells.length} labels, ${probs} with a problem, ${notOffered} not offered → ${file}`);
}
