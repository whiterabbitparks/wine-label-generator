import fs from "node:fs";
import path from "node:path";

/* a label face for the browser (the admin's layout editor sets live type
   over the picture): the shipped faces and the ones approved in the
   admin's font bank (data/fonts/labels) */
export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!/^[A-Za-z0-9]+-\d{3}i?\.ttf$/.test(file)) return new Response("not found", { status: 404 });
  for (const dir of [path.join(process.cwd(), "public", "fonts", "labels"), path.join(process.cwd(), "data", "fonts", "labels")]) {
    const p = path.join(dir, file);
    if (fs.existsSync(p)) return new Response(new Uint8Array(fs.readFileSync(p)), { headers: { "Content-Type": "font/ttf", "Cache-Control": "public, max-age=86400" } });
  }
  return new Response("not found", { status: 404 });
}
