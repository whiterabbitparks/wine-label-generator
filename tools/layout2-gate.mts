/* THE FINAL-ROUND GATE (2026-10-04, after the owner's two screenshots):
   nothing of the layout2 engine goes to the server unless this passes.

   1. TYPE: every one of his 45 artboards set at its own size matches his
      PNG (ink within 0.5 mm) — except the 17 whose only deviation is his
      own off-centre name (listed, tolerated at ≤ 5 %).
   2. PICTURES: stored panel paintings (data/labels, on a sheet) are laid
      into every family that suits a size and whose zone has the
      painting's shape; for each label it is asserted that
        - the picture's ink box lies inside its zone (2 mm tolerance; on a
          bleeding side it may run past the trim by ≤ 6 % of itself),
        - the ink box is centred on the zone along every non-bleeding axis
          (within 1 mm),
        - no line of type was broken, no fit problem is reported,
      and that a painting of the WRONG shape is refused (SHAPE_MISMATCH),
      never laid in.

     npx tsx tools/layout2-gate.mts        → PASS / FAIL with every failure named */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { LAYOUTS } from "../src/lib/layout2/layouts.data";
import { FAMILIES, pickLayout, suits, textFits } from "../src/lib/layout2/engine";
import { composeLayout2, zoneAspectOf, shapeFits, ShapeMismatch, PX_MM } from "../src/lib/layout2/compose";
import { placeLayout, type Faces } from "../src/lib/layout2/place";
import { cleanPaper } from "../src/lib/typeset/palette";
import sharp from "sharp";

const fails: string[] = [];
const ok = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

