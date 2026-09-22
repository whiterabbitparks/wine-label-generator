import { buildArtworkPrompt, evalModel, generateArtwork, artistModels } from "@/lib/eval/models";
import { composeLabel } from "@/lib/typeset/compose";
import { faceFile, pickRoles, mix } from "@/lib/typeset/fonts";
import type { Layout } from "@/lib/typeset/compose";
import { painterFor } from "./painters";

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
  const ap = await buildArtworkPrompt(brief, model.artist);
  const painted = await gen429(() => generateArtwork(model, ap, { sketch: inp.sketch || null }));
  const out = await composeLabel({ artwork: painted.art, style, texts: textsOf(inp.data), widthMm, heightMm, seed, wineColour: inp.data.wineColorName, fit: "vignette" });
  return { png: out.png, svg: out.svg, art: painted.art, faces: out.faces, ink: out.ink, ground: out.layout.ground, prompt: ap.prompt, layout: out.layout, tag: layoutTag(style, seed), fit: "vignette", painter: model.id, artist: model.artist.name, repainted: painted.repainted };
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
