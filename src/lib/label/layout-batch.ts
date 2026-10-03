import fs from "node:fs";
import path from "node:path";
import { paintHybridLabel } from "./hybrid";
import { saveLabel } from "./store";
import { listArtists } from "./artists";
import { properCase, CASED_FIELDS } from "./casing";
import { templatesNow } from "@/lib/typeset/overrides";
import { FAMILIES, pickRef } from "@/lib/layout45/engine";
import { paintLabel } from "@/lib/layout45/paint";
import { evalModel } from "@/lib/eval/models";
import { IDEAS } from "@/app/ideas";
import { randomDetails } from "@/app/demo-fill";

/* THE LAYOUT BATCH (owner, 2026-09-24: "generate a batch, fix them, and
   once I fix one it should be gone; if I want to fix more I generate
   another"). The admin's layout editor works through a QUEUE: "Make 5"
   paints five new labels exactly as the wizard does (a real idea, a
   coherent random wine, a real artist), walking the twelve templates in
   turn at mixed sizes. A label leaves the queue when he saves a fix or
   says it looks right. Painting is real on purpose — he judges the
   pictures too; once they hold, the batch can switch to re-using
   paintings and only re-set the type. */

const FILE = path.join(process.cwd(), "data", "layout-batch.json");
const SIZES: [number, number][] = [[110, 80], [80, 110], [90, 90], [100, 70]];
const BAND_STYLE: Record<string, string> = { classical: "traditional", contemporary: "contemporary", free: "punk" };
/* 2026-09-29 (owner): eight a batch, painted small — a placement
   correction does not need print resolution */
export const BATCH_SIZE = 8;

export type BatchItem = {
  id: string; template: string; widthMm: number; heightMm: number; artist: string; idea: string;
  status: "open" | "fixed" | "ok"; madeAt: string; closedAt?: string; pictureBad?: boolean; note?: string;
};
type State = { next: number; items: BatchItem[] };

const read = (): State => { try { return JSON.parse(fs.readFileSync(FILE, "utf8")) as State; } catch { return { next: 0, items: [] }; } };
const write = (s: State) => { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(s, null, 2) + "\n"); };

/* one batch at a time; its progress lives with the server process */
let running: { total: number; done: number; failed: string[] } | null = null;

export function batchStatus() {
  const s = read();
  return {
    open: s.items.filter((i) => i.status === "open"),
    fixed: s.items.filter((i) => i.status === "fixed").length,
    ok: s.items.filter((i) => i.status === "ok").length,
    running,
  };
}

export function closeItem(id: string, outcome: "fixed" | "ok", pictureBad = false, note = "") {
  const s = read();
  const it = s.items.find((i) => i.id === id);
  if (!it) return false;
  it.status = outcome; it.closedAt = new Date().toISOString();
  if (pictureBad) it.pictureBad = true;
  if (note) it.note = note.slice(0, 2000);
  write(s);
  return true;
}

/* THE FINAL ROUND (owner, 2026-10-04): in this branch the batch paints
   the owner's 45 artboards — one family after another, at the mixed sizes,
   the artists in turn — with the new engine (src/lib/layout45), and he
   judges them in the same editor. LAYOUT_BATCH=templates brings the old
   twelve back. */
const FINAL = () => process.env.LAYOUT_BATCH !== "templates";
const SIZES45: [number, number][] = [[110, 80], [100, 80], [90, 120], [100, 140], [120, 80], [90, 90]];
async function makeOne45(k: number) {
  const fam = FAMILIES[k % FAMILIES.length];
  const lap = Math.floor(k / FAMILIES.length);
  /* a size near one of the family's own proportions */
  const own = fam.map((l) => l.refH / l.refW);
  const sizes = SIZES45.filter(([w, h]) => own.some((r) => Math.abs(Math.log((h / w) / r)) < 0.45));
  const [w, h] = (sizes.length ? sizes : [[fam[0].refW, Math.round(fam[0].refH)] as [number, number]])[(k + lap) % Math.max(1, sizes.length)];
  const artists = listArtists().filter((a) => a.lora).sort((x, y) => x.profile.id.localeCompare(y.profile.id));
  const artist = artists[(k * 7 + lap) % Math.max(1, artists.length)];
  const model = artist && evalModel(`artist:${artist.profile.id}`);
  if (!model) throw new Error("no artist with a LoRA");
  const idea = IDEAS[Math.floor(Math.random() * IDEAS.length)];
  const { front } = randomDetails();
  const fx = (key: string) => front[key]?.trim() || "";
  const raw: Record<string, string> = {
    producer: fx("producer"), wine: fx("wine"), appellation: fx("appellation"), classification: fx("classification"), grape: fx("grape"),
    region: fx("regionCountry").split(",")[0]?.trim() || "", country: fx("regionCountry").split(",")[1]?.trim() || "",
    special: fx("special"), vintage: fx("vintage"), wineColorName: fx("colour"), wineType: fx("wineType"),
    sweetness: fx("sweetness"), alcohol: fx("alcohol"), volume: fx("volume") || "750",
  };
  const data: Record<string, string> = {};
  for (const [key, v] of Object.entries(raw)) data[key] = CASED_FIELDS.has(key as never) ? properCase(v) : v;
  const out = await paintLabel({ model, vision: idea, data, widthMm: w, heightMm: h, seed: (Math.random() * 2 ** 32) >>> 0, family: pickRef(fam, w, h).id, small: true });
  const id = saveLabel({
    style: "traditional", widthMm: w, heightMm: h, faces: `${out.faces.hero.family} ${out.faces.hero.weight}/${out.faces.body.weight} · ${out.lay.id} · ${out.faces.body.family}`,
    ground: out.ground, svg: out.svg, png: out.png, art: out.art, prompt: out.prompt, layout: out.layout, fit: "vignette",
    template: out.lay.id, hasPaper: true, artist: model.artist.name, refSet: out.refSet, panel: true,
    layout45: { faces: out.faces, inks: out.inks, ground: out.ground, asked: out.asked, ink: out.ink },
  });
  const s = read();
  s.items.push({ id, template: out.lay.id, widthMm: w, heightMm: h, artist: model.artist.name, idea: idea.split(" — ")[0], status: "open", madeAt: new Date().toISOString(), ...(out.warnings.length ? { note: `engine: ${out.warnings.join("; ")}` } : {}) });
  write(s);
}

