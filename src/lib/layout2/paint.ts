/* THE FINAL-ROUND PAINTER (2026-10-04): one label from an idea, an
   artist, a layout family and a size.

   1. the layout: the family's twin nearer the label's proportion; its
      zone (place.ts zoneFor) gives the picture's proportion;
   2. the ask: the artist's charter + the story (buildArtworkPrompt), as
      ONE PANEL of the zone's proportion on a plain sheet — the painter's
      own loose edge, nothing important near it (the panel method the
      owner approved on 2026-10-01). The canvas is the model's shape
      nearest the zone (landscape / square / portrait); the sketch is
      checked for sheet all round and for its shape, and redrawn if not;
   3. the sheet: found and measured (cleanPaper), the palette read;
   4. the ground: painting-dictated / white / warm light in the admin's
      shares; Pirosmani's black and Tatishvili's light paper kept;
   5. the inks: the 60/40 rule, steered by the wine's colour;
   6. the label: composeLayout2 — type by his layout, picture by its ink,
      the sheet recoloured to the ground. No multiply, no fade, no mask. */
import { buildArtworkPrompt, asKind, evalModel, generateArtwork, artistModels, BLEED } from "@/lib/eval/models";
import { ideaInEnglish } from "@/lib/label/translate";
import { cleanPaper } from "@/lib/typeset/palette";
import { facesFor, bankFamilies, typedCaps, templateFields, type Band } from "@/lib/typeset/templates";
import { mix } from "@/lib/typeset/fonts";
import { FAMILIES, familyOf, pickLayout, suits, kindOf, type LayoutKind } from "./engine";
import { noCapsFamilies } from "@/lib/typeset/font-bank";
import { placeLayout, type Faces } from "./place";
import { composeLayout2, type ComposeResult } from "./compose";
import { paletteOf, chooseGround, chooseInks, type GroundShares, type GroundChoice, type InkChoice } from "./ground";
import { artistGrounds } from "./artist-grounds";
import type { Layout2 } from "./spec";

export interface PaintInput {
  vision: string;
  data: Record<string, string>;      /* the wizard's field record */
  widthMm: number;
  heightMm: number;
  artistId: string;
  family?: string;                   /* a layout id of the family wanted; else one that suits the size */
  kind?: LayoutKind;                 /* …of this kind (the wizard's columns: centred / sides / vertical) */
  faces?: Faces;                     /* the faces decided already (re-layouts) */
  seed?: number;
  sketch?: string | null;
  refSet?: number;
  small?: boolean;                   /* repaint small — tests, the admin */
  shares?: GroundShares;             /* the admin's ground shares */
  avoidFamilies?: string[];          /* family ids already shown this run */
}
export interface PaintResult extends ComposeResult {
  lay: Layout2; family: string; artist: string; painter: string;
  ground: GroundChoice; inks: InkChoice; faces: Faces; facesName: string;
  prompt: string; repainted: boolean; refSet: string; sheet: string; mainColour: string | null;
}

/* the label's faces from the font bank: the wine's name in the hero
   face, everything else in ONE companion family (its regular for the
   body, its heavier weight where his artboard is bold) */
export function facesOf(seed: number, data: Record<string, string>, cats?: ("serif" | "sans" | "display")[] | null): { faces: Faces; name: string } {
  const band: Band = "classical";
  const f = facesFor(band, seed, typedCaps(Object.values(templateFields(data))), cats);
  const nc = noCapsFamilies();
  const mark = (x: { family: string; weight: number; italic?: boolean }) => (nc.has(x.family) ? { ...x, noCaps: true } : { ...x });
  const faces: Faces = { hero: mark(f.hero), bold: mark({ family: f.small.family, weight: Math.max(f.secondary.weight, f.small.weight) }), title: mark(f.small), text: mark(f.small) };
  return { faces, name: `${f.hero.family} ${f.hero.weight} · ${f.small.family} ${f.small.weight}/${faces.bold.weight}` };
}

/* a family that suits the size: the one wanted, else one not shown yet */
export function familyFor(widthMm: number, heightMm: number, want?: string, avoid: string[] = [], seed = 1, kind?: LayoutKind): Layout2[] {
  if (want) { const f = familyOf(want); if (f) return f; }
  const fits = FAMILIES.filter((f) => suits(f, widthMm, heightMm));
  const ofKind = kind ? fits.filter((f) => kindOf(f[0]) === kind) : fits;
  const ok = ofKind.length ? ofKind : fits;
  const fresh = ok.filter((f) => !avoid.includes(f[0].id));
  const pool = fresh.length ? fresh : ok.length ? ok : FAMILIES;
  return pool[mix(seed, 41) % pool.length];
}

