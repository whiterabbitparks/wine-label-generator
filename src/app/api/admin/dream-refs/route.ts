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
const STYLES = ["traditional", "contemporary", "punk", "minimalist"] as const;

interface DreamRefDoc { id: string; name: string; file: string; thumb: string; at: string; style: string }

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  const refs = (await db.collection("dreamRefs").find({}, { projection: { _id: 0 } }).sort({ at: 1 }).toArray()) as unknown as DreamRefDoc[];
  const charters: Record<string, string> = {};
  const cardsByStyle: Record<string, { key: string; arrangement: string }[]> = {};
  for (const st of STYLES) {
    const c = (await db.collection("settings").findOne({ _id: `dream-charter-${st}` } as never)) as { text?: string } | null;
    if (c?.text) charters[st] = c.text;
    const cd = (await db.collection("settings").findOne({ _id: `dream-cards-${st}` } as never)) as { cards?: { key: string; arrangement: string }[] } | null;
    if (cd?.cards?.length) cardsByStyle[st] = cd.cards;
  }
  return NextResponse.json({ refs, charters, cards: cardsByStyle });
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

  /* ---- saveTexts (owner 2026-09-03): the derived texts ARE the steering
     inputs — the art director fine-tunes them by hand. Saved verbatim
     (no sanitiser: these are deliberate edits). Analyze OVERWRITES. ---- */
  const bt = body as { saveTexts?: boolean; style?: string; charter?: string; cards?: { key: string; arrangement: string }[] };
  if (bt.saveTexts) {
    const st = String(bt.style || "");
    if (!(STYLES as readonly string[]).includes(st)) return NextResponse.json({ error: "unknown style" }, { status: 400 });
    const db = await getDb();
    if (typeof bt.charter === "string")
      await db.collection("settings").updateOne(
        { _id: `dream-charter-${st}` } as never,
        { $set: { text: bt.charter.slice(0, 4000), editedAt: new Date().toISOString() } },
        { upsert: true });
    if (Array.isArray(bt.cards))
      await db.collection("settings").updateOne(
        { _id: `dream-cards-${st}` } as never,
        { $set: { cards: bt.cards.slice(0, 24).map((c) => ({ key: String(c.key).slice(0, 80), arrangement: String(c.arrangement).slice(0, 800) })), editedAt: new Date().toISOString() } },
        { upsert: true });
    return NextResponse.json({ ok: true });
  }

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
      images.push({ type: "image_url", image_url: { url: `data:image/png;base64,${buf.toString("base64")}`, detail: "high" } });
    }
    const vmodel = process.env.OPENAI_VISION_MODEL || "gpt-4o";
    // 1) the style charter — shared typographic/colour spirit
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: vmodel,
        messages: [
          {
            role: "system",
            content:
              "You are a graphic design analyst. You receive examples of packaging label design. " +
              "Describe their SHARED VISUAL DESIGN LANGUAGE as a compact style guide (max 140 words): " +
              "typography character, colour and mood, illustration technique, level of ornament. " +
              "Name what makes THIS board DIFFERENT from a generic wine label — avoid stock words like " +
              "'elegant' or 'sophisticated' unless they are genuinely the board's edge. " +
              "ALWAYS include one line 'Grounds:' listing the actual background colours seen across these " +
              "references, stated plainly (e.g. 'Grounds: chalk white, vivid tomato red, deep bottle green') — " +
              "never assume cream or beige unless the references truly show it. " +
              "Do NOT describe layout or composition — that is captured separately per example. " +
              "STRICTLY FORBIDDEN: naming anything depicted — no objects, people, animals, body parts, " +
              "buildings or scenery. Style is HOW it is made, never WHAT is shown; a design in this " +
              "style must be able to depict any subject. " +
              "Phrase it as positive guidance for creating new, original designs in a similar spirit. " +
              "Do not reference the specific products, names or texts shown.",
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

    /* 2) COMPOSITION CARDS (owner 2026-08-25): each reference becomes ONE
       arrangement direction — the layout-side mirror of the image cards.
       Every dream deals one card, so compositions vary AND stay true to
       the board (traditional refs = contained centred emblems, etc.). */
    const cards: { key: string; arrangement: string }[] = [];
    for (const r of refs) {
      const p2 = path.join(DREAM_REFS_DIR, path.basename(r.file));
      if (!fs.existsSync(p2)) continue;
      const buf2 = await sharp(fs.readFileSync(p2)).resize(640, 640, { fit: "inside" }).png().toBuffer();
      const cres = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: vmodel,
          messages: [
            {
              role: "system",
              content:
                "You are a graphic design analyst. Describe ONLY the LAYOUT GEOMETRY of this label design, " +
                "in max 60 words, as instructions for arranging a NEW design the same way. " +
                "START with the illustration: give its area as a fraction of the label (e.g. 'about one quarter') " +
                "and its position. Say it BLEEDS off an edge ONLY if its ink truly touches that edge — " +
                "when in doubt, it is CONTAINED (surrounded by label ground). Most classic labels are contained. " +
                "Then: zones (thirds/halves), alignment axes, scale contrasts (name huge vs small), stacking order, arcs. " +
                "Always call the picture simply 'the illustration'. " +
                "STRICTLY FORBIDDEN: naming anything depicted — no objects, people, animals, body parts, scenery; " +
                "no style or technique words; NEVER mention borders or frames (a separate house law governs those). " +
                "Make the scheme SPECIFIC and distinctive to THIS example.",
            },
            { role: "user", content: [{ type: "image_url", image_url: { url: `data:image/png;base64,${buf2.toString("base64")}`, detail: "high" } }] },
          ],
        }),
      });
      if (!cres.ok) continue;
      const cj = (await cres.json()) as { choices?: { message?: { content?: string } }[] };
      const arr = String(cj.choices?.[0]?.message?.content || "").slice(0, 600);
      /* sanitize: quoted words and year tokens from the reference must never
         reach a dream prompt — a card once said "House Party" and the dream
         could typeset it (owner 2026-08-28) */
      const clean = arr
        .replace(/["'\u201c\u201d\u2018\u2019][^"'\u201c\u201d\u2018\u2019]{1,40}["'\u201c\u201d\u2018\u2019]/g, "a text element")
        .replace(/\b(19|20)\d{2}\b/g, "the vintage")
        .replace(/[^.]*\b(border|frame|cartouche)s?\b[^.]*\.?/gi, "");
      if (clean.length > 30 && !/\b(i'?m sorry|i can'?t|cannot assist)\b/i.test(clean.slice(0, 80))) cards.push({ key: r.id, arrangement: clean });
    }
    await db.collection("settings").updateOne(
      { _id: `dream-cards-${style}` } as never,
      { $set: { cards, analyzedAt: new Date().toISOString() } },
      { upsert: true }
    );
    return NextResponse.json({ ok: true, charter: text, cards: cards.length });
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
