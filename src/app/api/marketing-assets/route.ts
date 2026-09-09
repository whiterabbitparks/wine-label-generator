import { generateMarketingAssets, loadMarketingCharters, type MarketingBrief, type AssetEvent } from "@/lib/marketing/engine";

/* PUBLIC customer endpoint (owner 2026-09-06): the marketing-asset run in
   one streamed call — 2 studio product shots (front/back, transparent
   cutout, the customer's own labels as image inputs) + 5 style-directed
   lifestyle images. NDJSON progress keeps the assets page honest during
   the multi-minute ride (sequential: the provider allows ~5 images/min).
   TODO(security): rate-limit before any public deploy. */

export const maxDuration = 600;

/* complete sets cached in-memory by brief signature — revisits are free */
const cache = new Map<string, AssetEvent[]>();

export async function POST(req: Request) {
  let body: {
    front?: string; back?: string | null;
    bottle?: { type?: string; color?: string; closure?: string; finish?: string; closureColour?: string };
    wine?: { colour?: string; name?: string };
    labelMM?: { w?: number; h?: number };
    style?: string; seed?: number;
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
    labelWmm: Math.min(300, Math.max(30, Number(body.labelMM?.w) || 110)),
    labelHmm: Math.min(300, Math.max(30, Number(body.labelMM?.h) || 80)),
    style: ["traditional", "contemporary", "punk"].includes(String(body.style)) ? String(body.style) : "contemporary",
    seed: (Number(body.seed) || 0) >>> 0,
  };

  /* signature: everything that changes the output — label pixels AND the
     current charters (an edited/analyzed board must bust the cache) */
  const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i += 97) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
  const charters = await loadMarketingCharters(brief.style);
  const sig = JSON.stringify({ ...brief, f: hash(front), b: back ? hash(back) : "", cl: hash(charters.life), cs: hash(charters.shots), sn: hash(charters.scenes.join("|")), rl: hash(charters.rules.join("|")) });

  /* diagnostic dry run (owner 2026-09-07): returns the exact lifestyle
     prompt WITHOUT generating — proves whether charters+scenes reach the model */
  if ((body as { dryRun?: boolean }).dryRun) {
    const { buildLifestylePrompt, dealScenarios } = await import("@/lib/marketing/engine");
    const sc = dealScenarios(brief.seed, charters.scenes)[0];
    const prompt = buildLifestylePrompt(brief, sc.text, charters.life, true, sc.fromBoard);
    return new Response(JSON.stringify({ charters: { life: charters.life.length, shots: charters.shots.length, scenes: charters.scenes.length, fromBoard: sc.fromBoard }, promptStart: prompt.slice(0, 900) }), { headers: { "Content-Type": "application/json" } });
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: AssetEvent) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      const cached = cache.get(sig);
      if (cached) {
        for (const e of cached) send(e);
        controller.close();
        return;
      }
      const events: AssetEvent[] = [];
      try {
        await generateMarketingAssets(brief, front, back, (e) => {
          if (e.type !== "progress") events.push(e);
          send(e);
        }, charters);
        /* cache only if at least the front shot succeeded */
        if (events.some((e) => e.type === "shot")) cache.set(sig, events);
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
