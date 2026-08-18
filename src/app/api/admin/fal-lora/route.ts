import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { listRefs, REFS_DIR } from "@/lib/admin/style-refs";
import { getFalLoras, saveFalLora, LORA_TRIGGER } from "@/lib/image-provider/flux";

/* Train a REAL FLUX LoRA from one style's reference board (owner GO,
   2026-08-18): zip up to 10 board images → fal.ai fast trainer (queue API,
   ~2-4 minutes, ~$2) → store the resulting LoRA weights URL per style.
   Generations with the flux provider then carry that LoRA — the boards'
   technique becomes native model behaviour instead of a description. */

export const maxDuration = 300;
const QUEUE_URL = "https://queue.fal.run/fal-ai/flux-lora-fast-training";
const STEPS = 1000;

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ loras: await getFalLoras(), keySet: !!process.env.FAL_KEY });
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const key = process.env.FAL_KEY;
  if (!key) return NextResponse.json({ error: "FAL_KEY is not set in .env.local" }, { status: 400 });
  let body: { style?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const style = String(body.style || "");
  const refs = (await listRefs(style)).slice(-10);
  if (!refs.length) return NextResponse.json({ error: "no reference images on this board" }, { status: 400 });

  // zip the board images (fal file inputs accept data URIs)
  const zip = new JSZip();
  let count = 0;
  for (const r of refs) {
    const p = path.join(REFS_DIR, path.basename(r.file));
    if (fs.existsSync(p)) { zip.file(r.file, fs.readFileSync(p)); count++; }
  }
  if (!count) return NextResponse.json({ error: "reference files missing on disk" }, { status: 400 });
  const zipBuf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

  // fal rejects multi-MB data URIs ("URL too long", live-observed) — upload
  // the zip to fal storage and hand the trainer a real URL instead
  const init = await fetch("https://rest.fal.ai/storage/upload/initiate", {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ file_name: `${style}-board.zip`, content_type: "application/zip" }),
  });
  const initBody = (await init.json().catch(() => ({}))) as { file_url?: string; upload_url?: string };
  if (!init.ok || !initBody.upload_url || !initBody.file_url)
    return NextResponse.json({ error: `fal storage initiate failed (${init.status})` }, { status: 502 });
  const put = await fetch(initBody.upload_url, {
    method: "PUT",
    headers: { "Content-Type": "application/zip" },
    body: new Uint8Array(zipBuf),
  });
  if (!put.ok) return NextResponse.json({ error: `fal storage upload failed (${put.status})` }, { status: 502 });
  const zipUrl = initBody.file_url;

  // submit to the training queue
  // resume a pending run first (a prior call may have timed out or failed to
  // parse — the training itself is not lost as long as we kept the urls)
  const db = await (await import("@/lib/db")).getDb();
  const pendingDoc = (await db.collection("settings").findOne({ _id: "fal-lora-pending" } as never)) as
    | ({ [k: string]: { status_url: string; response_url: string; request_id: string } } & Record<string, unknown>)
    | null;
  let sub = pendingDoc?.[style] as { status_url?: string; response_url?: string; request_id?: string } | undefined;

  if (!sub?.status_url) {
    const submit = await fetch(QUEUE_URL, {
      method: "POST",
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        images_data_url: zipUrl,
        trigger_word: LORA_TRIGGER,
        steps: STEPS,
        create_masks: false,
      }),
    });
    sub = (await submit.json().catch(() => ({}))) as {
      status_url?: string; response_url?: string; request_id?: string; detail?: unknown;
    };
    if (!submit.ok || !sub.status_url || !sub.response_url)
      return NextResponse.json(
        { error: `fal submit failed (${submit.status}): ${JSON.stringify((sub as { detail?: unknown }).detail || sub).slice(0, 200)}` },
        { status: 502 }
      );
    // persist BEFORE polling — a crash/timeout must never lose a paid run
    await db.collection("settings").updateOne(
      { _id: "fal-lora-pending" } as never,
      { $set: { [style]: { status_url: sub.status_url, response_url: sub.response_url, request_id: sub.request_id } } },
      { upsert: true }
    );
  }

  // poll until trained (bounded well inside maxDuration); the pending doc
  // survives timeouts — pressing the button again resumes, never retrains
  const deadline = Date.now() + 260_000;
  for (;;) {
    if (Date.now() > deadline)
      return NextResponse.json({ error: "training still running — press the button again to resume checking (nothing is lost)", requestId: sub.request_id }, { status: 504 });
    await new Promise((r) => setTimeout(r, 5000));
    const st = (await fetch(sub.status_url!, { headers: { Authorization: `Key ${key}` } })
      .then((r) => r.json())
      .catch(() => ({}))) as { status?: string };
    if (st.status === "COMPLETED") break;
    if (st.status === "FAILED" || st.status === "ERROR") {
      await db.collection("settings").updateOne({ _id: "fal-lora-pending" } as never, { $unset: { [style]: "" } });
      return NextResponse.json({ error: "fal training failed", status: st.status }, { status: 502 });
    }
  }
  const raw = await fetch(sub.response_url!, { headers: { Authorization: `Key ${key}` } })
    .then((r) => r.text())
    .catch(() => "");
  let result: { diffusers_lora_file?: { url?: string }; response?: { diffusers_lora_file?: { url?: string } } } = {};
  try { result = JSON.parse(raw); } catch {}
  const url = result.diffusers_lora_file?.url || result.response?.diffusers_lora_file?.url;
  if (!url) {
    // keep the pending doc so the run can be salvaged; surface the raw body
    return NextResponse.json({ error: "training finished but no LoRA file parsed — raw kept for diagnosis", raw: raw.slice(0, 400) }, { status: 502 });
  }
  await db.collection("settings").updateOne({ _id: "fal-lora-pending" } as never, { $unset: { [style]: "" } });
  const entry = { url, steps: STEPS, refCount: count, trainedAt: new Date().toISOString() };
  await saveFalLora(style, entry);
  return NextResponse.json({ ok: true, style, lora: entry });
}
