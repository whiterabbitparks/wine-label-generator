import { NextResponse } from "next/server";
import { paddleEnv, paddleOn, priceIds } from "@/lib/paddle";

/* what Paddle.js needs in the browser — the client token is public by design */
export async function GET() {
  if (!paddleOn()) return NextResponse.json({ on: false });
  return NextResponse.json({ on: true, env: paddleEnv(), token: process.env.PADDLE_CLIENT_TOKEN, prices: priceIds() });
}
