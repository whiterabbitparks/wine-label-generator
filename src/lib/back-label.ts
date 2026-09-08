import QRCode from "qrcode";

/* BACK LABEL v5 — TEMPLATE-EXACT (owner 2026-09-07: WAIN/Back Label/
   back-label-template.svg, 80×80mm, Barlow Condensed). PURE CODE —
   nothing AI-generated. Sizes are the template's exactly: name 12pt
   semibold, description/columns 8pt, everything else 7pt. Producer LEFT,
   importer RIGHT-aligned, one LOT/ALC/SULFITES line, ground colour stops
   at y61.5 → clean white codes band (QR left, BOTTLED beside, EAN right).
   Empty fields disappear with their titles. Extra markets flow into the
   regulatory zone; width climbs a ladder when they don't fit. */

export interface BackLabelData {
  wine?: string;
  producer?: string;
  description?: string;
  importer?: string;
  /* v5 template (owner 2026-09-07): producer/importer split into company +
     address; joined `producer`/`importer` remain as fallbacks */
  producerCompany?: string;
  producerAddress?: string;
  importerCompany?: string;
  importerAddress?: string;
  bottlingDate?: string;
  lot?: string;
  web?: string;
  alcohol?: string;
  volume?: string;
  countryOfOrigin?: string;
  energyKcal?: string;
  barcodeDigits?: string;
  qrUrl?: string;
  /** uploaded artwork (data URLs) replaces the generated codes */
  barcodeImage?: string;
  qrImage?: string;
}

const PT = 0.3528;
const S12 = 12 * PT, S8 = 8 * PT, S7 = 7 * PT;
/* Barlow Condensed measured at 0.398×size per char — the only Google face
   as narrow as the template's Avenir Next Condensed (Archivo Narrow ran
   0.51 and physically overflowed into the codes) */
const FAM = "'Barlow Condensed', 'Avenir Next Condensed', Helvetica, sans-serif";

/* condensed-face width model (mm) */
/* script-aware width model (measured): condensed Latin 0.41×size; CJK and
   Hangul glyphs are full-width; Hebrew/Georgian sit in between */
/* REAL Barlow Condensed 400 advances (round 18 #2: measured per glyph in
   Chrome at 100px, ÷100 — the old flat 0.41 model overestimated spaces
   (real 0.20) and narrow letters, wrapping lines far too early) */
const W400: Record<string, number> = {"0":0.444,"1":0.256,"2":0.402,"3":0.408,"4":0.415,"5":0.409,"6":0.41,"7":0.366,"8":0.422,"9":0.403,"A":0.41,"B":0.449,"C":0.446,"D":0.465,"E":0.429,"F":0.404,"G":0.451,"H":0.472,"I":0.215,"J":0.426,"K":0.452,"L":0.396,"M":0.521,"N":0.493,"O":0.456,"P":0.442,"Q":0.443,"R":0.443,"S":0.416,"T":0.423,"U":0.476,"V":0.439,"W":0.623,"X":0.434,"Y":0.424,"Z":0.395,"a":0.413,"b":0.423,"c":0.402,"d":0.423,"e":0.407,"f":0.277,"g":0.413,"h":0.424,"i":0.208,"j":0.2,"k":0.405,"l":0.181,"m":0.648,"n":0.424,"o":0.415,"p":0.428,"q":0.428,"r":0.292,"s":0.374,"t":0.267,"u":0.424,"v":0.379,"w":0.554,"x":0.376,"y":0.368,"z":0.361," ":0.2,".":0.19,",":0.177,":":0.211,";":0.193,"/":0.334,"(":0.222,")":0.222,"%":0.781,"&":0.542,"'":0.119,"\"":0.235,"-":0.313,"\u2013":0.372,"\u2014":0.592,"\u201c":0.25,"\u201d":0.25,"\u2019":0.123,"!":0.251,"?":0.37,"@":0.761,"#":0.589};
const charW = (ch: string) => {
  const c = ch.codePointAt(0) || 0;
  if ((c >= 0x2e80 && c <= 0x9fff) || (c >= 0x3040 && c <= 0x30ff) || (c >= 0xac00 && c <= 0xd7af) || (c >= 0xff00 && c <= 0xffef) || c === 0x30fb) return 1.02;
  if (c >= 0x0590 && c <= 0x05ff) return 0.5;   // Hebrew
  if (c >= 0x10a0 && c <= 0x10ff) return 0.55;  // Georgian
  return W400[ch] ?? 0.41;
};
/* 1.5% safety so a hair-wide estimate never overflows the printed line */
const tw = (t: string, size: number) => { let w = 0; for (const ch of t) w += charW(ch) * size; return w * 1.015; };
function wrap(text: string, size: number, maxW: number): string[] {
  /* CJK sentences carry no spaces — break oversized tokens by character */
  const words = text.split(/\s+/).filter(Boolean).flatMap((w) => {
    if (tw(w, size) <= maxW) return [w];
    const parts: string[] = [];
    let cur = "";
    for (const ch of w) {
      if (tw(cur + ch, size) > maxW && cur) { parts.push(cur); cur = ch; }
      else cur += ch;
    }
    if (cur) parts.push(cur);
    return parts;
  });
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const tri = cur ? cur + " " + w : w;
    if (tw(tri, size) <= maxW || !cur) cur = tri;
    else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out;
}

