import { NextResponse } from "next/server";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { listRefs } from "@/lib/admin/style-refs";
import { runDreamPhase } from "@/lib/dream/engine";
import { EVAL_BRIEFS, EVAL_STYLES, EVAL_FAULTS, aspectOf, type EvalBrief, type EvalItem, type EvalRun, type EvalRating, type EvalFault, type EvalMode } from "@/lib/eval/briefs";
import { EVAL_MODELS, evalModel, buildArtworkPrompt, generateArtwork, generateArtworkChecked, type EvalModel } from "@/lib/eval/models";
import { composeLabel } from "@/lib/typeset/compose";
import { flatGroundOf } from "@/lib/typeset/palette";
import { textsOf } from "@/lib/label/hybrid";
import { WIZARD_PAINTERS } from "@/lib/label/painters";
import { listRuns, readRun, writeRun, readRatings, writeRating, saveImage, runDir } from "@/lib/eval/store";

/* THE EVALUATION LOOP (branch POPIKA_Back_To_Vector, 2026-09-18/19).
   GET  → runs (with ratings), the reference boards, the models — for /eval.
   POST {action:"generate", name, note?, mode, model, perBrief?, smoke?}
        streams NDJSON while it paints the six frozen briefs through every
        style and files the results as a run. Modes:
        "label"   today's whole-label dream (gpt-image paints the type too);
        "artwork" the hybrid's ask — illustration only, a zone kept for type;
        "hybrid"  the NEW ENGINE end to end — masked artwork, then the type
                  set by code into the band. The SVG (live type) is filed
                  next to the PNG: it is the future PDF.
        Real model calls — this costs money, hence the admin session.
   POST {action:"retry", run} → re-attempts only a run's failed items.
   POST {action:"rate", run, item, rating|null} → the owner's mark. */

export const maxDuration = 900;

