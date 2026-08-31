
/* =============================================================================
   8K LABELS — Label Engine  (style: Traditional / Heritage)
   6 fixed template systems from the client's grid. Slot-based renderer:
   every element has a reserved grid slot -> no overlaps, always in order.
   - No frames (logo area is frameless; brand NAME rendered as text, 1 line,
     2 only if necessary; the box area is reserved for an uploaded logo).
   - Font hierarchy follows the UI priority (wine > appellation > grape >
     region/country > special/vintage/alcohol).
   - Every text clamped to >= 7pt real size (24.69 units).
   renderOptions(data, {widthMM, heightMM, seed}) -> [{name, rank, desc, svg}]
   Coordinates: 1 unit = 0.1 mm  (W = widthMM*10).
   ========================================================================== */
(function(){
"use strict";

const FONTS_URL="https://fonts.googleapis.com/css2?family=Alegreya+SC:wght@400;500&family=Ballet&family=Baskervville+SC&family=Cinzel:wght@500;600&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Cutive+Mono&family=EB+Garamond:ital,wght@0,400;0,500;0,700;1,400&family=Estonia&family=Felipa&family=Girassol&family=Great+Vibes&family=Italianno&family=Manufacturing+Consent&family=Marcellus&family=Mate+SC&family=MonteCarlo&family=Montagu+Slab:wght@500;600&family=Mrs+Saint+Delafield&family=Nixie+One&family=Pinyon+Script&family=Playfair+Display:wght@600;700&family=Prata&family=Tinos:ital,wght@0,400;0,700;1,400&family=Jost:wght@300;400;500;600&family=Archivo:wght@300;400;500;600;700;800&family=Barlow+Condensed:wght@600;700&family=Barlow:wght@600;700&family=Permanent+Marker&family=Anton&family=Bebas+Neue&family=Caveat:wght@500;600;700&family=Fraunces:ital,wght@0,400;0,500;0,600;0,700;1,500&family=Grenze+Gotisch:wght@600&family=IM+Fell+English+SC&display=swap";
const F={cormorant:"'Cormorant Garamond', serif",ebg:"'EB Garamond', serif",playfair:"'Playfair Display', serif",cinzel:"'Cinzel', serif",pinyon:"'Pinyon Script', cursive",marcellus:"'Marcellus', serif",prata:"'Prata', serif",
  ballet:"'Ballet', cursive",mrsSaint:"'Mrs Saint Delafield', cursive",greatVibes:"'Great Vibes', cursive",monteCarlo:"'MonteCarlo', cursive",estonia:"'Estonia', cursive",felipa:"'Felipa', cursive",italianno:"'Italianno', cursive",
  manufacturing:"'Manufacturing Consent', serif",cutiveMono:"'Cutive Mono', monospace",montaguSlab:"'Montagu Slab', serif",girassol:"'Girassol', serif",nixieOne:"'Nixie One', serif",alegreyaSC:"'Alegreya SC', serif",mateSC:"'Mate SC', serif",baskervvilleSC:"'Baskervville SC', serif",
  tinos:"'Tinos','Times New Roman',serif"};
const MX=0.06;
const MIN7=7*25.4/72*10;                 // 7pt in units ≈ 24.69

/* size hierarchy (fraction of H), matching UI priority order */
const SZ={wine:0.10, wineSmall:0.07, appellation:0.058, grape:0.054,
          region:0.038, classification:0.038, vintage:0.046, special:0.030, alcvol:0.030};

/* ---------- typography schemes (more variety) ---------- */
const SCHEMES={
  garamond:{id:'Garamond serif',
    display:{f:F.cormorant,c:'Cormorant Garamond',w:600,bl:0.80,lh:1.02,caps:false,tr:0},
    label:{f:F.ebg,c:'EB Garamond',w:500,tr:0.14}, grape:{f:F.ebg,c:'EB Garamond',w:500},
    vintage:{f:F.cormorant,c:'Cormorant Garamond',w:600}},
  cinzel:{id:'Cinzel engraved caps',
    display:{f:F.cinzel,c:'Cinzel',w:600,bl:0.82,lh:1.18,caps:true,tr:0.02},
    label:{f:F.cinzel,c:'Cinzel',w:500,tr:0.05}, grape:{f:F.ebg,c:'EB Garamond',w:500},
    vintage:{f:F.cinzel,c:'Cinzel',w:600}},
  playfair:{id:'Playfair display',
    display:{f:F.playfair,c:'Playfair Display',w:700,bl:0.80,lh:1.05,caps:false,tr:0},
    label:{f:F.ebg,c:'EB Garamond',w:500,tr:0.14}, grape:{f:F.ebg,c:'EB Garamond',w:500},
    vintage:{f:F.playfair,c:'Playfair Display',w:700}},
  calligraphic:{id:'Pinyon calligraphy',
    display:{f:F.pinyon,c:'Pinyon Script',w:400,bl:0.70,lh:1.0,caps:false,tr:0},
    label:{f:F.cormorant,c:'Cormorant Garamond',w:600,tr:0.12}, grape:{f:F.cormorant,c:'Cormorant Garamond',w:500},
    vintage:{f:F.cormorant,c:'Cormorant Garamond',w:600}},
  marcellus:{id:'Marcellus Roman caps',
    display:{f:F.marcellus,c:'Marcellus',w:400,bl:0.80,lh:1.08,caps:true,tr:0.05},
    label:{f:F.marcellus,c:'Marcellus',w:400,tr:0.08}, grape:{f:F.ebg,c:'EB Garamond',w:500},
    vintage:{f:F.marcellus,c:'Marcellus',w:400}},
  prata:{id:'Prata didone',
    display:{f:F.prata,c:'Prata',w:400,bl:0.80,lh:1.12,caps:false,tr:0},
    label:{f:F.ebg,c:'EB Garamond',w:500,tr:0.14}, grape:{f:F.ebg,c:'EB Garamond',w:500},
    vintage:{f:F.prata,c:'Prata',w:400}},
  /* ---- added scripts ---- */
  ballet:{id:'Ballet script', display:{f:F.ballet,c:'Ballet',w:400,bl:0.66,lh:0.98,caps:false,tr:0}, label:{f:F.cormorant,c:'Cormorant Garamond',w:600,tr:0.12}, grape:{f:F.cormorant,c:'Cormorant Garamond',w:500}, vintage:{f:F.cormorant,c:'Cormorant Garamond',w:600}},
  mrsSaint:{id:'Mrs Saint Delafield', display:{f:F.mrsSaint,c:'Mrs Saint Delafield',w:400,bl:0.66,lh:0.96,caps:false,tr:0}, label:{f:F.ebg,c:'EB Garamond',w:500,tr:0.14}, grape:{f:F.ebg,c:'EB Garamond',w:500}, vintage:{f:F.cormorant,c:'Cormorant Garamond',w:600}},
  greatVibes:{id:'Great Vibes script', display:{f:F.greatVibes,c:'Great Vibes',w:400,bl:0.70,lh:1.0,caps:false,tr:0}, label:{f:F.cormorant,c:'Cormorant Garamond',w:600,tr:0.12}, grape:{f:F.cormorant,c:'Cormorant Garamond',w:500}, vintage:{f:F.cormorant,c:'Cormorant Garamond',w:600}},
  monteCarlo:{id:'MonteCarlo script', display:{f:F.monteCarlo,c:'MonteCarlo',w:400,bl:0.68,lh:0.98,caps:false,tr:0}, label:{f:F.ebg,c:'EB Garamond',w:500,tr:0.14}, grape:{f:F.ebg,c:'EB Garamond',w:500}, vintage:{f:F.cormorant,c:'Cormorant Garamond',w:600}},
  estonia:{id:'Estonia script', display:{f:F.estonia,c:'Estonia',w:400,bl:0.70,lh:1.0,caps:false,tr:0}, label:{f:F.ebg,c:'EB Garamond',w:500,tr:0.14}, grape:{f:F.ebg,c:'EB Garamond',w:500}, vintage:{f:F.cormorant,c:'Cormorant Garamond',w:600}},
  felipa:{id:'Felipa calligraphy', display:{f:F.felipa,c:'Felipa',w:400,bl:0.72,lh:1.02,caps:false,tr:0}, label:{f:F.ebg,c:'EB Garamond',w:500,tr:0.14}, grape:{f:F.ebg,c:'EB Garamond',w:500}, vintage:{f:F.cormorant,c:'Cormorant Garamond',w:600}},
  italianno:{id:'Italianno script', display:{f:F.italianno,c:'Italianno',w:400,bl:0.68,lh:0.98,caps:false,tr:0}, label:{f:F.cormorant,c:'Cormorant Garamond',w:600,tr:0.12}, grape:{f:F.cormorant,c:'Cormorant Garamond',w:500}, vintage:{f:F.cormorant,c:'Cormorant Garamond',w:600}},
  /* ---- added small-caps serifs ---- */
  alegreyaSC:{id:'Alegreya SC', display:{f:F.alegreyaSC,c:'Alegreya SC',w:500,bl:0.80,lh:1.12,caps:false,tr:0.02}, label:{f:F.alegreyaSC,c:'Alegreya SC',w:400,tr:0.04}, grape:{f:F.ebg,c:'EB Garamond',w:500}, vintage:{f:F.alegreyaSC,c:'Alegreya SC',w:500}},
  mateSC:{id:'Mate SC', display:{f:F.mateSC,c:'Mate SC',w:400,bl:0.80,lh:1.12,caps:false,tr:0.03}, label:{f:F.mateSC,c:'Mate SC',w:400,tr:0.05}, grape:{f:F.ebg,c:'EB Garamond',w:500}, vintage:{f:F.mateSC,c:'Mate SC',w:400}},
  baskervvilleSC:{id:'Baskervville SC', display:{f:F.baskervvilleSC,c:'Baskervville SC',w:400,bl:0.80,lh:1.12,caps:false,tr:0.03}, label:{f:F.baskervvilleSC,c:'Baskervville SC',w:400,tr:0.05}, grape:{f:F.ebg,c:'EB Garamond',w:500}, vintage:{f:F.baskervvilleSC,c:'Baskervville SC',w:400}},
  /* ---- added slab / blackletter / display / mono ---- */
  montaguSlab:{id:'Montagu Slab', display:{f:F.montaguSlab,c:'Montagu Slab',w:600,bl:0.80,lh:1.06,caps:false,tr:0}, label:{f:F.ebg,c:'EB Garamond',w:500,tr:0.14}, grape:{f:F.ebg,c:'EB Garamond',w:500}, vintage:{f:F.montaguSlab,c:'Montagu Slab',w:600}},
  manufacturing:{id:'Manufacturing Consent blackletter', display:{f:F.manufacturing,c:'Manufacturing Consent',w:400,bl:0.80,lh:1.08,caps:false,tr:0}, label:{f:F.ebg,c:'EB Garamond',w:500,tr:0.14}, grape:{f:F.ebg,c:'EB Garamond',w:500}, vintage:{f:F.ebg,c:'EB Garamond',w:500}},
  girassol:{id:'Girassol', display:{f:F.girassol,c:'Girassol',w:400,bl:0.80,lh:1.06,caps:false,tr:0.02}, label:{f:F.ebg,c:'EB Garamond',w:500,tr:0.14}, grape:{f:F.ebg,c:'EB Garamond',w:500}, vintage:{f:F.girassol,c:'Girassol',w:400}},
  nixieOne:{id:'Nixie One', display:{f:F.nixieOne,c:'Nixie One',w:400,bl:0.80,lh:1.08,caps:true,tr:0.06}, label:{f:F.ebg,c:'EB Garamond',w:500,tr:0.14}, grape:{f:F.ebg,c:'EB Garamond',w:500}, vintage:{f:F.nixieOne,c:'Nixie One',w:400}},
  cutiveMono:{id:'Cutive Mono', display:{f:F.cutiveMono,c:'Cutive Mono',w:400,bl:0.80,lh:1.10,caps:true,tr:0.04}, label:{f:F.cutiveMono,c:'Cutive Mono',w:400,tr:0.08}, grape:{f:F.ebg,c:'EB Garamond',w:500}, vintage:{f:F.cutiveMono,c:'Cutive Mono',w:400}},
  tinos:{id:'Times Roman', display:{f:F.tinos,c:'Tinos',w:400,bl:0.80,lh:1.04,caps:false,tr:0}, label:{f:F.ebg,c:'EB Garamond',w:500,tr:0.10}, grape:{f:F.ebg,c:'EB Garamond',w:500}, vintage:{f:F.tinos,c:'Tinos',w:700}}
};

/* ---------- palettes ---------- */
const WINE_ACCENT={red:'#7A2230',white:'#9C7C33',orange:'#A9641E',rose:'#A45E6A','#6E1423':'red','#F3ECC9':'white','#E58A2A':'orange','#E7A6B5':'rose'};
const COLOR_WORD={red:'Red',white:'White',orange:'Orange',rose:'Rosé'};
/* wine descriptor line: sweetness + colour + type -> "Dry Red Wine" / "Semi-Dry White Sparkling Wine" */
function wineDescriptor(d){
  const key=(d.wineColor&&d.wineColor[0]==='#')?WINE_ACCENT[d.wineColor]:d.wineColor;
  const colour=(d.wineColorName!=null)?String(d.wineColorName).trim():(COLOR_WORD[key]||'');
  let type=String(d.wineType||'').trim();
  if(/^still\s+wine$/i.test(type)) type='Wine';           // "Still Wine" reads as just "Wine"
  return [d.sweetness,colour,type].map(x=>String(x||'').trim()).filter(x=>x&&x.toUpperCase()!=='N/A').join(', ');   // comma-separated: "Dry, Red, Sparkling Wine"
}
const PALETTES={
  ivory:{bg:'#F5EDDA',text:'#2A211C',sub:'#6B5A4C',rule:'#B79663',gold:'#9A7B45',light:true,imgTint:'#7C6A4F'},
  cream:{bg:'#EFE4CC',text:'#382822',sub:'#5C4A40',rule:'#AF894A',gold:'#8E6E3A',light:true,imgTint:'#7A6242'},
  claret:{bg:'#591622',text:'#F1E5C8',sub:'#E6CE9E',rule:'#CBA24B',gold:'#CBA24B',light:false,imgTint:'#E6CE9E'},
  midnight:{bg:'#201917',text:'#EFE1C0',sub:'#CBA24B',rule:'#8A6C2E',gold:'#CBA24B',light:false,imgTint:'#CBA24B'}
};

/* ---------- 4 options; distinct templates + fonts, ordinary -> bold ---------- */
const TIERS=[
  {name:'Classic',   rank:'Ordinary',palette:'ivory',   templates:['t1','t2'], schemes:['garamond','marcellus','baskervvilleSC','nixieOne','montaguSlab']},
  {name:'Refined',   rank:'#2',      palette:'cream',    templates:['t3','t4'], schemes:['prata','cinzel','alegreyaSC','mateSC','girassol']},
  {name:'Bold',      rank:'#3',      palette:'claret',   templates:['t5','t6'], schemes:['playfair','montaguSlab','manufacturing','cutiveMono','marcellus']},
  {name:'Expressive',rank:'Bold',    palette:'midnight', templates:['t6','t4'], schemes:['calligraphic','ballet','greatVibes','mrsSaint','monteCarlo','estonia','felipa','italianno']}
];
const TPL_DESC={t1:'centered · logo & illustration',t2:'centered · brand top',t3:'name top · central brand',
  t4:'illustration band top · name below',t5:'name over illustration · brand lower',t6:'grand central brand'};

/* ---------- measurement ---------- */
const _ctx=document.createElement('canvas').getContext('2d');
const up=s=>String(s==null?'':s).toUpperCase();
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
/* real ink ascent/descent of a string — the hard-rules geometry (5mm margin,
   1mm gaps) is enforced against what actually prints, not the em box */
function inkVA(t,size,fam,w,it){
  // measure at a fixed reference size and scale: hinting at fractional pixel
  // sizes is not perfectly reproducible run-to-run, and goldens must be
  // byte-identical. 512px metrics are stable; scaling is pure arithmetic.
  // measured upright even for italic runs: synthesized italics rasterize
  // non-deterministically (goldens) — upright ink is within ~0.2mm of italic
  const REF=512;
  _ctx.font=`${w||400} ${REF}px ${fam}`;
  const m=_ctx.measureText(t||'M');
  // quantized to whole 0.1mm units so run-to-run float noise can never flip
  // a rounded coordinate (goldens are byte-compared)
  const asc=Math.round(((m.actualBoundingBoxAscent!=null)?m.actualBoundingBoxAscent/REF:0.8)*size);
  const desc=Math.round(((m.actualBoundingBoxDescent!=null)?m.actualBoundingBoxDescent/REF:0.2)*size);
  return {asc,desc};
}
function measure(t,size,fam,w,it,tr){_ctx.font=`${it?'italic ':''}${w||400} ${size}px ${fam}`;let x=_ctx.measureText(t).width;if(tr)x+=tr*Math.max(0,t.length-1);return x;}
function wrapFit(t,maxW,base,min,maxLines,fam,w,it,tr){
  let size=base;
  for(let k=0;k<60;k++){const words=String(t||'').split(/\s+/).filter(Boolean);const lines=[];let cur='';
    for(const wd of words){const tri=cur?cur+' '+wd:wd;if(measure(tri,size,fam,w,it,tr)<=maxW||!cur)cur=tri;else{lines.push(cur);cur=wd;}}
    if(cur)lines.push(cur);
    if(lines.length<=maxLines&&lines.every(l=>measure(l,size,fam,w,it,tr)<=maxW*1.01))return{lines,size};
    if(size<=min)return{lines:lines.slice(0,maxLines),size:min};
    size=Math.max(min,size*0.95);}
  return{lines:[String(t||'')],size:min};
}

/* ---------- slot renderer ---------- */
function place(ctx,text,slot,sp){
  if(text==null||text==='')return '';
  const {W,H}=ctx,x0=slot.x0*W,x1=slot.x1*W,y0=slot.y0*H,y1=slot.y1*H,bw=x1-x0,bh=y1-y0;
  const maxLines=slot.maxLines||1,trk=sp.tr||0;
  let target=(slot.target||0.05)*H;
  target=Math.min(target,bh/maxLines*0.94);
  target=Math.max(target,MIN7);
  const disp=sp.caps?up(text):text;
  const lt=wrapFit(disp,bw,target,MIN7,maxLines,sp.c,sp.w,sp.italic,trk?target*trk:0);
  const size=lt.size,lh=sp.lh||1.12,blockH=lt.lines.length*size*lh;
  const va=slot.valign||'middle';
  const top=va==='top'?y0:va==='bottom'?(y1-blockH):(y0+(bh-blockH)/2);
  const al=slot.align||'center';
  const x=al==='left'?x0:al==='right'?x1:(x0+x1)/2;
  const anchor=al==='left'?'start':al==='right'?'end':'middle';
  let s=`<text font-family="${sp.f}" font-weight="${sp.w||400}" ${sp.italic?'font-style="italic" ':''}font-size="${size.toFixed(1)}" ${trk?`letter-spacing="${(size*trk).toFixed(2)}" `:''}fill="${sp.fill}" text-anchor="${anchor}">`;
  s+=lt.lines.map((l,i)=>`<tspan x="${x.toFixed(1)}" y="${(top+size*(sp.bl||0.80)+i*size*lh).toFixed(1)}">${esc(l)}</tspan>`).join('');
  return s+`</text>`;
}
const DISP=(ctx,t)=>({f:ctx.scheme.display.f,c:ctx.scheme.display.c,w:ctx.scheme.display.w,bl:ctx.scheme.display.bl,lh:ctx.scheme.display.lh,caps:ctx.scheme.display.caps,tr:ctx.scheme.display.tr,fill:ctx.colors.text});
const LAB=ctx=>({f:ctx.scheme.label.f,c:ctx.scheme.label.c,w:ctx.scheme.label.w,bl:0.80,lh:1.12,caps:true,tr:ctx.scheme.label.tr,fill:ctx.colors.accent});
const GRP=ctx=>({f:ctx.scheme.grape.f,c:ctx.scheme.grape.c,w:ctx.scheme.grape.w,bl:0.80,lh:1.12,italic:true,fill:ctx.colors.sub});

/* ---------- illustration area (frameless subtle tint + motif) ---------- */
function motif(cx,cy,s,color,alpha){
  const r=s*0.085,rows=[[-1,0,1],[-0.5,0.5],[0]];let g=`<g opacity="${alpha}" fill="${color}">`;
  rows.forEach((row,ri)=>row.forEach(dx=>{g+=`<circle cx="${(cx+dx*r*2).toFixed(1)}" cy="${(cy+ri*r*1.7+s*0.02).toFixed(1)}" r="${r.toFixed(1)}"/>`;}));
  g+='</g>';const st=cy-s*0.05;
  g+=`<g stroke="${color}" stroke-width="${(s*0.02).toFixed(2)}" fill="none" opacity="${alpha}" stroke-linecap="round">`
    +`<path d="M${cx.toFixed(1)} ${st.toFixed(1)} q ${(-s*0.02)} ${(-s*0.12)} ${(-s*0.14)} ${(-s*0.16)}"/>`
    +`<path d="M${cx.toFixed(1)} ${st.toFixed(1)} q ${(s*0.02)} ${(-s*0.12)} ${(s*0.14)} ${(-s*0.16)}"/></g>`;
  g+=`<g fill="${color}" opacity="${alpha*0.9}">`
    +`<ellipse cx="${(cx-s*0.15).toFixed(1)}" cy="${(st-s*0.17).toFixed(1)}" rx="${(s*0.07).toFixed(1)}" ry="${(s*0.035).toFixed(1)}" transform="rotate(-30 ${(cx-s*0.15).toFixed(1)} ${(st-s*0.17).toFixed(1)})"/>`
    +`<ellipse cx="${(cx+s*0.15).toFixed(1)}" cy="${(st-s*0.17).toFixed(1)}" rx="${(s*0.07).toFixed(1)}" ry="${(s*0.035).toFixed(1)}" transform="rotate(30 ${(cx+s*0.15).toFixed(1)} ${(st-s*0.17).toFixed(1)})"/></g>`;
  return g;
}
function illusArea(ctx,slot){
  const {W,H,colors}=ctx,x0=slot.x0*W,y0=slot.y0*H,x1=slot.x1*W,y1=slot.y1*H,w=x1-x0,h=y1-y0;
  let s=`<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${colors.imgTint}" opacity="0.09"/>`;
  const ms=Math.min(w,h)*0.55;
  s+=motif((x0+x1)/2,(y0+y1)/2-ms*0.05,ms,colors.imgTint,0.55);
  s+=place(ctx,'ILLUSTRATION',{x0:slot.x0+0.014,x1:slot.x0+0.34,y0:slot.y1-0.05,y1:slot.y1-0.008,maxLines:1,target:0.019,align:'left',valign:'bottom'},{f:F.ebg,c:'EB Garamond',w:500,caps:true,tr:0.03,bl:0.8,fill:colors.sub});
  return s;
}
/* brand area (frameless): typed NAME as text (1 line, 2 only if needed);
   the slot is where an uploaded logo image would sit instead. */
function brandArea(ctx,slot,target){
  const brand=ctx.d.producer;
  const sp={f:ctx.scheme.display.f,c:ctx.scheme.display.c,w:ctx.scheme.display.w,bl:0.80,lh:1.05,caps:ctx.scheme.display.caps,tr:ctx.scheme.display.caps?ctx.scheme.display.tr:0,fill:brand?ctx.colors.text:ctx.colors.sub};
  return place(ctx,brand||'BRAND / LOGO',{x0:slot.x0,x1:slot.x1,y0:slot.y0,y1:slot.y1,maxLines:2,align:'center',valign:'middle',target:target||0.07},sp);
}
const bg=ctx=>`<rect x="0" y="0" width="${ctx.W}" height="${ctx.H}" fill="${ctx.colors.bg}"/>`;

/* ---------- footer (fixed grid; sizes follow UI hierarchy) ---------- */
function footer(ctx){
  const d=ctx.d,c=ctx.colors,sc=ctx.scheme;let s='';
  const lab={f:sc.label.f,c:sc.label.c,w:sc.label.w,bl:0.8,lh:1.1,caps:true,tr:0.05};
  const sub={f:F.ebg,c:'EB Garamond',w:400,bl:0.8,lh:1.1,caps:true,tr:0.04};
  const regionLine=[d.region,d.country].filter(Boolean).join(', ');
  const alcVol=[d.alcohol,d.volume].filter(Boolean).join('    ');
  const desc=wineDescriptor(d);
  s+=place(ctx,desc,{x0:MX,x1:1-MX,y0:0.792,y1:0.832,maxLines:1,align:'center',valign:'middle',target:SZ.special},Object.assign({},sub,{tr:0.12,fill:c.sub}));
  s+=place(ctx,regionLine,{x0:MX,x1:0.47,y0:0.852,y1:0.900,maxLines:1,align:'left',valign:'middle',target:SZ.region},Object.assign({},lab,{fill:c.text}));
  s+=place(ctx,d.classification,{x0:0.53,x1:1-MX,y0:0.852,y1:0.900,maxLines:1,align:'right',valign:'middle',target:SZ.classification},Object.assign({},lab,{fill:c.accent}));
  s+=place(ctx,d.special,{x0:MX,x1:0.45,y0:0.914,y1:0.966,maxLines:1,align:'left',valign:'middle',target:SZ.special},Object.assign({},sub,{italic:true,caps:false,fill:c.sub}));
  s+=place(ctx,d.vintage,{x0:0.37,x1:0.63,y0:0.908,y1:0.972,maxLines:1,align:'center',valign:'middle',target:SZ.vintage},{f:sc.vintage.f,c:sc.vintage.c,w:sc.vintage.w,bl:0.8,fill:c.text});
  s+=place(ctx,alcVol,{x0:0.55,x1:1-MX,y0:0.914,y1:0.966,maxLines:1,align:'right',valign:'middle',target:SZ.alcvol},Object.assign({},sub,{fill:c.sub}));
  return s;
}

/* ---------- 6 template systems ---------- */
function t1(ctx){let s=bg(ctx);                       // centered · image band + brand, stacked name
  s+=illusArea(ctx,{x0:0.14,y0:0.085,x1:0.86,y1:0.45});
  s+=brandArea(ctx,{x0:0.31,y0:0.10,x1:0.69,y1:0.27},0.055);
  s+=place(ctx,ctx.d.wine,{x0:MX,x1:1-MX,y0:0.475,y1:0.635,maxLines:2,align:'center',valign:'middle',target:SZ.wine},DISP(ctx));
  s+=place(ctx,ctx.d.appellation,{x0:MX,x1:1-MX,y0:0.648,y1:0.706,maxLines:1,align:'center',valign:'middle',target:SZ.appellation},LAB(ctx));
  s+=place(ctx,ctx.d.grape,{x0:MX,x1:1-MX,y0:0.716,y1:0.778,maxLines:1,align:'center',valign:'middle',target:SZ.grape},GRP(ctx));
  return s+footer(ctx);}
function t2(ctx){let s=bg(ctx);                       // centered · brand top, one-line name
  s+=brandArea(ctx,{x0:0.24,y0:0.10,x1:0.76,y1:0.34},0.085);
  s+=place(ctx,ctx.d.wine,{x0:MX,x1:1-MX,y0:0.40,y1:0.55,maxLines:2,align:'center',valign:'middle',target:SZ.wine},DISP(ctx));
  s+=place(ctx,ctx.d.appellation,{x0:MX,x1:1-MX,y0:0.565,y1:0.625,maxLines:1,align:'center',valign:'middle',target:SZ.appellation},LAB(ctx));
  s+=place(ctx,ctx.d.grape,{x0:MX,x1:1-MX,y0:0.695,y1:0.760,maxLines:1,align:'center',valign:'middle',target:SZ.grape},GRP(ctx));
  return s+footer(ctx);}
function t3(ctx){let s=bg(ctx);                       // name top · central brand
  s+=place(ctx,ctx.d.wine,{x0:MX,x1:1-MX,y0:0.085,y1:0.205,maxLines:2,align:'center',valign:'middle',target:SZ.wine},DISP(ctx));
  s+=place(ctx,ctx.d.appellation,{x0:MX,x1:1-MX,y0:0.218,y1:0.276,maxLines:1,align:'center',valign:'middle',target:SZ.appellation},LAB(ctx));
  s+=brandArea(ctx,{x0:0.24,y0:0.34,x1:0.76,y1:0.61},0.085);
  s+=place(ctx,ctx.d.grape,{x0:MX,x1:1-MX,y0:0.70,y1:0.765,maxLines:1,align:'center',valign:'middle',target:SZ.grape},GRP(ctx));
  return s+footer(ctx);}
function t4(ctx){let s=bg(ctx);                       // big illustration band top + brand, name below
  s+=illusArea(ctx,{x0:0.055,y0:0.06,x1:0.945,y1:0.55});
  s+=brandArea(ctx,{x0:0.33,y0:0.085,x1:0.67,y1:0.24},0.05);
  s+=place(ctx,ctx.d.wine,{x0:MX,x1:1-MX,y0:0.560,y1:0.662,maxLines:2,align:'center',valign:'middle',target:SZ.wineSmall+0.02},DISP(ctx));
  s+=place(ctx,ctx.d.appellation,{x0:MX,x1:1-MX,y0:0.672,y1:0.724,maxLines:1,align:'center',valign:'middle',target:SZ.appellation},LAB(ctx));
  s+=place(ctx,ctx.d.grape,{x0:MX,x1:1-MX,y0:0.732,y1:0.782,maxLines:1,align:'center',valign:'middle',target:SZ.grape},GRP(ctx));
  return s+footer(ctx);}
function t5(ctx){let s=bg(ctx);                       // name over illustration band · brand lower
  s+=illusArea(ctx,{x0:0.055,y0:0.06,x1:0.945,y1:0.585});
  s+=place(ctx,ctx.d.wine,{x0:MX,x1:1-MX,y0:0.085,y1:0.205,maxLines:2,align:'center',valign:'middle',target:SZ.wineSmall+0.02},DISP(ctx));
  s+=place(ctx,ctx.d.appellation,{x0:MX,x1:1-MX,y0:0.218,y1:0.274,maxLines:1,align:'center',valign:'middle',target:SZ.appellation},LAB(ctx));
  s+=brandArea(ctx,{x0:0.30,y0:0.42,x1:0.70,y1:0.585},0.06);
  s+=place(ctx,ctx.d.grape,{x0:MX,x1:1-MX,y0:0.70,y1:0.765,maxLines:1,align:'center',valign:'middle',target:SZ.grape},GRP(ctx));
  return s+footer(ctx);}
function t6(ctx){let s=bg(ctx);                       // name top · GRAND central brand
  s+=place(ctx,ctx.d.wine,{x0:MX,x1:1-MX,y0:0.075,y1:0.165,maxLines:1,align:'center',valign:'middle',target:SZ.wineSmall},DISP(ctx));
  s+=brandArea(ctx,{x0:0.14,y0:0.20,x1:0.86,y1:0.62},0.135);
  s+=place(ctx,ctx.d.appellation,{x0:MX,x1:1-MX,y0:0.648,y1:0.704,maxLines:1,align:'center',valign:'middle',target:SZ.appellation},LAB(ctx));
  s+=place(ctx,ctx.d.grape,{x0:MX,x1:1-MX,y0:0.714,y1:0.775,maxLines:1,align:'center',valign:'middle',target:SZ.grape},GRP(ctx));
  return s+footer(ctx);}
const TEMPLATES={t1,t2,t3,t4,t5,t6};

/* ---------- assemble ---------- */
function renderLabel(d,v,W,H){
  const pal=PALETTES[v.palette];
  const wineKey=(d.wineColor&&d.wineColor[0]==='#')?WINE_ACCENT[d.wineColor]:d.wineColor;
  const wineHex=WINE_ACCENT[wineKey]||WINE_ACCENT.red;
  const accent=pal.light?wineHex:pal.gold,rule=pal.light?wineHex:pal.rule;
  const colors={bg:pal.bg,text:pal.text,sub:pal.sub,rule:rule,accent:accent,gold:pal.gold,imgTint:pal.imgTint};
  const ctx={W,H,cx:W/2,contentW:W-2*(W*MX),colors,scheme:SCHEMES[v.scheme],d,v};
  const body=(TEMPLATES[v.template]||t1)(ctx);
  const defs=`<defs><style><![CDATA[@import url('${FONTS_URL}');]]></style></defs>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${(W/10)}mm" height="${(H/10)}mm">${defs}${body}</svg>`;
}

/* ---------- public API ---------- */
function pickPool(arr,n){return arr[((n%arr.length)+arr.length)%arr.length];}
function renderOptions(d,opts){
  opts=opts||{};const seed=opts.seed|0;
  const W=Math.max(40,(+opts.widthMM||110))*10,H=Math.max(30,(+opts.heightMM||80))*10;
  return TIERS.map(t=>{
    const template=pickPool(t.templates,seed);
    const scheme=pickPool(t.schemes,seed);
    const v={name:t.name,rank:t.rank,palette:t.palette,template,scheme};
    return {name:t.name,rank:t.rank,desc:SCHEMES[scheme].id+' · '+TPL_DESC[template],svg:renderLabel(d,v,W,H)};
  });
}
async function ensureFonts(){
  if(typeof document!=='undefined'&&!document.getElementById('__lblfonts')){   // load the faces at the page level so inline-SVG text uses them
    const st=document.createElement('style'); st.id='__lblfonts'; st.textContent="@import url('"+FONTS_URL+"');"; document.head.appendChild(st);
  }
  const specs=["600 40px 'Cormorant Garamond'","italic 500 40px 'Cormorant Garamond'","400 40px 'EB Garamond'","500 40px 'EB Garamond'","italic 400 40px 'EB Garamond'",
    "500 40px 'Cinzel'","600 40px 'Cinzel'","700 40px 'Playfair Display'","600 40px 'Playfair Display'","400 40px 'Pinyon Script'",
    "400 40px 'Marcellus'","400 40px 'Prata'","400 40px 'Ballet'","400 40px 'Mrs Saint Delafield'",
    "400 40px 'Great Vibes'","400 40px 'MonteCarlo'","400 40px 'Estonia'","400 40px 'Felipa'","400 40px 'Italianno'",
    "400 40px 'Manufacturing Consent'","400 40px 'Cutive Mono'","600 40px 'Montagu Slab'","400 40px 'Girassol'",
    "400 40px 'Nixie One'","500 40px 'Alegreya SC'","400 40px 'Mate SC'","400 40px 'Baskervville SC'",
    "400 40px 'Tinos'","700 40px 'Tinos'",
    "300 40px 'Jost'","400 40px 'Jost'","500 40px 'Jost'","600 40px 'Jost'",
    "300 40px 'Archivo'","400 40px 'Archivo'","500 40px 'Archivo'","600 40px 'Archivo'","700 40px 'Archivo'","800 40px 'Archivo'",
    "400 40px 'Anton'","400 40px 'Bebas Neue'","600 40px 'Barlow Condensed'","700 40px 'Barlow Condensed'","600 40px 'Barlow'","700 40px 'Barlow'","400 40px 'Permanent Marker'","500 40px 'Caveat'","600 40px 'Caveat'","700 40px 'Caveat'",
    "400 40px 'Fraunces'","500 40px 'Fraunces'","600 40px 'Fraunces'","700 40px 'Fraunces'","italic 500 40px 'Fraunces'",
    "600 40px 'Grenze Gotisch'","400 40px 'IM Fell English SC'"];
  // probe text forces the latin-ext subset too — accented glyphs (Château,
  // Classé) otherwise load late and shift ink metrics between runs
  try{await Promise.all(specs.map(s=>document.fonts.load(s,'ÂÉÈâéèçÇüÜ AaBb0123')));await document.fonts.ready;}catch(e){}
}
/* =============================================================================
   PRIORITY-DRIVEN LAYOUT — priority order (from the editor) drives the SVG.
   Per-rank pt limits; alcohol/volume always <=7pt; no all-caps after rank 3;
   ranks 7 & 8 share a size (7 left, 8 right); texts fit within non-overlapping
   zones (size is clamped to the rank's [min,max] and to the zone).
   ========================================================================== */
const PT_U=25.4/72*10;                         // 1pt in units (0.1mm)
const PRI_PT=[[16,36],[14,17],[14,17],[10,15],[8,16],[8,12],[8,14],[8,14],[7,9],[6.5,7]];
const PRI_LINES=[2,2,2,2,3,3,3,3,3,3];         // hero/brand/appellation/classification wrap ≤2; footer cells ≤3 (no truncation)
const FLOOR7=MIN7;                             // absolute floor 7pt (units); alcohol/volume may reach 6.5pt
/* Zone geometry (fractions of W/H). Everything sits inside the 5 mm margin. Two variants:
   A (default): brand snapped to the top margin · image band from the brand's mid-line down to
     mid-hero · hero centred · appellation+classification grouped under the hero.
   B (swap): hero(1) + appellation(3) move to the TOP · image maximised below them · brand(2)
     drops down, centred on the image's bottom line · classification above the footer.
   Both share three non-overlapping footer columns (left/centre/right; centre widest). The footer
   rows here are GENEROUS placeholders — layoutPriority compacts them to the content and anchors
   them at the bottom margin. 7 left · 8 right. */
function computeZonesP(W,H,variant){
  const mx=50/W, my=50/H, cW=1-2*mx, cH=1-2*my, L=mx, R=1-mx, T=my, B=1-my;   // 5mm margins
  const colGap=0.028, usable=cW-2*colGap, sideW=usable*0.30, centreW=usable*0.40;
  const cL=L, cC=L+sideW+colGap, cR=R-sideW;
  const rowH=0.16*cH, rowGap=0.02*cH, lowTop=B-rowH, upTop=lowTop-rowGap-rowH;  // generous; compacted later
  const footer=[
    {x:cC,y:upTop,w:centreW,h:rowH,a:'center'},       //5 centre-upper
    {x:cC,y:lowTop,w:centreW,h:rowH,a:'center'},      //6 centre-lower
    {x:cL,y:upTop,w:sideW,h:rowH,a:'left'},           //7 LEFT-upper
    {x:cR,y:upTop,w:sideW,h:rowH,a:'right'},          //8 RIGHT-upper
    {x:cL,y:lowTop,w:sideW,h:rowH,a:'left'},          //9 left-lower
    {x:cR,y:lowTop,w:sideW,h:rowH,a:'right'}          //10 right-lower
  ];
  let hero,brand,app,cls,image;
  if(variant==='B'){
    hero ={x:L,y:T+0.03*cH,w:cW,h:0.15*cH,a:'center',valign:'top'};   //1 top (top-aligned; tall glyphs stay inside the margin)
    app  ={x:L+0.06,y:T+0.222*cH,w:cW-0.12,h:0.080*cH,a:'center'};    //3 under hero (tall enough for 14pt)
    const brandH=0.09*cH, imgTop=T+0.315*cH, imgBot=T+0.62*cH;        // maximise the image band below the top group
    brand={x:(1-0.50)/2,y:imgBot-brandH/2,w:0.50,h:brandH,a:'center'};//2 centred on the image bottom line
    cls  ={x:L+0.12,y:T+0.70*cH,w:cW-0.24,h:0.070*cH,a:'center'};     //4 above footer (repositioned to the real footer in layout)
    image={x:L,y:imgTop,w:cW,h:imgBot-imgTop};
  } else {
    const brandH=0.12*cH;
    brand={x:(1-0.48)/2,y:T,w:0.48,h:brandH,a:'center',valign:'top'};//2 snapped to the top margin (text top-aligned to it)
    const heroTop=T+0.40*cH, heroH=0.18*cH;
    hero ={x:L,y:heroTop,w:cW,h:heroH,a:'center'};                   //1 hero centred
    image={x:L,y:T+brandH/2,w:cW,h:(heroTop+heroH*0.5)-(T+brandH/2)};//image top = brand mid-line → mid-hero
    app  ={x:L+0.06,y:heroTop+heroH+0.016*cH,w:cW-0.12,h:0.080*cH,a:'center'};   //3
    cls  ={x:L+0.12,y:heroTop+heroH+0.016*cH+0.080*cH+0.010*cH,w:cW-0.24,h:0.080*cH,a:'center'}; //4 grouped under 3
  }
  return [hero,brand,app,cls,footer[0],footer[1],footer[2],footer[3],footer[4],footer[5],{image}];
}
function slotText(fid,d){switch(fid){
  case 'wineName':return d.wine; case 'producer':return d.producer; case 'appellation':return d.appellation;
  case 'classification':return d.classification; case 'vintage':return d.vintage; case 'grape':return d.grape;
  case 'special':return d.special; case 'regionCountry':return [d.region,d.country].filter(Boolean).join(', ');
  case 'attributes':return wineDescriptor(d); case 'alcVol':return alcVolText(d);
  default:return ''; }}
/* Alcohol: "Alc.: " prefix + "%" if not already typed. Volume: " ml." suffix unless "ml" already typed. */
function alcVolText(d){
  const a=String(d.alcohol||'').trim(), v=String(d.volume||'').trim();
  const ap=a?('Alc.: '+a+(/%/.test(a)?'':'%')):'';
  const vp=v?(/\bml\b|ml\.?/i.test(v)?v:(v+' ml.')):'';
  return [ap,vp].filter(Boolean).join('   ');
}
function specForRank(rank,scheme){
  if(rank<=3) return {f:scheme.display.f,c:scheme.display.c,w:scheme.display.w,caps:scheme.display.caps,tr:scheme.display.tr||0,bl:scheme.display.bl||0.80,lh:1.05};
  return {f:F.ebg,c:'EB Garamond',w:500,caps:false,tr:0,bl:0.80,lh:1.1};   // ranks 4-10: never all-caps
}
/* Fit text into its zone. Never exceeds the zone width (×0.96) or height (×0.96) — so text can't
   overflow or overlap. Picks the line count (1..maxLines) that shows ALL the text at the largest
   size ≤ the rank max. The rank min is a TARGET: size stays ≥ it whenever the text fits, and only
   shrinks below it (down to the absolute floor, 7pt) for unusually long text — words are never
   dropped unless even the floor can't hold them. */
function fitPrio(text,zone,mnU,mxU,spec,W,H,maxLines,floorU,compact){
  maxLines=maxLines||1; floorU=floorU||mnU;
  const zoneWu=zone.w*W, zoneHu=zone.h*H, tr=spec.tr||0, disp=spec.caps?up(text):text;
  const need=disp.replace(/\s+/g,' ').trim().length;
  const fitAt=ml=>{const cap=Math.min(mxU,(zoneHu*0.96)/ml); if(cap<floorU) return null;   // zone too short for this many lines
    const f=wrapFit(disp,zoneWu*0.96,cap,floorU,ml,spec.c,spec.w,false,tr?cap*tr:0);        // shrinks from cap toward floor as needed
    f._c=f.lines.join(' ').replace(/\s+/g,' ').trim().length>=need; return f;};
  let best=null;
  if(compact){                                          // footer: prefer the FEWEST lines that shows all text ≥ floor (stays tight/low)
    for(let ml=1;ml<=maxLines;ml++){const f=fitAt(ml); if(!f) continue;
      if(f._c&&f.size>=floorU-0.01){best=f;break;}
      if(!best||(f._c&&!best._c)||(f._c===best._c&&f.size>best.size+0.01))best=f;}
  } else {                                              // others: prefer the LARGEST size that shows all text
    for(let ml=1;ml<=maxLines;ml++){const f=fitAt(ml); if(!f) continue;
      if(!best||(f._c&&!best._c)||(f._c===best._c&&f.size>best.size+0.01))best=f;}
  }
  if(!best){const disp1=spec.caps?up(text):text; best=wrapFit(disp1,zoneWu*0.96,floorU,floorU,1,spec.c,spec.w,false,0);}
  return best;
}
/* Shared layout: returns image band + per-rank {zone, fitted lines/size, spec}. Used by BOTH the
   SVG renderer and the editor preview, so the wireframe shows the true generated proportions. */
function layoutPriority(d,order,W,H,scheme,variant){
  scheme=scheme||SCHEMES.garamond;
  const Z=computeZonesP(W,H,variant), img=Z[10].image, slots={};
  order.forEach((fid,i)=>{const rank=i+1; if(rank>10) return;
    const text=String(slotText(fid,d)||'').trim(); if(!text) return;
    const zone=Z[rank-1], spec=specForRank(rank,scheme), ml=PRI_LINES[rank-1]||1;
    let mn=PRI_PT[rank-1][0], mx=PRI_PT[rank-1][1];
    if(fid==='alcVol'){mx=Math.min(mx,7); mn=Math.min(mn,6.5);}     // alcohol/volume always <=7pt
    const floorU=Math.min(mn*PT_U, fid==='alcVol'?6.5*PT_U:FLOOR7);
    const compact=rank>=5;                                          // footer cells render tight (fewest lines, near minimum)
    slots[rank]={fid,rank,text,zone,spec,ml,mnU:mn*PT_U,mxU:mx*PT_U,floorU,compact,lt:fitPrio(text,zone,mn*PT_U,mx*PT_U,spec,W,H,ml,floorU,compact)};});
  const refit=(o,ceilU)=>fitPrio(o.text,o.zone,o.mnU,Math.max(ceilU,o.floorU),o.spec,W,H,o.ml,o.floorU,o.compact);   // grow/shrink to ceil, fit width+height
  /* ranks 1..6 non-increasing (each no larger than the one above it) */
  let prev=Infinity;
  for(let r=1;r<=6;r++){const o=slots[r]; if(!o) continue; if(o.lt.size>prev) o.lt=refit(o,prev); prev=o.lt.size;}
  const size6=slots[6]?slots[6].lt.size:prev;
  /* ranks 7 & 8: equal size, 15% larger than they'd otherwise be (bounded by their max + zone) */
  const pair=[7,8].filter(r=>slots[r]);
  if(pair.length){
    let sz=Math.min.apply(null,pair.map(r=>slots[r].lt.size))*1.15;
    pair.forEach(r=>{sz=Math.min(sz,slots[r].mxU);});
    pair.forEach(r=>{slots[r].lt=refit(slots[r],sz);});
    const sz2=Math.min.apply(null,pair.map(r=>slots[r].lt.size));
    pair.forEach(r=>{slots[r].lt=refit(slots[r],sz2);});          // keep both exactly equal
  }
  /* ranks 9 & 10: never larger than rank 6 (keeps the bottom row calm on tall labels) */
  [9,10].forEach(r=>{const o=slots[r]; if(o&&o.lt.size>size6) o.lt=refit(o,size6);});
  /* Compact the two footer rows to their content and anchor at the bottom margin, so the footer
     sits low and tight (5/7/8 come down on wide labels where the cells only need one line). */
  const my=50/H, cH=1-2*my, B=1-my, padF=0.010*cH, rowGapF=0.014*cH;
  const blockH=r=>{const o=slots[r]; return o?(o.lt.lines.length*o.lt.size*o.spec.lh)/H:0;};
  const rowHeight=rr=>{const h=Math.max.apply(null,rr.map(blockH)); return (h>0?h:0.05*cH)+2*padF;};
  const lowH=rowHeight([6,9,10]), upH=rowHeight([5,7,8]);
  const lowY=B-lowH, upY=lowY-rowGapF-upH;
  const footRows={up:{y:upY,h:upH},low:{y:lowY,h:lowH}};
  [5,7,8].forEach(r=>{if(slots[r])slots[r].zone=Object.assign({},slots[r].zone,{y:upY,h:upH});});
  [6,9,10].forEach(r=>{if(slots[r])slots[r].zone=Object.assign({},slots[r].zone,{y:lowY,h:lowH});});
  /* variant B: brand stays a single line (it floats on the image line — keep it clear of the
     classification), and classification seats just above the (real) footer top */
  if(variant==='B'&&slots[2]){slots[2].ml=1; slots[2].lt=fitPrio(slots[2].text,slots[2].zone,slots[2].mnU,slots[2].mxU,slots[2].spec,W,H,1,slots[2].floorU);}
  if(variant==='B'&&slots[4]){const clsH=slots[4].zone.h;
    const brandBot=slots[2]?slots[2].zone.y+slots[2].zone.h:0.62*cH;
    const clsY=Math.max(upY-0.015*cH-clsH, brandBot+0.012*cH);       // above the footer, but never above the brand
    slots[4].zone=Object.assign({},slots[4].zone,{y:clsY});}
  /* extreme-length safety: if appellation/classification would dip into the (variable-height) footer,
     shrink them into the band that remains above it — no overlap, graceful downsizing. */
  const limitV=upY-0.012*cH;
  [3,4].forEach(r=>{const o=slots[r]; if(!o) return; if(o.zone.y+o.zone.h>limitV && o.zone.y<limitV){
    o.zone=Object.assign({},o.zone,{h:Math.max(0.04*cH,limitV-o.zone.y)});
    o.lt=fitPrio(o.text,o.zone,o.mnU,o.mxU,o.spec,W,H,o.ml,o.floorU,o.compact);}});
  return {img,slots,footRows};
}
function renderPriorityLabel(d,order,v,W,H){
  const pal=PALETTES[v.palette];
  const wineKey=(d.wineColor&&d.wineColor[0]==='#')?WINE_ACCENT[d.wineColor]:d.wineColor;
  const wineHex=WINE_ACCENT[wineKey]||WINE_ACCENT.red;
  const accent=pal.light?wineHex:pal.gold, colors={bg:pal.bg,text:pal.text,sub:pal.sub,accent:accent,imgTint:pal.imgTint};
  const scheme=SCHEMES[v.scheme]||SCHEMES.garamond;
  const {img,slots}=layoutPriority(d,order,W,H,scheme,v.variant);
  let s=`<rect x="0" y="0" width="${W}" height="${H}" fill="${colors.bg}"/>`;
  s+=`<rect x="${(img.x*W).toFixed(1)}" y="${(img.y*H).toFixed(1)}" width="${(img.w*W).toFixed(1)}" height="${(img.h*H).toFixed(1)}" fill="${colors.imgTint}" opacity="0.06"/>`;
  { const ms=Math.min(img.w*W,img.h*H)*0.42; s+=motif((img.x+img.w/2)*W,(img.y+img.h/2)*H,ms,colors.imgTint,0.32); }
  Object.keys(slots).forEach(rk=>{const o=slots[rk],z=o.zone,sz=o.lt.size,lines=o.lt.lines;
    const blockH=lines.length*sz*o.spec.lh, top=z.valign==='top'?(z.y*H+sz*0.22):(z.y+z.h/2)*H-blockH/2;
    const x=z.a==='left'?z.x*W:z.a==='right'?(z.x+z.w)*W:(z.x+z.w/2)*W, anchor=z.a==='left'?'start':z.a==='right'?'end':'middle';
    const fill=(+rk<=2)?colors.text:(+rk===3)?colors.accent:colors.sub;
    s+=`<text font-family="${o.spec.f}" font-weight="${o.spec.w}" font-size="${sz.toFixed(1)}" ${o.spec.tr?`letter-spacing="${(sz*o.spec.tr).toFixed(2)}" `:''}fill="${fill}" text-anchor="${anchor}">`
      +lines.map((l,i)=>`<tspan x="${x.toFixed(1)}" y="${(top+sz*o.spec.bl+i*sz*o.spec.lh).toFixed(1)}">${esc(l)}</tspan>`).join('')+`</text>`;});
  const defs=`<defs><style><![CDATA[@import url('${FONTS_URL}');]]></style></defs>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${(W/10)}mm" height="${(H/10)}mm">${defs}${s}</svg>`;
}
/* =============================================================================
   CLASSIC / TRADITIONAL — 4 fixed templates reproduced from the client's PDF
   (Grand_Vin_Classic_Samples). Reference page 311.8 × 226.8 pt = 110 × 80 mm,
   Times New Roman (→ Tinos). Exact point sizes; grey box = image area.
   Priority order fills the ranks (rank i = order[i-1]); the producer/brand rank
   is the traditional focal element. Footer identical across all 4.
   ========================================================================== */
const CL_IMG_FALLBACK='#BEC0C2';
const CL_IMG_DATA=(typeof window!=='undefined'&&window.__VINEYARD__)?window.__VINEYARD__:'';   // vineyard placeholder (set by img-data.js)
const PT_UNIT=25.4/72*10;                                  // 1 pt in units (0.1mm) — fixed physical sizes
const REFH=80*10;                                          // reference height (80mm) in units; anchors keyed to it
/* From the PDF we take ONLY the positions, sizes and weights. Colours (palette) and font families
   (scheme) keep the full variety — ordinary→bold, ivory→cream→claret→midnight, incl. the black option. */
function clFontSpec(rank,scheme){
  if(rank<=3) return {f:scheme.display.f,c:scheme.display.c,w:scheme.display.w,caps:!!scheme.display.caps,tr:scheme.display.tr||0,bl:scheme.display.bl||0.80};
  if(rank===5&&scheme.vintage) return {f:scheme.vintage.f,c:scheme.vintage.c,w:scheme.vintage.w||700,caps:false,tr:0,bl:0.80};
  if(rank===6) return {f:F.ebg,c:'EB Garamond',w:700,caps:false,tr:0,bl:0.80};   // grape — bold
  return {f:F.ebg,c:'EB Garamond',w:400,caps:false,tr:0,bl:0.80};        // classification + footer: quiet body serif
}
/* Each element: y=top of glyph in ref pt, s=pt, a=align (l/c/r), k=anchor (t=from top, b=from bottom).
   Fonts are fixed physical sizes; top-anchored elements stay near the top margin, bottom-anchored
   ones snap toward the bottom, and the image band absorbs the extra height when the label grows. */
/* Footer: each row shares ONE baseline (by, in ref pt, bottom-anchored) so 7·5·8 sit on one line
   and 9·6·10 on another — regardless of their individual font sizes. */
const CL_FOOT={5:{by:204,s:13,a:'c'},7:{by:204,s:10.5,a:'l'},8:{by:204,s:10.5,a:'r'},
  6:{by:214,s:10,a:'c'},9:{by:214,s:9,a:'l'},10:{by:214,s:7,a:'r'}};
const CL_RATIO=1.504, REFW_PT=311.8, PH_REF=226.8;              // engraving aspect + reference page width & height (pt)
const CL_UPSHIFT=0.22;                                          // share of vertical image overflow to nudge the centre upward (cleaner space below for lower text)
/* Colour variations taken from the client's 4 samples (Classic2 / Refined / Bold / Expressive).
   rank 1 wine→text · rank 2 brand→brand · rank 3 appellation→accent · ranks 4–10→sub. */
/* `ol` = outline/halo colour for text over the image (defaults to bg; the white option uses a light
   grey so the halo actually reads on the white paper). */
function clColW(rank,contentW){                                                // footer column widths (non-overlapping)
  if(rank===6) return contentW*0.48;   // grape / centre-lower — widest (longest content)
  if(rank===5) return contentW*0.34;   // vintage / centre-upper (short)
  if(rank===9||rank===10) return contentW*0.25;                               // lower sides
  return contentW*0.30;                                                        // upper sides (7,8)
}
function clY(y_pt,k,H){return y_pt/PH_REF*H;}   // proportional — the composition fills the whole label height (no big gaps)
/* ============ Composition engine — rebuilt exactly from Layout_Compositions.pdf ============
   Reference artboard 294.8×238.1pt = 104×84mm (100×80 trim + 2mm bleed). All positions/sizes/
   colours reproduced from the reference; ONLY the fonts vary. Units below are 0.1mm (PT_UNIT). */
const PT=PT_UNIT;                                   // 1pt in units (0.1mm)
const LC_BU=2*10, LC_MARGU=5*10;                    // 2mm bleed, 5mm text margin (units)
const LC_RTWu=1000, LC_RTHu=800;                    // reference trim 100×80mm (units)
const LC_RED='#D71920', LC_DK='#231F20';
/* the "red" accent follows the wine colour: white→green, orange→dirty orange, rosé→pink; red (or unset) stays red */
function lcAccent(d){var c=String(d&&d.wineColorName||'').trim().toLowerCase();
  if(c==='white') return '#648726';
  if(c==='orange') return '#894913';
  if(c==='rosé'||c==='rose') return '#cc1f59';
  return LC_RED;}
const LC_BGS=['#FFFFFF','#FAF6EC','#F5EEDD','#F1E8D4','#EFE6CF','#F7F1E3'];   // white → warm paper tones
const LC_SERIF=['garamond','playfair','cinzel','marcellus','tinos','montaguSlab','baskervvilleSC','mateSC','alegreyaSC','girassol'];   // traditional serifs (no blackletter/gothic, no thin Didone)
const LC_SCRIPT=['calligraphic','greatVibes','ballet','italianno','monteCarlo','estonia','mrsSaint','felipa','cinzel'];   // calligraphic/cursive for the imageless options
const LC_SCRIPTSET={calligraphic:1,greatVibes:1,ballet:1,italianno:1,monteCarlo:1,estonia:1,mrsSaint:1,felipa:1};
/* shared flat footer (ranks 4-10), reference artboard pt */
const LC_FLAT=[
  {id:4,y:182.5,s:14,a:'c',col:'dk',role:'cls'},
  {id:5,y:198.6,s:13,a:'c',col:'dk',role:'vint'},
  {id:7,y:199.9,s:10,a:'l',col:'dk',role:'foot'},
  {id:8,y:199.9,s:10,a:'r',col:'dk',role:'foot'},
  {id:9,y:212.6,s:9, a:'l',col:'dk',role:'foot'},
  {id:6,y:212.6,s:9, a:'c',col:'dk',role:'grape'},
  {id:10,y:212.6,s:9,a:'r',col:'dk',role:'foot'}
];
function lcFlat(dy){return LC_FLAT.map(e=>dy?Object.assign({},e,{y:e.y+dy}):e);}
/* framed footer: classification + vintage + grape stacked centre, region/special combined, and
   sweetness+alc set as rotated text down the right frame edge (ranks 9·10). */
const LC_FRFOOT=[
  {id:4,y:169,s:14,a:'c',col:'dk',role:'cls'},
  {id:5,y:185,s:13,a:'c',col:'dk',role:'vint'},
  {id:6,y:203,s:10,a:'c',col:'rd',role:'grape',caps:1},
  {combine:[7,8],y:218.6,s:9,a:'c',col:'dk',role:'foot',capsFirst:1},
  {side:[9,10],s:7.5,col:'dk',role:'foot'}
];
/* compositions from the reference. group 0=no image, 1=small, 2=large. */
const LC_COMPS=[
  {id:'C6', group:0, img:null, arch:1, top:[
    {id:1,y:37.3,s:14,a:'c',col:'dk',role:'title'},
    {id:2,y:76.2,s:40,a:'c',col:'dk',role:'estate',lines:2},
    {id:3,y:162.4,s:16,a:'c',col:'rd',role:'aoc'} ], foot:lcFlat(0)},
  {id:'C4', group:0, img:null, arch:1, top:[
    {id:1,y:30.3,s:14,a:'c',col:'dk',role:'title'},
    {id:2,y:66,s:40,a:'c',col:'rd',role:'estate',lines:2},
    {id:3,y:150,s:16,a:'c',col:'dk',role:'aoc'} ], foot:lcFlat(0)},
  {id:'C1', group:1, img:[87.3,47.2,207.5,112.8], top:[
    {id:1,y:25.5,s:17,a:'c',col:'dk',role:'title'},
    {id:2,y:125,s:20,a:'c',col:'rd',role:'estate'},
    {id:3,y:145.2,s:16,a:'c',col:'dk',role:'aoc'} ], foot:lcFlat(0)},
  {id:'C2', group:1, img:[61,48.7,233.8,129.9], top:[
    {id:1,y:25.5,s:17,a:'c',col:'dk',role:'title'},
    {id:2,y:140,s:20,a:'c',col:'rd',role:'estate'},
    {id:3,y:160.2,s:16,a:'c',col:'dk',role:'aoc'} ], foot:lcFlat(0)},
  {id:'C7', group:1, img:[48.9,40.1,245.9,132.7], arch:1, top:[
    {id:1,y:30.3,s:14,a:'c',col:'dk',role:'title',over:1},
    {id:2,y:140,s:20,a:'c',col:'rd',role:'estate'},
    {id:3,y:160.2,s:16,a:'c',col:'dk',role:'aoc'} ], foot:lcFlat(0)},
  {id:'C5', group:2, img:[0,0,294.8,174.6], top:[
    {id:1,y:28,s:14.7,a:'c',col:'dk',role:'title',over:1},
    {id:2,y:50,s:20,a:'c',col:'rd',role:'estate',over:1},
    {id:3,y:166.5,s:16,a:'c',col:'dk',role:'aoc'} ], foot:lcFlat(0)},
  {id:'C8', group:2, img:[0,30,294.8,154.1], top:[
    {id:1,y:25.5,s:17,a:'c',col:'dk',role:'title',over:1},
    {id:2,y:147,s:20,a:'c',col:'rd',role:'estate',over:1},
    {id:3,y:167.2,s:16,a:'c',col:'dk',role:'aoc'} ], foot:lcFlat(2)},
  {id:'C9', group:2, img:[0,46.2,294.8,174.6], top:[
    {id:1,y:28,s:14.7,a:'c',col:'dk',role:'title',over:1},
    {id:2,y:50,s:20,a:'c',col:'rd',role:'estate',over:1},
    {id:3,y:166.5,s:16,a:'c',col:'dk',role:'aoc'} ], foot:lcFlat(0)},
  /* framed */
  {id:'C4F', group:0, frame:1, img:null, arch:1, top:[
    {id:1,y:30.3,s:14,a:'c',col:'dk',role:'title'},
    {id:2,y:66,s:40,a:'c',col:'rd',role:'estate',lines:2},
    {id:3,y:150,s:16,a:'c',col:'dk',role:'aoc'} ], foot:lcFlat(0)},
  {id:'C3', group:2, frame:1, img:[31.3,37.9,263.5,127.8], arch:1, top:[
    {id:1,y:30.3,s:14,a:'c',col:'dk',role:'title',over:1},
    {id:2,y:100,s:20,a:'c',col:'rd',role:'estate',over:1},
    {id:3,y:122,s:16,a:'c',col:'dk',role:'aoc',over:1} ], foot:lcFlat(0)},
  {id:'C10', group:2, frame:1, img:[24.6,26,270.2,149], arch:1, top:[
    {id:1,y:30.3,s:14,a:'c',col:'dk',role:'title',over:1},
    {id:2,y:115,s:20,a:'c',col:'rd',role:'estate',over:1},
    {id:3,y:140,s:16,a:'c',col:'dk',role:'aoc',over:1} ], foot:lcFlat(0)}
];
const LC_GROUPS=[['C6','C4','C4F'],['C1','C2','C7'],['C5','C8','C9','C3','C10']];
const LC_GNAME=['No image','Small image','Large image'];
function lcById(id){return LC_COMPS.find(c=>c.id===id);}
/* role → font spec from a scheme */
function lcFont(role,scheme){const S=SCHEMES[scheme]||SCHEMES.garamond, scr=LC_SCRIPTSET[scheme];
  if(role==='estate') return {f:S.display.f,c:S.display.c,w:scr?S.display.w:Math.max(600,S.display.w),caps:scr?0:1,tc:scr?1:0,tr:scr?0:Math.min(0.08,S.display.tr||0),bl:S.display.bl||0.8,scr:scr};   // serif main text is never thin
  if(role==='title')  return {f:scr?F.marcellus:S.label.f,c:scr?'Marcellus':S.label.c,w:S.label.w||500,caps:1,tr:0.08,bl:0.8};
  if(role==='aoc')    return {f:S.label.f,c:S.label.c,w:S.label.w||500,caps:0,tr:Math.min(0.08,S.label.tr||0),bl:0.8};
  if(role==='vint')   return {f:F.ebg,c:'EB Garamond',w:700,caps:0,tr:0,bl:0.8};   // vintage is always a solid serif — never light/thin
  if(role==='grape')  return {f:S.grape.f,c:S.grape.c,w:S.grape.w||500,caps:0,tr:0,bl:0.8};
  return {f:F.ebg,c:'EB Garamond',w:400,caps:0,tr:0,bl:0.8};    // cls / foot
}
/* contain-to-cover the black box: fill by the box's short axis, overflow the long axis, clipped only
   by the artboard edge (never cropped inside). box = [x0,y0,x1,y1] in ref artboard pt. */
function lcImageSVG(box,map,fscale,bg,clipId,scale){
  scale=scale||1;
  const x0=map(box[0]*PT,box[1]*PT), x1=map(box[2]*PT,box[3]*PT);
  const bx=x0.x, by=x0.y, bw=x1.x-x0.x, bh=x1.y-x0.y, br=bw/bh, r=CL_RATIO;
  let rw,rh; if(br>=r){rw=bw; rh=bw/r;} else {rh=bh; rw=bh*r;}          // cover the box
  rw*=scale; rh*=scale;                                                 // large-image option: enlarge the engraving
  // big images overflow the box (and often the label) vertically — nudge the centre UP by a share of that
  // overflow so more of the extra image bleeds off the TOP edge, leaving cleaner space for the lower text.
  const rx=bx+bw/2-rw/2, ry=by+bh/2-rh/2 - Math.max(0,rh-bh)*CL_UPSHIFT;
  // live image source: the per-style generated set (window.__LABEL_IMGS__) wins,
  // then the shared single image (window.__LABEL_IMG__), then the vineyard placeholder.
  // lcRender is the Traditional style's engine, so it reads the traditional slot;
  // the other styles' slots are consumed as their layouts gain image areas.
  const genImg=(typeof window!=='undefined')?((window.__LABEL_IMGS__&&window.__LABEL_IMGS__.traditional)||window.__LABEL_IMG__||null):null;
  const imgSrc=genImg||CL_IMG_DATA;
  const blend=' style="mix-blend-mode:multiply"';   // multiply always — matches the print treatment (Adobe-style Multiply)
  if(!imgSrc) return `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="#BEC0C2" clip-path="url(#${clipId})"/>`;
  return `<image x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}" preserveAspectRatio="xMidYMid meet" clip-path="url(#${clipId})" xlink:href="${imgSrc}" href="${imgSrc}"${blend}/>`;
}
/* one chamfered/straight rectangle outline as a CONTINUOUS path (corners joined) — the pen only lifts
   where a gap is cut (gaps: {top,right,bottom} = {c,half} in target units). */
function lcRectPath(x0,y0,x1,y1,c,gaps,sw,op){
  const P=[], add=(x,y,cut)=>P.push([x,y,!!cut]);
  const gT=gaps&&gaps.top,gR=gaps&&gaps.right,gB=gaps&&gaps.bottom, closed=!gT&&!gR&&!gB;
  add(x0+c,y0,false);
  if(gT){add(gT.c-gT.half,y0,false);add(gT.c+gT.half,y0,true);}
  add(x1-c,y0,false);
  if(c>0)add(x1,y0+c,false);
  if(gR){add(x1,gR.c-gR.half,false);add(x1,gR.c+gR.half,true);}
  add(x1,y1-c,false);
  if(c>0)add(x1-c,y1,false);
  if(gB){add(gB.c+gB.half,y1,false);add(gB.c-gB.half,y1,true);}
  add(x0+c,y1,false);
  if(c>0)add(x0,y1-c,false);
  add(x0,y0+c,false);
  if(c>0&&!closed)add(x0+c,y0,false);                       // when closed, Z draws the last chamfer
  let dd='';
  for(let i=0;i<P.length;i++){const q=P[i]; dd+=((i===0||q[2])?'M ':'L ')+q[0].toFixed(1)+' '+q[1].toFixed(1)+' ';}
  if(closed)dd+='Z';
  return '<path d="'+dd+'" fill="none" stroke="'+LC_DK+'"'+(op!=null&&op<1?' stroke-opacity="'+op+'"':'')+' stroke-width="'+sw.toFixed(2)+'" stroke-linejoin="miter" stroke-linecap="butt"/>';
}
/* double frame: constant inset from the edge on every side, constant gap between the two lines
   (outer 2pt, inner 1pt). style: 'cham' (chamfered corners) or 'square' (straight). */
function lcFrameSVG(AWu,AHu,style,gaps,fscale){
  const I=22*fscale, g=13*fscale;                            // edge inset (same all round) + line gap (constant)
  const square=/square/.test(style), op=/50/.test(style)?0.5:1;
  const cham=square?0:13.5*PT*fscale;
  const chamI=Math.max(0,cham-g*(2-Math.SQRT2));            // keep perpendicular gap constant through the chamfer
  const swO=Math.max(0.8,2*PT*fscale), swI=Math.max(0.45,1*PT*fscale);
  return lcRectPath(I,I,AWu-I,AHu-I,cham,gaps,swO,op)+lcRectPath(I+g,I+g,AWu-I-g,AHu-I-g,chamI,gaps,swI,op);
}
/* main composition renderer. Artboard = REAL trim size; background + image bleed 2mm beyond it. */
function lcRender(d,order,comp,cfg,twMM,thMM){
  const bg=cfg.bg||'#FFFFFF', scheme=cfg.scheme||'garamond', accent=lcAccent(d);
  const AWu=twMM*10, AHu=thMM*10;
  const sx=(twMM*10)/LC_RTWu, sy=(thMM*10)/LC_RTHu, fscale=Math.min(sx,sy);
  const map=(xu,yu)=>({x:(xu-LC_BU)*sx, y:(yu-LC_BU)*sy});
  const clipId='lcart_'+comp.id, CL=2*10, PTf=PT*fscale, MINU=7*PT;   // 2mm clearance / bleed · absolute floor
  // per-element minimum size (physical pt) by engine id — id1 producer, id2 wineName, id3 appellation,
  // id4 grape, id5 vintage, id6 classification, id7 region, id8 special, id9 attributes, id10 alc/vol.
  const HFLOOR={1:12,2:15,3:10,4:9,5:8,6:8,7:8,8:8,9:7,10:7}, HWRAP={1:2,2:2,3:2};   // 1·2·3 may wrap to 2 rows (centred)
  const idFloorU=(id)=>(HFLOOR[id]||7)*PT;
  const yU=(pt)=>(pt*PT-LC_BU)*sy;
  let s=`<rect x="${(-LC_BU).toFixed(1)}" y="${(-LC_BU).toFixed(1)}" width="${(AWu+2*LC_BU).toFixed(1)}" height="${(AHu+2*LC_BU).toFixed(1)}" fill="${bg}"/>`;
  const imgScale=cfg.imgScale||1;
  const box=comp.img; if(box) s+=lcImageSVG(box,(xp,yp)=>map(xp,yp),fscale,bg,clipId,imgScale);
  const frInset=comp.frame?28*fscale:0;                                  // framed: pull edge elements further inside the frame lines
  const Lx=LC_MARGU+frInset, Rx=AWu-LC_MARGU-frInset, Cx=AWu/2, maxCW=Rx-Lx;
  // over-image test uses the ACTUAL rendered image rectangle (it covers + overflows the black box), so every
  // element that sits over the visible engraving gets its background-colour outline.
  let ibx=null; if(box){const a=map(box[0]*PT,box[1]*PT),b=map(box[2]*PT,box[3]*PT);
    const bw=b.x-a.x,bh=b.y-a.y,br=bw/bh,rr=CL_RATIO; let rw,rh; if(br>=rr){rw=bw;rh=bw/rr;}else{rh=bh;rw=bh*rr;}
    rw*=imgScale; rh*=imgScale;
    const rx=a.x+bw/2-rw/2, ry=a.y+bh/2-rh/2 - Math.max(0,rh-bh)*CL_UPSHIFT; ibx={x0:rx,y0:ry,x1:rx+rw,y1:ry+rh};}
  const archOn=(cfg.arch!=null)?cfg.arch:!!comp.arch;
  const slot=(r)=>String(slotText(order[r-1],d)||'').trim();
  const elText=(e)=>e.combine?e.combine.map((r,i)=>{let v=slot(r);if(e.capsFirst&&i===0)v=up(v);return v;}).filter(Boolean).join('   /   '):slot(e.id);
  function fitEl(e){let text=elText(e); if(!text)return null;
    const fs=lcFont(e.role,scheme); let disp=text;
    if((fs.caps||e.caps)&&!e.combine) disp=up(text);
    else if(fs.tc && disp===disp.toUpperCase() && /[A-ZА-Я]/.test(disp)) disp=disp.toLowerCase().replace(/(^|[\s'’\-])([a-zà-ÿ])/g,(m,a,b)=>a+b.toUpperCase());   // script faces: never all-caps → Title Case
    const esz=(comp.group===0&&e.role==='estate'&&cfg.estateScale)?e.s*cfg.estateScale:e.s;   // no-image main text: vary the size (bigger more often)
    const floorU=idFloorU(e.id), nlines=HWRAP[e.id]||e.lines||1, base=Math.max(floorU,esz*PTf);   // per-element floor; 1·2·3 wrap to 2 rows if too wide
    const availW=(!e.a||e.a==='c')?maxCW*0.98:Math.max(MINU*3, maxCW/2-16*fscale);             // left/right footer stay in their half, clear of the centre column
    const lt=wrapFit(disp,availW,base,floorU,nlines,fs.c,fs.w,false,fs.tr?base*fs.tr:0);
    return {fs,size:lt.size,lines:lt.lines,nl:lt.lines.length};}
  // ---- pass 1: fit every element, then place by CORRELATIONS (so tall/narrow labels don't drift) ----
  const pos=new Map(), allEls=comp.top.concat(comp.foot).filter(e=>!e.side);
  allEls.forEach(e=>{const f=fitEl(e); if(f)pos.set(e,{f,topY:yU(e.y)});});
  const byRole=(r)=>allEls.find(e=>e.role===r);
  const T=byRole('title'),ES=byRole('estate'),AO=byRole('aoc'),CLS=byRole('cls'),V5=byRole('vint');
  const H_=(p)=>p.f.size*p.f.nl*1.06;
  // Size hierarchy (final SVG): id2 > id1 > id3 > id4 > id5 > (id6=id7=id8) > id9,id10  — i.e.
  // WineName > Producer > Appellation > Grape > Vintage > (Region=Special=Classification) > (Attributes,Alc).
  // Each tier is capped below the one above AND floored at its per-element minimum (equalising members).
  const idP={}; allEls.forEach(e=>{if(e.id!=null){const p=pos.get(e); if(p)idP[e.id]=p;}});
  function enforceHier(){let cap=Infinity; const d=0.35*PTf;
    [[2],[1],[3],[4],[5],[6,7,8],[9,10]].forEach(tier=>{
      const ps=tier.map(id=>idP[id]).filter(Boolean); if(!ps.length)return;
      const tierFloor=idFloorU(tier[0]);
      let sz=Math.min(cap,Math.min.apply(null,ps.map(p=>p.f.size))); if(sz<tierFloor)sz=tierFloor;
      ps.forEach(p=>{p.f.size=sz;});                    // equalise within the tier (6=7=8, 9=10)
      cap=sz-d;});}
  enforceHier();
  // footer block (ranks 5-10) sits at the bottom; rows keep their tight spacing (fscale, never stretched)
  const footRows=allEls.filter(e=>e.role==='vint'||e.role==='grape'||e.role==='foot'||e.role==='cls'||e.combine);   // grape (id4/'cls' slot) anchors with the footer
  if(footRows.length){const maxRefY=Math.max.apply(null,footRows.map(e=>e.y));
    const bEl=footRows.reduce((a,b)=>b.y>a.y?b:a), bp=pos.get(bEl);
    const frameInnerBot=AHu-(22+13)*fscale, textBottom=comp.frame?Math.min(frameInnerBot-CL,AHu-LC_MARGU):(AHu-LC_MARGU);   // never past the 5mm bottom margin (and inside the frame)
    const bTop=textBottom-(bp?H_(bp):0);
    footRows.forEach(e=>{const p=pos.get(e); if(p)p.topY=bTop-(maxRefY-e.y)*PTf;});}
  const BL=(p)=>p.topY+p.f.size*p.f.fs.bl, setBL=(p,bl)=>{p.topY=bl-p.f.size*p.f.fs.bl;};
  const footTop=()=>{let mt=Infinity;footRows.forEach(e=>{const p=pos.get(e);if(p)mt=Math.min(mt,p.topY);});return mt;};
  // after the 4↔6 swap: id4('cls' slot)=grape text, id5=vintage, id6('grape' slot)=classification text
  const cGr=byRole('cls'), cVi=byRole('vint'), cCl=byRole('grape');
  // no-image: centre the script main text (estate) in the free area between the title and the AOC (or the footer)
  if(comp.group===0 && ES && pos.has(ES)){
    const pE=pos.get(ES), pT=(T&&pos.get(T));
    const freeTop=(pT?pT.topY+H_(pT):yU(comp.top[0].y))+2*PTf;
    let freeBot=(AO&&pos.get(AO))?pos.get(AO).topY:footTop();
    if(isFinite(freeBot)&&freeBot>freeTop){
      const mar=6*PTf, avail=freeBot-freeTop-2*mar, eflo=idFloorU(ES.id);             // keep a clear gap above & below
      if(H_(pE)>avail && avail>eflo) pE.f.size=Math.max(eflo,avail/(pE.f.nl*1.06));    // shrink to fit the free area (never below the main-text floor)
      pE.topY=(freeTop+freeBot)/2-H_(pE)/2;
    }
  } else if(ES&&AO && (AO.y-ES.y)<45){const pE=pos.get(ES),pA=pos.get(AO); if(pE&&pA) pA.topY=pE.topY+(AO.y-ES.y)*PTf;}
  // centre-LOWER box (classification, id6) empty → on the FLAT footer let grape & vintage step down onto
  // the side-row baselines (varied per option): both step down / only vintage / leave as-is.
  const clsOn=cCl&&pos.has(cCl);
  if(!clsOn && cGr&&pos.has(cGr) && cVi&&pos.has(cVi)){
    const leftFoot=footRows.filter(e=>e.role==='foot'&&e.a==='l'&&pos.has(e)).sort((a,b)=>pos.get(a).topY-pos.get(b).topY);
    if(leftFoot.length>=2){
      const rowB=BL(pos.get(leftFoot[0])), rowC=BL(pos.get(leftFoot[1])), v=(cfg.footVariant|0)%3;
      if(v===0){setBL(pos.get(cGr),rowB);setBL(pos.get(cVi),rowC);}       // both step down (grape→region line, vintage→alc line)
      else if(v===1){setBL(pos.get(cVi),rowC);}                           // only vintage steps down
    }
  }
  // overlap guard on the centred stack (shrink the upper of any colliding pair)
  const stackDef=[T,ES,AO,cGr,cVi,cCl].filter(e=>e&&pos.has(e)).sort((a,b)=>pos.get(a).topY-pos.get(b).topY);
  for(let i=0;i<stackDef.length-1;i++){const A=pos.get(stackDef[i]),B=pos.get(stackDef[i+1]),gap=2.5*PTf,aBottom=A.topY+H_(A),aflo=idFloorU(stackDef[i].id);
    if(aBottom>B.topY-gap){const avail=(B.topY-gap)-A.topY; A.f.size=Math.min(A.f.size,Math.max(aflo,avail/(A.f.nl*1.06)));}}   // shrink the upper toward its floor (never grow)
  enforceHier();   // final guarantee after every size adjustment
  // bottom-row centre cell (classification, id6) stays dead-CENTRED on the label. Only when a centred
  // single line would actually collide with a side cell on its row do we intervene: nudge it into the
  // free gap on one line if it fits, else wrap to 2 lines. A centred line that clears is left untouched.
  (function(){
    const elW=(p)=>Math.max.apply(null,p.f.lines.map(l=>measure(l,p.f.size,p.f.fs.f,p.f.fs.w,false,p.f.fs.tr?p.f.size*p.f.fs.tr:0)));
    const c=cCl&&pos.get(cCl); if(!c) return;
    const near=comp.foot.filter(e=>e.role==='foot'&&(e.a==='l'||e.a==='r')&&pos.has(e)&&Math.abs(pos.get(e).topY-c.topY)<c.f.size*0.7);
    if(!near.length) return;                                               // nothing else on this row → leave it dead-centre
    const gap=5*fscale; let leftR=Lx, rightL=Rx;                           // inner edges of the side-cell content
    near.forEach(e=>{const w=elW(pos.get(e)); if(e.a==='l')leftR=Math.max(leftR,Lx+w); else rightL=Math.min(rightL,Rx-w);});
    const cw=elW(c);
    if(Cx-cw/2>=leftR+gap && Cx+cw/2<=rightL-gap) return;                  // centred line clears both sides → leave dead-centre
    const gL=leftR+gap, gR=rightL-gap, gapW=gR-gL, gapC=(gL+gR)/2; if(gapW<=0) return;
    if(cw<=gapW+24){ c.xOverride=gapC; }                                   // one line fits the gap (≤12u spill each side, under the overlap threshold)
    else { const lt=wrapFit(c.f.lines.join(' '),Math.max(gapW,MINU*4),c.f.size,c.f.size,2,c.f.fs.f,c.f.fs.w,false,c.f.fs.tr?c.f.size*c.f.fs.tr:0);
      c.f.lines=lt.lines; c.f.size=lt.size; c.f.nl=lt.lines.length; c.xOverride=gapC; c.topY-=c.f.size*1.06*(lt.lines.length-1); }
  })();
  if(comp.frame) s+=lcFrameSVG(AWu,AHu,cfg.frameStyle||'cham',null,fscale);
  // ---- pass 2: emit ----
  const emit=(e)=>{
    if(e.side){const t=e.side.map(r=>slot(r)).filter(Boolean).join('   /   '); if(!t)return;   // ranks 9·10 read bottom→up, 2mm inside the frame
      const szU=Math.max(MINU,e.s*PTf), I=22*fscale,g=13*fscale, px=AWu-I-g-CL-szU*0.5, cy=AHu/2;
      s+=`<text transform="rotate(-90 ${px.toFixed(1)} ${cy.toFixed(1)})" x="${px.toFixed(1)}" y="${cy.toFixed(1)}" font-family="${F.ebg}" font-weight="400" font-size="${szU.toFixed(1)}" text-anchor="middle" fill="${LC_DK}">${esc(t)}</text>`; return;}
    const pre=pos.get(e); let fs,size,lines;
    if(pre){fs=pre.f.fs;size=pre.f.size;lines=pre.f.lines;} else {const f=fitEl(e); if(!f)return; fs=f.fs;size=f.size;lines=f.lines;}
    const col=e.col==='rd'?accent:e.col==='wt'?'#FFFFFF':LC_DK, lh=size*1.06;
    let x,anchor; if(e.a==='l'){x=Lx;anchor='start';} else if(e.a==='r'){x=Rx;anchor='end';} else {x=(pre&&pre.xOverride!=null)?pre.xOverride:Cx;anchor='middle';}
    const topY=pre?pre.topY:yU(e.y), base0=topY+size*fs.bl;
    let over=e.over?true:false; if(!over&&ibx){const ey1=topY+size*lines.length; over=(topY<ibx.y1)&&(ey1>ibx.y0);}
    const ls=fs.tr?`letter-spacing="${(size*fs.tr).toFixed(2)}" `:'';
    const common=`font-family="${fs.f}" font-weight="${fs.w}" font-size="${size.toFixed(1)}" ${ls}text-anchor="${anchor}"`;
    const tsp=(xx)=>lines.map((l,i)=>`<tspan x="${xx.toFixed(1)}" y="${(base0+i*lh).toFixed(1)}">${esc(l)}</tspan>`).join('');
    if(e.role==='title'&&archOn&&lines.length===1){
      // keep the arched title fully inside the 5mm safety margin (crown + glyph ascent above, chord ends within the sides)
      const maxHalf=Math.min(Cx-Lx,Rx-Cx)-4*fscale, floU=idFloorU(e.id);
      let asz=size, tw=measure(lines[0],asz,fs.f,fs.w,false,fs.tr?asz*fs.tr:0);
      if(tw>2*maxHalf && asz>floU){ asz=Math.max(floU,asz*(2*maxHalf)/tw); tw=measure(lines[0],asz,fs.f,fs.w,false,fs.tr?asz*fs.tr:0); }
      const halfW=Math.max(4,Math.min(maxHalf, tw*0.60)), rise=halfW*0.10;
      const ascent=0.92*asz+(over?5*fscale:0)+3;                                        // cap height + halo stroke + slack
      let b0=Math.max(topY+asz*fs.bl, LC_MARGU+rise+ascent);                            // seat the baseline so the crown (+halo) clears the top margin
      const lsA=fs.tr?`letter-spacing="${(asz*fs.tr).toFixed(2)}" `:'', commonA=`font-family="${fs.f}" font-weight="${fs.w}" font-size="${asz.toFixed(1)}" ${lsA}text-anchor="${anchor}"`;
      const pid='arc_'+comp.id+'_'+e.id;
      const pth=`<path id="${pid}" d="M ${(Cx-halfW).toFixed(1)} ${b0.toFixed(1)} Q ${Cx.toFixed(1)} ${(b0-2*rise).toFixed(1)} ${(Cx+halfW).toFixed(1)} ${b0.toFixed(1)}" fill="none"/>`;
      const inner=`<textPath href="#${pid}" xlink:href="#${pid}" startOffset="50%">${esc(lines[0])}</textPath>`;
      s+=`<defs>${pth}</defs>`;
      if(over) s+=`<text ${commonA} fill="${bg}" stroke="${bg}" stroke-width="${(10*fscale).toFixed(1)}" stroke-linejoin="round">${inner}</text>`;
      s+=`<text ${commonA} fill="${col}">${inner}</text>`; return;
    }
    if(over){const ow=(10*fscale).toFixed(1);
      s+=`<text ${common} fill="${bg}" stroke="${bg}" stroke-width="${ow}" stroke-linejoin="round">${tsp(x)}</text>`;
      s+=`<text ${common} fill="${col}">${tsp(x)}</text>`;
    } else s+=`<text ${common} fill="${col}">${tsp(x)}</text>`;
  };
  comp.top.concat(comp.foot).forEach(emit);
  const defs=`<defs><style><![CDATA[@import url('${FONTS_URL}');]]></style><clipPath id="${clipId}"><rect x="${(-LC_BU).toFixed(1)}" y="${(-LC_BU).toFixed(1)}" width="${(AWu+2*LC_BU).toFixed(1)}" height="${(AHu+2*LC_BU).toFixed(1)}"/></clipPath></defs>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${AWu.toFixed(1)} ${AHu.toFixed(1)}" width="${twMM}mm" height="${thMM}mm">${defs}${s}</svg>`;
}

/* 3 UI options: no-image / small-image / large-image. Rotate the base composition + scheme + bg by
   seed so regenerating exhausts the variety before repeating a base. */
function renderPriorityOptions(d,order,opts){
  opts=opts||{}; const seed=opts.seed|0;
  const twMM=Math.max(30,(+opts.widthMM||100)), thMM=Math.max(30,(+opts.heightMM||80));
  return LC_GROUPS.map((pool,gi)=>{
    const comp=lcById(pool[seed%pool.length]);
    const pofonts=(gi===0)?LC_SCRIPT:LC_SERIF;                         // imageless options lean calligraphic/cursive
    const scheme=pofonts[(seed*3+gi*5)%pofonts.length];
    const bg=LC_BGS[(seed*2+gi)%LC_BGS.length];
    const arch=(((seed*5+gi*3+ (comp.frame?1:0))%2)===0);             // vary arched / straight title across rounds
    const frameStyle=['cham','square','cham50','square50'][(seed*3+gi)%4];   // chamfered / straight, solid or 50%-opacity lines
    const imgScale=(gi===2)?1.2:1;                                          // large-image column: engraving 20% bigger
    const footVariant=(seed+gi)%3;                                          // when classification is empty: both step down / only vintage / leave
    const estateScale=[1.2,1.34,1.1,1.28,1.0,1.3][seed%6];                  // no-image main text: bigger versions more often (kept some smaller)
    const svg=lcRender(d,order,comp,{scheme,bg,arch,frameStyle,imgScale,footVariant,estateScale},twMM,thMM);
    return {name:LC_GNAME[gi],rank:comp.id,desc:(SCHEMES[scheme]?SCHEMES[scheme].id:scheme)+' · '+comp.id+(comp.frame?'/'+frameStyle:''),svg};
  });
}

/* schematic wireframe with the SAME correlations as the generated label: image band up top, estate
   below it, appellation kept tight to the estate, classification centred between appellation and
   vintage, and the footer (5-10) anchored at the bottom with its two rows kept together. */
function previewLayout(d,order,Wmm,Hmm){
  const W=Math.max(40,+Wmm||110)*10, H=Math.max(30,+Hmm||80)*10, MU=50, contentW=W-2*MU;
  const PTf=PT_UNIT*Math.min(W/1000,H/800);
  const zones=new Array(10), sizes={};
  const SZ={1:17,2:30,3:16,4:14.2,5:14,6:10,7:10.5,8:10.5,9:9,10:9}, su=r=>SZ[r]*PTf;
  const put=(r,topU,a,w)=>{const wi=w||contentW*0.96; const x=a==='l'?MU:a==='r'?(W-MU-wi):(W-wi)/2;
    zones[r-1]={x:x/W,y:topU/H,w:wi/W,h:(su(r)*1.3)/H,a:a==='l'?'left':a==='r'?'right':'center'}; sizes[r]={sizeFrac:su(r)/H,lines:1};};
  const iy0=0.05*H, iy1=0.40*H, img={x:MU/W,y:iy0/H,w:contentW/W,h:(iy1-iy0)/H};
  put(1, iy0+2*PTf, 'c', contentW*0.5);                                   // title over the image band
  const eTop=iy1+7*PTf; put(2,eTop,'c',contentW*0.92);                    // estate below the image
  const aTop=eTop+su(2)*1.15+5*PTf; put(3,aTop,'c',contentW*0.6);         // appellation tight under the estate
  const botBase=H-45, topBase=botBase-14*PTf;                            // footer anchored to the bottom, rows kept together
  const foot=(r,base,a)=>{const wi=clColW(r,contentW), x=a==='l'?MU:a==='r'?(W-MU-wi):(W-wi)/2;
    zones[r-1]={x:x/W,y:(base-su(r))/H,w:wi/W,h:(su(r)*1.3)/H,a:a==='l'?'left':a==='r'?'right':'center'}; sizes[r]={sizeFrac:su(r)/H,lines:1};};
  foot(7,topBase,'l'); foot(5,topBase,'c'); foot(8,topBase,'r');
  foot(9,botBase,'l'); foot(6,botBase,'c'); foot(10,botBase,'r');
  const aBot=aTop+su(3)*1.1, vTop=topBase-su(5); put(4,(aBot+vTop)/2-su(4)/2,'c',contentW*0.7);   // classification centred between 3 and 5
  return {img,zones,sizes,W,H};
}
/* =============================================================================
   STYLE SYSTEM — six distinct label styles generated from the SAME fields.
   renderStyleOptions(d,order,{widthMM,heightMM,seed}) -> 6 options, one per style:
     1 Traditional · 2 Contemporary · 3 Flora & Fauna · 4 Premium ·
     5 Minimalist · 6 Artistic / Punk
   Every style keeps text inside the 5 mm safety margin. 1 unit = 0.1 mm.
   ========================================================================== */
const SM=50, SBLEED=20;                                     // 5 mm safe margin, 2 mm bleed (units)
const SF={jost:"'Jost',sans-serif",archivo:"'Archivo',sans-serif",anton:"'Anton',sans-serif",
  barlow:"'Barlow',sans-serif",barlowc:"'Barlow Condensed',sans-serif",marker:"'Permanent Marker',cursive",
  bebas:"'Bebas Neue',sans-serif",caveat:"'Caveat',cursive",fraunces:"'Fraunces',serif",
  grenze:"'Grenze Gotisch',serif",imfell:"'IM Fell English SC',serif",
  cormorant:F.cormorant,cinzel:F.cinzel,ebg:F.ebg,marcellus:F.marcellus,playfair:F.playfair};
let __sid=0;
function sFields(d){const j=(a,s)=>a.map(x=>String(x==null?'':x).trim()).filter(Boolean).join(s);
  return {producer:String(d.producer||'').trim(),wine:String(d.wine||'').trim(),
    appellation:String(d.appellation||'').trim(),grape:String(d.grape||'').trim(),
    region:j([d.region,d.country],', '),special:String(d.special||'').trim(),
    vintage:String(d.vintage||'').trim(),classification:String(d.classification||'').trim(),
    descriptor:wineDescriptor(d),
    alc:(function(){var n=function(v,def){var m=String(v==null?'':v).match(/(\d+(?:[.,]\d+)?)/);return m?m[1].replace(',','.'):def;};
      return n(d.alcohol,'12.5')+'% Alc. by Vol. / '+n(d.volume,'750')+' mL';})(),
    accent:lcAccent(d)};}
/* Per-render bookkeeping for artwork placement: every text primitive records
   its ink rect (units) while a comp draws; sWrap consumes them to place the
   artwork. Pure bookkeeping — text output itself is untouched (goldens
   byte-identical, and without artwork resolveArt is a no-op). */
let INK_RECTS=[], PENDING_ART=null;
const ART_TOKEN='<!--8KART-->';
/* HOUSE RULE (owner 2026-08-16, supersedes the 80% rule): artwork fills
   ~ARTFILL (default 85%, admin-tunable via hints.__hardRules.artFillPct) of
   its free area. Artwork ALONE may cross the 5mm margin and bleed off the
   label edge (text keeps the margin) — its edges dissolve into white and
   multiply-blend, so the bleed is visually quiet and print-trims cleanly.
   Placement is deferred to sWrap so every text block's ink rect is known:
   the grown rect slides (within ±25% of the label around the box centre)
   toward the spot overlapping the least text ink — i.e. into the label's
   empty space — with ties resolved toward the box centre. Deterministic. */
let ARTFILL=0.85;
function resolveArt(body,W,H,bg){
  const rects=INK_RECTS; INK_RECTS=[];
  const p=PENDING_ART; PENDING_ART=null;
  if(body.indexOf(ART_TOKEN)<0)return body;
  const strip=()=>body.split(ART_TOKEN).join('');
  if(!p)return strip();
  const R=1.6;                                    // generated artwork is 1024x640
  const x=Math.max(p.b[0]*W,0), y=Math.max(p.b[1]*H,0),
        x2=Math.min(p.b[2]*W,W), y2=Math.min(p.b[3]*H,H);
  const w=x2-x, h=y2-y; if(w<=0||h<=0)return strip();
  /* floor: plain contain in the declared box — never smaller */
  let cw,ch; if(w/h>R){ch=h;cw=h*R;}else{cw=w;ch=w/R;}
  const bcx=x+w/2, bcy=y+h/2;
  /* The FREE AREA is measured, not declared: from a candidate centre the
     rect grows at the artwork ratio until it (minus a 5%/side dissolving
     fringe, which is pure white in real artwork) would come within MINGAP
     of any text ink, or the rect would leave the bleed bounds. The centre
     may slide up to 25% of the label from the box centre (grid-searched)
     so the artwork migrates INTO empty bands instead of staying pinned
     beside them. Final size = the reachable maximum scaled to ARTFILL of
     its area; floor = contain-in-box. */
  const CORE=0.05, pad=MINGAP;
  /* boxes declared flush to a side edge (see the slide lock below) may run
     their rect further off THAT side: the outer fringe of real artwork is
     white (invisible under multiply) and artwork may bleed off the label
     (owner rules), so the flush side grants 15% of the label beyond the
     normal bleed — without it the edge anchor throttles the reachable size */
  const fR=p.b[2]>=0.96?0.15*W:0, fL=p.b[0]<=0.04?0.15*W:0;
  /* IMAGE-AWARE OVERLAP (owner 2026-08-20, POPIKA_IMage&layout_relation):
     with the artwork's measured density grid available, the image is no
     longer an opaque rectangle to text — its QUIET regions (near-white,
     invisible under multiply / transparent when keyed) may slide UNDER a
     text block. Only where every overlapped grid cell is calm; dense ink
     still respects the gap, so legibility is mechanical, not hoped for.
     Without analysis (goldens, no-hints, mock) behaviour is unchanged. */
  const AG=p.an&&Array.isArray(p.an.grid)&&p.an.grid.length?p.an.grid:null;
  const AC_=AG?(p.an.cols||AG[0].length):0, AR_=AG?(p.an.rows||AG.length):0;
  const QT=0.07;
  const quietUnder=(cx,cy,mw,mh,r)=>{
    if(!AG)return false;
    const ix0=cx-mw/2, iy0=cy-mh/2;
    const x0=Math.max(r.x-pad,ix0), x1=Math.min(r.x2+pad,ix0+mw);
    const y0=Math.max(r.y-pad,iy0), y1=Math.min(r.y2+pad,iy0+mh);
    if(x1<=x0||y1<=y0)return true;
    const c0=Math.max(0,Math.floor((x0-ix0)/mw*AC_)), c1=Math.min(AC_-1,Math.floor((x1-ix0-0.001)/mw*AC_));
    const r0=Math.max(0,Math.floor((y0-iy0)/mh*AR_)), r1=Math.min(AR_-1,Math.floor((y1-iy0-0.001)/mh*AR_));
    for(let gy=r0;gy<=r1;gy++)for(let gx=c0;gx<=c1;gx++)if(AG[gy][gx]>QT)return false;
    return true;
  };
  const okAt=(cx,cy,s)=>{
    const mw=cw*s, mh=ch*s;
    if(cx-mw/2<-SBLEED-fL||cx+mw/2>W+SBLEED+fR||cy-mh/2<-SBLEED||cy+mh/2>H+SBLEED)return false;
    const ix=cx-mw/2+mw*CORE, ix2=cx+mw/2-mw*CORE;
    const iy=cy-mh/2+mh*CORE, iy2=cy+mh/2-mh*CORE;
    for(const r of rects)
      if(ix<r.x2+pad&&ix2>r.x-pad&&iy<r.y2+pad&&iy2>r.y-pad){
        if(!quietUnder(cx,cy,mw,mh,r))return false;
      }
    return true;
  };
  const maxScale=(cx,cy)=>{
    if(!okAt(cx,cy,1))return 1;
    let lo=1, hi=Math.sqrt((W+2*SBLEED)*(H+2*SBLEED)/(cw*ch))+1;
    for(let k=0;k<24;k++){const mid=(lo+hi)/2; if(okAt(cx,cy,mid))lo=mid; else hi=mid;}
    return lo;
  };
  /* CENTRED BOXES STAY CENTRED (owner fix 2026-08-17): when the comp's free
     area is horizontally centred, corner captions must not push the artwork
     sideways for a marginally bigger fit — lock the x to centre and slide
     only vertically. Side-field boxes keep the full horizontal slide. */
  const centred=Math.abs(bcx-W/2)<0.02*W;
  /* EDGE-FLUSH BOXES STAY AT THEIR EDGE (owner ref 2026-08-19, punk v2):
     a box declared flush to a side edge means "the figure lives at that
     edge" — the slide may not walk it back toward the roomier middle, so
     the search is one-sided (like the centred x-lock, but anchored). */
  const flushR=p.b[2]>=0.96, flushL=p.b[0]<=0.04;
  const N=12, spanY=0.25*H;
  const sxL=centred||flushR?0:0.25*W, sxR=centred||flushL?0:0.25*W;
  let bestS=maxScale(bcx,bcy), cands=[[bcx,bcy,bestS]];
  for(let i=0;i<=N;i++)for(let j=0;j<=N;j++){
    const cx=bcx-sxL+(sxL+sxR)*i/N, cy=bcy-spanY+2*spanY*j/N;
    const s=maxScale(cx,cy);
    cands.push([cx,cy,s]);
    if(s>bestS)bestS=s;
  }
  /* among near-maximal spots pick the one closest to the box centre */
  let bx=bcx, by=bcy, bd=Infinity;
  for(const c of cands){
    if(c[2]<bestS*0.98)continue;
    const d=Math.hypot(c[0]-bcx,c[1]-bcy);
    if(d<bd){bd=d;bx=c[0];by=c[1];}
  }
  /* PUNK BOOST (owner 2026-08-17): punk artwork renders 30% bigger (linear)
     in every punk comp — loud is the style; overflow dissolves to white and
     may bleed. Capped at full-bleed so the rect never exceeds the canvas. */
  let sF=Math.max(1,bestS*Math.sqrt(ARTFILL))*(p.st==='punk'?1.3:1);
  /* with a density grid the placement PROMISES text only ever meets quiet
     image cells — a boost beyond the verified maximum would break that
     promise (live-observed: punk texture under the hero), so image-aware
     placement caps at the verified size. The legacy path keeps the loud
     punk overshoot ("overflow dissolves to white"). */
  if(AG)sF=Math.min(sF,bestS);
  sF=Math.min(sF,(W+2*SBLEED+fL+fR)/cw,(H+2*SBLEED)/ch);
  let mw=cw*sF, mh=ch*sF;
  /* keep the final rect inside the bleed bounds (position only) — the
     flush-side allowance holds here too, or the boost walks the artwork
     back off its anchored edge */
  const px=Math.min(Math.max(bx-mw/2,-SBLEED-fL),W+SBLEED+fR-mw);
  const py=Math.min(Math.max(by-mh/2,-SBLEED),H+SBLEED-mh);
  /* SCREEN-PRINT MODE (owner 2026-08-19): artwork arrives white-KEYED
     (ink-density alpha). Under multiply that renders identically to the
     old opaque-white image on any light ground (multiply is linear in the
     source), but on a DARK ground multiply buries dark inks — there the
     artwork composites normally: opaque inks on coloured stock, like real
     screen printing. data-sp marks the mode for tests. */
  const gl=hslOf(bg), sp=!!(gl&&gl.L<0.60);
  return body.split(ART_TOKEN).join(
    `<image x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${mw.toFixed(1)}" height="${mh.toFixed(1)}" preserveAspectRatio="xMidYMid meet" xlink:href="${p.src}" href="${p.src}"${sp?' data-sp="1"':''} style="mix-blend-mode:${sp?'normal':'multiply'}"/>`);
}
function sWrap(W,H,twMM,thMM,bg,body,defs){
  body=resolveArt(body,W,H,bg);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" width="${twMM}mm" height="${thMM}mm">`
    +`<defs><style><![CDATA[@import url('${FONTS_URL}');${EXTRA_FONTS_URL?`@import url('${EXTRA_FONTS_URL}');`:''}]]></style>${defs||''}</defs>`
    +`<rect x="${(-SBLEED)}" y="${(-SBLEED)}" width="${(W+2*SBLEED).toFixed(1)}" height="${(H+2*SBLEED).toFixed(1)}" fill="${bg}"/>`
    +body+`</svg>`;}
/* fit+wrap a string; returns {svg,bottom,size,nlines}. `top` = top of the text box (baseline ≈ top+0.80*size). */
function sBlock(str,o){if(!str)return {svg:'',bottom:o.top,size:0,nlines:0};
  // HOUSE RULE: nothing on a label may print below 7pt (owner). Every style
  // text path funnels through sBlock, so both the requested size and the
  // shrink floor are clamped here — small-print lines that computed below
  // 7pt on small labels now render at exactly 7pt.
  const reqSize=Math.max(o.size,MIN7), reqMin=Math.max(o.min||o.size,MIN7);
  const s0=o.caps?up(str):str, trAbs=o.tr?reqSize*o.tr:0, maxLines=o.lines||1;
  const fit=wrapFit(s0,o.maxW,reqSize,reqMin,maxLines,o.f,o.w||400,!!o.ital,trAbs);
  const sz=fit.size, lh=(o.lh||1.16)*sz, anchor=o.a==='l'?'start':o.a==='r'?'end':'middle';
  const va0=inkVA(fit.lines[0],sz,o.f,o.w||400,!!o.ital);
  const vaN=inkVA(fit.lines[fit.lines.length-1],sz,o.f,o.w||400,!!o.ital);
  const n=fit.lines.length;
  const base=o.fromBottom?(o.top-vaN.desc-(n-1)*lh):(o.top+va0.asc);
  const topY=base-va0.asc, botY=base+(n-1)*lh+vaN.desc;
  const ls=trAbs?` letter-spacing="${trAbs.toFixed(2)}"`:'', it=o.ital?' font-style="italic"':'';
  const halo=o.halo?` stroke="#ffffff" stroke-width="${(sz*0.14).toFixed(1)}" stroke-linejoin="round" style="paint-order:stroke"`:'';
  let svg=''; fit.lines.forEach((l,i)=>{svg+=`<text x="${o.x.toFixed(1)}" y="${(base+i*lh).toFixed(1)}" font-family="${o.f}" font-weight="${o.w||400}" font-size="${sz.toFixed(1)}" text-anchor="${anchor}" fill="${o.fill||'#111'}"${ls}${it}${halo}>${esc(l)}</text>`;});
  let wmax=0; fit.lines.forEach(l=>{const lw=measure(l,sz,o.f,o.w||400,!!o.ital,trAbs);if(lw>wmax)wmax=lw;});
  const rx0=anchor==='middle'?o.x-wmax/2:anchor==='end'?o.x-wmax:o.x;
  INK_RECTS.push({x:rx0,y:topY,x2:rx0+wmax,y2:botY});
  return {svg:'<g data-tb="1">'+svg+'</g>',bottom:botY,top:topY,size:sz,nlines:n};}
/* Fit a hero between a top limit and a bottom limit, shrinking (never below
   7pt) so hard rule 3 (1mm gaps) holds against the stack beneath it. */
function fitHero(str,x,topY,bottomLimit,o){
  if(!str)return {svg:'',bottom:topY};
  const size=Math.max(MIN7,Math.min(o.size,(bottomLimit-topY-MINGAP)*0.72));
  return sBlock(str,{x,top:topY,maxW:o.maxW,size,min:Math.max(o.min||size*0.6,MIN7),
    f:o.f,w:o.w,fill:o.fill,a:o.a||'c',tr:o.tr,caps:o.caps,ital:o.ital,lines:o.lines,lh:o.lh});
}
/* stack single-line detail items UP from a bottom baseline (centred/left/right). */
function stackUp(items,x,botY,gap,a,maxW){let y=botY,svg='';
  for(let i=items.length-1;i>=0;i--){const it=items[i];if(!it||!it.str)continue;
    const b=sBlock(it.str,{x,top:y,fromBottom:true,maxW:it.maxW||maxW,size:it.size,min:it.size*0.72,lines:1,f:it.f,w:it.w||400,fill:it.fill,a:a||'c',tr:it.tr||0,lh:1.1,caps:it.caps,ital:it.ital,halo:it.halo});
    svg=b.svg+svg; y=b.top-Math.max(gap,MINGAP);}
  return {svg,topY:y+Math.max(gap,MINGAP)};}
function sInitials(name){var p=String(name||'').trim().split(/\s+/).filter(Boolean);if(!p.length)return '';
  if(p.length===1)return up(p[0].slice(0,2));return up(p[0][0]+p[p.length-1][0]);}
/* a pointed botanical leaf (two quadratics), rotated about its base */
function sLeaf(cx,cy,L,Wl,ang,color){return `<path d="M ${cx.toFixed(1)} ${cy.toFixed(1)} q ${(L*0.5).toFixed(1)} ${(-Wl).toFixed(1)} ${L.toFixed(1)} 0 q ${(-L*0.5).toFixed(1)} ${Wl.toFixed(1)} ${(-L).toFixed(1)} 0 z" fill="${color}" transform="rotate(${ang.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`;}
/* a curved sprig: stem of length ~30·scale with paired leaves and an accent berry at the tip */
function sSprig(x0,y0,scale,color,acc,dir){dir=dir||1;const HH=scale*30,topx=x0+dir*scale*5,topy=y0-HH;
  let s=`<path d="M ${x0.toFixed(1)} ${y0.toFixed(1)} C ${(x0+dir*scale*3).toFixed(1)} ${(y0-HH*0.4).toFixed(1)} ${(topx-dir*scale*3).toFixed(1)} ${(topy+HH*0.4).toFixed(1)} ${topx.toFixed(1)} ${topy.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${(scale*0.9).toFixed(2)}"/>`;
  for(let i=1;i<=3;i++){const t=i/3.4,sx=x0+dir*scale*4*t,sy=y0-HH*t;
    s+=sLeaf(sx,sy,scale*9,scale*3.1,dir*(-45)-i*6,color)+sLeaf(sx,sy,scale*9,scale*3.1,dir*135+i*6,color);}
  s+=`<circle cx="${topx.toFixed(1)}" cy="${topy.toFixed(1)}" r="${(scale*2.1).toFixed(1)}" fill="${acc}"/>`;return s;}

/* v1 per-style artwork embed (positions are provisional until the owner's
   style layout rules arrive). Draws the style's generated image from
   window.__LABEL_IMGS__ in a fixed region, ALWAYS with multiply blend (house
   rule) — on dark label variants a light plate is drawn under the image so
   the multiplied artwork stays visible. Returns '' when no artwork exists,
   keeping pre-generation output (and the golden corpus) byte-identical. */
let __simgN=0;
function sImage(styleKey,x,y,w,h,mode,plate){
  const m=(typeof window!=='undefined'&&window.__LABEL_IMGS__)||null;
  const src=m&&m[styleKey]; if(!src) return '';
  const id='simg'+(++__simgN);
  let s=`<clipPath id="${id}"><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"/></clipPath>`;
  if(plate) s+=`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${plate}"/>`;
  s+=`<image x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" preserveAspectRatio="xMidYMid ${mode==='cover'?'slice':'meet'}" clip-path="url(#${id})" xlink:href="${src}" href="${src}" style="mix-blend-mode:multiply"/>`;
  return s;
}

/* Image boxes per style/variant — OWNER RULE (2026-08-13): the focal/fade
   template era is retired. Each composition reserves a FREE AREA (fractions
   [x0,y0,x1,y1] of W/H) that text never enters; the artwork is drawn centred
   inside it ('meet', full opacity, multiply). Variant index = the same
   Math.floor(seed/2)%N each style uses. null = text-only composition. */
const STYLE_BOXES={
  traditional:[
    [0.24,0.06,0.76,0.40],   // Gewürztraminer: oval vignette in the frame
    [0.30,0.30,0.70,0.60],   // La Couspaude: vignette mid, type above+below
    [0.38,0.13,0.62,0.36],   // Mittelwihr: emblem over the red sans hero
    [0.26,0.04,0.74,0.50],   // Kirile: portrait top, script + side verticals (owner ref 2026-08-19: bigger)
    [0.32,0.07,0.68,0.40],   // Olive Tree: airy engraving over tiny caps
    null,                    // Margaux: framed pure type
    [0.14,0.07,0.86,0.38],   // Jullouville (owner board 2026-08-17): wide engraving band
    [0.36,0.05,0.64,0.29],   // Perrin: emblem over tracked caps + blackletter
    [0.32,0.13,0.68,0.44]],  // Pegau: crest under the arched producer
  contemporaryX:[
    [0.28,0.16,0.72,0.60],   // Gotes: big motif, data bottom-left
    [0.34,0.05,0.66,0.34],   // ñor: small motif over the giant lowercase hero
    [0.28,0.05,0.72,0.42],   // Saperavi: motif top, side vertical data
    [0.30,0.16,0.70,0.52],   // Wine People: motif under the arched ring
    [0.08,0.14,0.92,0.55],   // horizon: wide field
    [0.33,0.24,0.67,0.60]],  // Finca Collado: script sign-off, small motif
  flora:[
    [0.15,0.06,0.85,0.55],   // Hermit Ram: huge beast
    [0.26,0.17,0.74,0.56],   // Elephant: beast under the arched caps
    [0.28,0.05,0.72,0.36],   // Chico Malo: beast above the brush hero
    [0.36,0.20,0.64,0.50],   // Hugh Hamilton: tiny creature centre
    [0.05,0.08,0.55,0.62]],  // Aleria/Tarosi: beast left, script right
  premium:[
    [0.42,0.08,0.58,0.26],   // Sinegal: tiny emblem over tracked caps
    [0.41,0.62,0.59,0.85],   // Ram's Gate: emblem at the foot
    [0.38,0.05,0.62,0.27],   // Campinún: crest above the copperplate hero
    [0.44,0.10,0.56,0.24],   // 1780: small mark above the gold numerals
    [0.42,0.30,0.58,0.52]],  // Implicit: mark centre, tracked caps below
  minimalist:[
    [0.42,0.14,0.58,0.36],   // tiny mark high, airy centred stack
    [0.60,0.18,0.90,0.55],   // left column, mark right
    [0.44,0.60,0.56,0.78],   // oversized word, mark low
    null,                    // colour panel (text-only)
    null,                    // handwritten scrawl hero (text-only)
    [0.30,0.52,0.70,0.86]],  // caps corner top-left, mark at the foot
  punk:[
    [0.22,0.05,0.78,0.50],   // naive drawing centre stage
    [0.55,0.10,0.95,0.82],   // poster type left, figure right
    [0.55,0.10,1.00,0.82],   // handwritten title corner, figure right (owner ref 2026-08-19: bigger, pushed right)
    [0.28,0.06,0.88,0.58],   // rotated side caps, riso figure centre
    [0.28,0.15,0.72,0.58],   // arched hand-lettering ring over figure
    [0.10,0.04,0.90,0.40]]}; // riso band top, knockout hero below
/* Server contract unchanged: verbalize each box as focal (inset — the subject
   lives here) + fade (slight overspill) + a shape word from its aspect. */
function zoneFromBox(b){
  if(!b)return null;
  const w=b[2]-b[0],h=b[3]-b[1];
  const fi=0.07, focal=[b[0]+w*fi,b[1]+h*fi,b[2]-w*fi,b[3]-h*fi];
  const fe=0.06, fade=[Math.max(0,b[0]-w*fe),Math.max(0,b[1]-h*fe),Math.min(1,b[2]+w*fe),Math.min(1,b[3]+h*fe)];
  return {focal,fade,shape:w>=1.8*h?'band':(h>=1.35*w?'rounded':'ellipse')};
}
/* THREE public styles (owner, 2026-08-14 restart): traditional · contemporary
   (the merged pool of the old contemporary/flora/premium/minimalist comps) ·
   punk (the old artistic). The merged pool keeps every composition; one
   seeded pick chooses across all of them. */
const C_POOL=[['contemporaryX',6],['flora',5],['premium',5],['minimalist',6]];
const C_TOTAL=22;
function cVariantFor(seed){
  let idx=pickV('contemporary',seed,C_TOTAL);
  for(const [k,n] of C_POOL){if(idx<n)return {key:k,local:idx};idx-=n;}
  return {key:'contemporaryX',local:0};
}
function styleZones(seed){
  const cv=cVariantFor(seed);
  return {
    traditional:zoneFromBox(STYLE_BOXES.traditional[pickVariant('traditional',seed,STYLE_BOXES.traditional.length)]),
    contemporary:zoneFromBox(STYLE_BOXES[cv.key][cv.local]),
    punk:zoneFromBox(STYLE_BOXES.punk[pickVariant('punk',seed,STYLE_BOXES.punk.length)])
  };
}

/* ADMIN LAYOUT HINTS (owner, 2026-08-14 restart): the ONLY external influence
   on rendering, and it is explicit admin curation — never derived silently.
   setStyleHints({style:{palettes:[{bg,ink,sub,acc}], heroFonts:[[family,weight]],
   weights:[per-variant numbers]}}). Palettes replace the built-in chords,
   heroFonts replace the per-comp alternates, weights bias which composition
   the seeded pick lands on (rejected comps fade, approved appear more).
   Without hints everything renders from the built-ins (goldens). */
let STYLE_HINTS={};
/* HARD RULES (owner 2026-08-15). MINGAP: no two text blocks closer than this
   (units of 0.1mm; default 1mm; tunable from the admin Hard Rules panel via
   hints.__hardRules). The 5mm margin (SM) and 7pt floor (MIN7) are fixed. */
let MINGAP=10;
let LOOKS_ONLY=false;
function setStyleHints(h){
  const prevH=STYLE_HINTS;
  STYLE_HINTS=(h&&typeof h==='object')?h:{};
  /* imgPalettes persistence (owner bug report 2026-08-18): artwork-derived
     colours arrive once with the generation result, but boot refetches,
     "Layout alternatives" refreshes and per-look renders re-set hints
     WITHOUT them — wiping the artwork's colours moments after they land.
     Carry them across any hint set that doesn't bring its own; the next
     generation always overrides with fresh ones. */
  for(const k in prevH){
    const pv=prevH[k];
    if(pv&&Array.isArray(pv.imgPalettes)&&pv.imgPalettes.length){
      if(STYLE_HINTS[k]&&!STYLE_HINTS[k].imgPalettes)STYLE_HINTS[k].imgPalettes=pv.imgPalettes;
      else if(!STYLE_HINTS[k])STYLE_HINTS[k]={imgPalettes:pv.imgPalettes};
    }
    /* imgAnalysis rides with the artwork the same way (2026-08-20) */
    if(pv&&pv.imgAnalysis){
      if(STYLE_HINTS[k]&&!STYLE_HINTS[k].imgAnalysis)STYLE_HINTS[k].imgAnalysis=pv.imgAnalysis;
      else if(!STYLE_HINTS[k])STYLE_HINTS[k]={imgAnalysis:pv.imgAnalysis};
    }
  }
  const hr=STYLE_HINTS.__hardRules;
  MINGAP=(hr&&isFinite(+hr.minGapMM)&&+hr.minGapMM>=0)?Math.round(+hr.minGapMM*10):10;
  ARTFILL=(hr&&isFinite(+hr.artFillPct)&&+hr.artFillPct>=30&&+hr.artFillPct<=100)?+hr.artFillPct/100:0.85;
  /* HOUSE RULE (owner 2026-08-16): customers see ONLY approved looks — a
     style with none renders a quiet "being curated" card, never a random
     unapproved layout. Test rigs (__SEED0__ pinned) are exempt so parity
     and e2e stay deterministic regardless of curation state. */
  LOOKS_ONLY=STYLE_HINTS.__looksOnly===true;
  delete STYLE_HINTS.__looksOnly;
  delete STYLE_HINTS.__hardRules;
  refreshHintFonts();
}
/* Curated fonts may be ANY Google font, not just the built-in set: collect
   every family the hints reference that FONTS_URL doesn't already load,
   build a second css2 URL for them, inject it page-level and embed it in
   every exported SVG (sWrap). No hints → empty → output byte-identical. */
let EXTRA_FONTS_URL='';
function refreshHintFonts(){
  const fams={};
  for(const k in STYLE_HINTS){
    const e=STYLE_HINTS[k]||{};
    [e.heroFonts,e.secondaryFonts,e.smallFonts].forEach(function(list){
      if(!Array.isArray(list))return;
      list.forEach(function(f){
        if(!Array.isArray(f)||!f[0])return;
        const m=String(f[0]).match(/'([^']+)'/); if(!m)return;
        const nm=m[1], pl=nm.replace(/ /g,'+');
        if(FONTS_URL.indexOf('family='+pl+':')>=0||FONTS_URL.indexOf('family='+pl+'&')>=0)return;
        (fams[nm]=fams[nm]||{})[+f[1]||400]=1;
      });
    });
  }
  const names=Object.keys(fams);
  EXTRA_FONTS_URL=names.length
    ? 'https://fonts.googleapis.com/css2?'+names.map(function(n){
        const ws=Object.keys(fams[n]).map(Number).sort(function(a,b){return a-b;});
        const one400=ws.length===1&&ws[0]===400;   // single regular: no axis (many display fonts have none)
        return 'family='+n.replace(/ /g,'+')+(one400?'':(':wght@'+ws.join(';')));
      }).join('&')+'&display=swap'
    : '';
  if(typeof document!=='undefined'){
    let el=document.getElementById('__lblfonts_x');
    if(EXTRA_FONTS_URL){
      if(!el){el=document.createElement('style');el.id='__lblfonts_x';document.head.appendChild(el);}
      el.textContent="@import url('"+EXTRA_FONTS_URL+"');";
      names.forEach(function(n){Object.keys(fams[n]).forEach(function(w){try{document.fonts.load(w+" 40px '"+n+"'",'ÂÉÈâéèçÇüÜ AaBb0123');}catch(e){}});});
    }else if(el)el.remove();
  }
}

/* COMBINATORIAL VARIETY (owner, 2026-08-14): composition, palette and hero
   font are INDEPENDENT seeded picks, so every new seed is a fresh
   combination instead of one locked sequence. Deterministic per seed (same
   seed always renders the same set — goldens, cache, history arrows). */
const STYLE_SALT={traditional:0,contemporary:1,flora:2,premium:3,minimalist:4,punk:5,contemporaryX:1};
function sRand(seed,salt){
  let t=((seed|0)+1)*2654435761+(salt|0)*40503;
  t=Math.imul(t^(t>>>15),2246822519);
  t=Math.imul(t^(t>>>13),3266489917);
  return ((t^(t>>>16))>>>0)/4294967296;
}
function sPick(seed,salt,n){return n>0?Math.floor(sRand(seed,salt)*n)%n:0;}
function pickVariant(key,seed,tags){
  const n=Array.isArray(tags)?tags.length:tags;
  const h=STYLE_HINTS[key], w=h&&h.weights;
  if(Array.isArray(w)&&w.length===n){
    // exact 0 = admin excluded this comp entirely (approved-only mode,
    // owner 2026-08-16); any positive weight keeps the 0.05 floor so
    // soft-faded comps stay alive. All-zero guard: uniform fallback.
    const wv=i=>{const x=+w[i]||0;return x<=0?0:Math.max(0.05,x);};
    let sum=0;for(let i=0;i<n;i++)sum+=wv(i);
    if(sum<=0)return sPick(seed,(STYLE_SALT[key]||0)*7+1,n);
    let r=sRand(seed,(STYLE_SALT[key]||0)*7+1)*sum;
    for(let i=0;i<n;i++){r-=wv(i);if(r<=0&&wv(i)>0)return i;}
    for(let i=n-1;i>=0;i--)if(wv(i)>0)return i;
    return n-1;
  }
  return sPick(seed,(STYLE_SALT[key]||0)*7+1,n);
}
/* COLOUR GAMUT (owner 2026-08-17, supersedes the 2026-08-16 ground rule).
   GROUNDS under artwork are always LIGHT (multiply ink dies on dark):
     red/rosé wines → white, warm papers, pinks; every other wine → white
     and warm only (never pink). Bold/dark grounds exist ONLY on palette
     entries marked panel:true — those force a text-only comp: red
     products may take red/dark-red/black panels; white products black/
     orange/deep-yellow/green/blue/tan/brown panels.
   ELEMENTS (ink/accents/sub): red wine → blacks/greys + reds/dark reds;
     white wine → blacks/greys + warm & earth tones + greens. Off-gamut
     elements are RECOLOURED (hue clamped to the nearest allowed range,
     keeping their lightness/saturation) so board palettes keep their
     character instead of being dropped. PUNK ONLY: the single most
     saturated off-gamut element stays untouched — one free vivid accent
     (owner ruling 2026-08-17). WINE_KIND set per render. */
let WINE_KIND='red';
function palBg(p){if(!p)return null;if(typeof p.bg==='string')return p.bg;if(Array.isArray(p))return p[0];return null;}
function hslOf(hex){
  const m=/^#?([0-9a-f]{6})$/i.exec(String(hex||'')); if(!m)return null;
  const n=parseInt(m[1],16), r=(n>>16)&255, g=(n>>8)&255, b=n&255;
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b), L=(mx+mn)/510;
  const S=mx===mn?0:(mx-mn)/(255-Math.abs(mx+mn-255));
  let H=0;
  if(mx!==mn){
    if(mx===r)H=60*(((g-b)/(mx-mn))+(g<b?6:0));
    else if(mx===g)H=60*((b-r)/(mx-mn)+2);
    else H=60*((r-g)/(mx-mn)+4);
  }
  return {H:((H%360)+360)%360,S,L};
}
function hslHex(H,S,L){
  H=((H%360)+360)%360;
  const C=(1-Math.abs(2*L-1))*S, X=C*(1-Math.abs(((H/60)%2)-1)), m=L-C/2;
  let r=0,g=0,b=0;
  if(H<60){r=C;g=X;}else if(H<120){r=X;g=C;}else if(H<180){g=C;b=X;}
  else if(H<240){g=X;b=C;}else if(H<300){r=X;b=C;}else{r=C;b=X;}
  const q=v=>Math.round((v+m)*255).toString(16).padStart(2,'0');
  return ('#'+q(r)+q(g)+q(b)).toUpperCase();
}
/* allowed element hue ranges per wine kind ([from,to] on a 0-360 circle;
   near-neutrals — S below 0.14 — always pass as blacks/greys) */
function elemRanges(){
  return (WINE_KIND==='red'||WINE_KIND==='rose')
    ? [[335,385]]                       // reds, dark reds, pinks
    : [[15,170]];                       // warm, earth, gold, green
}
function inRanges(H,ranges){
  for(const [a,b]of ranges){if(H>=a&&H<=b)return true;if(b>360&&H+360>=a&&H+360<=b)return true;}
  return false;
}
function elementOK(hex){
  const c=hslOf(hex); if(!c)return true;
  if(c.S<=0.14||c.L<=0.16||c.L>=0.94)return true;   // blacks/greys/paper
  return inRanges(c.H,elemRanges());
}
function recolour(hex){
  const c=hslOf(hex); if(!c)return hex;
  const ranges=elemRanges();
  let best=ranges[0][0], bd=1e9;
  for(const [a,b]of ranges){
    for(const edge of [a,b]){
      const e=((edge%360)+360)%360;
      const d=Math.min(Math.abs(c.H-e),360-Math.abs(c.H-e));
      if(d<bd){bd=d;best=e;}
    }
  }
  return hslHex(best,c.S*0.9,c.L);
}
function groundOK(hex,panel,punkFree){
  const c=hslOf(hex); if(!c)return true;
  /* PUNK BOLD GROUNDS (owner 2026-08-18): punk grounds may be saturated
     and bold in ANY hue, down to the lightness floor where multiply-
     blended artwork still reads. Contrast of text is fixed in palAdapt. */
  if(punkFree&&!panel)return c.L>=0.42;
  if(panel){
    // bold text-only panel grounds, by product colour (owner 2026-08-17)
    if(c.L<=0.2)return true;                                   // black
    if(WINE_KIND==='red'||WINE_KIND==='rose')return inRanges(c.H,[[335,385]])&&c.S>=0.2;
    return c.H>=15&&c.H<=260&&c.S>=0.2;                        // orange…blue
  }
  if(c.L<0.78)return false;                                    // light only under art
  if(c.S<=0.28)return true;                                    // whites/greys
  if(c.H>=15&&c.H<=70)return true;                             // warm papers
  if((WINE_KIND==='red'||WINE_KIND==='rose')&&inRanges(c.H,[[335,385]]))return true; // pinks
  return false;
}
/* adapt one palette entry to the gamut: null = ground disallowed; else a
   copy with off-gamut elements recoloured (punk keeps one vivid accent) */
function palAdapt(p,punkFree){
  if(!p)return null;
  const isArr=Array.isArray(p);
  const panel=!isArr&&p.panel===true;
  if(!groundOK(palBg(p),panel,punkFree))return null;
  const out=isArr?p.slice():Object.assign({},p);
  const keys=isArr?out.map(function(_,i){return i;}):Object.keys(out);
  let freeKey=null, freeSat=0;
  for(const k of keys){
    if(isArr?k===0:k==='bg')continue;
    const v=out[k]; if(typeof v!=='string'||!/^#([0-9a-f]{6})$/i.test(v))continue;
    if(!elementOK(v)&&punkFree){
      const c=hslOf(v);
      if(c&&c.S>freeSat){freeSat=c.S;freeKey=k;}
    }
  }
  for(const k of keys){
    if(isArr?k===0:k==='bg')continue;
    if(k===freeKey)continue;
    const v=out[k]; if(typeof v!=='string'||!/^#([0-9a-f]{6})$/i.test(v))continue;
    if(!elementOK(v))out[k]=recolour(v);
  }
  /* CONTRAST GUARD (owner 2026-08-18): dark ground → light text, light
     ground → dark text — applied to every element after all recolours. */
  const bgc=hslOf(palBg(out));
  if(bgc){
    const mixHex=(hex,toWhite,t)=>{
      const mm=/^#?([0-9a-f]{6})$/i.exec(hex); if(!mm)return hex;
      const n=parseInt(mm[1],16); let r=(n>>16)&255,g=(n>>8)&255,b2=n&255;
      const tgt=toWhite?255:0;
      r=Math.round(r+(tgt-r)*t); g=Math.round(g+(tgt-g)*t); b2=Math.round(b2+(tgt-b2)*t);
      return ('#'+r.toString(16).padStart(2,'0')+g.toString(16).padStart(2,'0')+b2.toString(16).padStart(2,'0')).toUpperCase();
    };
    /* MINIMUM CONTRAST DELTA (owner 2026-08-18, after an invisible cream-
       on-mustard producer line): thresholds left a gap where mid-light
       text sat on a mid-light ground. Now EVERY element must differ from
       the ground by ≥0.32 lightness — pushed away step by step (toward
       white on dark grounds, toward black on light ones) until it does. */
    for(const k of keys){
      if(isArr?k===0:k==='bg')continue;
      let v=out[k]; if(typeof v!=='string'||!/^#([0-9a-f]{6})$/i.test(v))continue;
      const towardWhite=bgc.L<0.5;
      for(let t=0;t<6;t++){
        const c=hslOf(v); if(!c)break;
        if(Math.abs(c.L-bgc.L)>=0.32)break;
        v=mixHex(v,towardWhite,0.3);
      }
      out[k]=v;
    }
  }
  return out;
}
/* hintKey = the public style the admin curates; saltKey = the internal pool
   (merged contemporary keeps four internal pools for palette diversity). */
/* 70% HIGHLIGHT (owner 2026-08-19): monochrome artwork and layout are
   allowed, but 7 renders in 10 must colour ONE worthy element — the accent
   role, worn by appellation/vintage/grape lines across the comps (the
   traditional hero keeps its own colour law on top) — in the wine's own
   family: reds on red wines, greens on whites. Runs only on the artwork-
   derived (imgPalettes) path, so goldens/no-hints renders never change. */
const HL_RED=['#8E2430','#A32633','#7A1E28','#B03A2E'];
const HL_GRN=['#3E5F3A','#2F5233','#556B2F','#4A7042'];
function hlAcc(p,seed,salt){
  if(sPick(seed,salt+13,10)>=7)return p; // 3 in 10 stay fully as derived
  const set=(WINE_KIND==='red'||WINE_KIND==='rose')?HL_RED:HL_GRN;
  const c=set[sPick(seed,salt+29,set.length)];
  const out=Object.assign({},p,{acc:c});
  /* not every comp wears the accent role — when the derived sub role is
     neutral (the monochrome case this rule exists for), sub carries a
     softened highlight too, so 7-in-10 holds across ALL comps */
  const sc=hslOf(p.sub);
  if(!sc||sc.S<0.18){
    const n=parseInt(c.slice(1),16);
    const soft=[(n>>16)&255,(n>>8)&255,n&255]
      .map(v=>Math.round(v+(255-v)*0.22).toString(16).padStart(2,'0')).join('');
    out.sub='#'+soft.toUpperCase();
  }
  return out;
}
function palPick(hintKey,saltKey,seed,arr,map){
  /* imgPalettes (owner 2026-08-18): colours derived from THIS label's own
     generated artwork outrank board/look palettes — text elements dress in
     the artwork's inks. Gamut adaptation still applies below. */
  const h=STYLE_HINTS[hintKey];
  const isImg=!!(h&&Array.isArray(h.imgPalettes)&&h.imgPalettes.length);
  const hp=isImg?h.imgPalettes:(h&&h.palettes);
  const salt=(STYLE_SALT[saltKey]||0)*7+2;
  const punkFree=saltKey==='punk';
  /* highlight BEFORE gamut/contrast adaptation so the guard still verifies
     the forced accent against each entry's own ground */
  const prep=isImg?(p=>hlAcc(p,seed,salt)):(p=>p);
  const adapt=list=>{const out=[];for(const p of list){const a=palAdapt(prep(p),punkFree);if(a)out.push(a);}return out;};
  if(Array.isArray(hp)&&hp.length&&map){
    try{
      const ok=adapt(hp);
      if(ok.length)return map(ok[sPick(seed,salt,ok.length)]);
      const p1=palAdapt(prep(Object.assign({},hp[sPick(seed,salt,hp.length)],{bg:'#FBF7EF'})),punkFree);
      if(p1)return map(p1);
    }catch(e){}
  }
  const ok=adapt(arr);
  if(ok.length)return ok[sPick(seed,salt,ok.length)];
  const p0=arr[sPick(seed,salt,arr.length)];
  const forced=Array.isArray(p0)?['#FBF7EF'].concat(p0.slice(1)):Object.assign({},p0,{bg:'#FBF7EF',panel:null});
  return palAdapt(forced,punkFree)||forced;
}
/* Per-variant hero-font alternates — every option hand-picked to fit that
   composition's board (blackletter comps offer blackletters, script comps
   scripts, letterpress comps loud sans). Empty list = the designed font. */
const HERO_ALTS={
  traditional:[
    [[SF.grenze,600],[F.manufacturing,400],[SF.playfair,700]],
    [[SF.playfair,700],[F.prata,400],[SF.tinos,700],[F.marcellus,400]],
    [[SF.archivo,800],[SF.bebas,400],[SF.barlowc,700]],
    [[F.greatVibes,400],[F.italianno,400],[F.mrsSaint,400],[F.pinyon,400]],
    [[SF.ebg,500],[F.cinzel,500],[F.marcellus,400]],
    [[SF.playfair,700],[F.cinzel,600],[F.prata,400]],
    [[SF.playfair,600],[F.prata,400],[SF.tinos,700]],
    [[SF.grenze,600],[F.manufacturing,400]],
    [[SF.grenze,600],[F.manufacturing,400]]],
  contemporaryX:[
    [[SF.archivo,800],[SF.anton,400],[SF.bebas,400]],
    [[SF.fraunces,600],[SF.playfair,700],[F.prata,400]],
    [[SF.marcellus,400],[F.prata,400],[F.cinzel,500]],
    [[SF.archivo,700],[F.marcellus,400]],
    [[SF.archivo,800],[SF.bebas,400]],
    [[SF.archivo,600],[SF.jost,600]]],
  flora:[
    [[SF.fraunces,700],[F.marcellus,400],[SF.ebg,700]],
    [],
    [[SF.caveat,700],[SF.marker,400]],
    [[SF.fraunces,600],[SF.ebg,500]],
    [[F.italianno,400],[F.greatVibes,400],[SF.caveat,700]]],
  premium:[
    [[SF.cinzel,600],[F.marcellus,400],[SF.ebg,500]],
    [[SF.cinzel,600],[F.baskervvilleSC,400]],
    [[F.monteCarlo,400],[F.pinyon,400],[F.greatVibes,400]],
    [[SF.cinzel,600],[F.prata,400]],
    [[SF.cinzel,600],[F.marcellus,400]]],
  minimalist:[
    [[SF.archivo,300],[SF.jost,300],[F.nixieOne,400]],
    [[SF.archivo,400],[SF.jost,400]],
    [[SF.archivo,300],[SF.bebas,400],[SF.jost,300]],
    [],
    [[SF.caveat,700],[SF.marker,400]],
    [[SF.archivo,500],[SF.jost,500]]],
  punk:[
    [[SF.marker,400],[SF.caveat,700]],
    [[SF.anton,400],[SF.bebas,400],[SF.barlowc,700]],
    [[SF.caveat,700],[SF.marker,400]],
    [[SF.marker,400],[SF.caveat,700]],
    [[SF.marker,400],[SF.caveat,700]],
    [[SF.anton,400],[SF.bebas,400]]]};
/* Role-based font pools + case preferences (owner, 2026-08-15): the Fonts
   playground curates SEPARATE pools for the hero (wine name), secondary
   (appellation, grape) and small (all remaining print) roles, plus an
   upper/lower preference per role. null = keep the composition's design. */
function rolePick(seed,saltKey,hintKey,role){
  const h=STYLE_HINTS[hintKey];
  const list=h&&(role==='secondary'?h.secondaryFonts:h.smallFonts);
  if(!Array.isArray(list)||!list.length)return null;
  const f=list[sPick(seed,(STYLE_SALT[saltKey]||0)*7+(role==='secondary'?5:6),list.length)];
  // 3rd element = this font's case switch ('upper' or null = standard grammar)
  return (Array.isArray(f)&&f.length>=2)?[String(f[0]),+f[1]||400,f[2]||null]:null;
}
function capsFor(picked,designed){
  if(!picked||picked.length<3)return designed;   // designed font: keep the design
  return picked[2]==='upper';                    // curated font: standard unless switched
}
/* HERO COLOUR DISTRIBUTION (owner 2026-08-18). Traditional: red wines →
   wine name in reds/dark reds 70% of renders (rest: the image-derived
   accent); white wines → greens/dark greens 50%, image-derived 30%,
   white-knockout 20% (knockout only on a tinted ground — on a white
   ground it falls back to ink). Contemporary and punk hero colours stay
   100% image-derived through imgPalettes. Seeded → deterministic. */
function heroColour(styleKey,seed,INKc,ACCc,BGc){
  const r=sRand(seed,(STYLE_SALT[styleKey]||0)*7+11);
  if(styleKey!=='traditional')return ACCc;
  const REDS=['#8E2430','#6E1423','#A32638','#57121B'];
  const GREENS=['#2F5D3A','#1F4429','#3F6B34','#25503B'];
  if(WINE_KIND==='red'||WINE_KIND==='rose')
    return r<0.70?REDS[sPick(seed,97,REDS.length)]:ACCc;
  if(r<0.50)return GREENS[sPick(seed,96,GREENS.length)];
  if(r<0.80)return ACCc;
  const c=hslOf(BGc);
  return (c&&c.L<0.86)?'#FFFFFF':INKc;   // knockout only where it stays legible
}
function heroPick(seed,key,variant,hintKey){
  const h=STYLE_HINTS[hintKey||key], hf=h&&h.heroFonts;
  if(Array.isArray(hf)&&hf.length){
    const f=hf[sPick(seed,(STYLE_SALT[key]||0)*7+3+variant,hf.length)];
    if(Array.isArray(f)&&f.length>=2)return [String(f[0]),+f[1]||400,f[2]||null];
  }
  const list=(HERO_ALTS[key]||[])[variant]||[];
  if(!list.length)return null;
  return list[sPick(seed,(STYLE_SALT[key]||0)*7+3+variant,list.length)];
}

/* Arched text along a circular path (textPath keeps output deterministic). */
function sArcText(str,cx,topBaseY,R,o){
  if(!str)return '';
  const id='arcp'+(++__simgN);
  const cyc=topBaseY+R, span=1.9;
  const x1=cx-R*Math.sin(span/2), y1=cyc-R*Math.cos(span/2);
  const x2=cx+R*Math.sin(span/2);
  const asz=Math.max(o.size,MIN7);   // 7pt floor (house rule)
  const ls=o.tr?` letter-spacing="${(asz*o.tr).toFixed(2)}"`:'';
  INK_RECTS.push({x:x1-asz*0.3,y:topBaseY-asz,x2:x2+asz*0.3,y2:y1+asz*0.4});
  return `<defs><path id="${id}" d="M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R.toFixed(1)} ${R.toFixed(1)} 0 0 1 ${x2.toFixed(1)} ${y1.toFixed(1)}"/></defs>`
    +`<text font-family="${o.f}" font-weight="${o.w||400}" font-size="${asz.toFixed(1)}" fill="${o.fill}"${ls}>`
    +`<textPath href="#${id}" startOffset="50%" text-anchor="middle">${esc(o.caps?up(str):str)}</textPath></text>`;
}
/* Draw the style's artwork centred in its composition's FREE AREA. No masks,
   no fades, no crops: 'meet' keeps the whole artwork visible, the generated
   white ground vanishes under multiply, and text never enters the box. */
function sImageBox(styleKey,b,W,H){
  const m=(typeof window!=='undefined'&&window.__LABEL_IMGS__)||null;
  const src=m&&m[styleKey]; if(!src||!b) return '';
  /* Placement is DEFERRED: comps call this mid-body (paint order matters),
     but the best position needs every text ink rect, known only once the
     whole comp has drawn. Emit a token here; sWrap→resolveArt replaces it
     in place, keeping the comp's paint order. */
  const hsA=STYLE_HINTS[styleKey];
  PENDING_ART={src,b,st:styleKey,an:(hsA&&hsA.imgAnalysis)||null};
  return ART_TOKEN;
}

/* Vertical text along a label edge (rotated -90°), shrunk to fit the height —
   the Kirile / Saperavi / PET-NAT side-caption device from the boards. */
function sRot(t,x,H,o){
  if(!t)return '';
  const one=(str,px)=>{
    const s0=o.caps?up(String(str)):String(str); let sz=Math.max(o.size,MIN7);
    const maxL=H-2*SM;
    let wpx=measure(s0,sz,o.f,o.w||400,false,sz*(o.tr||0))+sz*(o.tr||0);
    if(wpx>maxL)sz=Math.max(MIN7,sz*maxL/wpx);
    const still=measure(s0,sz,o.f,o.w||400,false,sz*(o.tr||0))+sz*(o.tr||0);
    if(still>maxL+1)return null;   // even 7pt does not fit the height
    const cy=H/2, ls=o.tr?` letter-spacing="${(sz*(o.tr||0)).toFixed(2)}"`:'';
    INK_RECTS.push({x:px-sz*0.85,y:cy-still/2,x2:px+sz*0.25,y2:cy+still/2});
    return `<text transform="rotate(-90 ${px.toFixed(1)} ${cy.toFixed(1)})" x="${px.toFixed(1)}" y="${cy.toFixed(1)}" font-family="${o.f}" font-weight="${o.w||400}" font-size="${sz.toFixed(1)}" text-anchor="middle" fill="${o.fill}"${ls}>${esc(s0)}</text>`;
  };
  const whole=one(t,x);
  if(whole!==null)return whole;
  // hard-rule conflict (7pt floor vs label height): split at separators into
  // a second column stacked toward the label centre
  const sepM=String(t).match(/\s[\/\u00b7]\s/);
  const parts=sepM?String(t).split(sepM[0]):[String(t)];
  if(parts.length<2)return '';
  const mid=Math.ceil(parts.length/2);
  const colGap=Math.max(o.size,MIN7)*1.35*(o.inward===-1?-1:1);
  const a=one(parts.slice(0,mid).join(sepM[0]),x);
  const b=one(parts.slice(mid).join(sepM[0]),x+colGap);
  return (a||'')+(b||'');
}
function sFlow(items,x,y0,a){
  let svg='', y=y0;
  for(const it of items){
    if(!it)continue;
    /* pre clears a zone above the block (hero, arc, artwork) — it must hold
       even when this line's field is empty, or the rest of the flow collapses
       upward into that zone (live collision: no appellation → grape+vintage
       printed over the hero in punk v2 / flora v1). */
    if(it.pre)y+=it.pre;
    if(!it.str)continue;
    const b=sBlock(it.str,{x,top:y,maxW:it.maxW,size:it.size,min:it.min||it.size*0.6,
      f:it.f,w:it.w,fill:it.fill,a,tr:it.tr,caps:it.caps,ital:it.ital,halo:it.halo,
      lines:it.lines||1,lh:it.lh});
    svg+=b.svg; y=b.bottom+Math.max(it.gap!=null?it.gap:0,MINGAP);
  }
  return {svg,y};
}
/* Single-line row of up to three anchored cells (left/centre/right) whose
   max widths are disjoint, so the row cannot self-overlap. */
function sRow(cells,W,y,size){
  let svg='';
  const zones={l:[SM,W*0.30-SM],c:[W*0.35,W*0.30],r:[W*0.70+MINGAP,W*0.30-SM-MINGAP]};
  for(const c of cells){
    if(!c||!c.str)continue;
    const [zx,zw]=zones[c.a];
    const x=c.a==='l'?zx:(c.a==='c'?W/2:W-SM);
    svg+=sBlock(c.str,{x,top:y,maxW:zw,size:c.size||size,min:(c.size||size)*0.42,
      f:c.f,w:c.w,fill:c.fill,a:c.a,tr:c.tr,caps:c.caps,ital:c.ital}).svg;
  }
  return svg;
}

/* ---- 1) TRADITIONAL — each composition is a STRUCTURAL COPY of one full
   label on the owner's reference board (named per variant). No shared
   footer skeleton: every comp handles its own small print the way its
   source label does. ---- */
function styleTraditional(d,order,seed,twMM,thMM){
  const f=sFields(d), W=twMM*10, H=thMM*10;
  const TPAL=[['#FFFFFF','#D71920','#26221E','#5D564C'],['#F6F0DE','#8E2430','#26221E','#5D564C'],['#F2E9D2','#6B4A2F','#26221E','#5D564C'],['#F4EFE0','#3E5C76','#26221E','#5D564C']];
  const [BG,ACC,INK,SUB]=palPick('traditional','traditional',seed,TPAL,function(p){return [p.bg,p.acc||p.ink,p.ink,p.sub];});
  const HC=heroColour('traditional',seed,INK,ACC,BG);   // wine-name colour (owner distribution)
  const cx=W/2, cW=W-2*SM;
  const variant=pickV('traditional',seed,STYLE_BOXES.traditional.length);
  const HP=heroPick(seed,'traditional',variant,'traditional');
  const F2=rolePick(seed,'traditional','traditional','secondary'),F3=rolePick(seed,'traditional','traditional','small');
  const BOX=STYLE_BOXES['traditional'][variant];
  const alc=f.alc, desc=(f.descriptor||'').replace(/,/g,'');
  const EG=SF.ebg, PF=SF.playfair, CI=F.cormorant;
  let body='';
  /* HOUSE RULE (owner 2026-08-16): NO frames or border rules on any layout —
     the board comps that had them (variants 0, 2, 5) render frameless. */
  if(variant===0){ // Gewürztraminer board: oval vignette, blackletter hero
    body+=sImageBox('traditional',BOX,W,H);
    const st=stackUp([
      {str:f.producer,size:H*0.033,f:F3?F3[0]:(EG),w:F3?F3[1]:(500),fill:INK,caps:capsFor(F3,true),tr:0.22},
      {str:f.appellation,size:H*0.042,f:F2?F2[0]:(CI),w:F2?F2[1]:(600),fill:INK,ital:true,caps:capsFor(F2,false)},
      {str:[f.grape,f.special].filter(Boolean).join(' \u00b7 '),size:H*0.028,f:F2?F2[0]:(EG),w:F2?F2[1]:(600),fill:INK,caps:capsFor(F2,false)},
      {str:[f.region,f.vintage].filter(Boolean).join(' \u00b7 '),size:H*0.027,f:F3?F3[0]:(EG),w:F3?F3[1]:(400),fill:INK,caps:capsFor(F3,false)},
      {str:[f.classification,desc,alc].filter(Boolean).join(' \u00b7 '),size:H*0.023,f:F3?F3[0]:(EG),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)}],cx,H-SM-4,H*0.007,'c',cW*0.84);
    body+=st.svg;
    body+=fitHero(f.wine,cx,BOX[3]*H+MINGAP,st.topY,{size:H*0.115,maxW:cW*0.88,f:HP?HP[0]:(SF.grenze),w:HP?HP[1]:(600),fill:HC,caps:capsFor(HP,false)}).svg;
  }else if(variant===1){ // La Couspaude board: centred, vignette mid, stacked data
    body+=sFlow([
      {str:f.producer,size:H*0.032,f:F3?F3[0]:(EG),w:F3?F3[1]:(500),fill:SUB,caps:capsFor(F3,true),tr:0.34,maxW:cW*0.72,gap:H*0.012,pre:H*0.012},
      {str:f.wine,size:H*0.092,f:HP?HP[0]:(PF),w:HP?HP[1]:(700),fill:HC,caps:capsFor(HP,true),maxW:cW*0.94,gap:0}],cx,SM,'c').svg;
    body+=sImageBox('traditional',BOX,W,H);
    body+=stackUp([
      {str:f.vintage,size:H*0.044,f:F3?F3[0]:(EG),w:F3?F3[1]:(500),fill:INK,caps:capsFor(F3,false)},
      {str:f.classification,size:H*0.035,f:F3?F3[0]:(EG),w:F3?F3[1]:(500),fill:INK,caps:capsFor(F3,true),tr:0.14},
      {str:f.appellation,size:H*0.035,f:F2?F2[0]:(EG),w:F2?F2[1]:(500),fill:INK,caps:capsFor(F2,true),tr:0.14},
      {str:f.grape,size:H*0.028,f:F2?F2[0]:(EG),w:F2?F2[1]:(400),fill:SUB,caps:capsFor(F2,false)},
      {str:[f.region,f.special].filter(Boolean).join(' \u00b7 '),size:H*0.025,f:F3?F3[0]:(EG),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)},
      {str:[desc,alc].filter(Boolean).join(' / '),size:H*0.023,f:F3?F3[0]:(EG),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)}],cx,H-SM-4,H*0.007,'c',cW*0.8).svg;
  }else if(variant===2){ // Mittelwihr board: red letterpress, emblem, all centred
    body+=sBlock(f.appellation,{x:cx,top:SM+H*0.012,maxW:cW*0.8,size:H*0.040,min:H*0.028,f:F2?F2[0]:(SF.archivo),w:F2?F2[1]:(500),fill:ACC,a:'c',caps:true,tr:0.32}).svg;
    body+=sImageBox('traditional',BOX,W,H);
    body+=sFlow([
      {str:f.wine,size:H*0.115,f:HP?HP[0]:(SF.archivo),w:HP?HP[1]:(800),fill:HC,caps:capsFor(HP,true),tr:0.05,maxW:cW*0.92,gap:H*0.014,pre:H*0.38},
      {str:f.producer,size:H*0.031,f:F3?F3[0]:(EG),w:F3?F3[1]:(500),fill:INK,caps:capsFor(F3,true),tr:0.22,maxW:cW*0.78,gap:H*0.012},
      {str:f.grape,size:H*0.030,f:F2?F2[0]:(EG),w:F2?F2[1]:(600),fill:INK,caps:capsFor(F2,true),tr:0.10,maxW:cW*0.7,gap:0}],cx,SM,'c').svg;
    body+=stackUp([
      {str:f.region,size:H*0.028,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(500),fill:ACC,caps:capsFor(F3,true),tr:0.18},
      {str:[f.vintage,f.classification].filter(Boolean).join(' \u00b7 '),size:H*0.025,f:F3?F3[0]:(EG),w:F3?F3[1]:(400),fill:INK,caps:capsFor(F3,false)},
      {str:[f.special,desc].filter(Boolean).join(' \u00b7 '),size:H*0.023,f:F3?F3[0]:(EG),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)},
      {str:alc,size:H*0.022,f:F3?F3[0]:(EG),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)}],cx,H-SM-H*0.01,H*0.007,'c',cW*0.8).svg;
  }else if(variant===3){ // Kirile board: portrait, script signature, side verticals
    body+=sImageBox('traditional',BOX,W,H);
    body+=sRot([f.region,f.vintage].filter(Boolean).join(' \u00b7 '),W-SM-MIN7*0.55,H,{inward:-1,size:H*0.024,f:F3?F3[0]:(EG),w:F3?F3[1]:(400),fill:SUB,tr:0.08,caps:true});
    body+=sRot([desc,alc].filter(Boolean).join(' / '),SM+MIN7*1.1,H,{size:H*0.022,f:F3?F3[0]:(EG),w:F3?F3[1]:(400),fill:SUB,tr:0.06});
    const st=stackUp([
      {str:f.producer,size:H*0.029,f:F3?F3[0]:(EG),w:F3?F3[1]:(500),fill:SUB,caps:capsFor(F3,true),tr:0.3},
      {str:f.appellation,size:H*0.04,f:F2?F2[0]:(CI),w:F2?F2[1]:(600),fill:ACC,ital:true,caps:capsFor(F2,false)},
      {str:[f.grape,f.classification].filter(Boolean).join(' \u00b7 '),size:H*0.026,f:F2?F2[0]:(EG),w:F2?F2[1]:(400),fill:INK,caps:capsFor(F2,false)},
      {str:f.special,size:H*0.023,f:F3?F3[0]:(EG),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)}],cx,H-SM-4,H*0.007,'c',cW*0.66);
    body+=st.svg;
    body+=fitHero(f.wine,cx,BOX[3]*H+MINGAP,st.topY,{size:H*0.145,maxW:cW*0.8,f:HP?HP[0]:(F.greatVibes),w:HP?HP[1]:(400),fill:HC,caps:capsFor(HP,false)}).svg;
  }else if(variant===4){ // Olive Tree board: airy engraving over tiny tracked caps
    body+=sImageBox('traditional',BOX,W,H);
    const st=stackUp([
      {str:f.producer,size:H*0.027,f:F3?F3[0]:(EG),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,true),tr:0.34},
      {str:f.appellation,size:H*0.036,f:F2?F2[0]:(CI),w:F2?F2[1]:(600),fill:ACC,ital:true,caps:capsFor(F2,false)},
      {str:[f.grape,f.vintage].filter(Boolean).join(' \u00b7 '),size:H*0.027,f:F2?F2[0]:(EG),w:F2?F2[1]:(500),fill:INK,caps:capsFor(F2,false)},
      {str:[f.region,f.classification].filter(Boolean).join(' \u00b7 '),size:H*0.024,f:F3?F3[0]:(EG),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)},
      {str:[f.special,desc,alc].filter(Boolean).join(' \u00b7 '),size:H*0.022,f:F3?F3[0]:(EG),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)}],cx,H-SM-4,H*0.007,'c',cW*0.8);
    body+=st.svg;
    body+=fitHero(f.wine,cx,BOX[3]*H+MINGAP,st.topY,{size:H*0.050,maxW:cW*0.9,f:HP?HP[0]:(EG),w:HP?HP[1]:(500),fill:HC,caps:capsFor(HP,true),tr:0.42}).svg;
  }else if(variant===6){ // Jullouville board (owner 2026-08-17): wide engraving
                         // band over a serif name between two short rules
    body+=sImageBox('traditional',BOX,W,H);
    const st=stackUp([
      {str:[f.classification,f.vintage].filter(Boolean).join(' '),size:H*0.046,f:F2?F2[0]:(EG),w:F2?F2[1]:(600),fill:INK,caps:capsFor(F2,true),tr:0.10},
      {str:f.appellation,size:H*0.030,f:F2?F2[0]:(EG),w:F2?F2[1]:(600),fill:INK,caps:capsFor(F2,true),tr:0.16},
      {str:[f.region,f.special].filter(Boolean).join(' · '),size:H*0.026,f:F3?F3[0]:(EG),w:F3?F3[1]:(400),fill:INK,caps:capsFor(F3,false)},
      {str:[f.grape,f.producer].filter(Boolean).join(' · '),size:H*0.024,f:F3?F3[0]:(EG),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)},
      {str:[desc,alc].filter(Boolean).join(' / '),size:H*0.023,f:F3?F3[0]:(EG),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)}],cx,H-SM-4,H*0.007,'c',cW*0.9);
    body+=st.svg;
    const hero6=fitHero(f.wine,cx,BOX[3]*H+MINGAP+H*0.024,st.topY-H*0.024,{size:H*0.105,maxW:cW*0.9,f:HP?HP[0]:(PF),w:HP?HP[1]:(600),fill:HC,caps:capsFor(HP,false)});
    body+=hero6.svg;
    if(hero6.svg&&hero6.top!=null){ // short divider rules (not frames) flanking the name
      const rx1=cx-cW*0.45, rx2=cx+cW*0.45;
      body+=`<line x1="${rx1.toFixed(1)}" y1="${(hero6.top-H*0.02).toFixed(1)}" x2="${rx2.toFixed(1)}" y2="${(hero6.top-H*0.02).toFixed(1)}" stroke="${INK}" stroke-width="1.6"/>`;
      body+=`<line x1="${rx1.toFixed(1)}" y1="${(hero6.bottom+H*0.02).toFixed(1)}" x2="${rx2.toFixed(1)}" y2="${(hero6.bottom+H*0.02).toFixed(1)}" stroke="${INK}" stroke-width="1.6"/>`;
    }
  }else if(variant===7){ // Perrin board: emblem, tracked producer caps, then
                         // name + italic appellation + cuvée grouped mid
    body+=sImageBox('traditional',BOX,W,H);
    body+=sFlow([
      {str:f.producer,size:H*0.042,f:F3?F3[0]:(EG),w:F3?F3[1]:(500),fill:INK,caps:capsFor(F3,true),tr:0.24,maxW:cW*0.8,gap:H*0.014},
      {str:f.wine,size:H*0.115,f:HP?HP[0]:(SF.grenze),w:HP?HP[1]:(600),fill:HC,caps:capsFor(HP,false),maxW:cW*0.94,gap:H*0.012},
      {str:f.appellation,size:H*0.040,f:F2?F2[0]:(CI),w:F2?F2[1]:(600),fill:ACC,ital:true,caps:capsFor(F2,false),maxW:cW*0.8,gap:H*0.012},
      {str:[f.special,f.grape].filter(Boolean).join(' · '),size:H*0.048,f:F2?F2[0]:(CI),w:F2?F2[1]:(600),fill:INK,ital:true,caps:capsFor(F2,false),maxW:cW*0.8,gap:0}],cx,BOX[3]*H+MINGAP+H*0.006,'c').svg;
    body+=stackUp([
      {str:[f.region,f.vintage].filter(Boolean).join(', '),size:H*0.026,f:F3?F3[0]:(EG),w:F3?F3[1]:(400),fill:INK,ital:true,caps:capsFor(F3,false)},
      {str:f.classification,size:H*0.024,f:F3?F3[0]:(EG),w:F3?F3[1]:(400),fill:INK,caps:capsFor(F3,true),tr:0.12},
      {str:[desc,alc].filter(Boolean).join(' / '),size:H*0.023,f:F3?F3[0]:(EG),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)}],cx,H-SM-4,H*0.008,'c',cW*0.9).svg;
  }else if(variant===8){ // Pegau board: arched producer caps over the crest,
                         // blackletter name, red accent lines
    const asz8=Math.max(H*0.042,MIN7), R8=cW*0.42;
    body+=sArcText(f.producer,cx,SM+asz8*1.25,R8,{f:F3?F3[0]:(EG),w:F3?F3[1]:(500),size:asz8,fill:INK,tr:0.30,caps:true});
    body+=sImageBox('traditional',BOX,W,H);
    const st8=stackUp([
      {str:f.appellation,size:H*0.032,f:F2?F2[0]:(EG),w:F2?F2[1]:(600),fill:INK,caps:capsFor(F2,true),tr:0.14},
      {str:[f.special,f.vintage].filter(Boolean).join(' · '),size:H*0.028,f:F2?F2[0]:(EG),w:F2?F2[1]:(500),fill:ACC,caps:capsFor(F2,false)},
      {str:[f.grape,f.region,f.classification].filter(Boolean).join(' · '),size:H*0.024,f:F3?F3[0]:(EG),w:F3?F3[1]:(400),fill:INK,caps:capsFor(F3,false)},
      {str:[desc,alc].filter(Boolean).join(' / '),size:H*0.023,f:F3?F3[0]:(EG),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)}],cx,H-SM-4,H*0.008,'c',cW*0.9);
    body+=st8.svg;
    body+=fitHero(f.wine,cx,BOX[3]*H+MINGAP,st8.topY,{size:H*0.115,maxW:cW*0.94,f:HP?HP[0]:(SF.grenze),w:HP?HP[1]:(600),fill:HC,caps:capsFor(HP,false)}).svg;
  }else{ // Margaux/Ausone boards: pure centred type
    body+=sFlow([
      {str:f.vintage,size:H*0.045,f:F3?F3[0]:(EG),w:F3?F3[1]:(500),fill:INK,maxW:cW*0.3,gap:H*0.02,pre:H*0.06,caps:capsFor(F3,false)},
      {str:f.producer,size:H*0.04,f:F3?F3[0]:(EG),w:F3?F3[1]:(500),fill:SUB,caps:capsFor(F3,true),tr:0.3,maxW:cW*0.72,gap:H*0.05},
      {str:f.wine,size:H*0.13,f:HP?HP[0]:(PF),w:HP?HP[1]:(700),fill:HC,caps:capsFor(HP,true),lines:2,lh:1.02,maxW:cW*0.8,gap:H*0.02},
      {str:f.appellation,size:H*0.055,f:F2?F2[0]:(CI),w:F2?F2[1]:(600),fill:INK,ital:true,maxW:cW*0.6,gap:H*0.03,caps:capsFor(F2,false)},
      {str:f.classification,size:H*0.037,f:F3?F3[0]:(EG),w:F3?F3[1]:(400),fill:SUB,maxW:cW*0.7,gap:H*0.012,caps:capsFor(F3,false)},
      {str:f.grape,size:H*0.037,f:F2?F2[0]:(EG),w:F2?F2[1]:(700),fill:INK,caps:capsFor(F2,true),tr:0.08,maxW:cW*0.7,gap:H*0.012},
      {str:[f.region,f.special].filter(Boolean).join(' \u00b7 '),size:H*0.03,f:F3?F3[0]:(EG),w:F3?F3[1]:(400),fill:SUB,maxW:cW*0.7,gap:H*0.012,caps:capsFor(F3,false)},
      {str:[desc,alc].filter(Boolean).join(' / '),size:H*0.027,f:F3?F3[0]:(EG),w:F3?F3[1]:(400),fill:SUB,maxW:cW*0.7,gap:0,caps:capsFor(F3,false)}],cx,SM,'c').svg;
  }
  return sWrap(W,H,twMM,thMM,BG,body);
}

