import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { getDb } from "@/lib/db";

/* MARKETING REFERENCES (owner 2026-09-06): promotional/lifestyle imagery
   the art director admires — the marketing generator's taste school, one
   board per style. Files live on disk; a thumbnail rides in Mongo for the
   board UI. "Analyze" distils each board into a MARKETING CHARTER (scene
   spirit, light, styling — via the vision model); lifestyle prompts carry
   the charter — the house rule stands: reference images steer through
   derived language, never as image inputs. */

const REFS_DIR = path.join(process.cwd(), "data", "marketing-refs");
const STYLES = ["traditional", "contemporary", "punk"] as const;

interface RefDoc { id: string; name: string; file: string; thumb: string; at: string; style: string }

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  const refs = (await db.collection("marketingRefs").find({}, { projection: { _id: 0 } }).sort({ at: 1 }).toArray()) as unknown as RefDoc[];
  const charters: Record<string, string> = {};
  for (const st of STYLES) {
    const c = (await db.collection("settings").findOne({ _id: `marketing-charter-${st}` } as never)) as { text?: string } | null;
    if (c?.text) charters[st] = c.text;
  }
  return NextResponse.json({ refs, charters });
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { dataUrl?: string; name?: string; analyze?: boolean; style?: string; saveTexts?: boolean; charter?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const db = await getDb();
  const style = (STYLES as readonly string[]).includes(String(body.style)) ? String(body.style) : null;

  /* hand-edited charter is saved verbatim (steering-texts law, 2026-09-03) */
  if (body.saveTexts) {
    if (!style) return NextResponse.json({ error: "style required" }, { status: 400 });
    if (typeof body.charter === "string")
      await db.collection("settings").updateOne(
        { _id: `marketing-charter-${style}` } as never,
        { $set: { text: body.charter.slice(0, 4000), editedAt: new Date().toISOString() } },
        { upsert: true });
    return NextResponse.json({ ok: true });
  }

  /* ---- analyze: one style's board → that style's marketing charter ---- */
  if (body.analyze) {
    if (!style) return NextResponse.json({ error: "style required (traditional|contemporary|punk)" }, { status: 400 });
    const key = process.env.OPENAI_API_KEY;
    if (!key) return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 400 });
    const refs = (await db.collection("marketingRefs").find({ style }).sort({ at: 1 }).limit(16).toArray()) as unknown as RefDoc[];
    if (!refs.length) return NextResponse.json({ error: `upload ${style} marketing references first` }, { status: 400 });
    const images: { type: string; image_url: { url: string; detail: string } }[] = [];
    for (const r of refs) {
      const p = path.join(REFS_DIR, path.basename(r.file));
      if (!fs.existsSync(p)) continue;
      const buf = await sharp(fs.readFileSync(p)).resize(640, 640, { fit: "inside" }).png().toBuffer();
      images.push({ type: "image_url", image_url: { url: `data:image/png;base64,${buf.toString("base64")}`, detail: "high" } });
    }
    /* an edited charter survives re-analysis (steering-is-never-lost law) */
    const prev = (await db.collection("settings").findOne({ _id: `marketing-charter-${style}` } as never)) as { text?: string; editedAt?: string; analyzedAt?: string } | null;
    if (prev?.text && prev.editedAt && (!prev.analyzedAt || prev.editedAt > prev.analyzedAt))
      return NextResponse.json({ ok: true, charter: prev.text, kept: true });
    const vmodel = process.env.OPENAI_VISION_MODEL || "gpt-4o";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: vmodel,
        messages: [
          {
            role: "system",
            content:
              "You are an advertising photography analyst. You receive reference photographs for wine " +
              "promotional imagery. Describe their SHARED WORLD as a compact art-direction guide (max 110 " +
              "words) for future photo shoots: the kinds of settings and props, the light (time of day, " +
              "hard/soft, warm/cool), colour grading and mood, framing and depth-of-field habits, how staged " +
              "or candid the scenes feel, how people appear (if they do). Speak in general terms a " +
              "photographer could apply to NEW scenes. STRICTLY FORBIDDEN: describing any specific bottle, " +
              "label, brand or text visible in the references.",
          },
          { role: "user", content: [{ type: "text", text: "The reference photographs:" }, ...images] },
        ],
      }),
    });
    if (!res.ok) return NextResponse.json({ error: `analysis failed (${res.status})` }, { status: 502 });
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = String(json.choices?.[0]?.message?.content || "").slice(0, 2000);
    if (text.length < 60 || /\b(i'?m sorry|i can'?t|cannot assist|unable to)\b/i.test(text.slice(0, 120)))
      return NextResponse.json({ error: "the analyst refused this board — try again (or different references)" }, { status: 502 });
    await db.collection("settings").updateOne(
      { _id: `marketing-charter-${style}` } as never,
      { $set: { text, analyzedAt: new Date().toISOString(), refCount: images.length } },
      { upsert: true }
    );
    return NextResponse.json({ ok: true, charter: text });
  }

  /* ---- upload (per style) ---- */
  if (!style) return NextResponse.json({ error: "style required (traditional|contemporary|punk)" }, { status: 400 });
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(String(body.dataUrl || ""));
  if (!m) return NextResponse.json({ error: "dataUrl must be a png/jpeg/webp image" }, { status: 400 });
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 12 * 1024 * 1024) return NextResponse.json({ error: "image too large (12 MB max)" }, { status: 400 });
  const count = await db.collection("marketingRefs").countDocuments({ style });
  if (count >= 16) return NextResponse.json({ error: `16 ${style} marketing references max — delete some first` }, { status: 400 });
  fs.mkdirSync(REFS_DIR, { recursive: true });
  const id = randomUUID().slice(0, 8);
  const file = `mkt-${id}.png`;
  fs.writeFileSync(path.join(REFS_DIR, file), await sharp(buf).png().toBuffer());
  const thumb = `data:image/png;base64,${(await sharp(buf).resize(220, 220, { fit: "inside" }).png().toBuffer()).toString("base64")}`;
  const doc: RefDoc = { id, name: String(body.name || file).slice(0, 120), file, thumb, at: new Date().toISOString(), style };
  await db.collection("marketingRefs").insertOne({ ...doc } as never);
  return NextResponse.json({ ok: true, ref: doc });
}

export async function DELETE(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") || "";
  const db = await getDb();
  const doc = (await db.collection("marketingRefs").findOne({ id })) as unknown as RefDoc | null;
  if (doc) {
    const p = path.join(REFS_DIR, path.basename(doc.file));
    if (fs.existsSync(p)) fs.unlinkSync(p);
    await db.collection("marketingRefs").deleteOne({ id });
  }
  return NextResponse.json({ ok: true });
}
