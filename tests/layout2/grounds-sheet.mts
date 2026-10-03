/* every artist's originals with the ground read off each — for the owner to check the reading */
import fs from "node:fs"; import path from "node:path"; import sharp from "sharp";
import { artistGrounds, groundOfWork } from "../../src/lib/layout2/artist-grounds";
const ids = fs.readdirSync("data/artists").filter((d) => fs.existsSync(path.join("data/artists", d, "works")));
const OUT = path.join(process.env.HOME!, "Desktop", "8K-final-round"); const rows: sharp.OverlayOptions[] = []; let y = 10; const th = 110, pad = 8;
let W = 1900;
for (const id of ids) {
  const g = await artistGrounds(id, true);
  console.log(id.padEnd(26), `${g.readable}/${g.measured} works readable`, g.grounds.map((x) => `${x.hex}×${x.works}`).join(" "));
  const files = fs.readdirSync(path.join("data/artists", id, "works")).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort().slice(0, 12);
  rows.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="18"><text x="0" y="14" font-family="Helvetica" font-size="14" fill="#111">${id} — grounds: ${g.grounds.map((x) => `${x.hex} (${x.works})`).join(", ") || "none readable"}</text></svg>`), top: y, left: 10 });
  y += 22;
  let x = 10;
  /* the artist's gathered tones first */
  for (const t of g.grounds) { rows.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${th}" height="${th}"><rect width="${th}" height="${th}" fill="${t.hex}"/><text x="4" y="${th - 6}" font-family="Helvetica" font-size="11" fill="#000">${t.hex}</text></svg>`), top: y, left: x }); x += th + pad; }
  x += 20;
  for (const f of files) {
    const file = path.join("data/artists", id, "works", f);
    const w = await groundOfWork(file).catch(() => null);
    const img = await sharp(file).resize(th, th, { fit: "inside", background: "#ddd" }).png().toBuffer();
    const m = await sharp(img).metadata();
    rows.push({ input: img, top: y + Math.round((th - (m.height || th)) / 2), left: x + Math.round((th - (m.width || th)) / 2) });
    rows.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${th}" height="16"><rect width="${th}" height="16" fill="${w?.hex || "#ffffff"}" stroke="#999"/><text x="3" y="12" font-family="Helvetica" font-size="10" fill="#000">${w ? w.hex : "no ground"}</text></svg>`), top: y + th + 2, left: x });
    x += th + pad; if (x + th > W) break;
  }
  y += th + 30;
}
await sharp({ create: { width: W, height: y + 10, channels: 3, background: "#f2f2f2" } }).composite(rows).png().toFile(path.join(OUT, "artist-grounds.png"));
console.log("→", path.join(OUT, "artist-grounds.png"));
