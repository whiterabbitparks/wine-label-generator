/* COLOURS FOR THE FINAL ROUND (2026-10-04).

   - a ground colour is NAMED for the painter (the sketch and the repaint
     read words better than numbers; the number rides along);
   - the TYPE's colours: the wine's name in a colour taken from the
     painting and steered by the wine (red → reds, white → greens, amber →
     clay, rosé → dusty rose — the more for a pale painting); everything
     else 95 % black, or — on 40 % of labels — the same colour as the name.
     On a dark ground the "black" becomes 95 % white (owner, 2026-10-04).
     Every ink must read on the ground (4.5 : 1). */
import sharp from "sharp";
import { readable } from "../typeset/compose-template";
import { lab, dE } from "./grounds";

const rgbOf = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
export const lumOf = (h: string) => { const c = rgbOf(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
export const isDark = (h: string) => lumOf(h) < 0.18;

/* "a deep warm mustard-ochre" — hue, lightness and chroma in plain words */
export function nameOf(h: string): string {
  const [L, a, b] = lab(rgbOf(h));
  const C = Math.hypot(a, b), H = (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
  const light = L > 90 ? "very pale" : L > 78 ? "pale" : L > 62 ? "light" : L > 45 ? "mid-toned" : L > 28 ? "deep" : "very dark";
  if (C < 6) return L > 93 ? "clean white" : L < 15 ? "black" : `${light} neutral grey`;
  const hues: [number, string][] = [[20, "rose-red"], [45, "terracotta red"], [62, "burnt orange"], [78, "ochre"], [92, "mustard-ochre"], [105, "straw yellow"], [125, "olive"], [160, "sage green"], [200, "green"], [235, "teal"], [262, "sky blue"], [290, "blue"], [320, "violet"], [345, "plum"], [360, "rose-red"]];
  const hue = hues.find(([lim]) => H < lim)![1];
  const warm = C < 18 ? (H > 40 && H < 120 ? (L > 70 ? "cream" : "warm grey-brown") : "greyish") : C < 35 ? "soft" : "strong";
  if (C < 18 && L > 70 && H > 40 && H < 120) return `${light} warm cream`;
  return `${light} ${warm} ${hue}`;
}

/* the painting's main colour: of its ink (off the ground), the colour
   carrying the most area weighted by its saturation */
export async function mainColourOf(art: string, ground: string): Promise<string | null> {
  const { data, info } = await sharp(Buffer.from(art.slice(art.indexOf(",") + 1), "base64")).removeAlpha().resize(160, 160, { fit: "inside" }).raw().toBuffer({ resolveWithObject: true });
  const bins = new Map<string, { n: number; s: number[] }>();
  for (let i = 0; i < data.length; i += info.channels) {
    const c = [data[i], data[i + 1], data[i + 2]], h = hex(c);
    if (dE(h, ground) < 12) continue;
    const mx = Math.max(...c), mn = Math.min(...c), sat = mx ? (mx - mn) / mx : 0, L = lab(c)[0];
    if (sat < 0.25 || L < 15 || L > 92) continue;
    const k = c.map((v) => v >> 5).join("-");
    const e = bins.get(k) || { n: 0, s: [0, 0, 0] };
    e.n++; e.s = e.s.map((v, j) => v + c[j]); bins.set(k, e);
  }
  const best = [...bins.values()].sort((a, b) => b.n - a.n)[0];
  return best && best.n > 30 ? hex(best.s.map((v) => v / best.n)) : null;
}

const WINE: Record<string, string> = { red: "#8B1A1A", white: "#3F5C2E", amber: "#9A5B22", orange: "#9A5B22", rose: "#B0566A", "rosé": "#B0566A" };
const unit = (seed: number, salt: number) => { let h = (seed ^ Math.imul(salt, 0x9e3779b9)) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export interface Inks { accent: string; text: string; allColoured: boolean }
export function inksFor(main: string | null, ground: string, wineColour: string | undefined, seed: number): Inks {
  const wine = WINE[(wineColour || "").toLowerCase()] || null;
  let c = rgbOf(main || wine || "#8B1A1A");
  if (main && wine) {
    const mx = Math.max(...c), mn = Math.min(...c), sat = mx ? (mx - mn) / mx : 0;
    const pull = sat < 0.3 ? 0.8 : sat < 0.5 ? 0.5 : 0.3;
    const w = rgbOf(wine);
    c = c.map((v, i) => v * (1 - pull) + w[i] * pull);
  }
  const accent = readable(hex(c), ground);
  const allColoured = unit(seed, 7) < 0.4;
  const neutral = readable(isDark(ground) ? "#F2F2F2" : "#0D0D0D", ground);
  return { accent, text: allColoured ? accent : neutral, allColoured };
}
