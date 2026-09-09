import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { getDb } from "@/lib/db";
import { analystChat, parseAnalystJSON, pool } from "@/lib/admin/vision";
import { extractPaletteFromBuffer } from "@/lib/admin/card-palette";

/* MARKETING REFERENCES (owner 2026-09-06): promotional/lifestyle imagery
   the art director admires — the marketing generator's taste school, one
   board per style. Files live on disk; a thumbnail rides in Mongo for the
   board UI. "Analyze" distils each board into a MARKETING CHARTER (scene
   spirit, light, styling — via the vision model); lifestyle prompts carry
   the charter — the house rule stands: reference images steer through
   derived language, never as image inputs. */

const REFS_DIR = path.join(process.cwd(), "data", "marketing-refs");
/* per-style LIFESTYLE boards + one global "shots" board (owner 2026-09-07):
   studio product-shot references are one photographic language, not a
   style matter — their charter steers the front/back bottle shots */
const STYLES = ["traditional", "contemporary", "punk", "shots"] as const;

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

  /* ---- analyze: one style's board → that style's marketing charter ----
     REFS-QUALITY REWORK (owner 2026-09-08): the old way pushed all 16
     images into ONE call and asked for ~110 words — brutal compression
     that averaged the board into stock generalities. Now:
     1. EACH image is analyzed separately with a structured questionnaire
       (scene, setting, action, people, props, light, palette, composition,
       texture, era — concrete answers, not prose);
     2. a synthesis pass merges the filled forms into the charter;
     3. the board's exact ink colours are extracted BY CODE (pixel
       clustering, never hallucinated) and appended as hex values;
     4. lifestyle SCENES come straight from each image's scene field. */
  if (body.analyze) {
    if (!style) return NextResponse.json({ error: "style required (traditional|contemporary|punk)" }, { status: 400 });
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 400 });
    const refs = (await db.collection("marketingRefs").find({ style }).sort({ at: 1 }).limit(16).toArray()) as unknown as RefDoc[];
    if (!refs.length) return NextResponse.json({ error: `upload ${style} marketing references first` }, { status: 400 });
    const images: string[] = [];
    const buffers: Buffer[] = [];
    for (const r of refs) {
      const p = path.join(REFS_DIR, path.basename(r.file));
      if (!fs.existsSync(p)) continue;
      const raw = fs.readFileSync(p);
      buffers.push(raw);
      const buf = await sharp(raw).resize(640, 640, { fit: "inside" }).png().toBuffer();
      images.push(`data:image/png;base64,${buf.toString("base64")}`);
    }

    const isShots = style === "shots";
    const perImageSystem = isShots
      ? "You are a product-photography analyst studying ONE studio wine-bottle shot. Answer a fixed questionnaire about its TECHNIQUE " +
        "(so a photographer could shoot ANY bottle the same way). Return strict JSON: " +
        '{"lighting_setup": soft/hard, sources, direction, "highlights": shape and placement of highlights along the glass, ' +
        '"glass_rendering": how reflections and transparency read, "grading": colour fidelity and grading, ' +
        '"sharpness": sharpness and retouching level, "camera": camera height and perspective}. ' +
        "Concrete answers, 5-20 words each. NEVER describe the bottle's shape, label, brand, text, or any background/surface."
      : "You are an advertising-photography analyst studying ONE wine promotional photo. Answer a fixed questionnaire with CONCRETE, " +
        "SPECIFIC observations (stock phrases like 'soft warm lighting', 'rustic', 'authentic', 'inviting' are BANNED). Return strict JSON: " +
        '{"scene": one 25-45 word staging instruction — location/setting, what is HAPPENING (story/action), who appears and how framed, key props and surfaces, light and time, composition — written so the scene can be re-staged with a different wine bottle, ' +
        '"setting": the actual location in 3-8 words, "action": what happens in 3-10 words, ' +
        '"people": how people appear (or "none"), "props": up to 5 distinctive props/surfaces, ' +
        '"light": the light\'s true character — source, direction, temperature, time (flash? neon? dusk? fog? overcast? colour casts?), ' +
        '"palette": the 3-5 dominant colours NAMED specifically, "composition": centred/cropped/tilted/negative-space habits, ' +
        '"texture": film/grain/texture qualities, "era": era or subculture feeling}. ' +
        "NEVER describe or name the specific bottle, its label, brand, any text, or faces.";

    type Form = Record<string, unknown>;
    const forms = (await pool(images, 4, async (img) => {
      try {
        const txt = await analystChat(perImageSystem, [
          { type: "text", text: "The photograph:" },
          { type: "image_url", image_url: { url: img, detail: "high" } },
        ], true);
        return parseAnalystJSON<Form>(txt);
      } catch { return null; }
    })).filter(Boolean) as Form[];
    if (!forms.length) return NextResponse.json({ error: "per-image analysis failed — try again" }, { status: 502 });

    /* lifestyle scenes straight from the per-image forms (round 31 law:
       scenes re-derive on every analyze, no edit lock) */
    let scenes: string[] = [];
    if (!isShots) {
      scenes = forms.map((f) => String(f.scene || "").trim()).filter((s) => s.length > 30).slice(0, 16);
      if (scenes.length)
        await db.collection("settings").updateOne(
          { _id: `marketing-scenes-${style}` } as never,
          { $set: { list: scenes, analyzedAt: new Date().toISOString(), refCount: forms.length } },
          { upsert: true });
    }

    /* the board's exact colours, by code — never hallucinated */
    let boardPalette: string[] = [];
    try {
      const counts = new Map<string, number>();
      for (const b of buffers) {
        for (const hex of await extractPaletteFromBuffer(b))
          counts.set(hex, (counts.get(hex) || 0) + 1);
      }
      boardPalette = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([h]) => h);
    } catch { /* palette is a bonus, never a blocker */ }

    /* an edited charter survives re-analysis (steering-is-never-lost law) */
    const prev = (await db.collection("settings").findOne({ _id: `marketing-charter-${style}` } as never)) as { text?: string; editedAt?: string; analyzedAt?: string } | null;
    if (prev?.text && prev.editedAt && (!prev.analyzedAt || prev.editedAt > prev.analyzedAt))
      return NextResponse.json({ ok: true, charter: prev.text, kept: true, scenes: scenes.length });

    const synthSystem = isShots
      ? "You are a photography art director. You receive per-image technique questionnaires from a board of studio bottle-shot references. " +
        "Merge them into ONE art-direction guide (max 130 words) a photographer follows for future studio shots: lighting setup, highlight " +
        "behaviour on glass, reflection/transparency rendering, grading, sharpness, camera height. Where images disagree, state the dominant " +
        "practice. Concrete and imperative — no filler."
      : "You are an advertising art director. You receive per-image questionnaires from ONE brand's photo reference board. Merge them into a " +
        "commanding art-direction charter (max 150 words) for NEW promotional scenes: name the recurring settings, the light's true character, " +
        "the actual palette, distinctive props/surfaces, composition habits, texture/grain, era or subculture feeling, and how people appear. " +
        "If the board splits into distinct directions, name each direction in one line. STOCK VOCABULARY BANNED ('soft warm lighting', " +
        "'earthy tones', 'rustic', 'authentic', 'inviting'). Concrete and imperative — every sentence must be actionable.";
    let text = "";
    try {
      text = (await analystChat(synthSystem, [
        { type: "text", text: "The per-image questionnaires (JSON):\n" + JSON.stringify(forms).slice(0, 24000) },
      ])).slice(0, 2000);
    } catch { /* fall through to the error below */ }
    if (text.length < 60 || /\b(i'?m sorry|i can'?t|cannot assist|unable to)\b/i.test(text.slice(0, 120)))
      return NextResponse.json({ error: "the analyst refused this board — try again (or different references)" }, { status: 502 });
    if (boardPalette.length) text += `\nExact board palette (measured): ${boardPalette.join(" ")}.`;
    await db.collection("settings").updateOne(
      { _id: `marketing-charter-${style}` } as never,
      { $set: { text, analyzedAt: new Date().toISOString(), refCount: forms.length } },
      { upsert: true }
    );
    return NextResponse.json({ ok: true, charter: text, scenes: scenes.length });
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
