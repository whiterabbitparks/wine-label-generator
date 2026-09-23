import { NextResponse } from "next/server";
import fs from "node:fs";
import sharp from "sharp";
import path from "node:path";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { TEMPLATES } from "@/lib/typeset/templates.data";
import { applyReviewEdits } from "@/lib/typeset/templates.review";
import { layoutFromTemplate, templateFields, artKindOf, type Template } from "@/lib/typeset/templates";
import { composeTemplateLabel, inkLost } from "@/lib/typeset/compose-template";
import { cleanPaper } from "@/lib/typeset/palette";
import { readCorrections, writeCorrections, applyCorrections, keyOf, type Corrections } from "@/lib/typeset/overrides";

/* THE LAYOUT BENCH (owner 2026-09-23: "let me generate a label and move
   the pieces until they sit right, and you read what I changed").

   GET  → the templates as he last left them, plus a painting to work on
   POST → lay one out (he picks the template, the size and how much the
          customer typed) and hand back every line so the page can draw
          them as things he can take hold of
   PUT  → keep what he moved */

const SAMPLES: Record<string, Record<string, string>> = {
  full: {
    producer: "GRAND VIN", wine: "Château Margaux", appellation: "Margaux AOC",
    classification: "Premier Grand Cru Classé", vintage: "2018", grape: "Cabernet Sauvignon, Merlot",
    region: "Bordeaux", country: "France", special: "Vieilles Vignes",
    sweetness: "Dry", wineColorName: "Red", wineType: "Wine", alcohol: "13.5", volume: "750",
  },
  sparse: { wine: "Korra", vintage: "2023", sweetness: "Dry", wineColorName: "Amber", wineType: "Wine", alcohol: "12.5", volume: "750" },
  long: {
    producer: "DOMAINE DE LA ROMANÉE-CONTI", wine: "Château Marceau de Beauregard", appellation: "Margaux AOC",
    classification: "Grand Cru Classé en 1855, Premier Cru", vintage: "2018", grape: "Cabernet Sauvignon, Merlot, Petit Verdot",
    region: "Bordeaux", country: "France", special: "Vieilles Vignes",
    sweetness: "Dry", wineColorName: "Red", wineType: "Wine", alcohol: "13.5", volume: "750",
  },
};

/* does this painting stand on paper? Measured once — the border ring,
   at thumbnail size: if most of it is one quiet colour, it is paper.
   Paintings made before 2026-09-23 never recorded it, so it is worked
   out here and written into their meta.json for next time. */
type Box = { x: number; y: number; w: number; h: number };
/* where the drawing sits in the file, measured on a thumbnail the same
   way cleanPaper does it (paper grown in from the edge), and cached */
