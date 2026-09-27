import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { composeBackLabel, BackLabelData } from "@/lib/back-label";
import { buildZip } from "@/lib/zip";
import { readLabel } from "@/lib/label/store";
import { fontFilesOf } from "@/lib/label/hybrid";
import { labelPdf } from "@/lib/label/pdf";

/* DELIVERY PACKAGE (owner 2026-09-07): "Proceed to payment" downloads one
   ZIP named after the wine:
     WINE_NAME/
       1. LABELS/          WINE_NAME_Front_Label.tiff (300dpi)
                           WINE_NAME_Back_Label.svg (2mm bleed)
                           Fonts/ (the back label's Barlow Condensed TTFs)
       2. MARKETING ASSETS/ WINE_NAME_Bottle_Front.png · _Bottle_Back.png
                           WINE_NAME_Image01..05.png
       Contract.pdf        (sample for now — the payment stage owns the real one)
   TEMP: free download until payments exist. */

/* 2026-09-26: the builder lives here so the product page's DOWNLOAD
   ASSETS hands out the very same folder (the order's pack is kept in
   data/products/<code>.json — see savePack). */

export type PackBody = {
  wineName?: string;
  front?: string | null;
  frontId?: string | null;
  back?: { data?: BackLabelData; markets?: string[]; heightMM?: number; bgColor?: string } | null;
  shots?: { front?: string; back?: string };
  lifestyle?: string[];
  /* the order's product page and the code that opens it (READ ME) */
  product?: { url: string; pin: string } | null;
};

export function dataBuf(u: string | undefined | null): Buffer | null {
  const m = String(u || "").match(/^data:image\/(png|jpeg|webp|tiff);base64,(.+)$/);
  return m ? Buffer.from(m[2], "base64") : null;
}

