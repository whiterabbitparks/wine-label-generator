import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PDFDocument, rgb, degrees, setCharacterSpacing, pushGraphicsState, popGraphicsState } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Layout } from "@/lib/typeset/compose";
import { faceFile } from "@/lib/typeset/fonts";

/* THE PRINT PDF (round 85 #12, owner: "remove the TIFF; can we write an
   Illustrator file?"). An .ai file IS a PDF with Adobe's private data
   bolted on — Illustrator opens a PDF whose text is real text with its
   fonts embedded exactly as editable type. So this draws the composer's
   layout straight into a PDF page of the label's physical size: the
   ground, the artwork (cropped to what the label shows, embedded — a PDF
   cannot link), and every line as live text in its embedded, subsetted
   Google face, with the same letter-spacing. No rasterised type anywhere. */

const PT_PER_MM = 72 / 25.4;
const hexRgb = (h: string) => { const n = parseInt(h.slice(1), 16); return rgb((n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };

export async function labelPdf(layout: Layout, artPng: Buffer, widthMm: number, heightMm: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setProducer("8K Labels");
  doc.setCreator("8K Labels — hybrid engine");
  const Wpt = widthMm * PT_PER_MM, Hpt = heightMm * PT_PER_MM;
  const s = Wpt / layout.W;                                   /* label px → pt */
  const page = doc.addPage([Wpt, Hpt]);

  page.drawRectangle({ x: 0, y: 0, width: Wpt, height: Hpt, color: hexRgb(layout.ground) });

  /* the artwork, cropped exactly as the SVG shows it. ROUND 108 #18: a
     VIGNETTE label carries its own source crop (the drawing trimmed off
     its plain ground) and the box it is drawn into — without it the PDF
     fell back to the old full-bleed cover and the picture swallowed the
     whole artboard while the SVG was right. */
  const meta = await sharp(artPng).metadata();
  const aw = meta.width || 1, ah = meta.height || 1;
  const a = layout.art;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
  let cropped: Buffer;
  if (layout.artCrop) {
    const c = layout.artCrop;
    const left = clamp(c.x, 0, aw - 1), top = clamp(c.y, 0, ah - 1);
    cropped = await sharp(artPng).extract({ left, top, width: clamp(c.w, 1, aw - left), height: clamp(c.h, 1, ah - top) }).png().toBuffer();
  } else {
    const cover = Math.max(a.w / aw, a.h / ah);
    const cw = Math.min(aw, Math.round(a.w / cover)), ch = Math.min(ah, Math.round(a.h / cover));
    const cx = Math.max(0, Math.round((aw - cw) / 2));
    cropped = await sharp(artPng).extract({ left: cx, top: 0, width: cw, height: ch }).png().toBuffer();
  }
  const img = await doc.embedPng(cropped);
  page.drawImage(img, { x: a.x * s, y: Hpt - (a.y + a.h) * s, width: a.w * s, height: a.h * s });

  /* the type: one embedded (subset) font per face used */
  /* THE PDF FONT POOL: public/fonts/labels-pdf/ holds every face of
     public/fonts/labels/ passed through fontTools (all glyphs kept;
     DSIG/meta/hdmx/GPOS/GSUB/GDEF dropped, no hinting). Reason, proven on
     all 61 faces: pdf-lib's fontkit threw "beyond buffer length" on 15 of
     the originals when embedded whole, and its SUBSETTER silently dropped
     glyphs from EB Garamond ("Dry Red Wine" came out "Red W e"). The
     cleaned faces embed whole, every glyph present — a few hundred KB
     each, and Illustrator gets every character the customer may type.
     Rebuild after adding a face:
       python3 -m fontTools.subset <in.ttf> --glyphs='*' --layout-features='*'
         --drop-tables+=DSIG,meta,hdmx,LTSH,VDMX,GPOS,GSUB,GDEF,MATH
         --no-hinting --output-file=public/fonts/labels-pdf/<file>.ttf */
  const fonts = new Map<string, Awaited<ReturnType<PDFDocument["embedFont"]>>>();
  for (const l of layout.lines) {
    const file = faceFile({ family: l.family, weight: l.weight, italic: l.italic });
    if (fonts.has(file)) continue;
    const clean = file.replace(`${path.sep}labels${path.sep}`, `${path.sep}labels-pdf${path.sep}`);
    const src = fs.existsSync(clean) ? clean : file;
    if (!fs.existsSync(src)) throw new Error(`font file missing: ${file}`);
    fonts.set(file, await doc.embedFont(fs.readFileSync(src), { subset: false }));
  }
  for (const l of layout.lines) {
    const font = fonts.get(faceFile({ family: l.family, weight: l.weight, italic: l.italic }))!;
    const size = l.size * s, tracking = l.tracking * s;
    const width = font.widthOfTextAtSize(l.text, size) + tracking * Math.max(0, l.text.length - 1);
    /* 2026-09-22 (the owner's templates): a line may anchor at its END,
       and may be rotated — the vertical columns of templates 11/12 and
       every glyph of an arced wine name. pdf-lib rotates about the
       drawing point, which is the anchor, exactly as the SVG does. */
    const off = l.anchor === "middle" ? -width / 2 : l.anchor === "end" ? -width : 0;
    const rot = l.rot || 0;
    const rad = (-rot * Math.PI) / 180;                       /* SVG turns clockwise, PDF anticlockwise */
    const x = l.x * s + off * Math.cos(rad);
    const y = Hpt - l.y * s + off * Math.sin(rad);            /* SVG baseline from the top → PDF from the bottom */
    page.pushOperators(pushGraphicsState(), setCharacterSpacing(tracking));
    page.drawText(l.text, { x, y, size, font, color: hexRgb(l.colour), ...(rot ? { rotate: degrees(-rot) } : {}) });
    page.pushOperators(popGraphicsState());
  }
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}
