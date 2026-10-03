/* THE SHAPE OF ONE OF THE OWNER'S 45 LAYOUTS (final round, 2026-10-04) —
   what tools/l45/extract.mjs writes into layouts.data.ts. Millimetres from
   the trim's top-left; sizes in points at his reference size. */

export type FieldKey = "producer" | "wineName" | "appellation" | "classification" | "vintage" | "grape" | "regionCountry" | "special" | "wineTypeLine" | "alcVol";

export interface Line {
  fields: FieldKey[];             /* one field, or several joined by " / " */
  sample: string;                 /* his placeholder words */
  size: number;                   /* pt */
  bold: boolean; italic: boolean;
  role: "title" | "body";         /* his Times lines / his Garamond lines */
  caps: boolean; tracking: number /* em */; accent: boolean;
  rot: 0 | 90;
  anchor: "top" | "bottom";       /* the edge that holds it when the label grows */
  /* a flat line */
  align?: "left" | "center" | "right";
  left?: number; right?: number;  /* its ink box from each side */
  fromTop?: number; fromBottom?: number;   /* its baseline from each edge */
  arc?: { cx: number; cyFromTop: number; r: number; up: boolean; sweep: number };
  /* a line reading upward */
  colX?: number; start?: number; end?: number; side?: "left" | "right";
}
export interface Zone { kind: "rect" | "oval"; x: number; y: number; w: number; h: number; bleeds: { left: boolean; right: boolean; top: boolean; bottom: boolean } }
export interface Layout { id: string; page: number; twin: string | null; refW: number; refH: number; zone: Zone | null; texts: Line[] }
