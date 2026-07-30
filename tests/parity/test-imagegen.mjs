/* E2E: the client "Generate artwork" flow against the backend mock provider.
   Types a vision, clicks #ig_go, verifies the preview + label slot update, then
   Show Labels and confirms the Traditional option embeds the generated image. */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3200';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));

await page.goto(BASE);
await page.waitForSelector('#ig_go', { timeout: 30000 });
await page.fill('#visionText', 'A vineyard beneath the Caucasus Mountains at golden hour');
await page.click('#ig_go');

// provider round-trip: __LABEL_IMG__ set + preview visible
await page.waitForFunction(() => !!window.__LABEL_IMG__, null, { timeout: 30000 });
const img = await page.evaluate(() => window.__LABEL_IMG__);
console.log('label image set:', img.slice(0, 40) + '…', `(${img.length} bytes)`);
if (!img.startsWith('data:image/svg+xml;base64,')) throw new Error('unexpected image format from mock provider');
await page.waitForSelector('#ig_preview.on', { timeout: 10000 });
console.log('preview panel shown ✓');

// one variant per art-direction preset, clicking one selects it as THE artwork
await page.waitForFunction(() => document.querySelectorAll('#ig_variants .ig-var').length === 5, null, { timeout: 30000 });
console.log('5 art-direction variants rendered ✓');
const secondSrc = await page.evaluate(() => document.querySelectorAll('#ig_variants .ig-var img')[1].src);
await page.locator('#ig_variants .ig-var').nth(1).click();
const selected = await page.evaluate(() => window.__LABEL_IMG__);
if (selected !== secondSrc) throw new Error('clicking a variant did not select it as the label artwork');
const selMarked = await page.evaluate(() => document.querySelectorAll('#ig_variants .ig-var')[1].classList.contains('sel'));
if (!selMarked) throw new Error('selected variant not visually marked');
console.log('variant click selects artwork + marks selection ✓');

// determinism: same vision → same image; changed vision → different image
const again = await page.evaluate(() => window.EightKImageGen.generate());
if (again !== img) throw new Error('mock not deterministic for same vision');
console.log('same vision → identical image ✓');
await page.fill('#visionText', 'A drunken unicorn raising a toast');
const changed = await page.evaluate(() => window.EightKImageGen.generate());
if (changed === img) throw new Error('mock did not vary with vision');
console.log('changed vision → different image ✓');

// the generated image must flow into the Traditional label option
await page.fill('input.le2-inp[data-zone-fid="wineName"]', 'Château Test');
await page.click('#frontPreviewBtn');
await page.waitForSelector('#frontThumbs svg', { timeout: 30000 });
await page.waitForTimeout(1000);
const usesGenerated = await page.evaluate(() => {
  const svgs = [...document.querySelectorAll('#frontThumbs svg')];
  return svgs.some((s) => s.innerHTML.includes(window.__LABEL_IMG__.slice(0, 200)));
});
if (!usesGenerated) throw new Error('generated image not embedded in any label option');
console.log('generated image embedded in label options ✓');

await page.screenshot({ path: 'tests/parity/imagegen-e2e.png', fullPage: false });
console.log('\nIMAGE GEN E2E: PASS');
await browser.close();
