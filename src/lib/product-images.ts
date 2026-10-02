import fs from "node:fs";
import path from "node:path";

/* A PRODUCT PAGE'S PICTURES ON THE SERVER'S DISK (2026-10-02). They used
   to sit inside the page's MongoDB record (~7 MB a page) and filled the
   free Atlas cluster (512 MB) — the site stopped painting. The record now
   keeps only "file:<name>"; the pictures live in
   data/product-images/<code>/ (survives deploys) and are turned back into
   the very same data URLs wherever the record is read, so every reader
   behaves as before. A record made before keeps its data URLs (read as
   they are). */
const DIR = path.join(process.cwd(), "data", "product-images");
const safe = (s: string) => s.replace(/[^a-z0-9]/gi, "");

export function storeImage(code: string, name: string, v: string): string {
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(v || "");
  if (!m) return "";
  const dir = path.join(DIR, safe(code));
  fs.mkdirSync(dir, { recursive: true });
  const file = `${safe(name)}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
  fs.writeFileSync(path.join(dir, file), Buffer.from(m[2], "base64"));
  return `file:${file}`;
}

export function resolveImage(code: string, v: string | undefined | null): string {
  const s = String(v || "");
  if (!s.startsWith("file:")) return s;
  const file = s.slice(5).replace(/[^a-z0-9.]/gi, "");
  try {
    const buf = fs.readFileSync(path.join(DIR, safe(code), file));
    const ext = file.split(".").pop();
    return `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${buf.toString("base64")}`;
  } catch { return ""; }
}

export function resolveImages<T extends { front?: string; back?: string; life?: string[] } | undefined>(code: string, im: T): T {
  if (!im) return im;
  return { ...im, front: resolveImage(code, im.front), back: resolveImage(code, im.back), life: (im.life || []).map((x) => resolveImage(code, x)) } as T;
}
