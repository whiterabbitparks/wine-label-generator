import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
import { artistModel, buildArtworkPrompt, paintStory, repaintInHand } from "./src/lib/eval/models";
import { cleanPaper } from "./src/lib/typeset/palette";
import { EVAL_BRIEFS } from "./src/lib/eval/briefs";

for (const who of ["levan-amashukeli", "mariam-kvashilava"]) {
  const model = artistModel(who)!;
  const brief = { ...EVAL_BRIEFS[0], vision: "Two figures standing apart while their shadows lean toward each other and quietly embrace." };
  const ap = await buildArtworkPrompt(brief, model.artist);
  ap.aspect = "landscape";
  const story = await paintStory(model, ap);
  const art = await repaintInHand(model, story, ap);
  const c = await cleanPaper(art);
  const out = `/tmp/newgen-${who.split("-")[0]}.png`;
  fs.writeFileSync(out, Buffer.from(c.art.slice(c.art.indexOf(",") + 1), "base64"));
  console.log(who, c.cleaned ? "HAS PAPER" : "no paper", "ink", Object.entries(c.ink).map(([k, v]) => `${k} ${(v as number).toFixed(2)}`).join(" "), out);
}
