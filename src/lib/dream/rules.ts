import { getDb } from "@/lib/db";
import { getImageRules, mentionsEra, mentionsQvevri, qvevriOverridden } from "@/lib/admin/image-rules";

/* DREAM RULES (owner GO 2026-08-25): the image pipeline never had the
   frames/ornament problem because every image was VERIFIED against rules.
   Dreams get the same treatment — but only the rules that make sense for
   a COMPLETE LABEL (no-text and white-ground would kill the dream and are
   deliberately absent). The customer's story outranks any rule; the owner
   can add plain-English lines in the Rules tab (settings doc dream-rules). */

export interface DreamRule {
  /** positive prompt clause */
  clause: string;
  /** vision-check question — answered on the generated dream */
  check: string;
  /** skip when the story asks for it */
  skipIf?: (vision: string) => boolean;
}

const wantsFrame = (v: string) => /\b(frame|framed|border|bordered|cartouche)\b/i.test(v);

export const DREAM_BUILTINS: DreamRule[] = [
  {
    clause:
      "No frame or border of any kind: the design runs edge to edge and is never enclosed by rules, lines, cartouches or ornamental frames.",
    check:
      "Is the design enclosed by a frame, border, rule line or cartouche around its edge? Edge-to-edge designs pass.",
    skipIf: wantsFrame,
  },
  {
    clause:
      "Only the given texts appear — never invent medals, award seals, crests, monograms, established dates, taglines, slogans or any additional wording.",
    check:
      "Does the label contain invented extras: medals, award seals, crests, monograms, 'EST.' dates, taglines or text beyond a name, producer, appellation, grape, vintage, origin and one small legal line?",
  },
  {
    clause:
      "Typography is clean, real typesetting in standard typefaces: no ligature-heavy or decorative display lettering, no hand-drawn novelty letterforms.",
    check:
      "Is any major text set in heavily decorative, ligature-laden or novelty display lettering rather than clean standard typefaces? Elegant serif, sans or simple script faces pass.",
  },
  {
    clause:
      "No ornaments around the texts: no flourishes, swashes, scrollwork, divider vignettes or decorative devices framing or decorating the text blocks.",
    check:
      "Are text blocks decorated or framed by ornaments — flourishes, swashes, scrollwork, dividers or vignette devices around the words?",
  },
  {
    clause:
      "The image is the flat printed label itself, straight-on: never a bottle, mockup, 3D perspective or cast shadow.",
    check: "Is the image a bottle photo, mockup, 3D render or perspective view instead of a flat straight-on label design?",
  },
  {
    clause:
      "Handmade print quality: real printmaking character, never glossy airbrushed digital rendering.",
    check: "Does the artwork look like glossy, airbrushed, smooth digital AI rendering rather than a handmade print technique?",
  },
  {
    clause:
      "Every figure, person and animal in the illustration is anatomically coherent — one head each, the right number of limbs, no fused or merged bodies, no accidental human-animal hybrids.",
    check:
      "Does any person, animal or creature show duplicated or fused anatomy — two heads, extra or missing limbs, bodies merged together, or an unrequested human-animal hybrid? Stylised simplification is fine; answer yes only for genuine glitches.",
  },
  {
    clause:
      "Unless the story names a time, culture or ethnicity, people and settings read modern-but-neutral or timeless: no period or folk costume, no era-specific props.",
    check:
      "Does a person wear clearly historical, period, folk or national costume, or does the setting unmistakably evoke a specific historical era not requested? If no people appear, answer no.",
    skipIf: mentionsEra,
  },
  {
    clause:
      "Any qvevri is a plain smooth clay vessel — no ornaments, no handles; if buried, only its round mouth shows flush with the ground.",
    check:
      "If a qvevri or large clay wine vessel appears: does it have handles, ornaments or carvings, or is it half-buried with the body protruding? If none appears, answer no.",
    skipIf: (v) => !mentionsQvevri(v) || qvevriOverridden(v),
  },
];

/** owner's plain-English additions — one rule per line */
export async function getOwnerDreamRules(): Promise<string[]> {
  try {
    const db = await getDb();
    const doc = (await db.collection("settings").findOne({ _id: "dream-rules" } as never)) as { global?: string } | null;
    return String(doc?.global || "")
      .split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 30);
  } catch {
    return [];
  }
}

export async function assembleDreamRules(vision: string, style?: string): Promise<{ clauses: string; checks: { src: string; check: string }[] }> {
  const active = DREAM_BUILTINS.filter((r) => !r.skipIf?.(vision));
  let owner = await getOwnerDreamRules();
  /* branch POPIKA_No_Vector (owner 2026-09-03): the owner's IMAGE rules
     apply to dreams directly — the dream's illustration IS the final art.
     Lines that only made sense for standalone artwork (text bans, white
     backgrounds) are filtered: a dream is a complete label. */
  try {
    const ir = await getImageRules();
    const lines = [ir.global, style ? ir.perStyle?.[style] : ""].filter(Boolean).join("\n")
      .split("\n").map((l) => l.trim()).filter(Boolean)
      .filter((l) => !/\btexts?\b|\bletters?\b|\bwords?\b|white background|\bbackground\b.*\bwhite\b/i.test(l))
      .slice(0, 30);
    owner = [...new Set([...owner, ...lines])];
  } catch {}
  const clauses =
    " Design laws: " + active.map((r) => r.clause).join(" ") +
    (owner.length ? " House rules: " + owner.map((l) => `${l}.`).join(" ") : "");
  const checks = [
    ...active.map((r) => ({ src: "dream built-in", check: r.check })),
    ...owner.map((l) => ({ src: "owner dream rule", check: `Does the design violate this rule: "${l}"?` })),
  ];
  return { clauses, checks };
}
