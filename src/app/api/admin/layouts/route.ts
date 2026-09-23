import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { TEMPLATES } from "@/lib/typeset/templates.data";
import { layoutFromTemplate, templateFields, artKindOf, type Template } from "@/lib/typeset/templates";
import { composeTemplateLabel } from "@/lib/typeset/compose-template";
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

/* the paintings this machine has made, newest first — he picks which one
   he is arranging around (owner 2026-09-23: "what image is this?") */
function paintings(): string[] {
  const dir = path.join(process.cwd(), "data", "labels");
  if (!fs.existsSync(dir)) return [];
  /* only paintings that HAVE paper around them — one that fills its sheet
     edge to edge has no free zone and can only ever look like a fragment
     in a layout (owner, 2026-09-23) */
  return fs.readdirSync(dir).sort().reverse()
    .filter((r) => {
      const f = path.join(dir, r, "art.png");
      if (!fs.existsSync(f)) return false;
      try { return JSON.parse(fs.readFileSync(path.join(dir, r, "meta.json"), "utf8")).hasPaper !== false; } catch { return true; }
    })
    .slice(0, 40);
}
function paintingOf(id?: string): string | null {
  const all = paintings();
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
      const now = applyCorrections(t, c);
      return { id: t.id, band: t.band, kind: artKindOf(now), refW: t.refW, refH: t.refH, touched: !!c[t.id] };
    }),
    fills: Object.keys(SAMPLES),
    paintings: paintings(),
  });
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const b = (await req.json()) as { id: string; widthMm?: number; heightMm?: number; fill?: string; seed?: number; art?: string };
  const base = (TEMPLATES as Template[]).find((t) => t.id === b.id);
  if (!base) return NextResponse.json({ error: "no such template" }, { status: 404 });
  const tpl = applyCorrections(base);
  const widthMm = Math.min(300, Math.max(30, b.widthMm || 110));
  const heightMm = Math.min(300, Math.max(30, b.heightMm || 80));
  const data = SAMPLES[b.fill || "full"] || SAMPLES.full;

  const raw = paintingOf(b.art);
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
    png: out?.png || null, layout: lay.layout, art: lay.art, warnings: lay.warnings,
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
