import fs from "node:fs";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

/* THE BACK LABEL AS A PRINT PDF (owner, 2026-09-28: "no SVGs in the Final
   Pack — the front and the back label both as PDF that Illustrator opens
   well"). The back label's SVG (composeBackLabel) is a small, fixed
   vocabulary — rectangles, lines of text in Barlow Condensed (400 / 600,
   start / middle / end), one mixed-weight row of tspans, and PNG images
   (the QR) — so it is drawn straight into a PDF page of the label's size:
   every line LIVE TEXT in its embedded face, as the front label's PDF is,
   so Illustrator opens it as editable type. Units: the SVG's viewBox is in
   millimetres. */

const PT = 72 / 25.4;
const FONTS = path.join(process.cwd(), "public", "fonts", "backlabel");
const num = (s: string | undefined, d = 0) => (s === undefined ? d : parseFloat(s));
const attr = (tag: string, k: string) => { const m = new RegExp(`\\s${k}="([^"]*)"`).exec(tag); return m ? m[1] : undefined; };
const unesc = (t: string) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const hex = (h: string | undefined, fallback: string) => {
  const c = /^#([0-9a-f]{6})$/i.exec(h || "") ? h! : fallback;
  const n = parseInt(c.slice(1), 16);
  return rgb((n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

export async function backLabelPdf(svg: string): Promise<Buffer> {
  const vb = (attr(svg.slice(0, svg.indexOf(">")), "viewBox") || "0 0 80 80").split(/\s+/).map(Number);
  const [vx, vy, vw, vh] = vb;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setProducer("8K Labels");
  doc.setCreator("8K Labels — back label");
  const page = doc.addPage([vw * PT, vh * PT]);
  const regular = await doc.embedFont(fs.readFileSync(path.join(FONTS, "BarlowCondensed-Regular.ttf")), { subset: true });
  const semi = await doc.embedFont(fs.readFileSync(path.join(FONTS, "BarlowCondensed-SemiBold.ttf")), { subset: true });
  const face = (w: string | undefined) => (Number(w || 400) >= 500 ? semi : regular);
  const X = (x: number) => (x - vx) * PT;
  const Y = (y: number) => (vh - (y - vy)) * PT;

  /* the ink colour of the text group, and every element in document order */
  let ink = "#000000";
  const re = /<g fill="([^"]+)">|<\/g>|<rect\b[^>]*\/>|<image\b[^>]*\/>|<text\b[^>]*>[\s\S]*?<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const tag = m[0];
    if (m[1]) { ink = m[1]; continue; }
    if (tag === "</g>") { ink = "#000000"; continue; }
    if (tag.startsWith("<rect")) {
      const x = num(attr(tag, "x")), y = num(attr(tag, "y")), w = num(attr(tag, "width")), h = num(attr(tag, "height"));
      page.drawRectangle({ x: X(x), y: Y(y + h), width: w * PT, height: h * PT, color: hex(attr(tag, "fill"), ink) });
      continue;
    }
    if (tag.startsWith("<image")) {
      const href = attr(tag, "href") || attr(tag, "xlink:href") || "";
      const x = num(attr(tag, "x")), y = num(attr(tag, "y")), w = num(attr(tag, "width")), h = num(attr(tag, "height"));
      const b64 = href.slice(href.indexOf(",") + 1);
      try {
        const img = /^data:image\/png/.test(href) ? await doc.embedPng(Buffer.from(b64, "base64"))
          : /^data:image\/jpe?g/.test(href) ? await doc.embedJpg(Buffer.from(b64, "base64")) : null;
        if (img) page.drawImage(img, { x: X(x), y: Y(y + h), width: w * PT, height: h * PT });
      } catch { /* an unreadable image is left out, the text still prints */ }
      continue;
    }
    /* text: plain, or a row of tspans (each its own weight, dx before it) */
    const open = tag.slice(0, tag.indexOf(">") + 1);
    const inner = tag.slice(open.length, tag.lastIndexOf("</text>"));
    const x = num(attr(open, "x")), y = num(attr(open, "y")), size = num(attr(open, "font-size"), 3) * PT;
    const anchor = attr(open, "text-anchor") || "start";
    const runs: { text: string; font: typeof regular; dx: number }[] = [];
    if (inner.includes("<tspan")) {
      const tr = /<tspan\b([^>]*)>([\s\S]*?)<\/tspan>/g;
      let t2: RegExpExecArray | null;
      while ((t2 = tr.exec(inner))) runs.push({ text: unesc(t2[2]), font: face(attr(" " + t2[1], "font-weight") || attr(open, "font-weight")), dx: num(attr(" " + t2[1], "dx"), 0) * PT });
    } else runs.push({ text: unesc(inner), font: face(attr(open, "font-weight")), dx: 0 });
    /* a character the face lacks (the barcode's thin spaces) becomes a gap
       of its own width — never a missing-glyph box; the rest are kept in
       whole words so they stay editable text */
    const has = (f: typeof regular) => { const set = new Set(f.getCharacterSet()); return (ch: string) => set.has(ch.codePointAt(0)!); };
    const hasR = has(regular), hasS = has(semi);
    const pieces = (f: typeof regular, str: string) => {
      const ok = f === regular ? hasR : hasS;
      const out: { text: string; gap: number }[] = [];
      let cur = "";
      for (const ch of str) {
        if (ok(ch)) { cur += ch; continue; }
        if (cur) out.push({ text: cur, gap: 0 });
        cur = "";
        out.push({ text: "", gap: /\s/.test(ch) ? size * (ch === "\u2009" ? 0.2 : 0.25) : 0 });
      }
      if (cur) out.push({ text: cur, gap: 0 });
      return out;
    };
    const w2 = (f: typeof regular, str: string) => pieces(f, str).reduce((w, p2) => w + p2.gap + (p2.text ? f.widthOfTextAtSize(p2.text, size) : 0), 0);
    const width = runs.reduce((w, r) => w + r.dx + w2(r.font, r.text), 0);
    let cx = X(x) - (anchor === "end" ? width : anchor === "middle" ? width / 2 : 0);
    for (const r of runs) {
      cx += r.dx;
      for (const p2 of pieces(r.font, r.text)) {
        if (p2.text) { page.drawText(p2.text, { x: cx, y: Y(y), size, font: r.font, color: hex(ink, "#000000") }); cx += r.font.widthOfTextAtSize(p2.text, size); }
        cx += p2.gap;
      }
    }
  }
  return Buffer.from(await doc.save());
}