/* ---- 2) CONTEMPORARY — structural copies of the board's full labels. ---- */
function styleContempX(f,W,H,seed,twMM,thMM,fv){
  const CSCH=[{bg:'#FFFFFF',ink:'#231F20',sub:'#6D6E71',acc:'#E8542F'},
    {bg:'#F6F0E2',ink:'#231F20',sub:'#75716A',acc:'#2B4C9B'},
    {bg:'#F8EFE3',ink:'#20130E',sub:'#75655A',acc:'#E8542F'},
    {bg:'#F3D3C4',ink:'#232019',sub:'#7C5A4A',acc:'#B33A24'},
    {bg:'#CDD6C2',ink:'#22271F',sub:'#5A6650',acc:'#2F5D3A'}];
  const SCH=palPick('contemporary','contemporaryX',seed,CSCH,function(p){return {bg:p.bg,ink:p.ink,sub:p.sub,acc:p.acc};});
  const INK=SCH.ink, SUB=SCH.sub, cx=W/2, cW=W-2*SM;
  const variant=(fv!=null)?fv:pickVariant('contemporaryX',seed,6);
  const HP=heroPick(seed,'contemporaryX',variant,'contemporary');
  const F2=rolePick(seed,'contemporaryX','contemporary','secondary'),F3=rolePick(seed,'contemporaryX','contemporary','small');
  const BOX=STYLE_BOXES['contemporaryX'][variant];
  const alc=f.alc, desc=(f.descriptor||'').replace(/,/g,'');
  const reg=[f.region,f.special].filter(Boolean).join(' / ');
  let body='';
  /* HARD RULE (owner 2026-08-16): max 3 typefaces per label. Every element
     routes through the hero/secondary/small role picks; each comp's designed
     fallbacks stay within 3 families. Enforced by check-hard-rules.mjs. */
  if(variant===0){ // Gotes board: caps corner, big motif, everything else lives bottom-left
    body+=sBlock(f.producer,{x:SM,top:SM,maxW:W*0.5,size:H*0.030,min:H*0.022,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(600),fill:INK,a:'l',caps:true,tr:0.32}).svg;
    body+=sBlock(f.vintage,{x:W-SM,top:SM,maxW:W*0.26,size:H*0.030,min:H*0.022,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(500),fill:SUB,a:'r'}).svg;
    body+=sImageBox('contemporary',BOX,W,H);
    body+=sFlow([
      {str:f.wine,size:H*0.082,f:HP?HP[0]:(SF.archivo),w:HP?HP[1]:(800),fill:INK,caps:capsFor(HP,true),maxW:cW*0.9,gap:H*0.014,pre:H*0.645},
      {str:[f.appellation,f.grape].filter(Boolean).join(' \u00b7 '),size:H*0.033,f:F2?F2[0]:(SF.jost),w:F2?F2[1]:(500),fill:SUB,maxW:cW*0.8,gap:H*0.010,caps:capsFor(F2,false)},
      {str:[f.classification,reg].filter(Boolean).join(' \u00b7 '),size:H*0.026,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(400),fill:SUB,maxW:cW*0.85,gap:H*0.008,caps:capsFor(F3,false)},
      {str:[desc,alc].filter(Boolean).join(' / '),size:H*0.024,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(400),fill:SUB,maxW:cW*0.85,gap:0,caps:capsFor(F3,false)}],SM,SM,'l').svg;
  }else if(variant===1){ // ñor board: giant lowercase serif, tiny corner data
    body+=sImageBox('contemporary',BOX,W,H);
    body+=sFlow([
      {str:f.wine.toLowerCase(),size:H*0.20,f:HP?HP[0]:(SF.fraunces),w:HP?HP[1]:(600),fill:SCH.acc,maxW:cW*0.96,gap:H*0.014,pre:H*0.37,caps:capsFor(HP,false)},
      {str:f.appellation,size:H*0.042,f:F2?F2[0]:(SF.jost),w:F2?F2[1]:(500),fill:INK,maxW:cW*0.7,gap:0,caps:capsFor(F2,false)}],cx,SM,'c').svg;
    body+=stackUp([
      {str:f.producer,size:H*0.028,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(600),fill:INK,tr:0.12,caps:capsFor(F3,false)},
      {str:[f.region,f.classification].filter(Boolean).join(' \u00b7 '),size:H*0.024,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)}],SM+cW*0.28,H-SM-2,H*0.007,'l',cW*0.55).svg;
    body+=stackUp([
      {str:[f.grape,f.vintage].filter(Boolean).join(' \u00b7 '),size:H*0.026,f:F2?F2[0]:(SF.jost),w:F2?F2[1]:(500),fill:INK,caps:capsFor(F2,false)},
      {str:[f.special,desc,alc].filter(Boolean).join(' / '),size:H*0.022,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)}],W-SM,H-SM-2,H*0.007,'r',cW*0.45).svg;
  }else if(variant===2){ // Saperavi board: motif top, letterspaced caps, vertical side data
    body+=sImageBox('contemporary',BOX,W,H);
    body+=sFlow([
      {str:f.wine,size:H*0.068,f:HP?HP[0]:(SF.marcellus),w:HP?HP[1]:(400),fill:INK,caps:capsFor(HP,true),tr:0.26,maxW:cW*0.9,gap:H*0.016,pre:H*0.46},
      {str:desc,size:H*0.040,f:F3?F3[0]:(SF.fraunces),w:F3?F3[1]:(500),fill:SCH.acc,ital:true,maxW:cW*0.6,gap:H*0.016,caps:capsFor(F3,false)},
      {str:f.appellation,size:H*0.034,f:F2?F2[0]:(SF.jost),w:F2?F2[1]:(500),fill:SUB,maxW:cW*0.7,gap:0,caps:capsFor(F2,false)}],cx,SM,'c').svg;
    body+=sRot([f.region,f.vintage].filter(Boolean).join(' \u00b7 '),W-SM-MIN7*0.55,H,{inward:-1,inward:-1,size:H*0.023,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(400),fill:SUB,tr:0.1,caps:true});
    body+=stackUp([
      {str:f.producer,size:H*0.028,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(600),fill:INK,tr:0.14,caps:capsFor(F3,false)},
      {str:[f.grape,f.classification].filter(Boolean).join(' \u00b7 '),size:H*0.025,f:F2?F2[0]:(SF.jost),w:F2?F2[1]:(400),fill:SUB,caps:capsFor(F2,false)},
      {str:[f.special,alc].filter(Boolean).join(' / '),size:H*0.022,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)}],cx,H-SM-2,H*0.007,'c',cW*0.75).svg;
  }else if(variant===3){ // Wine People board: arched ring, script sign-off, centre stack
    (function(){
      let asz=H*0.042; const R=W*0.42;
      const af=F3?F3[0]:(SF.jost), aww=F3?F3[1]:(500);
      const aw=measure(up(f.producer||''),asz,af,aww,false,asz*0.34);
      if(aw>R*1.55)asz=Math.max(MIN7,asz*R*1.55/aw);
      body+=sArcText(f.producer,cx,SM+asz*0.85,R,{f:af,w:aww,size:asz,fill:INK,tr:0.34,caps:true});
    })();
    body+=sImageBox('contemporary',BOX,W,H);
    body+=sFlow([
      {str:f.wine,size:H*0.08,f:HP?HP[0]:(SF.archivo),w:HP?HP[1]:(700),fill:INK,caps:capsFor(HP,true),tr:0.08,maxW:cW*0.9,gap:H*0.014,pre:H*0.555},
      {str:f.appellation,size:H*0.05,f:F2?F2[0]:(SF.caveat),w:F2?F2[1]:(600),fill:SCH.acc,maxW:cW*0.7,gap:0,caps:capsFor(F2,false)}],cx,SM,'c').svg;
    body+=stackUp([
      {str:[f.grape,f.vintage].filter(Boolean).join(' \u00b7 '),size:H*0.026,f:F2?F2[0]:(SF.jost),w:F2?F2[1]:(500),fill:INK,caps:capsFor(F2,false)},
      {str:[f.classification,reg].filter(Boolean).join(' \u00b7 '),size:H*0.024,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)},
      {str:[desc,alc].filter(Boolean).join(' / '),size:H*0.022,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)}],cx,H-SM-2,H*0.007,'c',cW*0.8).svg;
  }else if(variant===4){ // horizon boards: wide field, quiet centred data
    body+=sBlock(f.producer,{x:SM,top:SM,maxW:W*0.5,size:H*0.030,min:H*0.022,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(600),fill:INK,a:'l',caps:true,tr:0.18}).svg;
    body+=sBlock(f.vintage,{x:W-SM,top:SM,maxW:W*0.26,size:H*0.030,min:H*0.022,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(500),fill:INK,a:'r'}).svg;
    body+=sImageBox('contemporary',BOX,W,H);
    body+=sFlow([
      {str:f.wine,size:H*0.09,f:HP?HP[0]:(SF.archivo),w:HP?HP[1]:(800),fill:INK,caps:capsFor(HP,true),maxW:cW*0.92,gap:H*0.014,pre:H*0.575},
      {str:[f.appellation,f.grape].filter(Boolean).join(' \u00b7 '),size:H*0.036,f:F2?F2[0]:(SF.jost),w:F2?F2[1]:(500),fill:SUB,maxW:cW*0.85,gap:0,caps:capsFor(F2,false)}],cx,SM,'c').svg;
    body+=stackUp([
      {str:[f.classification,reg].filter(Boolean).join(' \u00b7 '),size:H*0.024,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)},
      {str:[desc,alc].filter(Boolean).join(' / '),size:H*0.022,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)}],cx,H-SM-2,H*0.007,'c',cW*0.8).svg;
  }else{ // Finca Collado board: script signature, small motif, quiet stack
    body+=sBlock(f.producer,{x:cx,top:SM,maxW:cW*0.8,size:H*0.062,min:H*0.04,f:F2?F2[0]:(SF.caveat),w:F2?F2[1]:(600),fill:SCH.acc,a:'c'}).svg;
    body+=sImageBox('contemporary',BOX,W,H);
    body+=sFlow([
      {str:f.wine,size:H*0.07,f:HP?HP[0]:(SF.archivo),w:HP?HP[1]:(600),fill:INK,caps:capsFor(HP,true),tr:0.12,maxW:cW*0.9,gap:H*0.014,pre:H*0.625},
      {str:[f.appellation,f.vintage].filter(Boolean).join('  \u00b7  '),size:H*0.034,f:F2?F2[0]:(SF.jost),w:F2?F2[1]:(500),fill:SUB,maxW:cW*0.8,gap:H*0.010,caps:capsFor(F2,false)},
      {str:[f.grape,f.classification,reg].filter(Boolean).join(' / '),size:H*0.026,f:F2?F2[0]:(SF.jost),w:F2?F2[1]:(400),fill:SUB,maxW:cW*0.9,gap:H*0.008,caps:capsFor(F2,false)},
      {str:[desc,alc].filter(Boolean).join('  \u00b7  '),size:H*0.024,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(400),fill:SUB,maxW:cW*0.9,gap:0,caps:capsFor(F3,false)}],cx,SM,'c').svg;
  }
  return sWrap(W,H,twMM,thMM,SCH.bg,body);
}

