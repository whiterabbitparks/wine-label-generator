/* FINAL-ROUND TRIALS for the admin (owner, 2026-10-04: "launch nothing
   on the site yet — first I will see in the admin what comes out with
   the new layouts, then we decide"). A trial paints a few labels with the
   new engine (small, so cheap) and keeps them under data/layout2-trials/
   <run>/; from a painted label the admin can ask, for nothing, another
   LAYOUT of the same painting or another GROUND (the sheet is flat, so it
   is recoloured again). */
import fs from "node:fs";
import path from "node:path";
import { paintLayout2Label } from "./paint";
import { composeLayout2 } from "./compose";
import { FAMILIES, familyOf, pickLayout, suits, kindOf } from "./engine";
import { LAYOUTS } from "./layouts.data";
import { chooseGround, chooseInks, paletteOf, WHITE, WARM_LIGHT, type GroundChoice, type InkChoice } from "./ground";
import { artistGrounds } from "./artist-grounds";
import { cleanPaper } from "@/lib/typeset/palette";
import { templateFields } from "@/lib/typeset/templates";
import { listArtists } from "@/lib/label/artists";
import type { Faces } from "./place";

const DIR = path.join(process.cwd(), "data", "layout2-trials");
export interface TrialItem {
  id: string; run: string; n: number; at: string;
  artist: string; artistId: string; lay: string; family: string; widthMm: number; heightMm: number;
  ground: GroundChoice; inks: InkChoice; faces: Faces; facesName: string;
  sheet: string; mainColour: string | null; warnings: string[]; fit: { reduced: string[]; wrapped: string[]; problems: string[] };
  data: Record<string, string>; idea: string;
  png: string;   /* file name under the run's folder */
  art: string;   /* the painting on its ground, file name */
  parent?: string; error?: string;
}
export interface TrialRun { id: string; at: string; status: "painting" | "done"; want: number; items: TrialItem[]; note: string }

const runs = new Map<string, TrialRun>();
const safe = (s: string) => String(s).replace(/[^a-zA-Z0-9_-]/g, "");

export function trialRuns(): TrialRun[] {
  /* runs on disk from earlier processes */
  if (fs.existsSync(DIR)) for (const d of fs.readdirSync(DIR)) {
    if (runs.has(d)) continue;
    const mp = path.join(DIR, d, "run.json");
    if (fs.existsSync(mp)) { try { runs.set(d, { ...JSON.parse(fs.readFileSync(mp, "utf8")), status: "done" }); } catch { /* skip */ } }
  }
  return [...runs.values()].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 12);
}
const persist = (r: TrialRun) => { fs.mkdirSync(path.join(DIR, r.id), { recursive: true }); fs.writeFileSync(path.join(DIR, r.id, "run.json"), JSON.stringify(r, null, 1)); };
export const trialFile = (run: string, file: string) => path.join(DIR, safe(run), path.basename(file));

export interface TrialAsk { artists: string[]; idea: string; data: Record<string, string>; widthMm: number; heightMm: number; count: number; families?: string[]; note?: string }

/* paint `count` labels, two at a time, rotating the artists and the kinds */
export function startTrial(ask: TrialAsk): TrialRun {
  const id = `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}-${Math.random().toString(36).slice(2, 6)}`;
  const run: TrialRun = { id, at: new Date().toISOString(), status: "painting", want: ask.count, items: [], note: ask.note || "" };
  runs.set(id, run); persist(run);
  const artists = ask.artists.length ? ask.artists : listArtists().map((a) => a.profile.id);
  const kinds = ["centred", "sides", "vertical"] as const;
  (async () => {
    const jobs = Array.from({ length: ask.count }, (_, i) => i);
    for (let k = 0; k < jobs.length; k += 2) {
      await Promise.all(jobs.slice(k, k + 2).map(async (i) => {
        const artistId = artists[i % artists.length];
        const family = ask.families?.length ? ask.families[i % ask.families.length] : undefined;
        try {
          const r = await paintLayout2Label({ vision: ask.idea, data: ask.data, widthMm: ask.widthMm, heightMm: ask.heightMm, artistId, family, kind: family ? undefined : kinds[i % 3], small: true, seed: (Math.random() * 0xffffffff) >>> 0 });
          const n = run.items.length + 1, base = `${String(n).padStart(2, "0")}-${artistId}-${r.lay.id}`;
          fs.mkdirSync(path.join(DIR, id), { recursive: true });
          fs.writeFileSync(path.join(DIR, id, `${base}.png`), Buffer.from(r.png.slice(r.png.indexOf(",") + 1), "base64"));
          fs.writeFileSync(path.join(DIR, id, `${base}-art.png`), Buffer.from(r.art.slice(r.art.indexOf(",") + 1), "base64"));
          run.items.push({ id: `${id}/${base}`, run: id, n, at: new Date().toISOString(), artist: r.artist, artistId, lay: r.lay.id, family: r.family, widthMm: ask.widthMm, heightMm: ask.heightMm, ground: r.ground, inks: r.inks, faces: r.faces, facesName: r.facesName, sheet: r.sheet, mainColour: r.mainColour, warnings: r.warnings, fit: { reduced: r.fit.reduced, wrapped: r.fit.wrapped, problems: r.fit.problems }, data: ask.data, idea: ask.idea, png: `${base}.png`, art: `${base}-art.png` });
        } catch (e) {
          run.items.push({ id: `${id}/err-${i}`, run: id, n: run.items.length + 1, at: new Date().toISOString(), artist: artistId, artistId, lay: "", family: "", widthMm: ask.widthMm, heightMm: ask.heightMm, ground: { ground: "#fff", source: "white", note: "" }, inks: { text: "#000", accent: "#000", allColoured: false, note: "" }, faces: { hero: { family: "", weight: 400 }, bold: { family: "", weight: 400 }, title: { family: "", weight: 400 }, text: { family: "", weight: 400 } }, facesName: "", sheet: "", mainColour: null, warnings: [], fit: { reduced: [], wrapped: [], problems: [] }, data: ask.data, idea: ask.idea, png: "", art: "", error: e instanceof Error ? e.message : String(e) });
        }
        persist(run);
      }));
    }
    run.status = "done"; persist(run);
  })();
  return run;
}

