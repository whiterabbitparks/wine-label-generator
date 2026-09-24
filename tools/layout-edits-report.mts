/* READ THE OWNER'S LAYOUT EDITS (2026-09-23). What he corrected in the
   admin's layout editor (data/layout-edits/*.json), said in numbers:
   per template and per element — how far it moved (mm), how its size and
   weight changed (pt), whether its alignment changed or it was hidden —
   plus the picture's move and scale. And a before | after sheet of every
   edit on the Desktop, so the pattern can be SEEN, not only read.

     npx tsx tools/layout-edits-report.mts            all edits
     SINCE=2026-09-24 npx tsx tools/layout-edits-report.mts

   Nothing here changes the engine. Claude reads this, says in words what
   the edits show, and only a rule the owner agrees to is written. */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

type Line = { text: string; x: number; y: number; size: number; tracking: number; family: string; weight: number; anchor: string; colour: string; rot?: number; key?: string; hidden?: boolean };
type Box = { x: number; y: number; w: number; h: number };
type Edit = { at: string; labelId: string; template: string; style: string; widthMm: number; heightMm: number; artist: string; note: string; before: { lines: Line[]; art: Box }; after: { lines: Line[]; art: Box } };

const PX = 12, PT = PX * 0.3528;
const EDITS = path.join("data", "layout-edits");
const out = path.join(process.env.HOME!, "Desktop", "8K-sheet-test", "layout-edits");
if (!fs.existsSync(EDITS)) { console.log("no edits yet"); process.exit(0); }
fs.mkdirSync(out, { recursive: true });

const files = fs.readdirSync(EDITS).filter((f) => f.endsWith(".json")).sort()
  .filter((f) => !process.env.SINCE || f >= process.env.SINCE);
const edits: Edit[] = files.map((f) => JSON.parse(fs.readFileSync(path.join(EDITS, f), "utf8")));

/* the same grouping as the editor: an arced line's letters are one element */
const keyed = (ls: Line[]): Line[] => {
  let arc = 0;
  return ls.map((l, i) => {
    if (l.key) return l;
    const prev = ls[i - 1];
    if (l.text.length === 1 && l.rot !== undefined) {
      const cont = prev && !prev.key && prev.text.length === 1 && prev.rot !== undefined && prev.size === l.size && prev.family === l.family;
      if (!cont) arc++;
      return { ...l, key: `arc${arc}` };
    }
    return { ...l, key: `line${i}` };
  });
};
const byKey = (ls: Line[]) => {
  const m = new Map<string, Line[]>();
  keyed(ls).forEach((l) => m.set(l.key!, [...(m.get(l.key!) || []), l]));
  return m;
};
const mm = (px: number) => (px / PX).toFixed(1);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* the words */
const rows: string[] = [];
for (const e of edits) {
  rows.push(`\n== ${e.at.slice(0, 16)}  ${e.template}  ${e.widthMm}×${e.heightMm} mm  ${e.artist || e.style}  label ${e.labelId}`);
  if (e.note) rows.push(`   note: "${e.note}"`);
  const B = byKey(e.before.lines), A = byKey(e.after.lines);
  for (const [k, al] of A) {
    const bl = B.get(k); if (!bl) continue;
    const b0 = bl[0], a0 = al[0], said: string[] = [];
    const dx = a0.x - b0.x, dy = a0.y - b0.y;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) said.push(`moved ${dx >= 0 ? "+" : ""}${mm(dx)} mm across, ${dy >= 0 ? "+" : ""}${mm(dy)} mm down`);
    if (Math.abs(a0.size - b0.size) > 0.1) said.push(`size ${(b0.size / PT).toFixed(1)} → ${(a0.size / PT).toFixed(1)} pt`);
    if (a0.weight !== b0.weight) said.push(`weight ${b0.weight} → ${a0.weight}`);
    if (a0.anchor !== b0.anchor) said.push(`align ${b0.anchor} → ${a0.anchor}`);
    if (a0.hidden && !b0.hidden) said.push("HIDDEN");
    if (said.length) rows.push(`   ${k.padEnd(26)} "${bl.map((l) => l.text).join("").slice(0, 30)}"  ${said.join(" · ")}`);
  }
  const ba = e.before.art, aa = e.after.art;
  if (Math.abs(aa.x - ba.x) > 0.5 || Math.abs(aa.y - ba.y) > 0.5 || Math.abs(aa.w - ba.w) > 0.5)
    rows.push(`   picture: moved ${mm(aa.x - ba.x)} / ${mm(aa.y - ba.y)} mm, scale ×${(aa.w / ba.w).toFixed(3)}`);
}
/* the same, counted by template and element */
const tally = new Map<string, string[]>();
for (const r of rows) {
  const m = r.match(/^ {3}(\S+)\s+"[^"]*"\s+(.*)$/);
  if (!m) continue;
  const tpl = [...rows.slice(0, rows.indexOf(r))].reverse().find((x) => x.startsWith("\n== "))?.split(/\s+/)[3] || "?";
  const k = `${tpl} ${m[1]}`;
  tally.set(k, [...(tally.get(k) || []), m[2]]);
}
const summary = [...tally].sort((a, b) => b[1].length - a[1].length).map(([k, v]) => `  ${String(v.length).padStart(2)}×  ${k}:  ${v.slice(0, 3).join(" | ")}`);
const text = `${edits.length} edits\n\nBY TEMPLATE AND ELEMENT\n${summary.join("\n")}\n\nEACH EDIT${rows.join("\n")}\n`;
fs.writeFileSync(path.join(out, "00-report.txt"), text);
console.log(text);

