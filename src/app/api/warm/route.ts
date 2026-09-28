import { warmLockedPainter } from "@/lib/eval/models";

/* THE WARM-UP (2026-09-28): the page calls this when a visitor opens the
   details or the labels page; the tiny painting runs in the background
   (at most one every 4 minutes for the whole site — models.ts). */
export async function POST() {
  void warmLockedPainter();
  return new Response(null, { status: 204 });
}
