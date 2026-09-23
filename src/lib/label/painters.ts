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

/* 2026-09-23 (owner: "don't always show me one Mariam and two Levans —
   mix it, sometimes one way, sometimes the other; every layout standard
   must fall to every artist alike"). The wizard's three columns are no
   longer tied to one artist each: every generation run carries one
   random `order` token, and from it the three columns get a shuffled
   cast — with two artists a 2 + 1 split whose majority and whose columns
   change run to run; with three or more, three different artists. As a
   column keeps its layout family (classical / contemporary / free), this
   is also what gives every artist every family. The admin's per-column
   map (painterFor) still serves the eval tools. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function shuffled<T>(xs: T[], seed: number): T[] {
  const a = [...xs];
  let x = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    const j = x % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function mixedPainter(order: string, style: string): string {
  const ready = listArtists().filter((a) => a.lora).map((a) => `artist:${a.profile.id}`).sort();
  if (!ready.length) return "";
  const h = hash(order);
  const cast = shuffled(ready, h);
  const seats = shuffled(COLUMNS.map((_, i) => cast[i % cast.length]), hash(order + "|seats"));
  const i = COLUMNS.indexOf(style as (typeof COLUMNS)[number]);
  return seats[i < 0 ? 0 : i];
}
