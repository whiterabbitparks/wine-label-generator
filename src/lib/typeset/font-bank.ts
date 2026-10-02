import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/* THE FONT BANK (owner, 2026-10-01: "a separate admin page to refine the
   fonts — three categories, serif, sans-serif and handwritten/decorative,
   shown one at a time like Tinder; I approve or reject, and the bank
   slowly gets better"). His rulings the same day:
   - an approved font goes LIVE at once;
   - "full" = the whole label is set in it (title and every other line);
     "title only" = a face he likes that reads poorly small — it sets only
     the title and a simple fully-approved face sets the rest;
   - a label is still mostly ONE family; now and then a title-only face
     steps in for the name;
   - the old font votes (Mongo fontFeedback, legacy admin) are NOT read:
     only what he confirms here is used.
   Until a category holds a fully approved face, its column keeps the
   faces it had (templates.ts BAND_FACES) — a label is never left without
   type.

   Kept in data/ (survives deploys): data/font-bank.json for his verdicts,
   data/fonts/labels/*.ttf for the downloaded faces. A face is also
   installed as a system font (/usr/local/share/fonts/8k-labels, where
   librsvg finds the label faces on the server). */

export type FontCat = "serif" | "sans" | "display";
export type Verdict = "full" | "title" | "reject";
/* noCaps (owner, 2026-10-02: "a 'never all caps' button for specific
   fonts"): the face is never set in capitals — a line the layout would set
   in caps keeps its own case, and a label whose customer TYPED capitals
   does not use the face (the wizard promises "capitals stay as you enter
   them", so the customer's caps are never lowered) */
export interface BankFont { family: string; cat: FontCat; verdict: Verdict; weights: number[]; at: string; noCaps?: boolean }
interface Bank { fonts: Record<string, BankFont>; history: string[] }

const DATA = path.join(process.cwd(), "data");
const BANK = path.join(DATA, "font-bank.json");
export const BANK_FONT_DIR = path.join(DATA, "fonts", "labels");
const SYS_DIR = "/usr/local/share/fonts/8k-labels";

let cache: { mtime: number; bank: Bank } | null = null;
export function readBank(): Bank {
  try {
    const m = fs.statSync(BANK).mtimeMs;
    if (cache && cache.mtime === m) return cache.bank;
    const bank = JSON.parse(fs.readFileSync(BANK, "utf8")) as Bank;
    cache = { mtime: m, bank };
    return bank;
  } catch {
    return { fonts: {}, history: [] };
  }
}
function writeBank(b: Bank) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(BANK, JSON.stringify(b, null, 1));
  cache = null;
}

/* ---- Google's catalog ------------------------------------------------ */
export interface CatalogFont { family: string; cat: FontCat; popularity: number; weights: number[] }
const CATALOG = path.join(DATA, "google-fonts.json");
export async function catalog(): Promise<CatalogFont[]> {
  try {
    const st = fs.statSync(CATALOG);
    if (Date.now() - st.mtimeMs < 7 * 864e5) return JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  } catch { /* fetch it */ }
  const r = await fetch("https://fonts.google.com/metadata/fonts", { signal: AbortSignal.timeout(30000) });
  const txt = await r.text();
  const d = JSON.parse(txt.slice(txt.indexOf("{"))) as { familyMetadataList: { family: string; category: string; popularity: number; subsets: string[]; fonts: Record<string, unknown> }[] };
  const out: CatalogFont[] = [];
  for (const f of d.familyMetadataList) {
    if (!f.subsets.includes("latin")) continue;
    /* the script-specific Noto families (Noto Serif Thai…) crowd the queue */
    if (/^Noto (Sans|Serif) (?!Display$)/.test(f.family)) continue;
    const cat: FontCat | null = f.category === "Serif" ? "serif" : f.category === "Sans Serif" ? "sans" : f.category === "Display" || f.category === "Handwriting" ? "display" : null;
    if (!cat) continue;
    const weights = Object.keys(f.fonts).filter((k) => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
    if (!weights.length) continue;
    out.push({ family: f.family, cat, popularity: f.popularity, weights });
  }
  out.sort((a, b) => a.popularity - b.popularity);
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(CATALOG, JSON.stringify(out));
  return out;
}

/* the faces the labels already use come first in their queue, so he can
   confirm them before anything new */
const CURRENT = ["EB Garamond", "Cormorant Garamond", "Tinos", "Archivo", "Jost"];
export async function queue(cat: FontCat, n = 12): Promise<CatalogFont[]> {
  const bank = readBank().fonts;
  const all = (await catalog()).filter((f) => f.cat === cat && !bank[f.family]);
  const first = all.filter((f) => CURRENT.includes(f.family));
  return [...first, ...all.filter((f) => !CURRENT.includes(f.family))].slice(0, n);
}

/* ---- the three weights a label needs: text, middle, bold ------------- */
export function roleWeights(ws: number[]): { text: number; mid: number; bold: number } {
  const near = (t: number) => ws.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a), ws[0]);
  const text = near(400);
  const bold = ws.filter((w) => w >= 600).length ? near(700) : ws[ws.length - 1];
  const mids = ws.filter((w) => w > text && w < bold);
  const mid = mids.length ? mids.reduce((a, b) => (Math.abs(b - 500) < Math.abs(a - 500) ? b : a)) : text;
  return { text, mid, bold };
}

