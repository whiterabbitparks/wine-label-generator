
/* =============================================================================
   8K LABELS — Label Image Generation pipeline.

   TWO LAYERS, kept strictly separate:

   • CLIENT (front)  — the winemaker only provides a STORY (the "Your Vision"
     text) and an optional sketch/photo. They see no rules, no prompt, no style
     controls. They press "Generate artwork" (or it runs on Show Labels).

   • CREATOR (back)  — you, the platform owner, define the ART DIRECTION: house
     style, rules, negative prompt and the prompt template. Clients never see
     this. It is the guardrail layer that guarantees a good, on-brand result.
     Open it at  <page-url>#art-direction  (or add ?admin=1). In production these
     values live on your server; this panel edits the exact same config object.

   FINAL PROMPT SENT TO THE MODEL =  art direction (yours)
                                   + client story (theirs)
                                   + optional reference image (theirs)

   ── CONNECT A REAL MODEL ────────────────────────────────────────────────────
     window.EightKImageGen.provider = async function(job){
       // job = { prompt, negative, reference, size, art:{preset,extra,...},
       //         data (wine fields), vision (client story) }
       const r = await fetch('/api/generate-label-image', {method:'POST',
         headers:{'Content-Type':'application/json'}, body:JSON.stringify(job)});
       const { imageDataUrl } = await r.json();
       return imageDataUrl;
     };
   Until then a built-in placeholder renders the prompt so the flow is testable.
   ========================================================================== */
