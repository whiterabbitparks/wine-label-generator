/* The job payload EightKImageGen.buildJob() sends (see 8k-labels-package/src/image-gen.js). */
export interface GenerationJob {
  prompt: string;
  negative?: string;
  /** client's uploaded sketch/photo as a data URL, or null */
  reference?: string | null;
  size?: { w: number; h: number };
  art?: { preset?: string; extra?: string; negative?: string; template?: string };
  data?: Record<string, string>;
  vision?: string;
}

/** Returns an image as a data URL that slots into the label's image area. */
export type ImageProvider = (job: GenerationJob) => Promise<string>;
