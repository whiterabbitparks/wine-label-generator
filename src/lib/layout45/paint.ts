/* ONE NEW LABEL, PAINTED FOR ONE OF HIS LAYOUTS (final round, 2026-10-04).

   1. LAYOUT: a family of the wanted kind that suits the label's size and
      holds these words (engine.ts); his twin nearer the proportion.
   2. GROUND, BEFORE PAINTING (owner, 2026-10-04: "give the colour before it
      paints … the artwork and the background must go together as in the
      artist's originals"). The painter is shown one set of three of the
      artist's own works; the ground is taken from the grounds read off
      THOSE works (grounds.ts), weighted by how many carry it; else from all
      the artist's grounds. Pirosmani's black and Tatishvili's white are
      simply what their works carry.
   3. THE ASK: one panel of the zone's shape, painted directly ON that
      ground — named in words and as a number, in the sketch and in the
      repaint. The sketch is checked for ground all round and for its
      shape; the finished painting is checked again; a wrong shape is
      painted again (twice at most), then the label fails — it is never
      squeezed into the zone.
   4. THE LABEL'S GROUND IS THE SHEET THE PAINTING CAME BACK ON (found and
      flattened by cleanPaper) — so it always goes with the painting.
   5. INKS: the wine's name in the painting's colour steered by the wine,
      the rest 95 % black (white on a dark ground) or the same colour. */
import { buildArtworkPrompt, asKind, evalModel, generateArtwork, BLEED, type EvalModel } from "@/lib/eval/models";
import { nextRefSet } from "@/lib/label/artists";
import { ideaInEnglish } from "@/lib/label/translate";
import { cleanPaper } from "@/lib/typeset/palette";
import { templateFields } from "@/lib/typeset/templates";
import type { FontCat } from "@/lib/typeset/font-bank";
import { FAMILIES, familyOf, pickRef, kindOf, suits, layoutLabel, facesFromBank, type Kind } from "./engine";
import { composeLabel, visibleZone, shapeFits, type Composed } from "./compose";
import { artistGrounds, dE, lab } from "./grounds";
import { nameOf, mainColourOf, inksFor, type Inks } from "./colour";
import type { Faces } from "./place";
import type { Layout } from "./spec";

export interface PaintInput {
  model: EvalModel; vision: string; data: Record<string, string>; widthMm: number; heightMm: number;
  seed: number; kind?: Kind; family?: string; avoid?: string[]; sketch?: string | null; small?: boolean; refSet?: number;
}
export interface Painted extends Composed {
  lay: Layout; faces: Faces; inks: Inks; ground: string; asked: { hex: string; name: string };
  art: string; ink: { x: number; y: number; w: number; h: number }; prompt: string; refSet: string; repainted: boolean; warnings: string[];
}

const unit = (seed: number, salt: number) => { let h = (seed ^ Math.imul(salt, 0x9e3779b9)) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/* a family of this kind that suits the size and the words, not shown lately */
export function chooseFamily(fields: ReturnType<typeof templateFields>, W: number, H: number, faces: Faces, cats: FontCat[] | null | undefined, seed: number, kind?: Kind, avoid: string[] = []): Layout[] | null {
  const ok = FAMILIES.filter((f) => suits(f, fields, W, H, faces, cats));
  const ofKind = kind ? ok.filter((f) => kindOf(f[0]) === kind) : ok;
  const pool0 = ofKind.length ? ofKind : ok;
  const fresh = pool0.filter((f) => !f.some((l) => avoid.includes(l.id)));
  const pool = fresh.length ? fresh : pool0;
  return pool.length ? pool[Math.floor(unit(seed, 41) * pool.length)] : null;
}

/* the ground, from the works the painter will be shown */
/* the fixed exceptions (owner): Pirosmani ALWAYS on black (profile
   keepGround "black" — one of his works has a blue field, and a label came
   out blue); Grigol Tatishvili only on white or a light warm tone (profile
   paper). Their grounds are taken only from their own tones of that kind. */
const LIGHT = (h: string) => lab([1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)))[0];
export async function groundFor(artistId: string, files: string[] | undefined, seed: number, rule?: { keepGround?: string; paper?: string }): Promise<string> {
  const g = await artistGrounds(artistId);
  let tones = g.tones;
  if (rule?.keepGround === "black") { tones = tones.filter((t) => LIGHT(t.hex) < 15); if (!tones.length) return "#121110"; }
  else if (rule?.keepGround) { tones = tones.filter((t) => dE(t.hex, rule.keepGround!) < 25); if (!tones.length) return rule.keepGround; }
  if (rule?.paper) { tones = tones.filter((t) => LIGHT(t.hex) > 85); if (!tones.length) return "#FFFFFF"; }
  const own = files?.length ? tones.filter((t) => t.works.some((w) => files.includes(w))) : [];
  const pool = own.length ? own : tones;
  if (!pool.length) return "#F4EFE3";
  const total = pool.reduce((s, t) => s + t.works.length, 0);
  let v = unit(seed, 13) * total;
  for (const t of pool) { v -= t.works.length; if (v <= 0) return t.hex; }
  return pool[0].hex;
}