async function makeOne(k: number) {
  if (FINAL()) return makeOne45(k);
  const tpls = templatesNow();
  const tpl = tpls[k % tpls.length];
  /* the size and the artist step on each time the twelve come round, so
     a template meets every shape and every artist; within a batch the
     artists take turns */
  const lap = Math.floor(k / tpls.length);
  const [w, h] = SIZES[(k + lap) % SIZES.length];
  const artists = listArtists().filter((a) => a.lora).sort((x, y) => x.profile.id.localeCompare(y.profile.id));
  const artist = artists[(k + lap) % Math.max(1, artists.length)];
  const idea = IDEAS[Math.floor(Math.random() * IDEAS.length)];
  const { front } = randomDetails();
  const fx = (key: string) => front[key]?.trim() || "";
  const raw: Record<string, string> = {
    producer: fx("producer"), wine: fx("wine"), appellation: fx("appellation"),
    classification: fx("classification"), grape: fx("grape"),
    region: fx("regionCountry").split(",")[0]?.trim() || "",
    country: fx("regionCountry").split(",")[1]?.trim() || "",
    special: fx("special"), vintage: fx("vintage"),
    wineColorName: fx("colour"), wineType: fx("wineType"),
    sweetness: fx("sweetness"), alcohol: fx("alcohol"), volume: fx("volume") || "750",
  };
  const data: Record<string, string> = {};
  for (const [key, v] of Object.entries(raw)) data[key] = CASED_FIELDS.has(key as never) ? properCase(v) : v;
  const style = BAND_STYLE[tpl.band] || "traditional";
  const out = await paintHybridLabel({ vision: idea, style, data, widthMm: w, heightMm: h, artistId: artist?.profile.id, template: tpl.id, panel: true, small: true,
    /* the scene method (painting over the whole label) was tried in the
       admin on 2026-10-01 and the owner turned it down ("it doesn't work,
       put it back as it was") — OFF; ADMIN_SCENE=1 brings it back */
    scene: process.env.ADMIN_SCENE === "1" });
  const id = saveLabel({
    style, widthMm: w, heightMm: h, faces: out.faces, ground: out.ground, svg: out.svg, png: out.png, art: out.art,
    prompt: out.prompt, layout: out.layout, fit: out.fit, template: out.template, hasPaper: out.hasPaper, artist: out.artist, refSet: out.refSet, panel: out.panel, scene: out.scene,
  });
  const s = read();
  s.items.push({ id, template: out.template, widthMm: w, heightMm: h, artist: out.artist || "", idea: idea.split(" — ")[0], status: "open", madeAt: new Date().toISOString() });
  write(s);
}

/* starts a batch in the background; false if one is already painting */
export function startBatch(n = BATCH_SIZE): boolean {
  if (running) return false;
  const s = read();
  const first = s.next;
  s.next = first + n;
  write(s);
  running = { total: n, done: 0, failed: [] };
  const job = running;
  /* three at a time, as the wizard paints its three columns */
  const ks = Array.from({ length: n }, (_, i) => first + i);
  const lane = async () => {
    for (let k = ks.shift(); k !== undefined; k = ks.shift()) {
      try { await makeOne(k); } catch (e) { job.failed.push(e instanceof Error ? e.message : String(e)); }
      job.done++;
    }
  };
  Promise.all([lane(), lane(), lane()]).finally(() => { if (running === job) running = null; });
  return true;
}
