import { getDb } from "@/lib/db";
import { listArtists } from "./artists";

/* WHICH ARTIST PAINTS WHICH COLUMN (round 90 → 105). The wizard shows
   three columns; internally they keep the keys traditional / contemporary
   / punk, but each is headed by an artist's name and painted by that
   artist (gpt-image → FLUX + her LoRA). The owner picks per column in
   /admin → Artists; the map lives in settings/_id "painters". Without a
   saved map the first three artists with a trained LoRA take the columns. */

export const COLUMNS = ["traditional", "contemporary", "punk"] as const;

export function defaultPainters(): Record<string, string> {
  const ready = listArtists().filter((a) => a.lora).map((a) => `artist:${a.profile.id}`);
  const map: Record<string, string> = {};
  COLUMNS.forEach((c, i) => { map[c] = ready[i] || ready[0] || ""; });
  return map;
}

export async function painterFor(style: string): Promise<string> {
  try {
    const db = await getDb();
    const doc = (await db.collection("settings").findOne({ _id: "painters" } as never)) as { map?: Record<string, string> } | null;
    const v = doc?.map?.[style];
    if (v && v.startsWith("artist:")) return v;
  } catch { /* the default paints */ }
  return defaultPainters()[style] || "";
}