/* ---- 3) FLORA & FAUNA — structural copies of the board's full labels. ---- */
function styleFlora(f,W,H,seed,twMM,thMM,fv){
  const FPAL=[['#F2EDDD','#C73A2E','#2B2620','#6E6555'],['#EFE8D6','#5F6B39','#2B2620','#6E6555'],['#F7F1E1','#B4552D','#2B2620','#6E6555'],['#EFE6CE','#3E5C46','#2B2620','#6E6555']];
  const [BG,ACC,INK,SUB]=palPick('contemporary','flora',seed,FPAL,function(p){return [p.bg,p.acc||p.ink,p.ink,p.sub];});
  const cx=W/2, cW=W-2*SM;
  const variant=(fv!=null)?fv:pickVariant('flora',seed,5);
  const HP=heroPick(seed,'flora',variant,'contemporary');
  const F2=rolePick(seed,'flora','contemporary','secondary'),F3=rolePick(seed,'flora','contemporary','small');
  const BOX=STYLE_BOXES['flora'][variant];
  const alc=f.alc, desc=(f.descriptor||'').replace(/,/g,'');
  const reg=[f.region,f.special].filter(Boolean).join(' \u00b7 ');
  let body='';
  if(variant===0){ // Hermit Ram board: huge beast, tight centred title block under it
    body+=sImageBox('contemporary',BOX,W,H);
    body+=sFlow([
      {str:f.wine,size:H*0.072,f:HP?HP[0]:(SF.fraunces),w:HP?HP[1]:(700),fill:INK,caps:capsFor(HP,true),maxW:cW*0.92,gap:H*0.012,pre:H*0.575},
      {str:[f.appellation,f.vintage].filter(Boolean).join('  \u00b7  '),size:H*0.034,f:F2?F2[0]:(SF.ebg),w:F2?F2[1]:(500),fill:ACC,caps:capsFor(F2,true),tr:0.16,maxW:cW*0.8,gap:H*0.010},
      {str:[f.grape,f.classification].filter(Boolean).join(' \u00b7 '),size:H*0.028,f:F2?F2[0]:(SF.ebg),w:F2?F2[1]:(400),fill:INK,ital:true,maxW:cW*0.8,gap:H*0.010,caps:capsFor(F2,false)},
      {str:reg,size:H*0.025,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(400),fill:SUB,maxW:cW*0.8,gap:H*0.008,caps:capsFor(F3,false)},
      {str:[f.producer,desc,alc].filter(Boolean).join(' \u00b7 '),size:H*0.022,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(400),fill:SUB,maxW:cW*0.88,gap:0,caps:capsFor(F3,false)}],cx,SM,'c').svg;
  }else if(variant===1){ // Elephant in the Room board: arched stamped caps over the beast
    (function(){
      let asz=H*0.05; const R=W*0.40;
      const af=HP?HP[0]:(SF.imfell), aww=HP?HP[1]:(400);
      const hcaps=capsFor(HP,true);   // curated fonts keep their case pref (owner 2026-08-18)
      const aw=measure(hcaps?up(f.wine||''):(f.wine||''),asz,af,aww,false,asz*0.16);
      if(aw>R*1.55)asz=Math.max(MIN7,asz*R*1.55/aw);
      body+=sArcText(f.wine,cx,SM+asz*0.85,R,{f:af,w:aww,size:asz,fill:INK,tr:0.16,caps:hcaps});
    })();
    body+=sImageBox('contemporary',BOX,W,H);
    body+=sFlow([
      {str:f.appellation,size:H*0.046,f:F2?F2[0]:(SF.imfell),w:F2?F2[1]:(400),fill:INK,caps:capsFor(F2,true),tr:0.1,maxW:cW*0.85,gap:H*0.012,pre:H*0.585},
      {str:f.vintage,size:H*0.038,f:F3?F3[0]:(SF.imfell),w:F3?F3[1]:(400),fill:ACC,maxW:cW*0.3,gap:H*0.010,caps:capsFor(F3,false)},
      {str:[f.grape,f.classification].filter(Boolean).join(' / '),size:H*0.028,f:F2?F2[0]:(SF.jost),w:F2?F2[1]:(400),fill:SUB,maxW:cW*0.85,gap:0,caps:capsFor(F2,false)}],cx,SM,'c').svg;
    body+=stackUp([
      {str:f.producer,size:H*0.027,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(600),fill:INK,tr:0.16,caps:capsFor(F3,false)},
      {str:[reg,desc,alc].filter(Boolean).join(' / '),size:H*0.022,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)}],cx,H-SM-2,H*0.007,'c',cW*0.85).svg;
  }else if(variant===2){ // Chico Malo board: beast top, huge brush hero, gold-ish producer at foot
    body+=sImageBox('contemporary',BOX,W,H);
    body+=sFlow([
      {str:f.wine,size:H*0.125,f:HP?HP[0]:(SF.caveat),w:HP?HP[1]:(700),fill:INK,maxW:cW*0.9,gap:H*0.016,pre:H*0.385,caps:capsFor(HP,false)},
      {str:desc,size:H*0.030,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(500),fill:ACC,caps:capsFor(F3,true),tr:0.2,maxW:cW*0.7,gap:H*0.014},
      {str:[f.appellation,f.grape].filter(Boolean).join(' \u00b7 '),size:H*0.028,f:F2?F2[0]:(SF.jost),w:F2?F2[1]:(400),fill:SUB,maxW:cW*0.85,gap:0,caps:capsFor(F2,false)}],cx,SM,'c').svg;
    body+=stackUp([
      {str:f.producer,size:H*0.032,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(600),fill:ACC,caps:capsFor(F3,false)},
      {str:[f.classification,reg].filter(Boolean).join(' \u00b7 '),size:H*0.024,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)},
      {str:[f.vintage,alc].filter(Boolean).join('  \u00b7  '),size:H*0.023,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(500),fill:INK,caps:capsFor(F3,false)}],cx,H-SM-2,H*0.007,'c',cW*0.8).svg;
  }else if(variant===3){ // Hugh Hamilton board: tiny creature, italic aside, airy
    body+=sBlock(f.producer,{x:SM,top:SM,maxW:W*0.5,size:H*0.028,min:H*0.02,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(600),fill:INK,a:'l',caps:true,tr:0.3}).svg;
    body+=sBlock(f.vintage,{x:W-SM,top:SM,maxW:W*0.26,size:H*0.028,min:H*0.02,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(500),fill:SUB,a:'r'}).svg;
    body+=sImageBox('contemporary',BOX,W,H);
    body+=sFlow([
      {str:f.wine,size:H*0.052,f:HP?HP[0]:(SF.fraunces),w:HP?HP[1]:(600),fill:INK,caps:capsFor(HP,true),tr:0.3,maxW:cW*0.9,gap:H*0.014,pre:H*0.53},
      {str:f.appellation,size:H*0.040,f:F2?F2[0]:(F.cormorant),w:F2?F2[1]:(600),fill:ACC,ital:true,maxW:cW*0.65,gap:0,caps:capsFor(F2,false)}],cx,SM,'c').svg;
    body+=stackUp([
      {str:[f.grape,f.classification].filter(Boolean).join(' \u00b7 '),size:H*0.026,f:F2?F2[0]:(SF.jost),w:F2?F2[1]:(500),fill:INK,caps:capsFor(F2,false)},
      {str:[reg,desc,alc].filter(Boolean).join(' / '),size:H*0.022,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)}],cx,H-SM-2,H*0.007,'c',cW*0.8).svg;
  }else{ // Aleria/Tarosi boards: beast left, script hero right, vertical edge caps
    body+=sImageBox('contemporary',BOX,W,H);
    body+=sFlow([
      {str:f.producer,size:H*0.028,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(600),fill:SUB,caps:capsFor(F3,true),tr:0.24,maxW:W*0.34,gap:H*0.02,pre:H*0.08},
      {str:f.wine,size:H*0.125,f:HP?HP[0]:(F.italianno),w:HP?HP[1]:(400),fill:INK,maxW:W*0.36,gap:H*0.016,caps:capsFor(HP,false)},
      {str:f.appellation,size:H*0.040,f:F2?F2[0]:(F.cormorant),w:F2?F2[1]:(600),fill:ACC,ital:true,maxW:W*0.34,gap:H*0.014,caps:capsFor(F2,false)},
      {str:f.grape,size:H*0.030,f:F2?F2[0]:(SF.jost),w:F2?F2[1]:(500),fill:INK,maxW:W*0.34,gap:H*0.010,caps:capsFor(F2,false)},
      {str:f.classification,size:H*0.027,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(400),fill:SUB,maxW:W*0.34,gap:H*0.010,caps:capsFor(F3,false)},
      {str:f.vintage,size:H*0.046,f:F2?F2[0]:(F.cormorant),w:F2?F2[1]:(600),fill:ACC,maxW:W*0.3,gap:0,caps:capsFor(F2,false)}],W*0.60,SM,'l').svg;
    body+=sRot(reg,W-SM-MIN7*0.55,H,{inward:-1,size:H*0.023,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(400),fill:SUB,tr:0.1,caps:true});
    body+=sBlock([desc,alc].filter(Boolean).join(' / '),{x:SM,top:H-SM-H*0.024,maxW:W*0.6,size:H*0.022,min:H*0.018,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(400),fill:SUB,a:'l'}).svg;
  }
  return sWrap(W,H,twMM,thMM,BG,body);
}