/* the pictures: before | after for each edit */
const draw = async (e: Edit, st: { lines: Line[]; art: Box }) => {
  const dir = path.join("data", "labels", e.labelId);
  const lay = JSON.parse(fs.readFileSync(path.join(dir, "layout.json"), "utf8"));
  const artPng = fs.readFileSync(path.join(dir, "art.png"));
  const m = await sharp(artPng).metadata();
  const crop = lay.artCrop || { x: 0, y: 0, w: m.width, h: m.height };
  const texts = st.lines.filter((l) => !l.hidden).map((l) =>
    `<text x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}" font-family="${esc(l.family)}" font-weight="${l.weight}" font-size="${l.size.toFixed(1)}" text-anchor="${l.anchor}" fill="${l.colour}"${l.tracking ? ` letter-spacing="${l.tracking.toFixed(2)}"` : ""}${l.rot ? ` transform="rotate(${l.rot} ${l.x} ${l.y})"` : ""}>${esc(l.text)}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${lay.W}" height="${lay.H}" viewBox="0 0 ${lay.W} ${lay.H}">`
    + `<rect width="${lay.W}" height="${lay.H}" fill="${lay.ground}"/>`
    + `<svg x="${st.art.x}" y="${st.art.y}" width="${st.art.w}" height="${st.art.h}" viewBox="${crop.x} ${crop.y} ${crop.w} ${crop.h}" preserveAspectRatio="none"><image xlink:href="data:image/png;base64,${artPng.toString("base64")}" width="${m.width}" height="${m.height}" preserveAspectRatio="none"/></svg>`
    + texts + `</svg>`;
  return sharp(Buffer.from(svg)).resize({ width: 700 }).png().toBuffer();
};
for (const [i, e] of edits.entries()) {
  const [b, a] = await Promise.all([draw(e, e.before), draw(e, e.after)]);
  const h = (await sharp(b).metadata()).height!;
  await sharp({ create: { width: 1420, height: h + 30, channels: 3, background: "#fff" } }).composite([
    { input: Buffer.from(`<svg width="1420" height="26"><text x="4" y="19" font-family="Helvetica" font-size="15" font-weight="bold">${esc(`${e.template} · ${e.at.slice(0, 16)} — before | after${e.note ? " — " + e.note.slice(0, 90) : ""}`)}</text></svg>`), left: 0, top: 0 },
    { input: b, left: 0, top: 30 }, { input: a, left: 720, top: 30 },
  ]).png().toFile(path.join(out, `${String(i + 1).padStart(2, "0")}-${e.template}.png`));
}
console.log(`→ ${out}`);
