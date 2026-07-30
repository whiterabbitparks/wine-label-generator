import { getDb } from "@/lib/db";
import type { GenerationJob } from "@/lib/image-provider/types";

/* Generation audit trail (`generations` collection). Metadata only — the
   image itself is NOT stored (a single PNG is ~4-6 MB; documents would bloat
   the cluster fast; revisit with GridFS/object storage if stored artwork is
   ever wanted). */

export interface GenerationRecord {
  createdAt: Date;
  provider: string;
  ok: boolean;
  durationMs: number;
  prompt: string;
  vision: string;
  preset: string;
  hadReference: boolean;
  size: { w: number; h: number } | null;
  error?: string;
  imageBytes?: number;
  /** where the stored copy lives (local: /api/images/<name>; s3 later) */
  imageUrl?: string;
  storage?: "local" | "s3";
}

let indexReady: Promise<unknown> | undefined;

export async function logGeneration(
  job: GenerationJob,
  meta: {
    provider: string;
    ok: boolean;
    durationMs: number;
    error?: string;
    imageBytes?: number;
    imageUrl?: string;
    storage?: "local" | "s3";
  }
): Promise<void> {
  const db = await getDb();
  const col = db.collection<GenerationRecord>("generations");
  if (!indexReady) indexReady = col.createIndex({ createdAt: -1 });
  await indexReady;
  await col.insertOne({
    createdAt: new Date(),
    provider: meta.provider,
    ok: meta.ok,
    durationMs: meta.durationMs,
    prompt: (job.prompt || "").slice(0, 2000),
    vision: (job.vision || "").slice(0, 500),
    preset: job.art?.preset || "",
    hadReference: !!job.reference,
    size: job.size ? { w: job.size.w, h: job.size.h } : null,
    ...(meta.error ? { error: meta.error.slice(0, 500) } : {}),
    ...(meta.imageBytes ? { imageBytes: meta.imageBytes } : {}),
    ...(meta.imageUrl ? { imageUrl: meta.imageUrl, storage: meta.storage } : {}),
  });
}

export async function recentGenerations(limit = 20): Promise<GenerationRecord[]> {
  const db = await getDb();
  return db
    .collection<GenerationRecord>("generations")
    .find({}, { projection: { _id: 0 } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}
