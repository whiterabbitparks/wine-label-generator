/* every artist's originals with the grounds read off each — for the owner to check */
import fs from "node:fs"; import path from "node:path"; import sharp from "sharp";
import { artistGrounds } from "../../src/lib/layout45/grounds";
const OUT = process.argv[2] || path.join(process.env.HOME!, "Desktop", "8K-grounds.png");
const ids = fs.readdirSync("data/artists").filter((d) => fs.existsSync(path.join("data/artists", d, "works")));
const comps: sharp.OverlayOptions[] = []; let y = 12; const W = 2200, th = 120, sw = 22, pad = 8;
const esc = (s: string) => s.replace(/&/g, "&amp;");
for (const id of ids) {
  const g = await artistGrounds(id, true);
  console.log(id.padEnd(26), `${g.tones.length} tones:`, g.tones.slice(0, 14).map((t) => `${t.hex}(${t.works.length}${t.kind === "sheet" ? "s" : "f"})`).join(" "));
  comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="24"><text x="0" y="18" font-family="Helvetica" font-size="17" font-weight="bold">${esc(id)} — ${g.tones.length} grounds</text></svg>`), top: y, left: 12 }); y += 28;
  /* the tones, wide chips, number of works under each */
  let x = 12;
  for (const t of g.tones.slice(0, 24)) { comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="62"><rect width="80" height="44" fill="${t.hex}" stroke="#888"/><text x="2" y="58" font-family="Helvetica" font-size="11">${t.hex} ×${t.works.length}</text></svg>`), top: y, left: x }); x += 86; }
  y += 70; x = 12;
  for (const [f, gs] of Object.entries(g.works).slice(0, 15)) {
    const img = await sharp(path.join("data/artists", id, "works", f)).resize(th, th, { fit: "inside" }).png().toBuffer(); const m = await sharp(img).metadata();
    comps.push({ input: img, top: y, left: x + ((th - (m.width || th)) >> 1) });
    gs.forEach((c, i) => comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sw}"><rect width="${sw}" height="${sw}" fill="${c.hex}" stroke="#333"/></svg>`), top: y + th + 4, left: x + i * (sw + 3) }));
    if (!gs.length) comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${th}" height="${sw}"><text x="0" y="15" font-family="Helvetica" font-size="11" fill="#999">none</text></svg>`), top: y + th + 4, left: x });
    x += th + pad + 20;
  }
  y += th + sw + 26;
}
await sharp({ create: { width: W, height: y + 10, channels: 3, background: "#f2f2f2" } }).composite(comps).png().toFile(OUT);
console.log("→", OUT);
