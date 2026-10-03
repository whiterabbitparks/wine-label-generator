import fs from "node:fs";
import path from "node:path";
import { saveLabel } from "./store";
import { listArtists } from "./artists";
import { properCase, CASED_FIELDS } from "./casing";
import { FAMILIES, pickLayout, suits } from "@/lib/layout2/engine";
import { paintWithLayout2 } from "@/lib/layout2/bridge";
import { evalModel, artistModels } from "@/lib/eval/models";
import { IDEAS } from "@/app/ideas";
import { randomDetails } from "@/app/demo-fill";

/* THE LAYOUT BATCH (owner, 2026-09-24: "generate a batch, fix them, and
   once I fix one it should be gone; if I want to fix more I generate
   another"). The admin's layout editor works through a QUEUE: "Make 5"
   paints five new labels exactly as the wizard does (a real idea, a
   coherent random wine, a real artist), walking the layouts in turn at
   mixed sizes. SINCE 2026-10-04 (the final round) the batch walks the
   45 artboards' FAMILIES (src/lib/layout2) — one label per family, the
   label's id is the layout's ("L07") — and the owner judges them in the
   same editor, with the same notes, as before. A label leaves the queue when he saves a fix or
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

async function makeOne(k: number) {
  const fams = FAMILIES;
  const fam = fams[k % fams.length];
  /* the size and the artist step on each time the families come round,
     so a layout meets every shape and every artist; within a batch the
     artists take turns. A size the family does not suit takes the
     family's own reference size. */
  const lap = Math.floor(k / fams.length);
  let [w, h] = SIZES[(k + lap) % SIZES.length];
  if (!suits(fam, w, h)) { const l = fam[0]; w = l.refW; h = Math.round(l.refH); }
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
  const model = (artist && evalModel(`artist:${artist.profile.id}`)) || artistModels()[0];
  if (!model) throw new Error("no artist with a LoRA is set up");
  const out = await paintWithLayout2({ model, vision: idea, data, widthMm: w, heightMm: h, seed: (Math.random() * 0xffffffff) >>> 0, kind: "centred", avoidFamilies: [], family: fam[0].id, small: true });
  const style = "traditional";
  const id = saveLabel({
    style, widthMm: w, heightMm: h, faces: out.faces, ground: out.ground, svg: out.svg, png: out.png, art: out.art,
    prompt: out.prompt, layout: out.layout, fit: out.fit, template: out.template, hasPaper: out.hasPaper, artist: out.artist, refSet: out.refSet, panel: out.panel, scene: out.scene, layout2: out.layout2,
  });
  const s = read();
  s.items.push({ id, template: out.template, widthMm: w, heightMm: h, artist: out.artist || "", idea: idea.split(" — ")[0], status: "open", madeAt: new Date().toISOString(), note: out.warnings.length ? `engine: ${out.warnings.join("; ")}` : undefined });
  write(s);
  void pickLayout;
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
