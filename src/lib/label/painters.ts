import { getDb } from "@/lib/db";
import { listArtists } from "./artists";
import { artistModel } from "@/lib/eval/models";

/* WHICH ARTIST PAINTS WHICH COLUMN (round 90 → 105). The wizard shows
   three columns; internally they keep the keys traditional / contemporary
   / punk, but each is headed by an artist's name and painted by that
   artist (gpt-image → FLUX + her LoRA). The owner picks per column in
   /admin → Artists; the map lives in settings/_id "painters". Without a
   saved map the first three artists with a trained LoRA take the columns. */

export const COLUMNS = ["traditional", "contemporary", "punk"] as const;

export function defaultPainters(): Record<string, string> {
  /* 2026-09-22: in the owner's own order (profile.pageOrder), so the
     columns do not shuffle when a folder is added — and so each column
     gets a DIFFERENT artist while there are three of them */
  const ready = listArtists()
    .filter((a) => a.lora)
    .sort((x, y) => ((x.profile as { pageOrder?: number }).pageOrder ?? 99) - ((y.profile as { pageOrder?: number }).pageOrder ?? 99))
    .map((a) => `artist:${a.profile.id}`);
  const map: Record<string, string> = {};
  COLUMNS.forEach((c, i) => { map[c] = ready[i] || ready[i % Math.max(1, ready.length)] || ""; });
  return map;
}

export async function painterFor(style: string): Promise<string> {
  try {
    const db = await getDb();
    const doc = (await db.collection("settings").findOne({ _id: "painters" } as never)) as { map?: Record<string, string> } | null;
    const v = doc?.map?.[style];
    /* a saved column may point at an artist who has since been switched
       off (Tal, 2026-09-22) — then the default paints, so two columns can
       never collapse onto one artist */
    if (v && v.startsWith("artist:") && artistModel(v.slice(7))) return v;
  } catch { /* the default paints */ }
  return defaultPainters()[style] || "";
}