/* ---- 4) PREMIUM — structural copies of the board's full labels. ---- */
function stylePremium(f,W,H,seed,twMM,thMM,fv){
  const PPAL=[['#F2EDE0','#2B2822','#7A7160'],['#FFFFFF','#2B2822','#7A7160'],['#F7F2E6','#2B2822','#7A7160']];
  const [BG,INK,SUB]=palPick('contemporary','premium',seed,PPAL,function(p){return [p.bg,p.ink,p.sub];});
  const id='g'+(++__sid); const gold=`url(#${id})`;
  const RED='#8E2430';
  const defs=`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D8BC85"/><stop offset="0.5" stop-color="#B08D57"/><stop offset="1" stop-color="#8C6A32"/></linearGradient>`;
  const cx=W/2, cW=W-2*SM;
  const variant=(fv!=null)?fv:pickVariant('premium',seed,5);
  const HP=heroPick(seed,'premium',variant,'contemporary');
  const F2=rolePick(seed,'premium','contemporary','secondary'),F3=rolePick(seed,'premium','contemporary','small');
  const BOX=STYLE_BOXES['premium'][variant];
  const alc=f.alc, desc=(f.descriptor||'').replace(/,/g,'');
  const reg=[f.region,f.special].filter(Boolean).join(' \u00b7 ');
  let body='';
  if(variant===0){ // Sinegal board: tiny emblem, huge tracked caps, silence
    body+=sImageBox('contemporary',BOX,W,H);
    body+=sFlow([
      {str:f.wine,size:H*0.065,f:HP?HP[0]:(SF.cinzel),w:HP?HP[1]:(600),fill:INK,caps:capsFor(HP,true),tr:0.30,maxW:cW*0.94,gap:H*0.024,pre:H*0.30},
      {str:f.vintage,size:H*0.038,f:F3?F3[0]:(SF.cinzel),w:F3?F3[1]:(500),fill:gold,tr:0.24,maxW:cW*0.4,gap:H*0.022,caps:capsFor(F3,false)},
      {str:f.appellation,size:H*0.036,f:F2?F2[0]:(F.ebg),w:F2?F2[1]:(500),fill:SUB,ital:true,maxW:cW*0.6,gap:0,caps:capsFor(F2,false)}],cx,SM,'c').svg;
    body+=stackUp([
      {str:[f.grape,f.classification].filter(Boolean).join(' \u00b7 '),size:H*0.026,f:F2?F2[0]:(SF.cinzel),w:F2?F2[1]:(500),fill:SUB,tr:0.08,caps:capsFor(F2,false)},
      {str:[f.producer,reg].filter(Boolean).join(' \u00b7 '),size:H*0.024,f:F3?F3[0]:(F.ebg),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)},
      {str:[desc,alc].filter(Boolean).join(' / '),size:H*0.022,f:F3?F3[0]:(F.ebg),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)}],cx,H-SM-2,H*0.008,'c',cW*0.85).svg;
  }else if(variant===1){ // Ram's Gate board: data sheet, emblem at the foot
    body+=sFlow([
      {str:f.wine,size:H*0.062,f:HP?HP[0]:(SF.cinzel),w:HP?HP[1]:(600),fill:INK,caps:capsFor(HP,true),tr:0.14,maxW:cW*0.92,gap:H*0.016,pre:H*0.015},
      {str:desc,size:H*0.032,f:F3?F3[0]:(SF.cinzel),w:F3?F3[1]:(500),fill:RED,caps:capsFor(F3,true),tr:0.14,maxW:cW*0.7,gap:H*0.018},
      {str:f.appellation,size:H*0.030,f:F2?F2[0]:(F.ebg),w:F2?F2[1]:(500),fill:INK,caps:capsFor(F2,true),tr:0.26,maxW:cW*0.8,gap:H*0.018}],cx,SM,'c').svg;
    body+=`<line x1="${(cx-cW*0.22).toFixed(1)}" y1="${(H*0.30).toFixed(1)}" x2="${(cx+cW*0.22).toFixed(1)}" y2="${(H*0.30).toFixed(1)}" stroke="${gold}" stroke-width="${Math.max(1,H*0.003).toFixed(1)}"/>`;
    body+=sFlow([
      {str:[f.vintage,f.grape].filter(Boolean).join('   \u00b7   '),size:H*0.030,f:F2?F2[0]:(F.ebg),w:F2?F2[1]:(500),fill:INK,maxW:cW*0.8,gap:H*0.012,pre:H*0.255,caps:capsFor(F2,false)},
      {str:f.classification,size:H*0.027,f:F3?F3[0]:(F.ebg),w:F3?F3[1]:(400),fill:SUB,maxW:cW*0.8,gap:H*0.010,caps:capsFor(F3,false)},
      {str:reg,size:H*0.025,f:F3?F3[0]:(F.ebg),w:F3?F3[1]:(400),fill:SUB,maxW:cW*0.8,gap:H*0.010,caps:capsFor(F3,false)},
      {str:[f.producer,alc].filter(Boolean).join('   \u00b7   '),size:H*0.023,f:F3?F3[0]:(F.ebg),w:F3?F3[1]:(400),fill:SUB,maxW:cW*0.8,gap:0,caps:capsFor(F3,false)}],cx,SM,'c').svg;
    body+=sImageBox('contemporary',BOX,W,H);
  }else if(variant===2){ // Juan Campinún board: crest, copperplate script, RIOJA caps
    body+=sImageBox('contemporary',BOX,W,H);
    body+=sFlow([
      {str:f.wine,size:H*0.14,f:HP?HP[0]:(F.monteCarlo),w:HP?HP[1]:(400),fill:INK,maxW:cW*0.92,gap:H*0.026,pre:H*0.285,caps:capsFor(HP,false)},
      {str:f.producer,size:H*0.028,f:F3?F3[0]:(SF.cinzel),w:F3?F3[1]:(500),fill:SUB,caps:capsFor(F3,true),tr:0.3,maxW:cW*0.72,gap:H*0.014},
      {str:f.appellation,size:H*0.034,f:F2?F2[0]:(F.ebg),w:F2?F2[1]:(500),fill:SUB,ital:true,maxW:cW*0.6,gap:H*0.014,caps:capsFor(F2,false)},
      {str:[f.grape,f.classification].filter(Boolean).join(' \u00b7 '),size:H*0.026,f:F2?F2[0]:(SF.cinzel),w:F2?F2[1]:(500),fill:SUB,tr:0.08,maxW:cW*0.85,gap:H*0.014,caps:capsFor(F2,false)},
      {str:f.region,size:H*0.035,f:F3?F3[0]:(SF.cinzel),w:F3?F3[1]:(500),fill:INK,caps:capsFor(F3,true),tr:0.14,maxW:cW*0.7,gap:0}],cx,SM,'c').svg;
    body+=stackUp([
      {str:[f.vintage,f.special].filter(Boolean).join(' \u00b7 '),size:H*0.030,f:F3?F3[0]:(SF.cinzel),w:F3?F3[1]:(500),fill:gold,caps:capsFor(F3,false)},
      {str:[desc,alc].filter(Boolean).join(' / '),size:H*0.022,f:F3?F3[0]:(F.ebg),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)}],cx,H-SM-2,H*0.008,'c',cW*0.7).svg;
  }else if(variant===3){ // 1780 board: giant gold numerals, tiny producer + mark above
    body+=sBlock(f.producer,{x:cx,top:SM,maxW:cW*0.7,size:H*0.027,min:H*0.02,f:F3?F3[0]:(SF.cinzel),w:F3?F3[1]:(500),fill:SUB,a:'c',caps:true,tr:0.3}).svg;
    body+=sImageBox('contemporary',BOX,W,H);
    body+=sFlow([
      {str:f.vintage,size:H*0.23,f:F3?F3[0]:(SF.cinzel),w:F3?F3[1]:(600),fill:gold,maxW:cW*0.8,gap:H*0.02,pre:H*0.245,caps:capsFor(F3,false)},
      {str:f.wine,size:H*0.052,f:HP?HP[0]:(SF.cinzel),w:HP?HP[1]:(600),fill:INK,caps:capsFor(HP,true),tr:0.12,maxW:cW*0.9,gap:H*0.016,},
      {str:f.appellation,size:H*0.033,f:F2?F2[0]:(F.ebg),w:F2?F2[1]:(500),fill:SUB,ital:true,maxW:cW*0.6,gap:0,caps:capsFor(F2,false)}],cx,SM,'c').svg;
    body+=stackUp([
      {str:[f.grape,f.classification].filter(Boolean).join(' \u00b7 '),size:H*0.025,f:F2?F2[0]:(SF.cinzel),w:F2?F2[1]:(500),fill:SUB,tr:0.06,caps:capsFor(F2,false)},
      {str:reg,size:H*0.024,f:F3?F3[0]:(F.ebg),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)},
      {str:[desc,alc].filter(Boolean).join(' / '),size:H*0.021,f:F3?F3[0]:(F.ebg),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)}],cx,H-SM-2,H*0.008,'c',cW*0.8).svg;
  }else{ // Implicit board: gold mark centre, extreme tracked caps beneath
    body+=sImageBox('contemporary',BOX,W,H);
    body+=sFlow([
      {str:f.wine,size:H*0.058,f:HP?HP[0]:(SF.cinzel),w:HP?HP[1]:(600),fill:INK,caps:capsFor(HP,true),tr:0.44,maxW:cW*0.96,gap:H*0.02,pre:H*0.545},
      {str:f.producer,size:H*0.026,f:F3?F3[0]:(SF.cinzel),w:F3?F3[1]:(500),fill:SUB,caps:capsFor(F3,true),tr:0.5,maxW:cW*0.8,gap:0}],cx,SM,'c').svg;
    body+=stackUp([
      {str:[f.appellation,f.vintage].filter(Boolean).join(' \u00b7 '),size:H*0.026,f:F2?F2[0]:(F.ebg),w:F2?F2[1]:(500),fill:SUB,tr:0,caps:capsFor(F2,false)},
      {str:[f.grape,f.classification,reg].filter(Boolean).join(' \u00b7 '),size:H*0.022,f:F2?F2[0]:(F.ebg),w:F2?F2[1]:(400),fill:SUB,caps:capsFor(F2,false)},
      {str:[desc,alc].filter(Boolean).join(' / '),size:H*0.021,f:F3?F3[0]:(F.ebg),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)}],cx,H-SM-2,H*0.008,'c',cW*0.85).svg;
  }
  return sWrap(W,H,twMM,thMM,BG,body,defs);
}

