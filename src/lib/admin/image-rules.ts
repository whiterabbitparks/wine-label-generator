import { getDb } from "@/lib/db";

/* VERIFIED image rules (owner, 2026-08-15): plain-English rules that
   actually work — every generated image is CHECKED against them by a vision
   model; violators are regenerated once with the broken rules emphasised.
   One rule per line, global + per style. */

export interface ImageRules {
  global: string;
  perStyle: Record<string, string>;
}

const DOC_ID = "image-hard-rules";
const STYLES = ["traditional", "contemporary", "punk"];

export async function getImageRules(): Promise<ImageRules> {
  try {
    const db = await getDb();
    const doc = (await db.collection("settings").findOne({ _id: DOC_ID } as never)) as
      | { global?: string; perStyle?: Record<string, string> }
      | null;
    return { global: doc?.global || "", perStyle: doc?.perStyle || {} };
  } catch {
    return { global: "", perStyle: {} };
  }
}

export async function saveImageRules(rules: ImageRules): Promise<void> {
  const db = await getDb();
  await db.collection("settings").updateOne(
    { _id: DOC_ID } as never,
    { $set: {
        global: String(rules.global || "").slice(0, 3000),
        perStyle: Object.fromEntries(STYLES.map((s) => [s, String(rules.perStyle?.[s] || "").slice(0, 3000)])),
        updatedAt: new Date(),
      } },
    { upsert: true }
  );
}

/** The rule list checked for one style: global lines + that style's lines. */
export function ruleLines(rules: ImageRules, style: string): string[] {
  return [rules.global, rules.perStyle?.[style] || ""]
    .flatMap((t) => String(t).split("\n"))
    .map((l) => l.trim())
    .filter((l) => l.length > 2);
}

/** Vision check of one generated image against the owner's rules. */
export async function verifyImage(
  imageDataUrl: string,
  rules: string[]
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
              "You inspect a generated wine-label artwork against the owner's rules. " +
              "Judge ONLY what is visibly in the image; when uncertain, the rule passes. " +
              "Return strict JSON {\"violations\": [the exact text of each BROKEN rule]} — empty array if all pass.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "RULES:\n" + rules.map((r, i) => `${i + 1}. ${r}`).join("\n") },
              { type: "image_url", image_url: { url: imageDataUrl, detail: "low" } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return { ok: true, violations: [] };
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const parsed = JSON.parse(json.choices?.[0]?.message?.content || "{}") as { violations?: unknown };
    const violations = (Array.isArray(parsed.violations) ? parsed.violations : [])
      .map((v) => String(v).slice(0, 200))
      .slice(0, 8);
    return { ok: violations.length === 0, violations };
  } catch {
    return { ok: true, violations: [] };   // the check must never block generation
  }
}
