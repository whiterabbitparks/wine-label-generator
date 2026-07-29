/* ============================================================================
   8K Labels — layout verifier (current composition engine)
   Renders every option across a matrix of label sizes × regenerate rounds in a
   headless Chromium and checks:
     • no text element crosses the 5mm safety margin
     • no two text elements overlap (the halo/solid twin of over-image text is
       de-duplicated so it isn't counted as an overlap)
     • the artboard is the real trim size and the background bleeds 2mm beyond it
   Requires: npm i -D playwright   (Chromium available on PATH or PLAYWRIGHT).
   Run:  node tests/verify.js
   ============================================================================ */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src');
const engine = fs.readFileSync(path.join(SRC, 'label-engine.js'), 'utf8');
const img    = fs.existsSync(path.join(SRC,'img-data.js')) ? fs.readFileSync(path.join(SRC,'img-data.js'),'utf8') : '';

// realistic sample data (matches the editor defaults; producer/wine swapped per the green-box mapping)
const d = {producer:'Grand Vin', wine:'Château Margaux', appellation:'Margaux AOC',
  classification:'Premier Grand Cru Classé', grape:'Cabernet Sauvignon, Merlot', region:'Bordeaux',
  country:'France', special:'Vieilles Vignes', vintage:'2018', alcohol:'13.5%', volume:'750 ml',
  sweetness:'Dry', wineType:'Wine', wineColorName:'Red'};
// current field order (rank -> field). grape & classification swapped; rank7 = Region&Country, rank8 = Special.
const order = ['producer','wineName','appellation','grape','vintage','classification','regionCountry','special','attributes','alcVol'];
const DIMS = [[100,80],[110,80],[80,110],[80,140],[90,130],[120,90]];
const SEEDS = 8;

(async () => {
  const b = await chromium.launch({args:['--no-sandbox']}).catch(()=>chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']}));
  const pg = await b.newPage();
  await pg.setContent('<!doctype html><meta charset="utf8"><body></body>');
  await pg.addScriptTag({content: img});
  await pg.addScriptTag({content: engine});

  const report = await pg.evaluate(({d, order, DIMS, SEEDS}) => {
    const out = [];
    for (const [W,H] of DIMS) for (let seed=0; seed<SEEDS; seed++) {
      const opts = window.LabelEngine.renderPriorityOptions(d, order.slice(), {widthMM:W, heightMM:H, seed});
      for (const o of opts) {
        const host = document.createElement('div'); document.body.appendChild(host);
        host.innerHTML = o.svg; const svg = host.querySelector('svg');
        const vb = svg.getAttribute('viewBox').split(' ').map(Number), AW = vb[2], AH = vb[3], M = 50;
        // artboard must equal the real trim size, and the bg rect must bleed 2mm (-20) beyond it
        if (Math.round(AW) !== W*10 || Math.round(AH) !== H*10) out.push(`${W}x${H} s${seed} ${o.rank}: artboard ${AW}x${AH} != ${W*10}x${H*10}`);
        const bg = svg.querySelector('rect');
        if (bg && +bg.getAttribute('x') > -19) out.push(`${W}x${H} s${seed} ${o.rank}: background not bleeding`);
        // de-duplicate the over-image halo twins (same string at the same position)
        const seen = new Set();
        const bx = [...svg.querySelectorAll('text')].filter(t=>!t.getAttribute('transform'))
          .map(t=>({b:t.getBBox(), s:t.textContent}))
          .filter(o=>{const k=o.s+'|'+Math.round(o.b.x)+'|'+Math.round(o.b.y); if(seen.has(k))return false; seen.add(k); return true;});
        // margin
        for (const {b,s} of bx) if (b.x<M-4 || b.x+b.width>AW-M+4 || b.y<M-4 || b.y+b.height>AH-M+4)
          out.push(`${W}x${H} s${seed} ${o.rank}: "${s.slice(0,16)}" outside 5mm margin`);
        // overlap
        for (let i=0;i<bx.length;i++) for (let j=i+1;j<bx.length;j++){
          const a=bx[i].b,e=bx[j].b;
          const ox=Math.min(a.x+a.width,e.x+e.width)-Math.max(a.x,e.x), oy=Math.min(a.y+a.height,e.y+e.height)-Math.max(a.y,e.y);
          if (ox>14 && oy>13) out.push(`${W}x${H} s${seed} ${o.rank}: overlap "${bx[i].s.slice(0,12)}" x "${bx[j].s.slice(0,12)}"`);
        }
        host.remove();
      }
    }
    return out;
  }, {d, order, DIMS, SEEDS});

  await b.close();
  const cases = DIMS.length * SEEDS * 3;
  if (report.length) { console.log(report.join('\n')); console.log(`\n${cases} labels checked — FAILURES: ${report.length}`); process.exit(1); }
  else { console.log(`${cases} labels checked — ALL CLEAN (no margin breaches, no overlaps, artboard/bleed correct)`); process.exit(0); }
})();
