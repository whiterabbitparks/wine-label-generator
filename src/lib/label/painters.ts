import { getDb } from "@/lib/db";

/* WHICH PAINTER PAINTS WHICH STYLE (round 90). The wizard's hybrid engine
   can hand the artwork to any painter that respects the type zone:
     gpt-image-own      OpenAI, own flat ground (contemporary/punk) or
                        paper + mask (traditional) — the default
     gpt-image-masked   OpenAI, paper tone + mask for every style
     ideogram-3-edit    Ideogram 3 on our paper canvas, real mask
     nano-banana-edit   Nano Banana on our paper canvas, instruction only
   The owner picks per style in /admin → Rules → Painters; the map lives
   in settings/_id "painters". Kept out of the route file (a route may
   export only handlers) and out of models.ts (no Mongo there at import). */

export const WIZARD_PAINTERS = ["gpt-image-own", "gpt-image-masked", "ideogram-3", "nano-banana", "ideogram-3-edit", "nano-banana-edit"];
export const DEFAULT_PAINTERS: Record<string, string> = { traditional: "gpt-image-own", contemporary: "gpt-image-own", punk: "gpt-image-own" };

export async function painterFor(style: string): Promise<string> {
  try {
    const db = await getDb();
    const doc = (await db.collection("settings").findOne({ _id: "painters" } as never)) as { map?: Record<string, string> } | null;
    const v = doc?.map?.[style];
    if (v && (WIZARD_PAINTERS.includes(v) || v.startsWith("artist:"))) return v;
  } catch { /* the default paints */ }
  return DEFAULT_PAINTERS[style] || "gpt-image-own";
}
