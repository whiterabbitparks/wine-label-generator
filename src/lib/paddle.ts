import crypto from "node:crypto";
import PRICES from "./paddle-prices.json";
import { previewKey } from "./guard";

/* PADDLE (2026-09-30). Paddle is the merchant of record: its overlay takes
   the card, and the site never trusts the browser's word — every payment
   is read back from Paddle's API (confirm route) before tries are counted
   or a Final Pack is let out. PADDLE_ENV sandbox|live, PADDLE_API_KEY
   (server only), PADDLE_CLIENT_TOKEN (public, for Paddle.js). The price
   ids per environment are in paddle-prices.json (tools/paddle-setup.mts). */

export const paddleEnv = (): "sandbox" | "live" => (process.env.PADDLE_ENV === "live" ? "live" : "sandbox");
export const paddleOn = () => !!(process.env.PADDLE_API_KEY && process.env.PADDLE_CLIENT_TOKEN);
export type PriceKey = "try1" | "try3" | "try10" | "pack" | "page" | "designer" | "own";
export const priceIds = (): Record<PriceKey, string> => ((PRICES as Record<string, Record<PriceKey, string>>)[paddleEnv()] || {}) as Record<PriceKey, string>;
export const TRY_RUNS: Partial<Record<PriceKey, number>> = { try1: 1, try3: 3, try10: 10 };

export async function paddleTransaction(id: string): Promise<{ id: string; status: string; created_at: string; items: { price: { id: string } }[]; custom_data?: Record<string, unknown> } | null> {
  const api = paddleEnv() === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
  const r = await fetch(`${api}/transactions/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${process.env.PADDLE_API_KEY}` }, cache: "no-store" });
  if (!r.ok) return null;
  const j = (await r.json()) as { data?: never };
  return j.data || null;
}

/* the Final Pack's receipt: a key only the server can make, bound to the
   transaction — the download asks for it */
export const packToken = (txn: string) => `${txn}.${crypto.createHash("sha256").update(previewKey("pack:" + txn)).digest("base64url").slice(0, 24)}`;
export const packTokenOk = (tok: string) => { const txn = String(tok || "").split(".")[0]; return !!txn && packToken(txn) === tok ? txn : null; };
