import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { loadCatalog } from "@/lib/styles/catalog";
import { buildStyleJob, type LabelBrief } from "@/lib/styles/prompt";
import { loadConfig, DEFAULT_CONFIG } from "@/lib/admin/config-store";
import { providerName, generateImageWithRetry } from "@/lib/image-provider";
import { getImageStorage } from "@/lib/image-storage";
import { logGeneration } from "@/lib/admin/generation-log";
import { getProfiles, listRefs, getCardSeen, markCardsSeen } from "@/lib/admin/style-refs";
import { getImageRules, ruleLines, verifyImage, NO_TEXT_RULE, NO_BORDER_RULE, WHITE_BG_RULE, NO_ARCHITECTURE_RULE, NEUTRAL_GEO_RULE, geographicRule, wantsBuilding, QVEVRI_RULE, mentionsQvevri, qvevriOverridden, stylizationRule, NO_RED_DOMINANCE_RULE, wantsText, subjectFocusRule, wantsCrowd } from "@/lib/admin/image-rules";
import { subjectFrom } from "@/lib/styles/prompt";
import { feedbackAggregates } from "@/lib/admin/feedback";

/* POST /api/admin/playground — owner's test bench for the refinement loop.
   Generates a small batch for ONE style, cycling through its art directions
   in order (not seeded — the point is to see and judge each direction).
   Uses the LIVE provider; admin-only. */

export const maxDuration = 300;

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { style?: string; vision?: string; count?: number; provider?: string };
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
  let cardNotes: Record<string, { keeps: string[]; fixes: string[]; rejections: number }> = {};
  let globalFb: { avoid: string[]; favour: string[] } = { avoid: [], favour: [] };
  let refUrls: Record<string, string> = {};
  try {
    const prof = (await getProfiles())[style.key];
    if (prof?.variants?.length) variants = prof.variants;
    charter = prof?.charter || prof?.summary || null;
    const agg = (await feedbackAggregates())[style.key];
    weights = agg?.weights || {};
    cardNotes = agg?.cardNotes || {};
    globalFb = { avoid: agg?.avoid || [], favour: agg?.favour || [] };
    refUrls = Object.fromEntries((await listRefs(style.key)).map((r) => [r.id, r.url]));
  } catch {}
  const rules = ruleLines(await getImageRules().catch(() => ({ global: '', perStyle: {} })), style.key);
  rules.push(NO_BORDER_RULE);
  rules.push(WHITE_BG_RULE);
  if (!wantsText(vision)) rules.push(NO_TEXT_RULE);
  if (!wantsCrowd(vision)) rules.push(subjectFocusRule(subjectFrom(vision, {})));
  // playground briefs carry no wine data: buildings gated on the test story,
  // geography kept neutral unless the story itself names a place
  if (!wantsBuilding(vision)) rules.push(NO_ARCHITECTURE_RULE);
  if (mentionsQvevri(vision) && !qvevriOverridden(vision)) rules.push(QVEVRI_RULE);
  rules.push(/\b(valley|region|mountain|coast|island|georgia|kakheti|france|bordeaux|burgundy|tuscany|rioja|mosel|provence|caucasus)\b/i.test(vision) ? geographicRule(vision.slice(0, 140)) : NEUTRAL_GEO_RULE);

  // BENCH ROTATION (owner 2026-08-15): references never lose value — every
  // card always stays in rotation (removing one = deleting the reference).
  // Rounds walk the entire board, least recently shown first, before any
  // card repeats.
  const entries = variants.map((v) => ({
    v,
    w: weights[v.key] ?? 1,
    rated: weights[v.key] !== undefined || (cardNotes[v.key]?.rejections ?? 0) > 0,
  }));
  const seen = await getCardSeen(style.key);
  const benchE = [...entries].sort((x, y) => (seen[x.v.key] ?? 0) - (seen[y.v.key] ?? 0) || Math.random() - 0.5);
  const picks = Array.from({ length: count }, (_, n) => benchE[n % benchE.length].v);
  await markCardsSeen(style.key, [...new Set(picks.map((p) => p.key))]);
  const benchStats = {
    total: entries.length,
    approved: entries.filter((e) => e.w > 1).length,
    unrated: entries.filter((e) => !e.rated).length,
  };
  // provider A/B (owner GO 2026-08-17): the playground may override the env
  // default per batch — same story, two providers, honest comparison
  const provider =
    body.provider === "recraft" ? ("recraft" as const)
    : body.provider === "openai" ? ("openai" as const)
    : providerName();
  const brief: LabelBrief = { vision, data: {}, seed: 0, zones: null };
  const results = await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const sub = { ...picks[i % picks.length] };
      const notes = cardNotes[sub.key];
      // formal language is card-aware (owner 2026-08-17): engraving-family
      // cards keep print realism, everything else demands stylization
      const cardRules = [...rules, stylizationRule(style.key, `${(sub as { language?: string }).language || ""} ${sub.medium || ""}`)];
      if (style.key !== "punk") cardRules.push(NO_RED_DOMINANCE_RULE); // playground briefs default to the white colour-world
      const job = buildStyleJob(style, sub, brief, art, { ...globalFb, fixes: notes?.fixes, keeps: notes?.keeps, rejections: notes?.rejections }, charter, cardRules.map((r) => r.positive));
      job.provider = provider; // batch's chosen provider rides the job
      const ruleNeg = cardRules.map((r) => r.negative).filter(Boolean).join(", ");
      if (ruleNeg) job.negative = job.negative ? job.negative + ", " + ruleNeg : ruleNeg;
      const started = Date.now();
      try {
        let dataUrl = await generateImageWithRetry(job);
        // VERIFIED RULES: check the image against the owner's plain-English
        // rules; a violator is regenerated once with the broken rules strict
        let check = await verifyImage(dataUrl, cardRules);
        for (let attempt = 0; !check.ok && attempt < 2; attempt++) {
          const strictJob = {
            ...job,
            prompt: 'ABSOLUTE REQUIREMENTS — a previous attempt broke these and was rejected: ' + check.violations.join('; ') + '. ' + job.prompt,
            negative: (job.negative ? job.negative + ', ' : '') + check.violations.join(', '),
          };
          try {
            dataUrl = await generateImageWithRetry(strictJob);
            check = await verifyImage(dataUrl, cardRules);
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
