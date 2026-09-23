import { buildArtworkPrompt, asKind, evalModel, generateArtwork, artistModels } from "@/lib/eval/models";
import { composeTemplateLabel, templatesOf, pickTemplate, IVORY } from "@/lib/typeset/compose-template";
import { TEMPLATES } from "@/lib/typeset/templates.data";
import type { Template } from "@/lib/typeset/templates";
import { cleanPaper } from "@/lib/typeset/palette";
import { artKindOf, type ArtKind, type Band } from "@/lib/typeset/templates";
import { faceFile, pickRoles, mix } from "@/lib/typeset/fonts";
import type { Layout } from "@/lib/typeset/compose";
import { painterFor } from "./painters";

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

export async function paintHybridLabel(inp: HybridInput): Promise<HybridOutput & { tag: string; painter: string; artist?: string; repainted: boolean }> {
  const style = ["traditional", "contemporary", "punk"].includes(inp.style) ? inp.style : "traditional";
  const seed = inp.seed ?? (Math.random() * 0xffffffff) >>> 0;
  const widthMm = Math.min(300, Math.max(30, inp.widthMm || 110));
  const heightMm = Math.min(300, Math.max(30, inp.heightMm || 80));
  const brief = { id: "wizard", title: "wizard", vision: inp.vision, data: inp.data, width: widthMm, height: heightMm };
  /* the column's artist (admin → Artists); any artist with a LoRA if unset */
  const model = (inp.artistId ? evalModel(`artist:${inp.artistId}`) : null)
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
  const painted = await gen429(() => generateArtwork(model, ap, { sketch: inp.sketch || null }));
  /* 2026-09-22 (owner): the artist's LoRA learned her PAPER as well as
     her hand, so the picture arrives wrinkled and unevenly lit, and its
     rectangle then shows against the label's one flat colour. The clean
     part of a picture must be clean — see cleanPaper. */
  /* only a SPOT floats on the label's paper, so only a spot's paper is
     repainted to it — a bleed keeps the ground the artist painted
     (owner: "inside the image leave the backgrounds alone") */
  const art = artKindOf(tpl) === "spot" ? (await cleanPaper(painted.art, IVORY)).art : painted.art;
  /* 2026-09-22: the type is set on ONE OF THE OWNER'S TWELVE DRAWN
     TEMPLATES, not invented. The three columns keep their keys but now
     mean his three bands — classical, contemporary, free — so one artist
     shows the widest spread he asked for: a centred serif label, a
     cleaner column one, and a free one in a written hand. */
  const out = await composeTemplateLabel({
    artwork: art, band, template: tpl.id, data: inp.data,
    widthMm, heightMm, seed, wineColour: inp.data.wineColorName,
  });
  if (out.warnings.length) console.warn(`[template ${out.template}] ${out.warnings.join("; ")}`);
  return { png: out.png, svg: out.svg, art, faces: out.faces, ink: out.ink, ground: out.layout.ground, prompt: ap.prompt, layout: out.layout, tag: `${out.template}|${out.faces.split(" ")[0]}`, fit: "vignette", painter: model.id, artist: model.artist.name, repainted: painted.repainted };
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
  const art = raw;
  /* 2026-09-22: a variation is now A DIFFERENT TEMPLATE from the same
     band — the strongest contrast there is, and still no model call. The
     tags already shown are avoided, so three variations of one painting
     are three different arrangements of his own. */
  const band = bandOf(style);
  const used = new Set(avoid.map((a) => a.split("|")[0]));
  /* a variation stays with the SAME KIND of picture — the painting was
     made for it, and a spot dropped into a bleed layout would be cut */
  const kind = artKindOf((TEMPLATES as Template[]).find((t) => t.id === (stored.meta as { template?: string }).template || "") || templatesOf(band)[0]);
  const pool = templatesOf(band).filter((t) => artKindOf(t) === kind);
  const free = pool.filter((t) => !used.has(t.id));
  const pick = (free.length ? free : pool)[Math.floor(Math.random() * (free.length ? free.length : pool.length))];
  const seed = (Math.random() * 0xffffffff) >>> 0;
  const out = await composeTemplateLabel({
    artwork: art, band, template: pick.id, data,
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