/* ---- 5) MINIMALIST — reference-first: vast emptiness, one tiny mark,
   letterspaced type, handwritten scrawl hero, mark-at-the-foot comp. ---- */
function styleMinimal(f,W,H,seed,twMM,thMM,fv){
  const MSCH=[{bg:'#FBFBF9',ink:'#231F20',sub:'#8A8780',panel:null},
    {bg:'#F4EFE4',ink:'#2A2722',sub:'#8F887B',panel:null},
    {bg:'#FFFFFF',ink:'#2B5BB7',sub:'#7C8797',panel:null},
    {bg:'#E2574C',ink:'#FBF6EA',sub:'#F8E8DF',panel:true},
    // bold text-only panels for WHITE products (owner 2026-08-17): deep
    // green and deep blue grounds, light warm ink — rare by pool weight
    {bg:'#2F5D3A',ink:'#F4EFE0',sub:'#D8E0CE',panel:true},
    {bg:'#2B4C7A',ink:'#F4EFE0',sub:'#CFD8E2',panel:true}];
  const MS=palPick('contemporary','minimalist',seed,MSCH,function(p){return {bg:p.bg,ink:p.ink,sub:p.sub,panel:null};});
  const INK=MS.ink, SUB=MS.sub, cx=W/2, cW=W-2*SM;
  let variant=(fv!=null)?fv:pickVariant('minimalist',seed,6);
  if(MS.panel)variant=3; // bold colour panel is text-only by design (light-ground rule)
  const HP=heroPick(seed,'minimalist',variant,'contemporary');
  const F2=rolePick(seed,'minimalist','contemporary','secondary'),F3=rolePick(seed,'minimalist','contemporary','small');
  const BOX=STYLE_BOXES['minimalist'][variant];
  const line1=[f.grape,f.classification,f.region].filter(Boolean).join(' / ');
  const line2=[f.special,f.vintage,f.alc].filter(Boolean).join(' / ');
  let body='';
  if(variant===0||variant===3){ // centred: tiny mark high, airy stack (dot/blob boards + colour panel)
    if(!MS.panel) body+=sImageBox('contemporary',BOX,W,H);
    body+=sFlow([
      {str:f.producer,size:H*0.030,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(300),fill:SUB,caps:capsFor(F3,true),tr:0.45,maxW:cW*0.7,gap:H*0.02,pre:H*0.02},
      {str:f.wine,size:H*0.085,f:HP?HP[0]:(SF.archivo),w:HP?HP[1]:(MS.panel?600:300),fill:INK,caps:capsFor(HP,true),tr:0.28,maxW:cW*0.94,gap:H*0.018,pre:H*0.42},
      {str:f.appellation,size:H*0.04,f:F2?F2[0]:(SF.archivo),w:F2?F2[1]:(400),fill:SUB,maxW:cW*0.6,gap:0,caps:capsFor(F2,false)}],cx,SM,'c').svg;
    body+=stackUp([
      {str:line1,size:H*0.026,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)},
      {str:line2,size:H*0.026,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)}],cx,H-SM-4,H*0.008,'c',cW*0.8).svg;
  }else if(variant===1){ // left column, mark right (Society / blue-square boards)
    body+=sImageBox('contemporary',BOX,W,H);
    body+=sFlow([
      {str:f.producer,size:H*0.03,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(300),fill:SUB,caps:capsFor(F3,true),tr:0.4,maxW:W*0.44,gap:H*0.05,pre:H*0.04},
      {str:f.wine,size:H*0.07,f:HP?HP[0]:(SF.archivo),w:HP?HP[1]:(400),fill:INK,caps:capsFor(HP,true),tr:0.2,lines:2,lh:1.15,maxW:W*0.46,gap:H*0.02},
      {str:f.appellation,size:H*0.036,f:F2?F2[0]:(SF.archivo),w:F2?F2[1]:(400),fill:SUB,maxW:W*0.44,gap:0,caps:capsFor(F2,false)}],SM,SM,'l').svg;
    body+=stackUp([
      {str:line1,size:H*0.025,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)},
      {str:line2,size:H*0.025,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)}],SM,H-SM-4,H*0.008,'l',cW*0.9).svg;
  }else if(variant===2){ // hero IS the mark: oversized single word, nothing else near it
    body+=sImageBox('contemporary',BOX,W,H);
    body+=sFlow([
      {str:f.producer,size:H*0.028,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(300),fill:SUB,caps:capsFor(F3,true),tr:0.45,maxW:cW*0.7,gap:H*0.05,pre:H*0.05},
      {str:f.wine,size:H*0.12,f:HP?HP[0]:(SF.archivo),w:HP?HP[1]:(300),fill:INK,caps:capsFor(HP,true),tr:0.12,maxW:cW*0.96,gap:H*0.02},
      {str:f.appellation,size:H*0.038,f:F2?F2[0]:(SF.archivo),w:F2?F2[1]:(400),fill:SUB,maxW:cW*0.6,gap:0,caps:capsFor(F2,false)}],cx,SM,'c').svg;
    body+=stackUp([
      {str:line1,size:H*0.025,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)},
      {str:line2,size:H*0.025,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)}],cx,H-SM-4,H*0.008,'c',cW*0.85).svg;
  }else if(variant===4){ // handwritten scrawl hero across the silence (Valdez board)
    body+=sBlock(f.producer,{x:W-SM,top:SM,maxW:W*0.5,size:H*0.028,min:H*0.02,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(300),fill:SUB,a:'r',caps:true,tr:0.4}).svg;
    body+=sFlow([
      {str:f.wine,size:H*0.16,f:HP?HP[0]:(SF.caveat),w:HP?HP[1]:(700),fill:INK,maxW:cW*0.94,gap:H*0.02,pre:H*0.34,caps:capsFor(HP,false)},
      {str:f.appellation,size:H*0.036,f:F2?F2[0]:(SF.archivo),w:F2?F2[1]:(400),fill:SUB,maxW:cW*0.6,gap:0,caps:capsFor(F2,false)}],cx,SM,'c').svg;
    body+=stackUp([
      {str:line1,size:H*0.025,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)},
      {str:line2,size:H*0.025,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(400),fill:SUB,caps:capsFor(F3,false)}],W-SM,H-SM-4,H*0.008,'r',cW*0.85).svg;
  }else{ // caps corner top-left, mark at the foot (mountain boards)
    body+=sFlow([
      {str:f.producer,size:H*0.028,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(300),fill:SUB,caps:capsFor(F3,true),tr:0.4,maxW:W*0.6,gap:H*0.022,pre:H*0.02},
      {str:f.wine,size:H*0.052,f:HP?HP[0]:(SF.archivo),w:HP?HP[1]:(500),fill:INK,caps:capsFor(HP,true),tr:0.22,lines:2,lh:1.12,maxW:W*0.6,gap:H*0.016},
      {str:f.appellation,size:H*0.034,f:F2?F2[0]:(SF.archivo),w:F2?F2[1]:(400),fill:SUB,maxW:W*0.6,gap:H*0.018,caps:capsFor(F2,false)},
      {str:line1,size:H*0.025,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(400),fill:SUB,maxW:W*0.6,gap:H*0.008,caps:capsFor(F3,false)},
      {str:line2,size:H*0.025,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(400),fill:SUB,maxW:W*0.6,gap:0,caps:capsFor(F3,false)}],SM,SM,'l').svg;
    body+=sImageBox('contemporary',BOX,W,H);
  }
  return sWrap(W,H,twMM,thMM,MS.bg,body);
}

