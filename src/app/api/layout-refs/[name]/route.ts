import fs from "node:fs";
import path from "node:path";
import { LAYOUT_REFS_DIR } from "@/lib/admin/layout-refs";

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const safe = path.basename(name);
  const p = path.join(LAYOUT_REFS_DIR, safe);
  if (!fs.existsSync(p)) return new Response("not found", { status: 404 });
  const ext = safe.split(".").pop() || "";
  return new Response(new Uint8Array(fs.readFileSync(p)), {
    headers: { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "no-store" },
  });
}
