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
  verdict: "up" | "down";
  comment: string;
  imageUrl: string | null;
  prompt: string;
  story: string;
  createdAt: Date;
}

export interface StyleFeedbackAggregate {
  /** variantKey -> weight (1 baseline; approvals raise, rejections lower) */
  weights: Record<string, number>;
  /** distinct recent rejection comments */
  avoid: string[];
  /** distinct recent approval comments */
  favour: string[];
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
  verdict: "up" | "down";
  comment?: string;
  imageUrl?: string | null;
  prompt?: string;
  story?: string;
}): Promise<FeedbackDoc> {
  const doc: FeedbackDoc = {
    id: randomUUID().slice(0, 12),
    style: String(input.style).slice(0, 40),
    variantKey: String(input.variantKey).slice(0, 60),
    variantLabel: String(input.variantLabel).slice(0, 120),
    verdict: input.verdict === "down" ? "down" : "up",
    comment: String(input.comment || "").slice(0, 500),
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
    .find({}, { projection: { _id: 0, style: 1, variantKey: 1, verdict: 1, comment: 1, createdAt: 1 } })
    .sort({ createdAt: -1 })
    .limit(500)
    .toArray();
  const out: Record<string, StyleFeedbackAggregate> = {};
  for (const r of rows) {
    const agg = (out[r.style] ||= { weights: {}, avoid: [], favour: [], latest: null });
    if (!agg.latest) agg.latest = r.createdAt; // rows arrive newest-first
    agg.weights[r.variantKey] = (agg.weights[r.variantKey] ?? 1) + (r.verdict === "up" ? 1 : -0.5);
    const c = r.comment.trim();
    if (c) {
      const list = r.verdict === "down" ? agg.avoid : agg.favour;
      const cap = r.verdict === "down" ? 6 : 4;
      if (list.length < cap && !list.includes(c)) list.push(c);
    }
  }
  for (const agg of Object.values(out))
    for (const k of Object.keys(agg.weights))
      agg.weights[k] = Math.max(0.05, agg.weights[k]);
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
