import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { loadCatalog } from "@/lib/styles/catalog";
import { buildStyleJob, type LabelBrief } from "@/lib/styles/prompt";
import { loadConfig, DEFAULT_CONFIG } from "@/lib/admin/config-store";
import { providerName, generateImageWithRetry } from "@/lib/image-provider";
import { getImageStorage } from "@/lib/image-storage";
import { logGeneration } from "@/lib/admin/generation-log";
import { getProfiles, listRefs } from "@/lib/admin/style-refs";
import { getImageRules, ruleLines, verifyImage } from "@/lib/admin/image-rules";
import { feedbackAggregates } from "@/lib/admin/feedback";

/* POST /api/admin/playground — owner's test bench for the refinement loop.
   Generates a small batch for ONE style, cycling through its art directions
   in order (not seeded — the point is to see and judge each direction).
   Uses the LIVE provider; admin-only. */

export const maxDuration = 300;

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { style?: string; vision?: string; count?: number; includeRejected?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const catalog = await loadCatalog();
  const style = catalog.find((s) => s.key === String(body.style));
  if (!style) return NextResponse.json({ error: "unknown style" }, { status: 400 });
  const count = Math.min(8, Math.max(1, Number(body.count) || 4));
  const vision = String(body.vision || "").slice(0, 2000).trim();

  const art = await loadConfig().catch(() => ({ ...DEFAULT_CONFIG }));
  let variants: { key: string; label: string; medium: string; composition: string; mood: string }[] =
    style.subStyles;
  let charter: string | null = null;
  let weights: Record<string, number> = {};
  let refUrls: Record<string, string> = {};
  try {
    const prof = (await getProfiles())[style.key];
    if (prof?.variants?.length) variants = prof.variants;
    charter = prof?.charter || prof?.summary || null;
    weights = (await feedbackAggregates())[style.key]?.weights || {};
    refUrls = Object.fromEntries((await listRefs(style.key)).map((r) => [r.id, r.url]));
  } catch {}
  const rules = ruleLines(await getImageRules().catch(() => ({ global: '', perStyle: {} })), style.key);

  // BENCH (owner 2026-08-15): unrated cards first — the playground's job is
  // rating coverage, not mirroring customers. One rejection retires a card
  // (weight <= 0.55); 'includeRejected' reviews retired cards so an approve
  // can revive them. No duplicates within a batch unless cards run out.
  const entries = variants.map((v) => ({ v, w: weights[v.key] ?? 1, rated: weights[v.key] !== undefined }));
  const rejectedE = entries.filter((e) => e.w <= 0.55);
  const activeE = entries.filter((e) => e.w > 0.55);
  const shuffle = <T,>(arr: T[]) => arr.map((x) => [Math.random(), x] as const).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
  let benchE = body.includeRejected
    ? shuffle(entries)
    : [...shuffle(activeE.filter((e) => !e.rated)), ...shuffle(activeE.filter((e) => e.rated))];
  if (!benchE.length) benchE = shuffle(entries);
  const picks = Array.from({ length: count }, (_, n) => benchE[n % benchE.length].v);
  const benchStats = {
    total: entries.length,
    active: activeE.length,
    unrated: activeE.filter((e) => !e.rated).length,
    rejected: rejectedE.length,
  };
  const provider = providerName();
  const brief: LabelBrief = { vision, data: {}, seed: 0, zones: null };
  const results = await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const sub = { ...picks[i % picks.length] };
      const job = buildStyleJob(style, sub, brief, art, undefined, charter, rules.map((r) => r.positive));
      const ruleNeg = rules.map((r) => r.negative).filter(Boolean).join(", ");
      if (ruleNeg) job.negative = job.negative ? job.negative + ", " + ruleNeg : ruleNeg;
      const started = Date.now();
      try {
        let dataUrl = await generateImageWithRetry(job);
        // VERIFIED RULES: check the image against the owner's plain-English
        // rules; a violator is regenerated once with the broken rules strict
        let check = await verifyImage(dataUrl, rules);
        for (let attempt = 0; !check.ok && attempt < 2; attempt++) {
          const strictJob = {
            ...job,
            prompt: 'ABSOLUTE REQUIREMENTS — a previous attempt broke these and was rejected: ' + check.violations.join('; ') + '. ' + job.prompt,
            negative: (job.negative ? job.negative + ', ' : '') + check.violations.join(', '),
          };
          try {
            dataUrl = await generateImageWithRetry(strictJob);
            check = await verifyImage(dataUrl, rules);
          } catch { break; }
        }
        let stored = null;
        try {
          stored = await getImageStorage().save(
            dataUrl,
            `play-${Date.now()}-${style.key}-${randomUUID().slice(0, 6)}`
          );
        } catch {}
        logGeneration(job, {
          provider,
          ok: true,
          durationMs: Date.now() - started,
          imageBytes: stored?.bytes ?? Math.round(dataUrl.length * 0.75),
          imageUrl: stored?.url,
          storage: stored?.storage,
        }).catch(() => {});
        return {
          variantKey: sub.key,
          variantLabel: sub.label,
          weight: weights[sub.key] ?? 1,
          refUrl: refUrls[sub.key] || null,
          check,
          url: dataUrl,
          imageUrl: stored?.url ?? null,
          prompt: job.prompt,
        };
      } catch (e) {
        return {
          variantKey: sub.key,
          variantLabel: sub.label,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    })
  );
  return NextResponse.json({ provider, style: style.key, benchStats, results });
}
