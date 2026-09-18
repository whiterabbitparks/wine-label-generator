import fs from "node:fs";
import path from "node:path";
import type { EvalRating, EvalRun } from "./briefs";

/* Evaluation runs live on disk under data/eval/<runId>/ — run.json (the
   manifest, prompts included), ratings.json (the owner's marks) and one PNG
   per output. Files, not Mongo: a run is an artefact you want to diff, zip
   and look at in Finder. */

export const EVAL_DIR = path.join(process.cwd(), "data", "eval");

const safe = (s: string) => path.basename(String(s)).replace(/[^a-zA-Z0-9._-]/g, "_");

export function runDir(runId: string): string {
  return path.join(EVAL_DIR, safe(runId));
}

export function listRuns(): EvalRun[] {
  if (!fs.existsSync(EVAL_DIR)) return [];
  return fs.readdirSync(EVAL_DIR)
    .filter((d) => fs.existsSync(path.join(EVAL_DIR, d, "run.json")))
    .map((d) => JSON.parse(fs.readFileSync(path.join(EVAL_DIR, d, "run.json"), "utf8")) as EvalRun)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function readRun(runId: string): EvalRun | null {
  const p = path.join(runDir(runId), "run.json");
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")) as EvalRun) : null;
}

export function writeRun(run: EvalRun): void {
  fs.mkdirSync(runDir(run.id), { recursive: true });
  fs.writeFileSync(path.join(runDir(run.id), "run.json"), JSON.stringify(run, null, 2));
}

export function readRatings(runId: string): Record<string, EvalRating> {
  const p = path.join(runDir(runId), "ratings.json");
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, EvalRating>) : {};
}

export function writeRating(runId: string, itemId: string, rating: EvalRating | null): Record<string, EvalRating> {
  const all = readRatings(runId);
  if (rating) all[itemId] = rating; else delete all[itemId];
  fs.mkdirSync(runDir(runId), { recursive: true });
  fs.writeFileSync(path.join(runDir(runId), "ratings.json"), JSON.stringify(all, null, 2));
  return all;
}

/* a dream arrives as a data URL — keep the bytes, return the filename */
export function saveImage(runId: string, name: string, dataUrl: string): string {
  const m = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,/);
  const ext = m ? (m[1] === "jpeg" ? "jpg" : m[1]) : "png";
  const file = `${safe(name)}.${ext}`;
  fs.mkdirSync(runDir(runId), { recursive: true });
  fs.writeFileSync(path.join(runDir(runId), file), Buffer.from(dataUrl.slice(m ? m[0].length : dataUrl.indexOf(",") + 1), "base64"));
  return file;
}

export function imagePath(runId: string, file: string): string | null {
  const p = path.join(runDir(runId), safe(file));
  return fs.existsSync(p) ? p : null;
}
