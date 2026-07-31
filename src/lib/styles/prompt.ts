import type { StyleDef, SubStyle } from "./catalog";
import type { ArtDirectionConfig } from "@/lib/admin/config-store";
import type { GenerationJob } from "@/lib/image-provider/types";

/* Server-side prompt assembly. This is the port of buildPrompt() from
   8k-labels-package/src/image-gen.js — moved here so the art direction is a
   real guardrail (the client can no longer send arbitrary prompts) and so
   each style/sub-style gets its own recipe.

   FINAL PROMPT = sub-style recipe (medium/composition/mood)
                + winemaker's story (subject; wine facts as fallback)
                + wine context (colour, region, grape)
                + focus-area guidance (style's clear-zone contract)
                + house rules (admin's global art direction)                 */

/** The raw client payload — everything the winemaker actually provides. */
export interface LabelBrief {
  vision?: string;
  /** uploaded sketch/photo as a data URL */
  reference?: string | null;
  /** wine facts from the label form (producer, grape, region, ...) */
  data?: Record<string, string>;
  seed?: number;
}

const TEMPLATE_DEFAULT =
  "{medium}. Subject: {subject}. {context}{composition}. Mood: {mood}.{focus}{reference}{rules}";

function subjectFrom(vision: string, d: Record<string, string>): string {
  const v = (vision || "").trim();
  if (v) return v;
  // no story? build one from the wine facts the winemaker DID fill in
  const loc = [d.region, d.country].filter(Boolean).join(", ");
  if (loc) return `a vineyard landscape in ${loc}${d.grape ? ` with ${d.grape} vines` : ""}`;
  if (d.grape) return `${d.grape} vines on the vine`;
  return "a classic vineyard landscape at golden hour";
}

export function buildStylePrompt(
  style: StyleDef,
  sub: SubStyle,
  brief: LabelBrief,
  art: ArtDirectionConfig
): string {
  const d = brief.data || {};
  const subject = subjectFrom(brief.vision || "", d);

  const ctx: string[] = [];
  if (d.wineColorName) ctx.push(`${String(d.wineColorName).toLowerCase()} wine`);
  const loc = [d.region, d.country].filter(Boolean).join(", ");
  if (loc) ctx.push(`from ${loc}`);
  if (d.grape) ctx.push(`grape: ${d.grape}`);
  const context = ctx.length ? `Context: ${ctx.join("; ")}. ` : "";

  const focus = style.focus?.guidance ? ` ${style.focus.guidance}` : "";
  const reference = brief.reference
    ? " Match the composition of the uploaded reference sketch."
    : "";
  const rules = art.extra?.trim() ? ` House rules: ${art.extra.trim()}.` : "";

  // admin's template still applies if customised; {focus} is new and optional
  const template = art.template?.includes("{medium}") ? withFocusSlot(art.template) : TEMPLATE_DEFAULT;
  return template
    .replace("{medium}", sub.medium)
    .replace("{subject}", subject)
    .replace("{context}", context)
    .replace("{composition}", sub.composition)
    .replace("{mood}", sub.mood)
    .replace("{focus}", focus)
    .replace("{reference}", reference)
    .replace("{rules}", rules)
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
  art: ArtDirectionConfig
): GenerationJob {
  return {
    prompt: buildStylePrompt(style, sub, brief, art),
    negative: art.negative,
    reference: brief.reference || null,
    size: { w: 1024, h: 640 },
    art: { preset: `${style.key}/${sub.key}`, extra: art.extra, negative: art.negative, template: art.template },
    data: brief.data,
    vision: brief.vision,
  };
}
