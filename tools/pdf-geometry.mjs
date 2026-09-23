/* Pull exact geometry out of an Illustrator PDF: every text run with its
   position, size and font, and every rectangle / line. Walks Form
   XObjects so Illustrator's transparency groups are followed. */
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import fs from "node:fs";

const mul = (a, b) => [
  a[0]*b[0] + a[1]*b[2], a[0]*b[1] + a[1]*b[3],
  a[2]*b[0] + a[3]*b[2], a[2]*b[1] + a[3]*b[3],
  a[4]*b[0] + a[5]*b[2] + b[4], a[4]*b[1] + a[5]*b[3] + b[5],
];
const rgb = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
const cmyk = (c, m2, y2, k2) => rgb((1 - Math.min(1, c + k2)), (1 - Math.min(1, m2 + k2)), (1 - Math.min(1, y2 + k2)));
const apply = (m, x, y) => [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]];

function tokenize(s) {
  const out = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "%") { while (i < s.length && s[i] !== "\n") i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === "(") { let d = 1, j = i + 1, buf = ""; while (j < s.length && d > 0) { const ch = s[j];
        if (ch === "\\") { buf += ch + s[j+1]; j += 2; continue; }
        if (ch === "(") d++; if (ch === ")") { d--; if (!d) { j++; break; } }
        buf += ch; j++; }
      out.push({ t: "str", v: buf }); i = j; continue; }
    if (c === "<" && s[i+1] !== "<") { const j = s.indexOf(">", i); out.push({ t: "hex", v: s.slice(i+1, j) }); i = j + 1; continue; }
    if (c === "<" && s[i+1] === "<") { let d = 0, j = i; while (j < s.length) { if (s[j] === "<" && s[j+1] === "<") { d++; j += 2; continue; } if (s[j] === ">" && s[j+1] === ">") { d--; j += 2; if (!d) break; continue; } j++; } out.push({ t: "dict" }); i = j; continue; }
    if (c === "[") { out.push({ t: "[" }); i++; continue; }
    if (c === "]") { out.push({ t: "]" }); i++; continue; }
    if (c === "/") { let j = i + 1; while (j < s.length && !/[\s/[\]<>()]/.test(s[j])) j++; out.push({ t: "name", v: s.slice(i+1, j) }); i = j; continue; }
    let j = i; while (j < s.length && !/[\s/[\]<>()]/.test(s[j])) j++;
    const w = s.slice(i, j); i = j;
    if (/^[-+.\d]/.test(w) && !isNaN(parseFloat(w))) out.push({ t: "num", v: parseFloat(w) });
    else out.push({ t: "op", v: w });
  }
  return out;
}
const unesc = (s) => s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (m, g) =>
  ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" }[g] ?? String.fromCharCode(parseInt(g, 8))));

