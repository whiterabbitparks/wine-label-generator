import fs from "node:fs";
import { showcaseFile } from "@/lib/label/showcase";

/* one image of an artist's "Labels from" (src/lib/label/showcase.ts) —
   written at run time, so served from data/, not public/ */
export async function GET(req: Request) {
  const p = showcaseFile(new URL(req.url).searchParams.get("f") || "");
  if (!p) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(p)), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" } });
}