/* download the weights a label needs as TTF files (an old browser's
   user-agent makes Google's css2 answer with TTF, not WOFF2), install
   them for the renderer */
async function download(f: CatalogFont): Promise<number[]> {
  const r = roleWeights(f.weights);
  const ws = [...new Set([r.text, r.mid, r.bold])].sort((a, b) => a - b);
  fs.mkdirSync(BANK_FONT_DIR, { recursive: true });
  const fam = f.family.replace(/ /g, "+");
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${fam}:wght@${ws.join(";")}`, { headers: { "User-Agent": "Mozilla/4.0" }, signal: AbortSignal.timeout(30000) })).text();
  const got: number[] = [];
  for (const block of css.split("@font-face").slice(1)) {
    const w = Number(block.match(/font-weight:\s*(\d+)/)?.[1]);
    const url = block.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
    if (!w || !url || /font-style:\s*italic/.test(block) || got.includes(w)) continue;
    const buf = Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(60000) })).arrayBuffer());
    const file = `${f.family.replace(/\s+/g, "")}-${w}.ttf`;
    fs.writeFileSync(path.join(BANK_FONT_DIR, file), buf);
    try { if (fs.existsSync(path.dirname(SYS_DIR))) { fs.mkdirSync(SYS_DIR, { recursive: true }); fs.writeFileSync(path.join(SYS_DIR, file), buf); } } catch { /* local machine */ }
    got.push(w);
  }
  if (!got.length) throw new Error(`Google gave no TTF for ${f.family}`);
  try { if (fs.existsSync(SYS_DIR)) execFileSync("fc-cache", ["-f", SYS_DIR], { timeout: 30000 }); } catch { /* fc-cache missing locally */ }
  return got.sort((a, b) => a - b);
}

export async function decide(family: string, verdict: Verdict | "undo"): Promise<BankFont | null> {
  const bank = readBank();
  if (verdict === "undo") {
    const last = bank.history.pop();
    if (last) delete bank.fonts[last];
    writeBank(bank);
    return null;
  }
  const f = (await catalog()).find((x) => x.family === family);
  if (!f) throw new Error(`not in Google's catalog: ${family}`);
  const prev = bank.fonts[family];
  const weights = verdict === "reject" ? [] : prev?.weights?.length ? prev.weights : await download(f);
  const entry: BankFont = { family, cat: f.cat, verdict, weights, at: new Date().toISOString(), ...(prev?.noCaps ? { noCaps: true } : {}) };
  bank.fonts[family] = entry;
  bank.history = [...bank.history.filter((x) => x !== family), family].slice(-200);
  writeBank(bank);
  return entry;
}

export function setNoCaps(family: string, on: boolean): BankFont | null {
  const bank = readBank();
  const f = bank.fonts[family];
  if (!f) return null;
  if (on) f.noCaps = true; else delete f.noCaps;
  writeBank(bank);
  return f;
}
export function noCapsFamilies(): Set<string> {
  return new Set(Object.values(readBank().fonts).filter((f) => f.noCaps).map((f) => f.family));
}

export function bankCounts() {
  const c = { serif: { full: 0, title: 0, reject: 0 }, sans: { full: 0, title: 0, reject: 0 }, display: { full: 0, title: 0, reject: 0 } };
  for (const f of Object.values(readBank().fonts)) c[f.cat][f.verdict]++;
  return c;
}
