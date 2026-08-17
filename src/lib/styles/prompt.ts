import type { StyleDef, SubStyle } from "./catalog";
import type { ArtDirectionConfig } from "@/lib/admin/config-store";
import type { GenerationJob } from "@/lib/image-provider/types";

/* Server-side prompt assembly. This is the port of buildPrompt() from
   8k-labels-package/src/image-gen.js — moved here so the art direction is a
   real guardrail (the client can no longer send arbitrary prompts) and so
   each style/sub-style gets its own recipe.

   FINAL PROMPT = style charter (the reference board's visual DNA — LEADS the
                  prompt; image models weight early tokens most, owner rule
                  2026-08-13: resemble the references' style, never their subjects)
                + sub-style recipe (medium/composition/mood)
                + winemaker's story (subject; wine facts as fallback)
                + wine context (colour, region, grape)
                + focus-area guidance (style's clear-zone contract)
                + house rules (admin's global art direction)                 */

/** The raw client payload — everything the winemaker actually provides. */
export interface ZoneSpec {
  /** fractions [x0,y0,x1,y1]: where the SUBJECT must live */
  focal: number[];
  /** where neutral, expendable content may spread */
  fade: number[];
  shape: string;
}
export interface LabelBrief {
  vision?: string;
  /** uploaded sketch/photo as a data URL */
  reference?: string | null;
  /** wine facts from the label form (producer, grape, region, ...) */
  data?: Record<string, string>;
  seed?: number;
  /** per-style layout zones chosen BEFORE generation (layout-first flow) */
  zones?: Record<string, ZoneSpec | null> | null;
  /** label aspect bucket: landscape | portrait | square */
  aspect?: string;
}

/* Turn a zone spec into compositional language: the model paints the subject
   inside the focal area and lets only expendable surroundings spread outward,
   dissolving into pure white — the renderer applies no masks. */
/* Composition shapes rotate. Owner 2026-08-16 (supersedes 'not all ovals'):
   NO enclosing geometry of any kind — no oval cameos, circular medallions,
   rectangular plates or arched niches; those read as frames on the label.
   Variety now comes from the ARRANGEMENT of the open composition; every
   voice dissolves freely into the white. */
const COMP_SHAPES = [
  "free-form composition whose edges dissolve irregularly into the white",
  "open composition — the subject's own silhouette defines the form",
  "wide panoramic sweep that fades out at both ends",
  "tall column-like arrangement dissolving at top and bottom",
  "diagonal sweep across the picture, trailing off into the white",
  "loose constellation of elements with generous white space between them",
  "single centred mass with fine details trailing outward into the white",
  "asymmetric arrangement with one dominant mass and a few quiet inanimate accents",
];
export function pickCompShape(styleKey: string, subKey: string, vision: string, seed: number): string {
  const h = [...(styleKey + subKey + vision)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, (seed || 0) + 7);
  return COMP_SHAPES[h % COMP_SHAPES.length];
}

function zoneSentence(z: ZoneSpec, aspect: string | undefined, compShape: string): string {
  const [x0, y0, x1, y1] = z.focal;
  const cy = (y0 + y1) / 2, w = x1 - x0, h = y1 - y0, area = w * h;
  const vert = cy < 0.38 ? "upper" : cy > 0.62 ? "lower" : "central";
  const horiz = x1 <= 0.5 ? " left" : x0 >= 0.5 ? " right" : "";
  const size = area > 0.45 ? "large" : area < 0.1 ? "small, emblem-like" : "medium-sized";
  const frame =
    aspect === "portrait" ? " The frame is tall." : aspect === "landscape" ? " The frame is wide." : "";
  return (
    ` Compose the main subject as a ${size} ${compShape} in the ${vert}${horiz} part of the frame;` +
    ` every important element stays fully inside that area.` +
    ` Outside it, only quiet, expendable surroundings may continue, growing sparser until the scene` +
    ` dissolves completely into the pure white background well before the edges.` +
    ` The composition is NEVER enclosed: no frame, border, outline, oval, medallion, cartouche or` +
    ` solid geometric shape around it — its edges stay open and dissolve into the white.${frame}`
  );
}

