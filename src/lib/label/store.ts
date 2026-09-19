import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Layout } from "@/lib/typeset/compose";

/* WHERE A CUSTOMER'S LABEL LIVES (round 84). The wizard holds the PNG for
   display; the SVG (live type, ~2 MB with its artwork embedded), the
   painter's picture and the layout (round 85: what the PDF is drawn from)
   stay on disk under data/labels/<id>/ and the client carries only the
   id. The package step reads them back by id. */

export const LABEL_DIR = path.join(process.cwd(), "data", "labels");
const safe = (s: string) => path.basename(String(s)).replace(/[^a-zA-Z0-9_-]/g, "");

export interface StoredLabel { id: string; style: string; widthMm: number; heightMm: number; faces: string; ground: string; createdAt: string }

export function saveLabel(l: { style: string; widthMm: number; heightMm: number; faces: string; ground: string; svg: string; png: string; art: string; prompt: string; layout: Layout }): string {
  const id = `${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(6).toString("hex")}`;
  const dir = path.join(LABEL_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  const b64 = (u: string) => Buffer.from(u.slice(u.indexOf(",") + 1), "base64");
  fs.writeFileSync(path.join(dir, "label.svg"), l.svg);
  fs.writeFileSync(path.join(dir, "label.png"), b64(l.png));
  fs.writeFileSync(path.join(dir, "art.png"), b64(l.art));
  fs.writeFileSync(path.join(dir, "prompt.txt"), l.prompt);
  fs.writeFileSync(path.join(dir, "layout.json"), JSON.stringify(l.layout));
  const meta: StoredLabel = { id, style: l.style, widthMm: l.widthMm, heightMm: l.heightMm, faces: l.faces, ground: l.ground, createdAt: new Date().toISOString() };
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  return id;
}

export function readLabel(id: string): { meta: StoredLabel; svg: string; png: Buffer; art: Buffer; layout: Layout | null } | null {
  const dir = path.join(LABEL_DIR, safe(id));
  if (!fs.existsSync(path.join(dir, "meta.json"))) return null;
  const lp = path.join(dir, "layout.json");
  return {
    meta: JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8")) as StoredLabel,
    svg: fs.readFileSync(path.join(dir, "label.svg"), "utf8"),
    png: fs.readFileSync(path.join(dir, "label.png")),
    art: fs.readFileSync(path.join(dir, "art.png")),
    layout: fs.existsSync(lp) ? (JSON.parse(fs.readFileSync(lp, "utf8")) as Layout) : null,
  };
}
