import fs from "node:fs";
import { generateOpenAIImage } from "@/lib/image-provider/openai";
import { falUpload } from "@/lib/image-provider/flux";
import { imageQuality } from "@/lib/image-provider";
import { getDb } from "@/lib/db";
import { DEFAULT_REGIONS } from "./regions";
import type { EvalBrief } from "./briefs";
import { aspectOf } from "./briefs";
import { readArtist, listArtists, artistRefs, nextRefSet, artistCharter, isActive, type ArtistProfile } from "@/lib/label/artists";

/* THE PAINTER (round 105, 2026-09-20 — the owner, after nine story
   tests: "we have a winner: gpt-image → FLUX + LoRA at 0.60; drop every
   other model").

   ONE pipeline, two steps, always an artist:
     1. STORY  gpt-image paints the brief's story, shown four of the
               artist's works as references and her charter — it
               understands the story best of every model tried and hands
               back a spot illustration on plain paper (the type's room).
     2. HAND   FLUX + the artist's LoRA repaints that picture image-to-
               image at strength 0.60 — the story stays, the hand becomes
               hers. If FLUX cannot paint (balance, outage) the story
               picture ships as it is, so the customer always gets a label.
   Nothing else paints. The test scripts that found this live in
   data/experiments/ (git-ignored); the marks in data/eval/. */

/* 2026-09-25 (owner, after the 0.60 vs 0.50 test — 0.50 kept the story
   better, 0.60 invented extras): 0.55 for now, "I'll watch how it goes".
   2026-09-27 (owner): 0.53 for every artist.
   2026-09-28 (owner, after the story-lock test — "C for all"): the repaint
   is LOCKED to the sketch's depth (ControlNet Union, depth mode, 0.6, held
   for the first half of the steps) and runs at 0.7 — more of the artist's
   hand, and the story holds better than it did at 0.53. The unlocked 0.53
   stays as the fallback when the locked painter fails. */
export const REPAINT_STRENGTH = 0.7;
export const UNLOCKED_STRENGTH = 0.53;
const LOCK = { scale: 0.6, end: 0.5 };
/* 2026-09-30 (owner: "switch off the rule that paints differently after 60 s
   — the story sometimes runs away, I think that's why"): the locked painter
   is given three minutes and never handed over to the unlocked one */
const LOCK_WAIT_MS = 180000;
const LOCK_ENDPOINT = "fal-ai/flux-general/image-to-image";
const LOCK_NET = "InstantX/FLUX.1-dev-Controlnet-Union";

/* THE WARM-UP (owner's idea, 2026-09-28: "if the painter isn't warmed up,
   paint a tiny image first"). The two-minute wait is fal loading the locked
   painter onto a GPU, whatever the size — so a TINY image (a white
   256-pixel square, four steps, ≈ $0.005) is sent the moment a visitor
   opens the details or the labels page, while they read and type; by
   "Create" the painter is warm. MEASURED on live (2026-09-28): fal keeps it
   warm only ~1–2 minutes after the last use (idle 60 s → 2.6 s; idle
   120 s → 134 s), so the page repeats the tiny image every 50 s while the
   visitor is ACTIVE there; the server lets through at most one every 45 s
   for the whole site, whoever asks. */
let lastWarm = 0;
let blankUrl = "";
/* 2026-09-29 (owner): OFF until the site is published — it costs a little
   whenever someone sits on the details page. Turn on at launch:
   WARM_PAINTER=1 in .env.local (or flip the default here). */
