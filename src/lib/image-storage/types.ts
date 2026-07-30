/* Storage abstraction for generated artwork. Backends are swappable via the
   IMAGE_STORAGE env var; the rest of the app only ever sees StoredImage.url. */

export interface StoredImage {
  /** URL the image is reachable at (local: /api/images/<name>; s3: object URL) */
  url: string;
  storage: "local" | "s3";
  contentType: string;
  bytes: number;
}

export interface ImageStorage {
  /** Persist a data-URL image under the given id; returns where it lives. */
  save(imageDataUrl: string, id: string): Promise<StoredImage>;
}
