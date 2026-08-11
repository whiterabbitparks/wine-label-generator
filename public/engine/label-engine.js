
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

const FONTS_URL="https://fonts.googleapis.com/css2?family=Alegreya+SC:wght@400;500&family=Ballet&family=Baskervville+SC&family=Cinzel:wght@500;600&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Cutive+Mono&family=EB+Garamond:ital,wght@0,400;0,500;0,700;1,400&family=Estonia&family=Felipa&family=Girassol&family=Great+Vibes&family=Italianno&family=Manufacturing+Consent&family=Marcellus&family=Mate+SC&family=MonteCarlo&family=Montagu+Slab:wght@500;600&family=Mrs+Saint+Delafield&family=Nixie+One&family=Pinyon+Script&family=Playfair+Display:wght@600;700&family=Prata&family=Tinos:ital,wght@0,400;0,700;1,400&family=Jost:wght@300;400;500;600&family=Archivo:wght@300;400;500;600;700;800&family=Barlow+Condensed:wght@600;700&family=Barlow:wght@600;700&family=Anton&family=Bebas+Neue&family=Caveat:wght@500;600;700&family=Fraunces:ital,wght@0,400;0,500;0,600;0,700;1,500&display=swap";
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
  const specs=["600 40px 'Cormorant Garamond'","500 40px 'EB Garamond'","italic 400 40px 'EB Garamond'",
    "600 40px 'Cinzel'","700 40px 'Playfair Display'","600 40px 'Playfair Display'","400 40px 'Pinyon Script'",
    "400 40px 'Marcellus'","400 40px 'Prata'","400 40px 'Ballet'","400 40px 'Mrs Saint Delafield'",
    "400 40px 'Great Vibes'","400 40px 'MonteCarlo'","400 40px 'Estonia'","400 40px 'Felipa'","400 40px 'Italianno'",
    "400 40px 'Manufacturing Consent'","400 40px 'Cutive Mono'","600 40px 'Montagu Slab'","400 40px 'Girassol'",
    "400 40px 'Nixie One'","500 40px 'Alegreya SC'","400 40px 'Mate SC'","400 40px 'Baskervville SC'",
    "400 40px 'Tinos'","700 40px 'Tinos'",
    "300 40px 'Jost'","400 40px 'Jost'","500 40px 'Jost'","600 40px 'Jost'",
    "300 40px 'Archivo'","400 40px 'Archivo'","500 40px 'Archivo'","600 40px 'Archivo'","700 40px 'Archivo'","800 40px 'Archivo'",
    "400 40px 'Anton'","400 40px 'Bebas Neue'","600 40px 'Barlow Condensed'","700 40px 'Barlow Condensed'","600 40px 'Barlow'","700 40px 'Barlow'","500 40px 'Caveat'","600 40px 'Caveat'","700 40px 'Caveat'",
    "400 40px 'Fraunces'","500 40px 'Fraunces'","600 40px 'Fraunces'","700 40px 'Fraunces'","italic 500 40px 'Fraunces'"];
  try{await Promise.all(specs.map(s=>document.fonts.load(s)));await document.fonts.ready;}catch(e){}
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
  barlow:"'Barlow',sans-serif",barlowc:"'Barlow Condensed',sans-serif",
  bebas:"'Bebas Neue',sans-serif",caveat:"'Caveat',cursive",fraunces:"'Fraunces',serif",
  cormorant:F.cormorant,cinzel:F.cinzel,ebg:F.ebg,marcellus:F.marcellus,playfair:F.playfair};
let __sid=0;
function sFields(d){const j=(a,s)=>a.map(x=>String(x==null?'':x).trim()).filter(Boolean).join(s);
  return {producer:String(d.producer||'').trim(),wine:String(d.wine||'').trim(),
    appellation:String(d.appellation||'').trim(),grape:String(d.grape||'').trim(),
    region:j([d.region,d.country],', '),special:String(d.special||'').trim(),
    vintage:String(d.vintage||'').trim(),classification:String(d.classification||'').trim(),
    descriptor:wineDescriptor(d),alc:j([d.alcohol,d.volume],'   '),accent:lcAccent(d)};}
function sWrap(W,H,twMM,thMM,bg,body,defs){
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" width="${twMM}mm" height="${thMM}mm">`
    +`<defs><style><![CDATA[@import url('${FONTS_URL}');]]></style>${defs||''}</defs>`
    +`<rect x="${(-SBLEED)}" y="${(-SBLEED)}" width="${(W+2*SBLEED).toFixed(1)}" height="${(H+2*SBLEED).toFixed(1)}" fill="${bg}"/>`
    +body+`</svg>`;}
/* fit+wrap a string; returns {svg,bottom,size,nlines}. `top` = top of the text box (baseline ≈ top+0.80*size). */
function sBlock(str,o){if(!str)return {svg:'',bottom:o.top,size:0,nlines:0};
  const s0=o.caps?up(str):str, trAbs=o.tr?o.size*o.tr:0, maxLines=o.lines||1;
  const fit=wrapFit(s0,o.maxW,o.size,o.min||o.size,maxLines,o.f,o.w||400,!!o.ital,trAbs);
  const sz=fit.size, lh=(o.lh||1.16)*sz, anchor=o.a==='l'?'start':o.a==='r'?'end':'middle', base=o.top+sz*0.80;
  const ls=trAbs?` letter-spacing="${trAbs.toFixed(2)}"`:'', it=o.ital?' font-style="italic"':'';
  const halo=o.halo?` stroke="#ffffff" stroke-width="${(sz*0.14).toFixed(1)}" stroke-linejoin="round" style="paint-order:stroke"`:'';
  let svg=''; fit.lines.forEach((l,i)=>{svg+=`<text x="${o.x.toFixed(1)}" y="${(base+i*lh).toFixed(1)}" font-family="${o.f}" font-weight="${o.w||400}" font-size="${sz.toFixed(1)}" text-anchor="${anchor}" fill="${o.fill||'#111'}"${ls}${it}${halo}>${esc(l)}</text>`;});
  return {svg,bottom:o.top+(fit.lines.length-1)*lh+sz,size:sz,nlines:fit.lines.length};}
