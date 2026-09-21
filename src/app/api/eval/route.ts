import { NextResponse } from "next/server";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { EVAL_BRIEFS, EVAL_STYLES, EVAL_FAULTS, type EvalBrief, type EvalItem, type EvalRun, type EvalRating, type EvalFault } from "@/lib/eval/briefs";
import { evalModel, artistModels, buildArtworkPrompt, generateArtwork, type EvalModel } from "@/lib/eval/models";
import { composeLabel } from "@/lib/typeset/compose";
import { textsOf } from "@/lib/label/hybrid";
import { painterFor } from "@/lib/label/painters";
import { listRuns, readRun, writeRun, readRatings, writeRating, saveImage, runDir } from "@/lib/eval/store";

/* THE EVALUATION LOOP (2026-09-18 → round 105).
   GET  → runs (with ratings), the artists — for /admin → Evaluate.
   POST {action:"generate", name, note?, model, perBrief?, smoke?, styles?}
        streams NDJSON while it paints the six frozen briefs through the
        three columns and files the results as a run. `model` is an artist
        ("artist:<id>") for every column, or "wizard" = each column's own
        artist, exactly as the wizard paints. The artwork alone is filed
        next to the label (`<id>--art.png`, plus `--story.png` before the
        repaint) — the Evaluate panel shows the artwork.
        Real model calls — this costs money, hence the admin session.
   POST {action:"retry", run} → re-attempts only a run's failed items.
   POST {action:"rate", run, item, rating|null} → the owner's mark. */

export const maxDuration = 900;

function gitInfo(): { commit: string; branch: string } {
  const sh = (c: string) => { try { return execSync(c, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return "?"; } };
  return { commit: sh("git rev-parse --short HEAD"), branch: sh("git rev-parse --abbrev-ref HEAD") };
}

/* ONE picture — the wizard's own path: story, hand, then the composer */
async function paintItem(run: EvalRun, model: EvalModel, brief: EvalBrief, item: EvalItem): Promise<void> {
  const t0 = Date.now();
  try {
    const seed = [...item.id].reduce((h, c) => ((h * 33) ^ c.charCodeAt(0)) >>> 0, 5381);
    const ap = await buildArtworkPrompt(brief, model.artist);
    const painted = await generateArtwork(model, ap);
    const out = await composeLabel({ artwork: painted.art, style: item.style, texts: textsOf(brief.data), widthMm: brief.width, heightMm: brief.height, seed, wineColour: brief.data.wineColorName, fit: "vignette" });
    item.file = saveImage(run.id, item.id, out.png);
    fs.writeFileSync(path.join(runDir(run.id), `${item.id}.svg`), out.svg);
    saveImage(run.id, `${item.id}--art`, painted.art);
    saveImage(run.id, `${item.id}--story`, painted.story);
    item.prompt = `[faces: ${out.faces} · ink ${out.ink}${painted.repainted ? "" : " · NOT repainted: " + painted.error}]\n` + ap.prompt;
    item.painter = model.name;
    delete item.error;
  } catch (e) {
    item.error = e instanceof Error ? e.message : String(e);
  }
  item.ms = Date.now() - t0;
}

async function modelFor(style: string, asked: string): Promise<EvalModel | null> {
  return asked === "wizard" ? evalModel(await painterFor(style)) : evalModel(asked);
}

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  /* each item says whether its artwork alone is on file — the panel shows
     that, not the composed label, unless asked */
  const runs = listRuns().map((r) => ({
    ...r, mode: r.mode || "label", model: r.model || "gpt-image", ratings: readRatings(r.id),
    items: r.items.map((i) => ({ ...i, art: fs.existsSync(path.join(runDir(r.id), `${i.id}--art.png`)) })),
  }));
  return NextResponse.json({ briefs: EVAL_BRIEFS, styles: EVAL_STYLES, models: artistModels().map((m) => ({ id: m.id, name: m.name + (m.lora ? "" : " (no LoRA yet)") })), runs });
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  let body: { action?: string; name?: string; note?: string; run?: string; item?: string; rating?: EvalRating | null; perBrief?: number; model?: string; smoke?: boolean; styles?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  if (body.action === "rate") {
    const run = readRun(String(body.run || ""));
    if (!run) return NextResponse.json({ error: "no such run" }, { status: 404 });
    let rating: EvalRating | null = null;
    if (body.rating) {
      const faults = (Array.isArray(body.rating.faults) ? body.rating.faults : []).filter((f): f is EvalFault => (EVAL_FAULTS as readonly string[]).includes(f));
      const score = Number(body.rating.score), story = Number(body.rating.story), label = Number(body.rating.label);
      rating = {
        faults,
        score: score >= 1 && score <= 5 ? Math.round(score) : undefined,
        story: story >= 1 && story <= 5 ? Math.round(story) : undefined,
        label: label >= 1 && label <= 5 ? Math.round(label) : undefined,
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
    return ndjson(async (send) => {
      const failed = run.items.filter((i) => i.error);
      send({ type: "start", run: run.id, total: failed.length });
      let done = 0;
      for (const item of failed) {
        const brief = EVAL_BRIEFS.find((b) => b.id === item.briefId);
        const model = await modelFor(item.style, run.model || "wizard");
        if (!brief || !model) continue;
        await paintItem(run, model, brief, item);
        writeRun(run);
        send({ type: "item", done: ++done, total: failed.length, item: { ...item, prompt: undefined } });
      }
      send({ type: "done", run: run.id });
    });
  }

  if (body.action !== "generate") return NextResponse.json({ error: "unknown action" }, { status: 400 });

  const asked = String(body.model || "wizard");
  if (asked !== "wizard" && !evalModel(asked)) return NextResponse.json({ error: "unknown artist" }, { status: 400 });
  const perBrief = Math.min(3, Math.max(1, Number(body.perBrief) || 1));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const run: EvalRun = {
    id: `${stamp}-${String(body.name || "run").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40)}`,
    name: String(body.name || "run").slice(0, 80),
    note: body.note ? String(body.note).slice(0, 600) : undefined,
    createdAt: new Date().toISOString(),
    ...gitInfo(),
    mode: "hybrid", model: asked,
    items: [],
  };
  writeRun(run);

  return ndjson(async (send) => {
    const briefs = body.smoke ? EVAL_BRIEFS.slice(0, 1) : EVAL_BRIEFS;
    /* `styles` narrows a run to some columns */
    const wanted = Array.isArray(body.styles) ? EVAL_STYLES.filter((s) => (body.styles as string[]).includes(s)) : [];
    const styles = body.smoke ? EVAL_STYLES.slice(0, 1) : wanted.length ? wanted : EVAL_STYLES;
    const total = briefs.length * styles.length * perBrief;
    let done = 0;
    send({ type: "start", run: run.id, total });
    /* the three columns of a brief paint together; OpenAI's per-minute
       quota copes with three, the briefs go one after another */
    for (const brief of briefs) {
      for (let n = 1; n <= perBrief; n++) {
        await Promise.all(styles.map(async (style) => {
          const item: EvalItem = { id: `${brief.id}--${style}--${n}`, briefId: brief.id, style, n, file: "", prompt: "", ms: 0 };
          const model = await modelFor(style, asked);
          if (model) await paintItem(run, model, brief, item);
          else { item.error = "no artist for this column"; }
          run.items.push(item);
          writeRun(run);
          send({ type: "item", done: ++done, total, item: { ...item, prompt: undefined } });
        }));
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    send({ type: "done", run: run.id });
  });
}
