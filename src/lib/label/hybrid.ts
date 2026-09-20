import { buildArtworkPrompt, evalModel, generateArtworkChecked } from "@/lib/eval/models";
import { composeLabel } from "@/lib/typeset/compose";
import { flatGroundOf } from "@/lib/typeset/palette";
import { faceFile, pickRoles, mix } from "@/lib/typeset/fonts";
import type { Layout } from "@/lib/typeset/compose";
import { gen429 } from "@/lib/dream/engine";
import { painterFor } from "./painters";

/* THE HYBRID ENGINE for the wizard (branch POPIKA_Back_To_Vector, round
   84, 2026-09-19). What /eval proved in rounds 79–83, as ONE call:

     the painter paints the ARTWORK ONLY, into a reserved zone
       · traditional: on a paper tone we choose, the type zone masked off
       · contemporary / punk: on a flat ground of the painter's own
         choosing, told the KIND of ground the style wants (way 1)
     the composer reads the ground off the picture and sets the TYPE by
     code — Google faces, grouped blocks, 120 % leading, measured fit —
     so the label comes back as live type (SVG) and a print PNG.

   No text is ever painted, so no proofreading, no strict redream. */

export interface HybridInput {
  vision: string;
  style: string;
  data: Record<string, string>;
  widthMm: number;
  heightMm: number;
  sketch?: string | null;
  seed?: number;
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

export async function paintHybridLabel(inp: HybridInput): Promise<HybridOutput & { tag: string; painter: string; artist?: string }> {
  const style = ["traditional", "contemporary", "punk"].includes(inp.style) ? inp.style : "traditional";
  const seed = inp.seed ?? (Math.random() * 0xffffffff) >>> 0;
  const widthMm = Math.min(300, Math.max(30, inp.widthMm || 110));
  const heightMm = Math.min(300, Math.max(30, inp.heightMm || 80));
  const brief = { id: "wizard", title: "wizard", vision: inp.vision, data: inp.data, width: widthMm, height: heightMm };
  /* round 90: the painter is the owner's choice per style (admin → Rules
     → Painters); canvas painters get a paper tone, the own-ground painter
     chooses its own */
  let model = evalModel(await painterFor(style)) || evalModel("gpt-image-own")!;
  /* round 96: a FREE painter (Ideogram, nano-banana without a canvas) gets
     the very ask the owner rated 5 in the bake-off, and the composer CROPS
     — the painting stays whole, the band sits over its foot */
  let free = model.via === "fal" && !model.canvas;
  let ap = await buildArtworkPrompt(brief, style, seed, { ownGround: model.id === "gpt-image-own", softGround: !!model.canvas, wholeFrame: free, artist: model.artist });
  let art: string;
  try {
    art = (await gen429(() => generateArtworkChecked(model, ap, { sketch: inp.sketch || null }))).art;
  } catch (e) {
    /* ROUND 100: a fal painter that cannot paint (balance locked, outage)
       must never leave the customer without a label — gpt-image steps in
       and the reason is logged for the owner */
    if (model.via !== "fal") throw e;
    console.error(`[painter] ${model.id} failed for ${style}: ${e instanceof Error ? e.message : e} — falling back to gpt-image-own`);
    model = evalModel("gpt-image-own")!; free = false;
    ap = await buildArtworkPrompt(brief, style, seed, { ownGround: true });
    art = (await gen429(() => generateArtworkChecked(model, ap, { sketch: inp.sketch || null }))).art;
  }
  /* no paper given (contemporary / punk): the ground is read off the picture */
  /* a finished free painting carries its foot ground (LAST_FOOT_GROUND) */
  const ground = free ? "" : (ap.paper || (await flatGroundOf(art)).colour);
  const out = await composeLabel({ artwork: art, style, texts: textsOf(inp.data), widthMm, heightMm, seed, paper: ground || undefined, wineColour: inp.data.wineColorName, fit: free ? "vignette" : "yield" });
  return { png: out.png, svg: out.svg, art, faces: out.faces, ink: out.ink, ground: out.layout.ground, prompt: ap.prompt, layout: out.layout, tag: layoutTag(style, seed), fit: free ? "vignette" : "yield", painter: model.id, artist: model.artist?.name };
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
  const fams = new Set(avoid.map((a) => a.split("|")[0])), buckets = new Set(avoid.map((a) => a.split("|")[1]));
  let seed = (Math.random() * 0xffffffff) >>> 0;
  for (let i = 0; i < 60; i++) {
    const [fam, b] = layoutTag(style, seed).split("|");
    const bigOk = !recipe.big || i >= 30 || Number(b) >= 3;
    if (!fams.has(fam) && (i >= 20 || !buckets.has(b)) && bigOk) break;
    seed = (Math.random() * 0xffffffff) >>> 0;
  }
  const art = `data:image/png;base64,${stored.art.toString("base64")}`;
  const align = recipe.flip ? (pickRoles(style, seed).align === "center" ? "left" : "center") : undefined;
  const out = await composeLabel({ artwork: art, style, texts: textsOf(data), widthMm, heightMm, seed, paper: stored.meta.fit === "crop" ? undefined : ground, wineColour: data.wineColorName, align, fit: stored.meta.fit || "yield" });
  return { png: out.png, svg: out.svg, art, faces: out.faces, ink: out.ink, ground, prompt: "(re-layout of an existing painting)", layout: out.layout, tag: layoutTag(style, seed), fit: stored.meta.fit || "yield" };
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
