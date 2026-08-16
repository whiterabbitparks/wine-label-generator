/* HARD-RULES VERIFIER (owner rules, 2026-08-15/16). Renders every style
   across seeds and label sizes with full demo data and measures the ACTUAL
   geometry:
     1. 5mm margin  — no visual element crosses it (background rect excluded);
     2. 7pt floor   — no font-size below 7pt;
     3. 1mm text gap — no two text blocks closer than 1mm;
     4. ≤3 typefaces — no label uses more than 3 font FAMILIES (weights and
        italics of one family count as one). Checked unhinted AND under
        tracer hints (one distinctive family per role, faces the comps never
        use as designed fallbacks) — a 4th family under tracer hints means a
        hard-coded face is bypassing the hero/secondary/small role system.
   Text is measured as INK (canvas actualBoundingBox*), the same metric the
   engine positions by — DOM boxes include font leading and would misreport.
   Run: node tests/parity/check-hard-rules.mjs */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = fs.readFileSync(path.join(HERE, '../../public/engine/label-engine.js'), 'utf8');

const DATA = {
  producer: 'GRAND VIN', wine: 'Château Margaux', appellation: 'Margaux AOC',
  grape: 'Cabernet Sauvignon', region: 'Bordeaux', country: 'France',
  special: 'Vieilles Vignes', vintage: '2018', classification: 'Grand Cru Classé',
  sweetness: 'Dry', wineColorName: 'Red', wineType: 'Still Wine', alcohol: '12.5', volume: '750',
};
const SIZES = [[110, 80], [100, 70], [80, 60]];
const SEEDS = [0, 1, 2, 7, 42, 999, 31337, 4242];

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.setContent('<body></body>');
await page.addScriptTag({ content: ENGINE });
await page.evaluate(() => window.LabelEngine.ensureFonts());
await page.waitForTimeout(3000);

