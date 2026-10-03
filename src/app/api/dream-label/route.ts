import sharp from "sharp";
import { paintHybridLabel, relayoutLabel } from "@/lib/label/hybrid";
import { saveLabel, readLabel } from "@/lib/label/store";
import { properCase, CASED_FIELDS } from "@/lib/label/casing";
import { allowPaint, refuse, markPainted, type Visitor } from "@/lib/guard";
import { sendMail } from "@/lib/mail";

/* 2026-09-28 (the OpenAI credit ran out and every label failed without a
   trace): a failed painting is LOGGED, and a painter that is out of credit
   e-mails ALERT_EMAIL — at most once an hour */
let lastQuotaMail = 0;
function reportPaintError(style: string, msg: string) {
  console.error(`[dream-label] ${style}: ${msg.slice(0, 300)}`);
  if (/credit|quota|billing|insufficient/i.test(msg) && process.env.ALERT_EMAIL && Date.now() - lastQuotaMail > 3600_000) {
    lastQuotaMail = Date.now();
    sendMail({ to: process.env.ALERT_EMAIL, subject: "8K Labels — painting stopped: an image service is out of credit", text: `Labels can't be painted until the account is topped up.\n\n${msg.slice(0, 600)}` }).catch(() => { });
  }
}

/* PUBLIC customer endpoint — one label, streamed as NDJSON so the page's
   loader stays honest.
   ROUND 84 (branch POPIKA_Back_To_Vector): the HYBRID engine. The painter
   paints the artwork only; the type is set by code from Google faces
   (src/lib/label/hybrid.ts). The result carries an `id` — the SVG with
   live type waits on disk for the delivery package.
   2026-09-27: a fresh painting passes the GUARD (src/lib/guard.ts) — it
   must belong to a run the visitor started; a re-layout paints nothing. */

export const maxDuration = 300;
const MAX_VISION = 2000;
const DATA_KEYS = [
  "producer", "wine", "appellation", "classification", "grape", "region",
  "country", "special", "vintage", "wineColorName", "wineType", "sweetness",
  "alcohol", "volume",
] as const;

