import type { ImageStorage } from "./types";

/* TODO(s3): implement the S3/object-storage backend.
   Plan: @aws-sdk/client-s3 (or any S3-compatible service — Cloudflare R2,
   DigitalOcean Spaces, MinIO), PutObjectCommand with the decoded buffer,
   return the public (or signed) object URL as StoredImage.url with
   storage: "s3". Env needed: S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID,
   S3_SECRET_ACCESS_KEY (server-side only), optional S3_ENDPOINT + S3_PUBLIC_URL
   for non-AWS providers. Also decide retention/cleanup policy.
   Activate by setting IMAGE_STORAGE=s3. */

export const s3StorageBackend: ImageStorage = {
  async save(): Promise<never> {
    throw new Error("S3 storage is not implemented yet — see TODO(s3) in src/lib/image-storage/s3.ts");
  },
};
