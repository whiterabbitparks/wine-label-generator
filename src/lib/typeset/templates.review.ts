import type { Template, TplText } from "./templates";

/* THE OWNER'S REVIEW EDITS (2026-09-23). He took the review sheet
   (tools/review-pdf.mts) into Illustrator, moved and re-set lines, and
   tools/review-diff.mts read his file back. Where his edit changes the
   STRUCTURE of one of his templates it is written here, on top of the
   drawn geometry (templates.data.ts stays exactly what his PDF says), and
   under the bench's corrections (overrides.ts) — so the order is:

     his drawing  →  his review edits (this file)  →  his bench nudges

   Numbers are his, read off his edited PDF: millimetres from the label's
   top-left at the 104 × 84 reference, sizes in points. */

const key = (t: TplText) => t.fields.join("+");
const at = (t: Template, base: number, x: TplText, o: Partial<TplText> = {}): TplText =>
  ({ ...x, baseline: base, fromBottom: +(t.refH - base).toFixed(3), anchor: base > t.refH / 2 ? "bottom" : "top", ...o });

export const REVIEW_EDITS: Record<string, (t: Template) => Template> = {
  /* t05, the arced name. The real legal line ("13.5% Alc. by Vol. /
     750 mL") is longer than his placeholder, and his foot row could not
     hold it. He re-set the foot: the grape alone under the vintage, in
     the accent; one row of special | classification | region at 7.5 pt,
     the classification the only bold one; the wine type and the legal
     line joined on one centred line. The vintage rose with it, and the
     oval is the one the engine had already given that room. */
  t05: (t) => {
    const by = (k: string) => t.texts.find((x) => key(x) === k)!;
    const legal: TplText = {
      ...at(t, 76.71, by("wineTypeLine"), { align: "center", x: t.refW / 2, size: 7, bold: false, accent: false }),
      fields: ["wineTypeLine", "alcVol"], join: " / ", sample: "Dry Red Wine / Alc.: 13.5% / 750 ml.",
    };
    return {
      ...t,
      art: { kind: "oval", x: 18.24, y: 23.73, w: 67.52, h: 32.24 },
      texts: [
        by("producer"), by("wineName"),
        at(t, 61.63, by("vintage")),
        at(t, 66.26, by("grape"), { size: 10, bold: true, accent: true }),
        at(t, 71.61, by("special"), { size: 7.52, bold: false, x: 7.0 }),
        at(t, 71.61, by("classification"), { size: 7.52, bold: true }),
        at(t, 71.61, by("regionCountry"), { size: 7.52, bold: false, x: 97.0 }),
        legal,
      ],
    };
  },
  /* t06: he opened the lower block a little — the producer/appellation
     pair and the two rows under the name each came down, the name, the
     vintage and the legal line stayed */
  t06: (t) => {
    const nb: Record<string, number> = { producer: 56.37, appellation: 56.42, special: 68.53, classification: 68.53, grape: 72.14, regionCountry: 72.14 };
    return { ...t, texts: t.texts.map((x) => (nb[key(x)] !== undefined ? at(t, nb[key(x)], x) : x)) };
  },
};

export const applyReviewEdits = (t: Template): Template => (REVIEW_EDITS[t.id] ? REVIEW_EDITS[t.id](t) : t);