/* ---- EAN-13 ---- */
const L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
const PARITY = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];
export function ean13(digits?: string): { digits: string; modules: string } {
  let d = String(digits || "").replace(/\D/g, "");
  if (d.length === 13) d = d.slice(0, 12);
  if (d.length !== 12) d = "482" + Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join("");
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (+d[i]) * (i % 2 ? 3 : 1);
  const full = d + ((10 - (sum % 10)) % 10);
  const par = PARITY[+full[0]];
  let m = "101";
  for (let i = 1; i <= 6; i++) m += (par[i - 1] === "L" ? L : G)[+full[i]];
  m += "01010";
  for (let i = 7; i <= 12; i++) m += R[+full[i]];
  m += "101";
  return { digits: full, modules: m };
}

export const MARKETS: Record<string, { name: string; confidence: "high" | "medium" | "low" }> = {
  EU: { name: "European Union", confidence: "high" },
  US: { name: "United States", confidence: "high" },
  GB: { name: "United Kingdom", confidence: "medium" },
  CA: { name: "Canada", confidence: "medium" },
  AU: { name: "Australia", confidence: "medium" },
  NZ: { name: "New Zealand", confidence: "medium" },
  JP: { name: "Japan", confidence: "low" },
  KR: { name: "South Korea", confidence: "low" },
  CN: { name: "China", confidence: "low" },
  BR: { name: "Brazil", confidence: "low" },
  MX: { name: "Mexico", confidence: "medium" },
  IL: { name: "Israel", confidence: "low" },
  GE: { name: "Georgia (domestic)", confidence: "low" },
};

/* REGULATORY ZONE content (owner 2026-09-04): the template's US warning
   area is THE regulatory zone — it holds the SELECTED markets' texts.
   Allergen, importer, product-of live once in their own zones; blocks
   here carry only what is unique to each market. */
