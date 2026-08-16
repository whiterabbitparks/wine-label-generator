import { getDb } from "@/lib/db";

/* VERIFIED image rules (owner, 2026-08-15): plain-English rules that
   actually work. On SAVE each rule is COMPILED once by a text model into
   three forms: a positive prompt clause (image models paint toward
   positives, not away from negatives), avoid-keywords for the negative
   list, and a precise check question with disambiguation (so e.g.
   engraving hatching is not mistaken for "ornament"). Every generated
   image is checked; violators regenerate with the broken rules prepended. */

export interface CompiledRule {
  /** the owner's original line — shown in violations */
  src: string;
  /** positive phrasing injected into every prompt */
  positive: string;
  /** comma-separable avoid keywords for the negative list */
  negative: string;
  /** precise yes/no violation question for the verifier */
  check: string;
}

export interface ImageRules {
  global: string;
  perStyle: Record<string, string>;
  compiledGlobal?: CompiledRule[];
  compiledPerStyle?: Record<string, CompiledRule[]>;
}

const DOC_ID = "image-hard-rules";
const STYLES = ["traditional", "contemporary", "punk"];

export async function getImageRules(): Promise<ImageRules> {
  try {
    const db = await getDb();
    const doc = (await db.collection("settings").findOne({ _id: DOC_ID } as never)) as ImageRules | null;
    return {
      global: doc?.global || "",
      perStyle: doc?.perStyle || {},
      compiledGlobal: doc?.compiledGlobal || [],
      compiledPerStyle: doc?.compiledPerStyle || {},
    };
  } catch {
    return { global: "", perStyle: {} };
  }
}

function rawLines(text: string): string[] {
  return String(text || "").split("\n").map((l) => l.trim()).filter((l) => l.length > 2);
}

/** Compile plain-English rules into prompt/negative/check forms (one call). */
async function compileRules(lines: string[]): Promise<CompiledRule[]> {
  const fallback = lines.map((src) => ({ src, positive: src, negative: "", check: `Does the image break this rule: "${src}"?` }));
  if (!lines.length) return [];
  const key = process.env.OPENAI_API_KEY;
  if (!key) return fallback;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You compile an art director's plain-English image rules for a generation pipeline. " +
              "For EACH rule return three forms: " +
              "positive — rephrase as what SHOULD be painted (image models follow positives; " +
              'e.g. "no ornaments on qvevri" → "any qvevri is a plain, smooth, undecorated clay vessel with a simple silhouette and no handles"); ' +
              "negative — 3-6 comma-separated avoid-keywords; " +
              "check — one precise yes-means-VIOLATED question for a vision inspector, with " +
              "disambiguation so legitimate technique is not misread (e.g. engraving hatching or " +
              "shading lines on a surface are NOT ornament; only deliberate decorative patterns, " +
              "carvings, reliefs or attached parts count). " +
              'Return strict JSON {"rules":[{"src","positive","negative","check"}]} in the same order.',
          },
          { role: "user", content: lines.map((l, i) => `${i + 1}. ${l}`).join("\n") },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const parsed = JSON.parse(json.choices?.[0]?.message?.content || "{}") as { rules?: Partial<CompiledRule>[] };
    const rules = Array.isArray(parsed.rules) ? parsed.rules : [];
    if (rules.length !== lines.length) return fallback;
    return rules.map((r, i) => ({
      src: lines[i],
      positive: String(r.positive || lines[i]).slice(0, 400),
      negative: String(r.negative || "").slice(0, 200),
      check: String(r.check || `Does the image break this rule: "${lines[i]}"?`).slice(0, 400),
    }));
  } catch {
    return fallback;
  }
}

export async function saveImageRules(rules: Pick<ImageRules, "global" | "perStyle">): Promise<void> {
  const global = String(rules.global || "").slice(0, 3000);
  const perStyle = Object.fromEntries(STYLES.map((s) => [s, String(rules.perStyle?.[s] || "").slice(0, 3000)]));
  const compiledGlobal = await compileRules(rawLines(global));
  const compiledPerStyle: Record<string, CompiledRule[]> = {};
  for (const s of STYLES) compiledPerStyle[s] = await compileRules(rawLines(perStyle[s]));
  const db = await getDb();
  await db.collection("settings").updateOne(
    { _id: DOC_ID } as never,
    { $set: { global, perStyle, compiledGlobal, compiledPerStyle, updatedAt: new Date() } },
    { upsert: true }
  );
}

