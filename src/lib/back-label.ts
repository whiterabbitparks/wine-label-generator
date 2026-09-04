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
}

const PT = 0.3528;
const S12 = 12 * PT, S8 = 8 * PT, S7 = 7 * PT;
const FAM = "'Archivo Narrow', 'Avenir Next Condensed', Helvetica, sans-serif";

/* condensed-face width model (mm) */
const tw = (t: string, size: number) => t.length * size * 0.46;
function wrap(text: string, size: number, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
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

/* markets beyond the base face (US lives ON the template) */
function extraMarketLines(codes: string[], d: Required<BackLabelData>): { title: string; lines: string[] }[] {
  const out: { title: string; lines: string[] }[] = [];
  const imp = d.importer.toUpperCase();
  const origin = d.countryOfOrigin.toUpperCase();
  if (codes.includes("EU")) out.push({ title: "EU", lines: [
    "CONTAINS SULPHITES.",
    `E ${Math.round(+d.energyKcal * 4.184)} KJ / ${d.energyKcal} KCAL PER 100 ML`,
    "INGREDIENTS & NUTRITION: SCAN THE QR CODE (E-LABEL).",
    `IMPORTED BY (EU): ${imp}`, `L${d.lot}`,
  ] });
  if (codes.includes("GB")) out.push({ title: "UK", lines: [
    "CONTAINS SULPHITES.", `IMPORTED BY (UK): ${imp}`, `PRODUCT OF ${origin}.`,
  ] });
  if (codes.includes("CA")) out.push({ title: "CANADA", lines: [
    "CONTAINS: SULPHITES / CONTIENT : SULFITES",
    `IMPORTED BY / IMPORTÉ PAR : ${imp}`,
    `PRODUCT OF ${origin} / PRODUIT DE ${origin}`,
  ] });
  if (codes.includes("AU") || codes.includes("NZ")) out.push({ title: "AUSTRALIA / NEW ZEALAND", lines: [
    "PREGNANCY WARNING: ALCOHOL CAN CAUSE LIFELONG HARM TO YOUR BABY. [OFFICIAL PICTOGRAM REQUIRED]",
    "CONTAINS SULPHITES.",
    `CONTAINS APPROX. ${(Number(d.volume) * Number(d.alcohol) / 100 / 12.7).toFixed(1)} STANDARD DRINKS.`,
    `IMPORTED BY (AU/NZ): ${imp}`,
  ] });
  if (codes.includes("JP")) out.push({ title: "JAPAN", lines: [
    `果実酒 ・ アルコール分 ${d.alcohol}% ・ 内容量 ${d.volume}ML`,
    `輸入者: ${imp}`,
    "妊娠中や授乳期の飲酒は、胎児・乳児の発育に悪影響を与えるおそれがあります。",
  ] });
  if (codes.includes("KR")) out.push({ title: "KOREA", lines: [
    `수입자: ${imp}`,
    "경고: 지나친 음주는 간경화나 간암을 일으키며, 임신 중 음주는 태아의 기형 발생 위험을 높입니다.",
  ] });
  if (codes.includes("CN")) out.push({ title: "CHINA", lines: [
    `葡萄酒 ・ 酒精度 ${d.alcohol}%VOL ・ 净含量 ${d.volume}ML`,
    `原产国: ${origin} ・ 进口商: ${imp}`,
    "过量饮酒有害健康",
  ] });
  if (codes.includes("BR")) out.push({ title: "BRAZIL", lines: [
    `IMPORTADO POR: ${imp}`,
    "CONTÉM SULFITOS. BEBA COM MODERAÇÃO. VENDA PROIBIDA PARA MENORES DE 18 ANOS.",
  ] });
  if (codes.includes("MX")) out.push({ title: "MEXICO", lines: [
    `IMPORTADO POR: ${imp}`,
    "EL ABUSO EN EL CONSUMO DE ESTE PRODUCTO ES NOCIVO PARA LA SALUD.",
  ] });
  if (codes.includes("IL")) out.push({ title: "ISRAEL", lines: [
    `יבואן: ${imp}`,
    "אזהרה: צריכה מופרזת של אלכוהול מסכנת חיים ומזיקה לבריאות!",
  ] });
  if (codes.includes("GE")) out.push({ title: "GEORGIA", lines: [
    `მწარმოებელი: ${d.producer.toUpperCase()}`,
    `ალკოჰოლი ${d.alcohol}% ・ ${d.volume} მლ`,
  ] });
  return out;
}

export async function composeBackLabel(
  raw: BackLabelData,
  opts: { heightMM: number; markets: string[] }
): Promise<{ svg: string; widthMM: number; heightMM: number; barcodeDigits: string }> {
  /* TEMP placeholders — remove before launch (like DEMO_FILL) */
  const d: Required<BackLabelData> = {
    wine: raw.wine || "Saperavi Reserve",
    producer: raw.producer || "Popiashvili Cellars LLC, Kakheti, Georgia",
    description: raw.description || "A dry red wine from old Saperavi vines. Deep garnet colour; dark berries, tobacco leaf and warm spice on the nose; firm but polished tannins carry a long mineral finish. Eight months in traditional qvevri.",
    importer: raw.importer || "Placeholder Imports Ltd., 12 Harbour St., Example City",
    bottlingDate: raw.bottlingDate || "29/04/2026",
    lot: raw.lot || "2606142",
    web: raw.web || "WWW.POPIASHVILI.COM",
    alcohol: raw.alcohol || "12.5",
    volume: raw.volume || "750",
    countryOfOrigin: raw.countryOfOrigin || "Georgia",
    energyKcal: raw.energyKcal || "81",
    barcodeDigits: raw.barcodeDigits || "",
    qrUrl: raw.qrUrl || "",
  };
  const BASE = 80;                       // template face, mm
  const s = opts.heightMM / BASE;        // whole face scales with front height
  const up = (t: string) => t.toUpperCase();
  const T = (x: number, y: number, size: number, text: string, weight = 400, anchor = "start") =>
    `<text x="${(x * s).toFixed(2)}" y="${(y * s).toFixed(2)}" font-size="${(size * s).toFixed(2)}" font-weight="${weight}" text-anchor="${anchor}" font-family="${FAM}">${esc(text)}</text>`;

  let body = "";
  /* — template face (coordinates straight from the PDF) — */
  body += T(4, 6.2, S12, up(d.wine), 500);
  let y = 9.3;
  for (const ln of wrap(up(d.description), S8, 72)) { body += T(4, y + 2.5, S8, ln, 500); y += 3.4; }
  /* two columns: importer left, producer right */
  const colL = 4.2, colR = 42.5, colW = 34;
  body += T(colL, 26.3, S8, "IMPORTED BY (US):");
  body += T(colR, 26.3, S8, "PRODUCER:");
  let yl = 29.7;
  for (const ln of wrap(up(d.importer), S8, colW).slice(0, 3)) { body += T(colL, yl, S8, ln); yl += 3.4; }
  let yr = 29.7;
  for (const ln of wrap(up(d.producer), S8, colW).slice(0, 3)) { body += T(colR, yr, S8, ln); yr += 3.4; }
  body += T(colL, 38.6, S7, `PRODUCT OF ${up(d.countryOfOrigin)}.`);
  body += T(colR, 38.6, S7, up(d.web));
  body += T(4, 44.0, S7, `BOTTLED: ${d.bottlingDate}   /   LOT: L${d.lot}   /   ${d.alcohol}% ALC./VOL. ${d.volume} ML`);
  /* US Government Warning zone (statutory text, template position) */
  let yw = 48.7;
  const WARN = "GOVERNMENT WARNING: (1) ACCORDING TO THE SURGEON GENERAL, WOMEN SHOULD NOT DRINK ALCOHOLIC BEVERAGES DURING PREGNANCY BECAUSE OF THE RISK OF BIRTH DEFECTS. (2) CONSUMPTION OF ALCOHOLIC BEVERAGES IMPAIRS YOUR ABILITY TO DRIVE A CAR OR OPERATE MACHINERY, AND MAY CAUSE HEALTH PROBLEMS.";
  for (const ln of wrap(WARN, S7, 72)) { body += T(4, yw, S7, ln); yw += 2.95; }
  /* bottom band: CONTAINS SULFITES · QR + SEE INGREDIENTS · barcode */
  body += T(4, 62.6, S7, "CONTAINS");
  body += T(4, 65.5, S7, "SULFITES");
  const qrSize = 19.2 * s;
  const qrPng = await QRCode.toDataURL(d.qrUrl || d.web, { margin: 1, width: 300 });
  body += `<image x="${(20.4 * s).toFixed(2)}" y="${(59.4 * s).toFixed(2)}" width="${qrSize.toFixed(2)}" height="${qrSize.toFixed(2)}" href="${qrPng}"/>`;
  body += T(4, 75.6, S7, "SEE INGREDIENTS:");
  const bc = ean13(d.barcodeDigits);
  const bx = 44.0, bw = 31.7, bh = 14.4, mod = bw / 95;
  for (let i = 0; i < bc.modules.length; i++)
    if (bc.modules[i] === "1")
      body += `<rect x="${((bx + i * mod) * s).toFixed(2)}" y="${(61.5 * s).toFixed(2)}" width="${(mod * s).toFixed(2)}" height="${(bh * s).toFixed(2)}" fill="#000"/>`;
  body += T(bx + bw / 2, 78.2, S7, bc.digits, 400, "middle");

  /* extra markets extend width in 80mm panels, same 7pt */
  const extras = extraMarketLines(opts.markets.filter((m) => m !== "US"), d);
  let panels = 0;
  if (extras.length) {
    let px = BASE + 4, py = 6.2, panelIdx = 0;
    for (const blk of extras) {
      const lines = blk.lines.flatMap((l) => wrap(l, S7, 72));
      const need = (lines.length + 1) * 2.95 + 2.6;
      if (py + need > BASE - 4 && py > 6.2) { panelIdx++; px = BASE + panelIdx * BASE + 4; py = 6.2; }
      body += T(px, py, S7, blk.title, 600);
      py += 2.95;
      for (const ln of lines) { body += T(px, py, S7, ln); py += 2.95; }
      py += 2.6;
    }
    panels = panelIdx + 1;
  }

  const W = (BASE + panels * BASE) * s;
  const H = BASE * s;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" width="${W.toFixed(1)}mm" height="${H.toFixed(1)}mm">` +
    `<rect width="${W.toFixed(1)}" height="${H.toFixed(1)}" fill="#FFFFFF"/>` + body + `</svg>`;
  return { svg, widthMM: W, heightMM: H, barcodeDigits: bc.digits };
}

function esc(s2: string) {
  return s2.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
