/* E2E for auto-generation on Show Labels (per-style set flow):
   1. NO story, one field + Show Labels -> one set call (server builds the
      subject from the wine facts), 6 artworks, traditional embedded
   2. "Other Layout Options" (reseed) -> NO extra call (brief unchanged)
   3. adding a story + reseed -> exactly one MORE call, artwork changes
   Run against a server with IMAGE_PROVIDER=mock (default: http://localhost:3200). */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3200';
const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
// pin the variety seeds: minimalist has text-only comps by design, so the
// embed assertions need the deterministic seed-0 set (like the parity captures)
await page.addInitScript(() => { window.__SEED0__ = 0; });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));

let setCalls = 0;
page.on('request', (r) => { if (r.url().includes('/api/generate-label-set')) setCalls++; });

await page.goto(BASE);
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => window.EightKImageGen && window.EightKImageGen.wired, null, { timeout: 30000 });
await page.waitForTimeout(500);

// no story — just a wine name, then Show Labels. The artwork must still
// auto-generate (subject falls back to the wine facts server-side).
await page.fill('input.le2-inp[data-zone-fid="wineName"]', 'Château Test');
await page.click('#frontPreviewBtn');
await page.waitForSelector('#frontThumbs svg', { timeout: 60000 });
await page.waitForTimeout(800);

if (setCalls !== 1) fail(`expected 1 set call after Show Labels, saw ${setCalls}`);
const imgs = await page.evaluate(() => window.__LABEL_IMGS__ || {});
if (Object.keys(imgs).length !== 6) fail(`expected 6 per-style artworks, saw ${Object.keys(imgs).length}`);
const embedded = await page.evaluate(() => {
  const svgs = [...document.querySelectorAll('#frontThumbs svg')];
  const frag = (window.__LABEL_IMGS__.traditional || '').slice(0, 200);
  return frag && svgs.some((s) => s.innerHTML.includes(frag));
});
if (!embedded) fail('traditional artwork not embedded in the label options');
console.log('auto-generate without a story: 1 set call, 6 artworks, embedded ✓');

// reseed with an unchanged brief — must NOT regenerate
await page.click('#engRegen');
await page.waitForTimeout(1200);
if (setCalls !== 1) fail(`reseed should not regenerate (calls: ${setCalls})`);
console.log('reseed reuses the artwork set (no extra call) ✓');

// add a story + reseed — must regenerate exactly once, with new artwork
await page.fill('#visionText', 'A drunken unicorn raising a toast');
await page.click('#engRegen');
await page.waitForFunction((prev) => {
  const t = (window.__LABEL_IMGS__ || {}).traditional;
  return t && t !== prev;
}, imgs.traditional, { timeout: 60000 });
await page.waitForTimeout(500);
if (setCalls !== 2) fail(`changed story should regenerate once (calls: ${setCalls})`);
console.log('changed story regenerates once, artwork updated ✓');

console.log('\nAUTO-GEN E2E: PASS');
await browser.close();