export async function paintLayout2Label(inp: PaintInput): Promise<PaintResult> {
  const seed = inp.seed ?? (Math.random() * 0xffffffff) >>> 0;
  const widthMm = Math.min(300, Math.max(30, inp.widthMm)), heightMm = Math.min(300, Math.max(30, inp.heightMm));
  const model = evalModel(`artist:${inp.artistId}`) || artistModels().find((m) => m.artist.id === inp.artistId);
  if (!model) throw new Error(`no such artist: ${inp.artistId}`);
  const artist = model.artist as typeof model.artist & { keepGround?: string; paper?: string; fontCats?: ("serif" | "sans" | "display")[] };

  const family = familyFor(widthMm, heightMm, inp.family, inp.avoidFamilies, seed, inp.kind);
  const lay = pickLayout(family, widthMm, heightMm);
  const fields = templateFields(inp.data);
  const chosen = inp.faces ? { faces: inp.faces, name: `${inp.faces.hero.family} ${inp.faces.hero.weight} · ${inp.faces.text.family} ${inp.faces.text.weight}/${inp.faces.bold.weight}` } : facesOf(seed, inp.data, artist.fontCats);
  const { faces, name: facesName } = chosen;

  /* the zone's proportion, with this type on this label */
  const probe = placeLayout(lay, fields, widthMm, heightMm, faces);
  const z = probe.zone;
  const zoneAspect = z ? Math.max(0.2, Math.min(5, z.w / z.h)) : 1;

  /* the ask */
  const brief = { id: "wizard", title: "wizard", vision: await ideaInEnglish(inp.vision), data: inp.data, width: widthMm, height: heightMm };
  const abstract = !String(inp.vision || "").trim() && !inp.sketch;
  const ap = asKind(await buildArtworkPrompt(brief, model.artist, abstract), "spot");
  ap.aspect = zoneAspect > 1.25 ? "landscape" : zoneAspect < 0.8 ? "portrait" : "square";
  const kg = artist.keepGround, pg = artist.paper;
  const around = pg ? `plain ${pg}` : kg ? `plain ${kg} ground (the artist's own bare ${kg} ground, never white or cream paper)` : "paper";
  if (kg) ap.around = `${kg} ground`;
  if (pg) { ap.around = pg; ap.prompt += ` THE GROUND: always ${pg} — the picture stays light; never a dark, black or strongly coloured field, sky or background, whatever the story.`; }
  const shape = zoneAspect >= 1 ? `about ${zoneAspect.toFixed(1)} times wider than tall` : `about ${(1 / zoneAspect).toFixed(1)} times taller than wide`;
  const panelText = `THE PICTURE IS ONE PANEL: paint the whole scene as a single panel ${shape}, large and centred, with a clear margin of ${kg || pg ? `flat, empty ${around}` : "plain, flat, empty paper of one tone"} on ALL FOUR sides — about a tenth of the canvas on each side, nothing painted there, the panel never touching the canvas edge. The panel is filled edge to edge with the scene; its outline is the painter's own loose, irregular edge — never a frame, never a straight ruled line, never an oval. Every figure whole, every face and every animal, the whole story, well inside the panel; its outermost rim may be trimmed away, so nothing important sits near the panel's edges.`;
  ap.kind = "spot"; ap.edgeSide = undefined; ap.guide = undefined;
  ap.prompt = ap.prompt.includes(BLEED) ? ap.prompt.replace(BLEED, panelText) : `${ap.prompt} ${panelText}`;

  /* the sketch must float on its sheet and have the zone's shape */
  const canvasAsp = ap.aspect === "landscape" ? 1.5 : ap.aspect === "portrait" ? 2 / 3 : 1;
  let refusal: "paper" | "tall" | "wide" = "paper";
  const onPaper = async (s: string) => {
    const c = await cleanPaper(s);
    refusal = "paper";
    if (!(c.cleaned && c.ink.x > 0.015 && c.ink.y > 0.015 && c.ink.x + c.ink.w < 0.985 && c.ink.y + c.ink.h < 0.985)) return false;
    const r = (c.ink.w / Math.max(0.01, c.ink.h)) * canvasAsp / zoneAspect;
    if (r < 0.72) { refusal = "tall"; return false; }
    if (r > 1.4) { refusal = "wide"; return false; }
    return true;
  };
  const retry = () => refusal === "paper"
    ? `IMPORTANT — THE LAST TRY FILLED THE WHOLE CANVAS: this time leave a wide empty margin of ${kg || pg ? around : "plain, flat paper"} on ALL FOUR sides, about a tenth of the canvas each side; the picture must not touch any edge of the canvas.`
    : `IMPORTANT — THE LAST TRY HAD THE WRONG SHAPE: it was ${refusal === "tall" ? "too tall and narrow" : "too wide and low"}. This time the painted panel must be ${zoneAspect >= 1 ? `${zoneAspect.toFixed(1)} times wider than tall — a long ${zoneAspect >= canvasAsp ? "low band running across the whole width of the canvas, with wide empty margin above and below it" : "panel"}` : `${(1 / zoneAspect).toFixed(1)} times taller than wide — an upright panel, with wide empty margin at its sides`}${zoneAspect >= 1 ? "; arrange the figures side by side within it, never stacked into a tall group" : ""}.`;

  const painted = await generateArtwork(model, ap, { sketch: inp.sketch || null, refSet: inp.refSet, small: inp.small, accept: onPaper, retry });

  /* the sheet and the palette */
  let c = await cleanPaper(painted.art);
  if (!c.cleaned) c = await cleanPaper(painted.art, undefined, undefined, { lenient: true });
  if (!c.cleaned) {
    /* the repaint buried the sheet under its grain: the sketch's box stands in */
    const sk = await cleanPaper(painted.story);
    if (sk.cleaned) c = { ...c, ink: sk.ink };
    console.warn(`[layout2] ${model.id}: no plain sheet found on the repaint${sk.cleaned ? " — the sketch's box is used" : ""}`);
  }
  const pal = await paletteOf(c.art, c.ground);
  const originals = (await artistGrounds(artist.id)).grounds;
  const ground = chooseGround(pal, seed, { shares: inp.shares, keepGround: kg, paper: pg, wineColour: inp.data.wineColorName, originals });
  const inks = chooseInks(pal, ground.ground, seed, inp.data.wineColorName);

  const out = await composeLayout2({ lay, fields, widthMm, heightMm, faces, artwork: c.art, ground: ground.ground, inks: { text: inks.text, accent: inks.accent }, sheetDone: !c.cleaned });
  return { ...out, lay, family: family[0].id, artist: model.artist.name, painter: model.id, ground, inks, faces, facesName, prompt: ap.prompt, repainted: painted.repainted, refSet: painted.refSet, sheet: c.ground, mainColour: pal.main };
}

export { bankFamilies };
