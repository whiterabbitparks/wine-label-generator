import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { getDb } from "@/lib/db";

/* DREAM REFERENCES (owner 2026-08-25): whole-label designs the art director
   admires — the dream generator's taste school. Files live on disk; a small
   thumbnail rides in Mongo for the board UI. "Analyze" distils the board
   into a DREAM CHARTER (compact design-spirit text via the vision model);
   the dream prompt carries the charter — following the house rule that
   reference images steer through derived language, never as image inputs. */

const DREAM_REFS_DIR = path.join(process.cwd(), "data", "dream-refs");
const STYLES = ["traditional", "contemporary", "punk"] as const;

interface DreamRefDoc { id: string; name: string; file: string; thumb: string; at: string; style: string }

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  const refs = (await db.collection("dreamRefs").find({}, { projection: { _id: 0 } }).sort({ at: 1 }).toArray()) as unknown as DreamRefDoc[];
  const charters: Record<string, string> = {};
  for (const st of STYLES) {
    const c = (await db.collection("settings").findOne({ _id: `dream-charter-${st}` } as never)) as { text?: string } | null;
    if (c?.text) charters[st] = c.text;
  }
  return NextResponse.json({ refs, charters });
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { dataUrl?: string; name?: string; analyze?: boolean; style?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const db = await getDb();
  const style = (STYLES as readonly string[]).includes(String(body.style)) ? String(body.style) : null;

  /* ---- analyze: one style's board → that style's dream charter ---- */
  if (body.analyze) {
    if (!style) return NextResponse.json({ error: "style required (traditional|contemporary|punk)" }, { status: 400 });
    const key = process.env.OPENAI_API_KEY;
    if (!key) return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 400 });
    const refs = (await db.collection("dreamRefs").find({ style }).sort({ at: -1 }).limit(8).toArray()) as unknown as DreamRefDoc[];
    if (!refs.length) return NextResponse.json({ error: `upload ${style} dream references first` }, { status: 400 });
    const images: { type: string; image_url: { url: string; detail: string } }[] = [];
    for (const r of refs) {
      const p = path.join(DREAM_REFS_DIR, path.basename(r.file));
      if (!fs.existsSync(p)) continue;
      const buf = await sharp(fs.readFileSync(p)).resize(640, 640, { fit: "inside" }).png().toBuffer();
      images.push({ type: "image_url", image_url: { url: `data:image/png;base64,${buf.toString("base64")}`, detail: "low" } });
    }
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are a graphic design analyst. You receive examples of packaging label design. " +
              "Describe their SHARED VISUAL DESIGN LANGUAGE as a compact style guide (max 140 words): " +
              "typography character, composition habits, how type and imagery interact, colour and mood, " +
              "illustration technique, level of ornament. Phrase it as positive guidance for creating new, " +
              "original designs in a similar spirit. Do not reference the specific products, names or texts shown.",
          },
          { role: "user", content: [{ type: "text", text: "The design examples:" }, ...images] },
        ],
      }),
    });
    if (!res.ok) return NextResponse.json({ error: `analysis failed (${res.status})` }, { status: 502 });
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = String(json.choices?.[0]?.message?.content || "").slice(0, 2000);
    // a refusal or an empty answer must never become the charter
    if (text.length < 60 || /\b(i'?m sorry|i can'?t|cannot assist|unable to)\b/i.test(text.slice(0, 120)))
      return NextResponse.json({ error: "the analyst refused this board — try again (or different references)" }, { status: 502 });
    await db.collection("settings").updateOne(
      { _id: `dream-charter-${style}` } as never,
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
  const count = await db.collection("dreamRefs").countDocuments({ style });
  if (count >= 16) return NextResponse.json({ error: `16 ${style} dream references max — delete some first` }, { status: 400 });
  fs.mkdirSync(DREAM_REFS_DIR, { recursive: true });
  const id = randomUUID().slice(0, 8);
  const file = `dream-${id}.png`;
  fs.writeFileSync(path.join(DREAM_REFS_DIR, file), await sharp(buf).png().toBuffer());
  const thumb = `data:image/png;base64,${(await sharp(buf).resize(220, 220, { fit: "inside" }).png().toBuffer()).toString("base64")}`;
  const doc: DreamRefDoc = { id, name: String(body.name || file).slice(0, 120), file, thumb, at: new Date().toISOString(), style };
  await db.collection("dreamRefs").insertOne({ ...doc } as never);
  return NextResponse.json({ ok: true, ref: doc });
}

export async function DELETE(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") || "";
  const db = await getDb();
  const doc = (await db.collection("dreamRefs").findOne({ id })) as unknown as DreamRefDoc | null;
  if (doc) {
    const p = path.join(DREAM_REFS_DIR, path.basename(doc.file));
    if (fs.existsSync(p)) fs.unlinkSync(p);
    await db.collection("dreamRefs").deleteOne({ id });
  }
  return NextResponse.json({ ok: true });
}