/* stack single-line detail items UP from a bottom baseline (centred/left/right). */
function stackUp(items,x,botY,gap,a,maxW){let y=botY,svg='';
  for(let i=items.length-1;i>=0;i--){const it=items[i];if(!it||!it.str)continue;
    const b=sBlock(it.str,{x,top:y-it.size,maxW:it.maxW||maxW,size:it.size,min:it.size*0.72,lines:1,f:it.f,w:it.w||400,fill:it.fill,a:a||'c',tr:it.tr||0,lh:1.1});
    svg=b.svg+svg; y=(y-it.size)-gap;}
  return {svg,topY:y+gap};}
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

/* Arched text along a circular path (textPath keeps output deterministic). */
function sArcText(str,cx,topBaseY,R,o){
  if(!str)return '';
  const id='arcp'+(++__simgN);
  const cyc=topBaseY+R, span=1.9;
  const x1=cx-R*Math.sin(span/2), y1=cyc-R*Math.cos(span/2);
  const x2=cx+R*Math.sin(span/2);
  const ls=o.tr?` letter-spacing="${(o.size*o.tr).toFixed(2)}"`:'';
  return `<defs><path id="${id}" d="M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R.toFixed(1)} ${R.toFixed(1)} 0 0 1 ${x2.toFixed(1)} ${y1.toFixed(1)}"/></defs>`
    +`<text font-family="${o.f}" font-weight="${o.w||400}" font-size="${o.size.toFixed(1)}" fill="${o.fill}"${ls}>`
    +`<textPath href="#${id}" startOffset="50%" text-anchor="middle">${esc(o.caps?up(str):str)}</textPath></text>`;
}
/* Image zone per the owner's focal/fade spec (Layout Styles PDFs):
   solid black = FOCAL area (the subject lives here, full opacity);
   gradient = FADE area (image continues but dissolves; only expendable
   content). z={focal:[x0,y0,x1,y1] fractions, fade:[...], shape:'band'|
   'rounded'|'ellipse'}. Returns '' when the style has no artwork, keeping
   pre-generation output byte-identical. */
function sImageZone(styleKey,z,W,H){
  const m=(typeof window!=='undefined'&&window.__LABEL_IMGS__)||null;
  const src=m&&m[styleKey]; if(!src||!z||!z.focal) return '';
  const id=++__simgN;
  const fx=z.fade[0]*W, fy=z.fade[1]*H, fw=(z.fade[2]-z.fade[0])*W, fh=(z.fade[3]-z.fade[1])*H;
  let grad;
  if(z.shape==='ellipse'){
    const cx=(z.focal[0]+z.focal[2])/2*W, cy=(z.focal[1]+z.focal[3])/2*H;
    const r1=Math.max(fw,fh)/2, r0=Math.max((z.focal[2]-z.focal[0])*W,(z.focal[3]-z.focal[1])*H)/2;
    grad=`<radialGradient id="mg${id}" gradientUnits="userSpaceOnUse" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r1.toFixed(1)}">`
      +`<stop offset="${Math.min(0.98,r0/r1*0.92).toFixed(3)}" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>`;
  }else{
    const f1=Math.max(0,(z.focal[1]-z.fade[1])/(z.fade[3]-z.fade[1]));
    const f2=Math.min(1,(z.focal[3]-z.fade[1])/(z.fade[3]-z.fade[1]));
    grad=`<linearGradient id="mg${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${fy.toFixed(1)}" x2="0" y2="${(fy+fh).toFixed(1)}">`
      +`<stop offset="0" stop-color="${f1>0.02?'#000':'#fff'}"/><stop offset="${f1.toFixed(3)}" stop-color="#fff"/>`
      +`<stop offset="${f2.toFixed(3)}" stop-color="#fff"/><stop offset="1" stop-color="${f2<0.98?'#000':'#fff'}"/></linearGradient>`;
  }
  const rx=z.shape==='rounded'?(0.035*W).toFixed(1):0;
  return `<defs>${grad}<mask id="mk${id}"><rect x="${fx.toFixed(1)}" y="${fy.toFixed(1)}" width="${fw.toFixed(1)}" height="${fh.toFixed(1)}"${rx?` rx="${rx}"`:''} fill="url(#mg${id})"/></mask></defs>`
    +`<image x="${fx.toFixed(1)}" y="${fy.toFixed(1)}" width="${fw.toFixed(1)}" height="${fh.toFixed(1)}" preserveAspectRatio="xMidYMid slice" mask="url(#mk${id})" xlink:href="${src}" href="${src}" style="mix-blend-mode:multiply"/>`;
}

/* ---- 1) TRADITIONAL — nine fixed compositions transplanted from the
   owner's Traditional.pdf (ref artboard 294.803x238.11pt = 104x84mm).
   Serif system: hero in Tinos 700 (stand-in for the PDF's Times New Roman
   Bold) in brand red with a white halo, details in EB Garamond; the
   producer arches over the artwork on four compositions. Image zones per
   the focal/fade spec; two compositions (4 & 6) are text-only. ---- */
