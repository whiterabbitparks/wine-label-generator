/* CLEAN AN ARTIST'S WORKS OF LETTERS (owner, 2026-09-29, adding the
   public-domain painters: "remove signatures and texts from the images —
   do not let them leak into the results"). A model trained on signed or
   inscribed works paints signatures and letters into labels. Every work is
   READ by a vision model for any signature, monogram, inscription, title,
   printed or painted letters, and any visible frame; a mark near an edge is
   CROPPED away, a mark inside the picture is ERASED (fal Bria eraser, the
   background painted back), a frame is cropped off. Each cleaned work is
   read again; what still shows is reported. The originals are kept in
   works-raw/.     npx tsx tools/clean-works.mts <artist-id> [work-24.jpg …]  */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
const { falUpload } = await import("@/lib/image-provider/flux");

const id = process.argv[2];
const dir = path.join("data", "artists", id, "works"), raw = path.join("data", "artists", id, "works-raw");
fs.mkdirSync(raw, { recursive: true });
type Found = { marks: { kind: string; box: [number, number, number, number] }[]; frame: { top: number; bottom: number; left: number; right: number } };

async function read(buf: Buffer): Promise<Found> {
  const small = await sharp(buf).resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 88 }).toBuffer();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o", response_format: { type: "json_object" },
      messages: [
        { role: "system", content: 'You inspect a reproduction of a painting. Find EVERY mark made of letters or signs: signatures, initials, monograms, dates, inscriptions, titles, words on signboards or menus, captions, stamps, museum labels, watermarks, and any visible picture frame, mount or border that is not part of the painting. Reply as JSON {"marks":[{"kind":"signature|text|stamp|watermark","box":[x0,y0,x1,y1]}],"frame":{"top":0,"bottom":0,"left":0,"right":0}} — boxes as fractions 0..1 of the width and height (x0,y0 top-left), generous rather than tight; frame = the fraction of each side taken by a frame or mount (0 if none). Empty list if there is nothing.' },
        { role: "user", content: [{ type: "image_url", image_url: { url: `data:image/jpeg;base64,${small.toString("base64")}`, detail: "high" } }] },
      ],
    }),
  });
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const v = JSON.parse(j.choices?.[0]?.message?.content || "{}") as Partial<Found>;
  return { marks: (v.marks || []).filter((m) => Array.isArray(m.box) && m.box.length === 4), frame: { top: 0, bottom: 0, left: 0, right: 0, ...(v.frame || {}) } };
}

async function erase(buf: Buffer, boxes: [number, number, number, number][]): Promise<Buffer> {
  const m = await sharp(buf).metadata(); const W = m.width!, H = m.height!;
  const rects = boxes.map(([x0, y0, x1, y1]) => `<rect x="${Math.max(0, x0 - 0.02) * W}" y="${Math.max(0, y0 - 0.02) * H}" width="${(Math.min(1, x1 + 0.02) - Math.max(0, x0 - 0.02)) * W}" height="${(Math.min(1, y1 + 0.02) - Math.max(0, y0 - 0.02)) * H}" fill="white"/>`).join("");
  const mask = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="black"/>${rects}</svg>`)).png().toBuffer();
  const [iu, mu] = await Promise.all([falUpload(await sharp(buf).png().toBuffer(), "w.png", "image/png"), falUpload(mask, "m.png", "image/png")]);
  const r = await fetch("https://fal.run/fal-ai/bria/eraser", { method: "POST", headers: { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ image_url: iu, mask_url: mu, mask_type: "manual" }) });
  const j = (await r.json()) as { image?: { url?: string } };
  if (!r.ok || !j.image?.url) throw new Error(`eraser ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return Buffer.from(await (await fetch(j.image.url)).arrayBuffer());
}

async function cleanOne(f: string) {
  const src = path.join(raw, f);
  if (!fs.existsSync(src)) fs.copyFileSync(path.join(dir, f), src);
  let buf = fs.readFileSync(src);
  const note: string[] = [];
  for (let pass = 0; pass < 3; pass++) {
    const found = await read(buf);
    const fr = found.frame;
    const m = await sharp(buf).metadata(); const W = m.width!, H = m.height!;
    /* a frame or mount: cropped off (a little past it) */
    let crop = { l: fr.left > 0.005 ? fr.left + 0.01 : 0, t: fr.top > 0.005 ? fr.top + 0.01 : 0, r: fr.right > 0.005 ? fr.right + 0.01 : 0, b: fr.bottom > 0.005 ? fr.bottom + 0.01 : 0 };
    const inner: [number, number, number, number][] = [];
    for (const mk of found.marks) {
      const [x0, y0, x1, y1] = mk.box;
      /* near an edge and small enough → crop that side past it */
      const opts = [["b", 1 - y0], ["t", y1], ["r", 1 - x0], ["l", x1]] as const;
      const best = opts.reduce((a, b) => (b[1] < a[1] ? b : a));
      if (best[1] <= 0.16) crop = { ...crop, [best[0]]: Math.max(crop[best[0] as "l"], best[1] + 0.015) };
      else inner.push(mk.box);
    }
    if (!found.marks.length && !(crop.l || crop.t || crop.r || crop.b)) { note.push(pass ? "clean" : "nothing found"); break; }
    if (inner.length) { buf = await erase(buf, inner); note.push(`erased ${inner.length}`); }
    if (crop.l || crop.t || crop.r || crop.b) {
      const left = Math.round(crop.l * W), top = Math.round(crop.t * H);
      buf = await sharp(buf).extract({ left, top, width: Math.max(64, Math.round(W * (1 - crop.l - crop.r))), height: Math.max(64, Math.round(H * (1 - crop.t - crop.b))) }).toBuffer();
      note.push(`cropped ${Object.entries(crop).filter(([, v]) => v).map(([k, v]) => `${k}${Math.round(v * 100)}%`).join(" ")}`);
    }
    if (pass === 2) { const again = await read(buf); if (again.marks.length) note.push(`STILL ${again.marks.map((x) => x.kind).join(",")}`); }
  }
  await sharp(buf).flatten({ background: "#fff" }).jpeg({ quality: 92 }).toFile(path.join(dir, f));
  console.log(`${id} ${f}: ${note.join(" → ")}`);
}

/* named works only (new ones added later), else every work */
const only = process.argv.slice(3);
const files = only.length ? only : fs.readdirSync(fs.existsSync(raw) && fs.readdirSync(raw).length ? raw : dir).filter((f) => /\.jpe?g$/i.test(f)).sort();
for (let i = 0; i < files.length; i += 4) await Promise.all(files.slice(i, i + 4).map((f) => cleanOne(f).catch((e) => console.log(`${id} ${f}: FAILED ${String(e).slice(0, 160)}`))));
process.exit(0);
