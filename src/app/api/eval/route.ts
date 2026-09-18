import { NextResponse } from "next/server";
import { execSync } from "node:child_process";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { listRefs } from "@/lib/admin/style-refs";
import { runDreamPhase } from "@/lib/dream/engine";
import { EVAL_BRIEFS, EVAL_STYLES, EVAL_FAULTS, aspectOf, type EvalItem, type EvalRun, type EvalRating, type EvalFault, type EvalMode } from "@/lib/eval/briefs";
import { EVAL_MODELS, evalModel, buildArtworkPrompt, generateArtwork } from "@/lib/eval/models";
import { listRuns, readRun, writeRun, readRatings, writeRating, saveImage } from "@/lib/eval/store";

/* THE EVALUATION LOOP (branch POPIKA_Back_To_Vector, 2026-09-18).
   GET  → runs (with ratings), the reference boards, the models — for /eval.
   POST {action:"generate", name, note?, mode, model, perBrief?} → streams
        NDJSON while it paints the six frozen briefs through every style and
        files the results as a run. Two modes: "label" is today's whole-label
        dream (gpt-image only — it is the only painter we let write type);
        "artwork" is the hybrid's ask — illustration only, a zone kept empty
        for type — put to whichever of the five painters is named.
        Real model calls — this costs money, which is why it sits behind the
        admin session.
   POST {action:"rate", run, item, rating|null} → the owner's mark. */

export const maxDuration = 900;

function gitInfo(): { commit: string; branch: string } {
  const sh = (c: string) => { try { return execSync(c, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return "?"; } };
  return { commit: sh("git rev-parse --short HEAD"), branch: sh("git rev-parse --abbrev-ref HEAD") };
}

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  /* the first run predates modes — it was the whole-label dream */
  const runs = listRuns().map((r) => ({ ...r, mode: r.mode || "label", model: r.model || "gpt-image", ratings: readRatings(r.id) }));
  const refs: Record<string, { id: string; name: string; url: string }[]> = {};
  for (const st of EVAL_STYLES) {
    try { refs[st] = (await listRefs(st)).map((d) => ({ id: d.id, name: d.name, url: d.url })); }
    catch { refs[st] = []; }
  }
  return NextResponse.json({ briefs: EVAL_BRIEFS, styles: EVAL_STYLES, faults: EVAL_FAULTS, models: EVAL_MODELS, runs, refs });
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  let body: { action?: string; name?: string; note?: string; run?: string; item?: string; rating?: EvalRating | null; perBrief?: number; mode?: string; model?: string; smoke?: boolean };
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

  /* RETRY (2026-09-18): five painters at once tripped every provider's
     concurrency limit (429s) — the asks were fine. This re-attempts ONLY
     the failed items of a run, one at a time, so a run can be completed
     without repainting what already landed. */
  if (body.action === "retry") {
    const run = readRun(String(body.run || ""));
    if (!run) return NextResponse.json({ error: "no such run" }, { status: 404 });
    const model = evalModel(run.model || "gpt-image");
    if (!model) return NextResponse.json({ error: "unknown model" }, { status: 400 });
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        const failed = run.items.filter((i) => i.error);
        send({ type: "start", run: run.id, total: failed.length });
        let done = 0;
        for (const item of failed) {
          const brief = EVAL_BRIEFS.find((b) => b.id === item.briefId);
          if (!brief) continue;
          const t0 = Date.now();
          try {
            if ((run.mode || "label") === "label") {
              const d = await runDreamPhase({ vision: brief.vision, style: item.style, data: brief.data, sketch: null, aspect: aspectOf(brief) });
              item.file = saveImage(run.id, item.id, d.dream); item.prompt = d.prompt;
            } else {
              const ap = await buildArtworkPrompt(brief, item.style);
              item.prompt = ap.prompt; item.card = ap.card;
              item.file = saveImage(run.id, item.id, await generateArtwork(model, ap));
            }
            delete item.error;
          } catch (e) {
            item.error = e instanceof Error ? e.message : String(e);
          }
          item.ms = Date.now() - t0;
          writeRun(run);
          done++;
          send({ type: "item", done, total: failed.length, item: { ...item, prompt: undefined } });
          /* breathe between calls — this is what the limits asked for */
          await new Promise((r) => setTimeout(r, 4000));
        }
        send({ type: "done", run: run.id });
        controller.close();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
  }

  if (body.action !== "generate") return NextResponse.json({ error: "unknown action" }, { status: 400 });

  const mode: EvalMode = body.mode === "artwork" ? "artwork" : "label";
  const model = mode === "label" ? evalModel("gpt-image")! : evalModel(String(body.model || ""));
  if (!model) return NextResponse.json({ error: "unknown model" }, { status: 400 });
  const perBrief = Math.min(3, Math.max(1, Number(body.perBrief) || 1));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const run: EvalRun = {
    id: `${stamp}-${String(body.name || "run").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40)}`,
    name: String(body.name || "run").slice(0, 80),
    note: body.note ? String(body.note).slice(0, 600) : undefined,
    createdAt: new Date().toISOString(),
    ...gitInfo(),
    mode, model: model.id,
    items: [],
  };
  writeRun(run);

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      /* smoke = one picture (first brief, first style): proves a painter's
         request shape before ninety of them are paid for */
      const briefs = body.smoke ? EVAL_BRIEFS.slice(0, 1) : EVAL_BRIEFS;
      const styles = body.smoke ? EVAL_STYLES.slice(0, 1) : EVAL_STYLES;
      const total = briefs.length * styles.length * perBrief;
      let done = 0;
      send({ type: "start", run: run.id, total });
      /* the three styles of one brief paint in parallel (the classic page
         always did), briefs go one after another — gentle on rate limits */
      for (const brief of briefs) {
        for (let n = 1; n <= perBrief; n++) {
          await Promise.all(styles.map(async (style) => {
            const id = `${brief.id}--${style}--${n}`;
            const t0 = Date.now();
            const item: EvalItem = { id, briefId: brief.id, style, n, file: "", prompt: "", ms: 0 };
            try {
              if (mode === "label") {
                const d = await runDreamPhase({ vision: brief.vision, style, data: brief.data, sketch: null, aspect: aspectOf(brief) });
                item.file = saveImage(run.id, id, d.dream);
                item.prompt = d.prompt;
              } else {
                const ap = await buildArtworkPrompt(brief, style);
                item.prompt = ap.prompt; item.card = ap.card;
                item.file = saveImage(run.id, id, await generateArtwork(model, ap));
              }
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