const TEMPLATE_DEFAULT =
  "{medium}. Subject: {subject}. {context}{composition}. Mood: {mood}.{focus}{reference}{rules}";

/* Non-negotiable house rule (owner decision 2026-07-31): artwork is ALWAYS
   isolated on a clean solid pure-white background. With the multiply blend the
   white vanishes on the label, so the illustration sits directly on the label
   stock. Appended to every prompt server-side — deliberately NOT part of the
   admin-editable template, so it cannot be accidentally removed. */
const WHITE_BG =
  " The artwork is isolated on a clean, solid, pure white background — no background colour, no paper texture, no gradients, no vignette, no cast shadows.";

/* Anti-generic guard (owner GO, 2026-08-15): the image model's default
   aesthetic is polished digital illustration — exactly what the owner calls
   "stock/clipart AI images". Every prompt demands analog process artifacts,
   and the negative list bans the default look. Hard-coded outside the
   admin-editable template, like WHITE_BG. */
const ANALOG =
  " This must look like a REAL artwork made with physical tools and printed by a real process — visible ink behaviour, plate/press artifacts, slight imperfections of the human hand. Never a digital illustration.";
export const ANTI_AI_NEGATIVE =
  "generic digital illustration, vector clipart, flat corporate illustration, smooth airbrush shading, 3D render, glossy highlights, plastic sheen, stock art composition, cartoon mascot, concept-art polish, perfect symmetry, default AI aesthetic";

export function subjectFrom(vision: string, d: Record<string, string>): string {
  const v = (vision || "").trim();
  if (v) return v;
  // no story? build one from the wine facts the winemaker DID fill in
  const loc = [d.region, d.country].filter(Boolean).join(", ");
  if (loc) return `a vineyard landscape in ${loc}${d.grape ? ` with ${d.grape} vines` : ""}`;
  if (d.grape) return `${d.grape} vines on the vine`;
  return "a classic vineyard landscape at golden hour";
}

/** Owner-feedback lines folded into one style's prompt (refinement loop). */
export interface FeedbackLines {
  avoid: string[];
  favour: string[];
  /** corrections learned from earlier attempts with THIS exact style card */
  fixes?: string[];
  /** confirmed strengths of THIS exact style card */
  keeps?: string[];
  /** how many interpretations of THIS card were rejected — even without a
      fix-note, the next attempt must diverge from the rejected ones */
  rejections?: number;
}