async function inkOf(dir: string): Promise<Box> {
  const metaFile = path.join(dir, "meta.json");
  let meta: Record<string, unknown> = {};
  try { meta = JSON.parse(fs.readFileSync(metaFile, "utf8")); } catch { /* none */ }
  if (meta.ink && typeof meta.ink === "object") return meta.ink as Box;
  const { data, info } = await sharp(path.join(dir, "art.png")).flatten({ background: "#ffffff" }).resize(240, 240, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  const at = (x: number, y: number) => (y * W + x) * C;
  const edge: number[][] = [];
  for (let x = 0; x < W; x++) { edge.push([x, 0], [x, H - 1]); }
  for (let y = 0; y < H; y++) { edge.push([0, y], [W - 1, y]); }
  const bins = new Map<string, number[]>();
  for (const [x, y] of edge) { const i = at(x, y); const k = `${data[i] >> 4}-${data[i + 1] >> 4}-${data[i + 2] >> 4}`; const e = bins.get(k) || [0, 0, 0, 0]; e[0]++; e[1] += data[i]; e[2] += data[i + 1]; e[3] += data[i + 2]; bins.set(k, e); }
  const top = [...bins.values()].sort((a, b) => b[0] - a[0])[0];
  const g = [top[1] / top[0], top[2] / top[0], top[3] / top[0]];
  const near = (x: number, y: number) => { const i = at(x, y); return Math.max(Math.abs(data[i] - g[0]), Math.abs(data[i + 1] - g[1]), Math.abs(data[i + 2] - g[2])) < 40; };
  const paper = new Uint8Array(W * H), q: number[] = [];
  for (const [x, y] of edge) if (near(x, y) && !paper[y * W + x]) { paper[y * W + x] = 1; q.push(y * W + x); }
  while (q.length) {
    const p2 = q.pop()!, x = p2 % W, y = (p2 / W) | 0;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const k = ny * W + nx;
      if (!paper[k] && near(nx, ny)) { paper[k] = 1; q.push(k); }
    }
  }
  const rows = new Array(H).fill(0), cols = new Array(W).fill(0);
  for (let p2 = 0; p2 < W * H; p2++) if (!paper[p2]) { rows[(p2 / W) | 0]++; cols[p2 % W]++; }
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) if (rows[y] > W * 0.01) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  for (let x = 0; x < W; x++) if (cols[x] > H * 0.01) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  const ink: Box = x1 < 0 ? { x: 0, y: 0, w: 1, h: 1 } : { x: x0 / W, y: y0 / H, w: (x1 - x0 + 1) / W, h: (y1 - y0 + 1) / H };
  try { fs.writeFileSync(metaFile, JSON.stringify({ ...meta, ink }, null, 2)); } catch { /* fine */ }
  return ink;
}

async function hasPaper(dir: string): Promise<boolean> {
  const metaFile = path.join(dir, "meta.json");
  let meta: Record<string, unknown> = {};
  try { meta = JSON.parse(fs.readFileSync(metaFile, "utf8")); } catch { /* none */ }
  if (typeof meta.hasPaper === "boolean") return meta.hasPaper;
  const { data, info } = await sharp(path.join(dir, "art.png")).flatten({ background: "#ffffff" }).resize(160, 160, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels, ring = 8;
  const px: number[][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x >= ring && x < W - ring && y >= ring && y < H - ring) continue;
    const i = (y * W + x) * C; px.push([data[i], data[i + 1], data[i + 2]]);
  }
  const bins = new Map<string, number[]>();
  for (const [r, g, b] of px) { const k = `${r >> 4}-${g >> 4}-${b >> 4}`; const e = bins.get(k) || [0, 0, 0, 0]; e[0]++; e[1] += r; e[2] += g; e[3] += b; bins.set(k, e); }
  const top = [...bins.values()].sort((a, b) => b[0] - a[0])[0];
  const m = [top[1] / top[0], top[2] / top[0], top[3] / top[0]];
  const near = px.filter(([r, g, b]) => Math.max(Math.abs(r - m[0]), Math.abs(g - m[1]), Math.abs(b - m[2])) <= 28).length;
  /* paper is light and quiet; a flat painted blue is quiet but not paper */
  const light = (m[0] + m[1] + m[2]) / 3 > 200;
  const result = near / px.length >= 0.6 && light;
  try { fs.writeFileSync(metaFile, JSON.stringify({ ...meta, hasPaper: result }, null, 2)); } catch { /* read-only is fine */ }
  return result;
}

/* the paintings this machine has made, newest first — only the ones that
   stand on paper, because one that fills its sheet edge to edge has no
   free zone and can only ever look like a fragment in a layout (owner,
   2026-09-23) */