const WARM_ON = process.env.WARM_PAINTER === "1";
export async function warmLockedPainter(): Promise<boolean> {
  if (!WARM_ON) return false;
  if (!process.env.FAL_KEY || Date.now() - lastWarm < 45_000) return false;
  lastWarm = Date.now();
  const model = artistModels().find((m) => m.lora && isActive(m.artist));
  if (!model?.lora) return false;
  try {
    if (!blankUrl) {
      const sharp = (await import("sharp")).default;
      const png = await sharp({ create: { width: 256, height: 256, channels: 3, background: "#ffffff" } }).png().toBuffer();
      blankUrl = await falUpload(png, "warm.png", "image/png");
    }
    await falPost(LOCK_ENDPOINT, {
      prompt: `${model.lora.trigger} style. A small plain sketch.`, image_url: blankUrl, strength: 0.7, num_inference_steps: 4, guidance_scale: 3.5, output_format: "jpeg",
      loras: [{ path: model.lora.url, scale: LORA_SCALE }],
      controlnet_unions: [{ path: LOCK_NET, controls: [{ control_image_url: blankUrl, control_mode: "depth", conditioning_scale: LOCK.scale, end_percentage: LOCK.end }] }],
    }, 180000);
    return true;
  } catch (e) {
    console.warn(`[warm] ${e instanceof Error ? e.message : e}`);
    return false;
  }
}
export const LORA_SCALE = 1.0;

export interface EvalModel {
  id: string;              /* "artist:<id>" */
  name: string;
  artist: ArtistProfile;
  lora: { url: string; trigger: string } | null;
}

export function evalModel(id: string): EvalModel | null {
  return id.startsWith("artist:") ? artistModel(id.slice(7)) : null;
}
export function artistModel(artistId: string): EvalModel | null {
  const a = readArtist(artistId);
  /* an artist switched off (profile.json "active": false) has no model,
     so even a saved column map pointing at her falls through to one of
     the artists who are on */
  /* 2026-09-26: a new artist under test is switched off on the site but
     may paint in a test script that names her in PREVIEW_ARTISTS (the
     server never sets it) */
  const preview = (process.env.PREVIEW_ARTISTS || "").split(",").map((x) => x.trim()).includes(artistId);
  if (!a || (!isActive(a.profile) && !preview)) return null;
  return { id: `artist:${a.profile.id}`, name: a.profile.name, artist: a.profile, lora: a.lora ? { url: a.lora.url, trigger: a.lora.trigger } : null };
}
export function artistModels(): EvalModel[] {
  return listArtists().map((a) => artistModel(a.profile.id)).filter((m): m is EvalModel => !!m);
}

/* THE GAZETTEER (owner 2026-09-19: Svaneti towers on a Racha label — a
   region NAME means nothing to a painter; it needs what the region LOOKS
   like). Owner-written, 2-3 sentences per region, in /admin → Regions;
   used whenever the brief's region matches. */
export async function regionNote(region: string): Promise<string> {
  if (!region) return "";
  let map: Record<string, string> = DEFAULT_REGIONS;          /* Claude's drafts until the owner saves */
  try {
    const db = await getDb();
    const doc = (await db.collection("settings").findOne({ _id: "regions" } as never)) as { map?: Record<string, string> } | null;
    if (doc?.map) map = doc.map;
  } catch { /* the drafts still apply */ }
  const key = Object.keys(map).find((k) => k.trim().toLowerCase() === region.trim().toLowerCase());
  return key && map[key]?.trim() ? ` ${region.trim()} looks like this: ${map[key].trim()} ` : "";
}

export interface ArtworkPrompt { guide?: string; /* a composition line for the SKETCH only */ around?: string; /* what lies round a floating drawing: "paper", or the artist's own ground (Pirosmani's black) */ grapes?: string; prompt: string; subject: string; aspect: "landscape" | "portrait" | "square"; kind?: "spot" | "bleed";
  /* 2026-09-23: a band/panel picture ends in the painter's own edge on
     this side (the side facing the type) — see hybrid.ts */
  edgeSide?: string;
  /* 2026-09-26: no idea and no sketch — an abstraction (see abstractSubject) */
  abstract?: boolean }

/* THE VIGNETTE — the one composition every model knows: an isolated spot
   illustration on a flat plain ground with air around it. The composer
   trims the air and sets the type on that same paper: nothing is ever
   cut or covered, the drawing ends where the artist ended it. */
/* 2026-09-25: "never an oval" — the drawing's outline is its own, not a
   geometric patch (the owner, on Levan's sharp ovals) */
