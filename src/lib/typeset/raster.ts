import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";

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

export async function rasterLabel(svg: string, W: number, H: number): Promise<Buffer> {
  if (!newFaces(svg)) return sharp(Buffer.from(svg), { density: 12 * 25.4 }).resize(W, H).png().toBuffer();
  const script = `const sharp=require(${JSON.stringify(path.join(process.cwd(), "node_modules", "sharp"))});let d=[];process.stdin.on("data",c=>d.push(c));process.stdin.on("end",async()=>{const b=await sharp(Buffer.concat(d),{density:${12 * 25.4}}).resize(${W},${H}).png().toBuffer();process.stdout.write(b);});`;
  const r = spawnSync(process.execPath, ["-e", script], { input: svg, maxBuffer: 256 * 1024 * 1024, timeout: 60000 });
  if (r.status === 0 && r.stdout?.length) return r.stdout;
  console.warn(`[raster] fresh-process render failed (${String(r.stderr || r.error || "").slice(0, 200)}) — rendered here`);
  return sharp(Buffer.from(svg), { density: 12 * 25.4 }).resize(W, H).png().toBuffer();
}