/* ---- 6) ARTISTIC / PUNK — reference-first: naive art big and proud,
   handwritten titles, rotated riso side caps, arched hand-lettering,
   marker hand + heavy grotesque on light riso grounds. ---- */
/* ---- 6) ARTISTIC / PUNK — reference-first: naive art big and proud,
   handwritten titles, rotated riso side caps, arched hand-lettering,
   marker hand + heavy grotesque on light riso grounds. ---- */
function stylePunk(f,W,H,seed,twMM,thMM){
  // house rule: no dark grounds under the multiply-blended artwork
  const APAL=[['#F3EFE4','#171512','#C22A1C'],['#DA3D1C','#F8EFE0','#171512'],['#F2BFC9','#171512','#C22A1C'],['#EFE9DA','#171512','#E8542F']];
  const [BG,INK,AC]=palPick('punk','punk',seed,APAL,function(p){return [p.bg,p.ink,p.acc||p.sub];});
  const cx=W/2, cW=W-2*SM;
  const variant=pickV('punk',seed,STYLE_BOXES.punk.length);
  const HP=heroPick(seed,'punk',variant,'punk');
  const F2=rolePick(seed,'punk','punk','secondary'),F3=rolePick(seed,'punk','punk','small');
  const BOX=STYLE_BOXES['punk'][variant];
  const alc=f.alc;
  const desc=(f.descriptor||'').replace(/,/g,'');
  const reg=[f.region,f.special].filter(Boolean).join(' \u00b7 ');
  let body='';
  if(variant===0){ // naive drawing centre stage, marker name below (wine-club boards)
    body+=sImageBox('punk',BOX,W,H);
    const st=stackUp([
      {str:[f.appellation,f.vintage].filter(Boolean).join(' \u00b7 '),size:H*0.042,f:F2?F2[0]:(SF.archivo),w:F2?F2[1]:(700),fill:AC,caps:capsFor(F2,true),tr:0.04},
      {str:[f.grape,f.classification].filter(Boolean).join(' / '),size:H*0.028,f:F2?F2[0]:(SF.archivo),w:F2?F2[1]:(500),fill:INK,caps:capsFor(F2,false)},
      {str:f.producer,size:H*0.031,f:F3?F3[0]:(SF.marker),w:F3?F3[1]:(400),fill:AC,caps:capsFor(F3,false)},
      {str:[reg,desc,alc].filter(Boolean).join(' / '),size:H*0.022,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(500),fill:INK,caps:capsFor(F3,false)}],cx,H-SM-4,H*0.008,'c',cW*0.88);
    body+=st.svg;
    body+=fitHero(f.wine,cx,BOX[3]*H+MINGAP,st.topY,{size:H*0.105,maxW:cW*0.92,f:HP?HP[0]:(SF.marker),w:HP?HP[1]:(400),fill:INK,caps:capsFor(HP,false)}).svg;
  }else if(variant===1){ // poster type: giant condensed caps stacked (RAW POWER board)
    body+=sImageBox('punk',BOX,W,H);
    body+=sFlow([
      {str:f.producer,size:H*0.045,f:F3?F3[0]:(SF.marker),w:F3?F3[1]:(400),fill:INK,maxW:W*0.5,gap:H*0.045,pre:H*0.04,caps:capsFor(F3,false)},
      {str:f.wine,size:H*0.17,f:HP?HP[0]:(SF.anton),w:HP?HP[1]:(400),fill:INK,caps:capsFor(HP,true),lines:2,lh:0.95,maxW:W*0.52,gap:H*0.025},
      {str:f.appellation,size:H*0.05,f:F2?F2[0]:(SF.marker),w:F2?F2[1]:(400),fill:AC,maxW:W*0.5,gap:H*0.02,caps:capsFor(F2,false)},
      {str:[f.grape,f.classification].filter(Boolean).join(' / '),size:H*0.03,f:F2?F2[0]:(SF.archivo),w:F2?F2[1]:(600),fill:INK,maxW:W*0.5,gap:H*0.012,caps:capsFor(F2,false)},
      {str:[reg,f.vintage].filter(Boolean).join(' \u00b7 '),size:H*0.028,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(500),fill:INK,maxW:W*0.5,gap:0,caps:capsFor(F3,false)}],SM,SM,'l').svg;
    /* the legal line must NEVER lose words to a narrow column (hard rule:
       ".. Alc. by Vol. / N mL" complete) — the area under the figure is free,
       so this line alone may run wider than the type column above it */
    body+=sBlock([desc,alc].filter(Boolean).join(' / '),{x:SM,top:H-SM-4,fromBottom:true,maxW:W*0.62,size:H*0.024,min:H*0.02,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(500),fill:INK,a:'l',caps:capsFor(F3,false)}).svg;
  }else if(variant===2){ // handwritten title corner, figure right (Say When board)
    body+=sBlock(f.wine,{x:SM,top:SM,maxW:cW*0.9,size:H*0.08,min:H*0.05,f:HP?HP[0]:(SF.caveat),w:HP?HP[1]:(700),fill:AC,a:'l',caps:capsFor(HP,true)}).svg;
    body+=sImageBox('punk',BOX,W,H);
    body+=sFlow([
      {str:f.appellation,size:H*0.045,f:F2?F2[0]:(SF.marker),w:F2?F2[1]:(400),fill:INK,maxW:W*0.26,gap:H*0.02,pre:H*0.16,caps:capsFor(F2,false)},
      {str:f.grape,size:H*0.03,f:F2?F2[0]:(SF.archivo),w:F2?F2[1]:(500),fill:INK,maxW:W*0.26,gap:H*0.012,caps:capsFor(F2,false)},
      {str:f.classification,size:H*0.028,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(500),fill:INK,maxW:W*0.26,gap:H*0.012,caps:capsFor(F3,false)},
      {str:f.vintage,size:H*0.05,f:F3?F3[0]:(SF.marker),w:F3?F3[1]:(400),fill:INK,maxW:W*0.26,gap:0,caps:capsFor(F3,false)}],SM,SM,'l').svg;
    body+=stackUp([
      {str:f.producer,size:H*0.032,f:F3?F3[0]:(SF.marker),w:F3?F3[1]:(400),fill:INK,caps:capsFor(F3,false)},
      {str:reg,size:H*0.024,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(500),fill:INK,caps:capsFor(F3,false)},
      {str:[desc,alc].filter(Boolean).join(' / '),size:H*0.022,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(500),fill:INK,maxW:W*0.62,caps:capsFor(F3,false)}],SM,H-SM-2,H*0.008,'l',W*0.4).svg;
  }else if(variant===3){ // rotated side caps, riso figure centre (PET-NAT / SUR512 boards)
    body+=sRot(f.producer,SM+Math.max(H*0.034,MIN7)*1.1,H,{size:H*0.034,f:F3?F3[0]:(SF.anton),w:F3?F3[1]:(400),fill:AC,tr:0.14,caps:true});
    body+=sImageBox('punk',BOX,W,H);
    const st=stackUp([
      {str:[f.appellation,f.vintage].filter(Boolean).join(' \u00b7 '),size:H*0.04,f:F2?F2[0]:(SF.archivo),w:F2?F2[1]:(700),fill:AC,caps:capsFor(F2,true),tr:0.04},
      {str:[f.grape,f.classification].filter(Boolean).join(' / '),size:H*0.026,f:F2?F2[0]:(SF.archivo),w:F2?F2[1]:(500),fill:INK,caps:capsFor(F2,false)},
      {str:[reg,desc,alc].filter(Boolean).join(' / '),size:H*0.022,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(500),fill:INK,caps:capsFor(F3,false)}],cx+H*0.02,H-SM-4,H*0.008,'c',cW*0.8);
    body+=st.svg;
    body+=fitHero(f.wine,cx+H*0.02,BOX[3]*H+MINGAP,st.topY,{size:H*0.10,maxW:cW*0.84,f:HP?HP[0]:(SF.marker),w:HP?HP[1]:(400),fill:INK,caps:capsFor(HP,false)}).svg;
  }else if(variant===4){ // arched hand-lettering ring over the figure (Silvaner board)
    (function(){
      let asz=H*0.055; const R=W*0.40;
      const af=F2?F2[0]:(SF.caveat), aww=F2?F2[1]:(600);
      const aw=measure(String(f.producer||''),asz,af,aww,false,asz*0.06);
      if(aw>R*1.55)asz=Math.max(MIN7,asz*R*1.55/aw);
      body+=sArcText(f.producer,cx,SM+asz*0.9,R,{f:af,w:aww,size:asz,fill:AC,tr:0.06});
    })();
    body+=sImageBox('punk',BOX,W,H);
    /* everything under the figure stacks UP from the foot, and the hero
       shrink-fits between the artwork box and that stack \u2014 the old blind
       down-flow crowded the bottom lines into each other on full briefs */
    const st4=stackUp([
      {str:[f.appellation,f.vintage].filter(Boolean).join(' \u00b7 '),size:H*0.045,f:F2?F2[0]:(SF.caveat),w:F2?F2[1]:(600),fill:AC,caps:capsFor(F2,false)},
      {str:[f.grape,f.classification].filter(Boolean).join(' / '),size:H*0.028,f:F2?F2[0]:(SF.archivo),w:F2?F2[1]:(500),fill:INK,caps:capsFor(F2,false)},
      {str:reg,size:H*0.024,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(500),fill:INK,caps:capsFor(F3,false)},
      {str:[desc,alc].filter(Boolean).join(' / '),size:H*0.022,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(500),fill:INK,caps:capsFor(F3,false)}],cx,H-SM-2,H*0.008,'c',cW*0.85);
    body+=st4.svg;
    body+=fitHero(f.wine,cx,BOX[3]*H+MINGAP,st4.topY,{size:H*0.10,maxW:cW*0.92,f:HP?HP[0]:(SF.marker),w:HP?HP[1]:(400),fill:INK,caps:capsFor(HP,false)}).svg;
  }else{ // riso band top, loud knockout hero below (poster boards)
    body+=sImageBox('punk',BOX,W,H);
    const st=stackUp([
      {str:[f.appellation,f.vintage].filter(Boolean).join('  \u00b7  '),size:H*0.042,f:F2?F2[0]:(SF.marker),w:F2?F2[1]:(400),fill:AC,caps:capsFor(F2,false)},
      {str:[f.grape,f.classification,reg].filter(Boolean).join(' / '),size:H*0.026,f:F2?F2[0]:(SF.archivo),w:F2?F2[1]:(500),fill:INK,caps:capsFor(F2,false)},
      {str:[f.producer,desc,alc].filter(Boolean).join(' \u00b7 '),size:H*0.024,f:F3?F3[0]:(SF.archivo),w:F3?F3[1]:(500),fill:INK,caps:capsFor(F3,false)}],cx,H-SM-4,H*0.008,'c',cW*0.9);
    body+=st.svg;
    body+=fitHero(f.wine,cx,BOX[3]*H+MINGAP,st.topY,{size:H*0.13,maxW:cW*0.94,f:HP?HP[0]:(SF.anton),w:HP?HP[1]:(400),fill:INK,caps:capsFor(HP,true)}).svg;

  }
  return sWrap(W,H,twMM,thMM,BG,body);
}

