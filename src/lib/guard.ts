import { paddleEnv } from "./paddle";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { requestIsAuthenticated } from "@/lib/admin/session";
import { sendMail } from "@/lib/mail";

/* THE GUARD (owner, 2026-09-26/27 — "switch the protections on, as we
   discussed"). Every paid model call is decided HERE, on the server; the
   page only shows what it is told. Layers:

     a VISITOR — a signed cookie; what a browser may paint is counted on it
       (a cleared cookie is a new visitor, so the layers below still hold)
     RUNS — one run is three labels (the wizard's `order` token). A visitor
       gets its free runs (admin → System; one at launch); a confirmed
       e-mail adds ONE more (once per e-mail, ever); more runs are
       bought ($9 = one run, $19 = three)
     the DAILY FREE BUDGET — the breaker: free painting across ALL
       visitors is costed as it happens; at half the budget the owner gets
       an e-mail, at the whole of it free painting pauses until tomorrow
       (bought runs and admins always pass). Editable in admin → System.
     a SOFT IP LIMIT — many Georgians share one IP, so it is generous: it
       only stops one address from starting dozens of runs an hour.
   An admin (logged into /admin in the same browser) is never stopped, and
   is the only one whose "payment" counts until Paddle is connected. */

export const VISITOR_COOKIE = "8k_v";
export type GuardSettings = {
  dailyFreeUsd: number;      /* the breaker */
  paintUsd: number;          /* what one painted label costs us, roughly (0.17 since the locked repaint; 0.22 with the widened band sketches, 2026-09-29) */
  marketingUsd: number;      /* one marketing run (2 shots + 5 images) */
  ipRunsPerHour: number;     /* soft limit on new runs from one address */
  marketingPerDay: number;   /* marketing runs a visitor may start a day */
  paintsPerRun: number;      /* three columns + a retry each */
  freeRuns: number;          /* free runs every visitor starts with (1; more while testing) */
};
export const GUARD_DEFAULTS: GuardSettings = {
  dailyFreeUsd: 20, paintUsd: 0.22, marketingUsd: 0.35, ipRunsPerHour: 12, marketingPerDay: 3, paintsPerRun: 6, freeRuns: 1,
};

export type Visitor = {
  _id: string; createdAt: string; ip: string;
  email?: string; verifiedAt?: string;
  emailRun?: number;          /* 1 once a confirmed e-mail granted its run */
  paidRuns?: number;
  fakeRuns?: number;          /* TEMP (2026-09-28): tries "bought" with the footer's fake-payment switch */
  okPaints?: Record<string, number>;   /* labels a run actually delivered */
  refunds?: Record<string, boolean>;   /* runs given back because nothing was delivered */
  runsUsed?: number;
  orders?: Record<string, number>;
  marketing?: { day: string; n: number };
};

/* the signing key: SESSION_SECRET, else one made once and kept in data/
   (data/ is never deployed, so the server keeps its own) */
let secretCache = "";
function secret(): string {
  if (secretCache) return secretCache;
  if (process.env.SESSION_SECRET) return (secretCache = process.env.SESSION_SECRET);
  const f = path.join(process.cwd(), "data", ".guard-secret");
  try { secretCache = fs.readFileSync(f, "utf8").trim(); } catch { /* made below */ }
  if (!secretCache) {
    secretCache = crypto.randomBytes(32).toString("hex");
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, secretCache);
  }
  return secretCache;
}
/* 2026-09-30 (owner: "the Final Pack's site preview shows the code page —
   show the page itself there; keep the code for real"): the wizard frames
   its own product page with this key, which only the page's maker is
   given (api/product), and /p/<code> shows it unlocked for that one view
   — the page stays locked, `open` is never touched. */
export const previewKey = (code: string) => crypto.createHmac("sha256", secret()).update(`preview:${code}`).digest("base64url").slice(0, 24);
const sign = (id: string) => `${id}.${crypto.createHmac("sha256", secret()).update(id).digest("base64url").slice(0, 32)}`;
function unsign(v: string | undefined): string | null {
  const id = String(v || "").split(".")[0];
  return id && /^[a-z0-9]{16,40}$/.test(id) && sign(id) === v ? id : null;
}

export function ipOf(req: Request): string {
  /* Caddy sets X-Forwarded-For; its FIRST entry is the visitor */
  const xf = req.headers.get("x-forwarded-for") || "";
  return (xf.split(",")[0] || req.headers.get("x-real-ip") || "local").trim().slice(0, 64);
}
const today = () => new Date().toISOString().slice(0, 10);

export async function guardSettings(): Promise<GuardSettings> {
  try {
    const db = await getDb();
    const doc = (await db.collection("settings").findOne({ _id: "guard" } as never)) as (Partial<GuardSettings> & { _id?: string }) | null;
    const { _id, ...saved } = doc || {};
    void _id;
    return { ...GUARD_DEFAULTS, ...saved };
  } catch { return GUARD_DEFAULTS; }
}

