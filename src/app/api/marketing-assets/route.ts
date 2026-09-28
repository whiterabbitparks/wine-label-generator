import { generateMarketingAssets, loadMarketingPool, labelWords, labelPalette, type MarketingBrief, type AssetEvent } from "@/lib/marketing/engine";
import { readLabel } from "@/lib/label/store";
import { composeBackLabel, MARKETS, type BackLabelData } from "@/lib/back-label";
import { properFields } from "@/lib/label/casing";
import { allowMarketing, refuse } from "@/lib/guard";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/* PUBLIC customer endpoint (owner 2026-09-06): the marketing-asset run in
   one streamed call — 2 studio product shots (front/back, transparent
   cutout, the customer's own labels as image inputs) + 5 style-directed
   lifestyle images. NDJSON progress keeps the assets page honest during
   the multi-minute ride (sequential: the provider allows ~5 images/min).
   TODO(security): rate-limit before any public deploy. */

export const maxDuration = 600;

/* complete sets cached in-memory by brief signature — revisits are free */
const cache = new Map<string, AssetEvent[]>();
/* 2026-09-28 (owner: "Continue" must bring the visitor back to the
   marketing page with their images): every finished set is also SAVED on
   disk under a private key (a hash of its signature) — it survives server
   restarts, a revisit replays it for free (no guard, no cost), and the
   page keeps the key in the visitor's saved order to load it back */
const SETS = path.join(process.cwd(), "data", "marketing-sets");
const keyOf = (sig: string) => crypto.createHash("sha1").update(sig).digest("hex").slice(0, 24);
function readSet(key: string): AssetEvent[] | null {
  if (!/^[a-f0-9]{24}$/.test(key)) return null;
  try { return JSON.parse(fs.readFileSync(path.join(SETS, `${key}.json`), "utf8")) as AssetEvent[]; } catch { return null; }
}
function writeSet(key: string, events: AssetEvent[]) {
  try { fs.mkdirSync(SETS, { recursive: true }); fs.writeFileSync(path.join(SETS, `${key}.json`), JSON.stringify(events)); } catch { /* the memory copy still serves */ }
}

