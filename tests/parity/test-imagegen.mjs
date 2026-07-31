/* E2E: the client "Generate artwork" flow against the backend mock provider.
   Types a vision, clicks #ig_go, verifies the per-style set arrives (one
   artwork per label style), the preview updates, and the Traditional label
   option embeds the traditional artwork.
   Run against a server with IMAGE_PROVIDER=mock (default: http://localhost:3200). */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3200';
const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));

let setCalls = 0;
page.on('request', (r) => { if (r.url().includes('/api/generate-label-set')) setCalls++; });

await page.goto(BASE);
await page.waitForSelector('#ig_go', { timeout: 30000 });
await page.waitForFunction(() => window.EightKImageGen && window.EightKImageGen.wired, null, { timeout: 30000 });
await page.fill('#visionText', 'A vineyard beneath the Caucasus Mountains at golden hour');
await page.click('#ig_go');

// set round-trip: one artwork per style, all six present and distinct
await page.waitForFunction(
  () => window.__LABEL_IMGS__ && Object.keys(window.__LABEL_IMGS__).length === 6,
  null, { timeout: 60000 }
);
if (setCalls !== 1) fail(`expected 1 set call, saw ${setCalls}`);
const imgs = await page.evaluate(() => window.__LABEL_IMGS__);
const keys = Object.keys(imgs).sort();
const want = ['artistic', 'contemporary', 'flora', 'minimalist', 'premium', 'traditional'];
if (JSON.stringify(keys) !== JSON.stringify(want)) fail(`style keys mismatch: ${keys}`);
for (const [k, v] of Object.entries(imgs))
  if (!v.startsWith('data:image/')) fail(`style ${k} image is not a data URL`);
if (new Set(Object.values(imgs)).size !== 6) fail('styles did not get distinct artworks');
console.log('6 distinct per-style artworks generated ✓');

// __LABEL_IMG__ (legacy single slot) mirrors the traditional artwork
const main = await page.evaluate(() => window.__LABEL_IMG__);
if (main !== imgs.traditional) fail('__LABEL_IMG__ is not the traditional artwork');
await page.waitForSelector('#ig_preview.on', { timeout: 10000 });
console.log('preview panel shows traditional artwork ✓');

// one thumbnail per style, captioned with the style name
const thumbs = await page.evaluate(() =>
  [...document.querySelectorAll('#ig_variants .ig-var .cap')].map((c) => c.textContent)
);
if (thumbs.length !== 6) fail(`expected 6 style thumbnails, saw ${thumbs.length}`);
if (!thumbs.some((t) => t.includes('Traditional'))) fail('thumbnails missing style names');
console.log('6 style thumbnails with captions ✓');

// determinism / cache: same brief again → images unchanged
await page.click('#ig_go');
await page.waitForFunction(() => !document.querySelector('#ig_go[disabled]'), null, { timeout: 60000 });
const again = await page.evaluate(() => window.__LABEL_IMGS__);
if (JSON.stringify(again) !== JSON.stringify(imgs)) fail('same brief did not reuse the same artworks');
console.log('same brief → identical set (mock deterministic) ✓');

// the traditional artwork must flow into the label options
await page.fill('input.le2-inp[data-zone-fid="wineName"]', 'Château Test');
await page.click('#frontPreviewBtn');
await page.waitForSelector('#frontThumbs svg', { timeout: 30000 });
await page.waitForTimeout(1000);
const usesGenerated = await page.evaluate(() => {
  const svgs = [...document.querySelectorAll('#frontThumbs svg')];
  const frag = window.__LABEL_IMGS__.traditional.slice(0, 200);
  return svgs.some((s) => s.innerHTML.includes(frag));
});
if (!usesGenerated) fail('traditional artwork not embedded in the label options');
console.log('traditional artwork embedded in label options ✓');

// multiply blend applied to the embedded artwork
const blended = await page.evaluate(() => {
  const svgs = [...document.querySelectorAll('#frontThumbs svg')];
  return svgs.some((s) => s.innerHTML.includes('mix-blend-mode:multiply'));
});
if (!blended) fail('embedded artwork missing multiply blend');
console.log('multiply blend on embedded artwork ✓');

await page.screenshot({ path: 'tests/parity/imagegen-e2e.png', fullPage: false });
console.log('\nIMAGE GEN E2E: PASS');
await browser.close();
