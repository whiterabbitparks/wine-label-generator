/* E2E: per-style artwork via Show Labels (the Label Artwork panel is gone —
   generation is invisible and the artworks appear inside the labels).
   Verifies: no panel; one set call; 6 distinct per-style artworks; EACH of the
   six style options embeds its OWN style's image with multiply blend; a second
   press reuses the cached set.
   Run against a server with IMAGE_PROVIDER=mock (default: http://localhost:3200). */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3200';
const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };
const STYLES = ['traditional', 'contemporary', 'flora', 'premium', 'minimalist', 'artistic'];

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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
  () => window.__LABEL_IMGS__ && Object.keys(window.__LABEL_IMGS__).length === 6,
  null, { timeout: 60000 }
);
await page.waitForTimeout(1500); // let the post-generation repaint land

if (setCalls !== 1) fail(`expected 1 set call, saw ${setCalls}`);
const imgs = await page.evaluate(() => window.__LABEL_IMGS__);
if (new Set(Object.values(imgs)).size !== 6) fail('styles did not get distinct artworks');
console.log('one set call → 6 distinct per-style artworks ✓');

// every style card embeds ITS OWN artwork (cards render in STYLE_LIST order)
const cardChecks = await page.evaluate((styles) => {
  const cells = [...document.querySelectorAll('#frontThumbs > *')].filter((c) => c.querySelector('svg'));
  return styles.map((k, i) => {
    const svg = cells[i] && cells[i].querySelector('svg');
    const frag = (window.__LABEL_IMGS__[k] || '').slice(0, 150);
    return {
      style: k,
      embedded: !!(svg && frag && svg.innerHTML.includes(frag)),
      multiply: !!(svg && svg.innerHTML.includes('mix-blend-mode:multiply')),
    };
  });
}, STYLES);
for (const c of cardChecks) {
  if (!c.embedded) fail(`style "${c.style}" does not embed its own artwork`);
  if (!c.multiply) fail(`style "${c.style}" artwork missing multiply blend`);
}
console.log('all 6 style options embed their own artwork with multiply ✓');

// unchanged brief + reseed (Show Labels is replaced by "Other Layout Options"
// once labels are shown) → cached, no extra call
await page.click('#engRegen');
await page.waitForTimeout(1200);
if (setCalls !== 1) fail(`unchanged brief should reuse the cached set (calls: ${setCalls})`);
console.log('reseed reuses cached set ✓');

// "New artwork" bumps the generation seed → exactly ONE new set call and at
// least one style's artwork changes (owner 2026-08-14: layouts stay put,
// artwork re-rolls; this is the single deliberate paid action)
const beforeNew = await page.evaluate(() => ({ ...window.__LABEL_IMGS__ }));
await page.click('#engNewArt');
await page.waitForFunction(
  () => !document.querySelector('#engNewArt') || !document.querySelector('#engNewArt').disabled,
  null, { timeout: 60000 }
);
await page.waitForTimeout(1200);
if (setCalls !== 2) fail(`New artwork should trigger exactly one more set call (calls: ${setCalls})`);
const afterNew = await page.evaluate(() => ({ ...window.__LABEL_IMGS__ }));
if (!Object.keys(afterNew).some((k) => afterNew[k] !== beforeNew[k]))
  fail('New artwork did not change any style artwork');
console.log('New artwork → one new set call, artwork changed ✓');

await page.screenshot({ path: 'tests/parity/imagegen-e2e.png', fullPage: false });
console.log('\nIMAGE GEN E2E: PASS');
await browser.close();
