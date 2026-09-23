import fs from "node:fs";
import path from "node:path";
import { TEMPLATES } from "./templates.data";
import type { Template } from "./templates";

/* THE OWNER'S CORRECTIONS (2026-09-23). He draws the templates, the tool
   reads them, and then — in /admin → Layouts — he drags a line or the
   picture until it sits right. What he moves is written HERE, and this
   file wins over the drawn numbers.

   It holds the same numbers his artboard holds, in the same units, at
   the same reference size: millimetres from the label's top-left, points
   for type. So a correction is not a nudge on one label — it is a change
   to the template, and it carries to every size, every seed and every
   customer's words. */

const FILE = path.join(process.cwd(), "data", "templates-overrides.json");

export type Correction = {
  texts?: Record<string, { x?: number; baseline?: number; size?: number; align?: "left" | "center" | "right" }>;
  art?: { x?: number; y?: number; w?: number; h?: number };
};
export type Corrections = Record<string, Correction>;   /* template id → correction */

export function readCorrections(): Corrections {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")) as Corrections; } catch { return {}; }
}
export function writeCorrections(c: Corrections) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(c, null, 2) + "\n");
}

/* a text is addressed by the fields it carries, which is stable however
   the template is re-drawn */
export const keyOf = (fields: string[]) => fields.join("+");

export function applyCorrections(tpl: Template, c: Corrections = readCorrections()): Template {
  const fix = c[tpl.id];
  if (!fix) return tpl;
  const texts = tpl.texts.map((t) => {
    const f = fix.texts?.[keyOf(t.fields)];
    return f ? { ...t, ...f } : t;
  });
  const art = tpl.art && fix.art ? { ...tpl.art, ...fix.art } : tpl.art;
  return { ...tpl, texts, art };
}

/* every template, as the owner last left it */
export function templatesNow(): Template[] {
  const c = readCorrections();
  return (TEMPLATES as Template[]).map((t) => applyCorrections(t, c));
}
