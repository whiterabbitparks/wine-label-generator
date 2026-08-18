import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { listRefs } from "@/lib/admin/style-refs";
import { createRecraftStyle, getRecraftStyles, saveRecraftStyle } from "@/lib/image-provider/recraft";

/* Sync the owner's reference boards to Recraft custom styles (owner GO,
   2026-08-17): for each of the 3 public styles, upload up to 5 of the most
   recent board images → store the returned style_id. Generations with
   IMAGE_PROVIDER=recraft (or the playground's recraft A/B) then pass the
   style_id, so the model SEES the boards instead of reading about them.
   Re-running re-creates styles from the current boards (old ids are simply
   abandoned — Recraft styles are free to keep). */

const REFS_DIR = path.join(process.cwd(), "data", "style-refs");
const STYLES = ["traditional", "contemporary", "punk"];

export async function GET() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ styles: await getRecraftStyles(), keySet: !!process.env.RECRAFT_API_KEY });
}

export async function POST() {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.RECRAFT_API_KEY)
    return NextResponse.json({ error: "RECRAFT_API_KEY is not set in .env.local" }, { status: 400 });
  const results: Record<string, { ok: boolean; id?: string; refCount?: number; error?: string }> = {};
  for (const style of STYLES) {
    try {
      const refs = (await listRefs(style)).slice(-5); // the 5 most recent board images
      const images = refs
        .map((r) => {
          const p = path.join(REFS_DIR, r.file);
          return fs.existsSync(p) ? { buf: fs.readFileSync(p), name: r.file } : null;
        })
        .filter(Boolean) as { buf: Buffer; name: string }[];
      if (!images.length) { results[style] = { ok: false, error: "no reference images on this board" }; continue; }
      const id = await createRecraftStyle(images);
      await saveRecraftStyle(style, id, images.length);
      results[style] = { ok: true, id, refCount: images.length };
    } catch (e) {
      results[style] = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return NextResponse.json({ results, styles: await getRecraftStyles() });
}
