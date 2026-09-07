import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { composeBackLabel, BackLabelData } from "@/lib/back-label";
import { buildZip } from "@/lib/zip";

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

export const maxDuration = 120;

function dataBuf(u: string | undefined | null): Buffer | null {
  const m = String(u || "").match(/^data:image\/(png|jpeg|webp|tiff);base64,(.+)$/);
  return m ? Buffer.from(m[2], "base64") : null;
}

/* one-page sample contract as a minimal, valid PDF (no dependencies) */
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
  const content =
    "BT /F1 11 Tf 56 780 Td 16 TL " +
    lines.map((l) => `(${l.replace(/[\\()]/g, (c) => "\\" + c)}) Tj T*`).join(" ") +
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

export async function POST(req: Request) {
  let body: {
    wineName?: string;
    front?: string;
    back?: { data?: BackLabelData; markets?: string[]; heightMM?: number; bgColor?: string };
    shots?: { front?: string; back?: string };
    lifestyle?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), { status: 400 });
  }
  const wine = String(body.wineName || "Wine").trim().slice(0, 60);
  const base = wine.replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "") || "Wine";
  const root = `${base}/`;
  const files: { name: string; data: Buffer }[] = [];

  try {
    /* 1. LABELS */
    const frontBuf = dataBuf(body.front);
    if (frontBuf) {
      const tiff = await sharp(frontBuf).withMetadata({ density: 300 }).tiff({ compression: "lzw" }).toBuffer();
      files.push({ name: `${root}1. LABELS/${base}_Front_Label.tiff`, data: tiff });
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

    /* contract beside the folders */
    files.push({ name: `${root}Contract.pdf`, data: sampleContractPdf(wine) });

    if (!files.length) return new Response(JSON.stringify({ error: "nothing to package" }), { status: 400 });
    const zip = buildZip(files);
    return new Response(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${base}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "packaging failed" }), { status: 500 });
  }
}
