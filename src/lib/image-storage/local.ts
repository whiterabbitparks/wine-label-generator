import fs from "node:fs";
import path from "node:path";
import type { ImageStorage, StoredImage } from "./types";

/* Local-disk backend: files land in data/generated-images/ (gitignored,
   survives rebuilds) and are served by /api/images/[name]. */

export const IMAGES_DIR = path.join(process.cwd(), "data", "generated-images");

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export const localStorageBackend: ImageStorage = {
  async save(imageDataUrl: string, id: string): Promise<StoredImage> {
    const m = imageDataUrl.match(/^data:([^;,]+)(;base64)?,/);
    if (!m) throw new Error("not a data URL");
    const contentType = m[1];
    const ext = EXT_BY_MIME[contentType] || "bin";
    const payload = imageDataUrl.slice(m[0].length);
    const buf = m[2] ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");

    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    const name = `${id}.${ext}`;
    fs.writeFileSync(path.join(IMAGES_DIR, name), buf);
    return { url: `/api/images/${name}`, storage: "local", contentType, bytes: buf.length };
  },
};