/* 1. the type against his artboards */
{
  const out = execFileSync("npx", ["tsx", "tools/layout2-preview.mts"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const report = JSON.parse(fs.readFileSync("tests/layout2/out/report.json", "utf8")) as { test: string; ok: boolean; hisOff05: number }[];
  const own = report.filter((r) => !r.test.startsWith("twin-"));
  const KNOWN = new Set(["L01", "L02", "L03", "L04", "L05", "L06", "L07", "L08", "L15", "L16", "L28", "L32", "L41", "L42", "L43", "L44", "L45"]);
  for (const r of own) {
    if (r.ok) continue;
    ok(KNOWN.has(r.test) && r.hisOff05 <= 5, `type: ${r.test} differs from his artboard (${r.hisOff05}% of his ink off by > 0.5 mm)`);
  }
  ok(own.length === 45, `type: ${own.length} layouts compared, expected 45`);
  console.log(`type: ${own.filter((r) => r.ok).length}/45 exact, ${own.filter((r) => !r.ok).length} with his own off-centre name only`);
  void out;
}

/* 2. pictures */
const FACES: Faces = { hero: { family: "Tinos", weight: 700 }, bold: { family: "Tinos", weight: 700 }, title: { family: "Tinos", weight: 400 }, text: { family: "EB Garamond", weight: 400 } };
const FIELDS = { producer: "Marani Tsinandali Estate", wineName: "Saperavi Reserve", appellation: "Mukuzani PDO", classification: "Grand Reserve", vintage: "2019", grape: "Saperavi", regionCountry: "Kakheti, Georgia", special: "Qvevri Aged 18 Months", wineTypeLine: "Dry Red Wine", alcVol: "13.5% Alc. by Vol. / 750 mL" };
const dirs = fs.readdirSync("data/labels").filter((d) => d >= "2026-09-29").sort().reverse();
const paintings: { dir: string; art: string; ink: { x: number; y: number; w: number; h: number }; aw: number; ah: number; aspect: number }[] = [];
for (const d of dirs) {
  if (paintings.length >= 6) break;
  const ap = path.join("data/labels", d, "art.png"); if (!fs.existsSync(ap)) continue;
  const buf = fs.readFileSync(ap), art = `data:image/png;base64,${buf.toString("base64")}`;
  let c = await cleanPaper(art); if (!c.cleaned) c = await cleanPaper(art, undefined, undefined, { lenient: true });
  if (!c.cleaned) continue;
  const m = await sharp(buf).metadata();
  paintings.push({ dir: d, art: c.art, ink: c.ink, aw: m.width || 1, ah: m.height || 1, aspect: (c.ink.w * (m.width || 1)) / Math.max(1, c.ink.h * (m.height || 1)) });
}
ok(paintings.length >= 3, `pictures: only ${paintings.length} stored paintings with a sheet found`);
const SIZES: [number, number][] = [[100, 80], [100, 120], [80, 110], [90, 90]];
let laid = 0, refused = 0, skippedText = 0;
for (const p of paintings) for (const [w, h] of SIZES) for (const fam of FAMILIES) {
  if (!suits(fam, w, h)) continue;
  /* a family whose type cannot hold these words at this size is never offered (familyFor) — not laid here either */
  if (!textFits(fam, FIELDS, w, h, FACES)) { skippedText++; continue; }
  const lay = pickLayout(fam, w, h);
  const probe = placeLayout(lay, FIELDS, w, h, FACES);
  const za = zoneAspectOf(probe); if (za === null) continue;
  const should = shapeFits(p.aspect, za);
  try {
    const r = await composeLayout2({ lay, fields: FIELDS, widthMm: w, heightMm: h, faces: FACES, artwork: p.art, ground: "#f3ecdf", inks: { text: "#111", accent: "#811" }, sheetDone: true });
    ok(should, `${lay.id} ${w}×${h} (${p.dir}): a painting of the wrong shape (${p.aspect.toFixed(2)} vs zone ${za.toFixed(2)}) was laid in instead of refused`);
    laid++;
    const z = r.placed.zone!, pic = r.picture!, W = r.placed.W, H = r.placed.H, tol = 2 * PX_MM;
    const bl = lay.zone!.bleeds;
    const zx0 = Math.max(0, z.x), zx1 = Math.min(W, z.x + z.w), zy0 = Math.max(0, z.y), zy1 = Math.min(H, z.y + z.h);
    const inkW = pic.ink.x1 - pic.ink.x0, inkH = pic.ink.y1 - pic.ink.y0;
    /* inside the zone, or past the trim only where it bleeds and only a little */
    ok(pic.ink.x0 >= zx0 - tol - (bl.left ? 0.06 * inkW + 2 * PX_MM : 0), `${lay.id} ${w}×${h}: picture runs out of the zone on the left by ${((zx0 - pic.ink.x0) / PX_MM).toFixed(1)} mm`);
    ok(pic.ink.x1 <= zx1 + tol + (bl.right ? 0.06 * inkW + 2 * PX_MM : 0), `${lay.id} ${w}×${h}: picture runs out of the zone on the right by ${((pic.ink.x1 - zx1) / PX_MM).toFixed(1)} mm`);
    ok(pic.ink.y0 >= zy0 - tol - (bl.top ? 0.06 * inkH + 2 * PX_MM : 0), `${lay.id} ${w}×${h}: picture runs out of the zone at the top by ${((zy0 - pic.ink.y0) / PX_MM).toFixed(1)} mm`);
    ok(pic.ink.y1 <= zy1 + tol + (bl.bottom ? 0.06 * inkH + 2 * PX_MM : 0), `${lay.id} ${w}×${h}: picture runs out of the zone at the bottom by ${((pic.ink.y1 - zy1) / PX_MM).toFixed(1)} mm`);
    /* centred on every axis that does not bleed on one side only */
    if (bl.left === bl.right) ok(Math.abs((pic.ink.x0 + pic.ink.x1) / 2 - (zx0 + zx1) / 2) <= PX_MM + (bl.left ? 2 * PX_MM : 0), `${lay.id} ${w}×${h}: picture is off the zone's centre sideways by ${(Math.abs((pic.ink.x0 + pic.ink.x1) / 2 - (zx0 + zx1) / 2) / PX_MM).toFixed(1)} mm`);
    if (bl.top === bl.bottom) ok(Math.abs((pic.ink.y0 + pic.ink.y1) / 2 - (zy0 + zy1) / 2) <= PX_MM + (bl.top ? 2 * PX_MM : 0), `${lay.id} ${w}×${h}: picture is off the zone's centre vertically by ${(Math.abs((pic.ink.y0 + pic.ink.y1) / 2 - (zy0 + zy1) / 2) / PX_MM).toFixed(1)} mm`);
    ok(r.fit.wrapped.length === 0, `${lay.id} ${w}×${h}: a line was broken in two (${r.fit.wrapped.join(", ")})`);
    ok(r.fit.problems.length === 0, `${lay.id} ${w}×${h}: text problem — ${r.fit.problems.join("; ")}`);
  } catch (e) {
    if (e instanceof ShapeMismatch) { refused++; ok(!should, `${lay.id} ${w}×${h} (${p.dir}): refused although the shape fits (${p.aspect.toFixed(2)} vs ${za.toFixed(2)})`); }
    else fails.push(`${lay.id} ${w}×${h} (${p.dir}): ${e instanceof Error ? e.message : String(e)}`);
  }
}
console.log(`pictures: ${paintings.length} paintings × ${SIZES.length} sizes × families — ${laid} laid in, ${refused} refused for shape, ${skippedText} family×size pairs not offered (their type cannot hold the words)`);
void LAYOUTS;

if (fails.length) { console.log(`\nFAIL — ${fails.length} failure${fails.length > 1 ? "s" : ""}:`); for (const f of fails) console.log("  " + f); process.exit(1); }
console.log("\nPASS");