const VIGNETTE = "A spot illustration: one self-contained drawing isolated on a flat, plain, single-colour background with empty margin all around; the drawing's edges finish naturally — they are the edges the painter chose, soft and irregular, never a frame, never a straight cut, never a border, never an oval or circular patch.";
/* 2026-09-23 (owner, exhausted and right): "generate the image the way I
   showed you — with the free zones and the ink at the proportion I
   explained". Asking the model to fill a whole sheet was my mistake: it
   left NO free zone, so in a layout the picture could only ever be a torn
   fragment. There is now ONE kind of ask, the one his diagram draws and
   the one the model has always done well: a drawing with the ragged edge
   the painter chose, standing on plain ground with room around it. The
   free zone is ours to size afterwards — it is arithmetic, not a wish. */
/* 2026-09-23 night (owner: "forget putting Mariam only in the oval —
   every artist's style must get the same share of the layouts, whoever
   the artist; forget the white or light ground rule; let's see what comes
   out and I'll correct it"). The one-ask rule above is REVOKED for the
   band and panel layouts: those ask every artist for a painting that
   runs off every edge, so a band is a band in Mariam's hand too (her
   LoRA had kept her paper and floated a small oval in every layout).
   The spot layouts keep the vignette — a spot IS a drawing on paper. */
export const BLEED = "A full painting that covers the whole canvas right to every edge: no empty margin, no plain paper showing, no frame, no border — the scene simply runs off all four sides, as if the sheet were cut from a larger painting.";

/* rebuild the ask for the OTHER kind of picture, keeping everything the
   artist's charter and the story already put into it */
export function asKind(ap: ArtworkPrompt, kind: "spot" | "bleed"): ArtworkPrompt {
  if (ap.kind === kind) return ap;
  const swap = kind === "bleed" ? [VIGNETTE, BLEED] : [BLEED, VIGNETTE];
  return { ...ap, kind, prompt: ap.prompt.replace(swap[0], swap[1]) };
}
/* 2026-09-26 (owner: "when they write nothing and upload no sketch, let
   it be an ABSTRACTION — the artist's style told through patches,
   colours and shapes, without needless concreteness"). No story means no
   story: the ask is the artist's own marks, composed; the wine is present
   only as a leaning of colour and energy. */
const WINE_MOOD: [RegExp, string][] = [
  [/ros/i, "a soft blush of pink and coral"],
  [/amber|orange/i, "warm amber, honey and apricot notes"],
  [/white/i, "light, airy notes of pale gold and green"],
  [/red/i, "a warm, deep accent of wine red and plum"],
];
/* 2026-09-26 (owner): the wine's own details may INSPIRE — its name's
   meaning, its place — but only ever as mood and colour, never over the
   customer's own words, and never as written words in the picture */
function inspiration(d: EvalBrief["data"], abstract: boolean): string {
  const x = d as { wine?: string; region?: string; country?: string; special?: string };
  const name = String(x.wine || "").trim(), place = [x.region, x.country].filter(Boolean).join(", ");
  if (!name && !place) return "";
  const bits = [name ? `the wine is called “${name}” — take only what that name MEANS or evokes (a light, a season, a feeling, a rhythm)` : "", place && abstract ? `it comes from ${place} — take only a hint of that place's COLOURS, as marks: never its land, horizon, hills, houses or people` : ""].filter(Boolean);
  return ` ${abstract ? "INSPIRATION" : "SECONDARY INSPIRATION — it never changes, adds to or replaces the story above"}: ${bits.join("; ")}. NEVER write these words, or any letters, anywhere in the picture.`;
}

/* 2026-09-27 (owner: "cigarettes keep turning up in Levan's pictures —
   unless the idea or the name asks for one, don't show it"). Four of his
   eighteen works have someone smoking, so the hand and the references
   both carry it; the ask now says no, unless the customer's own words
   bring smoking in. It rides `subject`, so the FLUX repaint hears it too. */
const SMOKE_WORDS = /smok|cigar|tobac|pipe|hookah|shisha|vape|სიგარ|თამბაქ|მოწევ|ყალიან|ჩიბუხ/i;
function noSmoking(brief: EvalBrief): string {
  const d = brief.data as Record<string, string | undefined>;
  const own = [brief.vision, d.wine, d.producer, d.special].filter(Boolean).join(" ");
  return SMOKE_WORDS.test(own) ? "" : " Nobody smokes: no cigarette, cigar or pipe anywhere, no smoke drifting from a mouth or a hand.";
}

