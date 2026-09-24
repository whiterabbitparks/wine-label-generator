import type { Template, TplText } from "./templates";

/* THE OWNER'S REVIEW EDITS (2026-09-23). He took the review sheet
   (tools/review-pdf.mts) into Illustrator, moved and re-set lines, and
   tools/review-diff.mts read his file back. Where his edit changes the
   STRUCTURE of one of his templates it is written here, on top of the
   drawn geometry (templates.data.ts stays exactly what his PDF says), and
   under the bench's corrections (overrides.ts) — so the order is:

     his drawing  →  his review edits (this file)  →  his bench nudges

   Numbers are his, read off his edited PDF: millimetres from the label's
   top-left at the 104 × 84 reference, sizes in points — and since
   2026-09-24 measured from his TRIM (100 × 80; the 2 mm bleed is outside),
   so each of his numbers below is 2 mm less than on his artboard. */

const key = (t: TplText) => t.fields.join("+");
const at = (t: Template, base: number, x: TplText, o: Partial<TplText> = {}): TplText =>
  ({ ...x, baseline: base, fromBottom: +(t.refH - base).toFixed(3), anchor: base > t.refH / 2 ? "bottom" : "top", ...o });

export const REVIEW_EDITS: Record<string, (t: Template) => Template> = {
  /* t02 (owner, 2026-09-23, on Mariam's label with "Brunello di
     Montalcino DOCG"): the appellation under the name is not bold — the
     name already is — and a little smaller; at 14 pt bold beside the
     16 pt name it read like a slip. */
  t02: (t) => ({
    ...t,
    texts: t.texts.map((x) => (key(x) === "appellation" ? { ...x, bold: false, size: 12 } : x)),
  }),
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
      ...at(t, 74.71, by("wineTypeLine"), { align: "center", x: t.refW / 2, size: 7, bold: false, accent: false }),
      fields: ["wineTypeLine", "alcVol"], join: " / ", sample: "Dry Red Wine / Alc.: 13.5% / 750 ml.",
    };
    return {
      ...t,
      art: { kind: "oval", x: 16.24, y: 21.73, w: 67.52, h: 32.24 },
      texts: [
        by("producer"), by("wineName"),
        at(t, 59.63, by("vintage")),
        at(t, 64.26, by("grape"), { size: 10, bold: true, accent: true }),
        at(t, 69.61, by("special"), { size: 7.52, bold: false, x: 5.0 }),
        at(t, 69.61, by("classification"), { size: 7.52, bold: true }),
        at(t, 69.61, by("regionCountry"), { size: 7.52, bold: false, x: 95.0 }),
        legal,
      ],
    };
  },
  /* t06: he opened the lower block a little — the producer/appellation
     pair and the two rows under the name each came down, the name, the
     vintage and the legal line stayed */
  t06: (t) => {
    const nb: Record<string, number> = { producer: 54.37, appellation: 54.42, special: 66.53, classification: 66.53, grape: 70.14, regionCountry: 70.14 };
    return { ...t, texts: t.texts.map((x) => (nb[key(x)] !== undefined ? at(t, nb[key(x)], x) : x)) };
  },
};

export const applyReviewEdits = (t: Template): Template => (REVIEW_EDITS[t.id] ? REVIEW_EDITS[t.id](t) : t);
