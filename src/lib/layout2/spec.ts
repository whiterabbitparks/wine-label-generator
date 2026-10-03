/* THE FINAL-ROUND LAYOUT SPECIFICATION (2026-10-03). A layout is the
   owner's artboard, measured: lines of type, each held by one edge
   (anchor) and one horizontal hold, and an IMAGE ZONE — the most the
   picture may cover, never a mask. Millimetres from the trim's top-left,
   sizes in points. */
export type FieldKey = "producer" | "wineName" | "appellation" | "classification" | "vintage" | "grape" | "regionCountry" | "special" | "wineTypeLine" | "alcVol";

export interface LayoutText {
  fields: FieldKey[];
  join?: string;
  align: "left" | "center" | "right";
  anchor: "top" | "bottom";
  fromTop: number; fromBottom: number;     /* the baseline, from each edge */
  left: number; right: number; centre: number;   /* its horizontal holds (left/right = to the trim) */
  size: number; bold: boolean; role: "title" | "body"; italic: boolean; accent: boolean; caps: boolean; tracking: number;
  rot: 0 | 90 | -90;
  vStart?: number; vEndFromTop?: number;   /* a vertical line: where it starts (from the bottom) and ends (from the top) */
  arc?: { cx: number; cyFromTop: number; r: number; up: boolean; sweep: number };
  sample: string;
}
export interface Layout2 {
  id: string; page: number; twin: string | null;
  refW: number; refH: number;
  zone: { kind: "rect" | "oval"; x: number; y: number; w: number; h: number; bleeds: { left: boolean; right: boolean; top: boolean; bottom: boolean } } | null;
  texts: LayoutText[];
}
