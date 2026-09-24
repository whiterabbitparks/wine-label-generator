import { buildArtworkPrompt, asKind, evalModel, generateArtwork, artistModels, BLEED } from "@/lib/eval/models";
import { composeTemplateLabel, templatesOf, pickTemplate, inkLost } from "@/lib/typeset/compose-template";
import { templatesNow } from "@/lib/typeset/overrides";
import type { Template } from "@/lib/typeset/templates";
import { cleanPaper } from "@/lib/typeset/palette";
import { artKindOf, bleedsOf, layoutFromTemplate, templateFields, type ArtKind, type Band } from "@/lib/typeset/templates";
import { faceFile, pickRoles, mix } from "@/lib/typeset/fonts";
import type { Layout } from "@/lib/typeset/compose";
import { painterFor, mixedPainter } from "./painters";

/* the wizard's three columns are the owner's three bands (2026-09-22:
   "first option can be classical… second contemporary… third more free,
   so we have the most variety within one artist") */
export const bandOf = (style: string): Band =>
  style === "contemporary" ? "contemporary" : style === "punk" ? "free" : "classical";

/* THE HYBRID ENGINE for the wizard (branch POPIKA_Back_To_Vector, round
   84; round 105 on POPIKA_Artists). One call:

     the ARTIST paints the picture — gpt-image paints the story shown her
       works, FLUX + her LoRA repaints it in her hand (models.ts) — as a
       spot illustration on plain paper;
     the composer trims the air and sets the TYPE by code — Google faces,
       grouped blocks, 120 % leading, measured fit — so the label comes
       back as live type (SVG) and a print PNG.

   No text is ever painted, so no proofreading, no strict redream. */

export interface HybridInput {
  vision: string;
  style: string;
  data: Record<string, string>;
  widthMm: number;
  heightMm: number;
  sketch?: string | null;
  seed?: number;
  /* round 112 #4: paint in THIS artist's hand, whatever the column says */
  artistId?: string;
  /* one generation run's token: the three columns share it and get a
     mixed cast of artists from it (painters.ts mixedPainter) */
  order?: string;
  /* force one of the artist's reference sets (0-based) — tests only */
  refSet?: number;
}
export interface HybridOutput {
  png: string;          /* data URL — the print bitmap at 12 px/mm */
  svg: string;          /* live type over the artwork */
  art: string;          /* the painter's picture alone */
  faces: string;
  ink: string;
  ground: string;
  prompt: string;
  layout: Layout;       /* every set line in label px — the PDF draws from it */
  fit?: "yield" | "crop" | "top" | "vignette";
}

/* the label's texts, exactly as the dream engine derives them */
export function textsOf(d: Record<string, string>) {
  return {
    wine: d.wine || "Wine", producer: d.producer || "", appellation: d.appellation || "", vintage: d.vintage || "",
    grape: d.grape || "", region: [d.region, d.country].filter(Boolean).join(", "),
    classification: d.classification || "", special: d.special || "",
    legal: [[d.sweetness, d.wineColorName, "Wine"].filter(Boolean).join(" "), `${d.alcohol || "12.5"}% Alc. by Vol. / ${d.volume || "750"} mL`].join(" / "),
  };
}

/* three columns paint in parallel from the wizard — a burst can trip the
   images rate limit; honour the hint and retry once */
async function gen429<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/429|rate.?limit/i.test(msg)) throw e;
    const hinted = msg.match(/try again in (\d+(?:\.\d+)?)s/i);
    await new Promise((r) => setTimeout(r, hinted ? Math.ceil(parseFloat(hinted[1]) * 1000) + 1000 : 20000));
    return fn();
  }
}

