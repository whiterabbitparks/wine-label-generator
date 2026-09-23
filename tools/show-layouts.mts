/* draw engine layouts (grey zone + type) for a list of cases:
   npx tsx tools/show-layouts.mts "t02:104x84:long,t05:70x120:full" out.png */
import sharp from "sharp";
const O = await import("@/lib/typeset/overrides");
const T = await import("@/lib/typeset/templates");
const FULL = { producer: "GRAND VIN", wine: "Château Margaux", appellation: "Margaux AOC", classification: "Premier Grand Cru Classé", vintage: "2018", grape: "Cabernet Sauvignon, Merlot", region: "Bordeaux", country: "France", special: "Vieilles Vignes", sweetness: "Dry", wineColorName: "Red", wineType: "Wine", alcohol: "13.5", volume: "750" };
const LONG = { ...FULL, wine: "Château Marceau de Beauregard", producer: "DOMAINE DE LA ROMANÉE-CONTI", classification: "Grand Cru Classé en 1855, Premier Cru", grape: "Cabernet Sauvignon, Merlot, Petit Verdot" };
const SPARSE = { wine: "Korra", vintage: "2023", sweetness: "Dry", wineColorName: "Amber", wineType: "Wine", alcohol: "12.5", volume: "750" };
const DATA: Record<string, Record<string, string>> = { full: FULL, long: LONG, sparse: SPARSE };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const tiles: Buffer[] = [];
for (const c of process.argv[2].split(",")) {
  const [id, size, kase] = c.split(":");
  const [w, h] = size.split("x").map(Number);
  const t = O.templatesNow().find((x) => x.id === id)!;
  const lay = T.layoutFromTemplate({ template: t, fields: T.templateFields(DATA[kase]), widthMm: w, heightMm: h, seed: 7, ground: "#fff", ink: "#1b1b1b", accent: "#D0021B" });
  const W = w * 12, H = h * 12, a = lay.art, M = 60;
  const zone = a.kind === "oval" ? `<ellipse cx="${a.x + a.w / 2}" cy="${a.y + a.h / 2}" rx="${a.w / 2}" ry="${a.h / 2}" fill="#e6e6e6"/>` : `<rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" fill="#e6e6e6"/>`;
  const texts = lay.layout.lines.map((l) => `<text x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}" text-anchor="${l.anchor}" fill="${l.colour}" font-family="${esc(l.family)}" font-weight="${l.weight}" font-size="${l.size.toFixed(1)}"${l.tracking ? ` letter-spacing="${l.tracking.toFixed(2)}"` : ""}${l.rot ? ` transform="rotate(${l.rot.toFixed(2)} ${l.x.toFixed(1)} ${l.y.toFixed(1)})"` : ""}>${esc(l.text)}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff"/>${zone}<rect x="${M}" y="${M}" width="${W - 2 * M}" height="${H - 2 * M}" fill="none" stroke="#0af" stroke-dasharray="8 8" stroke-width="2"/>${texts}</svg>`;
  const png = await sharp(Buffer.from(svg)).resize({ height: 420 }).png().toBuffer();
  const m = await sharp(png).metadata();
  const lab = Buffer.from(`<svg width="${m.width! + 12}" height="26"><rect width="100%" height="100%" fill="#333"/><text x="6" y="18" font-family="Helvetica" font-size="13" font-weight="bold" fill="#fff">${c}${lay.warnings.length ? " ⚠" : ""}</text></svg>`);
  const ext = await sharp(png).extend({ top: 26, bottom: 6, left: 6, right: 6, background: "#888" }).png().toBuffer();
  tiles.push(await sharp(ext).composite([{ input: lab, top: 0, left: 0 }]).png().toBuffer());
}
const ms = await Promise.all(tiles.map((b) => sharp(b).metadata()));
let x = 0; const comps = tiles.map((b, i) => { const c = { input: b, left: x, top: 0 }; x += ms[i].width!; return c; });
await sharp({ create: { width: x, height: Math.max(...ms.map((m) => m.height!)), channels: 3, background: "#888" } }).composite(comps).png().toFile(process.argv[3]);
