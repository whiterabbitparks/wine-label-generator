import { chromium } from "playwright";
import sharp from "sharp";
setTimeout(() => process.exit(3), 120000);
const out = [];
for (const width of [1440, 1920]) {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 })).newPage();
  await p.goto("https://8k.wine/?page=vision", { waitUntil: "load" }); await p.waitForTimeout(6000);
  const btn = p.locator("[aria-label='guided mode']");
  for (const st of ["off", "on"]) {
    if (st === "on") { await btn.click(); await p.waitForTimeout(800); }
    const r = await btn.locator("svg rect").boundingBox(), c = await btn.locator("svg circle").boundingBox();
    const inner = 1 * (r.width / 22);   /* the stroke, in screen px */
    console.log(width, st, "gaps L/R/T/B:", (c.x - r.x - inner).toFixed(2), (r.x + r.width - inner - c.x - c.width).toFixed(2), (c.y - r.y - inner).toFixed(2), (r.y + r.height - inner - c.y - c.height).toFixed(2));
    out.push(await sharp(await p.screenshot({ clip: { x: r.x - 3, y: r.y - 3, width: r.width + 6, height: r.height + 6 } })).resize(300, 170, { fit: "contain", background: "#fff" }).png().toBuffer());
  }
  await b.close();
}
await sharp({ create: { width: 1240, height: 180, channels: 3, background: "#ccc" } }).composite(out.map((x, i) => ({ input: x, left: i * 310, top: 5 }))).png().toFile(process.env.SP + "/guide-sw.png");
process.exit(0);
