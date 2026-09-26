import { generateOpenAIImage } from "@/lib/image-provider/openai";
import { falUpload } from "@/lib/image-provider/flux";
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
   better, 0.60 invented extras): 0.55 for now, "I'll watch how it goes" */
export const REPAINT_STRENGTH = 0.55;
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

export interface ArtworkPrompt { prompt: string; subject: string; aspect: "landscape" | "portrait" | "square"; kind?: "spot" | "bleed";
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
  const subject = `${brief.vision} ${place ? `Set in ${place}.${gaz}` : ""} No buildings unless the story names them. No text, no letters, no border.`;
  const inStyle = `Painted by ${artist.name}, whose works are the reference images: ${artistCharter(artist)}. Paint a NEW picture in exactly her manner, medium and palette (do not copy the reference subjects).`;
  return { prompt: `${inStyle} ${VIGNETTE} ${subject}${inspiration(d, false)}`, subject, aspect: aspectOf(brief), kind: "spot" };
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
    prompt: ap.prompt + (sketch ? " The last image is the customer's own sketch: follow its subject and arrangement." : ""),
    references: [...refs, ...(sketch ? [sketch] : [])],
    size: GPT_SIZE[ap.aspect], quality: extra.quality || STORY_QUALITY,
  } as never);
}

/* STEP 2 — the hand: FLUX + the artist's LoRA repaints the story picture */
/* an abstraction is repainted at the SAME strength (owner, 2026-09-26:
   "a few stray elements are better than weakening FLUX — we lose the
   style"); only the words ask it to stay abstract */
export async function repaintInHand(model: EvalModel, story: string, ap: ArtworkPrompt, strength = REPAINT_STRENGTH): Promise<string> {
  if (!model.lora) throw new Error(`${model.name} has no trained LoRA yet`);
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY is not set");
  const url = await falUpload(Buffer.from(story.slice(story.indexOf(",") + 1), "base64"), "story.png", "image/png");
  const prompt = `${model.lora.trigger} style. ${ap.abstract
    ? "Repaint this ABSTRACT picture in your own hand — the same marks, patches and shapes in the same places, your own brush, texture and colour. It stays abstract: never turn a mark into a person, face, animal, object or place (at most a leaf, a stem or a tendril), never add letters or a signature."
    : "Repaint this picture in your own hand — same scene, same subjects in the same places, your own colours and brush:"} ${ap.abstract ? "" : ap.subject} Painted as ${artistCharter(model.artist)}. ${ap.kind === "bleed"
    ? (ap.edgeSide
      ? `Keep the composition exactly: the painting runs off the other edges, and on the ${ap.edgeSide} side it ends in its own loose irregular edge with the plain, flat, empty ground beyond it — keep that ground plain and empty, never paint into it, never add a border.`
      : "Paint right to every edge — no empty paper, no margin, no border.")
    : "Keep the plain, empty paper around the drawing."}`.slice(0, 1900);
  const res = await fetch("https://fal.run/fal-ai/flux-lora/image-to-image", {
    method: "POST", headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, image_url: url, strength, num_inference_steps: 28, guidance_scale: 3.5, num_images: 1, output_format: "png", loras: [{ path: model.lora.url, scale: LORA_SCALE }] }),
  });
  const out = (await res.json().catch(() => ({}))) as { images?: { url?: string; content_type?: string }[]; detail?: unknown; error?: string };
  if (!res.ok || !out.images?.[0]?.url) throw new Error(`FLUX + LoRA failed (${res.status}): ${JSON.stringify(out.detail || out.error || out).slice(0, 240)}`);
  const img = await fetch(out.images[0].url);
  if (!img.ok) throw new Error(`FLUX + LoRA image download failed (${img.status})`);
  return `data:${img.headers.get("content-type") || "image/png"};base64,${Buffer.from(await img.arrayBuffer()).toString("base64")}`;
}

/* both steps; `story` is kept so a failed repaint still yields a picture.
   `refSet` is the letter of the owner's set the story was shown (A–D). */
export async function generateArtwork(model: EvalModel, ap: ArtworkPrompt, extra: { sketch?: string | null; quality?: "low" | "medium" | "high"; refSet?: number } = {}): Promise<{ art: string; story: string; repainted: boolean; error?: string; refSet: string }> {
  let { set: refSet, files: refFiles } = nextRefSet(model.artist.id, extra.refSet);
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
      if (attempt === 0) ({ set: refSet, files: refFiles } = nextRefSet(model.artist.id));
      else refSet = refSet ? `${refSet} (no refs)` : "no refs";
    }
  }
  try {
    return { art: await repaintInHand(model, story, ap), story, repainted: true, refSet };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[painter] FLUX + LoRA failed for ${model.id}: ${error} — the story picture ships as painted`);
    return { art: story, story, repainted: false, error, refSet };
  }
}
