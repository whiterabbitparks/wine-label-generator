/* ============================================================================
   8K Labels — build script  (self-contained; no external paths)
   ----------------------------------------------------------------------------
   Inlines the engine + placeholder image + structured editor into two
   deliverables:
     dist/prototype.html     — standalone engine playground (src/prototype-shell.html)
     dist/configurator.html  — the full client configurator with the editor embedded
   Run:  node build.js
   ============================================================================ */
const fs = require('fs'), path = require('path');
const ROOT = __dirname, SRC = path.join(ROOT, 'src'), DIST = path.join(ROOT, 'dist');
const read = f => fs.readFileSync(f, 'utf8');
function assert(c, m){ if(!c) throw new Error('BUILD FAIL: ' + m); }
if(!fs.existsSync(DIST)) fs.mkdirSync(DIST, {recursive:true});

const engine  = read(path.join(SRC, 'label-engine.js'));
const imgData = fs.existsSync(path.join(SRC,'img-data.js')) ? read(path.join(SRC,'img-data.js')) : '';   // vineyard placeholder data URL
const editorJs= read(path.join(SRC, 'editor-embed.js'));
const imgGenJs= fs.existsSync(path.join(SRC,'image-gen.js')) ? read(path.join(SRC,'image-gen.js')) : '';

/* ---- 1) standalone prototype ---- */
const shell = read(path.join(SRC, 'prototype-shell.html'));
assert(shell.indexOf('/*__ENGINE__*/') >= 0, 'prototype placeholder /*__ENGINE__*/ missing');
fs.writeFileSync(path.join(DIST,'prototype.html'),
  shell.replace('/*__ENGINE__*/', () => '\n' + imgData + '\n' + engine + '\n'));
console.log('wrote dist/prototype.html');

/* ---- 2) configurator: embed the structured editor into the client shell ---- */
let cfg = read(path.join(SRC, 'configurator-base.html'));

// (a) insert the editor container just before the old option-cols in the Front Label section
let fInfo = cfg.indexOf('Front Label Information'); assert(fInfo >= 0, 'Front Label Information not found');
let ocIdx = cfg.indexOf('<div class="option-cols">', fInfo); assert(ocIdx >= 0, 'front option-cols not found');
cfg = cfg.slice(0, ocIdx) + '<div id="labelEditor"></div>\n    ' + cfg.slice(ocIdx);

// (a2) hide the old "Label Orientation & Size" section (kept in DOM so its diagram JS still runs)
let os = cfg.indexOf('<div class="section-head"><h2>Label Orientation'); assert(os >= 0, 'orientation section not found');
let hr = cfg.indexOf('<hr class="grey-divider">', os); assert(hr >= 0, 'orientation hr not found');
let hrEnd = hr + '<hr class="grey-divider">'.length;
cfg = cfg.slice(0, os) + '<div style="display:none">' + cfg.slice(os, hrEnd) + '</div>' + cfg.slice(hrEnd);

// (a3) rename the section heading
cfg = cfg.replace('>Front Label Information<span', '>FRONT LABEL<span');

