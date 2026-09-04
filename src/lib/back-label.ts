import QRCode from "qrcode";

/* BACK LABEL (owner 2026-09-03, branch POPIKA_No_Vector): clean deterministic
   typography — no AI. Same HEIGHT as the front label; WIDTH grows with
   content (extra columns). Laws: nothing under 6pt; comfortable air between
   blocks; barcode + QR ≥ 15mm tall so they scan.

   COMPLIANCE (owner-requested research, 2026-09-03): per-market mandatory
   text blocks for the 13 markets on the site's Export Compliance grid.
   Confidence varies — see the per-market `confidence` notes and
   CONTINUE-HERE.md. Anything marked "check" needs a human/legal pass
   before real exports. */

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
  energyKcal?: string;      // per 100 ml
  barcodeDigits?: string;   // 12-13 digits; random when absent
  qrUrl?: string;
}

const PT = 0.3528; // mm per pt
const F6 = 6 * PT, F7 = 7 * PT, F8 = 8 * PT;

interface Block { title?: string; lines: { text: string; size: number; bold?: boolean }[] }

/* rough but stable width model for Helvetica-ish sans at size (mm) */
const tw = (t: string, size: number) => t.length * size * 0.52;
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

/* ---- EAN-13 (random valid number when none given) ---- */
const L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
const PARITY = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];
export function ean13(digits?: string): { digits: string; modules: string } {
  let d = String(digits || "").replace(/\D/g, "");
  if (d.length === 13) d = d.slice(0, 12);
  if (d.length !== 12) {
    d = "482" + Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join(""); // 482 = Georgia GS1 prefix
  }
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

function barcodeSVG(x: number, y: number, digits?: string): { svg: string; w: number; h: number; digits: string } {
  const { digits: d, modules } = ean13(digits);
  const mod = 0.33, barH = 15, textH = 2.2;
  let bars = "";
  for (let i = 0; i < modules.length; i++)
    if (modules[i] === "1") bars += `<rect x="${(x + i * mod).toFixed(2)}" y="${y}" width="${mod}" height="${barH}" fill="#000"/>`;
  const w = modules.length * mod;
  const label = `<text x="${(x + w / 2).toFixed(2)}" y="${(y + barH + textH).toFixed(2)}" font-size="${(2.5).toFixed(2)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">${d}</text>`;
  return { svg: bars + label, w, h: barH + textH + 0.8, digits: d };
}

/* ---- per-market mandatory blocks (research 2026-09-03; see confidence) ---- */
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

function marketBlocks(codes: string[], d: Required<BackLabelData>): Block[] {
  const b: Block[] = [];
  const imp = d.importer;
  const origin = d.countryOfOrigin;
  if (codes.includes("EU")) {
    b.push({ title: "EU", lines: [
      { text: `Contains sulphites.`, size: F7, bold: true },
      { text: `E ${Math.round(+d.energyKcal * 4.184)} kJ / ${d.energyKcal} kcal per 100 ml`, size: F6 },
      { text: `Ingredients & nutrition: scan the QR code (e-label).`, size: F6 },
      { text: `Imported by (EU): ${imp}`, size: F6 },
      { text: `L${d.lot}`, size: F6 },
    ] });
  }
  if (codes.includes("US")) {
    b.push({ title: "US", lines: [
      { text: "GOVERNMENT WARNING: (1) ACCORDING TO THE SURGEON GENERAL, WOMEN SHOULD NOT DRINK ALCOHOLIC BEVERAGES DURING PREGNANCY BECAUSE OF THE RISK OF BIRTH DEFECTS. (2) CONSUMPTION OF ALCOHOLIC BEVERAGES IMPAIRS YOUR ABILITY TO DRIVE A CAR OR OPERATE MACHINERY, AND MAY CAUSE HEALTH PROBLEMS.", size: F6, bold: true },
      { text: "CONTAINS SULFITES", size: F6, bold: true },
      { text: `Imported by (US): ${imp}`, size: F6 },
      { text: `Product of ${origin}. ${d.alcohol}% Alc./Vol. ${d.volume} mL`, size: F6 },
    ] });
  }
  if (codes.includes("GB")) {
    b.push({ title: "UK", lines: [
      { text: "Contains sulphites.", size: F6 },
      { text: `Imported by (UK): ${imp}`, size: F6 },
      { text: `Product of ${origin}.`, size: F6 },
    ] });
  }
  if (codes.includes("CA")) {
    b.push({ title: "Canada", lines: [
      { text: "Contains: sulphites / Contient : sulfites", size: F6 },
      { text: `Imported by / Importé par : ${imp}`, size: F6 },
      { text: `Product of ${origin} / Produit de ${origin}`, size: F6 },
    ] });
  }
  if (codes.includes("AU") || codes.includes("NZ")) {
    b.push({ title: "Australia / New Zealand", lines: [
      { text: "PREGNANCY WARNING: Alcohol can cause lifelong harm to your baby. [pictogram required — upload artwork]", size: F6, bold: true },
      { text: "Contains sulphites.", size: F6 },
      { text: `Contains approx. ${(Number(d.volume) * Number(d.alcohol) / 100 / 12.7).toFixed(1)} standard drinks.`, size: F6 },
      { text: `Imported by (AU/NZ): ${imp}`, size: F6 },
    ] });
  }
  if (codes.includes("JP")) {
    b.push({ title: "Japan", lines: [
      { text: `果実酒 (wine) ・ アルコール分 ${d.alcohol}% ・ 内容量 ${d.volume}ml`, size: F6 },
      { text: `輸入者: ${imp}`, size: F6 },
      { text: "妊娠中や授乳期の飲酒は、胎児・乳児の発育に悪影響を与えるおそれがあります。", size: F6 },
    ] });
  }
  if (codes.includes("KR")) {
    b.push({ title: "South Korea", lines: [
      { text: `수입자: ${imp}`, size: F6 },
      { text: "경고: 지나친 음주는 간경화나 간암을 일으키며, 임신 중 음주는 태아의 기형 발생 위험을 높입니다.", size: F6 },
    ] });
  }
  if (codes.includes("CN")) {
    b.push({ title: "China", lines: [
      { text: `葡萄酒 ・ 酒精度 ${d.alcohol}%vol ・ 净含量 ${d.volume}ml`, size: F6 },
      { text: `原产国: ${origin} ・ 进口商: ${imp}`, size: F6 },
      { text: "过量饮酒有害健康", size: F6 },
    ] });
  }
  if (codes.includes("BR")) {
    b.push({ title: "Brazil", lines: [
      { text: `Importado por: ${imp}`, size: F6 },
      { text: "CONTÉM SULFITOS. BEBA COM MODERAÇÃO. VENDA PROIBIDA PARA MENORES DE 18 ANOS.", size: F6 },
    ] });
  }
  if (codes.includes("MX")) {
    b.push({ title: "Mexico", lines: [
      { text: `Importado por: ${imp}`, size: F6 },
      { text: "EL ABUSO EN EL CONSUMO DE ESTE PRODUCTO ES NOCIVO PARA LA SALUD.", size: F6, bold: true },
    ] });
  }
  if (codes.includes("IL")) {
    b.push({ title: "Israel", lines: [
      { text: `יבואן: ${imp}`, size: F6 },
      { text: "אזהרה: צריכה מופרזת של אלכוהול מסכנת חיים ומזיקה לבריאות!", size: F6 },
    ] });
  }
  if (codes.includes("GE")) {
    b.push({ title: "Georgia", lines: [
      { text: `მწარმოებელი: ${d.producer}`, size: F6 },
      { text: `ალკოჰოლი ${d.alcohol}% ・ ${d.volume} მლ`, size: F6 },
    ] });
  }
  return b;
}

export async function composeBackLabel(
  raw: BackLabelData,
  opts: { heightMM: number; markets: string[] }
): Promise<{ svg: string; widthMM: number; heightMM: number; barcodeDigits: string }> {
  /* TEMP placeholders (owner 2026-09-03: "so I don't have to type every
     time I test" — REMOVE BEFORE LAUNCH, like DEMO_FILL) */
  const d: Required<BackLabelData> = {
    wine: raw.wine || "Saperavi Reserve",
    producer: raw.producer || "Popiashvili Cellars LLC, Kakheti, Georgia",
    description: raw.description || "A dry red wine from old Saperavi vines. Deep garnet colour; dark berries, tobacco leaf and warm spice on the nose; firm but polished tannins carry a long mineral finish. Eight months in traditional qvevri.",
    importer: raw.importer || "Placeholder Imports Ltd., 12 Harbour St., Example City",
    bottlingDate: raw.bottlingDate || "2026-06-15",
    lot: raw.lot || "2606-142",
    web: raw.web || "https://8klabels.example/popiashvili",
    alcohol: raw.alcohol || "12.5",
    volume: raw.volume || "750",
    countryOfOrigin: raw.countryOfOrigin || "Georgia",
    energyKcal: raw.energyKcal || "81",
    barcodeDigits: raw.barcodeDigits || "",
    qrUrl: raw.qrUrl || "",
  };
  const H = opts.heightMM;
  const M = 4;                 // outer margin, mm
  const GAP = 2.6;             // air between blocks (owner: not pressed together)
  const COLW = 45, COLGAP = 4; // narrow columns keep total width label-like
  const CODE_H = 19.5;         // barcode band (15mm bars + digits + air)

  const blocks: Block[] = [
    { title: d.wine, lines: wrap(d.description, F8, COLW).map((t) => ({ text: t, size: F8 })) },
    { lines: [
      { text: d.producer, size: F7, bold: true },
      { text: `Bottled: ${d.bottlingDate}   Lot: L${d.lot}`, size: F6 },
      { text: d.web, size: F6 },
    ] },
    ...marketBlocks(opts.markets, d),
  ];

  /* flow blocks into columns; width grows until everything fits */
  const lineH = (s: number) => s * 1.45;
  const blockH = (b: Block, colw: number) => {
    let h = b.title ? lineH(F7) + 0.8 : 0;
    for (const ln of b.lines) for (const w of wrap(ln.text, ln.size, colw)) { void w; h += lineH(ln.size); }
    return h;
  };
  const usableH = H - 2 * M - CODE_H;
  const colsNeeded = () => {
    let col = 0, y = 0;
    for (const b of blocks) {
      const h = blockH(b, COLW);
      if (y > 0 && y + h > usableH) { col++; y = 0; }
      y += h + GAP;
    }
    return col + 1;
  };
  const ncols = Math.min(8, colsNeeded());
  const W = 2 * M + ncols * COLW + (ncols - 1) * COLGAP;

  /* render */
  let body = "";
  let col = 0, y = 0;
  const colX = (c: number) => M + c * (COLW + COLGAP);
  for (const b of blocks) {
    const h = blockH(b, COLW);
    if (y > 0 && y + h > usableH && col < ncols - 1) { col++; y = 0; }
    let yy = M + y;
    if (b.title) {
      yy += lineH(F7);
      body += `<text x="${colX(col)}" y="${yy.toFixed(2)}" font-size="${F7.toFixed(2)}" font-weight="bold" font-family="Helvetica, Arial, sans-serif">${esc(b.title)}</text>`;
      yy += 0.8;
    }
    for (const ln of b.lines)
      for (const seg of wrap(ln.text, ln.size, COLW)) {
        yy += lineH(ln.size);
        body += `<text x="${colX(col)}" y="${yy.toFixed(2)}" font-size="${ln.size.toFixed(2)}"${ln.bold ? ' font-weight="bold"' : ""} font-family="Helvetica, Arial, sans-serif">${esc(seg)}</text>`;
      }
    y = yy - M + GAP;
  }

  /* code band: barcode left, QR right (both ≥15mm) */
  const bandY = H - M - CODE_H + 1.5;
  const bc = barcodeSVG(M, bandY, d.barcodeDigits);
  body += bc.svg;
  const qrSize = 15;
  const qrUrl = d.qrUrl || d.web;
  const qrPng = await QRCode.toDataURL(qrUrl, { margin: 1, width: 300 });
  const qrX = W - M - qrSize;
  body += `<image x="${qrX}" y="${bandY}" width="${qrSize}" height="${qrSize}" href="${qrPng}"/>`;
  body += `<text x="${(qrX + qrSize / 2).toFixed(2)}" y="${(bandY + qrSize + 2.4).toFixed(2)}" font-size="${F6.toFixed(2)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">e-label</text>`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" width="${W.toFixed(1)}mm" height="${H.toFixed(1)}mm">` +
    `<rect width="${W.toFixed(1)}" height="${H.toFixed(1)}" fill="#FFFFFF"/>` + body + `</svg>`;
  return { svg, widthMM: W, heightMM: H, barcodeDigits: bc.digits };
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