/** Compiled rule list applying to one style: global + that style's rules. */
export function ruleLines(rules: ImageRules, style: string): CompiledRule[] {
  const g = rules.compiledGlobal?.length ? rules.compiledGlobal : rawLines(rules.global).map((src) => ({ src, positive: src, negative: "", check: `Does the image break this rule: "${src}"?` }));
  const p = rules.compiledPerStyle?.[style]?.length
    ? rules.compiledPerStyle[style]
    : rawLines(rules.perStyle?.[style] || "").map((src) => ({ src, positive: src, negative: "", check: `Does the image break this rule: "${src}"?` }));
  return [...g, ...p];
}

/** Vision check against the compiled rules; violations carry the reason. */
export async function verifyImage(
  imageDataUrl: string,
  rules: CompiledRule[]
): Promise<{ ok: boolean; violations: string[] }> {
  if (!rules.length) return { ok: true, violations: [] };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: true, violations: [] };
  const model = process.env.OPENAI_VERIFY_MODEL || "gpt-4o-mini";
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You inspect a generated wine-label artwork. For each numbered question, " +
              "answer whether the VIOLATION it describes is clearly visible in the image. " +
              "When uncertain, answer no (the rule passes). " +
              'Return strict JSON {"violations":[{"n": question number, "reason": one short sentence naming what you see}]} — empty array if none.',
          },
          {
            role: "user",
            content: [
              { type: "text", text: rules.map((r, i) => `${i + 1}. ${r.check}`).join("\n") },
              { type: "image_url", image_url: { url: imageDataUrl, detail: "low" } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return { ok: true, violations: [] };
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const parsed = JSON.parse(json.choices?.[0]?.message?.content || "{}") as { violations?: { n?: number; reason?: string }[] };
    const violations = (Array.isArray(parsed.violations) ? parsed.violations : [])
      .map((v) => {
        const r = rules[(Number(v?.n) || 0) - 1];
        return r ? `${r.src}${v?.reason ? ` — ${String(v.reason).slice(0, 140)}` : ""}` : null;
      })
      .filter(Boolean)
      .slice(0, 8) as string[];
    return { ok: violations.length === 0, violations };
  } catch {
    return { ok: true, violations: [] };   // the check must never block generation
  }
}

/* Built-in hard rule (owner, 2026-08-15): artwork never contains text,
   glyphs or numbers — UNLESS the winemaker's story explicitly asks for
   lettering. Joins the same compiled pipeline (prompt clause, avoid-list,
   verified check with retry) but lives in code, not the editable doc. */
export const NO_TEXT_RULE: CompiledRule = {
  src: "never generate texts, glyphs or numbers (built-in)",
  positive:
    "The artwork is pure imagery with no text of any kind — no letters, words, numerals, glyphs, monograms, inscriptions, signatures or typographic marks.",
  negative: "text, letters, words, numbers, typography, inscription, signature, watermark, gibberish lettering",
  check:
    "Does the image contain any readable or pseudo-readable text, letters, numerals, glyphs or typographic marks (including AI gibberish lettering)? Purely decorative non-alphabetic patterns do not count.",
};

/** Does the winemaker's story explicitly ask for lettering? */
export function wantsText(vision: string | undefined): boolean {
  return /\b(text|letter|lettering|word|writing|written|inscription|sign\s+say|says|saying|glyph|number|digit|numeral|typograph|caption|monogram|slogan|motto)\b/i.test(
    String(vision || "")
  );
}

/* Subject focus (owner, 2026-08-15): "gorilla in chokha" must yield ONE
   gorilla in a chokha — not a crowd with a gorilla in it. Unless the story
   itself asks for multiple figures, a dynamic rule pins the generation (and
   the verified check) to exactly the stated subject. */
export function wantsCrowd(vision: string | undefined): boolean {
  return /\b(people|crowd|villagers|family|families|friends|dancers|dancing|feast|supra|banquet|group|couple|guests|harvesters|workers|men|women|children|figures|musicians|procession|celebration|everyone|together)\b/i.test(
    String(vision || "")
  );
}
export function subjectFocusRule(subject: string): CompiledRule {
  const s = subject.slice(0, 160);
  return {
    src: "stay focused on the subject (built-in)",
    positive: `Depict EXACTLY this and nothing else animate: ${s}. One single subject, dominant in the frame; no additional people, human figures, animals or characters of any kind.`,
    negative: "extra people, background figures, crowd, bystanders, additional characters, additional animals",
    check: `The intended subject is: "${s}". Does the image contain any people, human figures, animals or characters that are NOT part of that subject (e.g. bystanders, a crowd, extra animals)?`,
  };
}
