/* THE BRIDGE between the final-round engine and the site (2026-10-04).
   The wizard, the store, the PDF, the back label and the marketing shots
   all speak the hybrid engine's language (HybridOutput, Layout,
   StoredLabel); here a final-round label is handed over in it, and a
   stored final-round label is set again (the details changed, or another
   layout of the same painting) without a model call.

   The site runs the old template engine until the owner decides (he
   judges the new layouts in the admin first — 2026-10-04); LAYOUT2=1 in
   the environment switches the site over. */
import { LAYOUTS } from "./layouts.data";
import { FAMILIES, familyOf, pickLayout, suits, kindOf, textFits, type LayoutKind } from "./engine";
import { composeLayout2, zoneAspectOf, shapeFits, type ComposeResult } from "./compose";
import { placeLayout } from "./place";
import { cleanPaper } from "@/lib/typeset/palette";
import { paintLayout2Label, facesOf } from "./paint";
import type { Faces, PlacedLayout } from "./place";
import type { Layout2 } from "./spec";
import type { Layout, LaidLine } from "@/lib/typeset/compose";
import type { HybridOutput } from "@/lib/label/hybrid";
import type { Layout2Meta } from "@/lib/label/store";
import type { EvalModel } from "@/lib/eval/models";
import { bankFamilies, templateFields } from "@/lib/typeset/templates";
import { mix } from "@/lib/typeset/fonts";

export const layout2On = () => process.env.LAYOUT2 === "1";
export const isLayout2Id = (id?: string | null) => !!id && /^L\d\d$/.test(id);

/* the hybrid engine's Layout from a final-round composition — what the
   PDF draws from: every set line with its colour and key, the picture's
   box (the whole file, uncropped) */
export function toLayout(placed: PlacedLayout, picture: ComposeResult["picture"], ground: string, inks: { text: string; accent: string }, aw: number, ah: number): Layout {
  const lines: LaidLine[] = [];
  for (const l of placed.lines) {
    const colour = l.accent ? inks.accent : inks.text;
    const base = { size: l.size, family: l.face.family, weight: l.face.weight, italic: !!l.face.italic, colour, key: l.src.fields.join("+") };
    if (l.arcLetters) for (const g of l.arcLetters) lines.push({ ...base, text: g.ch, x: g.x, y: g.y, tracking: 0, anchor: "middle", rot: g.rot });
    else lines.push({ ...base, text: l.text, x: l.x, y: l.y, tracking: l.tracking, anchor: l.anchor, ...(l.rot ? { rot: l.rot } : {}) });
  }
  const art = picture ? { x: picture.x, y: picture.y, w: picture.w, h: picture.h } : { x: 0, y: 0, w: 0, h: 0 };
  return { W: placed.W, H: placed.H, ground, art, artCrop: { x: 0, y: 0, w: aw, h: ah }, lines };
}

const facesName = (f: Faces, lay: Layout2) => `${f.hero.family} ${f.hero.weight}/${f.text.weight} · ${lay.id}`;
const meta2 = (r: { ground: { ground: string; source: string }; inks: { text: string; accent: string; allColoured: boolean }; faces: Faces }): Layout2Meta => ({ ground: { ground: r.ground.ground, source: r.ground.source }, inks: { text: r.inks.text, accent: r.inks.accent, allColoured: r.inks.allColoured }, faces: { hero: r.faces.hero, bold: r.faces.bold, title: r.faces.title, text: r.faces.text } });

export type Bridged = HybridOutput & { tag: string; painter: string; artist: string; repainted: boolean; template: string; hasPaper: boolean; refSet: string; panel: boolean; scene: boolean; layout2: Layout2Meta; warnings: string[] };

/* A NEW LABEL. The column's KIND (centred / sides / vertical) is dealt
   by the run's token in hybrid.ts; a family of that kind that suits the
   size and was not shown by this artist this session is taken. The
   run's three versions take three different hero faces (the token deals
   them, as before). */
