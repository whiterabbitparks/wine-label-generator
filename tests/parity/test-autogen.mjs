/* E2E for auto-generation on Show Labels:
   1. typing a story + Show Labels -> exactly ONE generation call, artwork in labels
   2. "Other Layout Options" (reseed) -> NO extra call (signature unchanged)
   3. changing the story + reseed -> exactly one MORE call
   Run against a server with IMAGE_PROVIDER=mock (default: http://localhost:3200). */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3200';
const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));

let genCalls = 0;
page.on('request', (r) => { if (r.url().includes('/api/generate-label-image')) genCalls++; });

await page.goto(BASE);
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => !!(window.EightKImageGen && window.EightKImageGen.generateIfNeeded), null, { timeout: 30000 });
await page.waitForTimeout(800);

// story + one field, then Show Labels — artwork should generate automatically
await page.fill('#visionText', 'A vineyard beneath the Caucasus Mountains');
await page.fill('input.le2-inp[data-zone-fid="wineName"]', 'Château Test');
await page.click('#frontPreviewBtn');
await page.waitForSelector('#frontThumbs svg', { timeout: 60000 });
await page.waitForTimeout(800);

if (genCalls !== 1) fail(`expected 1 generation call after Show Labels, saw ${genCalls}`);
const img = await page.evaluate(() => window.__LABEL_IMG__ || '');
if (!img.startsWith('data:image/')) fail('__LABEL_IMG__ not set by auto-generation');
const embedded = await page.evaluate(() => {
  const svg = document.querySelector('#frontThumbs svg');
  return svg ? svg.innerHTML.includes('<image') : false;
});
if (!embedded) fail('generated artwork not embedded in the first label option');
console.log('auto-generate on Show Labels: 1 call, artwork embedded ✓');

// reseed with the same story — must NOT regenerate
await page.click('#engRegen');
await page.waitForTimeout(1200);
if (genCalls !== 1) fail(`reseed should not regenerate (calls: ${genCalls})`);
console.log('reseed reuses artwork (no extra call) ✓');

// changed story + reseed — must regenerate exactly once
await page.fill('#visionText', 'A drunken unicorn raising a toast');
await page.click('#engRegen');
await page.waitForTimeout(2000);
if (genCalls !== 2) fail(`changed story should regenerate once (calls: ${genCalls})`);
const img2 = await page.evaluate(() => window.__LABEL_IMG__ || '');
if (img2 === img) fail('artwork did not change for a new story');
console.log('changed story regenerates once, artwork updated ✓');

console.log('\nAUTO-GEN E2E: PASS');
await browser.close();