function regulatoryBlocks(codes: string[], d: Required<BackLabelData>): string[] {
  const out: string[] = [];
  const imp = d.importer.toUpperCase();
  if (codes.includes("US")) out.push(
    "GOVERNMENT WARNING: (1) ACCORDING TO THE SURGEON GENERAL, WOMEN SHOULD NOT DRINK ALCOHOLIC BEVERAGES DURING PREGNANCY BECAUSE OF THE RISK OF BIRTH DEFECTS. (2) CONSUMPTION OF ALCOHOLIC BEVERAGES IMPAIRS YOUR ABILITY TO DRIVE A CAR OR OPERATE MACHINERY, AND MAY CAUSE HEALTH PROBLEMS.");
  if (codes.includes("EU")) out.push(
    `E ${Math.round(+d.energyKcal * 4.184)} KJ / ${d.energyKcal} KCAL PER 100 ML. INGREDIENTS & NUTRITION VIA THE QR E-LABEL.`);
  if (codes.includes("AU") || codes.includes("NZ")) out.push(
    `PREGNANCY WARNING: ALCOHOL CAN CAUSE LIFELONG HARM TO YOUR BABY. CONTAINS APPROX. ${(Number(d.volume) * Number(d.alcohol) / 100 / 12.7).toFixed(1)} STANDARD DRINKS. [OFFICIAL PICTOGRAM REQUIRED]`);
  if (codes.includes("JP")) out.push(
    `果実酒 ・ アルコール分 ${d.alcohol}% ・ 内容量 ${d.volume}ML ・ 輸入者: ${imp} ・ 妊娠中や授乳期の飲酒は、胎児・乳児の発育に悪影響を与えるおそれがあります。`);
  if (codes.includes("KR")) out.push(
    `수입자: ${imp} ・ 경고: 지나친 음주는 간경화나 간암을 일으키며, 임신 중 음주는 태아의 기형 발생 위험을 높입니다.`);
  if (codes.includes("CN")) out.push(
    `葡萄酒 ・ 酒精度 ${d.alcohol}%VOL ・ 净含量 ${d.volume}ML ・ 进口商: ${imp} ・ 过量饮酒有害健康`);
  if (codes.includes("BR")) out.push(
    "CONTÉM SULFITOS. BEBA COM MODERAÇÃO. VENDA PROIBIDA PARA MENORES DE 18 ANOS.");
  if (codes.includes("MX")) out.push(
    "EL ABUSO EN EL CONSUMO DE ESTE PRODUCTO ES NOCIVO PARA LA SALUD.");
  if (codes.includes("IL")) out.push(
    "אזהרה: צריכה מופרזת של אלכוהול מסכנת חיים ומזיקה לבריאות!");
  if (codes.includes("GE")) out.push(
    `მწარმოებელი: ${d.producer.toUpperCase()} ・ ალკოჰოლი ${d.alcohol}% ・ ${d.volume} მლ`);
  return out;
}

/* allergen appears ONCE — spelling/language follows the market mix */
function allergenLines(codes: string[]): string[] {
  const us = codes.includes("US");
  const eu = codes.some((c) => ["EU", "GB", "AU", "NZ"].includes(c));
  const en = us && eu ? "CONTAINS SULFITES (SULPHITES)" : us ? "CONTAINS SULFITES" : "CONTAINS SULPHITES";
  const out = [en];
  if (codes.includes("CA")) out.push("CONTIENT : SULFITES");
  return out;
}

