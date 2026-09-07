import QRCode from "qrcode";

/* BACK LABEL v2 — TEMPLATE-EXACT (owner PDF 2026-09-03: WAIN/
   Back_Label_Template.pdf, 80×80mm, Avenir Next Condensed → Google's
   Archivo Narrow, installed in ~/Library/Fonts for librsvg; deploy
   machines need it too). PURE CODE — nothing AI-generated. Font sizes are
   the template's exactly: name 12pt, description+columns 8pt, everything
   else 7pt, ALL CAPS. Barcode 31.7×14.4mm bottom-right, QR 19.2mm beside
   it — always the same, per the owner's rule. Extra markets extend the
   width with 80mm panels; the base 80×80 face stays untouched.
   TEMP placeholders fill empty fields (REMOVE BEFORE LAUNCH). */

export interface BackLabelData {
  wine?: string;
  producer?: string;
  description?: string;
  importer?: string;
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
const charW = (ch: string) => {
  const c = ch.codePointAt(0) || 0;
  if ((c >= 0x2e80 && c <= 0x9fff) || (c >= 0x3040 && c <= 0x30ff) || (c >= 0xac00 && c <= 0xd7af) || (c >= 0xff00 && c <= 0xffef) || c === 0x30fb) return 1.02;
  if (c >= 0x0590 && c <= 0x05ff) return 0.5;   // Hebrew
  if (c >= 0x10a0 && c <= 0x10ff) return 0.55;  // Georgian
  return 0.41;
};
const tw = (t: string, size: number) => { let w = 0; for (const ch of t) w += charW(ch) * size; return w; };
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
  opts: { heightMM: number; markets: string[]; bgColor?: string }
): Promise<{ svg: string; widthMM: number; heightMM: number; barcodeDigits: string }> {
  /* placeholders removed (owner 2026-09-06): the label shows ONLY what the
     customer typed — empty fields simply stay empty. (Energy keeps a real
     default: it is computed information, not customer wording.) */
  const d: Required<BackLabelData> = {
    wine: raw.wine || "",
    producer: raw.producer || "",
    description: raw.description || "",
    importer: raw.importer || "",
    bottlingDate: raw.bottlingDate || "",
    lot: raw.lot || "",
    web: raw.web || "",
    alcohol: raw.alcohol || "",
    volume: raw.volume || "",
    countryOfOrigin: raw.countryOfOrigin || "",
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

  /* — v4 FLOW FACE (owner 2026-09-04): the template gives zone ORDER,
     rules, sizes and the bottom band; content FLOWS. Width climbs a
     ladder until everything fits the fixed height — wider face = longer
     paragraph lines = fewer rows. The regulatory zone (where the sample
     US warning sat) carries the SELECTED markets' texts, in columns when
     the face is wide. Codes never collide with text: the bottom band is
     reserved, allergen text gets its measured room, QR sits after it,
     EAN hugs the right edge. — */
  const reg = regulatoryBlocks(opts.markets, d);
  const allergen = allergenLines(opts.markets);
  const importerLabel = opts.markets.length === 1 ? `IMPORTED BY (${opts.markets[0]}):` : "IMPORTED BY:";
  const CODEBAND = 18.6;             // fixed bottom band height
  const LH8 = 3.4, LH7 = 2.9;

  const layoutAt = (W: number) => {
    const CW = W - 8.4;              // content width
    const parts: { y: number; x: number; size: number; text: string; weight?: number; anchor?: string }[] = [];
    const rules: number[] = [];
    let y = 6.7;
    parts.push({ y, x: 4.2, size: S12, text: up(d.wine), weight: 500 });
    y += 1.7; rules.push(y); y += 3.6;
    for (const ln of wrap(up(d.description), S8, CW)) { parts.push({ y, x: 4.2, size: S8, text: ln, weight: 500 }); y += LH8; }
    y = y - LH8 + 1.6; rules.push(y);
    /* importer | producer columns share the face width */
    const colW = (CW - 4) / 2, colR = 4.2 + colW + 4;
    let yl = y + 3.8, yr = y + 3.8;
    parts.push({ y: yl, x: 4.3, size: S8, text: importerLabel }); yl += LH8;
    parts.push({ y: yr, x: colR, size: S8, text: "PRODUCER:" }); yr += LH8;
    for (const ln of wrap(up(d.importer), S8, colW)) { parts.push({ y: yl, x: 4.3, size: S8, text: ln }); yl += LH8; }
    for (const ln of wrap(up(d.producer), S8, colW)) { parts.push({ y: yr, x: colR, size: S8, text: ln }); yr += LH8; }
    y = Math.max(yl, yr) - LH8 + 1.8; rules.push(y);
    parts.push({ y: y + 3.4, x: 4.3, size: S7, text: `PRODUCT OF ${up(d.countryOfOrigin)}.${opts.markets.includes("CA") ? ` / PRODUIT DE ${up(d.countryOfOrigin)}.` : ""}` });
    parts.push({ y: y + 3.4, x: colR, size: S7, text: up(d.web) });
    y += 3.4 + 1.9; rules.push(y);
    parts.push({ y: y + 3.5, x: 4.2, size: S7, text: `BOTTLED: ${d.bottlingDate}   /   LOT: L${d.lot}   /   ${d.alcohol}% ALC./VOL. ${d.volume} ML` });
    y += 3.5 + 1.6; rules.push(y);
    /* regulatory zone: flow blocks into columns of ~64mm */
    const zoneTop = y + 3.3;
    const zoneBottom = BASE - CODEBAND - 1.2;
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
      for (const ln of lines) { parts.push({ y: ry, x: 4.2 + rc * (rcRealW + 4), size: S7, text: ln }); ry += LH7; }
      ry += 1.4;
    }
    return { parts, rules, overflow, colR };
  };

  /* width ladder: template width first, then grow carefully */
  let W = BASE, lay = layoutAt(W);
  for (const cand of [90, 100, 112, 126, 142, 160, 180, 205, 230]) {
    if (!lay.overflow) break;
    W = cand; lay = layoutAt(W);
  }

  let body = "";
  for (const r2 of lay.rules)
    body += `<rect x="${(4.2 * s).toFixed(2)}" y="${(r2 * s).toFixed(2)}" width="${((W - 8.4) * s).toFixed(2)}" height="${(0.2 * s).toFixed(2)}" fill="#000"/>`;
  for (const pt2 of lay.parts) body += T(pt2.x, pt2.y, pt2.size, pt2.text, pt2.weight || 400, pt2.anchor || "start");

  /* — bottom band (reserved; nothing else may enter): allergen ·
     SEE INGREDIENTS · QR · EAN right-aligned — */
  const bandTop = BASE - CODEBAND + 0.1; // 61.5 at BASE=80
  let ay = bandTop + 1.7;
  let allergenW = 0;
  for (const ln of allergen) {
    for (const seg of wrap(ln, S7, 24)) {
      body += T(4.1, ay, S7, seg); ay += LH7;
      allergenW = Math.max(allergenW, tw(seg, S7));
    }
  }
  body += T(4.1, BASE - 3.8 + 2.4, S7, "SEE INGREDIENTS:");
  const qrS = 15.0;
  const qrX = Math.max(22.4, 4.1 + allergenW + 3);
  if (d.qrImage) {
    body += `<image x="${(qrX * s).toFixed(2)}" y="${(bandTop * s).toFixed(2)}" width="${(qrS * s).toFixed(2)}" height="${(qrS * s).toFixed(2)}" href="${d.qrImage}"/>`;
  } else {
    const qrPng = await QRCode.toDataURL(d.qrUrl || d.web, { margin: 1, width: 300 });
    body += `<image x="${(qrX * s).toFixed(2)}" y="${(bandTop * s).toFixed(2)}" width="${(qrS * s).toFixed(2)}" height="${(qrS * s).toFixed(2)}" href="${qrPng}"/>`;
  }
  const bc = ean13(d.barcodeDigits);
  const bcW = 31.4, bx = W - 4.2 - bcW;
  if (d.barcodeImage) {
    body += `<image x="${(bx * s).toFixed(2)}" y="${(bandTop * s).toFixed(2)}" width="${(bcW * s).toFixed(2)}" height="${(14.9 * s).toFixed(2)}" href="${d.barcodeImage}"/>`;
  } else {
    const mod = bcW / 95;
    const GUARD = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);
    for (let i = 0; i < bc.modules.length; i++)
      if (bc.modules[i] === "1")
        body += `<rect x="${((bx + i * mod) * s).toFixed(2)}" y="${(bandTop * s).toFixed(2)}" width="${(mod * s).toFixed(2)}" height="${((GUARD.has(i) ? 13.9 : 12.4) * s).toFixed(2)}" fill="#000"/>`;
    body += T(bx - 1.2, BASE - 3.8 + 2.4, S7, bc.digits[0], 400, "end");
    body += T(bx + 3 * (bcW / 95) + (42 * (bcW / 95)) / 2, BASE - 3.8 + 2.4, S7, bc.digits.slice(1, 7).split("").join("\u2009"), 400, "middle");
    body += T(bx + 50 * (bcW / 95) + (42 * (bcW / 95)) / 2, BASE - 3.8 + 2.4, S7, bc.digits.slice(7).split("").join("\u2009"), 400, "middle");
  }

  const Wmm = W * s;
  const H = BASE * s;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Wmm.toFixed(1)} ${H.toFixed(1)}" width="${Wmm.toFixed(1)}mm" height="${H.toFixed(1)}mm">` +
    `<rect width="${Wmm.toFixed(1)}" height="${H.toFixed(1)}" fill="${/^#[0-9a-fA-F]{6}$/.test(opts.bgColor || "") ? opts.bgColor : "#FFFFFF"}"/>` + body + `</svg>`;
  return { svg, widthMM: Wmm, heightMM: H, barcodeDigits: bc.digits };
}

function esc(s2: string) {
  return s2.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
