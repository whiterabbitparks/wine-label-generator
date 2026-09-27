import fs from "node:fs";
import path from "node:path";

/* VARIETY MEMORY (owner, 2026-09-27: "whatever I actually generate, take
   those decisions less in the next rounds until the other alternatives
   are used up — a different layout, another font, and if a painting had
   a big yellow ground, not another big yellow ground for a while — but
   close nothing off completely").

   Every painted label leaves a line here: its artist, template, hero
   face and ground. A choice is then made by WEIGHT, not by rule: each
   option's weight falls with how often — and how lately — it was used
   (the newest label counts 1, the one before 0.93, …, the 60th hardly at
   all), so the least-used options win most of the time and a used one
   still comes back now and then.

   LATER (owner): the versions a customer DOWNLOADS must be controlled
   far more strictly — never painted again. That is not built here. */

const FILE = path.join(process.cwd(), "data", "variety.json");
const KEEP = 60, DECAY = 0.93;
export type Made = { at: string; artist: string; template: string; face: string; ground: string };

function readAll(): Made[] {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")) as Made[]; } catch { return []; }
}
export function rememberMade(m: Omit<Made, "at">) {
  try {
    const all = [...readAll(), { ...m, at: new Date().toISOString() }].slice(-KEEP);
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(all, null, 1));
  } catch { /* memory is a nicety — painting never fails for it */ }
}

/* how "used" each value of one decision is, newest counting most */
export function usage(field: keyof Omit<Made, "at">): Map<string, number> {
  const all = readAll();
  const u = new Map<string, number>();
  all.forEach((m, i) => {
    const w = Math.pow(DECAY, all.length - 1 - i);
    u.set(m[field], (u.get(m[field]) || 0) + w);
  });
  return u;
}

/* a weighted draw: weight 1 / (1 + 2·use)² — an option used in the last
   few labels is some ten times less likely than a fresh one, never zero */
export function pickFresh<T>(options: T[], keyOf: (t: T) => string, used: Map<string, number>, rnd: () => number = Math.random): T {
  if (options.length <= 1) return options[0];
  const w = options.map((o) => 1 / Math.pow(1 + 2 * (used.get(keyOf(o)) || 0), 2));
  let r = rnd() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < options.length; i++) { r -= w[i]; if (r <= 0) return options[i]; }
  return options[options.length - 1];
}

/* the painting's ground as a plain colour word, from the label's ground hex */
export function groundWord(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (l > 0.9 && d < 0.12) return "white";
  if (l < 0.14) return "black";
  if (d < 0.12) return l > 0.75 ? "cream" : "grey";
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (l > 0.82) return h < 70 || h > 330 ? "cream" : "pale";
  return h < 15 || h >= 340 ? "red" : h < 40 ? "orange" : h < 68 ? "yellow" : h < 160 ? "green" : h < 200 ? "turquoise" : h < 255 ? "blue" : h < 290 ? "violet" : "pink";
}

/* a ground colour that has filled several of the latest labels is asked
   to rest — softly: only when it dominates, and only for coloured grounds
   (paper white and cream are the spot drawings' natural paper) */
export function restingGround(): string {
  const all = readAll().slice(-8);
  const n = new Map<string, number>();
  for (const m of all) if (m.ground && !["white", "cream", "pale"].includes(m.ground)) n.set(m.ground, (n.get(m.ground) || 0) + 1);
  const top = [...n.entries()].sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= 3 ? top[0] : "";
}
