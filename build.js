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
 + '.eng-regen{display:block;width:100%;margin:34px 0 30px;background:var(--olive);color:var(--white);border:none;padding:16px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;border-radius:var(--radius);}'
 + '.eng-regen:hover{background:var(--olive-dark);}'
 + '#frontThumbs .thumb-box{border:none !important;background:transparent !important;padding:0 !important;}'
 + '#frontThumbs .thumb-box svg{width:100% !important;height:100% !important;display:block;}'
 + '#frontThumbs .eng-cell{display:flex;flex-direction:column;align-items:center;}'
 + '#frontThumbs .eng-lbl{cursor:pointer;line-height:0;transition:box-shadow .12s;width:100%;}'
 + '#frontThumbs .eng-lbl svg{width:100%;height:auto;display:block;}'
 + '#frontThumbs .eng-lbl:hover{box-shadow:0 6px 20px rgba(0,0,0,.16);}'
 + '#frontThumbs .eng-lbl.sel{box-shadow:0 0 0 2px #79a342;}'
 + '#frontThumbs .eng-selrow{display:flex;align-items:center;gap:9px;margin:18px 0 0;cursor:pointer;user-select:none;}'
 + '#frontThumbs .eng-radio{width:17px;height:17px;border-radius:50%;border:2px solid #b9b2a6;position:relative;flex:0 0 auto;}'
 + '#frontThumbs .eng-radio.on{border-color:#79a342;}'
 + '#frontThumbs .eng-radio.on::after{content:"";position:absolute;top:3px;left:3px;right:3px;bottom:3px;border-radius:50%;background:#79a342;}'
 + '#frontThumbs .eng-optlab{font-size:15px;color:#211d1a;font-weight:600;}'
 + '#frontThumbs .eng-dl{margin-top:7px;color:#4a5a24;text-decoration:underline;cursor:pointer;font-size:12px;}'
 + '#eng-gallery{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;}'
 + '#eng-gallery .eng-gv-back{position:absolute;inset:0;background:rgba(24,21,17,.85);}'
 + '#eng-gallery .eng-gv-stage{position:relative;z-index:2;max-width:82vw;max-height:82vh;}'
 + '#eng-gallery .eng-gv-stage svg{height:min(84vh,640px);width:auto;max-width:92vw;box-shadow:0 18px 60px rgba(0,0,0,.55);background:#fff;}'
 + '#eng-gallery .eng-gv-cap{position:absolute;z-index:2;bottom:26px;left:0;right:0;text-align:center;color:#f3ede0;font-size:14px;letter-spacing:.03em;}'
 + '#eng-gallery button{position:absolute;z-index:3;background:rgba(255,255,255,.10);color:#fff;border:1px solid rgba(255,255,255,.4);cursor:pointer;}'
 + '#eng-gallery .eng-gv-close{top:24px;right:28px;width:44px;height:44px;border-radius:50%;font-size:26px;line-height:1;}'
 + '#eng-gallery .eng-gv-prev,#eng-gallery .eng-gv-next{top:50%;transform:translateY(-50%);width:52px;height:64px;font-size:34px;line-height:1;border-radius:6px;}'
 + '#eng-gallery .eng-gv-prev{left:26px;}#eng-gallery .eng-gv-next{right:26px;}'
 + '#eng-gallery button:hover{background:rgba(255,255,255,.22);}'
 // ---- structured editor (scoped; inherits the configurator font) ----
 + '#labelEditor{margin:8px 0 0}'
 // --- front-preview / other-options buttons share one slot, symmetric to the dashed line ---
 + '#frontPreviewBtn{margin:56px 0 0}'                                                 // extra breathing room between the layout preview and the button
 + '#frontReveal{margin-top:34px}'                                                     // "Other options" (top of reveal) lands in the same slot the button occupied
 + '#frontReveal > .eng-regen{margin:0 0 30px}'
 // --- helper note + dashed dividers + width/height row (all centred) ---
 + '#labelEditor .le-note{max-width:560px;margin:44px auto 0;text-align:center;font-size:12.5px;line-height:1.45;color:#8a8178;font-style:italic}'   // instruction below the label (matched gap)
 + '#labelEditor .le-divider{border-top:1px dashed #cfc8ba;max-width:560px;margin:22px auto}'      // grey dashed line between sections
 + '#labelEditor .le-divider.le-full{max-width:none;margin:22px 0}'                                // full-width line across the margin area
 + '#labelEditor .le-size{display:flex;align-items:center;justify-content:center;margin:0 auto}'   // width/height row, centred above the preview
 + '#labelEditor .le-sizelab{font-weight:600;font-size:12px}'
 + '#labelEditor .le-size .lw{display:inline-block}'
 + '#labelEditor .le-size #le_wmm{margin-left:14px}'
 + '#labelEditor .le-size .lh{margin-left:26px}'
 + '#labelEditor .le-size #le_hmm{margin-left:14px}'
 + '#labelEditor .le-size input{width:76px;height:38px;border:1px solid #d8d2c8;border-radius:0;text-align:center;font-size:14px;padding:0 6px}'
 + '#labelEditor .le-unit{color:#8a8178;font-size:13px;margin:0 6px}'
 // --- the single, centred layout-preview interface (exact replica of Layout_preview_UI.pdf) ---
 + '#labelEditor .le2-wrap{display:flex;justify-content:center;margin-top:44px}'                   // matched gap above the label
 + '#labelEditor .le2-stage{position:relative;width:100%;max-width:560px;background:#fff;font-family:inherit;color:#221f1f;border:1px solid #1c1a17}'   // thin black line around the label
 + '#labelEditor .le2-inner{position:absolute;inset:3.4%}'                                     // content inset so boxes never touch the black border
 + '#labelEditor .le2-box{position:absolute;box-sizing:border-box;border:1px dotted #423c35;display:flex;align-items:center;line-height:1;z-index:2;background:transparent}'
 + '#labelEditor .le2-box.a-center{justify-content:center}#labelEditor .le2-box.a-left{justify-content:flex-start}#labelEditor .le2-box.a-right{justify-content:flex-end}'
 + '#labelEditor .le2-inp{width:100%;height:100%;border:none;background:transparent;font-family:inherit;font-size:inherit;font-weight:inherit;color:#221f1f;padding:0 4px;white-space:nowrap;overflow:hidden;line-height:1.1;box-sizing:border-box}'
 + '#labelEditor .le2-box.a-center .le2-inp{text-align:center}#labelEditor .le2-box.a-left .le2-inp{text-align:left}#labelEditor .le2-box.a-right .le2-inp{text-align:right}'
 + '#labelEditor .le2-inp::placeholder{color:#949599;opacity:1}'                         // grey "E.g." hint at the SAME size/style as typed text (never in the SVG)
 + '#labelEditor .le2-inp:focus::placeholder{color:transparent}'                        // hint clears the moment you click in, returns on blur if left empty
 + '#labelEditor .le2-inp:focus{outline:none;background:rgba(121,163,66,.09)}'
 + '#labelEditor .le2-box.warn{border-style:dashed;border-color:#c0392b}'                              // empty box flagged after the first Show Labels press
 // --- labelled bottom rows: "Sweetness Level: [..]  Color: [..]  Type: [..]"  and  "Alc.: [..]  Vol.: [..] ml." ---
 + '#labelEditor .le2-box.grp{border:none;justify-content:flex-start;align-items:center;gap:.45em;flex-wrap:nowrap;overflow:hidden;white-space:nowrap}'   // labelled rows start at the left margin
 + '#labelEditor .le2-box.grp.warn{border:none}'
 + '#labelEditor .le2-lbl{color:#949599;font-family:inherit;font-weight:400;white-space:nowrap;flex:0 0 auto}'
 + '#labelEditor .le2-sel{flex:0 0 auto;width:8.8em;min-width:0;border:1px dotted #423c35;background:transparent;font-family:inherit;font-size:inherit;color:#221f1f;font-weight:400;line-height:1;padding:.15em .4em;margin:0;text-align:center;text-align-last:center;-webkit-appearance:none;appearance:none;cursor:pointer;overflow:hidden}'   // wide enough for the longest option ("Sparkling Wine"), all three equal
 + '#labelEditor .le2-sel.na{color:#949599}'
 + '#labelEditor .le2-sel:focus{outline:none}'
 + '#labelEditor .le2-vinp{flex:0 0 auto;width:3.9em;min-width:0;border:1px dotted #423c35;background:transparent;font-family:inherit;font-size:inherit;color:#221f1f;font-weight:400;line-height:1;padding:.15em .2em;text-align:center;box-sizing:border-box}'
 + '#labelEditor .le2-vinp::placeholder{color:#949599;opacity:1}'
 + '#labelEditor .le2-vinp:focus{outline:none}#labelEditor .le2-vinp:focus::placeholder{color:transparent}'
 + '#labelEditor .le-warn{max-width:560px;margin:0 auto 14px;text-align:center;font-size:13px;line-height:1.45;color:#a4341f;background:#fbecea;border:1px solid #e7b4ad;border-radius:4px;padding:10px 14px}'
 + '#labelEditor .le2-logo{position:absolute;box-sizing:border-box;border:1px dotted #423c35;display:flex;align-items:center;justify-content:center;z-index:1}'
 + '#labelEditor .le2-upload{background:none;border:none;cursor:pointer;color:#221f1f;font-family:inherit;font-weight:200;font-size:inherit;text-decoration:underline;text-underline-offset:2px;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;padding:0}'
 + '#labelEditor .le2-upload .ar{text-decoration:none;font-weight:200}'
 + '#labelEditor .le2-or{position:absolute;box-sizing:border-box;display:flex;align-items:center;justify-content:center;color:#8a8178;font-family:inherit;font-weight:400;z-index:2}'   // "or" between producer & upload-logo
 + '</style>';

const inject = '\n' + CSS + '\n<script>\n' + imgData + '\n</'+'script>\n<script>\n' + engine + '\n</'+'script>\n<script>\n' + editorJs + '\n</'+'script>\n<script>\n' + imgGenJs + '\n</'+'script>\n';
assert(cfg.indexOf('</body>') >= 0, '</body> not found');
cfg = cfg.replace('</body>', inject + '</body>');
fs.writeFileSync(path.join(DIST,'configurator.html'), cfg);
console.log('wrote dist/configurator.html (' + (cfg.length/1024/1024).toFixed(2) + ' MB)');