export function buildStylePrompt(
  style: StyleDef,
  sub: SubStyle,
  brief: LabelBrief,
  art: ArtDirectionConfig,
  fb?: FeedbackLines,
  charter?: string | null,
  checked?: string[]
): string {
  const d = brief.data || {};
  let subject = subjectFrom(brief.vision || "", d);
  // subject exclusivity (owner 2026-08-15): four words of subject must not
  // drown in two hundred words of technique — weld the focus to the subject
  const crowdish = /\b(people|crowd|villagers|family|families|friends|dancers|dancing|feast|supra|banquet|group|couple|guests|harvesters|workers|men|women|children|figures|musicians|procession|celebration|everyone|together)\b/i;
  if (!crowdish.test(brief.vision || ""))
    subject += " — the one and only subject, dominant in the frame, depicted alone with no additional people, figures or animals";

  const ctx: string[] = [];
  if (d.wineColorName) ctx.push(`${String(d.wineColorName).toLowerCase()} wine`);
  const loc = [d.region, d.country].filter(Boolean).join(", ");
  if (loc) ctx.push(`from ${loc}`);
  if (d.grape) ctx.push(`grape: ${d.grape}`);
  const context = ctx.length ? `Context: ${ctx.join("; ")}. ` : "";

  const zone = brief.zones?.[style.key];
  const compShape = pickCompShape(style.key, sub.key || "", brief.vision || "", brief.seed || 0);
  const focus = zone
    ? zoneSentence(zone, brief.aspect, compShape)
    : (style.focus?.guidance ? ` ${style.focus.guidance}` : "") +
      ` Compose the subject as a ${compShape}.`;
  const reference = brief.reference
    ? " Match the composition of the uploaded reference sketch."
    : "";
  // derived art directions carry an ink/colour treatment (owner rule
  // 2026-08-13: reference boards inform the LANGUAGE via this text, never as
  // image inputs — image inputs made the model copy shapes and subjects)
  const paletteText = (sub as { palette?: string }).palette?.trim();
  const inkTreatment = paletteText ? ` Ink and colour treatment: ${paletteText}.` : "";
  // COLOUR WORLD (owner 2026-08-17): artwork and layout draw from ONE
  // harmonious family per wine colour — the artwork gets the LOOSE reading
  // (as many colours as the scene wants; it is the hierarchy star), the
  // layout gets the strict gamut in the engine. Seeded per generation so
  // consecutive labels move within the family instead of repeating.
  const wineC = String(brief.data?.wineColorName || "");
  const kind = /red/i.test(wineC) ? "red" : /ros/i.test(wineC) ? "rose" : /orange|amber/i.test(wineC) ? "orange" : "white";
  const FAMILIES: Record<string, string[]> = {
    red: [
      "an analogous warm family around deep wine reds, oxblood, dusty rose and warm paper, one cool counterpoint allowed",
      "claret and terracotta against parchment, sparingly cut with slate",
      "dark cherry, faded crimson and rose over cream, charcoal drawing the line work",
    ],
    white: [
      "straw gold, olive and forest green over ivory, umber line work",
      "pale gold, sage and warm grey with one deep bottle-green note",
      "honey, tan and moss with dark sepia line work",
    ],
    rose: [
      "dusty pinks, coral and warm cream with charcoal line work",
      "faded rose, salmon and parchment cut with oxblood",
    ],
    orange: ["amber, burnt orange and earth browns over warm paper"],
  };
  const fam = FAMILIES[kind];
  const famPick = fam[Math.abs(((brief.seed || 0) | 0) + kind.length) % fam.length];
  const punkNote = style.key === "punk" ? " vivid, fearless colour is welcome here, full saturation allowed —" : "";
  const colourWorld =
    ` Colour world:${punkNote} use as many colours as the scene wants, chosen like a deliberate printmaker's ink set in harmony: ${famPick}. Colour decisions are intentional — never garish randomness, never dull.`;
  // rules = global house rules + this style's own rules + owner-approved traits
  const ruleParts = [art.extra?.trim(), art.perStyle?.[style.key]?.rules?.trim()].filter(Boolean);
  if (fb?.favour?.length) ruleParts.push(`favour: ${fb.favour.join("; ")}`);
  const rules = ruleParts.length ? ` House rules: ${ruleParts.join(". ")}.` : "";

  // ENCLOSURE SCRUB (owner audit 2026-08-17): the vision pass describes what
  // it SEES on the boards, so derived card fields can smuggle enclosing
  // shapes back in ("enclosed oval structure") and fight the no-enclosure
  // rule later in the same prompt. Neutralize enclosure vocabulary in every
  // derived text — existing cards get fixed without re-deriving.
  const deEnclose = (t: string | undefined): string =>
    String(t || "")
      .replace(/\bencl(?:osed|osing|osure)\b/gi, "open")
      .replace(/\boval\b/gi, "softly rounded")
      .replace(/\bmedallion\b/gi, "central motif")
      .replace(/\bcartouche\b/gi, "central motif")
      .replace(/\bcameo\b/gi, "central motif")
      .replace(/\bframed\b/gi, "open")
      .replace(/\bframes?\b/gi, "composition")
      .replace(/\bborders?\b/gi, "edges");

  // THIS art direction's own rich language LEADS the prompt (owner
  // 2026-08-14: one shared charter made every generation of a style converge
  // on a single look — each direction must speak for itself, so consecutive
  // generations look like different artists from the same board). The charter
  // is only the fallback for pre-language profiles.
  const language = deEnclose((sub as { language?: string }).language?.trim() || charter?.trim());
  const lead = language
    ? `Artistic language (follow it exactly): ${language} ` +
      "Render strictly in this artistic language, but invent an original composition — " +
      "never replicate any existing artwork. "
    : "";

  // verified rules ride at the FRONT of the prompt (image models weight early
  // tokens most) — the same lines a vision check enforces after generation
  const musts = checked?.length ? `Non-negotiable requirements: ${checked.join("; ")}. ` : "";
  // per-card memory (owner 2026-08-15): corrections ride EARLY in the prompt —
  // a rejection means the previous attempt failed, so the next one with this
  // same reference card must try differently
  const corrBits: string[] = [];
  if (fb?.fixes?.length) corrBits.push(`apply these corrections: ${fb.fixes.join("; ")}`);
  if (fb?.rejections)
    corrBits.push(
      `${fb.rejections} earlier interpretation${fb.rejections > 1 ? "s were" : " was"} rejected for this style — take a clearly DIFFERENT interpretation this time (different treatment of the subject, composition and density) while keeping the reference technique`
    );
  const corr = corrBits.length ? `About earlier attempts with this exact style: ${corrBits.join(". ")}. ` : "";
  const strengths = fb?.keeps?.length ? ` Confirmed strengths to preserve: ${fb.keeps.join("; ")}.` : "";
  // admin's template still applies if customised; {focus} is new and optional
  const template = art.template?.includes("{medium}") ? withFocusSlot(art.template) : TEMPLATE_DEFAULT;
  return lead + musts + corr + template
    .replace("{medium}", deEnclose(sub.medium))
    .replace("{subject}", subject)
    .replace("{context}", context)
    .replace("{composition}", deEnclose(sub.composition))
    .replace("{mood}", sub.mood)
    .replace("{focus}", focus)
    .replace("{reference}", reference)
    .replace("{rules}", rules)
    .concat(strengths)
    .concat(inkTreatment)
    .concat(colourWorld)
    .concat(ANALOG)
    .concat(WHITE_BG)
    .replace(/\s+/g, " ")
    .trim();
}