function abstractSubject(d: EvalBrief["data"]): string {
  const mood = WINE_MOOD.find(([re]) => re.test(String((d as { wineColorName?: string }).wineColorName || "")))?.[1];
  return "ABSTRACT — NO STORY, NO SUBJECT: there is no scene to tell. Paint an ABSTRACT composition made only of this artist's own marks — patches and washes of colour, brushstrokes, lines, scribbles, dots, drips and textures — arranged into one lively, balanced composition with rhythm, contrast and a clear focal area, exactly as the artist would compose them. " +
    "No people, no faces, no animals, no objects, no landscape, no horizon, no buildings. " +
    /* owner: "if it must draw something, let it be nature — carefully, so it
       never starts on qvevri or white grapes for a red" — no wine, no grapes */
    "If any mark does become recognisable, let it be a natural, organic form only — a leaf, a stem, a petal, a reed, a curling vine tendril — never a grape or a bunch, never a vessel, bottle or glass. " +
    (mood ? `Within the artist's own palette, lean a little toward ${mood}. ` : "") +
    inspiration(d, true) + " No signature, no border.";
}

/* 2026-09-28 (owner: "a white wine, and the label showed red grapes — I
   wrote grapes in the idea but not their colour"): any grapes painted take
   the WINE's colour family. Amber/orange wine is made from white grapes,
   rosé from red ones. Nothing is said when the colour is unknown. */
export function grapeColourLine(wineColour?: string): string {
  const c = String(wineColour || "").toLowerCase();
  if (/white|amber|orange|თეთრ|ქარვ/.test(c)) return "Any grapes in the picture are WHITE-wine grapes — pale green to golden yellow berries — never red, purple or black grapes.";
  if (/ros|ვარდ/.test(c)) return "Any grapes in the picture are red-skinned grapes, as rosé is made from red grapes — purple-red berries — never green grapes.";
  if (/red|წითელ/.test(c)) return "Any grapes in the picture are RED-wine grapes — deep purple-black to dark red berries — never green or golden grapes.";
  return "";
}

export async function buildArtworkPrompt(brief: EvalBrief, artist: ArtistProfile, abstract = false): Promise<ArtworkPrompt> {
  const d = brief.data;
  if (abstract) {
    const subject = abstractSubject(d);
    const inStyle = `Painted by ${artist.name}, whose works are the reference images: ${artistCharter(artist)}. Paint a NEW picture in exactly this artist's manner, medium and palette — take only the HAND from the references, never their subjects.`;
    return { prompt: `${inStyle} ${VIGNETTE} ${subject}`, subject, aspect: aspectOf(brief), kind: "spot", abstract: true };
  }
  const place = [d.region, d.country].filter(Boolean).join(", ");
  const gaz = await regionNote(d.region);
  /* the inspiration rides the SKETCH's ask only — the FLUX repaint reads
     `subject`, and a quoted name there could come back as painted letters */
  const grapes = grapeColourLine((d as { wineColorName?: string }).wineColorName);
  const subject = `${brief.vision} ${place ? `Set in ${place}.${gaz}` : ""} No buildings unless the story names them.${noSmoking(brief)}${grapes ? ` ${grapes}` : ""} No text, no letters, no border.`;
  const inStyle = `Painted by ${artist.name}, whose works are the reference images: ${artistCharter(artist)}. Paint a NEW picture in exactly her manner, medium and palette (do not copy the reference subjects).`;
  return { prompt: `${inStyle} ${VIGNETTE} ${subject}${inspiration(d, false)}`, subject, grapes, aspect: aspectOf(brief), kind: "spot" };
}

const GPT_SIZE = { landscape: { w: 1536, h: 1024 }, portrait: { w: 1024, h: 1536 }, square: { w: 1024, h: 1024 } } as const;

/* STEP 1 — the story, by gpt-image, with the artist's four works beside
   the ask (and the customer's own sketch, when there is one).

   2026-09-22 (the owner, on cost: "the gpt image is the dearest thing on
   the bill, and as I understand it is only a sketch for FLUX to repaint
   — is a big gpt image not a waste?"). It IS only a sketch: FLUX repaints
   it at strength 0.60, so what survives into the label is the story and
   the arrangement, not gpt-image's own rendering. The quality is a knob,
   not a constant, so it can be proven and then set — see STORY_QUALITY. */