// (b) styles: scoped editor + regenerate button + option cells + gallery
const CSS = '<style>'
 + '.eng-regen{display:block;flex:1;width:auto;margin:0;background:var(--olive);color:var(--white);border:none;padding:16px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;border-radius:var(--radius);}'
 + '.eng-regen:hover{background:var(--olive-dark);}'
 + '#frontThumbs .thumb-box{border:none !important;background:transparent !important;padding:0 !important;}'
 + '#frontThumbs .thumb-box svg{width:100% !important;height:100% !important;display:block;}'
 + '#frontThumbs .eng-cell{display:flex;flex-direction:column;align-items:center;}'
 + '#frontThumbs .eng-lbl{cursor:pointer;line-height:0;transition:box-shadow .12s;width:100%;}'
 + '#frontThumbs .eng-lbl svg{width:100%;height:auto;display:block;}'
 + '#frontThumbs .eng-lbl:hover{box-shadow:0 6px 20px rgba(0,0,0,.16);}'
 + '#frontThumbs .eng-lbl.sel{box-shadow:0 0 0 2px #000;}'
 + '#frontThumbs .eng-selrow{display:flex;align-items:center;gap:9px;margin:18px 0 0;cursor:pointer;user-select:none;}'
 + '#frontThumbs .eng-radio{width:17px;height:17px;border-radius:50%;border:2px solid #000;position:relative;flex:0 0 auto;}'
 + '#frontThumbs .eng-radio.on{border-color:var(--olive);}'
 + '#frontThumbs .eng-radio.on::after{content:"";position:absolute;top:3px;left:3px;right:3px;bottom:3px;border-radius:50%;background:var(--olive);}'
 + '#frontThumbs .eng-optlab{font-size:10.5px;color:var(--ink);font-weight:600;}'
 + '#frontThumbs .eng-dl{margin-top:7px;color:var(--olive-dark);text-decoration:underline;cursor:pointer;font-size:12px;}'
 + '#eng-gallery{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;}'
 + '#eng-gallery .eng-gv-back{position:absolute;inset:0;background:rgba(24,21,17,.85);}'
 + '#eng-gallery .eng-gv-stage{position:relative;z-index:2;max-width:82vw;max-height:82vh;}'
 + '#eng-gallery .eng-gv-stage svg{height:min(84vh,640px);width:auto;max-width:92vw;box-shadow:0 18px 60px rgba(0,0,0,.55);background:var(--white);}'
 + '#eng-gallery .eng-gv-cap{position:absolute;z-index:2;bottom:26px;left:0;right:0;text-align:center;color:var(--cream);font-size:14px;letter-spacing:.03em;}'
 + '#eng-gallery button{position:absolute;z-index:3;background:rgba(255,255,255,.10);color:var(--white);border:2px solid rgba(255,255,255,.4);cursor:pointer;}'
 + '#eng-gallery .eng-gv-close{top:24px;right:28px;width:44px;height:44px;border-radius:50%;font-size:26px;line-height:1;}'
 + '#eng-gallery .eng-gv-prev,#eng-gallery .eng-gv-next{top:50%;transform:translateY(-50%);width:52px;height:64px;font-size:34px;line-height:1;border-radius:6px;}'
 + '#eng-gallery .eng-gv-prev{left:26px;}#eng-gallery .eng-gv-next{right:26px;}'
 + '#eng-gallery button:hover{background:rgba(255,255,255,.22);}'
 // ---- structured editor (scoped; inherits the configurator font) ----
 + '#labelEditor{margin:8px 0 0}'
 // --- front-preview / other-options buttons share one slot, symmetric to the solid line ---
 + '#frontPreviewBtn{margin:56px 0 0}'                                                 // extra breathing room between the layout preview and the button
 + '#frontReveal{margin-top:34px}'                                                     // "Other options" (top of reveal) lands in the same slot the button occupied
 + '#frontReveal > .eng-nav{margin:56px 0 0}'
 // --- helper note + solid dividers + width/height row (all centred) ---
 + '#labelEditor .le-note{max-width:560px;margin:44px auto 0;text-align:center;font-size:12.5px;line-height:1.45;color:#000000;font-style:italic}'   // instruction below the label (matched gap)
 + '#labelEditor .le-divider{border-top:2px solid #000000;max-width:560px;margin:22px auto}'      // grey solid line between sections
 + '#labelEditor .le-divider.le-full{max-width:none;margin:22px 0}'                                // full-width line across the margin area
 // --- DIMENSION RULERS (owner reference, 2026-08-17): measuring lines with
 //     end ticks; typed numbers, native spin arrows, NO box around them ---
 // spacing traced from the owner's reference (FRONT LABEL header underline as
 // the datum): label→line 16px, line→sheet 62px, sheet→height-ruler 58px
 + '#labelEditor .le2-grid{max-width:560px;margin:46px auto 0}'                                    // the SHEET centres; rulers hang around it
 + '#labelEditor .le-ruler-w{display:flex;flex-direction:column;align-items:center;margin-bottom:62px}'
 + '#labelEditor .le2-srow{position:relative}'
 + '#labelEditor .le-ruler-v{position:absolute;top:0;bottom:0;left:calc(100% + 58px);display:flex;align-items:center;gap:24px}'
 + '#labelEditor .le-rlab{display:inline-flex;align-items:center;gap:10px;font-size:14px;margin-bottom:16px}'
 + '#labelEditor .le-ruler-v .le-rlab{margin-bottom:0}'
 + '#labelEditor .le-rlab input{width:58px;height:auto;border:none;background:transparent;text-align:right;font-size:14px;padding:0;color:#000}'
 + '#labelEditor .le-rlab input:focus{outline:none;background:transparent;border:none;box-shadow:none}'
 + '#labelEditor .le-rlab input::-webkit-inner-spin-button{opacity:1}'
 + '#labelEditor .le-rline-h{width:100%;height:14px;position:relative;border-left:2px solid #000;border-right:2px solid #000}'
 + '#labelEditor .le-rline-h::after{content:"";position:absolute;left:0;right:0;top:50%;margin-top:-1px;border-top:2px solid #000}'
 + '#labelEditor .le-rline-v{width:14px;height:100%;position:relative;border-top:2px solid #000;border-bottom:2px solid #000}'
 + '#labelEditor .le-rline-v::after{content:"";position:absolute;top:0;bottom:0;left:50%;margin-left:-1px;border-left:2px solid #000}'
 + '#labelEditor .le-unit{color:#000000;font-size:13px;margin:0 6px}'
 // --- the single, centred layout-preview interface (exact replica of Layout_preview_UI.pdf) ---
 + '#labelEditor .le2-wrap{display:flex;justify-content:center;margin-top:44px}'                   // matched gap above the label
 + '#labelEditor .le2-stage{position:relative;width:100%;max-width:560px;background:#FFFFFF;font-family:inherit;color:var(--ink);border:2px solid var(--ink)}'   // thin black line around the label
 + '#labelEditor .le2-inner{position:absolute;inset:3.4%}'                                     // content inset so boxes never touch the black border
 + '#labelEditor .le2-box{position:absolute;box-sizing:border-box;border:2px solid var(--ink);display:flex;align-items:center;line-height:1;z-index:2;background:transparent}'
 + '#labelEditor .le2-box.a-center{justify-content:center}#labelEditor .le2-box.a-left{justify-content:flex-start}#labelEditor .le2-box.a-right{justify-content:flex-end}'
 + '#labelEditor .le2-inp{width:100%;height:100%;border:none;background:transparent;font-family:inherit;font-size:inherit;font-weight:inherit;color:#000000;padding:0 4px;white-space:nowrap;overflow:hidden;line-height:1.1;box-sizing:border-box}'
 + '#labelEditor .le2-box.a-center .le2-inp{text-align:center}#labelEditor .le2-box.a-left .le2-inp{text-align:left}#labelEditor .le2-box.a-right .le2-inp{text-align:right}'
 + '#labelEditor .le2-inp::placeholder{color:#000000;opacity:1}'                         // grey "E.g." hint at the SAME size/style as typed text (never in the SVG)
 + '#labelEditor .le2-inp:focus::placeholder{color:transparent}'                        // hint clears the moment you click in, returns on blur if left empty
 + '#labelEditor .le2-inp:focus{outline:none;background:#FFFFFF}.le2-vinp:focus,.le2-sel:focus{background:#FFFFFF}'
 + '#labelEditor .le2-box.warn{border-style:solid;border-color:#000000}'                              // empty box flagged after the first Show Labels press
 // --- labelled bottom rows: "Sweetness Level: [..]  Color: [..]  Type: [..]"  and  "Alc.: [..]  Vol.: [..] ml." ---
 + '#labelEditor .le2-box.grp{border:none;justify-content:center;align-items:center;gap:.45em;flex-wrap:nowrap;overflow:hidden;white-space:nowrap}'   // labelled rows start at the left margin
 + '#labelEditor .le2-box.grp.warn{border:none}'
 + '#labelEditor .le2-lbl{color:#000000;font-family:inherit;font-weight:400;white-space:nowrap;flex:0 0 auto}'
 + '#labelEditor .le2-sel{flex:0 0 auto;width:8.8em;min-width:0;border:2px solid var(--ink);background:transparent;font-family:inherit;font-size:inherit;color:#000000;font-weight:400;line-height:1;padding:.15em .4em;margin:0;text-align:center;text-align-last:center;-webkit-appearance:none;appearance:none;cursor:pointer;overflow:hidden}'   // wide enough for the longest option ("Sparkling Wine"), all three equal
 + '#labelEditor .le2-sel.na{color:#000000}'
 + '#labelEditor .le2-sel:focus{outline:none}'
 + '#labelEditor .le2-vinp{flex:0 0 auto;width:8.8em;min-width:0;border:2px solid var(--ink);background:transparent;font-family:inherit;font-size:inherit;color:#000000;font-weight:400;line-height:1;padding:.15em .2em;text-align:center;box-sizing:border-box}'
 + '#labelEditor .le2-vinp::placeholder{color:#000000;opacity:1}'
 + '#labelEditor .le2-vinp:focus{outline:none}#labelEditor .le2-vinp:focus::placeholder{color:transparent}'
 + '#labelEditor .le-warn{max-width:560px;margin:0 auto 14px;text-align:center;font-size:13px;line-height:1.45;color:#000000;background:#fbecea;border:2px solid #e7b4ad;border-radius:4px;padding:10px 14px}'
 + '#labelEditor .le2-logo{position:absolute;box-sizing:border-box;border:2px solid var(--ink);display:flex;align-items:center;justify-content:center;z-index:1}'
 + '#labelEditor .le2-upload{background:none;border:none;cursor:pointer;color:var(--ink);font-family:inherit;font-weight:200;font-size:inherit;text-decoration:underline;text-underline-offset:2px;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;padding:0}'
 + '#labelEditor .le2-upload .ar{text-decoration:none;font-weight:200}'
 + '#labelEditor .le2-or{position:absolute;box-sizing:border-box;display:flex;align-items:center;justify-content:center;color:#000000;font-family:inherit;font-weight:400;z-index:2}'   // "or" between producer & upload-logo
 + '.__theme__{}' + ':root{--cream:#FFFFFF;--cream-dark:#E3E3E1;--ink:#000000;--ink-soft:#000000;' + '--olive:#000000;--olive-dark:#000000;--olive-light:#000000;--wine:#000000;' + '--line:#000000;--divider:#000000;--white:#FFFFFF;--radius:0;}' + 'body{background:#FFFFFF;color:#000;font-family:\'Special Elite\',\'Courier New\',monospace;text-transform:none;}' + 'label,.opt-row,.price-row label,.price-row .amt,.word-count,.upload-btn,.upload-btn-wide,.le-sizelab,.le-unit,.eng-optlab,.eng-dl,.thumb .opt-row,.dot-label,.subtotal-row *{text-transform:uppercase;}' + 'input,textarea,select,.le-note,.brief-intro,.hint,.upload-hint,.preview-loader .ld-fact{text-transform:none;}' + 'h1,h2,h3,h4,.section-head h2,.tab-btn,.preview-btn,.pay-btn,.eng-regen,.topnav a,.logo .word,.logo .mark,.eyebrow,.hero h1{text-transform:uppercase;}' + 'input,select,textarea,button{font-family:\'Special Elite\',\'Courier New\',monospace;color:#000;}' + 'input,select,textarea{background:#FFFFFF;border:2px solid #000;border-radius:0;}' + '::placeholder{color:#000;opacity:1;}' + '.preview-btn,.pay-btn,.eng-regen{background:#000;color:#FFFFFF;border:2px solid #000;border-radius:0;}' + '.preview-btn:hover,.pay-btn:hover,.eng-regen:hover{background:#2b2b2b;color:#FFFFFF;}' + '.preview-btn.stale{background:#DCDCDA !important;color:#000;}' + '.dash-sep{border-top:2px solid #000;margin:26px 0 22px;}' + '.preview-loader{background:#FFFFFF;}' + '.preview-loader .ld-fact{color:#000;font-family:\'Special Elite\',\'Courier New\',monospace;}' + '.tab-btn{background:#E3E3E1;color:#000;}.tab-btn:hover{background:#D4D4D2;}' + '.tab-btn.active{background:#FFFFFF;color:#000;}' + '.tabbar.over-cover, .tabbar.over-cover .tab-btn{background:#FFFFFF;}' + '.hero-scrim{background:transparent;}.hero,.hero h1,.hero p{color:#000;}' + '.hero-note{color:#000;}' + 'footer{background:#000;color:#FFFFFF;}footer a{color:#FFFFFF;}' + 'textarea{color:#000;}.word-count,.brief-intro{color:#000;}' + '.dot-input{accent-color:#000;}' + '#labelEditor .le2-stage{background:#ffffff;border:2px solid #000;}' + '#frontThumbs .eng-optlab{color:#000;}.eng-dl{color:#000;}' + '#engRegenSep{margin:30px 0 0;}' + '#panel-front .pricing{margin-top:23px;}' + '#backThumbs .thumb-box,#backReveal .thumb-box{border:none;box-shadow:none;background:transparent;}' + '#labelEditor .le2-box.grp[data-zfid=alcVol]{justify-content:space-between;}' + '.le2-avgrp{display:inline-flex;align-items:center;gap:.45em;white-space:nowrap;}' + '.eng-nav{display:flex;gap:14px;align-items:stretch;}' + '.eng-arrow{width:64px;background:#000;color:#FFFFFF;border:2px solid #000;border-radius:0;font-size:19px;cursor:pointer;font-family:inherit;}' + '.eng-arrow[disabled]{background:#FFFFFF;color:#000;cursor:default;}' + 'input:focus::placeholder,textarea:focus::placeholder{color:transparent;}' + '.logo .word{font-size:19px;}.topnav a,.tab-btn,.preview-btn,.pay-btn,.eng-regen{font-size:13.3px;}' + 'body *:not(svg):not(svg *){font-weight:400;-webkit-text-stroke:0;}' + '#panel-front .upload-row{margin-top:-14px;}' + '#labelEditor .le2-lbl,#labelEditor .le2-inp,#labelEditor .le2-vinp,#labelEditor .le2-sel{text-transform:none;}' + '#labelEditor .le2-box.a-left,#labelEditor .le2-box.a-right,#labelEditor .le2-box.a-center{justify-content:center;}' + '#labelEditor .le2-box.a-left .le2-inp,#labelEditor .le2-box.a-right .le2-inp{text-align:center;}' + '.topbar{border-bottom:2px solid #000;padding-left:max(40px,calc((100vw - 1180px)/2 + 40px));padding-right:max(40px,calc((100vw - 1180px)/2 + 40px));}' + '.le-unit,.le-sizelab{color:#000;}' + '.hero{width:100%;height:auto;max-height:none;min-height:0;display:block;}' + '.hero-photo{position:static;display:block;width:100%;height:auto;object-fit:contain;object-position:center;transform:none;}' + '.hero-inner{display:none;}'
 + '[data-cover="hero"]{filter:grayscale(1);}'
 + '.section-cover{height:auto;}'
 + '.section-head h2{font-size:13.3px;}'
 + '#visionHead::after{display:none;}'
 // --- TYPEWRITER SHEET input UI (owner reference, 2026-08-17): every field is a
 //     typed line on its own 2px black underline; no boxed fields anywhere ---
 + '#labelEditor .le2-box{border:none;border-bottom:2px solid #000;}'
 + '#labelEditor .le2-box.warn{border:none;border-bottom:4px solid #000;}'
 + '#labelEditor .le2-box.grp{border:none;border-bottom:2px solid #000;}'
 + '#labelEditor .le2-box.grp.warn{border:none;border-bottom:4px solid #000;}'
 + '#labelEditor .le2-box.grp[data-zfid=alcVol]{border-bottom:none;}'
 + '#labelEditor .le2-box.grp[data-zfid=alcVol].warn{border-bottom:none;}'
 + '.le2-avgrp{border-bottom:2px solid #000;padding:0 .6em .14em .3em;}'
 + '#labelEditor .le2-sel,#labelEditor .le2-vinp{border:none;background:transparent;}'
 + '.le2-slash{color:#000;margin:0 .4em;flex:0 0 auto;}'
 + '#labelEditor .le2-logo{border:none;justify-content:flex-end;}'
 + '#labelEditor .le2-upload{font-size:11px;}'
 + '</style>';

const inject = '\n' + CSS + '\n<script>\n' + imgData + '\n</'+'script>\n<script>\n' + engine + '\n</'+'script>\n<script>\n' + editorJs + '\n</'+'script>\n<script>\n' + imgGenJs + '\n</'+'script>\n';
assert(cfg.indexOf('</body>') >= 0, '</body> not found');
cfg = cfg.replace('</body>', inject + '</body>');
fs.writeFileSync(path.join(DIST,'configurator.html'), cfg);
console.log('wrote dist/configurator.html (' + (cfg.length/1024/1024).toFixed(2) + ' MB)');