function styleTraditional(d,order,seed,twMM,thMM){
  const f=sFields(d), W=twMM*10, H=thMM*10;
  const sx=W/294.803, sy=H/238.11;
  const RED='#D71920', INK='#231F20';
  const X=px=>px*sx, TOP=(bl,sz)=>(238.11-bl)*sy-0.80*sz;
  const cx=W/2, Lx=X(19.84), Rx=W-X(19.84);
  const EG={f:SF.ebg,w:400}, EGB={f:SF.ebg,w:700}, TB={f:SF.tinos,w:700};
  const szHero=20*sy, szApp=16*sy, szCls=14*sy, szRow=10*sy, szV=13*sy, szB=9*sy, szAlc=7*sy;
  const alc=f.alc?('Alc.: '+f.alc.replace(/\s{2,}/g,' / ')+'.'):'';
  const desc=(f.descriptor||'').replace(/,/g,'');
  const variant=Math.floor(seed/2)%9;
  let body='';
  // shared lower block (classification / special·vintage·region / descriptor·grape·alc)
  function lower(clsY,r1Y,r2Y){let b='';
    b+=sBlock(f.classification,{x:cx,top:TOP(clsY,szCls),maxW:W*0.72,size:szCls,min:szCls*0.7,fill:INK,a:'c',...EG}).svg;
    b+=sBlock(f.special,{x:Lx,top:TOP(r1Y,szRow),maxW:W*0.26,size:szRow,min:szRow*0.7,fill:INK,a:'l',...EG}).svg;
    b+=sBlock(f.vintage,{x:cx,top:TOP(r1Y-1,szV),maxW:W*0.2,size:szV,min:szV*0.7,fill:INK,a:'c',...EG}).svg;
    b+=sBlock(f.region,{x:Rx,top:TOP(r1Y,szRow),maxW:W*0.3,size:szRow,min:szRow*0.7,fill:INK,a:'r',...EG}).svg;
    b+=sBlock(desc,{x:Lx,top:TOP(r2Y,szB),maxW:W*0.22,size:szB,min:szB*0.7,fill:INK,a:'l',...EG}).svg;
    b+=sBlock(f.grape,{x:cx,top:TOP(r2Y,szB),maxW:W*0.42,size:szB,min:szB*0.7,fill:INK,a:'c',...EGB}).svg;
    b+=sBlock(alc,{x:Rx,top:TOP(r2Y,szAlc),maxW:W*0.24,size:szAlc,min:szAlc*0.7,fill:INK,a:'r',...EG}).svg;
    return b;}
  function hero1(bl){return sBlock(f.wine,{x:cx,top:TOP(bl,szHero),maxW:W*0.82,size:szHero,min:szHero*0.55,fill:RED,a:'c',caps:true,halo:true,tr:0.06,...TB}).svg;}
  function app(bl,col){return sBlock(f.appellation,{x:cx,top:TOP(bl,szApp),maxW:W*0.6,size:szApp,min:szApp*0.7,fill:col||INK,a:'c',halo:true,...EGB}).svg;}
  function prodStraight(bl,sz){return sBlock(f.producer,{x:cx,top:TOP(bl,sz),maxW:W*0.7,size:sz,min:sz*0.7,fill:INK,a:'c',caps:true,tr:0.15,halo:true,...EG}).svg;}
  function prodArch(topBl){return sArcText(f.producer,cx,TOP(topBl,12*sy)+0.8*12*sy,140*sy,{f:SF.ebg,w:400,size:12*sy,fill:INK,tr:0.2,caps:true});}
  function frame(){const o=X(7),i=X(10.5);
    return `<rect x="${o.toFixed(1)}" y="${(7*sy).toFixed(1)}" width="${(W-2*o).toFixed(1)}" height="${(H-14*sy).toFixed(1)}" fill="none" stroke="${INK}" stroke-width="${(1.6*sy).toFixed(2)}"/>`
      +`<rect x="${i.toFixed(1)}" y="${(10.5*sy).toFixed(1)}" width="${(W-2*i).toFixed(1)}" height="${(H-21*sy).toFixed(1)}" fill="none" stroke="${INK}" stroke-width="${(0.6*sy).toFixed(2)}"/>`;}
  function rule(bl){return `<rect x="${X(16).toFixed(1)}" y="${((238.11-bl)*sy).toFixed(1)}" width="${(W-2*X(16)).toFixed(1)}" height="${Math.max(1,0.5*sy).toFixed(1)}" fill="${INK}"/>`;}
  // caps mid-lines used by the framed comps
  function capsLine(txt,bl,sz,col){return sBlock(txt,{x:cx,top:TOP(bl,sz),maxW:W*0.78,size:sz,min:sz*0.7,fill:col,a:'c',caps:true,tr:0.06,...EG}).svg;}

  if(variant===0){        // p1 — rounded band, straight producer
    body+=sImageZone('traditional',{focal:[0.113,0.185,0.887,0.482],fade:[0.011,0.018,0.989,0.586],shape:'rounded'},W,H);
    body+=prodStraight(200.83,17.01*sy);
    body+=hero1(99.29)+app(81.77);
    body+=lower(46.10,31.46,19.45);
  }else if(variant===1){  // p2 — ellipse, straight producer
    body+=sImageZone('traditional',{focal:[0.182,0.203,0.818,0.541],fade:[0.069,0.104,0.931,0.649],shape:'ellipse'},W,H);
    body+=prodStraight(200.83,17.01*sy);
    body+=hero1(84.29)+app(66.77);
    body+=lower(46.10,31.46,19.45);
  }else if(variant===2){  // p3 — framed, arched producer, vintage on top, rounded zone
    body+=frame();
    body+=sImageZone('traditional',{focal:[0.196,0.203,0.804,0.495],fade:[0.06,0.05,0.94,0.60],shape:'rounded'},W,H);
    body+=sBlock(f.vintage,{x:cx,top:TOP(208.06,szV),maxW:W*0.2,size:szV,min:szV*0.7,fill:INK,a:'c',...EG}).svg;
    body+=prodArch(192.5);
    body+=hero1(99.29)+app(81.77);
    body+=sBlock(f.classification,{x:cx,top:TOP(59.99,szCls),maxW:W*0.72,size:szCls,min:szCls*0.7,fill:INK,a:'c',...EG}).svg;
    body+=capsLine(f.grape,44.97,szRow,RED);
    body+=capsLine([f.region,f.special].filter(Boolean).join(' / '),30.61,szB,INK);
    body+=rule(25.5);
    body+=capsLine([desc,alc].filter(Boolean).join(' / '),13.49,szB,INK);
  }else if(variant===3){  // p4 — framed, arched producer, giant two-line hero, no zone
    body+=frame();
    body+=prodArch(200.3);
    body+=sBlock(f.wine,{x:cx,top:TOP(156.23,39.98*sy),maxW:W*0.76,size:39.98*sy,min:20*sy,lines:2,lh:0.981,fill:RED,a:'c',caps:true,tr:0.02,...TB}).svg;
    body+=app(97.20,RED);
    body+=sBlock(f.vintage,{x:cx,top:TOP(77.33,szV),maxW:W*0.2,size:szV,min:szV*0.7,fill:INK,a:'c',...EG}).svg;
    body+=sBlock(f.classification,{x:cx,top:TOP(60.31,szCls),maxW:W*0.72,size:szCls,min:szCls*0.7,fill:INK,a:'c',...EG}).svg;
    body+=capsLine(f.grape,45.29,szRow,RED);
    body+=capsLine([f.region,f.special].filter(Boolean).join(' / '),30.94,szB,INK);
    body+=rule(24.5);
    body+=capsLine([desc,alc].filter(Boolean).join(' / '),12.49,szB,INK);
  }else if(variant===4){  // p5 — full band, hero over the artwork top
    body+=sImageZone('traditional',{focal:[0,0.248,1,0.671],fade:[0,0.023,1,0.761],shape:'band'},W,H);
    body+=prodStraight(206.79,14.66*sy);
    body+=hero1(185.04);
    body+=app(60.50);
    body+=lower(46.10,31.46,19.45);
  }else if(variant===5){  // p6 — arched producer, giant two-line hero, red appellation, no zone
    body+=prodArch(193.3);
    body+=sBlock(f.wine,{x:cx,top:TOP(134.92,39.98*sy),maxW:W*0.76,size:39.98*sy,min:20*sy,lines:2,lh:0.981,fill:RED,a:'c',caps:true,tr:0.02,...TB}).svg;
    body+=app(64.66,RED);
    body+=lower(46.10,31.46,19.45);
  }else if(variant===6){  // p7 — ellipse, arched producer
    body+=sImageZone('traditional',{focal:[0.156,0.189,0.844,0.554],fade:[0.087,0.122,0.913,0.649],shape:'ellipse'},W,H);
    body+=prodArch(200.3);
    body+=hero1(84.29)+app(66.77);
    body+=lower(46.10,31.46,19.45);
  }else if(variant===7){  // p8 — full band, straight producer
    body+=sImageZone('traditional',{focal:[0,0.212,1,0.554],fade:[0,0.023,1,0.68],shape:'band'},W,H);
    body+=prodStraight(200.83,17.01*sy);
    body+=hero1(77.29)+app(59.77);
    body+=lower(44.10,31.46,19.45);
  }else{                  // p9 — deep band, hero over the artwork top
    body+=sImageZone('traditional',{focal:[0,0.261,1,0.667],fade:[0,0.162,1,0.761],shape:'band'},W,H);
    body+=prodStraight(206.79,14.66*sy);
    body+=hero1(185.04);
    body+=app(60.50);
    body+=lower(46.10,31.46,19.45);
  }
  return sWrap(W,H,twMM,thMM,'#ffffff',body);
}

