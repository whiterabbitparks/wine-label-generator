/* Pixel-compare the ported app's screenshots against the original's reference set. */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REF = path.join(HERE, 'reference/screenshots');
const PORTED = path.join(HERE, 'ported/screenshots');
const DIFF = path.join(HERE, 'diff');
fs.rmSync(DIFF, { recursive: true, force: true });
fs.mkdirSync(DIFF, { recursive: true });

function pad(png, w, h) {
  if (png.width === w && png.height === h) return png;
  const out = new PNG({ width: w, height: h, fill: true });
  PNG.bitblt(png, out, 0, 0, png.width, png.height, 0, 0);
  return out;
}

// the gallery grid order is intentionally random (Fisher–Yates in shell.js), so
// pixels can't match run-to-run — its parity is checked structurally below instead
const NONDETERMINISTIC = new Set(['09-gallery.png']);

let worst = 0;
const rows = [];
for (const f of fs.readdirSync(REF).filter((f) => f.endsWith('.png')).sort()) {
  if (NONDETERMINISTIC.has(f)) {
    const a = JSON.stringify(JSON.parse(fs.readFileSync(path.join(HERE, 'reference/gallery-cards.json'))));
    const b = JSON.stringify(JSON.parse(fs.readFileSync(path.join(HERE, 'ported/gallery-cards.json'))));
    if (a === b) {
      rows.push([f, 'card set IDENTICAL (order is random by design — pixel diff skipped)']);
    } else {
      rows.push([f, 'CARD SET DIFFERS']);
      worst = 100;
    }
    continue;
  }
  const portedFile = path.join(PORTED, f);
  if (!fs.existsSync(portedFile)) {
    rows.push([f, 'MISSING in ported']);
    worst = 100;
    continue;
  }
  const a = PNG.sync.read(fs.readFileSync(path.join(REF, f)));
  const b = PNG.sync.read(fs.readFileSync(portedFile));
  const w = Math.max(a.width, b.width);
  const h = Math.max(a.height, b.height);
  const pa = pad(a, w, h);
  const pb = pad(b, w, h);
  const diff = new PNG({ width: w, height: h });
  const n = pixelmatch(pa.data, pb.data, diff.data, w, h, { threshold: 0.1 });
  const pct = (100 * n) / (w * h);
  worst = Math.max(worst, pct);
  if (n > 0) fs.writeFileSync(path.join(DIFF, f), PNG.sync.write(diff));
  const sizeNote = a.width === b.width && a.height === b.height ? '' : `  [size ${a.width}x${a.height} vs ${b.width}x${b.height}]`;
  rows.push([f, pct.toFixed(3) + '% pixels differ' + sizeNote]);
}

for (const [f, msg] of rows) console.log(f.padEnd(28), msg);
console.log('\nworst state:', worst.toFixed(3) + '%', worst < 0.5 ? '(PASS <0.5%)' : '(needs inspection — see tests/parity/diff/)');
process.exit(worst < 0.5 ? 0 : 1);
