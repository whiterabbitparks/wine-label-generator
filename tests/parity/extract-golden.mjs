/* Golden-SVG extraction — records the ORIGINAL engine's exact output for fixed
   inputs. The ported engine must reproduce these byte-for-byte (check-golden.mjs). */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const ORIGINAL = 'file://' + path.join(ROOT, '8k-labels-package/dist/configurator.html');
const OUT = path.join(HERE, 'golden');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// Data shape per CONTINUE-HERE.md §10
const DATASETS = {
  full: {
    producer: 'GRAND VIN', wine: 'Château Margaux', appellation: 'Margaux AOC',
    classification: 'Grand Cru Classé', grape: 'Cabernet Sauvignon',
    region: 'Bordeaux', country: 'France', special: 'Vieilles Vignes',
    vintage: '2018', alcohol: '13.5', volume: '750',
    sweetness: 'Dry', wineType: 'Wine', wineColorName: 'Red', wineColor: '#6E1423',
  },
  minimal: {
    producer: '', wine: 'House Wine', appellation: '', classification: '',
    grape: 'Rkatsiteli', region: 'Kakheti', country: 'Georgia', special: '',
    vintage: '2023', alcohol: '12', volume: '750',
    sweetness: 'N/A', wineType: 'N/A', wineColorName: 'White', wineColor: '#F3ECC9',
  },
};
const ORDER = ['producer','wineName','appellation','grape','vintage','classification','regionCountry','special','attributes','alcVol'];
const SIZES = [ { widthMM: 110, heightMM: 80 }, { widthMM: 80, heightMM: 110 }, { widthMM: 100, heightMM: 80 } ];
const SEEDS = [0, 1, 2, 7];

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto(ORIGINAL);
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => window.LabelEngine.ensureFonts());
await page.waitForTimeout(500);

const manifest = { order: ORDER, datasets: DATASETS, sizes: SIZES, seeds: SEEDS, cases: [] };

for (const [dsName, data] of Object.entries(DATASETS)) {
  for (const size of SIZES) {
    for (const seed of SEEDS) {
      const options = await page.evaluate(
        ([data, order, cfg]) => window.LabelEngine.renderStyleOptions(data, order, cfg),
        [data, ORDER, { ...size, seed }]
      );
      const dir = path.join(OUT, `${dsName}-w${size.widthMM}h${size.heightMM}-s${seed}`);
      fs.mkdirSync(dir, { recursive: true });
      for (const o of options) {
        fs.writeFileSync(path.join(dir, `${o.style}.svg`), o.svg);
      }
      manifest.cases.push({
        dataset: dsName, ...size, seed,
        styles: options.map((o) => ({ style: o.style, name: o.name, desc: o.desc, bytes: o.svg.length })),
      });
      console.log(`${dsName} ${size.widthMM}x${size.heightMM} seed=${seed}: ${options.length} styles`);
    }
  }
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('golden corpus written to', OUT);
await browser.close();