/* 2026-09-23 (owner: "keep the generated label for the session, even if
   the browser reloads or the internet drops"): the page keeps its labels'
   ids, and brings their images back from here. Ids are long and random. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = String(u.searchParams.get("id") || "").replace(/[^a-z0-9-]/gi, "");
  const l = id ? readLabel(id) : null;
  if (!l) return new Response("not found", { status: 404 });
  if (u.searchParams.get("kind") === "preview") {
    const jb = await sharp(l.png).resize(1024).jpeg({ quality: 82 }).toBuffer();
    return new Response(new Uint8Array(jb), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" } });
  }
  return new Response(new Uint8Array(l.png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" } });
}

export async function POST(req: Request) {
  let body: { vision?: string; style?: string; data?: Record<string, string>; sketch?: string | null; width?: number; height?: number; relayout?: string; variants?: number; artist?: string; order?: string; keep?: boolean; prev?: string[]; artists?: string[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), { status: 400 });
  }
  const vision = String(body.vision || "").slice(0, MAX_VISION);
  const data: Record<string, string> = {};
  for (const k of DATA_KEYS) {
    const v = body.data?.[k];
    /* names take their capitals whatever was typed (owner 2026-09-23) */
    if (typeof v === "string") data[k] = CASED_FIELDS.has(k) ? properCase(v.slice(0, 200)) : v.slice(0, 200);
  }
  const style = ["traditional", "contemporary", "punk"].includes(String(body.style)) ? String(body.style) : "traditional";
  const sketch = typeof body.sketch === "string" && body.sketch.startsWith("data:image/") && body.sketch.length < 8_000_000
    ? body.sketch : null;
  const widthMm = Number(body.width) || 110, heightMm = Number(body.height) || 80;
  /* ROUND 112 #4: a visitor who started from an artist's page has every
     column painted in THAT artist's hand, whoever the admin set */
  const artist = /^[a-z0-9-]{1,40}$/.test(String(body.artist || "")) ? String(body.artist) : "";
  /* 2026-09-28: the artists the visitor picked on the details page */
  const pool = (Array.isArray(body.artists) ? body.artists : []).map(String).filter((a) => /^[a-z0-9-]{1,40}$/.test(a)).slice(0, 12);
  /* the run's token — the three columns share it and are cast from it */
  const order = /^[a-z0-9-]{1,40}$/i.test(String(body.order || "")) ? String(body.order) : "";

  /* a re-layout of a stored painting costs nothing; a new painting must
     belong to a run this visitor started */
  const baseLabel = body.relayout ? readLabel(String(body.relayout)) : null;
  let payer: Visitor | null = null;
  if (!baseLabel) {
    const g = await allowPaint(req, order);
    if (!g.ok) return refuse(g);
    payer = g.visitor;
  }
  /* 2026-09-27 (owner): new versions never repeat an artist in a layout
     already shown in this session — the page names its earlier labels */
  const avoidPairs = (Array.isArray(body.prev) ? body.prev : []).slice(0, 60).map((id) => readLabel(String(id).replace(/[^a-z0-9-]/gi, "")))
    .filter(Boolean).map((l) => `${(l!.meta as { artist?: string }).artist || ""}|${(l!.meta as { template?: string }).template || ""}`);

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        /* round 86 #3: a VARIATION keeps the painting and re-sets the type */
        const base = baseLabel;
        send({ type: "progress", stage: base ? "setting" : "painting" });
        const out = base
          ? await relayoutLabel(base, data, [], {}, !!body.keep)
          : await paintHybridLabel({ vision, style, data, widthMm, heightMm, sketch, artistId: artist || undefined, order: order || undefined, avoidPairs, pool });
        const m = base ? base.meta : { style, widthMm, heightMm, fit: out.fit };
        const id = saveLabel({ style: m.style, widthMm: m.widthMm, heightMm: m.heightMm, faces: out.faces, ground: out.ground, svg: out.svg, png: out.png, art: out.art, prompt: out.prompt, layout: out.layout, fit: m.fit, template: (out as { template?: string }).template, hasPaper: (out as { hasPaper?: boolean }).hasPaper, artist: base ? (base.meta as { artist?: string }).artist : (out as { artist?: string }).artist, refSet: (out as { refSet?: string }).refSet, panel: (out as { panel?: boolean }).panel, layout2: (out as { layout2?: import("@/lib/label/store").Layout2Meta }).layout2 });
        /* medium-res JPEG for the page's views — the PNG stays the print source */
        let preview: string | null = null;
        try {
          const jb = await sharp(Buffer.from(out.png.slice(out.png.indexOf(",") + 1), "base64")).resize(1024).jpeg({ quality: 82 }).toBuffer();
          preview = "data:image/jpeg;base64," + jb.toString("base64");
        } catch {}
        /* round 94 #6: the wizard asks for THREE layouts of a fresh painting
           in one call — two contrasting re-layouts ride along as `variants` */
        const variants: { dream: string; preview: string | null; id: string }[] = [];
        const want = Math.min(3, Math.max(1, Number(body.variants) || 1));
        if (!base && want > 1) {
          const stored = { art: Buffer.from(out.art.slice(out.art.indexOf(",") + 1), "base64"), meta: { style, widthMm, heightMm, ground: out.ground, fit: out.fit, template: (out as { template?: string }).template, layout2: (out as { layout2?: import("@/lib/label/store").Layout2Meta }).layout2, artist: (out as { artist?: string }).artist } };
          const avoid = [out.tag];
          for (let i = 1; i < want; i++) {
            try {
              const v = await relayoutLabel(stored, data, avoid, i === 1 ? { big: true } : { flip: true });
              avoid.push(v.tag);
              const vid = saveLabel({ style, widthMm, heightMm, faces: v.faces, ground: v.ground, svg: v.svg, png: v.png, art: v.art, prompt: v.prompt, layout: v.layout, fit: out.fit, template: v.template, artist: (out as { artist?: string }).artist, layout2: (v as { layout2?: import("@/lib/label/store").Layout2Meta }).layout2 });
              let vprev: string | null = null;
              try { vprev = "data:image/jpeg;base64," + (await sharp(Buffer.from(v.png.slice(v.png.indexOf(",") + 1), "base64")).resize(1024).jpeg({ quality: 82 }).toBuffer()).toString("base64"); } catch {}
              variants.push({ dream: v.png, preview: vprev, id: vid });
            } catch { /* a missing variant never fails the label */ }
          }
        }
        /* round 102: the artist's name rides along so the wizard can head the column with it */
        if (!base) await markPainted(payer, order);
        send({ type: "result", dream: out.png, preview, id, variants, artist: base ? (base.meta as { artist?: string }).artist : (out as { artist?: string }).artist });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        reportPaintError(style, msg);
        send({ type: "error", error: msg });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