function styleContemporary(f,W,H,seed,twMM,thMM){
  /* Five fixed compositions from the owner's revised Contemporary.pdf
     (2026-08-11; ref artboard 311.811x226.772pt = 110x80mm) with the
     focal/fade artwork zones. Type: DIN Condensed Bold -> Barlow Condensed
     700, DIN Alternate Bold -> Barlow 700, Helvetica -> Archivo (Google
     stand-ins). Colours: ink #231F20, grey #6D6E71. */
  const sx=W/311.811, sy=H/226.772;
  const INK='#231F20', GRAY='#6D6E71';
  const X=px=>px*sx, TOP=(bl,sz)=>(226.772-bl)*sy-0.80*sz;
  const Lx=X(13.51), Rx=X(298.3), cx=W/2;
  const DC={f:SF.barlowc,w:700}, DA={f:SF.barlow,w:700}, AR={f:SF.archivo,w:400};
  const szHd=15.99*sy, szHero=20*sy, szB=10*sy, szAlc=7*sy;
  const alc=f.alc?('Alc. '+f.alc.replace(/\s{2,}/g,' Vol. / ')+'.'):'';
  const reg=[f.region,f.special].filter(Boolean).join(' / ');
  const desc=(f.descriptor||'').replace(/,/g,'');
  const variant=Math.floor(seed/2)%5;
  let body='';
  if(variant===0){        // p1 — band zone, all-condensed left/right columns
    body+=sImageZone('contemporary',{focal:[0,0.125,1,0.625],fade:[0,0,1,0.715],shape:'band'},W,H);
    body+=sBlock(f.producer,{x:Lx,top:TOP(201.32,szHd),maxW:W*0.5,size:szHd,min:szHd*0.7,fill:INK,a:'l',caps:true,...DC}).svg;
    body+=sBlock(f.vintage,{x:Rx,top:TOP(201.42,szHd),maxW:W*0.25,size:szHd,min:szHd*0.7,fill:INK,a:'r',...DC}).svg;
    body+=sBlock(f.wine,{x:Lx,top:TOP(64.78,szHero),maxW:W*0.68,size:szHero,min:szHero*0.55,fill:INK,a:'l',caps:true,...DC}).svg;
    body+=sBlock(f.appellation,{x:Rx,top:TOP(64.78,12*sy),maxW:W*0.26,size:12*sy,min:9*sy,fill:INK,a:'r',caps:true,...DC}).svg;
    body+=sBlock(f.grape,{x:Lx,top:TOP(44.38,szB),maxW:W*0.42,size:szB,min:szB*0.7,fill:GRAY,a:'l',caps:true,...DC}).svg;
    body+=sBlock(f.classification,{x:Lx,top:TOP(32.38,szB),maxW:W*0.42,size:szB,min:szB*0.7,fill:GRAY,a:'l',caps:true,...DC}).svg;
    body+=sBlock(reg,{x:Lx,top:TOP(14.78,szB),maxW:W*0.52,size:szB,min:szB*0.7,fill:INK,a:'l',...DC}).svg;
    body+=sBlock(desc,{x:Rx,top:TOP(29.22,szB),maxW:W*0.28,size:szB,min:szB*0.7,fill:GRAY,a:'r',...DC}).svg;
    body+=sBlock(alc,{x:Rx,top:TOP(15.22,szAlc),maxW:W*0.3,size:szAlc,min:szAlc*0.7,fill:GRAY,a:'r',...DC}).svg;
  }else if(variant===1){  // p2 — band zone, centred stack (Barlow + Archivo)
    body+=sImageZone('contemporary',{focal:[0,0.125,1,0.51],fade:[0,0,1,0.675],shape:'band'},W,H);
    body+=sBlock(f.producer,{x:cx,top:TOP(203.32,12*sy),maxW:W*0.4,size:12*sy,min:9*sy,fill:INK,a:'c',caps:true,...DC}).svg;
    body+=sBlock(f.vintage,{x:Rx,top:TOP(203.42,12*sy),maxW:W*0.2,size:12*sy,min:9*sy,fill:INK,a:'r',...DC}).svg;
    body+=sBlock(f.wine,{x:cx,top:TOP(93.42,16*sy),maxW:W*0.8,size:16*sy,min:11*sy,fill:INK,a:'c',caps:true,...DA}).svg;
    body+=sBlock(f.appellation,{x:cx,top:TOP(76.63,12*sy),maxW:W*0.6,size:12*sy,min:9*sy,fill:INK,a:'c',...DA}).svg;
    body+=sBlock(f.grape,{x:cx,top:TOP(56.22,szB),maxW:W*0.6,size:szB,min:szB*0.7,fill:GRAY,a:'c',...AR}).svg;
    body+=sBlock(f.classification,{x:cx,top:TOP(44.22,szB),maxW:W*0.6,size:szB,min:szB*0.7,fill:GRAY,a:'c',...AR}).svg;
    body+=sBlock(desc,{x:cx,top:TOP(28.63,8*sy),maxW:W*0.4,size:8*sy,min:6*sy,fill:GRAY,a:'c',ital:true,...AR}).svg;
    body+=sBlock([reg,alc].filter(Boolean).join(' / '),{x:cx,top:TOP(14.22,szAlc),maxW:W*0.8,size:szAlc,min:szAlc*0.7,fill:GRAY,a:'c',...AR}).svg;
  }else if(variant===2){  // p3 — zone bleeding off the top, left column, vintage bottom-right
    body+=sImageZone('contemporary',{focal:[0,0,1,0.465],fade:[0,0,1,0.55],shape:'band'},W,H);
    body+=sBlock(f.wine,{x:X(14.17),top:TOP(102.12,szHero),maxW:W*0.68,size:szHero,min:szHero*0.55,fill:INK,a:'l',caps:true,...DC}).svg;
    body+=sBlock(f.producer,{x:Rx,top:TOP(102.12,szHd),maxW:W*0.26,size:szHd,min:szHd*0.7,fill:INK,a:'r',caps:true,...DC}).svg;
    body+=sBlock(f.appellation,{x:X(14.17),top:TOP(87.72,12*sy),maxW:W*0.5,size:12*sy,min:9*sy,fill:INK,a:'l',caps:true,...DC}).svg;
    body+=sBlock(f.grape,{x:X(14.17),top:TOP(69.32,szB),maxW:W*0.5,size:szB,min:szB*0.7,fill:GRAY,a:'l',...AR}).svg;
    body+=sBlock(f.classification,{x:X(14.17),top:TOP(57.32,szB),maxW:W*0.5,size:szB,min:szB*0.7,fill:GRAY,a:'l',...AR}).svg;
    body+=sBlock(reg,{x:X(14.17),top:TOP(41.72,9*sy),maxW:W*0.62,size:9*sy,min:7*sy,fill:INK,a:'l',caps:true,...DC}).svg;
    body+=sBlock(desc,{x:X(14.17),top:TOP(30.92,9*sy),maxW:W*0.4,size:9*sy,min:7*sy,fill:GRAY,a:'l',caps:true,...DC}).svg;
    body+=sBlock(alc.replace(' Vol.',' Vol'),{x:X(14.17),top:TOP(14.52,szAlc),maxW:W*0.35,size:szAlc,min:szAlc*0.7,fill:GRAY,a:'l',...AR}).svg;
    body+=sBlock(f.vintage,{x:Rx,top:TOP(14.16,szHd),maxW:W*0.2,size:szHd,min:szHd*0.7,fill:INK,a:'r',...DC}).svg;
  }else if(variant===3){  // p4 — band zone, left column with mixed families
    body+=sImageZone('contemporary',{focal:[0,0.125,1,0.47],fade:[0,0,1,0.66],shape:'band'},W,H);
    body+=sBlock(f.producer,{x:X(14.17),top:TOP(201.32,szHd),maxW:W*0.5,size:szHd,min:szHd*0.7,fill:INK,a:'l',caps:true,...DC}).svg;
    body+=sBlock(f.vintage,{x:Rx,top:TOP(201.42,szHd),maxW:W*0.25,size:szHd,min:szHd*0.7,fill:INK,a:'r',...DC}).svg;
    body+=sBlock(f.wine,{x:X(14.17),top:TOP(97.65,szHero),maxW:W*0.68,size:szHero,min:szHero*0.55,fill:INK,a:'l',caps:true,...DC}).svg;
    body+=sBlock(f.appellation,{x:X(14.17),top:TOP(80.85,12*sy),maxW:W*0.5,size:12*sy,min:9*sy,fill:INK,a:'l',...DA}).svg;
    body+=sBlock(f.grape,{x:X(14.17),top:TOP(60.45,szB),maxW:W*0.55,size:szB,min:szB*0.7,fill:GRAY,a:'l',...AR}).svg;
    body+=sBlock(f.classification,{x:X(14.17),top:TOP(48.45,szB),maxW:W*0.55,size:szB,min:szB*0.7,fill:GRAY,a:'l',...AR}).svg;
    body+=sBlock(desc,{x:X(14.17),top:TOP(30.45,szB),maxW:W*0.4,size:szB,min:szB*0.7,fill:GRAY,a:'l',...AR}).svg;
    body+=sBlock([reg,alc].filter(Boolean).join(' / '),{x:X(14.17),top:TOP(16.04,szAlc),maxW:W*0.8,size:szAlc,min:szAlc*0.7,fill:GRAY,a:'l',...AR}).svg;
  }else{                  // p5 — zone off the top, two columns, vintage bottom-left
    body+=sImageZone('contemporary',{focal:[0,0,1,0.555],fade:[0,0,1,0.66],shape:'band'},W,H);
    body+=sBlock(f.wine,{x:X(14.17),top:TOP(78.12,szHero),maxW:W*0.66,size:szHero,min:szHero*0.55,fill:INK,a:'l',caps:true,...DC}).svg;
    body+=sBlock(f.producer,{x:Rx,top:TOP(78.00,szHd),maxW:W*0.26,size:szHd,min:szHd*0.7,fill:INK,a:'r',caps:true,...DC}).svg;
    body+=sBlock(f.appellation,{x:X(14.17),top:TOP(63.72,12*sy),maxW:W*0.5,size:12*sy,min:9*sy,fill:INK,a:'l',caps:true,...DC}).svg;
    body+=sBlock(reg,{x:X(14.17),top:TOP(45.72,9*sy),maxW:W*0.6,size:9*sy,min:7*sy,fill:INK,a:'l',caps:true,...DC}).svg;
    body+=sBlock(desc,{x:X(14.17),top:TOP(34.92,9*sy),maxW:W*0.4,size:9*sy,min:7*sy,fill:GRAY,a:'l',caps:true,...DC}).svg;
    body+=sBlock(f.grape,{x:Rx,top:TOP(46.81,szB),maxW:W*0.32,size:szB,min:szB*0.7,fill:GRAY,a:'r',...AR}).svg;
    body+=sBlock(f.classification,{x:Rx,top:TOP(34.81,szB),maxW:W*0.32,size:szB,min:szB*0.7,fill:GRAY,a:'r',...AR}).svg;
    body+=sBlock(f.vintage,{x:X(14.17),top:TOP(14.93,szHd),maxW:W*0.25,size:szHd,min:szHd*0.7,fill:INK,a:'l',...DC}).svg;
    body+=sBlock(alc,{x:Rx,top:TOP(14.41,szAlc),maxW:W*0.32,size:szAlc,min:szAlc*0.7,fill:GRAY,a:'r',...AR}).svg;
  }
  return sWrap(W,H,twMM,thMM,'#ffffff',body);
}