export function walk(ctx, stream, resources, ctm, out, depth = 0) {
  if (depth > 8) return;
  const toks = tokenize(stream);
  let gs = { ctm, font: null, fi: null, size: 0, tc: 0, tw: 0, tz: 100, tl: 0, fill: "#000000", stroke: "#000000" };
  const stack = [];
  let tm = null, tlm = null, ops = [];
  const fontsDict = resources?.lookup?.(PDFName.of("Font"));
  const xoDict = resources?.lookup?.(PDFName.of("XObject"));
  const fontInfo = (n) => {
    try {
      const f = ctx.lookup(fontsDict.get(PDFName.of(n)));
      const name = String(f.get(PDFName.of("BaseFont"))).replace(/^\/(\w{6}\+)?/, "");
      const fc = f.get(PDFName.of("FirstChar"))?.asNumber?.() ?? 0;
      const wArr = ctx.lookup(f.get(PDFName.of("Widths")));
      const w = wArr?.asArray ? wArr.asArray().map((v) => ctx.lookup(v).asNumber()) : null;
      const mw = ctx.lookup(f.get(PDFName.of("FontDescriptor")))?.get?.(PDFName.of("MissingWidth"))?.asNumber?.() ?? 500;
      /* a composite (Type0) font — how pdf-lib, and Illustrator, write an
         embedded OpenType face: two-byte glyph codes, read back to letters
         through the font's ToUnicode map, widths from its /W array */
      if (String(f.get(PDFName.of("Subtype"))) === "/Type0") {
        const uni = new Map(), cw = new Map();
        const tu = f.get(PDFName.of("ToUnicode"));
        if (tu) {
          const cmap = Buffer.from(decodePDFRawStream(ctx.lookup(tu)).decode()).toString("latin1");
          const u16 = (h) => Buffer.from(h.length % 4 ? h.padStart(Math.ceil(h.length / 4) * 4, "0") : h, "hex").swap16().toString("utf16le");
          for (const [, blk] of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
            for (const [, a, b] of blk.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) uni.set(parseInt(a, 16), u16(b));
          for (const [, blk] of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
            for (const [, lo, hi, rest] of blk.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(\[[^\]]*\]|<[0-9A-Fa-f]+>)/g)) {
              const l = parseInt(lo, 16), h = parseInt(hi, 16);
              if (rest.startsWith("[")) [...rest.matchAll(/<([0-9A-Fa-f]+)>/g)].forEach(([, d], k) => uni.set(l + k, u16(d)));
              else { const d = rest.slice(1, -1); const base = parseInt(d, 16); for (let c = l; c <= h; c++) uni.set(c, u16((base + c - l).toString(16).padStart(d.length, "0"))); }
            }
          }
        }
        let dw = 1000;
        try {
          const desc = ctx.lookup(ctx.lookup(f.get(PDFName.of("DescendantFonts"))).asArray()[0]);
          dw = desc.get(PDFName.of("DW"))?.asNumber?.() ?? 1000;
          const W = desc.get(PDFName.of("W")) ? ctx.lookup(desc.get(PDFName.of("W"))).asArray().map((v) => ctx.lookup(v)) : [];
          for (let i = 0; i < W.length;) {
            const c0 = W[i].asNumber();
            if (W[i + 1]?.asArray) { W[i + 1].asArray().forEach((v, k) => cw.set(c0 + k, ctx.lookup(v).asNumber())); i += 2; }
            else { const c1 = W[i + 1].asNumber(), wv = W[i + 2].asNumber(); for (let c = c0; c <= c1; c++) cw.set(c, wv); i += 3; }
          }
        } catch { /* widths stay default */ }
        return { name, fc: 0, w: null, mw: dw, cid: true, uni, cw, dw };
      }
      return { name, fc, w, mw };
    } catch { return { name: n, fc: 0, w: null, mw: 500 }; }
  };
  let path = [], curves = 0, pend = [];
  for (const tk of toks) {
    if (tk.t !== "op") { ops.push(tk); continue; }
    const n = (k) => ops[ops.length - k]?.v ?? 0;
    switch (tk.v) {
      case "rg": gs.fill = rgb(n(3), n(2), n(1)); break;
      case "RG": gs.stroke = rgb(n(3), n(2), n(1)); break;
      case "g": gs.fill = rgb(n(1), n(1), n(1)); break;
      case "G": gs.stroke = rgb(n(1), n(1), n(1)); break;
      case "k": gs.fill = cmyk(n(4), n(3), n(2), n(1)); break;
      case "K": gs.stroke = cmyk(n(4), n(3), n(2), n(1)); break;
      case "sc": case "scn": if (ops.filter(o=>o.t==="num").length >= 3) gs.fill = ops.length>=4 && ops.filter(o=>o.t==="num").length===4 ? cmyk(n(4),n(3),n(2),n(1)) : rgb(n(3), n(2), n(1)); break;
      case "SC": case "SCN": if (ops.filter(o=>o.t==="num").length >= 3) gs.stroke = ops.filter(o=>o.t==="num").length===4 ? cmyk(n(4),n(3),n(2),n(1)) : rgb(n(3), n(2), n(1)); break;
      case "q": stack.push({ ...gs }); break;
      case "Q": gs = stack.pop() || gs; break;
      case "cm": gs.ctm = mul([n(6), n(5), n(4), n(3), n(2), n(1)], gs.ctm); break;
      case "BT": tm = [1,0,0,1,0,0]; tlm = tm; break;
      case "ET": tm = tlm = null; break;
      case "Tf": gs.size = n(1); gs.fi = fontInfo(ops[ops.length - 2]?.v); gs.font = gs.fi.name; break;
      case "Tc": gs.tc = n(1); break;
      case "Tw": gs.tw = n(1); break;
      case "Tz": gs.tz = n(1); break;
      case "TL": gs.tl = n(1); break;
      case "Tm": tm = tlm = [n(6), n(5), n(4), n(3), n(2), n(1)]; break;
      case "Td": tlm = mul([1,0,0,1,n(2),n(1)], tlm); tm = tlm; break;
      case "TD": gs.tl = -n(1); tlm = mul([1,0,0,1,n(2),n(1)], tlm); tm = tlm; break;
      case "T*": tlm = mul([1,0,0,1,0,-gs.tl], tlm); tm = tlm; break;
      case "Tj": case "'": case "\"": {
        if (tk.v !== "Tj") { tlm = mul([1,0,0,1,0,-gs.tl], tlm); tm = tlm; }
        const raw = ops[ops.length - 1];
        const s = raw?.t === "str" ? unesc(raw.v) : raw?.t === "hex" ? Buffer.from(raw.v, "hex").toString("latin1") : "";
        emit(s); break;
      }
      case "TJ": {
        let s = "", adj = 0;
        for (let k = ops.length - 1; k >= 0; k--) { if (ops[k].t === "[") break;
          if (ops[k].t === "str") s = unesc(ops[k].v) + s; else if (ops[k].t === "hex") s = Buffer.from(ops[k].v, "hex").toString("latin1") + s;
          else if (ops[k].t === "num") adj -= ops[k].v; }
        emit(s, adj); break;
      }
      case "re": { const [x, y, w, h] = [n(4), n(3), n(2), n(1)];
        const c = [[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(([px,py]) => apply(gs.ctm, px, py));
        pend.push({ x: Math.min(...c.map(p=>p[0])), y: Math.min(...c.map(p=>p[1])),
          w: Math.max(...c.map(p=>p[0]))-Math.min(...c.map(p=>p[0])), h: Math.max(...c.map(p=>p[1]))-Math.min(...c.map(p=>p[1])), fill: gs.fill, stroke: gs.stroke }); break; }
      case "m": case "l": path.push(apply(gs.ctm, n(2), n(1))); break;
      case "c": path.push(apply(gs.ctm, n(6), n(5))); path.push(apply(gs.ctm, n(4), n(3))); path.push(apply(gs.ctm, n(2), n(1))); curves++; break;
      case "v": case "y": path.push(apply(gs.ctm, n(4), n(3))); path.push(apply(gs.ctm, n(2), n(1))); curves++; break;
      case "S": case "s": case "f": case "F": case "f*": case "B": case "b":
        for (const r of pend) out.rects.push(r);
        pend = [];
        if (path.length > 1) { const xs = path.map(p=>p[0]), ys = path.map(p=>p[1]);
          out.paths.push({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs)-Math.min(...xs), h: Math.max(...ys)-Math.min(...ys), n: path.length, curves, op: tk.v, fill: gs.fill, stroke: gs.stroke }); }
        path = []; curves = 0; break;
      case "n": case "W": case "W*": if (tk.v === "n") { path = []; pend = []; } break;
      case "Do": {
        const nm = ops[ops.length - 1]?.v;
        try {
          const xo = ctx.lookup(xoDict.get(PDFName.of(nm)));
          const d = xo.dict || xo;
          if (String(d.get(PDFName.of("Subtype"))) === "/Form") {
            const mtx = d.get(PDFName.of("Matrix"));
            const m = mtx ? mtx.asArray().map((v) => v.asNumber()) : [1,0,0,1,0,0];
            const sub = Buffer.from(decodePDFRawStream(xo).decode()).toString("latin1");
            const rr = d.get(PDFName.of("Resources"));
            walk(ctx, sub, rr ? ctx.lookup(rr) : resources, mul(m, gs.ctm), out, depth + 1);
          } else out.images.push({ name: nm, ctm: gs.ctm.slice() });
        } catch (e) { out.errors.push(`Do ${nm}: ${e.message}`); }
        break;
      }
    }
    if (tk.v !== "]" ) ops = [];
  }
  /* after showing text the pen moves on by the text's advance — Illustrator
     writes a spaced word as several shows in one BT with no Td between */
  function advance(codes, adj) {
    let a = 0;
    for (const c of codes) {
      const gw = gs.fi?.cid ? (gs.fi.cw.get(c) ?? gs.fi.dw)
        : gs.fi?.w && c - gs.fi.fc >= 0 && c - gs.fi.fc < gs.fi.w.length ? gs.fi.w[c - gs.fi.fc] : (gs.fi?.mw ?? 500);
      a += gw / 1000 * gs.size + gs.tc + (!gs.fi?.cid && c === 32 ? gs.tw : 0);
    }
    a = (a + adj / 1000 * gs.size) * (gs.tz / 100);
    tm = mul([1, 0, 0, 1, a, 0], tm);
  }
  function emit(s, adj = 0) {
    if (!s || !tm) return;
    const codes = [];
    if (gs.fi?.cid) for (let i = 0; i + 1 < s.length; i += 2) codes.push((s.charCodeAt(i) << 8) | s.charCodeAt(i + 1));
    else for (const ch of s) codes.push(ch.charCodeAt(0));
    try { emitAt(s, adj); } finally { advance(codes, adj); }
  }
  function emitAt(s, adj = 0) {
    const m = mul(tm, gs.ctm);
    const size = gs.size * Math.hypot(m[0], m[1]);
    const rot = Math.atan2(m[1], m[0]) * 180 / Math.PI;
    const sc = Math.hypot(m[0], m[1]) * (gs.tz / 100);
    let wid = 0;
    if (gs.fi?.cid) {
      let text = "";
      for (let i = 0; i + 1 < s.length; i += 2) {
        const c = (s.charCodeAt(i) << 8) | s.charCodeAt(i + 1);
        text += gs.fi.uni.get(c) ?? "\ufffd";
        wid += ((gs.fi.cw.get(c) ?? gs.fi.dw) / 1000 * gs.size + gs.tc) * sc;
      }
      wid += adj / 1000 * size;
      out.texts.push({ s: text, x: m[4], y: m[5], size, rot, font: gs.font, fill: gs.fill, w: wid, track: gs.size ? gs.tc / gs.size : 0 });
      return;
    }
    for (const ch of s) { const c = ch.charCodeAt(0);
      const gw = gs.fi?.w && c - gs.fi.fc >= 0 && c - gs.fi.fc < gs.fi.w.length ? gs.fi.w[c - gs.fi.fc] : (gs.fi?.mw ?? 500);
      wid += (gw / 1000 * gs.size + gs.tc + (ch === " " ? gs.tw : 0)) * sc; }
    wid += adj / 1000 * size;
    out.texts.push({ s, x: m[4], y: m[5], size, rot, font: gs.font, fill: gs.fill, w: wid, track: gs.size ? gs.tc / gs.size : 0 });
  }
}

export async function geom(file) {
  const doc = await PDFDocument.load(fs.readFileSync(file), { updateMetadata: false });
  const pages = [];
  for (let i = 0; i < doc.getPageCount(); i++) {
    const p = doc.getPage(i), ctx = p.node.context;
    const c = p.node.Contents();
    const arr = c?.asArray ? c.asArray().map((r) => ctx.lookup(r)) : [c];
    let s = "";
    for (const st of arr) if (st instanceof PDFRawStream) s += Buffer.from(decodePDFRawStream(st).decode()).toString("latin1");
    const out = { texts: [], rects: [], paths: [], images: [], errors: [] };
    walk(ctx, s, p.node.Resources(), [1,0,0,1,0,0], out);
    pages.push({ w: p.getWidth(), h: p.getHeight(), ...out });
  }
  return pages;
}