export async function paintHybridLabel(inp: HybridInput): Promise<HybridOutput & { tag: string; painter: string; artist?: string; repainted: boolean; template: string; hasPaper: boolean; refSet: string }> {
  const style = ["traditional", "contemporary", "punk"].includes(inp.style) ? inp.style : "traditional";
  const seed = inp.seed ?? (Math.random() * 0xffffffff) >>> 0;
  const widthMm = Math.min(300, Math.max(30, inp.widthMm || 110));
  const heightMm = Math.min(300, Math.max(30, inp.heightMm || 80));
  const brief = { id: "wizard", title: "wizard", vision: inp.vision, data: inp.data, width: widthMm, height: heightMm };
  /* the column's artist (admin → Artists); any artist with a LoRA if unset */
  const model = (inp.artistId ? evalModel(`artist:${inp.artistId}`) : null)
    || (inp.order ? evalModel(mixedPainter(inp.order, style)) : null)
    || evalModel(await painterFor(style)) || artistModels().find((m) => m.lora) || artistModels()[0];
  if (!model) throw new Error("no artist is set up yet (data/artists/<id>/profile.json + lora.json)");
  /* 2026-09-22: THE TEMPLATE IS CHOSEN BEFORE THE PAINTING, and so is
     the KIND of picture. A spot is an illustration that floats on the
     paper with its own edge; a bleed runs off the label. They are
     different pictures, so the column decides which it wants, paints
     that, and only ever shows layouts that use it. */
  const band = bandOf(style);
  /* only the shapes this column's band actually offers — the free
     column has no wide band drawn, so it must not ask for one */
  const offered = [...new Set(templatesOf(band).map(artKindOf))];
  const kind: ArtKind = offered[mix(seed, 21) % offered.length] || "spot";
  const tpl = pickTemplate(band, seed, kind);
  const zone = tpl.art || { w: tpl.refW, h: tpl.refH };
  const zoneAspect = (zone.w / tpl.refW * widthMm) / (zone.h / tpl.refH * heightMm);
  const ap = asKind(await buildArtworkPrompt(brief, model.artist), artKindOf(tpl) === "spot" ? "spot" : "bleed");
  ap.aspect = zoneAspect > 1.25 ? "landscape" : zoneAspect < 0.8 ? "portrait" : "square";
  /* 2026-09-23 (owner, twice): "only the legs of a person on the chair
     showed — work the picture's proportion out from the room the label
     leaves", and "a picture that runs off three sides must not be cut
     with a straight line on the type's side — its edge should look like
     the artist meant it". Now that a painting serves ONE label, it can be
     painted for it: it runs off the sides that leave the label and, on
     the side that faces the type, ends in the painter's own edge with
     plain ground beyond. The painted part is given the WINDOW's shape, so
     nothing that matters falls outside the label. */
  type Side = "top" | "bottom" | "left" | "right";
  let edgeSides: Side[] = [];
  if (artKindOf(tpl) !== "spot") {
    const bl = bleedsOf(tpl);
    edgeSides = (["bottom", "top", "right", "left"] as const).filter((k) => !bl[k]);
    if (edgeSides.length) {
      /* the type lies across the picture's height (above and/or below it)
         or across its width (beside it) */
      const horiz = edgeSides.every((k) => k === "top" || k === "bottom");
      ap.aspect = horiz
        ? (zoneAspect >= 1.2 ? "landscape" : zoneAspect >= 0.8 ? "square" : "portrait")
        : (zoneAspect <= 1.2 ? "landscape" : "square");
      const canvas = ap.aspect === "landscape" ? 1.5 : ap.aspect === "portrait" ? 2 / 3 : 1;
      const frac = Math.min(0.85, Math.max(0.35, horiz ? canvas / zoneAspect : zoneAspect / canvas));
      const pct = Math.round(frac * 100);
      const runs = (["top", "bottom", "left", "right"] as const).filter((k) => bl[k]).join(", ");
      const both = edgeSides.length > 1;
      const where = both
        ? (horiz ? `a horizontal strip across the MIDDLE of the canvas, about ${pct}% of its height` : `a vertical strip down the MIDDLE of the canvas, about ${pct}% of its width`)
        : edgeSides[0] === "bottom" ? `the top ${pct}% of the canvas` : edgeSides[0] === "top" ? `the bottom ${pct}% of the canvas`
          : edgeSides[0] === "right" ? `the left ${pct}% of the canvas` : `the right ${pct}% of the canvas`;
      const toward = edgeSides.join(" and toward the ");
      const edgeText = `THE PAINTING AND ITS EDGE: the painting fills ${where} and runs off the ${runs} edges of the canvas, cut by them as if the sheet were larger. Toward the ${toward} it does NOT reach the edge: it ends in the painter's own loose, irregular edge — brushed, torn or dissolving, never a straight line, never a frame — and beyond that edge the rest of the canvas is plain, flat, EMPTY ground in one tone taken from the painting's own palette, with nothing drawn on it. Everything that matters — every figure whole, every face, the whole story — sits inside the painted part.`;
      ap.prompt = ap.prompt.includes(BLEED) ? ap.prompt.replace(BLEED, edgeText) : `${ap.prompt} ${edgeText}`;
      ap.edgeSide = edgeSides.join(" and ") as never;
    }
  }
  const painted = await gen429(() => generateArtwork(model, ap, { sketch: inp.sketch || null, refSet: inp.refSet }));
  /* 2026-09-22 (owner): the artist's LoRA learned her PAPER as well as
     her hand, so the picture arrives wrinkled and unevenly lit, and its
     rectangle then shows against the label's one flat colour. The clean
     part of a picture must be clean — see cleanPaper. */
  /* only a SPOT floats on the label's paper, so only a spot's paper is
     repainted to it — a bleed keeps the ground the artist painted
     (owner: "inside the image leave the backgrounds alone") */
  /* the paper is flattened and MEASURED: cleanPaper grows the paper in
     from the edge, so it knows exactly where the drawing is. Inside the
     drawing nothing is touched — a flat ground Levan painted is his. */
  /* a band/panel picture has plain ground only on its type-facing side —
     the paper is looked for there and nowhere else */
  const cleaned = await cleanPaper(painted.art, undefined, edgeSides.length ? edgeSides : undefined);
  const art = cleaned.art;

  /* 2026-09-23 (owner: "we no longer generate variations — the rules
     that made one image fit different labels are not needed"): the
     painting stays in the template it was painted FOR. It used to be
     re-scored against every template of its shape, and could land in one
     whose window it was never composed for. */
  const chosen = tpl;

  const out = await composeTemplateLabel({
    artwork: art, band, template: chosen.id, data: inp.data, ink: cleaned.ink, paper: cleaned.ground,
    edge: cleaned.cleaned && edgeSides.length ? edgeSides : undefined,
    widthMm, heightMm, seed, wineColour: inp.data.wineColorName,
  });
  if (out.warnings.length) console.warn(`[template ${out.template}] ${out.warnings.join("; ")}`);
  return { png: out.png, svg: out.svg, art, faces: out.faces, ink: out.ink, ground: out.layout.ground, prompt: ap.prompt, layout: out.layout, tag: `${out.template}|${out.faces.split(" ")[0]}`, fit: "vignette", painter: model.id, artist: model.artist.name, repainted: painted.repainted, template: out.template, hasPaper: cleaned.cleaned, refSet: painted.refSet };
}