export async function composeBackLabel(
  raw: BackLabelData,
  opts: { heightMM: number; markets: string[]; bgColor?: string; bleedMM?: number }
): Promise<{ svg: string; widthMM: number; heightMM: number; barcodeDigits: string }> {
  /* TEMP demo placeholders (owner RESTORED 2026-09-07 for testing speed —
     switch off before launch): empty fields fall back to sample content */
  const d: Required<BackLabelData> = {
    wine: raw.wine || "Saperavi Reserve",
    producer: raw.producer || "Popiashvili Cellars LLC, Kakheti, Georgia",
    description: raw.description || "A dry red wine from old Saperavi vines. Deep garnet colour; dark berries, tobacco leaf and warm spice on the nose; firm but polished tannins carry a long mineral finish. Eight months in traditional qvevri.",
    importer: raw.importer || "Teller Wines LLC, 148 W 68 st., 10023 NYC, USA",
    producerCompany: raw.producerCompany || (raw.producer || "").split(",")[0].trim() || "\u201cPopiashvili Cellars\u201d LLC",
    producerAddress: raw.producerAddress || (raw.producer || "").split(",").slice(1).join(",").trim() || "36 Chikovani st., 0171 Tbilisi, Georgia",
    importerCompany: raw.importerCompany || (raw.importer || "").split(",")[0].trim() || "\u201cTeller Wines\u201d LLC",
    importerAddress: raw.importerAddress || (raw.importer || "").split(",").slice(1).join(",").trim() || "148 W 68 st., 10023 NYC, USA",
    bottlingDate: raw.bottlingDate || "29/04/2026",
    lot: raw.lot || "2606142",
    web: raw.web || "www.popiashvili.com",
    alcohol: raw.alcohol || "12.5",
    volume: raw.volume || "750",
    countryOfOrigin: raw.countryOfOrigin || "Georgia",
    energyKcal: raw.energyKcal || "81",
    barcodeDigits: raw.barcodeDigits || "",
    qrUrl: raw.qrUrl || "",
    barcodeImage: raw.barcodeImage || "",
    qrImage: raw.qrImage || "",
  };
  const BASE = 80;                       // template face, mm
  const s = opts.heightMM / BASE;        // whole face scales with front height
  const up = (t: string) => t.toUpperCase();
  const T = (x: number, y: number, size: number, text: string, weight = 400, anchor = "start") =>
    `<text x="${(x * s).toFixed(2)}" y="${(y * s).toFixed(2)}" font-size="${(size * s).toFixed(2)}" font-weight="${weight}" text-anchor="${anchor}" font-family="${FAM}">${esc(text)}</text>`;

  /* — v5 TEMPLATE (owner 2026-09-07: WAIN/Back Label/back-label-template.svg,
     80×80mm, coordinates decoded from the file, pt÷2.83465→mm): title row =
     wine name LEFT (12pt semibold) + "By BRAND" RIGHT; description;
     PRODUCER block LEFT | IMPORTED BY block RIGHT-aligned; PRODUCT OF |
     WWW; ONE LOT / ALC / CONTAINS SULFITES line; then the regulatory zone
     (selected markets' texts). The GROUND COLOUR STOPS at y61.5 — below is
     a CLEAN WHITE codes band: QR left (14.55mm at x4), BOTTLED + See
     ingredients beside it, EAN right with digits. Empty fields disappear
     WITH their titles; rules stay (structure). Content still flows and the
     width ladder still absorbs many markets. — */
  const reg = regulatoryBlocks(opts.markets, d);
  const allergen = allergenLines(opts.markets);
  const impSuffix = opts.markets.length === 1 ? ` (${opts.markets[0]})` : "";
  const BAND_TOP = 61.5;             // the ground colour stops here (template 174.33pt)
  const LH8 = 3.38, LH7 = 2.9;
  const brand = up(d.producerCompany.replace(/["\u201c\u201d'\u2019]/g, "").replace(/\b(LLC|LTD|INC|GMBH|S\.?A\.?|CO\.?|COMPANY|WINERY|CELLARS?)\.?,?\s*$/i, "").trim());

  const layoutAt = (W: number) => {
    const RM = W - 4;                // right margin (template 11.34pt = 4mm)
    const CW = W - 8;                // content width
    const parts: { y: number; x: number; size: number; text: string; weight?: number; anchor?: string }[] = [];
    const rich: string[] = [];       // pre-built svg fragments (mixed-weight rows)
    const rules: number[] = [];
    /* title row (template: KORRA @6.70, By NATIA right) */
    let y = 6.7;
    if (d.wine) parts.push({ y, x: 4, size: S12, text: up(d.wine), weight: 600 });
    if (brand) rich.push(
      `<text x="${(RM * s).toFixed(2)}" y="${(y * s).toFixed(2)}" font-size="${(S12 * s).toFixed(2)}" text-anchor="end" font-family="${FAM}">` +
      `<tspan font-weight="400">By</tspan><tspan font-weight="600" dx="${(0.9 * s).toFixed(2)}">${esc(brand)}</tspan></text>`);
    y += 1.7; rules.push(y);         // rule @8.40
    /* description (template @12.00, 8pt, pitch 3.38) */
    y += 3.6;
    const descLines = wrap(d.description, S8, CW);
    for (const ln of descLines) { parts.push({ y, x: 4, size: S8, text: ln }); y += LH8; }
    if (!descLines.length) y += LH8; // keep the template's empty-row height
    y = y - LH8 + 1.6; rules.push(y); // rule (template @13.60 with one line)
    /* producer LEFT | importer RIGHT (template @17.40, 8pt, pitch 3.38) */
    const colW = (CW - 4) / 2;
    let yl = y + 3.8, yr = y + 3.8;
    if (d.producerCompany || d.producerAddress) {
      parts.push({ y: yl, x: 4, size: S8, text: `PRODUCER: ${d.producerCompany}${d.producerAddress ? "," : ""}` }); yl += LH8;
      for (const ln of wrap(d.producerAddress, S8, colW)) { parts.push({ y: yl, x: 4, size: S8, text: ln }); yl += LH8; }
    }
    if (d.importerCompany || d.importerAddress) {
      parts.push({ y: yr, x: RM, size: S8, text: `IMPORTED BY${impSuffix}: ${d.importerCompany}${d.importerAddress ? "," : ""}`, anchor: "end" }); yr += LH8;
      for (const ln of wrap(d.importerAddress, S8, colW)) { parts.push({ y: yr, x: RM, size: S8, text: ln, anchor: "end" }); yr += LH8; }
    }
    y = Math.max(yl, yr, y + 3.8 + LH8) - LH8 + 1.83; rules.push(y);   // rule (template @26.00)
    /* PRODUCT OF | WWW (template @29.40, 7pt) */
    if (d.countryOfOrigin)
      parts.push({ y: y + 3.4, x: 4, size: S7, text: `PRODUCT OF ${up(d.countryOfOrigin)}.${opts.markets.includes("CA") ? ` / PRODUIT DE ${up(d.countryOfOrigin)}.` : ""}` });
    if (d.web) parts.push({ y: y + 3.4, x: RM, size: S7, text: up(d.web), anchor: "end" });
    y += 3.4 + 1.9; rules.push(y);   // rule (template @31.30)
    /* ONE line: LOT / ALC / CONTAINS SULFITES (template @34.80, 7pt) */
    const lotBits = [
      d.lot ? `LOT: L${d.lot}` : "",
      d.alcohol && d.volume ? `${d.alcohol}% ALC./VOL. ${d.volume} ML` : d.alcohol ? `${d.alcohol}% ALC./VOL.` : "",
      allergen.join(" / "),
    ].filter(Boolean);
    parts.push({ y: y + 3.5, x: 4, size: S7, text: lotBits.join(" / ") });
    y += 3.5 + 1.6; rules.push(y);   // rule (template @36.40)
    /* regulatory zone (down to the ground stop) */
    const zoneTop = y + 3.3;
    const zoneBottom = BAND_TOP - 1.4;
    const rcW = Math.min(72, CW);
    const nrc = Math.max(1, Math.floor((CW + 4) / (rcW + 4)));
    const rcRealW = (CW - (nrc - 1) * 4) / nrc;
    let rc = 0, ry = zoneTop;
    let overflow = false;
    for (const block of reg) {
      const lines = wrap(block, S7, rcRealW);
      const need = lines.length * LH7 + 1.4;
      if (ry + need - LH7 > zoneBottom && ry > zoneTop) { rc++; ry = zoneTop; }
      if (rc >= nrc || ry + need - LH7 > zoneBottom) { overflow = true; break; }
      for (const ln of lines) { parts.push({ y: ry, x: 4 + rc * (rcRealW + 4), size: S7, text: ln }); ry += LH7; }
      ry += 1.4;
    }
    return { parts, rich, rules, overflow };
  };

  /* width ladder: template width first, then grow carefully */
  let W = BASE, lay = layoutAt(W);
  for (const cand of [90, 100, 112, 126, 142, 160, 180, 205, 230]) {
    if (!lay.overflow) break;
    W = cand; lay = layoutAt(W);
  }

  /* ROUND 30 #1: legibility on dark grounds — everything printed ON the
     ground colour flips to white ink when the ground is darker than 50%
     grey; the codes band below y61.5 is always white, its ink stays black */
  const bg = /^#[0-9a-fA-F]{6}$/.test(opts.bgColor || "") ? (opts.bgColor as string) : "#FFFFFF";
  const luma = (parseInt(bg.slice(1, 3), 16) * 299 + parseInt(bg.slice(3, 5), 16) * 587 + parseInt(bg.slice(5, 7), 16) * 114) / 1000;
  const ink = luma < 128 ? "#FFFFFF" : "#000000";

  let layout = "";
  for (const r2 of lay.rules)
    layout += `<rect x="${(4 * s).toFixed(2)}" y="${(r2 * s).toFixed(2)}" width="${((W - 8) * s).toFixed(2)}" height="${(0.2 * s).toFixed(2)}"/>`;
  for (const pt2 of lay.parts) layout += T(pt2.x, pt2.y, pt2.size, pt2.text, pt2.weight || 400, pt2.anchor || "start");
  layout += lay.rich.join("");
  let body = `<g fill="${ink}">${layout}</g>`;

  /* — CODES BAND on clean white (template): QR 14.55mm at (4, 61.45);
     BOTTLED beside it @(21.3, 65.5) 7.7pt; See ingredients @(21.2, 76.0);
     EAN right-anchored with standard digit typography — */
  const bandTop = BAND_TOP;
  /* round 18 #3: QR ink runs EXACTLY from the ground-colour line (61.5) to
     the barcode digits' baseline (76.5) — margin 0, size 15.0 */
  const qrS = 15.0, qrX = 4, qrY = BAND_TOP;
  if (d.qrImage) {
    body += `<image x="${(qrX * s).toFixed(2)}" y="${(qrY * s).toFixed(2)}" width="${(qrS * s).toFixed(2)}" height="${(qrS * s).toFixed(2)}" href="${d.qrImage}"/>`;
  } else {
    const qrPng = await QRCode.toDataURL(d.qrUrl || d.web || "https://8klabels.example", { margin: 0, width: 300 });
    body += `<image x="${(qrX * s).toFixed(2)}" y="${(qrY * s).toFixed(2)}" width="${(qrS * s).toFixed(2)}" height="${(qrS * s).toFixed(2)}" href="${qrPng}"/>`;
  }
  if (d.bottlingDate) body += T(21.3, 65.5, 7.7 * PT, `BOTTLED: ${d.bottlingDate}`);
  body += T(21.2, 76.0, S7, "See ingredients");
  /* ROUND 27: no invented digits — the EAN renders ONLY from a real GTIN
     the winery typed (or a legacy uploaded image); otherwise the right
     side of the codes band stays clean (empty-fields-disappear law) */
  const bc = d.barcodeDigits ? ean13(d.barcodeDigits) : null;
  const bcW = 31.6, bx = W - 4.2 - bcW, bcH = 13.9;
  if (d.barcodeImage) {
    body += `<image x="${(bx * s).toFixed(2)}" y="${(bandTop * s).toFixed(2)}" width="${(bcW * s).toFixed(2)}" height="${(bcH * s).toFixed(2)}" href="${d.barcodeImage}"/>`;
  } else if (bc) {
    const mod = bcW / 95;
    const GUARD = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);
    for (let i = 0; i < bc.modules.length; i++)
      if (bc.modules[i] === "1")
        body += `<rect x="${((bx + i * mod) * s).toFixed(2)}" y="${(bandTop * s).toFixed(2)}" width="${(mod * s).toFixed(2)}" height="${((GUARD.has(i) ? bcH : bcH - 1.5) * s).toFixed(2)}" fill="#000"/>`;
    body += T(bx - 1.2, 76.5, S7, bc.digits[0], 400, "end");
    body += T(bx + 3 * mod + (42 * mod) / 2, 76.5, S7, bc.digits.slice(1, 7).split("").join("\u2009"), 400, "middle");
    body += T(bx + 50 * mod + (42 * mod) / 2, 76.5, S7, bc.digits.slice(7).split("").join("\u2009"), 400, "middle");
  }

  const Wmm = W * s;
  const H = BASE * s;
  /* 2mm print bleed on every side for deliverables (round 18 #1, as in the
     owner's template: backgrounds extend into the bleed, the ground-stop
     line stays exactly where it is) */
  const B = Math.max(0, opts.bleedMM || 0);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-B} ${-B} ${(Wmm + 2 * B).toFixed(1)} ${(H + 2 * B).toFixed(1)}" width="${(Wmm + 2 * B).toFixed(1)}mm" height="${(H + 2 * B).toFixed(1)}mm">` +
    /* clean white face; the ground colour covers ONLY above the codes band */
    `<rect x="${-B}" y="${-B}" width="${(Wmm + 2 * B).toFixed(1)}" height="${(H + 2 * B).toFixed(1)}" fill="#FFFFFF"/>` +
    `<rect x="${-B}" y="${-B}" width="${(Wmm + 2 * B).toFixed(1)}" height="${(BAND_TOP * s + B).toFixed(2)}" fill="${bg}"/>` +
    body + `</svg>`;
  return { svg, widthMM: Wmm + 2 * B, heightMM: H + 2 * B, barcodeDigits: bc?.digits || "" };
}

function esc(s2: string) {
  return s2.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