/* 2026-09-25: LOW — the owner judged the 2026-09-22 low-vs-medium test
   ("the high-quality sketch isn't needed"; FLUX repaints it anyway), and
   measured, low costs $0.042 a sketch against medium's $0.078 */
export const STORY_QUALITY = (process.env.STORY_QUALITY as "low" | "medium" | "high") || "low";
export async function paintStory(model: EvalModel, ap: ArtworkPrompt, extra: { sketch?: string | null; quality?: "low" | "medium" | "high"; refFiles?: string[]; noRefs?: boolean } = {}): Promise<string> {
  const sketch = extra.sketch && extra.sketch.startsWith("data:image/") ? extra.sketch : null;
  const refs = extra.noRefs ? [] : artistRefs(model.artist.id, 4, extra.refFiles);
  return generateOpenAIImage({
    prompt: ap.prompt + (sketch ? " The last image is the customer's own sketch: follow its subject and arrangement." : "")
      + (ap.guide || ""),
    references: [...refs, ...(sketch ? [sketch] : [])],
    size: GPT_SIZE[ap.aspect], quality: extra.quality || STORY_QUALITY,
  } as never);
}

/* STEP 2 — the hand: FLUX + the artist's LoRA repaints the story picture */
/* an abstraction is repainted at the SAME strength (owner, 2026-09-26:
   "a few stray elements are better than weakening FLUX — we lose the
   style"); only the words ask it to stay abstract */
/* the artist's HAND only — medium, handwriting, colour, what she never
   does, the owner's note — without `form` and `mood`, whose lists of
   subjects ("horses, bulls, dogs…", "open form, not detailed") FLUX read
   as things to paint (2026-09-28: a deer came back as Dachi's horse) */
export const handCharter = (p: ArtistProfile) => `${p.medium}; ${p.words.join(", ")}; colour: ${p.colour}; ${p.never}${p.note ? `; ${p.note}` : ""}`;
/* 2026-09-28: HAND-ONLY is the default — tested on "Deer has vine tree
   instead of horns": Mariam's deer survived the repaint (it had melted
   into a tree), Levan and Giorgi unchanged; the older wording stays
   reachable with handOnly: false */
/* what the sketch ACTUALLY shows, literally — the repaint is told this
   instead of the customer's idea, so its words and the picture it is
   given agree (gpt-image adds its own churches, jars and vines, and the
   words never mentioned them). A failure falls back to the idea. */
async function captionOf(story: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return "";
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "Describe what this illustration shows, literally, for a painter who must repaint it keeping every subject. Name each figure, animal and object, what it is doing, any unusual detail that makes the picture's idea (e.g. antlers made of vines), and where it is (left, centre, right, foreground, background). No style, colour or medium words. One paragraph, at most 70 words." },
          { role: "user", content: [{ type: "image_url", image_url: { url: story, detail: "low" } }] },
        ],
      }),
    });
    if (!res.ok) return "";
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return (j.choices?.[0]?.message?.content || "").trim();
  } catch { return ""; }
}

async function falPost(endpoint: string, body: unknown, ms: number): Promise<Record<string, unknown>> {
  const res = await fetch(`https://fal.run/${endpoint}`, {
    method: "POST", headers: { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(ms),
  });
  const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`${endpoint} failed (${res.status}): ${JSON.stringify(out.detail || out.error || out).slice(0, 240)}`);
  return out;
}
const firstUrl = (j: Record<string, unknown>) => String((j.image as { url?: string } | undefined)?.url || (j.images as { url?: string }[] | undefined)?.[0]?.url || "");