/* the visitor behind this request — made (and its cookie set) on first sight */
export async function visitorOf(req: Request, create = true): Promise<Visitor | null> {
  const jar = await cookies();
  const db = await getDb();
  const id = unsign(jar.get(VISITOR_COOKIE)?.value);
  if (id) {
    const v = (await db.collection("visitors").findOne({ _id: id } as never)) as Visitor | null;
    if (v) return v;
  }
  if (!create) return null;
  const v: Visitor = { _id: crypto.randomBytes(12).toString("hex"), createdAt: new Date().toISOString(), ip: ipOf(req), runsUsed: 0, orders: {} };
  await db.collection("visitors").insertOne(v as never);
  await setVisitorCookie(v._id);
  return v;
}
/* the cookie itself, for a response that sets it directly (a redirect) */
export const visitorCookie = (id: string) => ({ name: VISITOR_COOKIE, value: sign(id), options: { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 400 * 24 * 3600 } });
export async function setVisitorCookie(id: string) {
  const jar = await cookies();
  jar.set(VISITOR_COOKIE, sign(id), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 400 * 24 * 3600 });
}

export const runsAllowed = (v: Visitor, s: GuardSettings = GUARD_DEFAULTS) => s.freeRuns + (v.emailRun || 0) + (v.fakeRuns || 0) + (v.paidRuns || 0);
export const runsLeft = (v: Visitor, s: GuardSettings = GUARD_DEFAULTS) => Math.max(0, runsAllowed(v, s) - (v.runsUsed || 0));

/* the day's free spending, and the owner's e-mail at half of it */
async function spendFree(usd: number, s: GuardSettings) {
  const db = await getDb();
  const day = today();
  const r = await db.collection("usage").findOneAndUpdate(
    { _id: day } as never, { $inc: { freeUsd: usd } } as never, { upsert: true, returnDocument: "after" });
  const doc = r as unknown as { freeUsd?: number; alerted?: boolean } | null;
  if (doc && !doc.alerted && (doc.freeUsd || 0) >= s.dailyFreeUsd / 2) {
    await db.collection("usage").updateOne({ _id: day } as never, { $set: { alerted: true } } as never);
    const to = process.env.ALERT_EMAIL;
    if (to) sendMail({
      to, subject: `8K Labels — free painting is at half of today's budget`,
      text: `Free painting today has cost about $${(doc.freeUsd || 0).toFixed(2)} of the $${s.dailyFreeUsd} daily budget. At the full budget free painting pauses until tomorrow (paid runs go on). If this is real customers, raise the budget in admin → System.`,
    }).catch(() => { });
  }
}
export async function freeSpentToday(): Promise<number> {
  try {
    const db = await getDb();
    const d = (await db.collection("usage").findOne({ _id: today() } as never)) as { freeUsd?: number } | null;
    return d?.freeUsd || 0;
  } catch { return 0; }
}

export type Verdict = { ok: true; visitor: Visitor | null; admin: boolean } | { ok: false; status: number; code: string; message: string };

/* STARTING A RUN — the page asks once, before its three labels paint in
   parallel (three simultaneous asks would each spend a run). A new
   `order` token uses one of the visitor's runs. */
export async function startRun(req: Request, order: string): Promise<Verdict> {
  const admin = await requestIsAuthenticated();
  const s = await guardSettings();
  let v: Visitor | null = null;
  try { v = await visitorOf(req); } catch (e) {
    /* the database is down — an admin still paints, a visitor waits */
    if (admin) return { ok: true, visitor: null, admin };
    return { ok: false, status: 503, code: "down", message: e instanceof Error ? e.message : "database unavailable" };
  }
  if (!v) return { ok: false, status: 503, code: "down", message: "no visitor" };
  if (!/^[a-z0-9-]{6,40}$/i.test(order)) return { ok: false, status: 400, code: "no-order", message: "missing run token" };
  if (v.orders?.[order] !== undefined) return { ok: true, visitor: v, admin };
  const db = await getDb();
  /* fake-paid tries (the TEMP test switch) are spent like free ones —
     under the daily free budget and the IP limit — so a stranger who finds
     the switch costs no more than a free visitor */
  const free = (v.runsUsed || 0) < s.freeRuns + (v.emailRun || 0) + (v.fakeRuns || 0);
  /* 2026-10-03 (owner: "switch the daily limit on — we are online now, just
     in case"): while Paddle is the SANDBOX a "paid" try costs nobody
     anything (a test card pays it), so every visitor's run is under the
     daily budget until real payments are live */
  const budgeted = free || paddleEnv() !== "live";
  if (!admin) {
    if (runsLeft(v, s) <= 0) return v.verifiedAt
      ? { ok: false, status: 402, code: "need-pay", message: "every free run is used" }
      : { ok: false, status: 402, code: "need-email", message: "confirm your e-mail for one more free run" };
    if (budgeted && (await freeSpentToday()) >= s.dailyFreeUsd)
      return { ok: false, status: 503, code: "free-paused", message: "today's free labels are all used — come back tomorrow, or buy new versions" };
    if (free) {
      const hour = new Date().toISOString().slice(0, 13);
      const hit = (await db.collection("iphits").findOneAndUpdate({ _id: `${ipOf(req)}|${hour}` } as never, { $inc: { n: 1 }, $setOnInsert: { at: new Date() } } as never, { upsert: true, returnDocument: "after" })) as unknown as { n?: number } | null;
      if ((hit?.n || 0) > s.ipRunsPerHour)
        return { ok: false, status: 429, code: "ip-busy", message: "too many new labels from this network this hour — try again a little later" };
    }
  }
  /* claimed atomically — a double click cannot spend two runs */
  const claim = await db.collection("visitors").updateOne(
    { _id: v._id, [`orders.${order}`]: { $exists: false } } as never,
    { $inc: { runsUsed: 1 }, $set: { [`orders.${order}`]: 0, lastRunAt: new Date().toISOString() } } as never);
  /* the whole run's paint is costed at its start (three labels) */
  if (claim.modifiedCount && budgeted && !admin) await spendFree(3 * s.paintUsd, s);
  return { ok: true, visitor: v, admin };
}