/* ---- 3) FLORA & FAUNA — botanical, centred serif, sprigs ---- */
function styleFlora(f,W,H,seed,twMM,thMM){
  const cx=W/2,cW=W-2*SM,fsc=Math.max(1,Math.min(W/1000,H/800)),U=p=>p*PT_U*fsc;
  const bg=(seed%2)?'#efe8d6':'#f2eddf',ink='#33341f',sub='#6a6a4c',leaf='#5f6b39',ac=f.accent;
  const sc=fsc*1.0; let body='';
  body+=sImage('flora',W*0.22,H*0.13,W*0.56,H*0.30,'contain');   // centred botanical block above the name
  // top ornament: symmetric sprig pair
  const oy=SM+U(10);
  body+=sSprig(cx-U(1.5),oy,sc,leaf,ac,-1)+sSprig(cx+U(1.5),oy,sc,leaf,ac,1);
  let y=oy+U(6);
  body+=sBlock(f.producer,{x:cx,top:y,maxW:cW*0.8,size:U(9.5),min:U(8),f:SF.cormorant,w:600,fill:sub,a:'c',tr:0.22,caps:true}).svg;
  if(f.producer) y+=U(13);
  const wn=sBlock(f.wine,{x:cx,top:y,maxW:cW*0.92,size:Math.max(U(23),0.125*H),min:U(15),lines:2,f:SF.fraunces,w:600,fill:ink,a:'c',lh:1.04});
  body+=wn.svg; y=wn.bottom+U(3);
  const ap=sBlock(f.appellation,{x:cx,top:y,maxW:cW*0.8,size:U(12.5),min:U(9),lines:1,f:SF.cormorant,w:500,fill:sub,a:'c',ital:true});
  body+=ap.svg; if(f.appellation) y=ap.bottom+U(2);
  // small leaf divider
  const dy=y+U(4); body+=`<line x1="${(cx-U(16)).toFixed(1)}" y1="${dy.toFixed(1)}" x2="${(cx-U(3)).toFixed(1)}" y2="${dy.toFixed(1)}" stroke="${leaf}" stroke-width="${U(0.7).toFixed(2)}"/>`
    +`<line x1="${(cx+U(3)).toFixed(1)}" y1="${dy.toFixed(1)}" x2="${(cx+U(16)).toFixed(1)}" y2="${dy.toFixed(1)}" stroke="${leaf}" stroke-width="${U(0.7).toFixed(2)}"/>`
    +sLeaf(cx-U(2.5),dy,U(6),U(2.4),0,leaf)+sLeaf(cx+U(2.5),dy,U(6),U(2.4),180,leaf);
  // footer stack centred
  const items=[
    {str:f.grape,size:U(12),f:SF.cormorant,w:600,fill:ink,maxW:cW*0.86},
    {str:[f.region,f.special].filter(Boolean).join(' · '),size:U(10),f:SF.cormorant,w:500,fill:sub,maxW:cW*0.86},
    {str:f.classification,size:U(9.5),f:SF.cormorant,w:500,fill:sub,ital:true,maxW:cW*0.8},
    {str:f.vintage,size:U(12),f:SF.fraunces,w:600,fill:ink,maxW:cW*0.5},
    {str:f.descriptor,size:U(8.5),f:SF.cormorant,w:500,fill:sub,tr:0.06,maxW:cW*0.86},
    {str:f.alc,size:U(8.5),f:SF.cormorant,w:500,fill:sub,maxW:cW*0.7}
  ];
  body+=stackUp(items,cx,H-SM,U(3.2),'c',cW*0.86).svg;
  return sWrap(W,H,twMM,thMM,bg,body);
}