(function(){
"use strict";

/* ---- style presets (art-direction building blocks) ---- */
const PRESETS={
  engraving:{label:'Vintage engraving',
    medium:'a fine, detailed vintage engraving and etching illustration with cross-hatching and delicate line work',
    composition:'a single centred subject with clean negative space around it, designed as a wine-label illustration, no lettering and no border',
    mood:'elegant, heritage, timeless; monochrome ink on cream paper'},
  botanical:{label:'Botanical line art',
    medium:'a delicate botanical line-art illustration with thin, even strokes in a herbarium style',
    composition:'a centred plant, vine or leaf motif with airy negative space, no lettering and no border',
    mood:'organic, natural and refined'},
  watercolor:{label:'Soft watercolor',
    medium:'a soft watercolour illustration with gentle washes and subtle paper texture',
    composition:'a centred scene with light, airy margins, no lettering',
    mood:'romantic and artisanal, in a muted natural palette'},
  minimal:{label:'Minimal line icon',
    medium:'a minimal single-line icon illustration, geometric and made of just a few strokes',
    composition:'one simple centred mark with generous negative space, no lettering',
    mood:'modern, understated and clean'},
  bold:{label:'Bold graphic',
    medium:'a bold, high-contrast graphic illustration in a screen-print poster style with a limited palette',
    composition:'a strong centred composition with confident shapes, no lettering',
    mood:'expressive, contemporary and punchy'}
};
const NEGATIVE_DEFAULT='no text, no words, no letters, no numbers, no logos, no watermark, no signature, no border or frame, not a photograph, no modern objects, no brand names, low quality, blurry, distorted';
const TEMPLATE_DEFAULT='{medium}. Subject: {subject}. {context}{composition}. Mood: {mood}.{reference}{rules}';

/* ---- ART DIRECTION (creator-controlled; the exact object your backend stores) ---- */
const ART={ preset:'engraving', extra:'', negative:NEGATIVE_DEFAULT, template:TEMPLATE_DEFAULT };

function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function clip(s,n){s=String(s||'');return s.length>n?s.slice(0,n-1)+'…':s;}
function data(){try{return (window.EightKEditor&&window.EightKEditor.getData())||{};}catch(e){return {};}}
function visionText(){var t=document.getElementById('visionText');return t?String(t.value||'').trim():'';}
function hasRef(){return !!window.__LABEL_REF__;}

function subjectFrom(vision,d){
  vision=(vision||'').trim(); if(vision) return vision;
  var loc=[d.region,d.country].filter(Boolean).join(', ');
  if(loc) return 'a vineyard landscape in '+loc+(d.grape?(' with '+d.grape+' vines'):'');
  if(d.grape) return d.grape+' vines on the vine';
  return 'a classic vineyard landscape at golden hour';
}
function buildPrompt(presetKey){
  var P=PRESETS[presetKey||ART.preset]||PRESETS.engraving, d=data(), subj=subjectFrom(visionText(),d);
  var ctx=[]; if(d.wineColorName) ctx.push(String(d.wineColorName).toLowerCase()+' wine');
  var loc=[d.region,d.country].filter(Boolean).join(', '); if(loc) ctx.push('from '+loc);
  if(d.grape) ctx.push('grape: '+d.grape);
  var context=ctx.length?('Context: '+ctx.join('; ')+'. '):'';
  var reference=hasRef()?' Match the composition of the uploaded reference sketch.':'';
  var rules=(ART.extra&&ART.extra.trim())?(' House rules: '+ART.extra.trim()+'.'):'';
  return (ART.template||TEMPLATE_DEFAULT)
    .replace('{medium}',P.medium).replace('{subject}',subj).replace('{context}',context)
    .replace('{composition}',P.composition).replace('{mood}',P.mood)
    .replace('{reference}',reference).replace('{rules}',rules).replace(/\s+/g,' ').trim();
}
function buildJob(presetKey){var d=data();
  return {prompt:buildPrompt(presetKey),negative:ART.negative,reference:window.__LABEL_REF__||null,
    size:{w:1024,h:640},art:{preset:presetKey||ART.preset,extra:ART.extra,negative:ART.negative,template:ART.template},
    data:d,vision:visionText()};}

/* ---- per-style generation (one artwork per label style) ---- */
const STYLE_KEYS=['traditional','contemporary','flora','premium','minimalist','artistic'];
const STYLE_NAMES={traditional:'Traditional',contemporary:'Contemporary',flora:'Flora & Fauna',
  premium:'Premium',minimalist:'Minimalist',artistic:'Artistic / Punk'};
/* The BRIEF is the raw input only — vision text, reference, wine facts, seed.
   Prompt assembly (style recipes, sub-styles, focus rules, house rules) lives
   on the server; the client never sees or sends a prompt for the style set. */
function buildBrief(){return {vision:visionText(),reference:window.__LABEL_REF__||null,data:data(),seed:EightKImageGen.seed||0};}
/* offline fallback set provider: one placeholder per style so the package
   still works standalone (no server). */
function placeholderSet(brief){var map={};var job=buildJob();
  STYLE_KEYS.forEach(function(k){map[k]={url:placeholderImage(job),subStyle:'placeholder',subStyleLabel:'offline preview'};});
  return Promise.resolve(map);}

/* ---- placeholder provider (renders the prompt so the flow is testable) ---- */
function vineRows(W,H){var s='',cxs=[0.18,0.34,0.5,0.66,0.82];for(var i=0;i<cxs.length;i++){var x=cxs[i]*W;s+='<path d="M '+(W*0.5).toFixed(0)+' '+(H*0.52).toFixed(0)+' L '+x.toFixed(0)+' '+(H*0.86).toFixed(0)+'"/>';}
  for(var r=1;r<=3;r++){var y=H*(0.6+r*0.09);s+='<path d="M '+(W*0.12).toFixed(0)+' '+y.toFixed(0)+' Q '+(W*0.5).toFixed(0)+' '+(y-H*0.03).toFixed(0)+' '+(W*0.88).toFixed(0)+' '+y.toFixed(0)+'"/>';}return s;}
function placeholderImage(job){var subj=subjectFrom(job.vision,job.data),W=1000,H=620;
  var svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'">'
    +'<defs><pattern id="hh" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="9" stroke="#8a795d" stroke-width="1" opacity="0.22"/></pattern></defs>'
    +'<rect width="'+W+'" height="'+H+'" fill="#f3ecda"/>'
    +'<rect x="24" y="24" width="'+(W-48)+'" height="'+(H-48)+'" fill="url(#hh)" stroke="#6f5f45" stroke-width="2.5"/>'
    +'<rect x="34" y="34" width="'+(W-68)+'" height="'+(H-68)+'" fill="none" stroke="#6f5f45" stroke-width="1"/>'
    +'<path d="M34 '+(H*0.62).toFixed(0)+' Q '+(W*0.32).toFixed(0)+' '+(H*0.46).toFixed(0)+' '+(W*0.52).toFixed(0)+' '+(H*0.56).toFixed(0)+' T '+(W-34).toFixed(0)+' '+(H*0.54).toFixed(0)+' L '+(W-34)+' '+(H-34)+' L 34 '+(H-34)+' Z" fill="#e7ddc4"/>'
    +'<g stroke="#5c4f39" stroke-width="1.6" fill="none" opacity="0.65">'+vineRows(W,H)+'</g>'
    +'<text x="'+(W/2)+'" y="'+(H*0.42).toFixed(0)+'" text-anchor="middle" font-family="Georgia,serif" font-size="40" fill="#3b3226">'+esc(clip(subj,40))+'</text>'
    +'<text x="'+(W/2)+'" y="'+(H-60)+'" text-anchor="middle" font-family="Georgia,serif" font-size="16" fill="#8a795d">placeholder preview · '+esc((PRESETS[job.art.preset]||{}).label||'')+' · connect an image model</text>'
    +'</svg>';
  return 'data:image/svg+xml;utf8,'+encodeURIComponent(svg);}

/* Style-set thumbnails: one per label style. Not a picker — every style owns
   its artwork and shows it in its own layout; the row is a preview of the set. */
function addStyleThumb(wrap,k,entry){var d=document.createElement('div');d.className='ig-var';d.setAttribute('data-k',k);
  d.innerHTML='<img alt="'+esc(STYLE_NAMES[k]||k)+'"><div class="cap">'+esc(STYLE_NAMES[k]||k)
    +(entry.subStyleLabel?('<br>'+esc(entry.subStyleLabel)):'')+'</div>';
  d.querySelector('img').src=entry.url;
  wrap.appendChild(d);}

const EightKImageGen={
  PRESETS:PRESETS, ART:ART, STYLE_KEYS:STYLE_KEYS, STYLE_NAMES:STYLE_NAMES,
  buildPrompt:buildPrompt, buildJob:buildJob, buildBrief:buildBrief,
  seed:0,                                                    // drives sub-style + layout variety; re-roll for new combinations
  getConfig:function(){return {preset:ART.preset,extra:ART.extra,negative:ART.negative,template:ART.template};},
  setConfig:function(c){c=c||{};['preset','extra','negative','template'].forEach(function(k){if(c[k]!=null)ART[k]=c[k];});},
  provider:function(job){return Promise.resolve(placeholderImage(job));},   // single-image hook (admin Test generate)
  setProvider:placeholderSet,                                // set hook: brief → {styleKey:{url,subStyle,subStyleLabel}}
  setImage:function(url){window.__LABEL_IMG__=url||null;
    // keep the "Your Vision" preview in sync however generation was triggered (button or auto)
    var img=document.getElementById('ig_img');if(img&&url){img.src=url;var p=document.getElementById('ig_preview');if(p)p.classList.add('on');var c=document.getElementById('ig_clear');if(c)c.style.display='';}
    document.dispatchEvent(new Event('8kRepaint'));},
  /* the style set: every style gets its own artwork. __LABEL_IMGS__ is the
     per-style map the engine reads; __LABEL_IMG__ stays as the traditional
     entry for backwards compatibility (single-image hooks, admin test). */
  setImages:function(map){map=map||{};var urls={};
    STYLE_KEYS.forEach(function(k){var e=map[k];if(e&&e.url)urls[k]=e.url;});
    window.__LABEL_IMGS__=urls;
    var main=urls.traditional||null;
    if(!main)STYLE_KEYS.some(function(k){if(urls[k]){main=urls[k];return true;}return false;});
    EightKImageGen.setImage(main);},
  clearImage:function(){window.__LABEL_IMG__=null;window.__LABEL_IMGS__=null;EightKImageGen._lastSig=null;
    var w=document.getElementById('ig_variants');if(w){w.innerHTML='';w.classList.remove('on');}
    document.dispatchEvent(new Event('8kRepaint'));},
  _lastSig:null,
  _sig:function(){var d=data();return JSON.stringify([visionText(),window.__LABEL_REF__||null,EightKImageGen.seed||0,
    d.region,d.country,d.grape,d.wineColorName]);},
  generate:function(){var sig=EightKImageGen._sig();var job=buildJob();return Promise.resolve(EightKImageGen.provider(job)).then(function(url){if(url){EightKImageGen.setImage(url);EightKImageGen._lastSig=sig;}return url;});},
  // "Generate artwork" (and Show Labels): ONE artwork per label style, all six
  // in a single server round-trip (the server fans out and caches). Thumbnails
  // preview the set; each artwork appears inside its own style's layout.
  generateSet:function(){var sig=EightKImageGen._sig();var brief=buildBrief();
    var wrap=document.getElementById('ig_variants');if(wrap){wrap.innerHTML='';wrap.classList.add('on');}
    return Promise.resolve(EightKImageGen.setProvider(brief)).then(function(map){
      if(!map||!Object.keys(map).length)throw new Error('no artwork was generated');
      EightKImageGen.setImages(map);EightKImageGen._lastSig=sig;
      if(wrap)STYLE_KEYS.forEach(function(k){if(map[k]&&map[k].url)addStyleThumb(wrap,k,map[k]);});
      return map;});},
  // Auto-generation used by "Show Labels": re-generates only when the brief
  // (story, reference, seed or wine facts) changed since the last run. An empty
  // story is fine — the server falls back to the wine facts for the subject.
  generateIfNeeded:function(){
    if(window.__LABEL_IMGS__&&EightKImageGen._lastSig===EightKImageGen._sig())return Promise.resolve(window.__LABEL_IMGS__);
    return EightKImageGen.generateSet();},
  openAdmin:function(){buildAdmin(true);}
};
window.EightKImageGen=EightKImageGen;

/* ======================= CLIENT panel (story only) ======================= */
function clientCSS(){if(document.getElementById('imggen-css'))return;var s=document.createElement('style');s.id='imggen-css';
  s.textContent=[
   '#imgGen{margin:22px 0 4px}',
   '#imgGen .ig-head{font-family:\'Hepta Slab\',serif;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#2c2c2c;margin:0 0 4px}',
   '#imgGen .ig-sub{font-size:12.5px;color:#8a8178;margin:0 0 14px;line-height:1.5}',
   '#imgGen .ig-btn{background:var(--olive,#6b7a3a);color:#fff;border:none;padding:12px 22px;font-size:12.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;border-radius:var(--radius,3px)}',
   '#imgGen .ig-btn:hover{background:var(--olive-dark,#55632e)}#imgGen .ig-btn[disabled]{opacity:.6;cursor:default}',
   '#imgGen .ig-actions{display:flex;align-items:center;gap:14px;flex-wrap:wrap}',
   '#imgGen .ig-link{color:#4a5a24;text-decoration:underline;cursor:pointer;font-size:12px;background:none;border:none;padding:0}',
   '#imgGen .ig-variants{display:none;flex-wrap:wrap;gap:12px;margin:14px 0 4px}#imgGen .ig-variants.on{display:flex}',
   '#imgGen .ig-var{width:150px;cursor:pointer;border:2px solid transparent;border-radius:4px;padding:4px;transition:border-color .15s}',
   '#imgGen .ig-var:hover{border-color:#cfd6b8}#imgGen .ig-var.sel{border-color:var(--olive,#6b7a3a)}',
   '#imgGen .ig-var img{width:100%;display:block;border:1px solid #e2ded2;border-radius:2px}',
   '#imgGen .ig-var .cap{font-size:11px;text-align:center;margin-top:5px;color:#6b6a60;letter-spacing:.03em}',
   '#imgGen .ig-var.sel .cap{color:var(--olive,#6b7a3a);font-weight:700}',
   '#imgGen .ig-preview{margin-top:16px;display:none;gap:16px;align-items:flex-start}#imgGen .ig-preview.on{display:flex}',
   '#imgGen .ig-thumb{width:220px;height:140px;border:1px solid #cfc8ba;background:#f3ecda;flex:0 0 auto;overflow:hidden}',
   '#imgGen .ig-thumb img{width:100%;height:100%;object-fit:cover;display:block}',
   '#imgGen .ig-note{font-size:12px;color:#8a8178;line-height:1.5;max-width:340px}',
   '#imgGen .ig-ref{font-size:12px;color:#6b7a3a;margin:2px 0 12px;display:none}#imgGen .ig-ref.on{display:block}'
  ].join('');document.head.appendChild(s);}
function clientHTML(){
  return '<div class="ig-head">Label Artwork</div>'
   +'<p class="ig-sub">We’ll create one artwork for each of the six label styles from the story above'
     +' (and your reference image, if you added one — or from your wine’s details if you leave the story empty).'
     +' You can regenerate as many times as you like.</p>'
   +'<div class="ig-ref" id="ig_ref">✓ Your reference image is attached and will guide the artwork.</div>'
   +'<div class="ig-actions"><button type="button" class="ig-btn" id="ig_go">Generate artwork</button>'
     +'<button type="button" class="ig-link" id="ig_clear" style="display:none">Remove artwork</button></div>'
   +'<div class="ig-variants" id="ig_variants"></div>'
   +'<div class="ig-preview" id="ig_preview"><div class="ig-thumb"><img id="ig_img" alt=""></div>'
     +'<div class="ig-note">This artwork now appears on your image-based label styles. Press <b>Show Labels</b> to see them (or it updates live if labels are already shown).</div></div>';
}
function bootClient(){var vt=document.getElementById('visionText');if(!vt)return false;if(document.getElementById('imgGen'))return true;
  clientCSS();
  var anchor=document.getElementById('sketchFile');anchor=anchor?anchor.closest('.upload-row'):null;if(!anchor)anchor=document.getElementById('visionCount')||vt;
  var panel=document.createElement('div');panel.id='imgGen';panel.innerHTML=clientHTML();
  anchor.parentNode.insertBefore(panel,anchor.nextSibling);
  var sk=document.getElementById('sketchFile');
  if(sk)sk.addEventListener('change',function(){var f=this.files&&this.files[0];if(!f)return;var rd=new FileReader();
    rd.onload=function(){window.__LABEL_REF__=rd.result;var r=document.getElementById('ig_ref');if(r)r.classList.add('on');};rd.readAsDataURL(f);});
  document.getElementById('ig_clear').addEventListener('click',function(){EightKImageGen.clearImage();document.getElementById('ig_preview').classList.remove('on');this.style.display='none';});
  document.getElementById('ig_go').addEventListener('click',function(){var btn=this;btn.disabled=true;var old=btn.textContent;btn.textContent='Generating 6 style artworks…';
    EightKImageGen.generateSet()
      .catch(function(e){alert('Image generation failed: '+(e&&e.message||e));}).then(function(){btn.disabled=false;btn.textContent=old;});});
  return true;
}

/* ======================= CREATOR / ADMIN panel (art direction) ======================= */
function adminGate(){var h=(location.hash||'').replace('#','').toLowerCase();return h==='art-direction'||h==='admin'||/(?:^|[?&])admin=1(?:&|$)/.test(location.search||'');}
function adminCSS(){if(document.getElementById('imggen-admin-css'))return;var s=document.createElement('style');s.id='imggen-admin-css';
  s.textContent=[
   '#igAdmin{position:fixed;top:0;right:0;width:420px;max-width:94vw;height:100vh;background:#20211d;color:#e9e5da;z-index:100000;box-shadow:-14px 0 40px rgba(0,0,0,.4);display:flex;flex-direction:column;font-family:Arial,Helvetica,sans-serif}',
   '#igAdmin .ah{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid #3a3c34}',
   '#igAdmin .ah b{font-size:14px;letter-spacing:.04em}#igAdmin .ah .tag{font-size:10px;background:#6b7a3a;color:#fff;padding:2px 7px;border-radius:10px;margin-left:8px;letter-spacing:.06em}',
   '#igAdmin .ax{background:none;border:none;color:#cfcabb;font-size:22px;cursor:pointer;line-height:1}',
   '#igAdmin .ab{overflow:auto;padding:16px 18px}',
   '#igAdmin label{display:block;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#b9c08f;margin:16px 0 6px}',
   '#igAdmin label:first-child{margin-top:0}',
   '#igAdmin select,#igAdmin textarea{width:100%;box-sizing:border-box;background:#171815;border:1px solid #3a3c34;color:#eae7dd;font:13px/1.5 Arial,Helvetica,sans-serif;padding:9px 10px;border-radius:3px;resize:vertical}',
   '#igAdmin .hint{font-size:11px;color:#8f8d81;margin-top:5px;line-height:1.45}',
   '#igAdmin .prev{background:#171815;border:1px dashed #4a4d42;border-radius:3px;padding:10px 12px;font-size:12px;line-height:1.55;color:#cfe0a8;white-space:pre-wrap;min-height:40px}',
   '#igAdmin .arow{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}',
   '#igAdmin .abtn{background:#6b7a3a;color:#fff;border:none;padding:10px 16px;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;border-radius:3px}',
   '#igAdmin .abtn.sec{background:#3a3c34}',
   '#igAdmin .cfg{margin-top:16px;font-size:11px;color:#8f8d81}',
   '#igAdmin .cfg pre{background:#171815;border:1px solid #3a3c34;border-radius:3px;padding:9px 10px;color:#b9c08f;white-space:pre-wrap;word-break:break-word;max-height:150px;overflow:auto}',
   '#igAdminTab{position:fixed;bottom:18px;right:18px;z-index:99998;background:#20211d;color:#e9e5da;border:1px solid #3a3c34;border-radius:20px;padding:8px 14px;font:12px Arial;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25)}'
  ].join('');document.head.appendChild(s);}
function presetOpts(){return Object.keys(PRESETS).map(function(k){return '<option value="'+k+'"'+(k===ART.preset?' selected':'')+'>'+esc(PRESETS[k].label)+'</option>';}).join('');}
function refreshAdmin(){var p=document.getElementById('ig_admin_prompt');if(p)p.textContent=buildPrompt();
  var c=document.getElementById('ig_admin_cfg');if(c)c.textContent=JSON.stringify(EightKImageGen.getConfig(),null,2);}
function buildAdmin(force){
  if(!adminGate()&&!force)return;
  adminCSS();
  if(document.getElementById('igAdmin')){document.getElementById('igAdmin').style.display='flex';refreshAdmin();return;}
  var d=document.createElement('div');d.id='igAdmin';
  d.innerHTML=
    '<div class="ah"><span><b>Art Direction</b><span class="tag">BACK OFFICE</span></span><button class="ax" id="ig_admin_x">×</button></div>'
   +'<div class="ab">'
     +'<p class="hint">Clients never see this. It defines the house style every generation follows. In production these values live on your server — this panel edits the same config.</p>'
     +'<label>Image style</label><select id="ig_admin_preset">'+presetOpts()+'</select>'
     +'<label>House rules / art direction</label><textarea id="ig_admin_rules" rows="4" placeholder="e.g. Always sepia, warm tones. Keep a Caucasus mountain silhouette in the background. Never depict people’s faces. Leave the top third of the image empty for the wine name.">'+esc(ART.extra)+'</textarea>'
     +'<div class="hint">Plain-English rules that steer every image. This is where you “train” the look and prevent mistakes.</div>'
     +'<label>Negative prompt (avoid)</label><textarea id="ig_admin_neg" rows="3">'+esc(ART.negative)+'</textarea>'
     +'<label>Prompt template <span style="text-transform:none;font-weight:400;color:#8f8d81">— placeholders: {medium} {subject} {context} {composition} {mood} {reference} {rules}</span></label>'
     +'<textarea id="ig_admin_tpl" rows="3">'+esc(ART.template)+'</textarea>'
     +'<label>Assembled prompt (live preview)</label><div class="prev" id="ig_admin_prompt"></div>'
     +'<div class="hint">Built from your art direction + the client’s current story + reference. The client contributes only the story.</div>'
     +'<div class="arow"><button class="abtn" id="ig_admin_test">Test generate</button><button class="abtn sec" id="ig_admin_reset">Reset to defaults</button></div>'
     +'<div class="cfg"><label style="margin-top:18px">Server config (this is what your backend stores)</label><pre id="ig_admin_cfg"></pre></div>'
   +'</div>';
  document.body.appendChild(d);
  document.getElementById('ig_admin_x').addEventListener('click',function(){d.style.display='none';});
  document.getElementById('ig_admin_preset').addEventListener('change',function(){ART.preset=this.value;refreshAdmin();});
  document.getElementById('ig_admin_rules').addEventListener('input',function(){ART.extra=this.value;refreshAdmin();});
  document.getElementById('ig_admin_neg').addEventListener('input',function(){ART.negative=this.value;refreshAdmin();});
  document.getElementById('ig_admin_tpl').addEventListener('input',function(){ART.template=this.value;refreshAdmin();});
  document.getElementById('ig_admin_reset').addEventListener('click',function(){ART.preset='engraving';ART.extra='';ART.negative=NEGATIVE_DEFAULT;ART.template=TEMPLATE_DEFAULT;
    document.getElementById('ig_admin_preset').value=ART.preset;document.getElementById('ig_admin_rules').value='';document.getElementById('ig_admin_neg').value=ART.negative;document.getElementById('ig_admin_tpl').value=ART.template;refreshAdmin();});
  document.getElementById('ig_admin_test').addEventListener('click',function(){var b=this;b.disabled=true;var o=b.textContent;b.textContent='Generating…';
    EightKImageGen.generate().then(function(url){var img=document.getElementById('ig_img');if(img&&url){img.src=url;document.getElementById('ig_preview').classList.add('on');document.getElementById('ig_clear').style.display='';}})
      .catch(function(e){alert('Generation failed: '+(e&&e.message||e));}).then(function(){b.disabled=false;b.textContent=o;});});
  refreshAdmin();
}
function adminLauncher(){if(!adminGate())return;if(document.getElementById('igAdminTab'))return;adminCSS();
  var t=document.createElement('button');t.id='igAdminTab';t.textContent='⚙ Art Direction';t.addEventListener('click',function(){buildAdmin(true);});document.body.appendChild(t);}

/* ---------- boot ---------- */
function tryBoot(){var ok=bootClient();if(adminGate()){adminLauncher();buildAdmin(false);}if(ok)return;var n=0;var iv=setInterval(function(){if(bootClient()||++n>40)clearInterval(iv);},150);}
window.addEventListener('hashchange',function(){if(adminGate()){adminLauncher();buildAdmin(true);}});
if(document.readyState!=='loading')tryBoot();else document.addEventListener('DOMContentLoaded',tryBoot);
})();

