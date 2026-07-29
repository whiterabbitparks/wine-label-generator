/* Golden-SVG parity check — proves the engine served by the Next.js app produces
   BYTE-IDENTICAL output to the original dist/configurator.html for every golden case.
   Usage: npm run golden:check   (expects the Next app on http://localhost:3199,
   or starts `next dev -p 3199` itself if nothing is listening) */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const GOLDEN = path.join(HERE, 'golden');
const PORT = 3199;
const URL = `http://localhost:${PORT}/engine-test`;

const manifest = JSON.parse(fs.readFileSync(path.join(GOLDEN, 'manifest.json'), 'utf8'));

async function listening() {
  try {
    const r = await fetch(URL, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

let server = null;
if (!(await listening())) {
  console.log('starting next dev on port', PORT);
  server = spawn('npx', ['next', 'dev', '-p', String(PORT)], { cwd: ROOT, stdio: 'pipe' });
  for (let i = 0; i < 60; i++) {
    if (await listening()) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!(await listening())) {
    console.error('next dev never became ready');
    server.kill();
    process.exit(1);
  }
}

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto(URL);
await page.waitForFunction(() => window.__ENGINE_READY__ === true, null, { timeout: 60000 });

let pass = 0, fail = 0;
const failures = [];
for (const c of manifest.cases) {
  const data = manifest.datasets[c.dataset];
  const options = await page.evaluate(
    ([data, order, cfg]) => window.LabelEngine.renderStyleOptions(data, order, cfg),
    [data, manifest.order, { widthMM: c.widthMM, heightMM: c.heightMM, seed: c.seed }]
  );
  const dir = path.join(GOLDEN, `${c.dataset}-w${c.widthMM}h${c.heightMM}-s${c.seed}`);
  for (const o of options) {
    const goldenSvg = fs.readFileSync(path.join(dir, `${o.style}.svg`), 'utf8');
    if (o.svg === goldenSvg) {
      pass++;
    } else {
      fail++;
      failures.push(`${c.dataset} ${c.widthMM}x${c.heightMM} s${c.seed} ${o.style}`);
      const diffDir = path.join(HERE, 'failures');
      fs.mkdirSync(diffDir, { recursive: true });
      fs.writeFileSync(path.join(diffDir, `${c.dataset}-w${c.widthMM}h${c.heightMM}-s${c.seed}-${o.style}.svg`), o.svg);
    }
  }
}

console.log(`\nGOLDEN PARITY: ${pass} identical, ${fail} different`);
if (failures.length) {
  console.log('failures (ported output saved to tests/parity/failures/):');
  failures.forEach((f) => console.log('  -', f));
}

await browser.close();
if (server) server.kill();
process.exit(fail ? 1 : 0);
