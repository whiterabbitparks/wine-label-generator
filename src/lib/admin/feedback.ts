import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";

/* Owner feedback on generated artwork (the refinement loop, owner request
   2026-08-13). Each verdict is one document in `styleFeedback`. Generation
   consumes the AGGREGATES:
   - approvals/rejections per art direction reweight how often that art
     direction is picked for its style;
   - rejection comments become per-style avoid-lines in the negative prompt;
   - approval comments become per-style favour-lines in the prompt. */

export interface FeedbackDoc {
  id: string;
  style: string;
  variantKey: string;
  variantLabel: string;
  verdict: "up" | "down" | "retire";
  comment: string;
  /** what worked — honored regardless of verdict */
  keep?: string;
  /** what to correct next time — honored regardless of verdict */
  fix?: string;
  imageUrl: string | null;
  prompt: string;
  story: string;
  createdAt: Date;
}

export interface StyleFeedbackAggregate {
  /** variantKey -> weight. Approvals boost (+1). A rejection means 'this
      ATTEMPT failed' (owner 2026-08-15) — tiny decay (-0.15, floor 0.7),
      the reference itself never retires from rejections. Only the explicit
      'retire' verdict drops a card to 0.05. */
  weights: Record<string, number>;
  /** distinct recent fix-notes (any verdict) — global avoid lines */
  avoid: string[];
  /** distinct recent keep-notes (any verdict) — global favour lines */
  favour: string[];
  /** per-card memory: corrections and confirmed strengths for that exact card */
  cardNotes: Record<string, { keeps: string[]; fixes: string[] }>;
  latest: Date | null;
}

export async function listFeedback(style?: string, limit = 60): Promise<FeedbackDoc[]> {
  const db = await getDb();
  return db
    .collection<FeedbackDoc>("styleFeedback")
    .find(style ? { style } : {}, { projection: { _id: 0 } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

export async function addFeedback(input: {
  style: string;
  variantKey: string;
  variantLabel: string;
  verdict: "up" | "down" | "retire";
  comment?: string;
  keep?: string;
  fix?: string;
  imageUrl?: string | null;
  prompt?: string;
  story?: string;
}): Promise<FeedbackDoc> {
  const doc: FeedbackDoc = {
    id: randomUUID().slice(0, 12),
    style: String(input.style).slice(0, 40),
    variantKey: String(input.variantKey).slice(0, 60),
    variantLabel: String(input.variantLabel).slice(0, 120),
    verdict: input.verdict === "down" ? "down" : input.verdict === "retire" ? "retire" : "up",
    comment: String(input.comment || "").slice(0, 500),
    keep: String(input.keep || "").slice(0, 300),
    fix: String(input.fix || "").slice(0, 300),
    imageUrl: input.imageUrl ? String(input.imageUrl).slice(0, 500) : null,
    prompt: String(input.prompt || "").slice(0, 3000),
    story: String(input.story || "").slice(0, 500),
    createdAt: new Date(),
  };
  const db = await getDb();
  await db.collection("styleFeedback").insertOne({ ...doc });
  return doc;
}

export async function deleteFeedback(id: string): Promise<boolean> {
  const db = await getDb();
  const r = await db.collection("styleFeedback").deleteOne({ id });
  return r.deletedCount > 0;
}

export async function feedbackAggregates(): Promise<Record<string, StyleFeedbackAggregate>> {
  const db = await getDb();
  const rows = await db
    .collection<FeedbackDoc>("styleFeedback")
    .find({}, { projection: { _id: 0, style: 1, variantKey: 1, verdict: 1, comment: 1, keep: 1, fix: 1, createdAt: 1 } })
    .sort({ createdAt: -1 })
    .limit(500)
    .toArray();
  const out: Record<string, StyleFeedbackAggregate> = {};
  const retired: Record<string, Set<string>> = {};
  for (const r of rows) {
    const agg = (out[r.style] ||= { weights: {}, avoid: [], favour: [], cardNotes: {}, latest: null });
    if (!agg.latest) agg.latest = r.createdAt; // rows arrive newest-first
    if (r.verdict === "retire") {
      (retired[r.style] ||= new Set()).add(r.variantKey);
    } else {
      // approvals boost; a rejection means the ATTEMPT failed — the reference
      // card only decays slightly (floor 0.7) and never retires by itself
      agg.weights[r.variantKey] = (agg.weights[r.variantKey] ?? 1) + (r.verdict === "up" ? 1 : -0.15);
    }
    // keep/fix notes are honored regardless of the verdict (a rejected image
    // can still have a praised element; an approved one can carry a correction).
    // Legacy rows with only `comment` fall back to the old verdict-based split.
    const keep = (r.keep || (r.verdict === "up" ? r.comment : "")).trim();
    const fix = (r.fix || (r.verdict === "down" ? r.comment : "")).trim();
    const notes = (agg.cardNotes[r.variantKey] ||= { keeps: [], fixes: [] });
    if (keep) {
      if (agg.favour.length < 4 && !agg.favour.includes(keep)) agg.favour.push(keep);
      if (notes.keeps.length < 2 && !notes.keeps.includes(keep)) notes.keeps.push(keep);
    }
    if (fix) {
      if (agg.avoid.length < 6 && !agg.avoid.includes(fix)) agg.avoid.push(fix);
      if (notes.fixes.length < 3 && !notes.fixes.includes(fix)) notes.fixes.push(fix);
    }
  }
  for (const [style, agg] of Object.entries(out)) {
    for (const k of Object.keys(agg.weights)) agg.weights[k] = Math.max(0.7, agg.weights[k]);
    for (const k of retired[style] || []) agg.weights[k] = 0.05;   // explicit retire only
  }
  return out;
}

/** Deterministic weighted pick — the ONE selection rule for art directions.
    Rejected directions genuinely fade (two rejections ≈ retired at the 0.05
    floor) instead of keeping a full slot like the old duplication pool. */
export function weightedPick<T extends { key: string }>(
  items: T[],
  weights: Record<string, number> | undefined,
  hash: number
): T {
  const w = items.map((v) => Math.max(0.05, weights?.[v.key] ?? 1));
  const sum = w.reduce((a, b) => a + b, 0);
  let t = (Math.imul(hash ^ 0x9e3779b9, 2654435761) >>> 0) / 4294967296;
  t *= sum;
  for (let i = 0; i < items.length; i++) {
    t -= w[i];
    if (t <= 0) return items[i];
  }
  return items[items.length - 1];
}