const failures = await page.evaluate(({ DATA, SIZES, SEEDS }) => {
  const U = 25.4 / 72 * 10;
  const MIN7 = 7 * U, SM = 50, MINGAP = 10, EPS = 1.5;
  const out = [];
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cv = document.createElement('canvas'); const cx2 = cv.getContext('2d');

  /* ink box of one <text> from its markup, canvas-measured */
  function textInkBox(el) {
    const size = +el.getAttribute('font-size');
    const fam = el.getAttribute('font-family') || 'serif';
    const w = el.getAttribute('font-weight') || 400;
    const it = el.getAttribute('font-style') === 'italic';
    const ls = +(el.getAttribute('letter-spacing') || 0);
    const t = el.textContent || '';
    cx2.font = `${w} ${size}px ${fam}`;   // upright ink, matching the engine
    const m = cx2.measureText(t);
    const wid = m.width + (ls ? ls * Math.max(0, t.length - 1) : 0);
    const asc = m.actualBoundingBoxAscent ?? size * 0.8;
    const desc = m.actualBoundingBoxDescent ?? size * 0.2;
    const x = +el.getAttribute('x'), y = +el.getAttribute('y');
    const anchor = el.getAttribute('text-anchor') || 'start';
    const x0 = anchor === 'middle' ? x - wid / 2 : anchor === 'end' ? x - wid : x;
    let box = { x: x0, y: y - asc, x2: x0 + wid, y2: y + desc };
    const tr = el.getAttribute('transform');
    const rot = tr && tr.match(/rotate\(\s*(-?[\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/);
    if (rot) {
      const a = (+rot[1]) * Math.PI / 180, cxp = +rot[2], cyp = +rot[3];
      const pts = [[box.x, box.y], [box.x2, box.y], [box.x, box.y2], [box.x2, box.y2]].map(([px, py]) => {
        const dx = px - cxp, dy = py - cyp;
        return [cxp + dx * Math.cos(a) - dy * Math.sin(a), cyp + dx * Math.sin(a) + dy * Math.cos(a)];
      });
      box = { x: Math.min(...pts.map(p => p[0])), y: Math.min(...pts.map(p => p[1])),
              x2: Math.max(...pts.map(p => p[0])), y2: Math.max(...pts.map(p => p[1])) };
    }
    return box;
  }
  const union = (boxes) => boxes.length ? {
    x: Math.min(...boxes.map(b => b.x)), y: Math.min(...boxes.map(b => b.y)),
    x2: Math.max(...boxes.map(b => b.x2)), y2: Math.max(...boxes.map(b => b.y2)),
  } : null;

  for (const [wMM, hMM] of SIZES) {
    const W = wMM * 10, H = hMM * 10;
    for (const seed of SEEDS) {
      const opts = window.LabelEngine.renderStyleOptions(DATA, null, { widthMM: wMM, heightMM: hMM, seed });
      for (const o of opts) {
        const tag = `${o.style} ${wMM}x${hMM} seed=${seed}`;
        if (o.svg.includes('fill="#a33"')) out.push(tag + ': COMPOSITION CRASHED (error fallback rendered)');
        for (const m of o.svg.matchAll(/font-size="([\d.]+)"/g))
          if (+m[1] < MIN7 - 0.05) out.push(`${tag}: font ${(+m[1] / U).toFixed(2)}pt < 7pt`);
        const fams = new Set([...o.svg.matchAll(/font-family="([^"]+)"/g)]
          .map((m) => (m[1].match(/'([^']+)'/) || [, m[1].split(',')[0].trim()])[1]));
        if (fams.size > 3) out.push(`${tag}: ${fams.size} font families (max 3) — ${[...fams].join(' · ')}`);
        host.innerHTML = o.svg;
        const svg = host.querySelector('svg');
        const sr = svg.getBoundingClientRect();
        const toU = (r) => ({ x: (r.left - sr.left) / sr.width * W, y: (r.top - sr.top) / sr.height * H,
                              x2: (r.right - sr.left) / sr.width * W, y2: (r.bottom - sr.top) / sr.height * H });

        const blocks = [];
        for (const g of svg.querySelectorAll('g[data-tb]')) {
          const u = union([...g.querySelectorAll('text')].map(textInkBox));
          if (u) blocks.push({ ...u, t: (g.textContent || '').trim().slice(0, 16) });
        }
        for (const el of svg.querySelectorAll('text')) {
          if (el.closest('g[data-tb]') || el.closest('defs')) continue;
          if (el.querySelector('textPath')) {
            const u = toU(el.getBoundingClientRect());
            blocks.push({ ...u, t: 'arc:' + (el.textContent || '').trim().slice(0, 12) });
          } else blocks.push({ ...textInkBox(el), t: (el.textContent || '').trim().slice(0, 16) });
        }
        for (const b of blocks)
          if (b.x < SM - EPS || b.y < SM - EPS || b.x2 > W - SM + EPS || b.y2 > H - SM + EPS)
            out.push(`${tag}: text [${b.t}] crosses margin [${(b.x / 10).toFixed(1)},${(b.y / 10).toFixed(1)},${(b.x2 / 10).toFixed(1)},${(b.y2 / 10).toFixed(1)}]mm`);
        for (const el of svg.querySelectorAll('image,path,line,circle,rect')) {
          if (el.closest('defs')) continue;
          if (el.tagName === 'rect' && +el.getAttribute('x') < 0) continue;
          const r = el.getBoundingClientRect(); if (!r.width && !r.height) continue;
          const u = toU(r);
          const sw = +(el.getAttribute('stroke-width') || 0) / 2;
          if (u.x - sw < SM - EPS || u.y - sw < SM - EPS || u.x2 + sw > W - SM + EPS || u.y2 + sw > H - SM + EPS)
            out.push(`${tag}: <${el.tagName}> crosses margin [${(u.x / 10).toFixed(1)},${(u.y / 10).toFixed(1)},${(u.x2 / 10).toFixed(1)},${(u.y2 / 10).toFixed(1)}]mm`);
        }
        for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
          const a = blocks[i], b = blocks[j];
          const dx = Math.max(a.x - b.x2, b.x - a.x2, 0);
          const dy = Math.max(a.y - b.y2, b.y - a.y2, 0);
          const gap = Math.max(dx, dy);
          if (gap < MINGAP - EPS)
            out.push(`${tag}: [${a.t}] vs [${b.t}] ${gap === 0 ? 'OVERLAP' : (gap / 10).toFixed(2) + 'mm'}`);
        }
      }
    }
  }
  /* pass 2 — tracer hints: any designed family that still shows through is a
     hard-coded face bypassing the role picks (Girassol/Felipa/Estonia are
     never used as designed faces in the 3-style comps). Seeds sweep far
     enough to land on every comp of every style. */
  const TRACER = {};
  for (const s of ['traditional', 'contemporary', 'punk'])
    TRACER[s] = { heroFonts: [["'Girassol', serif", 400, null]],
                  secondaryFonts: [["'Felipa', cursive", 400, null]],
                  smallFonts: [["'Estonia', cursive", 400, null]] };
  window.LabelEngine.setStyleHints(TRACER);
  const seenV = new Set();
  for (let seed = 0; seed < 300; seed++) {
    const opts = window.LabelEngine.renderStyleOptions(DATA, null, { widthMM: 110, heightMM: 80, seed });
    for (const o of opts) {
      const vk = o.style + ':' + window.LabelEngine.variantFor(o.style, seed);
      if (seenV.has(vk)) continue;
      seenV.add(vk);
      const fams = new Set([...o.svg.matchAll(/font-family="([^"]+)"/g)]
        .map((m) => (m[1].match(/'([^']+)'/) || [, m[1].split(',')[0].trim()])[1]));
      if (fams.size > 3)
        out.push(`${o.style} comp#${window.LabelEngine.variantFor(o.style, seed) + 1} (hinted): ${fams.size} font families (max 3) — ${[...fams].join(' · ')}`);
    }
  }
  window.LabelEngine.setStyleHints({});
  return out;
}, { DATA, SIZES, SEEDS });

await browser.close();
const uniq = [...new Set(failures)];
if (uniq.length) {
  console.error(`HARD RULES: ${uniq.length} violation(s)`);
  uniq.slice(0, 40).forEach((f) => console.error('  ' + f));
  process.exit(1);
}
console.log(`HARD RULES: PASS (margin 5mm · fonts ≥7pt · text gap ≥1mm · ≤3 typefaces) across ${SIZES.length} sizes × ${SEEDS.length} seeds × 3 styles`);
