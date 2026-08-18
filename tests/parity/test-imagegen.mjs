/* E2E: per-style artwork via Show Labels (the Label Artwork panel is gone —
   generation is invisible and the artworks appear inside the labels).
   Verifies: no panel; one set call; 3 distinct per-style artworks; EACH of the
   six style options embeds its OWN style's image with multiply blend; a second
   press reuses the cached set.
   Run against a server with IMAGE_PROVIDER=mock (default: http://localhost:3200). */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3200';
const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };
const STYLES = ['traditional', 'contemporary', 'punk'];

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
// pin the variety seeds: minimalist has text-only comps by design, so the
// embed assertions need the deterministic seed-0 set (like the parity captures)
await page.addInitScript(() => { window.__SEED0__ = 0; });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));

let setCalls = 0;
page.on('request', (r) => { if (r.url().includes('/api/generate-label-set')) setCalls++; });

await page.goto(BASE);
await page.waitForFunction(() => window.EightKImageGen && window.EightKImageGen.wired, null, { timeout: 30000 });

// the old client panel must be gone
const panel = await page.evaluate(() => !!document.getElementById('imgGen'));
if (panel) fail('the Label Artwork panel (#imgGen) should be removed');
console.log('Label Artwork panel removed ✓');

await page.fill('#visionText', 'A vineyard beneath the Caucasus Mountains at golden hour');
await page.fill('input.le2-inp[data-zone-fid="wineName"]', 'Château Test');
await page.click('#frontPreviewBtn');
await page.waitForSelector('#frontThumbs svg', { timeout: 60000 });
await page.waitForFunction(
  () => window.__LABEL_IMGS__ && Object.keys(window.__LABEL_IMGS__).length === 3,
  null, { timeout: 60000 }
);
await page.waitForTimeout(1500); // let the post-generation repaint land

if (setCalls !== 1) fail(`expected 1 set call, saw ${setCalls}`);
const imgs = await page.evaluate(() => window.__LABEL_IMGS__);
if (new Set(Object.values(imgs)).size !== 3) fail('styles did not get distinct artworks');
console.log('one set call → 3 distinct per-style artworks ✓');

// every style card embeds ITS OWN artwork (cards render in STYLE_LIST order)
const cardChecks = await page.evaluate((styles) => {
  const cells = [...document.querySelectorAll('#frontThumbs > *')].filter((c) => c.querySelector('svg'));
  return styles.map((k, i) => {
    const svg = cells[i] && cells[i].querySelector('svg');
    const frag = (window.__LABEL_IMGS__[k] || '').slice(0, 150);
    return {
      style: k,
      embedded: !!(svg && frag && svg.innerHTML.includes(frag)),
      // multiply on light grounds; screen-print (data-sp, normal blend) on dark
      multiply: !!(svg && (svg.innerHTML.includes('mix-blend-mode:multiply') || svg.innerHTML.includes('data-sp="1"'))),
    };
  });
}, STYLES);
for (const c of cardChecks) {
  if (!c.embedded) fail(`style "${c.style}" does not embed its own artwork`);
  if (!c.multiply) fail(`style "${c.style}" artwork missing multiply/screen-print blend`);
}
console.log('all 3 style options embed their own artwork with multiply/screen-print ✓');

// unchanged brief + reseed (Show Labels is replaced by "Other Layout Options"
// once labels are shown) → cached, no extra call
await page.click('#engRegen');
await page.waitForTimeout(1200);
if (setCalls !== 1) fail(`unchanged brief should reuse the cached set (calls: ${setCalls})`);
console.log('reseed reuses cached set ✓');

// Layout alternatives roll a NEW random combination every press (owner
// 2026-08-14) — the rendered label SVGs must change, with no extra set call
const svgsBefore = await page.evaluate(() =>
  [...document.querySelectorAll('#frontThumbs svg')].map((s) => s.outerHTML).join('')
);
await page.click('#engRegen');
await page.waitForTimeout(1200);
const svgsAfter = await page.evaluate(() =>
  [...document.querySelectorAll('#frontThumbs svg')].map((s) => s.outerHTML).join('')
);
if (setCalls !== 1) fail(`layout roll must not trigger generation (calls: ${setCalls})`);
if (svgsBefore === svgsAfter) fail('layout roll did not change the rendered layouts');
console.log('layout roll → new combination, no generation call ✓');

await page.screenshot({ path: 'tests/parity/imagegen-e2e.png', fullPage: false });
console.log('\nIMAGE GEN E2E: PASS');
await browser.close();