/* ONE PAINTED LABEL: only inside a run this visitor started, a few a run */
export async function allowPaint(req: Request, order: string): Promise<Verdict> {
  const admin = await requestIsAuthenticated();
  if (admin) return { ok: true, visitor: null, admin };
  const s = await guardSettings();
  let v: Visitor | null;
  try { v = await visitorOf(req, false); } catch { return { ok: false, status: 503, code: "down", message: "database unavailable" }; }
  const seen = v?.orders?.[order];
  if (!v || seen === undefined) return { ok: false, status: 403, code: "no-run", message: "start the run first" };
  if (seen >= s.paintsPerRun) return { ok: false, status: 429, code: "run-full", message: "this run has painted its labels" };
  const db = await getDb();
  await db.collection("visitors").updateOne({ _id: v._id } as never, { $inc: { [`orders.${order}`]: 1 } } as never);
  return { ok: true, visitor: v, admin };
}

/* A RUN THAT DELIVERED NOTHING is given back (2026-09-28: the image
   service ran out of credit and every column failed — the visitor must not
   lose a paid try for it). Only a run this visitor started, only if not
   one label of it was delivered, and only once. */
export async function markPainted(v: Visitor | null, order: string) {
  if (!v || !order) return;
  try { const db = await getDb(); await db.collection("visitors").updateOne({ _id: v._id } as never, { $inc: { [`okPaints.${order}`]: 1 } } as never); } catch { /* bookkeeping only */ }
}
export async function refundRun(req: Request, order: string): Promise<boolean> {
  let v: Visitor | null;
  try { v = await visitorOf(req, false); } catch { return false; }
  if (!v || !/^[a-z0-9-]{6,40}$/i.test(order) || v.orders?.[order] === undefined) return false;
  if ((v.okPaints?.[order] || 0) > 0 || v.refunds?.[order]) return false;
  const db = await getDb();
  const r = await db.collection("visitors").updateOne(
    { _id: v._id, [`refunds.${order}`]: { $exists: false }, [`okPaints.${order}`]: { $exists: false } } as never,
    { $inc: { runsUsed: -1 }, $set: { [`refunds.${order}`]: true } } as never);
  return r.modifiedCount > 0;
}

/* A MARKETING RUN: only for a visitor who has made labels, a few a day */
export async function allowMarketing(req: Request): Promise<Verdict> {
  const admin = await requestIsAuthenticated();
  if (admin) return { ok: true, visitor: null, admin };
  const s = await guardSettings();
  let v: Visitor | null;
  try { v = await visitorOf(req, false); } catch { return { ok: false, status: 503, code: "down", message: "database unavailable" }; }
  if (!v || !(v.runsUsed || 0)) return { ok: false, status: 403, code: "no-labels", message: "make your labels first" };
  const day = today();
  const n = v.marketing?.day === day ? v.marketing.n : 0;
  if (n >= s.marketingPerDay) return { ok: false, status: 429, code: "marketing-full", message: "that's today's marketing runs — come back tomorrow" };
  /* the daily budget stops marketing runs too (2026-10-03) */
  if ((await freeSpentToday()) >= s.dailyFreeUsd) return { ok: false, status: 503, code: "free-paused", message: "today's marketing images are all used — come back tomorrow" };
  const db = await getDb();
  await db.collection("visitors").updateOne({ _id: v._id } as never, { $set: { marketing: { day, n: n + 1 } } } as never);
  await spendFree(s.marketingUsd, s);
  return { ok: true, visitor: v, admin };
}

/* the costly routes of the old configurator (/classic): an admin, or the
   free mock provider the tests use */
export async function allowLegacy(): Promise<boolean> {
  return process.env.IMAGE_PROVIDER === "mock" || (await requestIsAuthenticated());
}

export const refuse = (v: Extract<Verdict, { ok: false }>) =>
  new Response(JSON.stringify({ error: v.message, code: v.code }), { status: v.status, headers: { "Content-Type": "application/json" } });
