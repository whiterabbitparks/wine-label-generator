/* A PLACED LAYOUT AS SVG — the type, and (optionally) the image zone as
   his grey guide. The picture itself is composed elsewhere; this is the
   typographic layer every final-round label shares with the preview tool
   (tools/layout2-preview.mts), so what the tool measures against his
   artboards is exactly what the labels set. */
import type { Placed, PlacedLayout } from "./place";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface Inks { text: string; accent: string }

export function textSvg(l: Placed, inks: Inks): string {
  const fill = l.accent ? inks.accent : inks.text;
  const font = `font-family="${esc(l.face.family)}" font-weight="${l.face.weight}"${l.face.italic ? ' font-style="italic"' : ""} font-size="${l.size.toFixed(2)}"`;
  if (l.arcLetters) {
    /* an arced word, letter by letter on his circle */
    return l.arcLetters.map((g) => `<text x="${g.x.toFixed(2)}" y="${g.y.toFixed(2)}" text-anchor="middle" fill="${fill}" ${font} transform="rotate(${g.rot.toFixed(2)} ${g.x.toFixed(2)} ${g.y.toFixed(2)})">${esc(g.ch)}</text>`).join("");
  }
  const t = l.rot ? ` transform="rotate(${l.rot.toFixed(2)} ${l.x.toFixed(2)} ${l.y.toFixed(2)})"` : "";
  return `<text x="${l.x.toFixed(2)}" y="${l.y.toFixed(2)}" text-anchor="${l.anchor}" fill="${fill}" ${font}`
    + (l.tracking ? ` letter-spacing="${l.tracking.toFixed(2)}"` : "") + `${t}>${esc(l.text)}</text>`;
}

export function zoneSvg(p: PlacedLayout, fill = "#e6e6e6"): string {
  const z = p.zone; if (!z) return "";
  return z.kind === "oval"
    ? `<ellipse cx="${(z.x + z.w / 2).toFixed(2)}" cy="${(z.y + z.h / 2).toFixed(2)}" rx="${(z.w / 2).toFixed(2)}" ry="${(z.h / 2).toFixed(2)}" fill="${fill}"/>`
    : `<rect x="${z.x.toFixed(2)}" y="${z.y.toFixed(2)}" width="${z.w.toFixed(2)}" height="${z.h.toFixed(2)}" fill="${fill}"/>`;
}

/* the whole label as his artboard shows it: ground, grey zone, type;
   `bleed` px drawn around the trim (his PNGs show 2 mm) */
export function layoutSvg(p: PlacedLayout, opts: { ground?: string; inks?: Inks; zone?: boolean; bleed?: number } = {}): string {
  const b = opts.bleed ?? 0, W = p.W + 2 * b, H = p.H + 2 * b;
  const inks = opts.inks ?? { text: "#111111", accent: "#111111" };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${-b} ${-b} ${W} ${H}">`
    + `<rect x="${-b}" y="${-b}" width="${W}" height="${H}" fill="${opts.ground ?? "#ffffff"}"/>`
    + (opts.zone === false ? "" : zoneSvg(p))
    + p.lines.map((l) => textSvg(l, inks)).join("")
    + `</svg>`;
}