const findItem = (itemId: string) => { for (const r of trialRuns()) { const it = r.items.find((x) => x.id === itemId); if (it) return { run: r, it }; } return null; };

/* another layout of the same painting (free): a different family of any
   kind that suits the size; or the one named */
export async function trialOtherLayout(itemId: string, want?: string): Promise<TrialItem> {
  const f = findItem(itemId); if (!f) throw new Error("no such trial label");
  const { run, it } = f;
  const seen = new Set(run.items.filter((x) => x.art === it.art).map((x) => familyOf(x.lay)?.[0].id || x.lay));
  const pool = FAMILIES.filter((fam) => suits(fam, it.widthMm, it.heightMm) && !seen.has(fam[0].id));
  const fam = want ? familyOf(want) : pool.length ? pool[Math.floor(Math.random() * pool.length)] : FAMILIES[0];
  const lay = pickLayout(fam || FAMILIES[0], it.widthMm, it.heightMm);
  return await recompose(run, it, lay.id, it.ground, it.inks);
}

/* another ground of the same painting (free): the next source, or a colour named */
export async function trialOtherGround(itemId: string, want?: string): Promise<TrialItem> {
  const f = findItem(itemId); if (!f) throw new Error("no such trial label");
  const { run, it } = f;
  const art = `data:image/png;base64,${fs.readFileSync(trialFile(run.id, it.art)).toString("base64")}`;
  const pal = await paletteOf(art, it.ground.ground);
  const prof = listArtists().find((a) => a.profile.id === it.artistId)?.profile as { keepGround?: string; paper?: string } | undefined;
  let g: GroundChoice;
  if (want && /^#[0-9a-fA-F]{6}$/.test(want)) g = { ground: want, source: "white", note: `chosen in the admin (${want})` };
  else if (want === "white") g = { ground: WHITE, source: "white", note: "white" };
  else if (want === "warm") g = { ground: WARM_LIGHT, source: "warm", note: "warm light" };
  else if (want === "originals") { const o = (await artistGrounds(it.artistId)).grounds; const pick = o.filter((x) => x.hex !== it.ground.ground)[0] || o[0]; g = pick ? { ground: pick.hex, source: "originals", note: `a ground of the artist's originals (${pick.works} works)` } : { ground: WHITE, source: "white", note: "white (no readable originals)" }; }
  else if (want === "painting") g = chooseGround({ ...pal, paper: it.ground.ground }, (Math.random() * 0xffffffff) >>> 0, { shares: { originals: 0, painting: 100, white: 0, warm: 0 }, wineColour: it.data.wineColorName });
  else g = chooseGround({ ...pal, paper: it.ground.ground }, (Math.random() * 0xffffffff) >>> 0, { keepGround: prof?.keepGround, paper: prof?.paper, wineColour: it.data.wineColorName, originals: (await artistGrounds(it.artistId)).grounds });
  const inks = chooseInks({ ...pal, paper: g.ground }, g.ground, (Math.random() * 0xffffffff) >>> 0, it.data.wineColorName);
  return await recompose(run, it, it.lay, g, inks, true);
}

async function recompose(run: TrialRun, it: TrialItem, layId: string, g: GroundChoice, inks: InkChoice, recolour = false): Promise<TrialItem> {
  const lay = LAYOUTS.find((l) => l.id === layId) || LAYOUTS[0];
  let art = `data:image/png;base64,${fs.readFileSync(trialFile(run.id, it.art)).toString("base64")}`;
  let artFile = it.art;
  if (recolour && g.ground !== it.ground.ground) {
    /* the sheet is one flat colour now: recoloured again, to the new ground */
    const c = await cleanPaper(art, g.ground);
    if (c.cleaned) { art = c.art; artFile = `${path.basename(it.art, ".png")}-${g.ground.slice(1)}.png`; fs.writeFileSync(trialFile(run.id, artFile), Buffer.from(art.slice(art.indexOf(",") + 1), "base64")); }
  }
  const r = await composeLayout2({ lay, fields: templateFields(it.data), widthMm: it.widthMm, heightMm: it.heightMm, faces: it.faces, artwork: art, ground: g.ground, inks: { text: inks.text, accent: inks.accent }, sheetDone: true });
  const n = run.items.length + 1, base = `${String(n).padStart(2, "0")}-${it.artistId}-${lay.id}`;
  fs.writeFileSync(trialFile(run.id, `${base}.png`), Buffer.from(r.png.slice(r.png.indexOf(",") + 1), "base64"));
  const item: TrialItem = { ...it, id: `${run.id}/${base}`, n, at: new Date().toISOString(), lay: lay.id, family: familyOf(lay.id)?.[0].id || lay.id, ground: g, inks, warnings: r.warnings, fit: { reduced: r.fit.reduced, wrapped: r.fit.wrapped, problems: r.fit.problems }, png: `${base}.png`, art: artFile, parent: it.id, error: undefined };
  run.items.push(item); persist(run);
  return item;
}

export { kindOf };