/* ROUND 86 #3 (owner: "keep the image, just change the layout — tons of
   variations without burning generations"). A variation re-sets the type
   on the SAME painting with a fresh seed: new faces, hero size, wine-ink
   role, air — no model call, no credit. */
/* ROUND 94 #6 (owner): every painting ships with THREE layouts that read
   clearly different — a different hero face AND a different hero size
   from every earlier layout of the same painting (`avoid` = the tags of
   those). A tag is "family|sizeBucket"; the seed is re-drawn until both
   differ (20 tries; then only the face has to differ). */
export function layoutTag(style: string, seed: number): string {
  return `${pickRoles(style, seed).hero.face.family}|${mix(seed, 16) % 5}`;
}
/* recipes for real contrast (owner: "enough contrast between fonts and
   arrangements"): `big` insists on the largest hero sizes; `flip` sets
   the type on the OTHER alignment (a centred style goes left, a left one
   goes centred) */
export async function relayoutLabel(stored: { art: Buffer; meta: { style: string; widthMm: number; heightMm: number; ground: string; fit?: "yield" | "crop" | "top" | "vignette" } }, data: Record<string, string>, avoid: string[] = [], recipe: { big?: boolean; flip?: boolean } = {}): Promise<HybridOutput & { tag: string }> {
  const { style, widthMm, heightMm, ground } = stored.meta;
  const raw = `data:image/png;base64,${stored.art.toString("base64")}`;
  /* a picture stored before the clean-paper pass still has its wrinkles;
     a re-layout is the moment to take them out */
  /* 2026-09-22: a variation is now A DIFFERENT TEMPLATE from the same
     band — the strongest contrast there is, and still no model call. The
     tags already shown are avoided, so three variations of one painting
     are three different arrangements of his own. */
  const band = bandOf(style);
  const used = new Set(avoid.map((a) => a.split("|")[0]));
  const cleaned = await cleanPaper(raw);
  const art = cleaned.art;
  /* a variation is another layout of the SAME picture — the owner's
     three rows. Only layouts of its own shape, and only the ones it fits
     without being dragged past the trim. */
  const kind = artKindOf(templatesNow().find((t) => t.id === (stored.meta as { template?: string }).template) || templatesOf(band)[0]);
  const pool = templatesOf(band).filter((t) => artKindOf(t) === kind);
  const scored = pool.map((t) => {
    const probe = layoutFromTemplate({ template: t, fields: templateFields(data), widthMm, heightMm, seed: 1, ground: cleaned.ground, ink: "#111", accent: "#111" });
    return { t, lost: inkLost(t, cleaned.ink, widthMm, heightMm, probe.art) };
  }).filter((x) => x.lost <= 0.35).sort((a, b) => a.lost - b.lost);
  const free = scored.filter((x) => !used.has(x.t.id));
  const pick = (free.length ? free : scored.length ? scored : [{ t: pool[0], lost: 0 }])[0].t;
  const seed = (Math.random() * 0xffffffff) >>> 0;
  const out = await composeTemplateLabel({
    artwork: art, band, template: pick.id, data, ink: cleaned.ink, paper: cleaned.ground,
    widthMm, heightMm, seed, wineColour: data.wineColorName,
  });
  void recipe;
  return { png: out.png, svg: out.svg, art, faces: out.faces, ink: out.ink, ground: out.layout.ground || ground, prompt: "(re-layout of an existing painting)", layout: out.layout, tag: `${out.template}|${out.faces.split(" ")[0]}`, fit: "vignette" };
}

/* the TTFs a label's SVG sets its type in — shipped beside the SVG so
   Illustrator opens it with the right faces */
export function fontFilesOf(svg: string): string[] {
  const files = new Set<string>();
  const re = /font-family="([^"]+)" font-weight="(\d+)"( font-style="italic")?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) files.add(faceFile({ family: m[1].replace(/&amp;/g, "&"), weight: Number(m[2]), italic: !!m[3] }));
  return [...files];
}
