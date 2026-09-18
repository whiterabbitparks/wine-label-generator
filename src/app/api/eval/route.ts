import { NextResponse } from "next/server";
import { execSync } from "node:child_process";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { listRefs } from "@/lib/admin/style-refs";
import { runDreamPhase } from "@/lib/dream/engine";
import { EVAL_BRIEFS, EVAL_STYLES, EVAL_FAULTS, aspectOf, type EvalItem, type EvalRun, type EvalRating, type EvalFault } from "@/lib/eval/briefs";
import { listRuns, readRun, writeRun, readRatings, writeRating, saveImage } from "@/lib/eval/store";

/* THE EVALUATION LOOP (branch POPIKA_Back_To_Vector, 2026-09-18).
   GET  → runs (with ratings) + the reference boards, for the /eval page.
   POST {action:"generate", name, note?} → streams NDJSON while it dreams the
        six frozen briefs through every style with TODAY's engine and files
        the results as a run. Real model calls — this costs money, which is
        why it sits behind the admin session.
   POST {action:"rate", run, item, rating|null} → the owner's mark. */

export const maxDuration = 900;

function gitInfo(): { commit: string; branch: string } {
  const sh = (c: string) => { try { return execSync(c, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return "?"; } };
  return { commit: sh("git rev-parse --short HEAD"), branch: sh("git rev-parse --abbrev-ref HEAD") };
}

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const runs = listRuns().map((r) => ({ ...r, ratings: readRatings(r.id) }));
  const refs: Record<string, { id: string; name: string; url: string }[]> = {};
  for (const st of EVAL_STYLES) {
    try { refs[st] = (await listRefs(st)).map((d) => ({ id: d.id, name: d.name, url: d.url })); }
    catch { refs[st] = []; }
  }
  return NextResponse.json({ briefs: EVAL_BRIEFS, styles: EVAL_STYLES, faults: EVAL_FAULTS, runs, refs });
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  let body: { action?: string; name?: string; note?: string; run?: string; item?: string; rating?: EvalRating | null; perBrief?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  if (body.action === "rate") {
    const run = readRun(String(body.run || ""));
    if (!run) return NextResponse.json({ error: "no such run" }, { status: 404 });
    let rating: EvalRating | null = null;
    if (body.rating) {
      const faults = (Array.isArray(body.rating.faults) ? body.rating.faults : []).filter((f): f is EvalFault => (EVAL_FAULTS as readonly string[]).includes(f));
      const score = Number(body.rating.score);
      rating = {
        faults,
        score: score >= 1 && score <= 5 ? Math.round(score) : undefined,
        ref: body.rating.ref ? String(body.rating.ref).slice(0, 40) : undefined,
        note: body.rating.note ? String(body.rating.note).slice(0, 600) : undefined,
        at: new Date().toISOString(),
      };
    }
    return NextResponse.json({ ratings: writeRating(run.id, String(body.item || ""), rating) });
  }

  if (body.action !== "generate") return NextResponse.json({ error: "unknown action" }, { status: 400 });

  const perBrief = Math.min(3, Math.max(1, Number(body.perBrief) || 1));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const run: EvalRun = {
    id: `${stamp}-${String(body.name || "run").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40)}`,
    name: String(body.name || "run").slice(0, 80),
    note: body.note ? String(body.note).slice(0, 600) : undefined,
    createdAt: new Date().toISOString(),
    ...gitInfo(),
    items: [],
  };
  writeRun(run);

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      const total = EVAL_BRIEFS.length * EVAL_STYLES.length * perBrief;
      let done = 0;
      send({ type: "start", run: run.id, total });
      /* the three styles of one brief dream in parallel (the classic page
         always did), briefs go one after another — gentle on the rate limit */
      for (const brief of EVAL_BRIEFS) {
        for (let n = 1; n <= perBrief; n++) {
          await Promise.all(EVAL_STYLES.map(async (style) => {
            const id = `${brief.id}--${style}--${n}`;
            const t0 = Date.now();
            const item: EvalItem = { id, briefId: brief.id, style, n, file: "", prompt: "", ms: 0 };
            try {
              const d = await runDreamPhase({ vision: brief.vision, style, data: brief.data, sketch: null, aspect: aspectOf(brief) });
              item.file = saveImage(run.id, id, d.dream);
              item.prompt = d.prompt;
            } catch (e) {
              item.error = e instanceof Error ? e.message : String(e);
            }
            item.ms = Date.now() - t0;
            run.items.push(item);
            writeRun(run);
            done++;
            send({ type: "item", done, total, item: { ...item, prompt: undefined } });
          }));
        }
      }
      send({ type: "done", run: run.id });
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
