/* Compare canvas measureText between the original page and the Next harness. */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const ORIGINAL = 'file://' + path.join(ROOT, '8k-labels-package/dist/configurator.html');
const PORTED = 'http://localhost:3199/engine-test';

const SPECS = [
  ["800 104px 'Archivo'", 'Château Margaux'],
  ["400 40px 'EB Garamond'", 'GRAND VIN'],
  ["500 40px 'EB Garamond'", 'GRAND VIN'],
  ["600 40px 'Cinzel'", 'Château Margaux'],
  ["600 40px 'Cormorant Garamond'", 'Château Margaux'],
  ["400 90px 'Anton'", 'Château Margaux'],
  ["400 40px 'Jost'", 'Cabernet Sauvignon'],
];

async function measure(page) {
  return page.evaluate((specs) => {
    const ctx = document.createElement('canvas').getContext('2d');
    const out = {};
    for (const [font, text] of specs) {
      ctx.font = font;
      out[font + ' :: ' + text] = ctx.measureText(text).width;
    }
    out['fonts.size'] = document.fonts.size;
    out['loaded'] = [...document.fonts].filter((f) => f.status === 'loaded').length;
    return out;
  }, SPECS);
}

const browser = await chromium.launch({ channel: 'chrome' });

const p1 = await browser.newPage();
await p1.goto(ORIGINAL);
await p1.evaluate(() => document.fonts.ready);
await p1.evaluate(() => window.LabelEngine.ensureFonts());
await p1.waitForTimeout(1500);
const m1 = await measure(p1);

const p2 = await browser.newPage();
await p2.goto(PORTED);
await p2.waitForFunction(() => window.__ENGINE_READY__ === true, null, { timeout: 60000 });
await p2.waitForTimeout(1500);
const m2 = await measure(p2);

console.log(String('spec').padEnd(55), 'original'.padStart(10), 'ported'.padStart(10));
for (const k of Object.keys(m1)) {
  const same = m1[k] === m2[k] ? '' : '   <-- DIFF';
  console.log(k.padEnd(55), String(m1[k]).padStart(10), String(m2[k]).padStart(10), same);
}
await browser.close();
