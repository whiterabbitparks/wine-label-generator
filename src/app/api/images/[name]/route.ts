import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { IMAGES_DIR } from "@/lib/image-storage/local";

/* Serves locally-stored generated images (data/generated-images/).
   Only used by the local storage backend; an S3 backend serves from the
   bucket's own URLs instead. */

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  // strict allowlist — no traversal, no surprises
  if (!/^[a-zA-Z0-9_-]+\.[a-z0-9]+$/.test(name)) {
    return NextResponse.json({ error: "bad name" }, { status: 400 });
  }
  const file = path.join(IMAGES_DIR, name);
  if (!fs.existsSync(file)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const body = new Uint8Array(fs.readFileSync(file));
  return new NextResponse(body, {
    headers: {
      "Content-Type": CONTENT_TYPES[path.extname(name)] || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
