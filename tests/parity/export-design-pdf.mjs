/* Renders docs/DESIGN.md to docs/DESIGN.pdf via marked + headless Chrome print. */
import { chromium } from 'playwright';
import { marked } from 'marked';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const md = fs.readFileSync(path.join(ROOT, 'docs/DESIGN.md'), 'utf8');

const body = marked.parse(md, { gfm: true });
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  :root { color: #1e1e1e; }
  body { font: 10.5pt/1.55 Georgia, 'Times New Roman', serif; max-width: 100%; margin: 0; }
  h1 { font-size: 22pt; border-bottom: 2.5pt solid #5a6b3b; padding-bottom: 8px; margin: 0 0 14px; }
  h2 { font-size: 14.5pt; color: #3f4d2a; border-bottom: 0.75pt solid #c9c9c2; padding-bottom: 3px; margin-top: 26px; page-break-after: avoid; }
  h3 { font-size: 11.5pt; color: #3f4d2a; margin-top: 18px; page-break-after: avoid; }
  code { font: 8.5pt/1.4 'SF Mono', Menlo, Consolas, monospace; background: #f2f1ec; padding: 1px 4px; border-radius: 3px; }
  pre { background: #f2f1ec; border: 0.75pt solid #ddd; border-radius: 6px; padding: 10px 12px; overflow-x: hidden; white-space: pre-wrap; page-break-inside: avoid; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 9.5pt; page-break-inside: avoid; }
  th, td { border: 0.75pt solid #bbb; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #e9ead9; }
  blockquote { border-left: 3pt solid #5a6b3b; margin: 10px 0; padding: 2px 14px; color: #444; font-style: italic; background: #f7f6f0; }
  hr { border: none; border-top: 0.75pt solid #c9c9c2; margin: 20px 0; }
  li { margin: 3px 0; }
  strong { color: #2c2c28; }
</style></head><body>${body}</body></html>`;

const tmp = path.join(ROOT, 'docs/.design-tmp.html');
fs.writeFileSync(tmp, html);

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.goto('file://' + tmp);
await page.pdf({
  path: path.join(ROOT, 'docs/DESIGN.pdf'),
  format: 'A4',
  margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate:
    '<div style="width:100%;font:7pt Georgia,serif;color:#888;text-align:center;">8K Labels — Design Document · <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
  printBackground: true,
});
await browser.close();
fs.rmSync(tmp);
console.log('wrote docs/DESIGN.pdf');
