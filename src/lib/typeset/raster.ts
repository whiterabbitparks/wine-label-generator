import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { loadFace } from "./fonts";

/* A LABEL SVG TO PIXELS. librsvg (inside sharp) finds the label faces as
   system fonts through fontconfig, and a RUNNING process never sees a
   font installed after it started (tested on the server 2026-10-01: same
   output 1 s and 33 s after fc-cache; a fresh process saw it). A face the
   owner approves in the admin's font bank must work at once, so an SVG
   set in a face downloaded after this process started is rasterised by a
   short-lived child process; after the next restart it renders here. */
const STARTED = Date.now() - process.uptime() * 1000;
const BANK_DIR = path.join(process.cwd(), "data", "fonts", "labels");

function newFaces(svg: string): boolean {
  let names: string[];
  try { names = fs.readdirSync(BANK_DIR); } catch { return false; }
  if (!names.length) return false;
  const fams = new Set([...svg.matchAll(/font-family="([^"]+)"/g)].map((m) => m[1].replace(/&quot;|"/g, "").replace(/\s+/g, "")));
  return names.some((n) => fams.has(n.replace(/-\d+i?\.ttf$/, "")) && fs.statSync(path.join(BANK_DIR, n)).mtimeMs > STARTED);
}

/* THE NAME THE FONT FILE GIVES ITSELF (2026-10-04). The bank calls a face
   by its Google name, but some files name themselves otherwise — "Nanum
   Pen" for Nanum Pen Script, "Poppins Medium" for Poppins 500,
   "NanumGothic", "Rounded Mplus 1c" … — and fontconfig then quietly drew
   a fallback (DejaVu Sans, or the wrong weight): wider than the face the
   type was measured in, so lines that fitted touched on the print. Every
   font-family in a label's SVG now also names the file's own family. */
const aliasCache = new Map<string, string | null>();
function ownName(family: string, weight: number): string | null {
  const k = `${family}|${weight}`;
  if (aliasCache.has(k)) return aliasCache.get(k)!;
  let n: string | null = null;
  try { const f = loadFace({ family, weight }) as unknown as { names?: { windows?: { fontFamily?: { en?: string } }; fontFamily?: { en?: string } } } | null; n = f?.names?.windows?.fontFamily?.en || f?.names?.fontFamily?.en || null; } catch { n = null; }
  if (n === family) n = null;
  aliasCache.set(k, n);
  return n;
}
export function withOwnNames(svg: string): string {
  return svg.replace(/font-family="([^"]+)"(\s+font-weight="(\d+)")?/g, (m, fam: string, wpart: string | undefined, w: string | undefined) => {
    const first = fam.split(",")[0].trim().replace(/^['"]|['"]$/g, "").replace(/&quot;/g, "");
    const own = ownName(first, Number(w) || 400);
    const listed = fam.split(",").map((x) => x.trim().replace(/^['"]|['"]$/g, "").replace(/&quot;/g, ""));
    /* the file's own name FIRST: "Poppins Medium" before "Poppins", or the 400 file is drawn for a 500 line */
    return own && !listed.includes(own) ? `font-family="${own}, ${fam}"${wpart || ""}` : m;
  });
}

export async function rasterLabel(svg0: string, W: number, H: number): Promise<Buffer> {
  const svg = withOwnNames(svg0);
  if (!newFaces(svg)) return sharp(Buffer.from(svg), { density: 12 * 25.4 }).resize(W, H).png().toBuffer();
  const script = `const sharp=require(${JSON.stringify(path.join(process.cwd(), "node_modules", "sharp"))});let d=[];process.stdin.on("data",c=>d.push(c));process.stdin.on("end",async()=>{const b=await sharp(Buffer.concat(d),{density:${12 * 25.4}}).resize(${W},${H}).png().toBuffer();process.stdout.write(b);});`;
  const r = spawnSync(process.execPath, ["-e", script], { input: svg, maxBuffer: 256 * 1024 * 1024, timeout: 60000 });
  if (r.status === 0 && r.stdout?.length) return r.stdout;
  console.warn(`[raster] fresh-process render failed (${String(r.stderr || r.error || "").slice(0, 200)}) — rendered here`);
  return sharp(Buffer.from(svg), { density: 12 * 25.4 }).resize(W, H).png().toBuffer();
}