/* ---- 4) PREMIUM — refined, gold rules + monogram crest, light or dark ---- */
function stylePremium(f,W,H,seed,twMM,thMM){
  const cx=W/2,Lx=SM,Rx=W-SM,cW=W-2*SM,fsc=Math.max(1,Math.min(W/1000,H/800)),U=p=>p*PT_U*fsc;
  const dark=(seed%2===1); const bg=dark?'#20281f':'#f4efe3';
  const ink=dark?'#f0e6cf':'#2b2a22', sub=dark?'#cbb483':'#736b52';
  const id='g'+(++__sid); const gold=`url(#${id})`;
  const defs=`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2c988"/><stop offset="0.5" stop-color="#b58f4c"/><stop offset="1" stop-color="#8c6a32"/></linearGradient>`;
  let body='';
  body+=sImage('premium',W*0.30,H*0.15,W*0.40,H*0.28,'contain',dark?'#f4efe3':null);   // emblem block; plate keeps multiply visible on the dark variant
  // thin gold double frame inside the margin
  const fx=Lx+U(3),fy=SM+U(3),fw=W-2*fx,fh=H-2*fy;
  body+=`<rect x="${fx.toFixed(1)}" y="${fy.toFixed(1)}" width="${fw.toFixed(1)}" height="${fh.toFixed(1)}" fill="none" stroke="${gold}" stroke-width="${U(1.1).toFixed(2)}"/>`
      +`<rect x="${(fx+U(2)).toFixed(1)}" y="${(fy+U(2)).toFixed(1)}" width="${(fw-U(4)).toFixed(1)}" height="${(fh-U(4)).toFixed(1)}" fill="none" stroke="${gold}" stroke-width="${U(0.5).toFixed(2)}"/>`;
  // crest
  const ini=sInitials(f.producer); let y=SM+U(11);
  if(ini){const cr=U(13);body+=`<circle cx="${cx.toFixed(1)}" cy="${(y+cr*0.5).toFixed(1)}" r="${cr.toFixed(1)}" fill="none" stroke="${gold}" stroke-width="${U(0.9).toFixed(2)}"/>`;
    body+=sBlock(ini,{x:cx,top:y+cr*0.5-U(6),maxW:cr*1.5,size:U(11),min:U(8),f:SF.cinzel,w:600,fill:gold,a:'c',tr:0.04}).svg; y+=cr+U(9);}
  body+=sBlock(f.producer,{x:cx,top:y,maxW:cW*0.7,size:U(9),min:U(7.5),f:SF.cinzel,w:500,fill:sub,a:'c',tr:0.24,caps:true}).svg;
  if(f.producer) y+=U(13);
  // gold hairline above the name
  body+=`<line x1="${(cx-U(20)).toFixed(1)}" y1="${y.toFixed(1)}" x2="${(cx+U(20)).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${gold}" stroke-width="${U(0.6).toFixed(2)}"/>`; y+=U(6);
  const wn=sBlock(f.wine,{x:cx,top:y,maxW:cW*0.82,size:Math.max(U(21),0.115*H),min:U(14),lines:2,f:SF.cinzel,w:600,fill:ink,a:'c',tr:0.03,lh:1.12});
  body+=wn.svg; y=wn.bottom+U(4);
  body+=`<line x1="${(cx-U(14)).toFixed(1)}" y1="${y.toFixed(1)}" x2="${(cx+U(14)).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${gold}" stroke-width="${U(0.6).toFixed(2)}"/>`; y+=U(6);
  const ap=sBlock(f.appellation,{x:cx,top:y,maxW:cW*0.8,size:U(11),min:U(8.5),lines:1,f:SF.cinzel,w:500,fill:sub,a:'c',tr:0.08,caps:true});
  body+=ap.svg;
  // footer refined caps, gold vintage
  const items=[
    {str:f.grape,size:U(11),f:SF.cinzel,w:500,fill:ink,tr:0.06,maxW:cW*0.82},
    {str:[f.region,f.special].filter(Boolean).join('  ·  '),size:U(9),f:SF.cinzel,w:500,fill:sub,tr:0.08,maxW:cW*0.82},
    {str:f.classification,size:U(9),f:SF.cormorant,w:600,fill:sub,ital:true,maxW:cW*0.78},
    {str:f.vintage,size:U(13),f:SF.cinzel,w:600,fill:gold,tr:0.06,maxW:cW*0.5},
    {str:f.descriptor,size:U(8),f:SF.cinzel,w:500,fill:sub,tr:0.1,caps:true,maxW:cW*0.82},
    {str:f.alc,size:U(8),f:SF.cormorant,w:600,fill:sub,maxW:cW*0.7}
  ];
  body+=stackUp(items,cx,H-SM-U(10),U(3.4),'c',cW*0.82).svg;
  return sWrap(W,H,twMM,thMM,bg,body,defs);
}

