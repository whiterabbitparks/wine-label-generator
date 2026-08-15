import { NextResponse } from "next/server";
import { requestIsAuthenticated } from "@/lib/admin/session";
import {
  addCustomFont, addFontFeedback, fontScores, fullFontPool,
  FONT_ROLES, LAYOUT_STYLES, type FontRole,
} from "@/lib/admin/layout-refs";

/* Add a specific Google font by NAME (owner, 2026-08-15). The name is
   verified against Google Fonts (css2 answers 400 for unknown families);
   on success the font joins the catalog permanently and is auto-approved
   for the given style+role, so it lands straight in the pool. */
export async function POST(req: Request) {
  if (!(await requestIsAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { style?: string; role?: string; name?: string; weight?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const style = String(body.style);
  if (!(LAYOUT_STYLES as readonly string[]).includes(style))
    return NextResponse.json({ error: "unknown style" }, { status: 400 });
  const role = FONT_ROLES.includes(body.role as FontRole) ? (body.role as FontRole) : null;
  if (!role) return NextResponse.json({ error: "role must be hero|secondary|small" }, { status: 400 });
  const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (!/^[A-Za-z0-9 +.-]{2,}$/.test(name))
    return NextResponse.json({ error: "give the font's exact Google Fonts name, e.g. \"Lobster Two\"" }, { status: 400 });
  const weight = [100, 200, 300, 400, 500, 600, 700, 800, 900].includes(Number(body.weight)) ? Number(body.weight) : 400;

  // verify the family (and weight, when non-400) really exists on Google Fonts
  const axis = weight === 400 ? "" : `:wght@${weight}`;
  const url = `https://fonts.googleapis.com/css2?family=${name.replace(/ /g, "+")}${axis}&display=swap`;
  const check = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }).catch(() => null);
  if (!check || !check.ok)
    return NextResponse.json({
      error: `"${name}"${weight !== 400 ? ` at weight ${weight}` : ""} was not found on Google Fonts — check the exact spelling (fonts.google.com)`,
    }, { status: 400 });

  const font = await addCustomFont(name, weight, style);
  await addFontFeedback({ style, role, family: font.family, weight: font.weight, verdict: "approve", comment: "added by name" });
  const [scores, pool] = await Promise.all([fontScores(), fullFontPool()]);
  return NextResponse.json({ ok: true, font, scores, pool });
}