/* Merged Contemporary: one seeded (and admin-weighted) pick across the four
   internal pools; the chosen pool renders with its own palette/typography. */
function styleContemporary(f,W,H,seed,twMM,thMM){
  const cv=cVariantFor(seed);
  if(cv.key==='flora')return styleFlora(f,W,H,seed,twMM,thMM,cv.local);
  if(cv.key==='premium')return stylePremium(f,W,H,seed,twMM,thMM,cv.local);
  if(cv.key==='minimalist')return styleMinimal(f,W,H,seed,twMM,thMM,cv.local);
  return styleContempX(f,W,H,seed,twMM,thMM,cv.local);
}
/* INTEGRATED COMP (experimental preview, owner 2026-08-20, branch
   POPIKA_IMage&layout_relation): the first layout designed around the
   IMAGE instead of beside it. The artwork runs full-bleed across the
   lower field; the top band is the reserved quiet zone the composition
   contract asks the image model to keep airy; the name is set INTO that
   band; the small print sits ON the artwork with a white halo so it
   reads on any ink. Reachable ONLY via the __integrated hint flag (Proof
   Bench preview) — customers, goldens and parity never see it until the
   owner blesses the direction. */
function styleIntegrated(f,W,H,seed,twMM,thMM,styleKey){
  const FALLBACK=[{bg:'#FFFFFF',ink:'#221E1A',sub:'#7A7166',acc:'#6E2B25'}];
  const [BG,INK,SUB,AC]=palPick(styleKey,styleKey,seed,FALLBACK,function(p){return [p.bg,p.ink,p.sub||p.ink,p.acc||p.sub||p.ink];});
  const cx=W/2,cW=W-2*SM;
  const HP=heroPick(seed,styleKey,0,styleKey);
  const F2=rolePick(seed,styleKey,styleKey,'secondary'),F3=rolePick(seed,styleKey,styleKey,'small');
  const alc=f.alc, desc=(f.descriptor||'').replace(/,/g,'');
  const reg=[f.region,f.special].filter(Boolean).join(' \u00b7 ');
  let body='';
  /* full-bleed field: subject lives low, the top band stays airy */
  body+=sImageBox(styleKey,[0.03,0.22,0.97,1.00],W,H);
  /* the reserved band: producer whisper, then the name, then the wine line */
  const bandBot=0.215*H;
  const pr=sBlock(f.producer,{x:cx,top:SM,maxW:cW*0.8,size:H*0.024,min:MIN7,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(500),fill:SUB,a:'c',caps:capsFor(F3,true),tr:0.3});
  body+=pr.svg;
  const heroTop=(pr.nlines?pr.bottom+MINGAP:SM);
  const hero=fitHero(f.wine,cx,heroTop,bandBot-H*0.045,{size:H*0.095,maxW:cW*0.94,f:HP?HP[0]:(SF.fraunces),w:HP?HP[1]:(600),fill:INK,caps:capsFor(HP,true)});
  body+=hero.svg;
  body+=sBlock([f.appellation,f.vintage].filter(Boolean).join(' \u00b7 '),{x:cx,top:hero.bottom+MINGAP,maxW:cW*0.8,size:H*0.03,min:MIN7,f:F2?F2[0]:(SF.ebg),w:F2?F2[1]:(500),fill:AC,a:'c',caps:capsFor(F2,true),tr:0.12}).svg;
  /* small print lives ON the artwork, halo-guarded */
  body+=stackUp([
    {str:[f.grape,f.classification].filter(Boolean).join(' / '),size:H*0.026,f:F2?F2[0]:(SF.jost),w:F2?F2[1]:(500),fill:INK,halo:true,caps:capsFor(F2,false)},
    {str:[reg,desc,alc].filter(Boolean).join(' / '),size:H*0.022,f:F3?F3[0]:(SF.jost),w:F3?F3[1]:(400),fill:INK,halo:true,caps:capsFor(F3,false)}],SM,H-SM-2,H*0.008,'l',cW*0.72).svg;
  return sWrap(W,H,twMM,thMM,BG,body);
}
/* FITTED DREAM RENDER (owner GO 2026-08-25): the closed loop. Render,
   compare every placed text block against its measured target from the
   dream, nudge position (and size where the width-fit allows), render
   again — then report an honest fidelity score instead of hoping. */