export async function paintLabel(inp: PaintInput): Promise<Painted> {
  const warnings: string[] = [];
  const { model, widthMm: W, heightMm: H, seed } = inp;
  const artist = model.artist as typeof model.artist & { fontCats?: FontCat[]; keepGround?: string; paper?: string };
  const fields = templateFields(inp.data);
  /* the face first; a face so wide that none of the layouts can hold these
     words at this size gives way to the bank's next one */
  let faces = facesFromBank(seed, inp.data, artist.fontCats);
  let fam = (inp.family && familyOf(inp.family)) || null;
  for (let k = 0; !fam && k < 12; k++) {
    if (k) faces = facesFromBank((seed + k * 2654435761) >>> 0, inp.data, artist.fontCats);
    fam = chooseFamily(fields, W, H, faces, artist.fontCats, seed, inp.kind, inp.avoid);
    if (!fam) warnings.push(`${faces.hero.family}/${faces.body.family}: no layout holds these words at ${W}×${H} — another face`);
  }
  if (!fam) throw new Error(`NO_LAYOUT: none of the 45 layouts holds these words at ${W}×${H} mm in any approved face`);
  const lay = pickRef(fam, W, H);
  const placement = layoutLabel(fam, fields, W, H, faces, artist.fontCats);
  const v = visibleZone(placement);
  if (!v) throw new Error(`${lay.id} has no image zone`);
  const zoneAspect = v.aspect;

  /* the reference set first, then the ground from its works */
  const k = inp.refSet ?? Math.floor(unit(seed, 17) * 8);
  const set = nextRefSet(artist.id, k);
  const groundHex = await groundFor(artist.id, set.files, seed, { keepGround: artist.keepGround, paper: artist.paper });
  const groundName = nameOf(groundHex);

  /* the ask */
  const brief = { id: "wizard", title: "wizard", vision: await ideaInEnglish(inp.vision), data: inp.data, width: W, height: H };
  const abstract = !String(inp.vision || "").trim() && !inp.sketch;
  const ap = asKind(await buildArtworkPrompt(brief, model.artist, abstract), "spot");
  ap.aspect = zoneAspect > 1.25 ? "landscape" : zoneAspect < 0.8 ? "portrait" : "square";
  const canvasAsp = ap.aspect === "landscape" ? 1.5 : ap.aspect === "portrait" ? 2 / 3 : 1;
  const sheet = `${groundName} paper (${groundHex})`;
  ap.around = sheet;
  const shape = zoneAspect >= 1 ? `about ${zoneAspect.toFixed(1)} times wider than tall` : `about ${(1 / zoneAspect).toFixed(1)} times taller than wide`;
  const panelText = `THE PICTURE IS ONE PANEL, PAINTED DIRECTLY ON ${sheet.toUpperCase()}: the whole sheet is that colour, as in the artist's own works on this ground, and the painting's colours are chosen to sit on it the way they do there. Paint the scene as a single panel ${shape}, large and centred, with a clear margin of the flat, empty ${groundName} sheet on ALL FOUR sides — about a tenth of the canvas each side, nothing painted there, the panel never touching the canvas edge. The panel's outline is the painter's own loose, irregular edge, where the paint meets the ${groundName} sheet — never a frame, never a straight ruled line, never an oval, never a white or cream patch behind the picture. Every figure whole, every face and animal, the whole story, well inside the panel.`;
  ap.kind = "spot"; ap.edgeSide = undefined; ap.guide = undefined;
  ap.prompt = ap.prompt.includes(BLEED) ? ap.prompt.replace(BLEED, panelText) : `${ap.prompt} ${panelText}`;
  if (artist.paper) ap.prompt += ` THE GROUND: always ${artist.paper}.`;

  /* the sketch: ground all round, and the zone's shape */
  let refusal: "paper" | "tall" | "wide" = "paper";
  const accept = async (s: string) => {
    const c = await cleanPaper(s);
    refusal = "paper";
    if (!(c.cleaned && c.ink.x > 0.015 && c.ink.y > 0.015 && c.ink.x + c.ink.w < 0.985 && c.ink.y + c.ink.h < 0.985)) return false;
    const r = (c.ink.w / Math.max(0.01, c.ink.h)) * canvasAsp / zoneAspect;
    if (r < 1 / 1.3) { refusal = "tall"; return false; }
    if (r > 1.3) { refusal = "wide"; return false; }
    return true;
  };
  const retry = () => refusal === "paper"
    ? `IMPORTANT — THE LAST TRY FILLED THE WHOLE CANVAS: leave a wide empty margin of the flat ${sheet} on ALL FOUR sides, about a tenth of the canvas each side.`
    : `IMPORTANT — THE LAST TRY HAD THE WRONG SHAPE: it was ${refusal === "tall" ? "too tall and narrow" : "too wide and low"}. The painted panel must be ${shape}${zoneAspect >= 1 ? " — the figures side by side, never stacked into a tall group" : ""}, with the empty ${groundName} sheet around it.`;

  let painted!: Awaited<ReturnType<typeof generateArtwork>>;
  let c!: Awaited<ReturnType<typeof cleanPaper>>;
  let panelAspect = 0, aw = 1, ah = 1;
  for (let attempt = 0; attempt < 3; attempt++) {
    const apTry = attempt ? { ...ap, prompt: `${ap.prompt} ${retry()}` } : ap;
    painted = await generateArtwork(model, apTry, { sketch: inp.sketch || null, refSet: k, small: inp.small, accept, retry });
    c = await cleanPaper(painted.art);
    if (!c.cleaned) c = await cleanPaper(painted.art, undefined, undefined, { lenient: true });
    if (!c.cleaned) { refusal = "paper"; warnings.push(`attempt ${attempt + 1}: no plain sheet round the painting`); continue; }
    /* the fixed exceptions hold on what came BACK too: Pirosmani's sheet must be black, Tatishvili's light */
    if ((artist.keepGround === "black" && LIGHT(c.ground) > 20) || (artist.paper && LIGHT(c.ground) < 80)) {
      warnings.push(`attempt ${attempt + 1}: came back on ${c.ground}, the artist's ground is ${artist.keepGround || "white/light"} — painted again`);
      refusal = "paper"; c = undefined as never; continue;
    }
    const m = await (await import("sharp")).default(Buffer.from(c.art.slice(c.art.indexOf(",") + 1), "base64")).metadata();
    aw = m.width || 1024; ah = m.height || 1024;
    panelAspect = (c.ink.w * aw) / Math.max(1, c.ink.h * ah);
    if (shapeFits(panelAspect, zoneAspect)) break;
    refusal = panelAspect < zoneAspect ? "tall" : "wide";
    warnings.push(`attempt ${attempt + 1}: panel ${panelAspect.toFixed(2)} for a zone of ${zoneAspect.toFixed(2)} — painted again`);
    c = undefined as never;
  }
  if (!c?.cleaned || !shapeFits(panelAspect, zoneAspect)) throw new Error(`SHAPE_MISMATCH: ${model.artist.name} could not paint a panel of ${lay.id}'s shape (${warnings.join("; ")})`);

  /* the label's ground is the sheet it came back on */
  const ground = c.ground;
  if (dE(ground, groundHex) > 20) warnings.push(`asked for ${groundHex} (${groundName}), the painting came back on ${ground}`);
  const inks = inksFor(await mainColourOf(c.art, ground), ground, inp.data.wineColorName, seed);
  const out = await composeLabel({ lay, fields, widthMm: W, heightMm: H, faces: placement.faces, art: c.art, ink: c.ink, ground, inks, placement });
  return { ...out, lay, faces: placement.faces, inks, ground, asked: { hex: groundHex, name: groundName }, art: c.art, ink: c.ink, prompt: ap.prompt, refSet: painted.refSet, repainted: painted.repainted, warnings };
}

export { evalModel };