function gitInfo(): { commit: string; branch: string } {
  const sh = (c: string) => { try { return execSync(c, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return "?"; } };
  return { commit: sh("git rev-parse --short HEAD"), branch: sh("git rev-parse --abbrev-ref HEAD") };
}


/* ONE picture, in whichever mode — shared by generate and retry */
async function paintItem(run: EvalRun, model: EvalModel, brief: EvalBrief, item: EvalItem): Promise<void> {
  const t0 = Date.now();
  try {
    if (run.mode === "label") {
      const d = await runDreamPhase({ vision: brief.vision, style: item.style, data: brief.data, sketch: null, aspect: aspectOf(brief) });
      item.file = saveImage(run.id, item.id, d.dream); item.prompt = d.prompt;
    } else if (run.mode === "artwork") {
      const ap = await buildArtworkPrompt(brief, item.style);
      item.prompt = ap.prompt; item.card = ap.card;
      item.file = saveImage(run.id, item.id, await generateArtwork(model, ap));
    } else {
      /* hybrid: the masked painter, then the composer */
      const seed = [...item.id].reduce((h, c) => ((h * 33) ^ c.charCodeAt(0)) >>> 0, 5381);
      /* way 1 for the own-ground painter AND every fal painter (they take
         no mask — the ground is read off their picture) */
      const free = model.via === "fal" && !model.canvas;
      const ap = await buildArtworkPrompt(brief, item.style, seed, { ownGround: model.id === "gpt-image-own", softGround: !!model.canvas });
      item.prompt = ap.prompt; item.card = ap.card;
      const { art, retried } = await generateArtworkChecked(model, ap);
      /* way 1: no paper was given, so the ground is read off the picture */
      let paper = ap.paper, own = retried ? " · repainted (text seen)" : "";
      if (free) { paper = ""; own += " · cropped"; }
      else if (!paper) {
        const g = await flatGroundOf(art);
        paper = g.colour;
        own = ` · own ground ${g.flat ? "flat" : "NOT flat"} ${(g.coverage * 100).toFixed(0)}%`;
      }
      const out = await composeLabel({ artwork: art, style: item.style, texts: textsOf(brief.data), widthMm: brief.width, heightMm: brief.height, seed, paper: paper || undefined, wineColour: brief.data.wineColorName, fit: free ? "crop" : "yield" });
      item.file = saveImage(run.id, item.id, out.png);
      fs.writeFileSync(path.join(runDir(run.id), `${item.id}.svg`), out.svg);
      saveImage(run.id, `${item.id}--art`, art);
      item.prompt = `[faces: ${out.faces} · ink ${out.ink}${own}]\n` + item.prompt;
    }
    delete item.error;
  } catch (e) {
    item.error = e instanceof Error ? e.message : String(e);
  }
  item.ms = Date.now() - t0;
}

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const runs = listRuns().map((r) => ({ ...r, mode: r.mode || "label", model: r.model || "gpt-image", ratings: readRatings(r.id) }));
  const refs: Record<string, { id: string; name: string; url: string }[]> = {};
  for (const st of EVAL_STYLES) {
    try { refs[st] = (await listRefs(st)).map((d) => ({ id: d.id, name: d.name, url: d.url })); }
    catch { refs[st] = []; }
  }
  return NextResponse.json({ briefs: EVAL_BRIEFS, styles: EVAL_STYLES, faults: EVAL_FAULTS, models: EVAL_MODELS.filter((m) => WIZARD_PAINTERS.includes(m.id)), runs, refs });
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  let body: { action?: string; name?: string; note?: string; run?: string; item?: string; rating?: EvalRating | null; perBrief?: number; mode?: string; model?: string; smoke?: boolean; styles?: string[] };
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

  const enc = new TextEncoder();
  const ndjson = (start: (send: (o: unknown) => void) => Promise<void>) =>
    new Response(new ReadableStream({
      async start(controller) {
        const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        await start(send);
        controller.close();
      },
    }), { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });

  if (body.action === "retry") {
    const run = readRun(String(body.run || ""));
    if (!run) return NextResponse.json({ error: "no such run" }, { status: 404 });
    run.mode = run.mode || "label";
    const model = evalModel(run.model || "gpt-image");
    if (!model) return NextResponse.json({ error: "unknown model" }, { status: 400 });
    return ndjson(async (send) => {
      const failed = run.items.filter((i) => i.error);
      send({ type: "start", run: run.id, total: failed.length });
      let done = 0;
      for (const item of failed) {
        const brief = EVAL_BRIEFS.find((b) => b.id === item.briefId);
        if (!brief) continue;
        await paintItem(run, model, brief, item);
        writeRun(run);
        send({ type: "item", done: ++done, total: failed.length, item: { ...item, prompt: undefined } });
        await new Promise((r) => setTimeout(r, 4000));   /* breathe — the limits asked for it */
      }
      send({ type: "done", run: run.id });
    });
  }

  if (body.action !== "generate") return NextResponse.json({ error: "unknown action" }, { status: 400 });

  const mode: EvalMode = body.mode === "artwork" ? "artwork" : body.mode === "hybrid" ? "hybrid" : "label";
  const model = mode === "label" ? evalModel("gpt-image")! : mode === "hybrid" ? evalModel(String(body.model || "gpt-image-masked")) : evalModel(String(body.model || ""));
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

  return ndjson(async (send) => {
    const briefs = body.smoke ? EVAL_BRIEFS.slice(0, 1) : EVAL_BRIEFS;
    /* `styles` narrows a run to the styles under test (e.g. punk + contemporary) */
    const asked = Array.isArray(body.styles) ? EVAL_STYLES.filter((s) => (body.styles as string[]).includes(s)) : [];
    const styles = body.smoke ? EVAL_STYLES.slice(0, 1) : asked.length ? asked : EVAL_STYLES;
    const total = briefs.length * styles.length * perBrief;
    let done = 0;
    send({ type: "start", run: run.id, total });
    /* OpenAI's per-minute image quota trips on THREE at once (every masked
       run did) — its styles go one after another with a breath between;
       the fal painters still take a brief's three styles in parallel */
    const sequential = model.via === "openai";
    for (const brief of briefs) {
      for (let n = 1; n <= perBrief; n++) {
        const one = async (style: string) => {
          const item: EvalItem = { id: `${brief.id}--${style}--${n}`, briefId: brief.id, style, n, file: "", prompt: "", ms: 0 };
          await paintItem(run, model, brief, item);
          run.items.push(item);
          writeRun(run);
          send({ type: "item", done: ++done, total, item: { ...item, prompt: undefined } });
        };
        if (sequential) { for (const style of styles) { await one(style); await new Promise((r) => setTimeout(r, 3000)); } }
        else await Promise.all(styles.map(one));
      }
    }
    send({ type: "done", run: run.id });
  });
}