/* ---- 5) MINIMALIST — sparse type, one hairline, generous whitespace ---- */
/* ---- 5) MINIMALIST — six fixed compositions from Minimalist.pdf
   (ref artboard 311.811x226.772pt). Helvetica/Helvetica-Light -> Archivo
   400/300; ink #231F20 hero, grey #8A8780 details; letterspaced caps;
   band and circle artwork zones, one text-only composition. ---- */
function styleMinimal(f,W,H,seed,twMM,thMM){
  const sx=W/311.811, sy=H/226.772;
  const INK='#231F20', GRAY='#8A8780';
  const X=px=>px*sx, TOP=(bl,sz)=>(226.772-bl)*sy-0.80*sz;
  const cx=W/2;
  const L3={f:SF.archivo,w:300}, R4={f:SF.archivo,w:400};
  const szHero=20.68*sy, szApp=10.49*sy, szP=8.5*sy, szF=7*sy;
  const line1=[f.grape,f.classification,f.region].filter(Boolean).join(' / ');
  const line2=[f.special,f.vintage,f.alc?('Alc.: '+f.alc.replace(/\s{2,}/g,' / ')+'.'):''].filter(Boolean).join(' / ');
  const variant=Math.floor(seed/2)%6;
  const left=(variant===0||variant===3);
  const ax=left?'l':'c', Xa=left?X(14.17):cx;
  let body='';
  const zones=[
    {focal:[0,0.18,1,0.375],fade:[0,0.065,1,0.535],shape:'band'},
    {focal:[0.371,0.225,0.629,0.575],fade:[0.32,0.15,0.68,0.645],shape:'ellipse'},
    null,
    {focal:[0,0.245,1,0.55],fade:[0,0.18,1,0.615],shape:'band'},
    {focal:[0.411,0.275,0.589,0.525],fade:[0.342,0.18,0.658,0.615],shape:'ellipse'},
    {focal:[0.411,0.315,0.589,0.565],fade:[0.342,0.22,0.658,0.655],shape:'ellipse'}];
  if(zones[variant]) body+=sImageZone('minimalist',zones[variant],W,H);
  // producer: straight letterspaced caps, or arched over the circle (comps 3 & 6)
  if(variant===2)      body+=sArcText(f.producer,cx,TOP(199,szP)+0.8*szP,160*sy,{f:SF.archivo,w:300,size:szP,fill:GRAY,tr:0.42,caps:true});
  else if(variant===5) body+=sArcText(f.producer,cx,TOP(192.6,szP)+0.8*szP,160*sy,{f:SF.archivo,w:300,size:szP,fill:GRAY,tr:0.42,caps:true});
  else body+=sBlock(f.producer,{x:Xa,top:TOP(205.81,szP),maxW:W*0.5,size:szP,min:szP*0.7,fill:GRAY,a:ax,caps:true,tr:0.42,...L3}).svg;
  const heroY={0:106.80,1:56.22,2:105.66,3:51.24,4:51.24,5:51.24}[variant];
  const appY={0:90.22,1:39.64,2:89.08,3:36.65,4:36.65,5:36.65}[variant];
  body+=sBlock(f.wine,{x:Xa,top:TOP(heroY,szHero),maxW:W*0.9,size:szHero,min:szHero*0.5,fill:INK,a:ax,caps:true,tr:0.26,...L3}).svg;
  body+=sBlock(f.appellation,{x:Xa,top:TOP(appY,szApp),maxW:W*0.6,size:szApp,min:szApp*0.7,fill:GRAY,a:ax,...R4}).svg;
  body+=sBlock(line1,{x:Xa,top:TOP(22.76,szF),maxW:W*0.75,size:szF,min:szF*0.75,fill:GRAY,a:ax,...R4}).svg;
  body+=sBlock(line2,{x:Xa,top:TOP(14.36,szF),maxW:W*0.75,size:szF,min:szF*0.75,fill:GRAY,a:ax,...R4}).svg;
  return sWrap(W,H,twMM,thMM,'#ffffff',body);
}

