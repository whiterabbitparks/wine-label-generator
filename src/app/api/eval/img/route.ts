import fs from "node:fs";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { imagePath } from "@/lib/eval/store";

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

/* /api/eval/img?run=<id>&file=<name> — one stored evaluation output */
export async function GET(req: Request) {
  if (!(await requestIsAuthenticated())) return new Response("not authenticated", { status: 401 });
  const u = new URL(req.url);
  const p = imagePath(u.searchParams.get("run") || "", u.searchParams.get("file") || "");
  if (!p) return new Response("not found", { status: 404 });
  const ext = p.split(".").pop() || "png";
  return new Response(new Uint8Array(fs.readFileSync(p)), {
    headers: { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "private, max-age=3600" },
  });
}
