/* THE TYPE OF A PLACEMENT AS SVG (label units: px at 12 px/mm). */
import { PX, type Placed, type Placement } from "./place";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: number) => (v * PX).toFixed(2);

export function lineSvg(p: Placed, fill: string): string {
  const f = `font-family="${esc(p.face.family)}" font-weight="${p.face.weight}"${p.face.italic ? ' font-style="italic"' : ""} font-size="${n(p.size)}" fill="${fill}"`;
  if (p.glyphs) return p.glyphs.map((g) => `<text x="${n(g.x)}" y="${n(g.y)}" text-anchor="middle" ${f} transform="rotate(${g.rot.toFixed(2)} ${n(g.x)} ${n(g.y)})">${esc(g.ch)}</text>`).join("");
  const t = p.rot ? ` transform="rotate(${p.rot} ${n(p.x)} ${n(p.y)})"` : "";
  return `<text x="${n(p.x)}" y="${n(p.y)}" text-anchor="${p.anchor}" ${f}${p.tracking ? ` letter-spacing="${n(p.tracking)}"` : ""}${t}>${esc(p.text)}</text>`;
}
/* inks: the wine's name in `accent`, everything else in `text` */
export function typeSvg(pl: Placement, inks: { text: string; accent: string }): string {
  return pl.lines.map((p) => lineSvg(p, p.line.fields[0] === "wineName" ? inks.accent : inks.text)).join("");
}
export function zoneSvg(pl: Placement, fill = "#e6e6e6"): string {
  const z = pl.zone; if (!z) return "";
  return z.kind === "oval"
    ? `<ellipse cx="${n(z.x + z.w / 2)}" cy="${n(z.y + z.h / 2)}" rx="${n(z.w / 2)}" ry="${n(z.h / 2)}" fill="${fill}"/>`
    : `<rect x="${n(z.x)}" y="${n(z.y)}" width="${n(z.w)}" height="${n(z.h)}" fill="${fill}"/>`;
}
