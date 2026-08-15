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
  let body: { style?: string; vision?: string; count?: number };
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

  // the bench mirrors what customers get: directions ordered by learned
  // weight, retired ones (two+ rejections) shown only when nothing else is
  // left — each card reports its status so the learning is visible
  const ranked = [...variants].sort(
    (a, b) => (weights[b.key] ?? 1) - (weights[a.key] ?? 1)
  );
  // one rejection (weight 0.5) removes a style card from the bench;
  // two retire it from customer generation as well
  const active = ranked.filter((v) => (weights[v.key] ?? 1) > 0.55);
  const bench = (active.length ? active : ranked);

  const provider = providerName();
  const brief: LabelBrief = { vision, data: {}, seed: 0, zones: null };
  const results = await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const sub = { ...bench[i % bench.length] };
      const job = buildStyleJob(style, sub, brief, art, undefined, charter);
      const started = Date.now();
      try {
        let dataUrl = await generateImageWithRetry(job);
        // VERIFIED RULES: check the image against the owner's plain-English
        // rules; a violator is regenerated once with the broken rules strict
        let check = await verifyImage(dataUrl, rules);
        if (!check.ok) {
          const strictJob = { ...job, prompt: job.prompt + ' STRICT NON-NEGOTIABLE REQUIREMENTS: ' + check.violations.join('; ') + '.' };
          try {
            dataUrl = await generateImageWithRetry(strictJob);
            check = await verifyImage(dataUrl, rules);
            check.violations = check.ok ? [] : check.violations;
          } catch {}
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
  return NextResponse.json({ provider, style: style.key, results });
}