/* one page of plain Helvetica text as a minimal, valid PDF (no dependencies) */
function textPdf(lines: string[]): Buffer {
  const content =
    "BT /F1 11 Tf 56 780 Td 16 TL " +
    lines.map((l) => `(${l.replace(/[^\x20-\xff]/g, "-").replace(/[\\()]/g, (c) => "\\" + c)}) Tj T*`).join(" ") +
    " ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

/* 2026-09-27 (owner): the READ ME carries the product page's link and the
   5-digit code that opens it — the page stays locked until it is typed */
function readmePdf(wine: string, product: PackBody["product"]): Buffer {
  return textPdf([
    "READ ME",
    "",
    `Your Final Pack for "${wine}"`,
    "",
    "1. LABELS - the front label as PDF (print file) and SVG, its artwork",
    "   and fonts; the back label as SVG with 2 mm bleed and its fonts.",
    "2. MARKETING ASSETS - two bottle photos and five marketing images.",
    ...(product ? [
      "",
      "YOUR PRODUCT PAGE",
      `   ${product.url}`,
      "",
      `   Code: ${product.pin}`,
      "",
      "   The page is locked until this code is entered once. Open the link,",
      "   type the code, and from then on the page is open for everyone who",
      "   scans the QR code on your bottle.",
    ] : []),
    "",
    "Questions: write to us from 8k.wine.",
  ]);
}

/* one-page sample contract */
function sampleContractPdf(wine: string): Buffer {
  const lines = [
    "SAMPLE SERVICE AGREEMENT",
    "",
    `Project: label & marketing package for "${wine}"`,
    "Provider: 8K Labels",
    "",
    "1. Deliverables: print-ready front label (300dpi TIFF), editable back",
    "   label (SVG + fonts), product photography and marketing imagery as",
    "   included in this package.",
    "2. License: upon full payment the customer receives the exclusive,",
    "   worldwide, perpetual right to use the delivered artwork for the",
    "   named product, in print and digital media.",
    "3. Responsibility: regulatory texts are provided as a best-effort",
    "   draft; final legal compliance for each market remains with the",
    "   producer / importer.",
    "4. This is a SAMPLE document - the final contract is provided at",
    "   the payment step.",
  ];
  return textPdf(lines);
}

/* the ZIP and its name; null when there is nothing to put in it */
export async function buildPackage(body: PackBody): Promise<{ zip: Buffer; base: string } | null> {
  const wine = String(body.wineName || "Wine").trim().slice(0, 60);
  const base = wine.replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "") || "Wine";
  const root = `${base}/`;
  const files: { name: string; data: Buffer }[] = [];

  /* 1. LABELS — round 84/85 (hybrid engine): the front label as LIVE
     TYPE. The PDF (print file, fonts embedded, the artwork embedded —
     Illustrator opens it as editable type), the SVG (source; its artwork
     LINKED from Links/, as the owner asked) and the TTFs it sets. The
     TIFF is gone (owner, round 85 #12). A label made before the hybrid
     engine has no id and still ships its bitmap as PNG. */
  const stored = body.frontId ? readLabel(String(body.frontId)) : null;
  if (stored) {
    const artName = `${base}_Front_Artwork.png`;
    files.push({ name: `${root}1. LABELS/Links/${artName}`, data: stored.art });
    const linked = stored.svg.replace(/xlink:href="data:image\/[a-z]+;base64,[^"]+"/, `xlink:href="Links/${artName}"`);
    files.push({ name: `${root}1. LABELS/${base}_Front_Label.svg`, data: Buffer.from(linked, "utf8") });
    if (stored.layout)
      files.push({ name: `${root}1. LABELS/${base}_Front_Label.pdf`, data: await labelPdf(stored.layout, stored.art, stored.meta.widthMm, stored.meta.heightMm) });
    for (const p of fontFilesOf(stored.svg))
      if (fs.existsSync(p)) files.push({ name: `${root}1. LABELS/Fonts/${path.basename(p)}`, data: fs.readFileSync(p) });
  } else {
    const frontBuf = dataBuf(body.front);
    if (frontBuf) files.push({ name: `${root}1. LABELS/${base}_Front_Label.png`, data: await sharp(frontBuf).withMetadata({ density: 300 }).png().toBuffer() });
  }
  if (body.back) {
    const markets = (body.back.markets || ["EU"]).slice(0, 13);
    const heightMM = Math.min(200, Math.max(40, Number(body.back.heightMM) || 80));
    const out = await composeBackLabel(body.back.data || {}, {
      heightMM, markets, bgColor: String(body.back.bgColor || ""), bleedMM: 2,
    });
    files.push({ name: `${root}1. LABELS/${base}_Back_Label.svg`, data: Buffer.from(out.svg, "utf8") });
  }
  const fontsDir = path.join(process.cwd(), "public", "fonts", "backlabel");
  for (const f of fs.existsSync(fontsDir) ? fs.readdirSync(fontsDir) : [])
    files.push({ name: `${root}1. LABELS/Fonts/${f}`, data: fs.readFileSync(path.join(fontsDir, f)) });

  /* 2. MARKETING ASSETS */
  const sf = dataBuf(body.shots?.front);
  if (sf) files.push({ name: `${root}2. MARKETING ASSETS/${base}_Bottle_Front.png`, data: sf });
  const sb = dataBuf(body.shots?.back);
  if (sb) files.push({ name: `${root}2. MARKETING ASSETS/${base}_Bottle_Back.png`, data: sb });
  (body.lifestyle || []).slice(0, 8).forEach((u, i) => {
    const b = dataBuf(u);
    if (b) files.push({ name: `${root}2. MARKETING ASSETS/${base}_Image${String(i + 1).padStart(2, "0")}.png`, data: b });
  });

  /* contract beside the folders, and the READ ME */
  files.push({ name: `${root}Contract.pdf`, data: sampleContractPdf(wine) });
  files.push({ name: `${root}READ ME.pdf`, data: readmePdf(wine, body.product) });

  if (!files.length) return null;
  return { zip: buildZip(files), base };
}

/* the order's pack beside its product page (full-size images; Mongo keeps
   only the previews) */
const PACKS = path.join(process.cwd(), "data", "products");
const packFile = (code: string) => path.join(PACKS, `${code.replace(/[^a-z0-9]/gi, "")}.json`);
export function savePack(code: string, body: PackBody) {
  if (code.replace(/[^a-z0-9]/gi, "").length < 6) return;
  fs.mkdirSync(PACKS, { recursive: true });
  fs.writeFileSync(packFile(code), JSON.stringify(body));
}
export function readPack(code: string): PackBody | null {
  try { return JSON.parse(fs.readFileSync(packFile(code), "utf8")) as PackBody; } catch { return null; }
}
