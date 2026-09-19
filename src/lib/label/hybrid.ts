import { buildArtworkPrompt, evalModel, generateArtwork } from "@/lib/eval/models";
import { composeLabel } from "@/lib/typeset/compose";
import { flatGroundOf } from "@/lib/typeset/palette";
import { faceFile } from "@/lib/typeset/fonts";
import { gen429 } from "@/lib/dream/engine";

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

export async function paintHybridLabel(inp: HybridInput): Promise<HybridOutput> {
  const style = ["traditional", "contemporary", "punk"].includes(inp.style) ? inp.style : "traditional";
  const seed = inp.seed ?? (Math.random() * 0xffffffff) >>> 0;
  const widthMm = Math.min(300, Math.max(30, inp.widthMm || 110));
  const heightMm = Math.min(300, Math.max(30, inp.heightMm || 80));
  const brief = { id: "wizard", title: "wizard", vision: inp.vision, data: inp.data, width: widthMm, height: heightMm };
  const ap = await buildArtworkPrompt(brief, style, seed, { ownGround: true });
  const model = evalModel("gpt-image-own")!;
  const art = await gen429(() => generateArtwork(model, ap, { sketch: inp.sketch || null }));
  /* no paper given (contemporary / punk): the ground is read off the picture */
  const ground = ap.paper || (await flatGroundOf(art)).colour;
  const out = await composeLabel({ artwork: art, style, texts: textsOf(inp.data), widthMm, heightMm, seed, paper: ground });
  return { png: out.png, svg: out.svg, art, faces: out.faces, ink: out.ink, ground, prompt: ap.prompt };
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
