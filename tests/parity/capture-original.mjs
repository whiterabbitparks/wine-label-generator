/* Phase 0 — capture ground truth from the ORIGINAL dist/configurator.html.
   Produces the reference spec every ported section must match:
   screenshots of each real UI state + a visible-DOM outline. */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
// default: the original single-file page -> reference/. Pass a URL + out dir to
// capture the PORTED app instead, e.g.:
//   node tests/parity/capture-original.mjs http://localhost:3200 tests/parity/ported
const ORIGINAL = process.argv[2] || 'file://' + path.join(ROOT, '8k-labels-package/dist/configurator.html');
const OUT = process.argv[3] ? path.resolve(ROOT, process.argv[3]) : path.join(HERE, 'reference');
const SHOTS = path.join(OUT, 'screenshots');
const SVGS = path.join(OUT, 'original-option-svgs');
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(SVGS, { recursive: true });

const FILL = {
  producer: 'GRAND VIN',
  wineName: 'Château Margaux',
  appellation: 'Margaux AOC',
  grape: 'Cabernet Sauvignon',
  vintage: '2018',
  classification: 'Grand Cru Classé',
  regionCountry: 'Bordeaux, France',
  special: 'Vieilles Vignes',
};

async function settle(page) {
  await page.waitForLoadState('load');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() =>
    window.LabelEngine && window.LabelEngine.ensureFonts
      ? window.LabelEngine.ensureFonts()
      : null
  );
  await page.waitForTimeout(600);
}

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
// parity mode: both sides (dist file AND ported app) must use the package's
// offline placeholder artwork — server-generated images are environment-
// dependent and would make post-generation states incomparable
await page.addInitScript(() => { window.__PARITY_OFFLINE__ = true; });

console.log('opening', ORIGINAL);
await page.goto(ORIGINAL);
await settle(page);

// --- 1. front tab, pristine ---
await page.screenshot({ path: path.join(SHOTS, '01-front-default.png'), fullPage: true });

// --- 2. warning state: press Show Labels with everything empty ---
await page.locator('#frontPreviewBtn').scrollIntoViewIfNeeded();
await page.click('#frontPreviewBtn');
await page.waitForTimeout(800); // smooth-scroll to the warning
await page.screenshot({ path: path.join(SHOTS, '02-warning-empty.png'), fullPage: true });

// --- reload to reset the warned flag, then fill every field ---
await page.goto(ORIGINAL);
await settle(page);
for (const [fid, val] of Object.entries(FILL)) {
  await page.fill(`input.le2-inp[data-zone-fid="${fid}"]`, val);
}
// attributes dropdowns (sweetness / colour / category) + alcohol & volume
await page.evaluate(() => {
  const sels = [...document.querySelectorAll('#le_wire .le2-sel')];
  const want = ['Dry', 'Red', 'Wine'];
  sels.forEach((s, i) => {
    if (want[i] && [...s.options].some((o) => o.text === want[i])) {
      s.value = want[i];
      s.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  document.querySelectorAll('#le_wire .le2-vinp[data-av]').forEach((inp) => {
    inp.value = inp.getAttribute('data-av') === 'alcohol' ? '13.5' : '750';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
});
await page.waitForTimeout(300);

// --- 3. filled editor ---
await page.locator('#labelEditor').scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(SHOTS, '03-front-filled.png'), fullPage: true });

// --- 4. Show Labels -> 6 style options ---
await page.click('#frontPreviewBtn');
await page.waitForSelector('#frontThumbs svg', { timeout: 30000 });
await page.waitForTimeout(1500); // let all six paint with fonts
await page.screenshot({ path: path.join(SHOTS, '04-front-options.png'), fullPage: true });

// save the 6 rendered option SVGs
const options = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('#frontThumbs > *')];
  return cells.map((c) => {
    const svg = c.querySelector('svg');
    const label = (c.innerText || '').split('\n').filter(Boolean).join(' | ');
    return { label, svg: svg ? svg.outerHTML : null };
  });
});
options.forEach((o, i) => {
  if (o.svg) fs.writeFileSync(path.join(SVGS, `option-${i + 1}.svg`), o.svg);
});
fs.writeFileSync(
  path.join(SVGS, 'labels.json'),
  JSON.stringify(options.map((o, i) => ({ i: i + 1, label: o.label, hasSvg: !!o.svg })), null, 2)
);

// --- 5. lightbox (click first option thumbnail) ---
await page.locator('#frontThumbs svg').first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(SHOTS, '05-lightbox.png') });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// --- 6/7. back + bottle tabs ---
for (const tab of ['back', 'bottle']) {
  await page.click(`.tab-btn[data-tab="${tab}"]`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SHOTS, `0${tab === 'back' ? 6 : 7}-${tab}-tab.png`), fullPage: true });
}

// --- 8/9. gallery + about (reached from the TOPNAV links, not tabs) ---
const topnav = page.locator('.topnav a');
await topnav.nth(1).click(); // Gallery
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(SHOTS, '09-gallery.png'), fullPage: true });
// the grid order is intentionally shuffled (Math.random) — record the card SET
// so the comparator can check gallery parity structurally instead of by pixels
const galleryCards = await page.evaluate(() =>
  [...document.querySelectorAll('#galleryGrid > *')]
    .map((c) => (c.innerText || '').trim().replace(/\s+/g, ' '))
    .sort()
);
fs.writeFileSync(path.join(OUT, 'gallery-cards.json'), JSON.stringify(galleryCards, null, 2));
await topnav.nth(0).click(); // About Us
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(SHOTS, '10-about.png'), fullPage: true });

// --- admin drawer ---
await page.goto(ORIGINAL + '?admin=1');
await settle(page);
await page.screenshot({ path: path.join(SHOTS, '08-admin.png'), fullPage: true });

// --- visible-DOM outline (the structural spec) ---
await page.goto(ORIGINAL);
await settle(page);
const outline = await page.evaluate(() => {
  const lines = [];
  function visible(el) {
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }
  function walk(el, depth) {
    if (el.nodeType !== 1) return;
    if (['SCRIPT', 'STYLE', 'DEFS', 'PATH'].includes(el.tagName)) return;
    const vis = visible(el);
    const id = el.id ? '#' + el.id : '';
    const cls = el.classList.length ? '.' + [...el.classList].slice(0, 4).join('.') : '';
    let ownText = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(' ')
      .slice(0, 80);
    lines.push(
      `${'  '.repeat(depth)}${el.tagName.toLowerCase()}${id}${cls}${vis ? '' : '  [HIDDEN]'}${ownText ? '  "' + ownText + '"' : ''}`
    );
    if (el.tagName === 'SVG') return;
    [...el.children].forEach((c) => walk(c, depth + 1));
  }
  walk(document.body, 0);
  return lines.join('\n');
});
fs.writeFileSync(path.join(OUT, 'dom-outline.txt'), outline);

console.log('done. wrote', SHOTS, 'and', SVGS);
await browser.close();
