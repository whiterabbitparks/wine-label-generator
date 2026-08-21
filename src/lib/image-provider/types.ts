/* The job payload EightKImageGen.buildJob() sends (see 8k-labels-package/src/image-gen.js). */
export interface GenerationJob {
  prompt: string;
  negative?: string;
  /** client's uploaded sketch/photo as a data URL, or null */
  reference?: string | null;
  /** layout zone the composition must honour (focal/fade fractions) */
  zone?: { focal: number[]; fade: number[]; shape: string } | null;
  size?: { w: number; h: number };
  art?: { preset?: string; extra?: string; negative?: string; template?: string };
  data?: Record<string, string>;
  vision?: string;
  /** per-job provider override (admin playground A/B); env default otherwise */
  provider?: "mock" | "openai" | "flux" | "hybrid";
  /** condensed prompt for style-conditioned providers (subject + geometry +
      non-negotiables; the style_id carries the visual language) */
  shortPrompt?: string;
  /** exact ink colours extracted from the card's reference — the finishing
      pass maps every coloured pixel to the nearest of these (owner rule) */
  paletteLock?: string[];
}

/** Returns an image as a data URL that slots into the label's image area. */
export type ImageProvider = (job: GenerationJob) => Promise<string>;
