import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { listFeedback, addFeedback, deleteFeedback } from "@/lib/admin/feedback";

const STYLES = ["traditional", "contemporary", "punk"];

export async function GET(req: Request) {
  if (!(await requestIsAuthenticated()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const style = url.searchParams.get("style") || undefined;
  return NextResponse.json({ feedback: await listFeedback(style) });
}

export async function POST(req: Request) {
  if (!(await requestIsAuthenticated()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!STYLES.includes(String(body.style)))
    return NextResponse.json({ error: "unknown style" }, { status: 400 });
  if (body.verdict !== "up" && body.verdict !== "down")
    return NextResponse.json({ error: "verdict must be up or down" }, { status: 400 });
  const doc = await addFeedback({
    style: String(body.style),
    variantKey: String(body.variantKey || ""),
    variantLabel: String(body.variantLabel || ""),
    verdict: body.verdict,
    comment: typeof body.comment === "string" ? body.comment : "",
    keep: typeof body.keep === "string" ? body.keep : "",
    fix: typeof body.fix === "string" ? body.fix : "",
    imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : null,
    prompt: typeof body.prompt === "string" ? body.prompt : "",
    story: typeof body.story === "string" ? body.story : "",
  });
  return NextResponse.json({ ok: true, feedback: doc });
}

export async function DELETE(req: Request) {
  if (!(await requestIsAuthenticated()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  return NextResponse.json({ ok: await deleteFeedback(id) });
}