export async function paintWithLayout2(a: { model: EvalModel; vision: string; data: Record<string, string>; widthMm: number; heightMm: number; seed: number; kind: LayoutKind; avoidFamilies: string[]; family?: string; sketch?: string | null; refSet?: number; small?: boolean; runKey?: number; col?: number }): Promise<Bridged> {
  const artist = a.model.artist as typeof a.model.artist & { fontCats?: ("serif" | "sans" | "display")[] };
  /* the face: of the run's families, the one dealt to this column */
  let seed = a.seed;
  const fams = bankFamilies(artist.fontCats);
  if (a.runKey !== undefined && fams.length >= 2) {
    const want = fams[(Math.floor(a.runKey / 6) + (a.col || 0)) % fams.length];
    for (let k = 0; k < 4000; k++) { const sd = (Math.random() * 0xffffffff) >>> 0; if (facesOf(sd, a.data, artist.fontCats).faces.hero.family === want) { seed = sd; break; } }
  }
  const r = await paintLayout2Label({ vision: a.vision, data: a.data, widthMm: a.widthMm, heightMm: a.heightMm, artistId: artist.id, seed, kind: a.kind, family: a.family, avoidFamilies: a.avoidFamilies, sketch: a.sketch, refSet: a.refSet, small: a.small });
  const aw = r.picture ? Math.round(r.picture.w) : 1, ah = r.picture ? Math.round(r.picture.h) : 1;
  const meta = await (await import("sharp")).default(Buffer.from(r.art.slice(r.art.indexOf(",") + 1), "base64")).metadata();
  const layout = toLayout(r.placed, r.picture, r.ground.ground, r.inks, meta.width || aw, meta.height || ah);
  return {
    png: r.png, svg: r.svg, art: r.art, faces: facesName(r.faces, r.lay), ink: r.inks.text, ground: r.ground.ground, prompt: r.prompt, layout, fit: "vignette",
    tag: `${r.lay.id}|${r.faces.hero.family}`, painter: r.painter, artist: r.artist, repainted: r.repainted, template: r.lay.id, hasPaper: true, refSet: r.refSet, panel: true, scene: false,
    layout2: meta2(r), warnings: r.warnings,
  };
}

/* THE SAME PAINTING SET AGAIN. `keep`: the details changed — the same
   layout, ground, inks and faces (a details-only change never repaints,
   owner 2026-09-23). Otherwise another family of the same kind that
   suits the size, the ground kept (the stored picture already lies on
   it); `avoid` = tags already shown. */
export async function relayoutWithLayout2(stored: { art: Buffer; meta: { widthMm: number; heightMm: number; template?: string; layout2?: Layout2Meta; artist?: string; ground: string } }, data: Record<string, string>, keep: boolean, avoid: string[] = []): Promise<HybridOutput & { tag: string; template: string; panel?: boolean; layout2: Layout2Meta }> {
  const m = stored.meta;
  const m2 = m.layout2!;
  const { widthMm, heightMm } = m;
  const was = LAYOUTS.find((l) => l.id === m.template) || LAYOUTS[0];
  let lay = pickLayout(familyOf(was.id) || [was], widthMm, heightMm);
  const faces: Faces = m2.faces;
  const art = `data:image/png;base64,${stored.art.toString("base64")}`;
  const fields = templateFields(data);
  if (!keep) {
    /* ONLY A LAYOUT OF THE PAINTING'S SHAPE (owner, 2026-10-04): the
       panel's ink box is measured and a family is offered only when its
       zone on this label has that proportion (within 1.4×) */
    const sheet = await cleanPaper(art);
    const sm = await (await import("sharp")).default(stored.art).metadata();
    const panelAspect = (sheet.ink.w * (sm.width || 1)) / Math.max(1, sheet.ink.h * (sm.height || 1));
    const kind = kindOf(was), used = new Set(avoid.map((t) => t.split("|")[0]));
    const fitsShape = (f: Layout2[]) => { const l = pickLayout(f, widthMm, heightMm); const za = zoneAspectOf(placeLayout(l, fields, widthMm, heightMm, faces)); return za !== null && shapeFits(panelAspect, za); };
    const okFor = (f: Layout2[]) => suits(f, widthMm, heightMm) && f[0].id !== (familyOf(was.id) || [was])[0].id && !used.has(f[0].id) && fitsShape(f) && textFits(f, fields, widthMm, heightMm, faces);
    const pool = FAMILIES.filter((f) => kindOf(f[0]) === kind && okFor(f));
    const any = pool.length ? pool : FAMILIES.filter(okFor);
    if (any.length) lay = pickLayout(any[mix(avoid.length + 1, 43) % any.length], widthMm, heightMm);
    else throw new Error("NO_OTHER_LAYOUT: no other layout has a zone of this painting's shape at this size");
  }
  const r = await composeLayout2({ lay, fields, widthMm, heightMm, faces, artwork: art, ground: m2.ground.ground, inks: { text: m2.inks.text, accent: m2.inks.accent }, sheetDone: true });
  const meta = await (await import("sharp")).default(stored.art).metadata();
  const layout = toLayout(r.placed, r.picture, m2.ground.ground, m2.inks, meta.width || 1, meta.height || 1);
  return { png: r.png, svg: r.svg, art, faces: facesName(faces, lay), ink: m2.inks.text, ground: m2.ground.ground, prompt: keep ? "(the same painting, the details set again)" : "(another layout of the same painting)", layout, fit: "vignette", tag: `${lay.id}|${faces.hero.family}`, template: lay.id, panel: true, layout2: m2 };
}