function renderDreamFitted(spec,d,opts,artSrc,artAlign,artMode,artInk){
  const els=(spec&&Array.isArray(spec.elements))?spec.elements:[];
  let svg='', placed=[];
  for(let pass=0;pass<3;pass++){
    PLACED=[];
    svg=renderDreamSpec(spec,d,opts,artSrc,artAlign,artMode,artInk);
    placed=PLACED; PLACED=null;
    if(pass===2)break;
    let adjusted=false;
    for(const p of placed){
      const e=els.find(x=>x&&x.role===p.role); if(!e||!e.snapped)continue;
      const dy=p.ty-p.y;                       // fraction of label height
      if(Math.abs(dy)>0.004){e.__dy=(+e.__dy||0)+dy*(opts&&opts.heightMM?opts.heightMM*10:800);adjusted=true;}
      const hr=p.th>0?p.h/p.th:1;              // placed vs target height
      if(hr>1.12||hr<0.88){e.__ds=Math.min(1.6,Math.max(0.5,(+e.__ds||1)/hr));adjusted=true;}
    }
    /* COLLISIONS AND NEAR-TOUCHES ARE RESOLVED, NOT SHIPPED (owner
       2026-08-26): vertically adjacent blocks sharing horizontal span keep
       a minimum breathing gap; the lower block yields, cascading. */
    const Hpx=(opts&&opts.heightMM?opts.heightMM*10:800);
    const MINGAP_F=0.008;
    const byY=[...placed].sort((a,b2)=>a.y-b2.y);
    for(let i=0;i<byY.length;i++)for(let j=i+1;j<byY.length;j++){
      const a=byY[i],b2=byY[j];
      const ox=Math.min(a.x+a.w,b2.x+b2.w)-Math.max(a.x,b2.x);
      if(ox<=0.01)continue;
      const gap=b2.y-(a.y+a.h);
      if(gap<MINGAP_F){
        const e2=els.find(x=>x&&x.role===b2.role);
        if(e2){e2.__dy=(+e2.__dy||0)+(MINGAP_F-gap)*Hpx;adjusted=true;}
      }
    }
    if(!adjusted)break;
  }
  /* fidelity: mean deviation of placed vs target, position + size */
  let err=0,n=0;
  for(const p of placed){
    if(!(p.tw>0&&p.th>0))continue;
    const exy=Math.hypot(p.x+p.w/2-(p.tx+p.tw/2),p.y+p.h/2-(p.ty+p.th/2));
    const eh=p.th>0?Math.min(1,Math.abs(p.h-p.th)/p.th):0;
    err+=Math.min(1,exy*3+eh*0.5);n++;
  }
  /* residual overlaps are a fidelity failure, not a detail */
  let overlaps=0;
  for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++){
    const a=placed[i],b2=placed[j];
    if(Math.min(a.x+a.w,b2.x+b2.w)-Math.max(a.x,b2.x)>0.01&&
       Math.min(a.y+a.h,b2.y+b2.h)-Math.max(a.y,b2.y)>0.004)overlaps++;
  }
  /* art swallowing text is the worst failure — punish it hardest */
  let artOver=0;
  if(LAST_ART_RECT){
    const Wpx=(opts&&opts.widthMM?opts.widthMM*10:1100), Hpx2=(opts&&opts.heightMM?opts.heightMM*10:800);
    const ar={x:LAST_ART_RECT.x/Wpx,y:LAST_ART_RECT.y/Hpx2,w:LAST_ART_RECT.w/Wpx,h:LAST_ART_RECT.h/Hpx2};
    for(const p of placed){
      const e=els.find(x=>x&&x.role===p.role);
      const dreamOverlap=e&&e.box&&spec&&spec.artwork&&spec.artwork.box&&(()=>{const b3=e.box,a3=spec.artwork.box;
        const ix=Math.min(b3.x+b3.w,a3.x+a3.w)-Math.max(b3.x,a3.x);
        const iy=Math.min(b3.y+b3.h,a3.y+a3.h)-Math.max(b3.y,a3.y);
        return Math.max(0,ix)*Math.max(0,iy)>=0.25*b3.w*b3.h;})();
      if(dreamOverlap)continue;
      if(p.x<ar.x+ar.w&&p.x+p.w>ar.x&&p.y<ar.y+ar.h&&p.y+p.h>ar.y)artOver++;
    }
  }
  const fidelity=n?Math.max(0,Math.round(100*(1-err/n))-overlaps*15-artOver*20):null;
  return {svg,fidelity,placed,overlaps,artOver};
}
const STYLE_LIST=[
  {key:'traditional',name:'Traditional'},
  {key:'contemporary',name:'Contemporary'},
  {key:'punk',name:'Punk'}
];
/* APPROVED LOOKS (owner 2026-08-16): a look = the exact combination the
   admin approved in the Layout playground — its render seed plus the hint
   arrays (palettes / role fonts) that were active at approval time. When a
   style carries hints.looks, customers get ONLY those exact combinations:
   one look is a seeded pick per session, and the style renders with the
   look's own seed under its FROZEN hint arrays — reproducing the approved
   card byte-for-byte no matter how the pools or boards change later.
   Without looks the previous behaviour (weights / soft mode) stands, and
   without hints at all the path is byte-identical (goldens). */
/* FORCED_V pins the comp index while a look renders: pool sizes may GROW
   after a look was approved (board→comp builds), which would remap the
   look's seed onto a different comp — the stored variant wins instead. */
let FORCED_V=null;
function pickV(key,seed,n){
  if(FORCED_V!=null&&FORCED_V>=0&&FORCED_V<n)return FORCED_V;
  return pickVariant(key,seed,n);
}
/* SESSION VARIETY (owner 2026-08-19): rendering costs nothing, so a session
   must walk the WHOLE approved pool before any look repeats — the seeded
   pick looped fast (random draws collide). A per-style shuffle bag deals
   looks like a deck of cards; each render SEED keeps its deal, because the
   post-generation repaint re-renders the same seed and the shown set must
   not reshuffle under the customer. Test rigs (__SEED0__) keep the old
   deterministic pick so parity/e2e assertions stay reproducible. The
   no-hints path never reaches this (goldens untouched). */
const LOOK_BAG={}, LOOK_DEAL={};
function lookIndexFor(key,seed,looks){
  const n=looks.length;
  if(n<=1)return 0;
  if(typeof window!=='undefined'&&typeof window.__SEED0__==='number')
    return sPick(seed,(STYLE_SALT[key]||0)*7+9,n);
  const deals=LOOK_DEAL[key]||(LOOK_DEAL[key]={});
  if(deals[seed]!=null)return deals[seed];
  let bag=LOOK_BAG[key];
  if(!bag||bag.n!==n)bag=LOOK_BAG[key]={n:n,q:[],last:-1};
  if(!bag.q.length){
    /* refill: shuffle WITHIN each comp variant, shuffle the variant order,
       then interleave — the first deals cover every distinct ARRANGEMENT
       before any repeats (approvals cluster on few comps; a plain shuffle
       could open with three near-identical cards). */
    const shuf=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const t=a[i];a[i]=a[j];a[j]=t;}return a;};
    const gm={};
    for(let i=0;i<n;i++){const v=(looks[i]&&looks[i].variant)|0;(gm[v]=gm[v]||[]).push(i);}
    const groups=shuf(Object.keys(gm).map(function(v){return shuf(gm[v]);}));
    const q=[];
    for(let r=0;q.length<n;r++)for(const g of groups){if(g[r]!=null)q.push(g[r]);}
    if(q[0]===bag.last)q.push(q.shift()); // no immediate repeat across refills
    bag.q=q;
  }
  const idx=bag.q.shift();bag.last=idx;deals[seed]=idx;
  return idx;
}
function withLook(key,seed,fn){
  const h=STYLE_HINTS[key], looks=h&&h.looks;
  if(!Array.isArray(looks)||!looks.length)return fn(seed);
  const L=looks[lookIndexFor(key,seed,looks)]||looks[0];
  const frozen={};
  ['palettes','heroFonts','secondaryFonts','smallFonts'].forEach(function(k2){
    if(Array.isArray(L[k2])&&L[k2].length)frozen[k2]=L[k2];
  });
  const prev=STYLE_HINTS[key];
  /* artwork-derived colours pierce the look's frozen outfit (owner
     2026-08-18): arrangement + fonts stay frozen, colours follow the art.
     The list is ROTATED by the outer roll seed (owner 2026-08-19: grounds
     looped) — the look renders under its own frozen seed, so without this
     a look would keep one ground all session; rotation keeps the white-
     to-tint weighting intact and stays stable across same-seed repaints. */
  if(prev&&Array.isArray(prev.imgPalettes)&&prev.imgPalettes.length){
    const P=prev.imgPalettes, off=sPick(seed,31,P.length);
    frozen.imgPalettes=P.slice(off).concat(P.slice(0,off));
  }
  if(prev&&prev.imgAnalysis)frozen.imgAnalysis=prev.imgAnalysis;
  STYLE_HINTS[key]=frozen;
  FORCED_V=isFinite(+L.variant)?+L.variant:null;
  try{return fn(+L.seed||0);}finally{STYLE_HINTS[key]=prev;FORCED_V=null;}
}
/* DREAM SPEC RENDERER (owner GO 2026-08-25, POPIKA_ALTERNATIVE_ENGINE).
   Rebuilds a transcribed dream layout as REAL vector type: the spec brings
   geometry, fonts, colours; the BRIEF brings every word (typos impossible);
   this renderer brings the law — 5mm text margins, 7pt floor (sBlock),
   contrast guard, and a complete legal line even when the dream forgot it.
   Never reached by any normal render path (goldens/parity untouched). */
let PLACED=null, LAST_ART_RECT=null;
function renderDreamSpec(spec,d,opts,artSrc,artAlign,artMode,artInk){
  LAST_ART_RECT=null;
  opts=opts||{};
  const twMM=Math.max(30,(+opts.widthMM||110)), thMM=Math.max(30,(+opts.heightMM||80));
  const W=twMM*10, H=thMM*10, f=sFields(d);
  const g0=hslOf(spec&&spec.ground)?String(spec.ground).toUpperCase():'#FFFFFF';
  const gc=hslOf(g0);
  /* text recipes MATCH THE DREAM PROMPT exactly (owner 2026-08-28: the
     replica said "Dry Red" where the dream said "Dry Red Wine", and
     "special" printed twice) — legal uses the server's own formula, and
     region only absorbs special when the dream gave it no line of its own */
  const hasSpecial=(spec&&spec.elements||[]).some(e=>e&&e.role==='special'&&e.box);
  const ROLE_TEXT={
    wine:f.wine, producer:f.producer, appellation:f.appellation, grape:f.grape,
    vintage:f.vintage, region:hasSpecial?f.region:[f.region,f.special].filter(Boolean).join(' \u00b7 '),
    classification:f.classification, special:f.special,
    legal:[[d.sweetness,d.wineColorName,'Wine'].map(x=>String(x==null?'':x).trim()).filter(Boolean).join(' '),f.alc].filter(Boolean).join(' / ')
  };
  /* v2 (owner 2026-08-25): REPLICATE the dream — colours verbatim, no
     contrast guard, no palette law. Only 7pt, 5mm text margins and the
     legal line survive. */
  const guard=(hex)=>hslOf(hex)?String(hex):'#1E1B18';
  let body='';
  /* FULL-BLEED mode (owner 2026-08-25): the illustration IS the label —
     it covers everything, opaque, edge to edge; text is set into it. */
  if(artSrc&&(artMode==='full'||artMode==='canvas')){
    /* canvas mode (owner 2026-08-31): the erased dream IS the label — drawn
       aspect-exact so the measured boxes land on the same pixels; text over
       imagery is the dream's own choice, so no art-overlap penalty */
    const par=artMode==='canvas'?'none':'xMidYMid slice';
    body+=`<image x="0" y="0" width="${W.toFixed(1)}" height="${H.toFixed(1)}" preserveAspectRatio="${par}" xlink:href="${artSrc}" href="${artSrc}"/>`;
  }
  // artwork at the dream's position (exact placement — no sliding)
  const ab=spec&&spec.artwork&&spec.artwork.box;
  if(artSrc&&artMode!=='full'&&artMode!=='canvas'&&ab&&ab.w>0&&ab.h>0){
    const sp=gc.L<0.60;
    if(artInk&&artInk.w>0.05&&artInk.h>0.05){
      /* CONTENT-PINNED + THE HARD LAW (owner 2026-08-26): the ink lands on
         the dream's measured box — and if a text block was CLEAR of the
         artwork in the dream, it stays clear in the replica. Text never
         moves for art; the art shrinks toward the box centre until every
         such block is clear. */
      const tx=ab.x*W, ty=ab.y*H, tw=ab.w*W, th=ab.h*H;
      const cxm=tx+tw/2, cym=ty+th/2;
      let Wr=tw/artInk.w, Hr=th/artInk.h;
      if(Wr>tw*1.12){const k=(tw*1.12)/Wr;Wr*=k;Hr*=k;}
      if(Hr>th*1.12){const k=(th*1.12)/Hr;Wr*=k;Hr*=k;}
      /* text boxes that the DREAM kept clear of the artwork */
      const clear=[];
      for(const e of (spec&&spec.elements||[])){
        if(!e||!ROLE_TEXT[e.role])continue;
        /* per-glyph licences (owner 2026-08-28): the law protects the
           LETTERS, each carrying how much the dream's art already touched
           it — a curve of glyphs is guarded exactly, and art may weave
           between words as the dream did, never over them */
        if(Array.isArray(e.clearGlyphs)&&e.clearGlyphs.length){
          for(const g of e.clearGlyphs) clear.push({x:g.x*W,y:g.y*H,w:g.w*W,h:g.h*H,allow:+g.allow||0});
          continue;
        }
        if(!e.box)continue;
        const b2=e.box;
        const ix=Math.min(b2.x+b2.w,ab.x+ab.w)-Math.max(b2.x,ab.x);
        const iy=Math.min(b2.y+b2.h,ab.y+ab.h)-Math.max(b2.y,ab.y);
        const inter=Math.max(0,ix)*Math.max(0,iy);
        /* the dream's own interpenetration is the licence: a block the
           dream kept fully clear stays fully clear, but where the art
           legitimately reached into a text box (leaves beside an arched
           name), the replica may reach exactly that far too */
        if(inter<0.25*b2.w*b2.h) clear.push({x:b2.x*W,y:b2.y*H,w:b2.w*W,h:b2.h*H,allow:inter/Math.max(1e-9,b2.w*b2.h)});
      }
      const PAD=6;
      /* the law judges the INK region, not the image rect — margins are
         white/keyed and invisible; testing the full rect shrank the
         artwork chronically (owner residual 2026-08-26) */
      const clearOK=(w2,h2)=>{
        const rx2=cxm-(artInk.x+artInk.w/2)*w2, ry2=cym-(artInk.y+artInk.h/2)*h2;
        const ix0=rx2+artInk.x*w2, iy0=ry2+artInk.y*h2;
        const ix1=ix0+artInk.w*w2, iy1=iy0+artInk.h*h2;
        for(const c of clear){
          if(c.allow<0.02){
            if(ix0<c.x+c.w+PAD&&ix1>c.x-PAD&&iy0<c.y+c.h+PAD&&iy1>c.y-PAD)return false;
          }else{
            const ox=Math.min(ix1,c.x+c.w)-Math.max(ix0,c.x);
            const oy=Math.min(iy1,c.y+c.h)-Math.max(iy0,c.y);
            const oa=Math.max(0,ox)*Math.max(0,oy);
            if(oa>(c.allow+0.03)*c.w*c.h)return false;
          }
        }
        return true;
      };
      if(!clearOK(Wr,Hr)){
        let lo=0.3, hi=1;
        for(let k2=0;k2<18;k2++){const mid=(lo+hi)/2; if(clearOK(Wr*mid,Hr*mid))lo=mid; else hi=mid;}
        Wr*=lo; Hr*=lo;
      }
      const rx=cxm-(artInk.x+artInk.w/2)*Wr, ry=cym-(artInk.y+artInk.h/2)*Hr;
      body+=`<image x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" width="${Wr.toFixed(1)}" height="${Hr.toFixed(1)}" preserveAspectRatio="none" xlink:href="${artSrc}" href="${artSrc}"${sp?' data-sp="1"':''} style="mix-blend-mode:${sp?'normal':'multiply'}"/>`;
      /* the metric judges the same thing the law does: the INK region */
      LAST_ART_RECT={x:rx+artInk.x*Wr,y:ry+artInk.y*Hr,w:artInk.w*Wr,h:artInk.h*Hr};
    }else{
      const ax=ab.x*W, ay=ab.y*H, aw=ab.w*W, ah=ab.h*H;
      const pa=/^x(Min|Mid|Max)Y(Min|Mid|Max)$/.test(String(artAlign))?artAlign:'xMidYMid';
      body+=`<image x="${ax.toFixed(1)}" y="${ay.toFixed(1)}" width="${aw.toFixed(1)}" height="${ah.toFixed(1)}" preserveAspectRatio="${pa} slice" xlink:href="${artSrc}" href="${artSrc}"${sp?' data-sp="1"':''} style="mix-blend-mode:${sp?'normal':'multiply'}"/>`;
    }
  }
  const els=(spec&&Array.isArray(spec.elements)?spec.elements:[]).filter(e=>e&&e.box&&ROLE_TEXT[e.role]);
  const seen={};
  for(const e of els){
    if(seen[e.role])continue; seen[e.role]=1;
    const str=ROLE_TEXT[e.role]; if(!str)continue;
    /* canvas mode (owner 2026-08-31): if the line wasn't found in the
       dream's pixels, do NOT typeset it at a guessed spot over the
       canvas — the dream's own painting stays and already carries the
       words (the legal line included: painted IS printed). */
    if(artMode==='canvas'&&!e.snapped)continue;
    // clamp the box inside the 5mm text margins (hard rule)
    const bx0=Math.max(SM,Math.min(W-SM,e.box.x*W)), bx1=Math.max(SM,Math.min(W-SM,(e.box.x+e.box.w)*W));
    const by0=Math.max(SM,Math.min(H-SM,e.box.y*H));
    /* v3 (owner report 2026-08-25: "the rules are taking over"): the
       dream's geometry is the truth. Size comes from FITTING THE BOX —
       primarily its width (what the eye reads as scale), capped by its
       height — never from floors or minimums that shift positions. The
       only law: the full text must print (7pt floor; box grows only if
       even 7pt cannot hold every word — the legal-line case). */
    const tr0=+e.tracking>0?Math.min(0.4,+e.tracking):0;
    const fam0=e.font?`'${String(e.font).replace(/'/g,'')}'`:SF.jost;
    const wt0=+e.weight||400;
    const nlines=Math.max(1,Math.min(3,+e.lines||1));
    /* CASE IS MEASURED, NOT TRUSTED (owner 2026-08-25: a mixed-case dream
       hero came back ALL CAPS): when the block was ink-snapped, test both
       case hypotheses — at the size each implies, whose predicted width
       matches the measured block? Only when the string actually differs. */
    if(e.capsSeg!=null){
      /* the segmentation MEASURED case and tracking from the letter shapes
         (owner escalation 2026-08-27) — the width guesser must not
         second-guess it */
      e.tracking=+e.trackSeg||0;
    }else if(e.snapped&&e.textH>0&&str!==up(str)){
      /* joint CASE x TRACKING test (owner residual 2026-08-26: widely
         letter-spaced caps measured as mixed because tracking was assumed
         zero) — the winning pair is adopted together */
      const bw0=(Math.min(W-SM,(e.box.x+e.box.w)*W)-Math.max(SM,e.box.x*W))||1;
      const tr9=+e.tracking>0?Math.min(0.4,+e.tracking):0;
      let bestC=e.caps,bestT=tr9,bestD=Infinity;
      for(const hyp of [true,false]){
        for(const tt of [tr9,0.18,0.32]){
          const sz=((e.textH*H)/nlines)*(hyp?1.30:0.96);
          const t=hyp?up(str):str;
          const wds=t.split(/\s+/), per=Math.ceil(wds.length/nlines);
          let lg='';
          for(let i=0;i<wds.length;i+=per){
            const seg=wds.slice(i,i+per).join(' ');
            if(measure(seg,sz,fam0,wt0,false,sz*tt)>measure(lg,sz,fam0,wt0,false,sz*tt))lg=seg;
          }
          const d=Math.abs(measure(lg,sz,fam0,wt0,false,sz*tt)-bw0);
          if(d<bestD){bestD=d;bestC=hyp;bestT=tt;}
        }
      }
      e.caps=bestC; e.tracking=bestT;
    }
    const s0=e.caps?up(str):str;
    /* width-fit: what size makes the longest line exactly span the box? */
    let longest=s0;
    if(nlines>1){
      const words=s0.split(/\s+/), per=Math.ceil(words.length/nlines);
      longest='';
      for(let i=0;i<words.length;i+=per){
        const seg=words.slice(i,i+per).join(' ');
        if(measure(seg,100,fam0,wt0,false,100*tr0)>measure(longest,100,fam0,wt0,false,100*tr0))longest=seg;
      }
    }
    const w100=measure(longest,100,fam0,wt0,false,100*tr0)||1;
    const sizeW=((bx1-bx0)*100)/w100;
    /* measured size (owner GO 2026-08-25): when the box was ink-snapped,
       textH is the TRUE glyph-block height in the dream — convert to font
       size (caps ≈ cap-height = 0.72em; mixed case spans ascender+descender
       ≈ 1.0em per line). Falls back to the box heuristic otherwise. */
    const sizeH=e.textH>0
      ?((e.textH*H)/nlines)*(e.caps?1.30:0.96)
      :((e.box.h||0.05)*H*0.9)/nlines;
    const size=Math.max(MIN7,Math.min(sizeH,sizeW,H*0.24));
    /* the box only widens if 7pt still cannot hold every word */
    /* the box only widens against the SAME letter-spacing sBlock applies —
       sBlock derives tracking from the requested (correction-scaled) size,
       so measuring with 7pt-tracking here under-counted and words dropped */
    const szReq=Math.max(MIN7,size*(+e.__ds||1));
    const need=measure(longest,MIN7,fam0,wt0,false,szReq*tr0)+4;
    const bw=Math.min(W-2*SM,Math.max(bx1-bx0,need));
    /* a snapped box IS the dream's ink — centring on it reproduces any
       alignment the dream chose; only guessed boxes fall back to the
       transcriber's align flag (owner defect 2026-08-27: a stray box
       edge left text off-centre) */
    const a=e.snapped?'c':e.align==='l'?'l':e.align==='r'?'r':'c';
    /* the anchor shifts inward when the widened text would cross a margin
       (owner 2026-08-31: the legal line ran off the right edge) */
    let x=a==='l'?bx0:a==='r'?bx1:(bx0+bx1)/2;
    if(a==='c'){const half=bw/2;x=Math.max(SM+half,Math.min(W-SM-half,x));}
    const preIR=INK_RECTS.length;
    if(e.arc&&nlines===1){
      /* arched baseline (dream trait, previously straightened): radius from
         the chord width and a sagitta ≈ the box height */
      const chord=bx1-bx0, sag=+e.arcSag>0?Math.max(6,e.arcSag*H):Math.max(6,(e.box.h||0.04)*H*0.55);
      const R=Math.max(chord*0.6,(chord*chord)/(8*sag)+sag/2);
      body+=sArcText(s0,(bx0+bx1)/2,by0+(+e.__dy||0)+size*0.9,R,{f:fam0,w:wt0,size:Math.max(MIN7,size*(+e.__ds||1)),fill:guard(e.colour),tr:tr0});
      INK_RECTS.push({x:bx0,y:by0,x2:bx1,y2:by0+(e.box.h||0.04)*H});
    }else{
      body+=sBlock(str,{x,top:by0+(+e.__dy||0),maxW:bw,size:size*(+e.__ds||1),min:MIN7,
        f:fam0,w:wt0,fill:guard(e.colour),a,caps:!!e.caps,tr:tr0,
        lines:nlines,lh:1.04}).svg;
    }
    if(PLACED&&INK_RECTS.length>preIR){
      const r=INK_RECTS[INK_RECTS.length-1];
      PLACED.push({role:e.role,x:r.x/W,y:r.y/H,w:(r.x2-r.x)/W,h:(r.y2-r.y)/H,
        tx:e.box.x,ty:e.box.y,tw:e.box.w,th:e.box.h,snapped:!!e.snapped});
    }
  }
  // the legal line is law — if the dream forgot it, it prints anyway
  if(!seen.legal&&ROLE_TEXT.legal)
    body+=sBlock(ROLE_TEXT.legal,{x:W/2,top:H-SM-H*0.024,maxW:W-2*SM,size:H*0.022,min:MIN7,
      f:SF.jost,w:400,fill:guard('#555555'),a:'c'}).svg;
  if(!seen.wine&&f.wine)
    body+=sBlock(f.wine,{x:W/2,top:H*0.42,maxW:W-2*SM,size:H*0.09,min:MIN7,f:SF.fraunces,w:600,
      fill:guard('#1E1B18'),a:'c',lines:2}).svg;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" width="${twMM}mm" height="${thMM}mm">`+
    `<defs><style><![CDATA[@import url('${FONTS_URL}');${EXTRA_FONTS_URL?`@import url('${EXTRA_FONTS_URL}');`:''}]]></style></defs>`+
    `<rect x="0" y="0" width="${W.toFixed(1)}" height="${H.toFixed(1)}" fill="${g0}"/>`+body+`</svg>`;
}
function renderStyleOptions(d,order,opts){
  opts=opts||{}; const seed=opts.seed|0;
  const twMM=Math.max(30,(+opts.widthMM||110)), thMM=Math.max(30,(+opts.heightMM||80));
  const W=twMM*10, H=thMM*10, f=sFields(d);
  const wc=String((d&&d.wineColorName)||'');
  WINE_KIND=/red/i.test(wc)?'red':/ros/i.test(wc)?'rose':/orange|amber/i.test(wc)?'orange':'white';
  const testRig=(typeof window!=='undefined'&&typeof window.__SEED0__==='number');
  return STYLE_LIST.map(st=>{let svg;
    const hs=STYLE_HINTS[st.key];
    const hasLooks=!!(hs&&Array.isArray(hs.looks)&&hs.looks.length);
    try{
      if(STYLE_HINTS.__integrated)
        svg=styleIntegrated(f,W,H,seed,twMM,thMM,st.key);
      else if(LOOKS_ONLY&&!hasLooks&&!testRig)
        svg=sWrap(W,H,twMM,thMM,'#FFFFFF',`<text x="${(W/2).toFixed(1)}" y="${(H/2).toFixed(1)}" text-anchor="middle" font-family="${SF.jost}" font-size="${(10*PT_U).toFixed(1)}" fill="#8a887e">${esc(st.name+' — designs are being curated')}</text>`);
      else if(st.key==='traditional') svg=withLook('traditional',seed,s2=>styleTraditional(d,order,s2,twMM,thMM));
      else if(st.key==='contemporary') svg=withLook('contemporary',seed,s2=>styleContemporary(f,W,H,s2,twMM,thMM));
      else svg=withLook('punk',seed,s2=>stylePunk(f,W,H,s2,twMM,thMM));
    }catch(e){ svg=sWrap(W,H,twMM,thMM,'#f4f2ec',`<text x="${(W/2).toFixed(1)}" y="${(H/2).toFixed(1)}" text-anchor="middle" font-family="${SF.jost}" font-size="${(14*PT_U).toFixed(1)}" fill="#a33">${esc(st.name)}</text>`); }
    return {name:st.name,rank:st.key,style:st.key,desc:st.name,svg};
  });
}

/* Which composition a seed lands on (contemporary reports its merged index) —
   the admin layout playground uses this to attach feedback to the right comp. */
function variantFor(key,seed){
  if(key==='contemporary'){
    const cv=cVariantFor(seed);
    let off=0;for(const [k,n] of C_POOL){if(k===cv.key)break;off+=n;}
    return off+cv.local;
  }
  if(key==='traditional')return pickVariant('traditional',seed,STYLE_BOXES.traditional.length);
  if(key==='punk')return pickVariant('punk',seed,STYLE_BOXES.punk.length);
  return 0;
}
window.LabelEngine={FONTS_URL,ensureFonts,renderPriorityOptions,renderStyleOptions,renderDreamSpec,renderDreamFitted,STYLE_LIST,styleZones,setStyleHints,variantFor,previewLayout,renderOptions,renderLabel,LC_COMPS};
})();

