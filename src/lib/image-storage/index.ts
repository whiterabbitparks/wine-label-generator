import type { ImageStorage } from "./types";
import { localStorageBackend } from "./local";
import { s3StorageBackend } from "./s3";

export type { StoredImage, ImageStorage } from "./types";

/** Backend selected by IMAGE_STORAGE env: local (default) | s3 (TODO(s3): pending implementation). */
export function getImageStorage(): ImageStorage {
  return process.env.IMAGE_STORAGE === "s3" ? s3StorageBackend : localStorageBackend;
}
