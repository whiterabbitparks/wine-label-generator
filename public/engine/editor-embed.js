
/* =============================================================================
   8K LABELS — Structured label editor, embedded in the configurator (FRONT LABEL).
   ========================================================================== */
(function(){
"use strict";
const COLORHEX={Red:'#6E1423',White:'#F3ECC9',Orange:'#E58A2A','Rosé':'#E7A6B5'};
const SWEET=['N/A','Dry','Semi-Dry','Semi-Sweet','Sweet'];
const COLOUR=['N/A','Red','White','Orange','Rosé'];
const CATEGORY=['N/A','Wine','Sparkling Wine','Pét-Nat','Fortified Wine','Ice Wine','Dessert Wine'];
const ATTR_PARTS=[{k:'sweetness',opts:SWEET},{k:'colour',opts:COLOUR},{k:'category',opts:CATEGORY}];   // the "Dry Red Wine" box = three dropdowns, N/A by default
const isNA=v=>String(v||'').trim().toUpperCase()==='N/A';

/* ONE editable box per label element. `ph` is the reference prompt word shown until the user types
   over it. This single interactive layout preview IS the whole input surface — there is no separate
   field list. Values start empty so the boxes show the reference words, exactly like Layout_preview_UI.pdf. */
const FIELDS={
  producer:{ph:'E.G. GRAND VIN',value:'',logo:true},
  wineName:{ph:'E.g. Château Margaux',value:''},
  appellation:{ph:'E.g. Margaux AOC',value:''},
  classification:{ph:'E.g. Grand Cru Classé',value:''},
  vintage:{ph:'E.g. 2018',value:''},
  grape:{ph:'E.g. Cabernet Sauvignon',value:''},
  regionCountry:{ph:'E.g. Bordeaux, France',value:''},
  special:{ph:'E.g. Vieilles Vignes',value:''},
  attributes:{sel:true,value:{sweetness:'N/A',colour:'N/A',category:'N/A'}},   // three labelled dropdowns, N/A selected on load
  alcVol:{av:true,value:{alcohol:'',volume:''}}                                // Alc.: [..]  Vol.: [..] ml.
};
const ATTR_LBL={sweetness:'Sweetness Level:',colour:'Color:',category:'Type:'};
// classification & grape are swapped (grape now takes the prominent box under the appellation, classification the small centre box)
let order=['producer','wineName','appellation','grape','vintage','classification','regionCountry','special','attributes','alcVol'];

/* Fixed replica of Layout_preview_UI.pdf, traced from the PDF vectors:
   x/y/w/h = fractions of the content box · sz = font size as a fraction of the preview height ·
   wt = Hepta Slab weight (200 = ExtraLight, 700 = Bold) · a = text alignment. */
/* TYPEWRITER SHEET (owner reference, 2026-08-17): every field is a typed
   line on its own black underline inside the bordered sheet. Producer
   centred at the top; wine name huge; vintage moves into the BOTTOM row
   between alcohol and volume; classification joins the region/special
   line. Sizes traced from the owner's reference image. */
const REF={
  producer:      {x:0.1900,y:0.0450,w:0.6200,h:0.0700, sz:0.0400, wt:400, a:'center'},
  wineName:      {x:0.0200,y:0.2950,w:0.9600,h:0.1350, sz:0.1000, wt:400, a:'center'},
  appellation:   {x:0.1200,y:0.4750,w:0.7600,h:0.0950, sz:0.0630, wt:400, a:'center'},
  grape:         {x:0.1000,y:0.6150,w:0.8000,h:0.0800, sz:0.0520, wt:400, a:'center'},
  regionCountry: {x:0.0000,y:0.7450,w:0.3150,h:0.0520, sz:0.0280, wt:400, a:'center'},
  classification:{x:0.3425,y:0.7450,w:0.3150,h:0.0520, sz:0.0280, wt:400, a:'center'},
  special:       {x:0.6850,y:0.7450,w:0.3150,h:0.0520, sz:0.0280, wt:400, a:'center'},
  attributes:    {x:0.0300,y:0.8350,w:0.9400,h:0.0480, sz:0.0280, wt:400, a:'center', grp:1},  // Sweetness/Color/Type line (same size as region row, owner 2026-08-17)
  vintage:       {x:0.3850,y:0.9050,w:0.2300,h:0.0620, sz:0.0400, wt:400, a:'center'},         // bottom row, centre, larger
  alcVol:        {x:0.0000,y:0.9150,w:1.0000,h:0.0480, sz:0.0280, wt:400, a:'left', grp:1}     // Alc. left / Vol. right flank the vintage (same size as region row)
};
const REF_RATIO=(768.3-54.6)/(618.9-46.8);          // content-box aspect from the reference PDF

function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function dims(){var w=document.getElementById('le_wmm'),h=document.getElementById('le_hmm');return {W:Math.max(20,w?+w.value||110:110),H:Math.max(20,h?+h.value||80:80)};}
function stageEl(){return document.getElementById('le_wire');}
function innerEl(){var s=stageEl();return s?s.querySelector('.le2-inner'):null;}

function ensureContainers(){
  const host=document.getElementById('labelEditor'); if(!host) return null;
  if(!document.getElementById('le_wire')){
    host.innerHTML=
       '<div class="le-warn" id="le_warn" style="display:none">No label details were provided. If you want to generate a blank label, simply click <b>Show Labels</b> again.</div>'
      /* DIMENSION RULERS (owner reference, 2026-08-17): width as a measuring
         line above the sheet, height as one to its right — typed numbers
         with native spinner arrows, no box around them. */
      +'<div class="le2-grid">'
      +'<div class="le-ruler-w"><span class="le-rlab"><input id="le_wmm" type="number" value="110"><span class="le-unit">mm</span></span><div class="le-rline-h"></div></div>'
      /* the SHEET is what centres on the page (owner 2026-08-17); the height
         ruler hangs off its right edge without affecting the centring */
      +'<div class="le2-srow"><div class="le2-stage" id="le_wire"></div>'
      +'<div class="le-ruler-v"><div class="le-rline-v"></div><span class="le-rlab"><input id="le_hmm" type="number" value="80"><span class="le-unit">mm</span></span></div></div>'
      +'</div>'
      +'<div class="le-note">This is not the final label design. It is a layout template to help you enter your label details in the correct visual hierarchy. Enter only the information you want printed on your label, and feel free to leave any fields blank. The final label will be generated based on the information you provide, and you can edit or update any of these details after your label has been generated.</div>'
      +'<div class="dash-sep"></div>';
  }
  return host;
}
/* Responsive layout: horizontal from the reference; vertical re-anchored so the preview follows the
   real W×H. Header pinned to the top, the two footer rows pinned to the bottom (kept together), and
   the wine-name / appellation / grape cluster floats just above the footer with the reference gaps —
   so 2 & 3 stay tight and 4 sits centred above the footer while the top gap absorbs the size change.
   At 80 mm tall it reproduces the reference exactly. */
const RH_MM=80;                              // the reference content maps to ~80 mm of label height
function computeLayout(W,H){
  W=Math.max(40,+W||110); H=Math.max(30,+H||80);
  const mm=f=>f*RH_MM, top={};
  top.producer=mm(REF.producer.y);                                           // header: fixed mm from the top
  ['vintage','regionCountry','special','classification','attributes','alcVol']
    .forEach(fid=>{top[fid]=H-(RH_MM-mm(REF[fid].y));});                      // footer: fixed mm from the bottom
  const footerTop=Math.min(top.vintage,top.regionCountry,top.special);
  top.grape=footerTop-mm(REF.regionCountry.y-(REF.grape.y+REF.grape.h))-mm(REF.grape.h);
  top.appellation=top.grape-mm(REF.grape.y-(REF.appellation.y+REF.appellation.h))-mm(REF.appellation.h);
  top.wineName=top.appellation-mm(REF.appellation.y-(REF.wineName.y+REF.wineName.h))-mm(REF.wineName.h);
  const minWine=mm(REF.producer.y+REF.producer.h)+mm(0.02);   // never ride over the producer line
  if(top.wineName<minWine){const d=minWine-top.wineName;top.wineName+=d;top.appellation+=d;top.grape+=d;}
  const boxes={}; order.forEach(fid=>{const r=REF[fid];boxes[fid]={x:r.x,w:r.w,a:r.a,wt:r.wt,y:top[fid]/H,h:mm(r.h)/H,sz:mm(r.sz)/H};});
  return {boxes};
}
function attrSelectsHTML(){var v=FIELDS.attributes.value;
  return ATTR_PARTS.map(function(p){return '<span class="le2-lbl">'+ATTR_LBL[p.k]+'</span><select class="le2-sel'+(isNA(v[p.k])?' na':'')+'" data-attr="'+p.k+'">'
    +p.opts.map(function(o){return '<option'+(o===v[p.k]?' selected':'')+'>'+esc(o)+'</option>';}).join('')+'</select>';}).join('<span class="le2-slash">/</span>');
}
function alcGroupHTML(){var v=FIELDS.alcVol.value;
  return '<span class="le2-avgrp"><span class="le2-lbl">Alc.:</span><input class="le2-vinp" data-av="alcohol" placeholder="E.g. 12" value="'+esc(v.alcohol)+'"></span>'
    +'<span class="le2-avgrp"><span class="le2-lbl">Vol.:</span><input class="le2-vinp" data-av="volume" placeholder="E.g. 750" value="'+esc(v.volume)+'"><span class="le2-lbl">mL</span></span>';
}
function render(){
  if(!ensureContainers()) return;
  const st=stageEl(); if(!st) return; const dm=dims();
  st.style.aspectRatio=(dm.W/dm.H).toFixed(4);                               // preview reshapes to the real label proportions
  const L=computeLayout(dm.W,dm.H);
  let html='';   // no logo upload on the typewriter sheet (owner 2026-08-17)
  order.forEach(function(fid){var r=L.boxes[fid], grp=REF[fid].grp;
    var inner=(fid==='attributes')?attrSelectsHTML():(fid==='alcVol')?alcGroupHTML()
      :'<input class="le2-inp" data-zone-fid="'+fid+'" placeholder="'+esc(FIELDS[fid].ph)+'" value="'+esc(FIELDS[fid].value)+'">';
    html+='<div class="le2-box '+(grp?'grp':'a-'+r.a)+'" data-zfid="'+fid+'" data-sz="'+r.sz.toFixed(5)+'" style="left:'+(r.x*100).toFixed(3)+'%;top:'+(r.y*100).toFixed(3)+'%;width:'+(r.w*100).toFixed(3)+'%;height:'+(r.h*100).toFixed(3)+'%;font-weight:'+r.wt+';">'+inner+'</div>';
  });
  st.innerHTML='<div class="le2-inner">'+html+'</div>'; applyFonts();
}
function fitBox(box){if(!box)return;const inr=innerEl();const hpx=inr?inr.getBoundingClientRect().height:0;if(!hpx)return;
  const sz=parseFloat(box.getAttribute('data-sz'))||0.04; let fs=sz*hpx; box.style.fontSize=fs.toFixed(2)+'px';
  if(box.classList.contains('grp')){                                                       // labelled row (dropdowns): size each select to its widest OPTION so the value never clips
    var sels=[].slice.call(box.querySelectorAll('.le2-sel'));
    var cv=fitBox._cv||(fitBox._cv=document.createElement('canvas').getContext('2d'));
    function sizeSelects(){if(!sels.length)return;var cs=getComputedStyle(sels[0]);
      cv.font='400 '+cs.fontSize+' '+cs.fontFamily; var pad=parseFloat(cs.paddingLeft)+parseFloat(cs.paddingRight);
      var mx=0; sels.forEach(function(s){for(var i=0;i<s.options.length;i++){var w=cv.measureText(s.options[i].text).width;if(w>mx)mx=w;}});
      var wpx=Math.ceil(mx+pad+8); sels.forEach(function(s){s.style.width=wpx+'px';});}  // all three equal, sized to the longest option ("Sparkling Wine")
    sizeSelects();
    var g=0; while(box.scrollWidth>box.clientWidth+1 && fs>3 && g<90){fs*=0.94;box.style.fontSize=fs.toFixed(2)+'px';sizeSelects();g++;} return;}
  const el=box.querySelector('.le2-inp'); if(!el)return; let guard=0;
  const measuring=!el.value && el.placeholder; if(measuring) el.value=el.placeholder;    // the placeholder is fitted just like typed text (same size)
  while(el.scrollWidth>el.clientWidth+1 && fs>4 && guard<80){fs*=0.94;box.style.fontSize=fs.toFixed(2)+'px';guard++;}
  if(measuring) el.value='';}
function applyFonts(){const st=stageEl();if(!st)return;st.querySelectorAll('.le2-box').forEach(fitBox);
  const inr=innerEl(),lg=st.querySelector('.le2-logo'),or=st.querySelector('.le2-or'),hpx=inr?inr.getBoundingClientRect().height:0;
  if(lg&&hpx)lg.style.fontSize=(0.0310*hpx).toFixed(2)+'px';                            // "Upload logo" scales with the preview
  if(or&&hpx)or.style.fontSize=(0.0310*hpx).toFixed(2)+'px';}                           // "or" scales with the preview

function setValue(fid,val){FIELDS[fid].value=val;var box=document.querySelector('#labelEditor .le2-box[data-zfid="'+fid+'"]');
  if(box&&val&&val.trim())box.classList.remove('warn');   // filling a flagged box clears its red outline
  fitBox(box);}

document.addEventListener('input',function(e){const t=e.target;
  if(t.id==='le_wmm'||t.id==='le_hmm'){render();mirrorSize();return;}   // preview re-lays-out to the new size
  if(!t.closest||!t.closest('#labelEditor'))return;
  if(t.matches('.le2-inp[data-zone-fid]'))setValue(t.getAttribute('data-zone-fid'),t.value);
  else if(t.matches('.le2-vinp[data-av]')){FIELDS.alcVol.value[t.getAttribute('data-av')]=t.value;var bx=t.closest('.le2-box');if(bx&&cv('alcVol'))bx.classList.remove('warn');fitBox(bx);}});
document.addEventListener('change',function(e){const t=e.target;if(!t.closest||!t.closest('#labelEditor'))return;
  if(t.matches('.le2-sel[data-attr]')){const k=t.getAttribute('data-attr');FIELDS.attributes.value[k]=t.value;t.classList.toggle('na',isNA(t.value));
    const box=t.closest('.le2-box'); if(box&&cv('attributes'))box.classList.remove('warn');}});
window.addEventListener('resize',applyFonts);
/* Dimension numbers behave like the label texts (owner 2026-08-17): on
   click the number simply disappears and typed digits replace it; leaving
   the field empty restores the previous size. No focus box. */
document.addEventListener('focusin',function(e){const t=e.target;
  if(t.id==='le_wmm'||t.id==='le_hmm'){t.setAttribute('data-prev',t.value);t.value='';}});
document.addEventListener('focusout',function(e){const t=e.target;
  if(t.id==='le_wmm'||t.id==='le_hmm'){if(!t.value)t.value=t.getAttribute('data-prev')||(t.id==='le_wmm'?'110':'80');render();mirrorSize();}});
function mirrorSize(){var d=dims();var ow=document.getElementById('widthMM'),oh=document.getElementById('heightMM');if(ow){ow.value=d.W;ow.dispatchEvent(new Event('input',{bubbles:true}));}if(oh){oh.value=d.H;oh.dispatchEvent(new Event('input',{bubbles:true}));}}

/* ---------- preview glue ---------- */
/* Each box is a single free-text string; parse the combined boxes back into the fields the engine expects. */
function parseRegion(s){s=String(s||'').trim();var i=s.lastIndexOf(',');if(i<0)return {region:s,country:''};return {region:s.slice(0,i).trim(),country:s.slice(i+1).trim()};}
function parseAlc(s){s=String(s||'');var am=s.match(/(\d+(?:[.,]\d+)?)\s*%/),vm=s.match(/(\d+(?:[.,]\d+)?)\s*(ml|cl|l)\b/i);
  return {alcohol:am?am[1]+'%':'',volume:vm?(vm[1]+' '+vm[2].toLowerCase()):''};}
function detectColour(s){s=String(s||'');for(var k in COLORHEX){if(new RegExp('\\b'+k.replace('é','[eé]')+'\\b','i').test(s))return k;}return '';}
/* effective box content = the typed value only. The grey "E.g." prompt is a placeholder and never
   reaches the SVG, so a box the user leaves blank simply doesn't appear on the label. */
function cv(fid){var f=FIELDS[fid];
  if(f.sel){var v=f.value;return [v.sweetness,v.colour,v.category].filter(function(x){return x&&!isNA(x);}).join(' ');}
  if(f.av){var a=f.value;return [a.alcohol,a.volume].filter(function(x){return x&&String(x).trim();}).join(' ');}
  return (f.value&&f.value.trim())?f.value.trim():'';}
/* TEMP — DEMO FILL (owner request 2026-07-31, for testing only): when a box is
   left empty, the generated SVGs use its "E.g." reference text (prefix stripped)
   so labels can be previewed without typing everything in each session.
   REVERT by setting DEMO_FILL=false. Deliberately scoped to getLabelData only:
   the empty-box warning, red flags and the grey placeholders are untouched. */
var DEMO_FILL=true;
function demoPh(fid){var f=FIELDS[fid];return f&&f.ph?String(f.ph).replace(/^E\.?G\.?\s*/i,''):'';}
function dcv(fid){var v=cv(fid);return (v||!DEMO_FILL)?v:demoPh(fid);}
function demoAv(v,fb){v=String(v||'').trim();return v||(DEMO_FILL?fb:'');}
function emptyFids(){return order.filter(function(fid){return !cv(fid);});}
function markWarn(list){var st=stageEl();if(!st)return;st.querySelectorAll('.le2-box').forEach(function(b){b.classList.toggle('warn',list.indexOf(b.getAttribute('data-zfid'))>=0);});
  var w=document.getElementById('le_warn');if(w)w.style.display='';}
function clearWarn(){var st=stageEl();if(st)st.querySelectorAll('.le2-box.warn').forEach(function(b){b.classList.remove('warn');});
  var w=document.getElementById('le_warn');if(w)w.style.display='none';}
function getLabelData(){var rc=parseRegion(dcv('regionCountry')),av=FIELDS.alcVol.value,at=FIELDS.attributes.value;
  var sweet=isNA(at.sweetness)?'':at.sweetness, colour=isNA(at.colour)?'':at.colour, type=isNA(at.category)?'':at.category;
  return {producer:dcv('producer'),wine:dcv('wineName'),appellation:dcv('appellation'),classification:dcv('classification'),
    grape:dcv('grape'),region:rc.region,country:rc.country,special:dcv('special'),vintage:dcv('vintage'),
    alcohol:demoAv(av.alcohol,'12.5%'),volume:demoAv(av.volume,'750 mL'),sweetness:sweet,wineType:type,wineColorName:colour,wineColor:COLORHEX[colour]||'#6E1423'};}
function currentStyle(){var c=document.querySelector('.style-card.selected');return c?c.dataset.style:'';}
function dl(svg,name){var b=new Blob([svg],{type:'image/svg+xml'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(u);},1000);}
let baseSeed=newSeed(), allOpts=[], selIdx=-1, galIdx=0, warned=false, shown=false;
let altMode=null;   // {styleKey, base} — "See Alternatives": 6 seeds of ONE style
let seedHist=[baseSeed], seedHistIdx=0;   // layout-set history for the prev/next arrows
/* Generate the artwork set, then paint. While the set is generating, the
   Show Labels glass loader (Loader.pdf) fills in sync with REAL progress —
   one increment per completed style artwork — and the labels reveal only
   when everything is ready. On the regen button (no loader) the button text
   shows progress instead. Fails soft: loader is dismissed, labels still paint. */
function withArtwork(btn,go){var gen=window.EightKImageGen;
  if(!gen||!gen.generateIfNeeded){go();return;}
  var pending=!gen.needsGeneration||gen.needsGeneration();
  var old=btn?btn.textContent:'';
  if(pending&&btn){btn.disabled=true;btn.textContent='Generating artwork…';}
  var prog=function(p){if(window.__frontLoaderProgress)window.__frontLoaderProgress(p);};
  if(!pending)prog(1);
  gen.generateIfNeeded(prog).catch(function(e){
      if(window.__frontLoaderFail)window.__frontLoaderFail();
      alert('Image generation failed: '+(e&&e.message||e));})
    .then(function(){if(pending&&btn){btn.disabled=false;btn.textContent=old;}go();});}
/* Every layout roll is a NEW random seed (owner, 2026-08-14): the engine
   turns each seed into an independent combination of composition, palette
   and hero font per style, so presses never replay a fixed cycle. The
   artwork is untouched. __SEED0__ pins the sequence for parity/tests. */
function newSeed(){return (typeof window.__SEED0__==='number')?window.__SEED0__:(1+Math.floor(Math.random()*100000));}
function mkRegen(){var rb=document.createElement('button');rb.type='button';rb.className='eng-regen';rb.textContent='Layout alternatives';rb.addEventListener('click',function(){var b=this;if(window.__8kRefreshHints)window.__8kRefreshHints();withArtwork(b,function(){altMode=null;baseSeed=(typeof window.__SEED0__==='number')?baseSeed+2:newSeed();seedHist=seedHist.slice(0,seedHistIdx+1);seedHist.push(baseSeed);seedHistIdx=seedHist.length-1;selIdx=-1;paint();});});return rb;}
function ensureExtras(){var reveal=document.getElementById('frontReveal');if(!reveal)return;
  var oldNote=document.getElementById('engStyleNote');if(oldNote)oldNote.remove();
  var oldTop=document.getElementById('engRegenTop');if(oldTop)oldTop.remove();
  // "Layout alternatives" sits BELOW the labels grid, with a dashed rule under it
  var grid=document.getElementById('frontThumbs');
  if(grid&&!document.getElementById('engRegen')){
    var nav=document.createElement('div');nav.id='engNav';nav.className='eng-nav';
    var pb=document.createElement('button');pb.type='button';pb.id='engPrev';pb.className='eng-arrow';pb.innerHTML='&#10094;';
    pb.addEventListener('click',function(){if(seedHistIdx>0){seedHistIdx--;baseSeed=seedHist[seedHistIdx];selIdx=-1;paint();}});
    var rb=mkRegen();rb.id='engRegen';
    var nb=document.createElement('button');nb.type='button';nb.id='engNext';nb.className='eng-arrow';nb.innerHTML='&#10095;';
    nb.addEventListener('click',function(){if(seedHistIdx<seedHist.length-1){seedHistIdx++;baseSeed=seedHist[seedHistIdx];selIdx=-1;paint();}});
    nav.appendChild(pb);nav.appendChild(rb);nav.appendChild(nb);
    grid.parentNode.insertBefore(nav,grid.nextSibling);
    var ds=document.createElement('div');ds.className='dash-sep';ds.id='engRegenSep';
    nav.parentNode.insertBefore(ds,nav.nextSibling);
  }
  var pbtn=document.getElementById('engPrev'),nbtn=document.getElementById('engNext');
  if(pbtn)pbtn.disabled=!(seedHistIdx>0);
  if(nbtn)nbtn.disabled=!(seedHistIdx<seedHist.length-1);
}
function galShow(i){var ov=document.getElementById('eng-gallery');if(!ov||!allOpts.length)return;galIdx=(i+allOpts.length)%allOpts.length;
  ov.querySelector('.eng-gv-stage').innerHTML=allOpts[galIdx].svg;ov.querySelector('.eng-gv-cap').textContent=(allOpts[galIdx].name||('Style '+(galIdx+1)))+' — '+(galIdx+1)+' of '+allOpts.length;
  if(window.LabelEngine&&window.LabelEngine.ensureFonts)window.LabelEngine.ensureFonts();}
function closeGallery(){var ov=document.getElementById('eng-gallery');if(ov)ov.style.display='none';}
function openGallery(idx){var ov=document.getElementById('eng-gallery');
  if(!ov){ov=document.createElement('div');ov.id='eng-gallery';
    ov.innerHTML='<div class="eng-gv-back"></div><button class="eng-gv-close" aria-label="Close">×</button><button class="eng-gv-prev" aria-label="Previous">‹</button><div class="eng-gv-stage"></div><button class="eng-gv-next" aria-label="Next">›</button><div class="eng-gv-cap"></div>';
    document.body.appendChild(ov);
    ov.querySelector('.eng-gv-back').addEventListener('click',closeGallery);
    ov.querySelector('.eng-gv-close').addEventListener('click',closeGallery);
    ov.querySelector('.eng-gv-prev').addEventListener('click',function(e){e.stopPropagation();galShow(galIdx-1);});
    ov.querySelector('.eng-gv-next').addEventListener('click',function(e){e.stopPropagation();galShow(galIdx+1);});
    document.addEventListener('keydown',function(e){var g=document.getElementById('eng-gallery');if(!g||g.style.display==='none')return;if(e.key==='Escape')closeGallery();else if(e.key==='ArrowLeft')galShow(galIdx-1);else if(e.key==='ArrowRight')galShow(galIdx+1);});}
  ov.style.display='flex';galShow(idx);}
function paint(){if(!window.LabelEngine)return;shown=true;var d=getLabelData();var dm=dims();ensureExtras();
  // 6 options = 6 distinct STYLES of the same label (Traditional, Contemporary, Flora & Fauna, Premium, Minimalist, Artistic/Punk)
  if(altMode){
    var sidx=window.LabelEngine.STYLE_LIST.findIndex(function(st){return st.key===altMode.styleKey;});
    if(sidx<0)sidx=0;
    allOpts=[];
    for(var kk=0;kk<6;kk++){
      var oo=window.LabelEngine.renderStyleOptions(d,order.slice(),{widthMM:dm.W,heightMM:dm.H,seed:altMode.base+kk*2})[sidx];
      oo=Object.assign({},oo); oo.name=(oo.name||'Style')+' \u2014 Alternative '+(kk+1);
      allOpts.push(oo);
    }
  }else{
    allOpts=window.LabelEngine.renderStyleOptions(d,order.slice(),{widthMM:dm.W,heightMM:dm.H,seed:baseSeed});
  }
  var grid=document.getElementById('frontThumbs');if(!grid)return;
  grid.style.display='grid';grid.style.gridTemplateColumns='repeat(3,1fr)';grid.style.gap='34px 24px';grid.style.alignItems='start';grid.innerHTML='';
  allOpts.forEach(function(o,i){
    var cell=document.createElement('div');cell.className='eng-cell';
    var box=document.createElement('div');box.className='eng-lbl'+(selIdx===i?' sel':'');box.innerHTML=o.svg;box.title='Click to view larger';
    box.addEventListener('click',function(){openGallery(i);});
    var row=document.createElement('div');row.className='eng-selrow';
    var radio=document.createElement('span');radio.className='eng-radio'+(selIdx===i?' on':'');
    var lab=document.createElement('span');lab.className='eng-optlab';lab.textContent=(i+1)+'. '+(o.name||('Style '+(i+1)));
    var dlk=null;   // (See Alternatives removed 2026-08-12)
    row.appendChild(radio);row.appendChild(lab);
    row.addEventListener('click',function(){selIdx=i;paint();});
    cell.appendChild(box);cell.appendChild(row);if(dlk)cell.appendChild(dlk);grid.appendChild(cell);
  });
  // price list only appears once a specific label is selected (owner 2026-08-16)
  var pr=document.querySelector('#frontReveal .pricing');if(pr)pr.style.display=(selIdx>=0)?'':'none';
  // once labels exist, the "Front Label Previews" button is replaced by "Other options" (both sit before the grid)
  var pv=document.getElementById('frontPreviewBtn');if(pv)pv.style.display='';   // stays visible; the 'stale' class greys it until new input
  var eb=document.getElementById('engRegen');if(eb)eb.style.display='block';
}

/* ---------- boot ---------- */
function boot(){
  if(!ensureContainers())return;
  var wt=document.querySelector('input[name="wineType"]');var oc=wt?wt.closest('.option-cols'):null;if(oc)oc.style.display='none';
  var fl=document.getElementById('fieldList');if(fl)fl.style.display='none';
  var ow=document.getElementById('widthMM'),oh=document.getElementById('heightMM');
  var lw=document.getElementById('le_wmm'),lh=document.getElementById('le_hmm');
  if(lw&&ow)lw.value=ow.value||110; if(lh&&oh)lh.value=oh.value||80;
  render(); mirrorSize();
  if(window.LabelEngine&&window.LabelEngine.ensureFonts)window.LabelEngine.ensureFonts().then(function(){render();});  // load serifs so preview proportions are accurate
  var btn=document.getElementById('frontPreviewBtn');
  if(btn){
    // Gate (capturing, runs before the loader + paint handlers): the FIRST press with any empty box
    // warns and flags the blanks red instead of generating; the next press proceeds as normal.
    btn.addEventListener('click',function(e){
      // only warn when NOTHING is filled in; if at least one field has content, generate right away
      var anyFilled=order.some(function(fid){return cv(fid);});
      if(!anyFilled && !warned){e.stopImmediatePropagation();e.preventDefault();warned=true;
        var w=document.getElementById('le_warn');if(w)w.style.display='';
        var st=stageEl();if(st)st.scrollIntoView({behavior:'smooth',block:'center'});return;}
      clearWarn();
    },true);
    btn.addEventListener('click',function(){var b=this;
      // the prototype page pre-loads #frontThumbs with 4 static demo images —
      // clear them so the reveal never flashes the old grid before paint()
      var g=document.getElementById('frontThumbs');if(g&&!shown)g.innerHTML='';
      setTimeout(function(){withArtwork(b,function(){if(window.LabelEngine){window.LabelEngine.ensureFonts().then(function(){altMode=null;baseSeed=newSeed();seedHist=[baseSeed];seedHistIdx=0;selIdx=-1;paint();
        if(window.__frontLoaderDone)window.__frontLoaderDone();});}});},50);});
    // any new input (story, sketch, any label detail) re-arms Show Labels
    var pf=document.getElementById('panel-front');
    if(pf&&!pf._freshWired){pf._freshWired=true;
      ['input','change'].forEach(function(ev){pf.addEventListener(ev,function(){if(window.__frontBtnFresh)window.__frontBtnFresh();},true);});}
    // Proceed to Payment downloads the SELECTED label's SVG
    var payBtn=document.querySelector('#panel-front .pay-btn');
    if(payBtn&&!payBtn._dlWired){payBtn._dlWired=true;
      payBtn.addEventListener('click',function(){
        if(shown&&selIdx>=0&&allOpts[selIdx]){
          var nm=(getLabelData().wine||'label').replace(/[^a-z0-9]+/gi,'_');
          dl(allOpts[selIdx].svg,nm+'_'+String(allOpts[selIdx].name||'label').replace(/[^a-z0-9]+/gi,'_')+'.svg');
        }});}
  }
}
// expose data + repaint so the image-generation module can read wine details and refresh shown labels
window.EightKEditor={getData:getLabelData,repaint:function(){if(shown&&window.LabelEngine){window.LabelEngine.ensureFonts().then(function(){paint();});}}};
document.addEventListener('8kRepaint',function(){window.EightKEditor.repaint();});
/* ADMIN LAYOUT HINTS (owner, 2026-08-14 restart): the /admin Layout section
   curates the approved looks per style; this is the ONLY external influence
   on layout rendering. Fetched at boot AND refetched on every "Layout
   alternatives" press (owner 2026-08-16: admin approvals must reach the page
   without a reload). Offline and parity runs skip it so goldens/captures
   stay deterministic. */
function refreshLayoutHints(){
  if(typeof window==='undefined'||window.__PARITY_OFFLINE__||typeof fetch!=='function')return;
  try{
    fetch('/api/layout-hints').then(function(r){return r&&r.ok?r.json():null;}).then(function(j){
      if(j&&j.hints&&window.LabelEngine&&window.LabelEngine.setStyleHints){
        window.LabelEngine.setStyleHints(j.hints);
        if(shown)window.EightKEditor.repaint();
      }
    }).catch(function(){});
  }catch(e){}
}
refreshLayoutHints();
window.__8kRefreshHints=refreshLayoutHints;
if(document.readyState!=='loading')boot();else document.addEventListener('DOMContentLoaded',boot);
})();