/* ---- 6) ARTISTIC / PUNK — oversized condensed name, marker accents, ink scrawl ---- */
function styleArtistic(f,W,H,seed,twMM,thMM){
  const Lx=SM,Rx=W-SM,cx=W/2,cW=W-2*SM,fsc=Math.max(1,Math.min(W/1000,H/800)),U=p=>p*PT_U*fsc;
  const dark=(seed%3===2); const bg=dark?'#161412':(seed%3===1?'#efe7d3':'#f3efe6');
  const ink=dark?'#f4efe3':'#171512', ac=f.accent, mark=dark?ac:'#171512';
  const rot=(seed%2===0)?-4:3.5;
  let body='';
  // artwork: full-bleed poster on light variants; torn-poster block with a light plate on dark
  body+=dark?sImage('artistic',W*0.18,H*0.16,W*0.64,H*0.34,'contain','#f3efe6')
            :sImage('artistic',-SBLEED,-SBLEED,W+2*SBLEED,H+2*SBLEED,'cover');
  // producer — marker, angled, top-left
  body+=`<g transform="rotate(${(rot*0.6).toFixed(1)} ${Lx.toFixed(1)} ${(SM+U(6)).toFixed(1)})">`
      +sBlock(f.producer,{x:Lx,top:SM,maxW:cW*0.8,size:U(15),min:U(10),f:SF.caveat,w:700,fill:ac,a:'l'}).svg+`</g>`;
  // hero — oversized Anton, slightly rotated about its own centre; sized to leave room for the tilt
  let y=H*0.27;
  const heroBase=Math.max(U(24),0.14*H);
  const wn=sBlock(f.wine,{x:cx,top:y,maxW:cW*0.9,size:heroBase,min:U(16),lines:2,f:SF.anton,w:400,fill:ink,a:'c',tr:0.01,lh:0.94});
  body+=`<g transform="rotate(${rot} ${cx.toFixed(1)} ${((y+wn.bottom)/2).toFixed(1)})">${wn.svg}</g>`;
  y=wn.bottom+U(3);
  // rough ink underline under the name
  const uy=y; body+=`<path d="M ${(cx-cW*0.34).toFixed(1)} ${uy.toFixed(1)} q ${(cW*0.17).toFixed(1)} ${U(3).toFixed(1)} ${(cW*0.34).toFixed(1)} ${U(0.5).toFixed(1)} q ${(cW*0.17).toFixed(1)} ${(-U(3)).toFixed(1)} ${(cW*0.34).toFixed(1)} ${U(1).toFixed(1)}" fill="none" stroke="${ac}" stroke-width="${U(1.6).toFixed(1)}" stroke-linecap="round"/>`;
  y+=U(8);
  const ap=sBlock(f.appellation,{x:cx,top:y,maxW:cW*0.9,size:U(12),min:U(9),lines:1,f:SF.caveat,w:600,fill:ink,a:'c'});
  body+=ap.svg; if(f.appellation) y=ap.bottom+U(1);
  const gr=sBlock(f.grape,{x:cx,top:y,maxW:cW*0.9,size:U(11),min:U(8.5),lines:1,f:SF.archivo,w:600,fill:ink,a:'c',tr:0.02});
  body+=gr.svg;
  // big handwritten vintage bottom-left, alc bottom-right, descriptor centre
  body+=sBlock(f.vintage,{x:Lx,top:H-SM-U(18),maxW:cW*0.4,size:U(15),min:U(11),f:SF.caveat,w:700,fill:ac,a:'l'}).svg;
  body+=sBlock(f.alc,{x:Rx,top:H-SM-U(8),maxW:cW*0.34,size:U(8.5),min:U(7),f:SF.archivo,w:600,fill:ink,a:'r',tr:0.02}).svg;
  body+=sBlock([f.region,f.special,f.classification,f.descriptor].filter(Boolean).join('  ·  '),
    {x:cx,top:H-SM-U(8),maxW:cW*0.44,size:U(8),min:U(7),f:SF.archivo,w:500,fill:ink,a:'c',tr:0.02}).svg;
  return sWrap(W,H,twMM,thMM,bg,body);
}

const STYLE_LIST=[
  {key:'traditional',name:'Traditional'},
  {key:'contemporary',name:'Contemporary'},
  {key:'flora',name:'Flora & Fauna'},
  {key:'premium',name:'Premium'},
  {key:'minimalist',name:'Minimalist'},
  {key:'artistic',name:'Artistic / Punk'}
];
function renderStyleOptions(d,order,opts){
  opts=opts||{}; const seed=opts.seed|0;
  const twMM=Math.max(30,(+opts.widthMM||110)), thMM=Math.max(30,(+opts.heightMM||80));
  const W=twMM*10, H=thMM*10, f=sFields(d);
  return STYLE_LIST.map(st=>{let svg;
    try{
      if(st.key==='traditional') svg=styleTraditional(d,order,seed,twMM,thMM);
      else if(st.key==='contemporary') svg=styleContemporary(f,W,H,seed,twMM,thMM);
      else if(st.key==='flora') svg=styleFlora(f,W,H,seed,twMM,thMM);
      else if(st.key==='premium') svg=stylePremium(f,W,H,seed,twMM,thMM);
      else if(st.key==='minimalist') svg=styleMinimal(f,W,H,seed,twMM,thMM);
      else svg=styleArtistic(f,W,H,seed,twMM,thMM);
    }catch(e){ svg=sWrap(W,H,twMM,thMM,'#f4f2ec',`<text x="${(W/2).toFixed(1)}" y="${(H/2).toFixed(1)}" text-anchor="middle" font-family="${SF.jost}" font-size="${(14*PT_U).toFixed(1)}" fill="#a33">${esc(st.name)}</text>`); }
    return {name:st.name,rank:st.key,style:st.key,desc:st.name,svg};
  });
}

window.LabelEngine={FONTS_URL,ensureFonts,renderPriorityOptions,renderStyleOptions,STYLE_LIST,previewLayout,renderOptions,renderLabel,LC_COMPS};
})();