/** Older stored templates predate {focus} — inject it after {mood}. so
    focus-area guidance is never silently dropped. */
function withFocusSlot(template: string): string {
  if (template.includes("{focus}")) return template;
  return template.replace("Mood: {mood}.", "Mood: {mood}.{focus}");
}

/** Build the provider job for one style — same GenerationJob shape the
    providers already accept, so mock and openai need no changes. */
export function buildStyleJob(
  style: StyleDef,
  sub: SubStyle,
  brief: LabelBrief,
  art: ArtDirectionConfig,
  fb?: FeedbackLines,
  charter?: string | null,
  checked?: string[]
): GenerationJob {
  // negative = global avoid-list + this style's avoid-list + owner-rejected traits
  const negParts = [art.negative, art.perStyle?.[style.key]?.negative?.trim(), ANTI_AI_NEGATIVE].filter(Boolean);
  if (fb?.avoid?.length) negParts.push(fb.avoid.join(", "));
  return {
    prompt: buildStylePrompt(style, sub, brief, art, fb, charter, checked),
    negative: negParts.join(", "),
    reference: brief.reference || null,
    zone: brief.zones?.[style.key] ?? null,
    size: { w: 1024, h: 640 },
    art: { preset: `${style.key}/${sub.key}`, extra: art.extra, negative: art.negative, template: art.template },
    data: brief.data,
    vision: brief.vision,
  };
}
