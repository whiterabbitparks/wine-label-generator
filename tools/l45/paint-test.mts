/* real paintings through the final-round painter (small) → ~/Desktop/8K-final-round/ */
import fs from "node:fs"; import path from "node:path"; import sharp from "sharp";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
const { paintLabel, evalModel } = await import("../../src/lib/layout45/paint");
const OUT = process.env.OUT || path.join(process.env.HOME!, "Desktop", "8K-final-round"); fs.mkdirSync(OUT, { recursive: true });
const RED = { producer: "Marani Tsinandali Estate", wine: "Saperavi Reserve", appellation: "Mukuzani PDO", classification: "Grand Reserve", vintage: "2019", grape: "Saperavi", region: "Kakheti", country: "Georgia", special: "Qvevri Aged 18 Months", sweetness: "Dry", wineColorName: "Red", wineType: "Wine", alcohol: "13.5", volume: "750" };
const WHITE = { producer: "Giorgi's Marani", wine: "Korra", vintage: "2023", grape: "Rkatsiteli", region: "Kakheti", country: "Georgia", sweetness: "Dry", wineColorName: "White", wineType: "Pet-Nat", alcohol: "12", volume: "750" };
const JOBS = (process.env.JOBS ? JSON.parse(process.env.JOBS) : [
  ["dachi-mindadze", "centred", 110, 80, "RED", "Two old friends share a jug of wine under a fig tree at dusk"],
  ["oskar-schmerling", "sides", 110, 80, "WHITE", "A plump merchant asleep on a wine barrel while a cat drinks from his glass"],
  ["levan-amashukeli", "vertical", 110, 80, "RED", "A long table on a hill at sunset, everybody lifting a glass at once"],
  ["niko-pirosmani", "centred", 90, 120, "RED", "A feast table with bread and a deer looking in from the dark"],
]) as [string, string, number, number, string, string][];
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
await Promise.all(JOBS.map(async ([artist, kind, w, h, d, idea], i) => {
  const n = String(i + 1).padStart(2, "0");
  try {
    const model = evalModel(`artist:${artist}`)!;
    const r = await paintLabel({ model, vision: idea, data: d === "RED" ? RED : WHITE, widthMm: w, heightMm: h, seed: (Math.random() * 2 ** 32) >>> 0, kind: kind as never, small: true });
    fs.writeFileSync(path.join(OUT, `${n}-${artist.split("-")[0]}-${r.lay.id}-${w}x${h}.png`), Buffer.from(r.png.slice(r.png.indexOf(",") + 1), "base64"));
    fs.writeFileSync(path.join(OUT, `${n}-art.png`), Buffer.from(r.art.slice(r.art.indexOf(",") + 1), "base64"));
    log(n, artist, r.lay.id, `asked ${r.asked.hex} (${r.asked.name}) got ${r.ground}`, r.warnings.join("; "));
  } catch (e) { log(n, artist, "FAILED", e instanceof Error ? e.message : e); }
}));
