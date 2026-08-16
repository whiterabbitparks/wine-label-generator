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
function zoneSentence(z: ZoneSpec, aspect?: string): string {
  const [x0, y0, x1, y1] = z.focal;
  const cy = (y0 + y1) / 2, w = x1 - x0, h = y1 - y0, area = w * h;
  const vert = cy < 0.38 ? "upper" : cy > 0.62 ? "lower" : "central";
  const horiz = x1 <= 0.5 ? " left" : x0 >= 0.5 ? " right" : "";
  const size = area > 0.45 ? "large" : area < 0.1 ? "small, emblem-like" : "medium-sized";
  const shapeWord =
    z.shape === "band" ? "wide horizontal band" : z.shape === "rounded" ? "soft panel" : "oval area";
  const frame =
    aspect === "portrait" ? " The frame is tall." : aspect === "landscape" ? " The frame is wide." : "";
  return (
    ` Compose the main subject as a ${size} ${shapeWord} in the ${vert}${horiz} part of the frame;` +
    ` every important element stays fully inside that area.` +
    ` Outside it, only quiet, expendable surroundings may continue, growing sparser until the scene` +
    ` dissolves completely into the pure white background well before the edges.${frame}`
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

function subjectFrom(vision: string, d: Record<string, string>): string {
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
  const subject = subjectFrom(brief.vision || "", d);

  const ctx: string[] = [];
  if (d.wineColorName) ctx.push(`${String(d.wineColorName).toLowerCase()} wine`);
  const loc = [d.region, d.country].filter(Boolean).join(", ");
  if (loc) ctx.push(`from ${loc}`);
  if (d.grape) ctx.push(`grape: ${d.grape}`);
  const context = ctx.length ? `Context: ${ctx.join("; ")}. ` : "";

  const zone = brief.zones?.[style.key];
  const focus = zone
    ? zoneSentence(zone, brief.aspect)
    : style.focus?.guidance
      ? ` ${style.focus.guidance}`
      : "";
  const reference = brief.reference
    ? " Match the composition of the uploaded reference sketch."
    : "";
  // derived art directions carry an ink/colour treatment (owner rule
  // 2026-08-13: reference boards inform the LANGUAGE via this text, never as
  // image inputs — image inputs made the model copy shapes and subjects)
  const paletteText = (sub as { palette?: string }).palette?.trim();
  const inkTreatment = paletteText ? ` Ink and colour treatment: ${paletteText}.` : "";
  // rules = global house rules + this style's own rules + owner-approved traits
  const ruleParts = [art.extra?.trim(), art.perStyle?.[style.key]?.rules?.trim()].filter(Boolean);
  if (fb?.favour?.length) ruleParts.push(`favour: ${fb.favour.join("; ")}`);
  const rules = ruleParts.length ? ` House rules: ${ruleParts.join(". ")}.` : "";

  // THIS art direction's own rich language LEADS the prompt (owner
  // 2026-08-14: one shared charter made every generation of a style converge
  // on a single look — each direction must speak for itself, so consecutive
  // generations look like different artists from the same board). The charter
  // is only the fallback for pre-language profiles.
  const language = (sub as { language?: string }).language?.trim() || charter?.trim();
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
  const corr = fb?.fixes?.length
    ? `Corrections from earlier attempts with this exact style (a previous result was rejected — apply these and take a different approach): ${fb.fixes.join("; ")}. `
    : "";
  const strengths = fb?.keeps?.length ? ` Confirmed strengths to preserve: ${fb.keeps.join("; ")}.` : "";
  // admin's template still applies if customised; {focus} is new and optional
  const template = art.template?.includes("{medium}") ? withFocusSlot(art.template) : TEMPLATE_DEFAULT;
  return lead + musts + corr + template
    .replace("{medium}", sub.medium)
    .replace("{subject}", subject)
    .replace("{context}", context)
    .replace("{composition}", sub.composition)
    .replace("{mood}", sub.mood)
    .replace("{focus}", focus)
    .replace("{reference}", reference)
    .replace("{rules}", rules)
    .concat(strengths)
    .concat(inkTreatment)
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