export async function repaintInHand(model: EvalModel, story: string, ap: ArtworkPrompt, strength = REPAINT_STRENGTH, opts: { handOnly?: boolean; unlocked?: boolean; small?: boolean } = { handOnly: true }): Promise<string> {
  if (!model.lora) throw new Error(`${model.name} has no trained LoRA yet`);
  if (!process.env.FAL_KEY) throw new Error("FAL_KEY is not set");
  const handOnly = opts.handOnly !== false;
  /* PAINT_SMALL=1 (tests) or `small` (the admin's layout batch): the
     repaint gets a smaller picture — about half the price; the question a
     test or a placement correction asks does not need print resolution */
  let storyBuf = Buffer.from(story.slice(story.indexOf(",") + 1), "base64");
  /* 2026-09-30 (owner: "keep the large resolution, but until we launch use
     the minimum everywhere — there are many tests"): the site-wide switch
     IMAGE_QUALITY decides — "prod" paints large (1536), anything else small
     (1024). LAUNCH: set IMAGE_QUALITY=prod on the server. */
  if (opts.small || process.env.PAINT_SMALL === "1" || imageQuality() !== "prod") storyBuf = await (await import("sharp")).default(storyBuf).resize(1024, 1024, { fit: "inside" }).png().toBuffer();
  const url = await falUpload(storyBuf, "story.png", "image/png");
  const locked = !opts.unlocked;
  /* the locked repaint reads the sketch's own description (an abstraction
     keeps its abstract wording); the depth map is made alongside */
  const [what, depthUrl] = locked
    ? await Promise.all([
      ap.abstract ? Promise.resolve("") : captionOf(story),
      (async () => {
        for (let k = 0; k < 2; k++) { const d = await falPost("fal-ai/image-preprocessors/depth-anything/v2", { image_url: url }, 60000).then(firstUrl).catch(() => ""); if (d) return d; }
        return "";
      })(),
    ])
    : ["", ""];
  const prompt = `${model.lora.trigger} style. ${ap.abstract
    ? "Repaint this ABSTRACT picture in your own hand — the same marks, patches and shapes in the same places, your own brush, texture and colour. It stays abstract: never turn a mark into a person, face, animal, object or place (at most a leaf, a stem or a tendril), never add letters or a signature."
    : handOnly
      ? "Repaint this picture in your own hand. KEEP WHAT IT SHOWS — every figure, animal and object stays exactly what it is and where it is (a deer stays a deer, a person stays a person); change only the hand: your own line, brush, texture and colours. It shows:"
      : "Repaint this picture in your own hand — same scene, same subjects in the same places, your own colours and brush:"} ${ap.abstract ? "" : (what ? `${what}${ap.grapes ? ` ${ap.grapes}` : ""}` : ap.subject)} Painted as ${handOnly ? handCharter(model.artist) : artistCharter(model.artist)}. ${ap.kind === "bleed"
    ? (ap.edgeSide
      ? `Keep the composition exactly: the painting runs off the other edges, and on the ${ap.edgeSide} side it ends in its own loose irregular edge with the plain, flat, empty ground beyond it — keep that ground plain and empty, never paint into it, never add a border.`
      : "Paint right to every edge — no empty paper, no margin, no border.")
    : `Keep the plain, empty ${ap.around || "paper"} around the drawing.`}${what ? " No text, no letters, no border." : ""}`.slice(0, 1900);
  let out: Record<string, unknown> | null = null;
  if (locked && !depthUrl) throw new Error("the sketch's depth map could not be made");
  if (locked && depthUrl) {
    /* a cold painter can take two minutes to wake — it is waited for (up
       to three), and a real error (not a timeout) is tried once more; the
       unlocked painter no longer takes over (2026-09-30, owner) */
    for (let k = 0; k < 2 && !(out && firstUrl(out)); k++) {
      try {
        out = await falPost(LOCK_ENDPOINT, {
          prompt, image_url: url, strength, num_inference_steps: 28, guidance_scale: 3.5, output_format: "png",
          loras: [{ path: model.lora.url, scale: LORA_SCALE }],
          controlnet_unions: [{ path: LOCK_NET, controls: [{ control_image_url: depthUrl, control_mode: "depth", conditioning_scale: LOCK.scale, end_percentage: LOCK.end }] }],
        }, LOCK_WAIT_MS);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[painter] ${model.id}: locked repaint failed (${msg})${k === 0 && !/abort|timeout/i.test(msg) ? " — trying again" : ""}`);
        if (/abort|timeout/i.test(msg)) break;
      }
    }
    if (!out || !firstUrl(out)) throw new Error("the locked painter did not finish");
  }
  if (!out || !firstUrl(out)) {
    out = await falPost("fal-ai/flux-lora/image-to-image", {
      prompt, image_url: url, strength: locked ? UNLOCKED_STRENGTH : strength, num_inference_steps: 28, guidance_scale: 3.5, num_images: 1, output_format: "png",
      loras: [{ path: model.lora.url, scale: LORA_SCALE }],
    }, 180000);
  }
  const img = await fetch(firstUrl(out));
  if (!img.ok) throw new Error(`FLUX + LoRA image download failed (${img.status})`);
  return `data:${img.headers.get("content-type") || "image/png"};base64,${Buffer.from(await img.arrayBuffer()).toString("base64")}`;
}

/* both steps; `story` is kept so a failed repaint still yields a picture.
   `refSet` is the letter of the owner's set the story was shown (A–D). */
export async function generateArtwork(model: EvalModel, ap: ArtworkPrompt, extra: { sketch?: string | null; quality?: "low" | "medium" | "high"; refSet?: number; small?: boolean; accept?: (story: string) => Promise<boolean>; retry?: string | (() => string) } = {}): Promise<{ art: string; story: string; repainted: boolean; error?: string; refSet: string }> {
  let { set: refSet, files: refFiles } = nextRefSet(model.artist.id, extra.refSet, !!ap.abstract);
  /* 2026-09-23 (owner: "sometimes one of the three labels never comes —
     its place stays empty"): OpenAI's filter refuses some asks at random
     ("moderation_blocked / other"), and the refusal usually rides on a
     reference work. A refused story is asked again on the artist's NEXT
     trio, and once more with no reference works at all (the charter and
     the LoRA still carry the hand), before a column is given up. */
  let story = "";
  for (let attempt = 0; ; attempt++) {
    try {
      story = await paintStory(model, ap, { ...extra, refFiles: attempt < 2 ? refFiles : [] , noRefs: attempt >= 2 });
      break;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/moderation|safety system/i.test(msg) || attempt >= 2) throw e;
      console.warn(`[painter] ${model.id}: refused on set ${refSet || "-"} — ${attempt === 0 ? "next trio" : "no reference works"}`);
      if (attempt === 0) ({ set: refSet, files: refFiles } = nextRefSet(model.artist.id, undefined, !!ap.abstract));
      else refSet = refSet ? `${refSet} (no refs)` : "no refs";
    }
  }
  /* 2026-09-29 (owner: "nowhere on a label should a cut illustration
     show"). A picture that must float on its paper (a spot, a panel) is
     checked on the cheap SKETCH, before the costly repaint: no plain paper
     all round → the sketch is drawn again with the ask made firmer, at
     most twice. A refusal on a retry keeps the sketch there is. */
  for (let k = 0; extra.accept && k < 2 && !(await extra.accept(story).catch(() => true)); k++) {
    const why = typeof extra.retry === "function" ? extra.retry() : extra.retry || "";
    console.warn(`[painter] ${model.id}: the sketch was refused (${why.slice(0, 60)}…) — drawn again (${k + 1}/2)`);
    try { story = await paintStory(model, { ...ap, prompt: `${ap.prompt} ${why}` }, { ...extra, refFiles }); }
    catch (e) { console.warn(`[painter] retry failed: ${e instanceof Error ? e.message : e}`); break; }
  }
  /* dev aid: PAINT_DEBUG_DIR keeps the sketch and the ask */
  const dbg = process.env.PAINT_DEBUG_DIR, tag = `${model.artist.id}-${Date.now()}`;
  if (dbg) { fs.writeFileSync(`${dbg}/${tag}-1-sketch.png`, Buffer.from(story.slice(story.indexOf(",") + 1), "base64")); fs.writeFileSync(`${dbg}/${tag}-0-prompt.txt`, ap.prompt); }
  try {
    return { art: await repaintInHand(model, story, ap, undefined, { handOnly: true, small: extra.small }), story, repainted: true, refSet };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[painter] FLUX + LoRA failed for ${model.id}: ${error} — the story picture ships as painted`);
    return { art: story, story, repainted: false, error, refSet };
  }
}