/* a saved set, read back by its key */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") || "";
  const events = readSet(key);
  if (!events) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
  return new Response(JSON.stringify({ events }), { headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=3600" } });
}

export async function POST(req: Request) {
  let body: {
    front?: string; back?: string | null; frontId?: string; backSpec?: unknown;
    bottle?: { type?: string; color?: string; closure?: string; finish?: string; closureColour?: string };
    wine?: { colour?: string; name?: string; grape?: string };
    labelMM?: { w?: number; h?: number };
    backLabelMM?: { w?: number; h?: number };
    style?: string; seed?: number;
    lifeOnly?: boolean; batch?: number;
    /* 2026-09-23: a More Variations batch sends the front shot it has,
       so its scenes copy the same photographed bottle */
    frontShot?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), { status: 400 });
  }
  const front = typeof body.front === "string" && body.front.startsWith("data:image/") ? body.front : null;
  if (!front) return new Response(JSON.stringify({ error: "front label image required" }), { status: 400 });
  const back = typeof body.back === "string" && body.back.startsWith("data:image/") ? body.back : null;

  const brief: MarketingBrief = {
    bottleType: String(body.bottle?.type || "Bordeaux").slice(0, 40),
    glassColor: String(body.bottle?.color || "Olive Green").slice(0, 40),
    closure: String(body.bottle?.closure || "Cork").slice(0, 40),
    finish: String(body.bottle?.finish || "Matte").slice(0, 40),
    closureColour: String(body.bottle?.closureColour || "deep red").slice(0, 60),
    wineColour: String(body.wine?.colour || "Red").slice(0, 40),
    wine: String(body.wine?.name || "Wine").slice(0, 120),
    grape: String(body.wine?.grape || "").slice(0, 80),
    labelWmm: Math.min(300, Math.max(30, Number(body.labelMM?.w) || 110)),
    labelHmm: Math.min(300, Math.max(30, Number(body.labelMM?.h) || 80)),
    /* round 51 #9: the back shot states the BACK label's true size */
    backWmm: body.backLabelMM?.w ? Math.min(300, Math.max(30, Number(body.backLabelMM.w))) : undefined,
    backHmm: body.backLabelMM?.h ? Math.min(300, Math.max(30, Number(body.backLabelMM.h))) : undefined,
    style: ["traditional", "contemporary", "punk"].includes(String(body.style)) ? String(body.style) : "contemporary",
    seed: (Number(body.seed) || 0) >>> 0,
  };
  /* 2026-09-25 (owner: "the label as close to the real one as possible"):
     the label's own words ride the ask, and the real label leads the
     scenes' references */
  const fid = String(body.frontId || "").replace(/[^a-z0-9-]/gi, "");
  const saved = fid ? readLabel(fid) : null;
  if (saved?.layout?.lines?.length) { brief.frontText = labelWords(saved.layout.lines as never); brief.labelFirst = true; }
  /* the label's colours set the scenes' gamut (owner, 2026-09-26) */
  if (front) brief.palette = await labelPalette(front);
  /* the back label is set again from its own data, and its lines read off */
  const bs = body.backSpec as { data?: BackLabelData; markets?: string[]; heightMM?: number } | undefined;
  if (back && bs?.data) {
    try {
      const out = await composeBackLabel(properFields(bs.data), { heightMM: Math.min(200, Math.max(40, Number(bs.heightMM) || 80)), markets: (bs.markets || []).filter((m) => m in MARKETS), bleedMM: 0 });
      const dec = (t: string) => t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      brief.backText = [...out.svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((m) => dec(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()).filter(Boolean);
    } catch { /* the back shot simply goes without its words */ }
  }

  /* signature: everything that changes the output — label pixels AND the
     current charters (an edited/analyzed board must bust the cache) */
  const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i += 97) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
  /* 2026-09-23: one pool from all three boards (the column's style no
     longer directs the scenes) */
  const charters = await loadMarketingPool();
  const lifeOnly = !!body.lifeOnly;
  const batch = Math.max(0, Math.min(20, Number(body.batch) || 0));
  const sig = JSON.stringify({ ...brief, lo: lifeOnly, bt: batch, fs: body.frontShot ? hash(String(body.frontShot)) : "", f: hash(front), b: back ? hash(back) : "", cs: hash(charters.shots), sn: hash(charters.scenes.map((x) => x.text + x.charter).join("|")), rl: hash(charters.rules.join("|")) });

  /* diagnostic dry run (owner 2026-09-07): returns the exact lifestyle
     prompt WITHOUT generating — proves whether charters+scenes reach the model */
  if ((body as { dryRun?: boolean }).dryRun) {
    const { buildLifestylePrompt, dealScenarios, grapeFamily } = await import("@/lib/marketing/engine");
    const sc = dealScenarios(brief.seed, charters.scenes, 5, !grapeFamily(brief.wineColour))[0];
    const prompt = buildLifestylePrompt(brief, sc.text, sc.charter, true, sc.fromBoard);
    return new Response(JSON.stringify({ charters: { shots: charters.shots.length, scenes: charters.scenes.length, fromBoard: sc.fromBoard }, promptStart: prompt.slice(0, 900) }), { headers: { "Content-Type": "application/json" } });
  }

  const enc = new TextEncoder();
  const key = keyOf(sig);
  const known = cache.get(sig) || readSet(key);
  /* 2026-09-27: the guard — a visitor who has made labels, a few runs a
     day. A set already made replays free, so only a NEW run is guarded. */
  if (!known) {
    const g = await allowMarketing(req);
    if (!g.ok) return refuse(g);
  }
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: AssetEvent) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      if (known) {
        cache.set(sig, known);
        for (const e of known) send(e);
        send({ type: "saved", key } as never);
        controller.close();
        return;
      }
      const events: AssetEvent[] = [];
      try {
        await generateMarketingAssets(brief, front, back, (e) => {
          if (e.type !== "progress") events.push(e);
          send(e);
        }, charters, { lifeOnly, batch, frontShot: typeof body.frontShot === "string" && body.frontShot.startsWith("data:image/") && body.frontShot.length < 12_000_000 ? body.frontShot : null });
        /* cache only if at least one image succeeded */
        if (events.some((e) => e.type === "shot" || e.type === "life")) {
          cache.set(sig, events);
          writeSet(key, events);
          send({ type: "saved", key } as never);
        }
      } catch (e) {
        send({ type: "error", error: e instanceof Error ? e.message : String(e) });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
