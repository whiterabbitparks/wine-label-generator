import "server-only";

/* ANALYST BRAIN (owner 2026-09-08, refs-quality round): one shared vision
   client for every reference analyzer (marketing boards, dream boards,
   style cards). Three upgrades live here:
   - newer default model (gpt-5.1) with automatic fallback to gpt-4o when
     the account doesn't have it — so an env-less setup never breaks;
   - optional Claude analyst: ANALYST_PROVIDER=claude + ANTHROPIC_API_KEY
     routes the same calls to Anthropic (strong at nuanced art language);
   - a tiny concurrency pool for the per-image analysis fan-out. */

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail?: string } };

export function analystModel(): string {
  return process.env.OPENAI_VISION_MODEL || "gpt-5.1";
}

async function openaiChat(model: string, system: string, parts: Part[], json: boolean): Promise<{ ok: boolean; status: number; text: string }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, status: 0, text: "OPENAI_API_KEY not set" };
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      ...(json ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: parts },
      ],
    }),
  });
  if (!res.ok) return { ok: false, status: res.status, text: await res.text().catch(() => "") };
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return { ok: true, status: 200, text: String(j.choices?.[0]?.message?.content || "") };
}

async function claudeChat(system: string, parts: Part[]): Promise<{ ok: boolean; status: number; text: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, status: 0, text: "ANTHROPIC_API_KEY not set" };
  const content = parts.map((p) =>
    p.type === "text"
      ? { type: "text", text: p.text }
      : {
        type: "image",
        source: {
          type: "base64",
          media_type: (/^data:(image\/\w+);/.exec(p.image_url.url)?.[1] || "image/png"),
          data: p.image_url.url.split(",")[1] || "",
        },
      });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.ANALYST_CLAUDE_MODEL || "claude-sonnet-5",
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) return { ok: false, status: res.status, text: await res.text().catch(() => "") };
  const j = (await res.json()) as { content?: { type: string; text?: string }[] };
  return { ok: true, status: 200, text: (j.content || []).map((c) => c.text || "").join("") };
}

/** One analyst call. json=true demands a single JSON object back (parsed by caller). */
export async function analystChat(system: string, parts: Part[], json = false): Promise<string> {
  if (process.env.ANALYST_PROVIDER === "claude") {
    const r = await claudeChat(json ? system + " Respond ONLY with the JSON object, nothing else." : system, parts);
    if (r.ok) return r.text;
    /* Claude missing/unfunded → fall through to OpenAI */
  }
  const first = await openaiChat(analystModel(), system, parts, json);
  if (first.ok) return first.text;
  /* unknown model on this account (400/404) → the proven fallback */
  if (first.status === 400 || first.status === 404) {
    const second = await openaiChat("gpt-4o", system, parts, json);
    if (second.ok) return second.text;
    throw new Error(`analysis failed (${second.status})`);
  }
  throw new Error(`analysis failed (${first.status})`);
}

/** Parse the analyst's JSON answer (tolerates ```json fences). */
export function parseAnalystJSON<T>(text: string): T | null {
  try {
    const clean = text.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
    const start = clean.indexOf("{");
    if (start < 0) return null;
    return JSON.parse(clean.slice(start)) as T;
  } catch { return null; }
}

/** Small concurrency pool for per-image fan-outs. */
export async function pool<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
