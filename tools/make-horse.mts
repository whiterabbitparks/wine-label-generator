/* THE TASTE PAGE'S HORSE (owner, 2026-09-28: "for every new artist, paint
   the horse the same way, without my asking, and add them to the grid").
   The horse of round 3: a spot illustration — the horse the centre of a
   small scene of its own (a tree, grass and flowers, birds, a fence or a
   hill) floating on white paper — painted the site's way (gpt sketch →
   the artist's depth-locked repaint), hand at 0.8, the paper cleaned to
   white. Writes public/newui/artists/<id>/horse.jpg (720×480), which the
   taste page shows as soon as it exists; candidates stay in
   ~/Desktop/8K-horses/<id>/ to swap by hand.

     npx tsx tools/make-horse.mts <artist-id> [variant 1|2]            */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
const { evalModel, buildArtworkPrompt, paintStory, repaintInHand, asKind } = await import("@/lib/eval/models");
const { cleanPaper } = await import("@/lib/typeset/palette");

const id = process.argv[2];
const variant = Number(process.argv[3] || 1);
const model = id ? evalModel(`artist:${id}`) : null;
if (!model?.lora) { console.error(`usage: npx tsx tools/make-horse.mts <artist-id> — "${id}" has no trained model`); process.exit(1); }
const IDEAS = [
  "A horse standing calmly in a small meadow — a little tree beside it, tufts of grass and wildflowers at its hooves, a few birds in the sky above — the whole horse the clear centre of the picture; the little scene floats on plain white paper.",
  "A horse walking gently along a short stretch of country path — a low wooden fence and a soft hill behind it, a few flowers by the path and a bird — the whole horse the clear centre of the picture; the little scene floats on plain white paper.",
];
const data = { producer: "", wine: "", region: "", country: "", wineColorName: "", wineType: "", sweetness: "", alcohol: "", volume: "" };
const brief = { id: "horse", title: "horse", vision: IDEAS[(variant - 1) % IDEAS.length], data, width: 120, height: 90 };
const ap = asKind(await buildArtworkPrompt(brief as never, model.artist, false), "spot");
ap.aspect = "landscape";
const story = await paintStory(model, ap);
const art = await repaintInHand(model, story, ap, 0.8);
const cl = await cleanPaper(art, "#ffffff");
const png = Buffer.from(cl.art.slice(cl.art.indexOf(",") + 1), "base64");
const keep = path.join(process.env.HOME || ".", "Desktop", "8K-horses", id);
fs.mkdirSync(keep, { recursive: true });
fs.writeFileSync(path.join(keep, `horse-${variant}-${Date.now()}.png`), png);
const out = path.join("public", "newui", "artists", id, "horse.jpg");
fs.mkdirSync(path.dirname(out), { recursive: true });
await sharp(png).resize(720, 480, { fit: "contain", background: "#fff" }).flatten({ background: "#fff" }).jpeg({ quality: 86 }).toFile(out);
/* and cut out (2026-09-30): the taste page shows horse.png */
{ const { cutoutHorse } = await import("@/lib/label/horse-cutout");
  fs.writeFileSync(out.replace(/\.jpg$/, ".png"), await cutoutHorse(fs.readFileSync(out))); }
console.log(`${model.artist.name}: ${out}${cl.cleaned ? "" : " (the paper could not be cleaned — check it)"}`);
process.exit(0);
