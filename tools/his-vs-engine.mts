/* his exported artboard beside what the engine lays from the same words */
import fs from "node:fs";
import sharp from "sharp";
const O = await import("@/lib/typeset/overrides");
const T = await import("@/lib/typeset/templates");
const d = "/Users/giorgipopiashvili/Documents/PROJECTS/WAIN/NEW UI/Comments/New";
const FULL = { producer: "GRAND VIN", wine: "Château Margaux", appellation: "Margaux AOC", classification: "Premier Grand Cru Classé", vintage: "2018", grape: "Cabernet Sauvignon, Merlot", region: "Bordeaux", country: "France", special: "Vieilles Vignes", sweetness: "Dry", wineColorName: "Red", wineType: "Wine", alcohol: "13.5", volume: "750" };
const map: Record<string, string> = { t01: "8", t02: "10", t03: "11", t04: "12", t05: "13", t06: "14", t07: "15", t08: "16", t09: "17", t10: "18", t11: "19", t12: "20" };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const W = 104 * 12, H = 84 * 12, TW = 520, TH = Math.round(TW * 84 / 104);
const rows: Buffer[] = [];
for (const id of (process.argv[2] || "t01,t02,t03,t04,t05,t06,t07,t08,t09,t10,t11,t12").split(",")) {
  const t = O.templatesNow().find((x) => x.id === id)!;
  /* his own words, exactly as on his artboard */
  const F: Record<string, string> = { ...T.templateFields(FULL) };
  for (const x of t.texts) {
    if (!x.sample) continue;
    const parts = x.fields.length > 1 ? x.sample.split(/\s*\/\s*(?=[A-Z0-9])/) : [x.sample];
    if (x.fields.length > 1 && parts.length > x.fields.length) parts.splice(x.fields.length - 1, parts.length, parts.slice(x.fields.length - 1).join(" / "));
    x.fields.forEach((f, i) => { F[f] = parts[i] || ""; });
  }
  const lay = T.layoutFromTemplate({ template: t, fields: F as never, widthMm: 104, heightMm: 84, seed: 7, ground: "#fff", ink: "#1b1b1b", accent: "#D0021B" });
  const a = t.art!, zx = a.x / t.refW * W, zy = a.y / t.refH * H, zw = a.w / t.refW * W, zh = a.h / t.refH * H;
  const zone = a.kind === "oval" ? `<ellipse cx="${zx + zw / 2}" cy="${zy + zh / 2}" rx="${zw / 2}" ry="${zh / 2}" fill="#e6e6e6"/>` : `<rect x="${zx}" y="${zy}" width="${zw}" height="${zh}" fill="#e6e6e6"/>`;
  const texts = lay.layout.lines.map((l) => `<text x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}" text-anchor="${l.anchor}" fill="${l.colour}" font-family="${esc(l.family)}" font-weight="${l.weight}" font-size="${l.size.toFixed(1)}"${l.tracking ? ` letter-spacing="${l.tracking.toFixed(2)}"` : ""}${l.rot ? ` transform="rotate(${l.rot.toFixed(2)} ${l.x.toFixed(1)} ${l.y.toFixed(1)})"` : ""}>${esc(l.text)}</text>`).join("");
  const eng = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff"/>${zone}${texts}</svg>`)).resize(TW, TH, { fit: "fill" }).png().toBuffer();
  const his = await sharp(`${d}/Artboard 2 copy ${map[id]}@3x.png`).flatten({ background: "#fff" }).resize(TW, TH, { fit: "fill" }).png().toBuffer();
  const lab = (s: string) => Buffer.from(`<svg width="${TW}" height="26"><rect width="100%" height="100%" fill="#333"/><text x="8" y="18" font-family="Helvetica" font-size="14" font-weight="bold" fill="#fff">${s}</text></svg>`);
  const engText = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${texts.replace(/fill="[^"]+"/g, 'fill="#0057ff"')}${zone.replace('fill="#e6e6e6"', 'fill="none" stroke="#0057ff" stroke-width="3" stroke-dasharray="14 8"')}</svg>`)).resize(TW, TH, { fit: "fill" }).png().toBuffer();
  const faded = await sharp(his).linear(0.45, 140).png().toBuffer();
  const over = await sharp(faded).composite([{ input: engText, blend: "multiply" }]).png().toBuffer();
  rows.push(await sharp({ create: { width: TW * 3 + 24, height: TH + 26, channels: 3, background: "#777" } }).composite([
    { input: lab(`${id} — laid over each other (engine in blue)`), left: TW * 2 + 24, top: 0 }, { input: over, left: TW * 2 + 24, top: 26 },
    { input: lab(`${id} — your artboard (copy ${map[id]})`), left: 0, top: 0 }, { input: his, left: 0, top: 26 },
    { input: lab(`${id} — what the engine makes now`), left: TW + 12, top: 0 }, { input: eng, left: TW + 12, top: 26 },
  ]).png().toBuffer());
}
const h = rows.length * (TH + 26 + 12);
await sharp({ create: { width: TW * 3 + 24, height: h, channels: 3, background: "#777" } }).composite(rows.map((b, i) => ({ input: b, left: 0, top: i * (TH + 38) }))).png().toFile(process.argv[3] || "his-vs-engine.png");