async function paintings(): Promise<string[]> {
  const dir = path.join(process.cwd(), "data", "labels");
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const r of fs.readdirSync(dir).sort().reverse()) {
    if (!fs.existsSync(path.join(dir, r, "art.png"))) continue;
    try { if (await hasPaper(path.join(dir, r))) out.push(r); } catch { /* skip */ }
    if (out.length >= 40) break;
  }
  return out;
}
async function paintingOf(id?: string): Promise<string | null> {
  const all = await paintings();
  const pick = id && all.includes(id) ? id : all[0];
  if (!pick) return null;
  const f = path.join(process.cwd(), "data", "labels", pick, "art.png");
  return fs.existsSync(f) ? `data:image/png;base64,${fs.readFileSync(f).toString("base64")}` : null;
}

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const c = readCorrections();
  return NextResponse.json({
    templates: (TEMPLATES as Template[]).map((t) => {
      const now = applyCorrections(applyReviewEdits(t), c);
      return { id: t.id, band: t.band, kind: artKindOf(now), refW: t.refW, refH: t.refH, touched: !!c[t.id] };
    }),
    fills: Object.keys(SAMPLES),
    paintings: await paintings(),
  });
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const b = (await req.json()) as { id: string; widthMm?: number; heightMm?: number; fill?: string; seed?: number; art?: string };
  const base = (TEMPLATES as Template[]).find((t) => t.id === b.id);
  if (!base) return NextResponse.json({ error: "no such template" }, { status: 404 });
  const tpl = applyCorrections(applyReviewEdits(base));
  const widthMm = Math.min(300, Math.max(30, b.widthMm || 110));
  const heightMm = Math.min(300, Math.max(30, b.heightMm || 80));
  const data = SAMPLES[b.fill || "full"] || SAMPLES.full;

  /* the owner's rule: a picture is not offered a layout it would have to
     be dragged into. So the bench works only with paintings this template
     can take — the same measure the engine uses when it chooses. */
  const labelsDir = path.join(process.cwd(), "data", "labels");
  const probe = layoutFromTemplate({ template: tpl, fields: templateFields(data), widthMm, heightMm, seed: b.seed ?? 4242, ground: "#fff", ink: "#111", accent: "#111" });
  const fitting: string[] = [];
  for (const id of await paintings()) {
    const lost = inkLost(tpl, await inkOf(path.join(labelsDir, id)), widthMm, heightMm, probe.art);
    if (lost <= 0.35) fitting.push(id);
  }
  const useId = b.art && fitting.includes(b.art) ? b.art : fitting[0];
  const raw = useId ? await paintingOf(useId) : null;
  const cleaned = raw ? await cleanPaper(raw) : null;
  const out = await composeTemplateLabel({
    artwork: cleaned?.art || raw || "",
    template: tpl.id, band: tpl.band, data, ink: cleaned?.ink, paper: cleaned?.ground,
    widthMm, heightMm, seed: b.seed ?? 4242, wineColour: data.wineColorName,
    textless: true,      /* the bench sets the words itself, so they can be moved */
  }).catch(() => null);

  const lay = layoutFromTemplate({
    template: tpl, fields: templateFields(data), widthMm, heightMm,
    seed: b.seed ?? 4242, ground: cleaned?.ground || "#F5F1E6", ink: "#1b1b1b", accent: "#8B1A1A",
  });
  /* every laid line, tagged with the template text it came from, so the
     page can hand a drag straight back to the right field */
  const tagged = lay.layout.lines.map((l) => {
    const owner = tpl.texts.find((t) => {
      const parts = t.fields.map((f) => templateFields(data)[f]).filter(Boolean);
      if (!parts.length) return false;
      const s = parts.join(t.join || " / ");
      return (t.caps ? s.toUpperCase() : s) === l.text;
    });
    return { ...l, key: owner ? keyOf(owner.fields) : "", align: owner?.align || "left" };
  });
  return NextResponse.json({
    png: out?.png || null, fitting, used: useId || null, layout: lay.layout, art: lay.art, warnings: lay.warnings,
    lines: tagged, widthMm, heightMm, refW: tpl.refW, refH: tpl.refH,
    template: { id: tpl.id, band: tpl.band, kind: artKindOf(tpl), art: tpl.art, texts: tpl.texts },
  });
}

export async function PUT(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const b = (await req.json()) as { id: string; correction: Corrections[string] | null };
  const c = readCorrections();
  if (!b.correction) delete c[b.id];
  else c[b.id] = { texts: { ...(c[b.id]?.texts || {}), ...(b.correction.texts || {}) }, art: { ...(c[b.id]?.art || {}), ...(b.correction.art || {}) } };
  writeCorrections(c);
  return NextResponse.json({ ok: true, correction: c[b.id] || null });
}
