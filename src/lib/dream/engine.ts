import { generateOpenAIImage } from "@/lib/image-provider/openai";
import { finishArtwork, keyArtwork } from "@/lib/image-provider";
import { restyleWithFlux } from "@/lib/image-provider/flux";
import { getProfiles } from "@/lib/admin/style-refs";
import { feedbackAggregates } from "@/lib/admin/feedback";
import { getImageRules, ruleLines, verifyImage, NO_TEXT_RULE, WHITE_BG_RULE, NO_BORDER_RULE } from "@/lib/admin/image-rules";
import { assembleDreamRules } from "@/lib/dream/rules";
import { analyzeArtwork } from "@/lib/admin/art-analysis";
import { getDb } from "@/lib/db";
import { PNG } from "pngjs";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

/* DREAM ENGINE CORE (extracted 2026-08-25 so the admin studio and the
   public customer flow share one implementation — see the admin route
   for the full architecture story). */

const GOOGLE_FONTS = [
  "Playfair Display", "Cormorant Garamond", "EB Garamond", "Libre Baskerville", "Lora",
  "Crimson Text", "Cinzel", "Marcellus", "Spectral", "Prata", "Bodoni Moda",
  "DM Serif Display", "Abril Fatface", "Rozha One", "Yeseva One", "Fraunces",
  "Cardo", "Alegreya", "IM Fell English", "Grenze", "Philosopher",
  "Oswald", "Bebas Neue", "Anton", "Archivo", "Archivo Narrow", "Montserrat",
  "Raleway", "Jost", "Inter", "Work Sans", "Barlow Condensed", "Josefin Sans",
  "Poppins", "Nunito Sans", "Cabin", "Special Elite", "Courier Prime",
  "Great Vibes", "Dancing Script", "Sacramento", "Allura", "Parisienne",
  "Tangerine", "Italianno", "Pinyon Script", "Amatic SC", "Caveat",
  "Permanent Marker", "Shadows Into Light",
];

const STYLE_MOOD: Record<string, string> = {
  traditional:
    "classic european wine label tradition — engraved or etched illustration, refined serif typography, calm symmetry or classical hierarchy",
  contemporary:
    "modern boutique wine label — bold editorial typography, expressive illustration (linocut, silkscreen, collage, gouache), confident whitespace",
  punk: "loud natural-wine label — raw expressive artwork, punchy type, fearless colour, poster energy",
  free: "whatever serves the story best — full artistic freedom",
};

function labelTexts(d: Record<string, string>) {
  return {
    producer: d.producer || "", wine: d.wine || "Wine", appellation: d.appellation || "",
    grape: d.grape || "", vintage: d.vintage || "", region: [d.region, d.country].filter(Boolean).join(", "),
    classification: d.classification || "", special: d.special || "",
    legal: [
      [d.sweetness, d.wineColorName, "Wine"].filter(Boolean).join(" "),
      `${d.alcohol || "12.5"}% Alc. by Vol. / ${d.volume || "750"} mL`,
    ].join(" / "),
  };
}


/* COMPOSITION CARD DECK (owner 2026-08-25): each dream deals one of the
   style's arrangement cards — full coverage before any repeat, so
   consecutive dreams vary in composition, not just in dressing. */
const cardBags: Record<string, string[]> = {};
function dealCompositionCard(style: string, cards: { key: string; arrangement: string }[]): { key: string; arrangement: string } | null {
  if (!cards.length) return null;
  let bag = cardBags[style];
  if (!bag || !bag.length || !bag.every((k) => cards.some((c) => c.key === k))) {
    bag = cards.map((c) => c.key);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    cardBags[style] = bag;
  }
  const key = bag.shift() as string;
  return cards.find((c) => c.key === key) || cards[0];
}

/* three styles dream in parallel from the classic page — a burst can trip
   the images rate limit; honour the hint and retry once */
async function gen429<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/429|rate.?limit/i.test(msg)) throw e;
    const hinted = msg.match(/try again in (\d+(?:\.\d+)?)s/i);
    await new Promise((r) => setTimeout(r, hinted ? Math.ceil(parseFloat(hinted[1]) * 1000) + 1000 : 20000));
    return fn();
  }
}

export interface DreamParams { vision: string; style?: string; data: Record<string, string>; sketch?: string | null }
export interface RebuildParams { dream: string; vision: string; data: Record<string, string>; style?: string; reuseArtwork?: string | null }

export async function runDreamPhase(p: DreamParams): Promise<{ dream: string; prompt: string }> {
  const body = { style: p.style, sketch: p.sketch };
  const vision = p.vision;
  const texts = labelTexts(p.data);
    const style = ["traditional", "contemporary", "punk"].includes(String(body.style)) ? String(body.style) : "traditional";
    // the owner's dream-refinement corpus steers future dreams
    let guidance = "";
    let composition = "";
    try {
      const db = await getDb();
      // the dream charter: the board's spirit, distilled — never the images.
      // PER STYLE (owner 2026-08-25): each style keeps its own reference
      // board and charter; "free" dreams run uncharted.
      if (style !== "free") {
        const ch = (await db.collection("settings").findOne({ _id: `dream-charter-${style}` } as never)) as { text?: string } | null;
        if (ch?.text) guidance += ` House design spirit for this style (learned from the art director's reference labels): ${ch.text}`;
        const cd = (await db.collection("settings").findOne({ _id: `dream-cards-${style}` } as never)) as { cards?: { key: string; arrangement: string }[] } | null;
        const card = dealCompositionCard(style, cd?.cards || []);
        if (card) composition = ` COMPOSITION — arrange the label exactly in this scheme: ${card.arrangement}`;
      }
      const rows = (await db.collection("dream_feedback")
        .find({ comment: { $ne: "" } }, { projection: { _id: 0, verdict: 1, comment: 1 } })
        .sort({ at: -1 }).limit(12).toArray()) as unknown as { verdict: string; comment: string }[];
      const like = rows.filter((r) => r.verdict === "approve").map((r) => r.comment);
      const avoid = rows.filter((r) => r.verdict === "reject").map((r) => r.comment);
      if (like.length) guidance += ` The art director praised in past designs: ${like.join("; ")}.`;
      if (avoid.length) guidance += ` The art director criticised in past designs: ${avoid.join("; ")} — avoid these.`;
    } catch {}
    const prompt =
      `Design a complete, finished wine label — a flat, straight-on, full-bleed rectangular label design ` +
      `(landscape 3:2). Not a bottle photo, not a mockup: the printed label artwork itself, edge to edge. ` +
      `Style: ${STYLE_MOOD[style]}. ` +
      (vision ? `The illustration tells this story: ${vision}. ` : "") +
      `The label carries these texts — respect this visual HIERARCHY, largest to smallest: ` +
      `1) wine name "${texts.wine}" (the biggest, the hero)` +
      (texts.producer ? `, 2) producer "${texts.producer}"` : "") +
      (texts.appellation || texts.vintage
        ? `, 3) ${[texts.appellation && `appellation "${texts.appellation}"`, texts.vintage && `vintage "${texts.vintage}"`].filter(Boolean).join(" and ")}`
        : "") +
      (texts.grape || texts.region
        ? `, 4) ${[texts.grape && `grape "${texts.grape}"`, texts.region && `origin "${texts.region}"`].filter(Boolean).join(" and ")}`
        : "") +
      `, 5) small legal text "${texts.legal}" (the smallest). ` +
      (composition || ` Integrated, gallery-quality composition — type and image designed as one whole.`) +
      guidance;
    try {
      /* DREAM RULES (owner 2026-08-25): the same rule-then-verify treatment
         the image pipeline always had — prompt clauses, a vision check on
         the dream, one strict regeneration on violation. */
      const dr = await assembleDreamRules(vision);
      const makeDream = async (extra = "") => {
        const job: Record<string, unknown> = { prompt: prompt + dr.clauses + extra, size: "landscape" };
        if (body.sketch && String(body.sketch).startsWith("data:image/")) job.reference = body.sketch;
        return gen429(() => generateOpenAIImage(job as never));
      };
      let dream = await makeDream();
      try {
        const check = await verifyImage(dream, dr.checks as never);
        if (!check.ok)
          dream = await makeDream(` STRICT — the previous design violated: ${check.violations.join(" | ")}. Follow every design law exactly.`);
      } catch {}
      return { dream, prompt };
    } catch (e) {
      throw new Error(`dream failed: ${e instanceof Error ? e.message : e}`);
    }
}

export interface RebuildResult {
  spec: Record<string, unknown>; artwork: string | null; artAlign: string;
  artworkMode: "contained" | "full"; styleKey: string; fonts: string[];
  artworkError?: string;
  artInk?: { x: number; y: number; w: number; h: number } | null;
}
export async function runRebuildPhase(p: RebuildParams): Promise<RebuildResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const body = { style: p.style };
  const vision = p.vision;
  const dream = p.dream;
  const texts = labelTexts(p.data);
  // 1. transcription — replicate, don't redesign
  const model = process.env.OPENAI_VISION_MODEL || "gpt-4o";
  const sysPrompt =
    "You are a meticulous design technologist. You receive a finished wine-label design and transcribe its LAYOUT as JSON " +
    "so it can be replicated EXACTLY in vector. Read geometry, not words: for each visible text element give " +
    "box {x,y,w,h} as fractions of the image (x,y top-left corner of the text block), " +
    "role matched against the known texts (wine, producer, appellation, grape, vintage, region, classification, special, legal), " +
    "align l|c|r (relative to its own box), caps true/false, tracking 0-0.4, " +
    "font = the visually CLOSEST match from the allowed list, plus fontAlts = the 2 next-closest candidates (look at serifs, weight, width, script character), " +
    "weight 300-800, colour as exact hex sampled from the glyphs, lines (how many lines the element occupies). " +
    "Also: ground (label background hex) and artwork {coverage, box, subject (one sentence, the illustration only), palette (up to 4 hex)}. " +
    "coverage is \"full\" when the illustration/scenery/texture extends behind or around the text across most of the label (the text sits INSIDE the scene), " +
    "or \"contained\" when the illustration occupies its own clear region separate from the text; for full coverage, box = the main subject's area. " +
    'Strict JSON: {"ground":"#..","elements":[{"role":"..","box":{"x":..,"y":..,"w":..,"h":..},"align":"c","caps":true,"arc":false,"tracking":0.1,"font":"..","fontAlts":["..",".."],"weight":600,"colour":"#..","lines":1}],"artwork":{"box":{..},"subject":"..","palette":["#.."]}} ' +
    "Every ROLE at most once — a text split across blocks gets ONE element whose box covers all its parts.";
  let spec: Record<string, unknown> = {};
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sysPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Known label texts:\n${JSON.stringify(texts, null, 1)}\nAllowed fonts:\n${GOOGLE_FONTS.join(", ")}`,
              },
              { type: "image_url", image_url: { url: dream, detail: "high" } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`vision ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    spec = JSON.parse(json.choices?.[0]?.message?.content || "{}");
  } catch (e) {
    throw new Error(`transcription failed: ${e instanceof Error ? e.message : e}`);
  }

  /* 1b. COLOURS ARE MEASURED, NEVER GUESSED (owner report 2026-08-25: the
     vision model's hex guesses gave blue-grey text and an olive ground
     where the dream is warm parchment). We own the dream's pixels: ground
     = the dominant light tone of the page; each element's ink = the mean
     of the dark glyph pixels inside its own transcribed box. */
  try {
    const m = dream.match(/^data:image\/png;base64,(.+)$/);
    if (m) {
      const png = PNG.sync.read(Buffer.from(m[1], "base64"));
      const { width: PW, height: PH, data: px } = png;
      const hex = (r: number, g: number, b: number) =>
        "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
      // ground: mean of light pixels across the page
      let gr = 0, gg = 0, gb = 0, gn = 0;
      for (let y = 0; y < PH; y += 7) for (let x = 0; x < PW; x += 7) {
        const i = (y * PW + x) * 4;
        if (Math.min(px[i], px[i + 1], px[i + 2]) > 150) { gr += px[i]; gg += px[i + 1]; gb += px[i + 2]; gn++; }
      }
      const sp = spec as { ground?: string; elements?: { role?: string; box?: { x: number; y: number; w: number; h: number }; colour?: string; caps?: boolean; lines?: number; snapped?: boolean; textH?: number }[] };
      if (gn > 50) sp.ground = hex(gr / gn, gg / gn, gb / gn);
      /* LINE-BAND DETECTION (owner escalation 2026-08-27, replaces the
         per-element ink snap that stole neighbouring lines or missed —
         live-observed: "legal" swallowed two lines and rendered double
         size while grape/region floated at guessed spots). The correct
         tool: find EVERY text line in the dream globally — horizontal
         bands of dark ink outside the artwork region — each with its
         exact y, height, x-extent and colour; then match bands to
         elements one-to-one in reading order. No guessing, no stealing. */
      const spArtPre = (spec as { artwork?: { box?: { x: number; y: number; w: number; h: number }; coverage?: string } }).artwork;
      const artGuess = spArtPre?.box || null;
      const isFullPre = !!artGuess && artGuess.w > 0.85 && artGuess.h > 0.8;
      if (!isFullPre) {
        const inArt = (fx: number, fy: number) =>
          !!artGuess && fx >= artGuess.x - 0.015 && fx <= artGuess.x + artGuess.w + 0.015 &&
          fy >= artGuess.y - 0.015 && fy <= artGuess.y + artGuess.h + 0.015;
        // dark-ink row profile outside the (provisional) artwork region
        const rowCount = new Int32Array(PH);
        const rowX0 = new Int32Array(PH).fill(PW), rowX1 = new Int32Array(PH).fill(-1);
        /* TEXT vs ARTWORK, structurally (owner failure 2026-08-27: artwork
           rows became phantom text bands whenever the art-box guess
           wobbled): glyph rows are made of SHORT ink runs; artwork rows
           carry long continuous strokes. A row with any run longer than 9%
           of the width is artwork, whatever any box says. */
        const MAXRUN = Math.floor(PW * 0.09);
        for (let y = Math.floor(PH * 0.01); y < PH * 0.99; y++) {
          const fy = y / PH;
          let run = 0, maxRun = 0, cnt = 0, rx0 = PW, rx1 = -1;
          for (let x = Math.floor(PW * 0.01); x < PW * 0.99; x++) {
            const i = (y * PW + x) * 4;
            const dark = Math.min(px[i], px[i + 1], px[i + 2]) < 180 && !inArt(x / PW, fy);
            if (dark) {
              run++; cnt++;
              if (x < rx0) rx0 = x;
              if (x > rx1) rx1 = x;
            } else {
              if (run > maxRun) maxRun = run;
              run = 0;
            }
          }
          if (run > maxRun) maxRun = run;
          if (maxRun > MAXRUN) continue; // artwork row, not text
          rowCount[y] = cnt; rowX0[y] = rx0; rowX1[y] = rx1;
        }
        // rows → bands (close small gaps, drop slivers)
        const thr = Math.max(10, Math.floor(PW * 0.018)); // sparse scene-edge spill must not register as text
        interface Band { y0: number; y1: number; x0: number; x1: number; colour?: string; used?: boolean }
        const bands: Band[] = [];
        let cur: Band | null = null, gapRows = 0;
        const GAP = Math.max(2, Math.floor(PH * 0.006));
        for (let y = 0; y < PH; y++) {
          if (rowCount[y] >= thr) {
            if (!cur) cur = { y0: y, y1: y, x0: rowX0[y], x1: rowX1[y] };
            else { cur.y1 = y; cur.x0 = Math.min(cur.x0, rowX0[y]); cur.x1 = Math.max(cur.x1, rowX1[y]); }
            gapRows = 0;
          } else if (cur) {
            gapRows++;
            if (gapRows > GAP) { bands.push(cur); cur = null; gapRows = 0; }
          }
        }
        if (cur) bands.push(cur);
        const MINH = Math.max(4, Math.floor(PH * 0.007));
        let clean = bands.filter((bd) => bd.y1 - bd.y0 >= MINH && bd.x1 > bd.x0);
        /* a text line is never taller than ~12% of the page — taller bands
           are merges (hero + scene spill): split at the weakest row */
        const MAXH = Math.floor(PH * 0.12);
        for (let guard = 0; guard < 8; guard++) {
          const tall = clean.findIndex((bd) => bd.y1 - bd.y0 > MAXH);
          if (tall < 0) break;
          const bd = clean[tall];
          let cutY = -1, cutV = Infinity;
          for (let y = bd.y0 + MINH; y <= bd.y1 - MINH; y++) {
            if (rowCount[y] < cutV) { cutV = rowCount[y]; cutY = y; }
          }
          if (cutY < 0) break;
          const mk = (a: number, b2: number): Band => {
            let x0 = PW, x1 = -1;
            for (let y = a; y <= b2; y++) { if (rowCount[y] >= thr) { x0 = Math.min(x0, rowX0[y]); x1 = Math.max(x1, rowX1[y]); } }
            return { y0: a, y1: b2, x0: x0 === PW ? bd.x0 : x0, x1: x1 < 0 ? bd.x1 : x1 };
          };
          clean.splice(tall, 1, mk(bd.y0, cutY - 1), mk(cutY + 1, bd.y1));
          clean = clean.filter((b2) => b2.y1 - b2.y0 >= MINH);
        }
        // per-band ink colour
        for (const bd of clean) {
          let r = 0, g = 0, bb = 0, n = 0;
          for (let y = bd.y0; y <= bd.y1; y += 2) for (let x = bd.x0; x <= bd.x1; x += 2) {
            const i = (y * PW + x) * 4;
            if (Math.min(px[i], px[i + 1], px[i + 2]) < 180 && !inArt(x / PW, y / PH)) { r += px[i]; g += px[i + 1]; bb += px[i + 2]; n++; }
          }
          if (n > 8) bd.colour = hex(r / n, g / n, bb / n);
        }
        // ORDER-PRESERVING alignment (owner failure 2026-08-27: greedy
        // nearest-match swapped roles when the transcriber's guesses
        // wobbled — the hero's band went to "vintage"). Elements and bands
        // both run top-to-bottom: match them monotonically via DP, so role
        // order can never invert; the tallest band leans toward the hero.
        const els = (sp.elements || []).filter((e) => e.box);
        const byY = [...els].sort((a, b2) => (a.box!.y - b2.box!.y));
        if (clean.length) {
          const sorted = [...clean].sort((a, b2) => a.y0 - b2.y0);
          const maxH = Math.max(...sorted.map((bd) => bd.y1 - bd.y0));
          const N = byY.length, M = sorted.length, SKIP = 0.11;
          const cost = (i: number, j: number) => {
            const e = byY[i], bd = sorted[j];
            const gy = e.box!.y + e.box!.h / 2, by = (bd.y0 + bd.y1) / 2 / PH;
            let c = Math.abs(by - gy);
            if (e.role === "wine") c += (bd.y1 - bd.y0) === maxH ? -0.06 : 0.05;
            return c;
          };
          const dp: number[][] = Array.from({ length: N + 1 }, () => Array(M + 1).fill(0));
          for (let i = 1; i <= N; i++) dp[i][0] = i * SKIP;
          for (let j = 1; j <= M; j++) dp[0][j] = j * SKIP;
          for (let i = 1; i <= N; i++) for (let j = 1; j <= M; j++)
            dp[i][j] = Math.min(dp[i - 1][j - 1] + cost(i - 1, j - 1), dp[i - 1][j] + SKIP, dp[i][j - 1] + SKIP);
          const pairs: [number, number][] = [];
          let i = N, j = M;
          while (i > 0 && j > 0) {
            if (dp[i][j] === dp[i - 1][j - 1] + cost(i - 1, j - 1)) { pairs.push([i - 1, j - 1]); i--; j--; }
            else if (dp[i][j] === dp[i - 1][j] + SKIP) i--;
            else j--;
          }
          pairs.reverse();
          for (const [ei, bj] of pairs) {
            const e = byY[ei];
            const best = sorted[bj];
            if (Math.abs((best.y0 + best.y1) / 2 / PH - (e.box!.y + e.box!.h / 2)) > 0.25) continue;
            best.used = true;
            let y0 = best.y0, y1 = best.y1, x0 = best.x0, x1 = best.x1;
            // a two-line hero may claim the adjacent unclaimed band — but
            // ONLY when the transcriber saw two lines (owner pair: a
            // one-line hero merged scene spill and wrapped into two)
            if (e.role === "wine" && (Number(e.lines) || 1) >= 2) {
              const idx = clean.indexOf(best);
              const nb = clean[idx + 1];
              if (nb && !nb.used && nb.y0 - y1 < 1.3 * (y1 - y0) &&
                  Math.min(x1, nb.x1) - Math.max(x0, nb.x0) > 0.5 * (x1 - x0)) {
                nb.used = true; y1 = nb.y1; x0 = Math.min(x0, nb.x0); x1 = Math.max(x1, nb.x1);
                e.lines = 2;
              }
            }
            e.box = { x: x0 / PW, y: y0 / PH, w: (x1 - x0 + 1) / PW, h: (y1 - y0 + 1) / PH };
            e.textH = (y1 - y0 + 1) / PH;
            e.snapped = true;
            if (best.colour) e.colour = best.colour;
          }
        }
        // anything unmatched keeps the transcriber's box and colour-samples it
        for (const e of els) {
          if (e.snapped) continue;
          const b = e.box!;
          const x0 = Math.max(0, Math.floor(b.x * PW)), x1 = Math.min(PW, Math.ceil((b.x + b.w) * PW));
          const y0 = Math.max(0, Math.floor(b.y * PH)), y1 = Math.min(PH, Math.ceil((b.y + b.h) * PH));
          let r = 0, g = 0, bb = 0, n = 0;
          for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
            const i = (y * PW + x) * 4;
            if (Math.min(px[i], px[i + 1], px[i + 2]) < 170) { r += px[i]; g += px[i + 1]; bb += px[i + 2]; n++; }
          }
          if (n > 12) e.colour = hex(r / n, g / n, bb / n);
        }
      } else {
        // full-bleed: text sits inside the scene — bands are unusable; keep
        // the transcriber boxes and sample colours within them
        for (const e of sp.elements || []) {
          const b = e.box; if (!b) continue;
          const x0 = Math.max(0, Math.floor(b.x * PW)), x1 = Math.min(PW, Math.ceil((b.x + b.w) * PW));
          const y0 = Math.max(0, Math.floor(b.y * PH)), y1 = Math.min(PH, Math.ceil((b.y + b.h) * PH));
          let r = 0, g = 0, bb = 0, n = 0;
          for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
            const i = (y * PW + x) * 4;
            if (Math.min(px[i], px[i + 1], px[i + 2]) < 170) { r += px[i]; g += px[i + 1]; bb += px[i + 2]; n++; }
          }
          if (n > 12) e.colour = hex(r / n, g / n, bb / n);
        }
      }

      /* ARTWORK EXTENT IS MEASURED, NOT GUESSED (owner 2026-08-25: the
         replica shrank a half-label illustration into a floating block).
         Every pixel that differs from the ground and lies outside the text
         boxes is artwork; its bbox replaces the transcribed art box, and
         the coverage call (full vs contained) comes from the same numbers. */
      try {
        const spArt = (spec as { artwork?: { box?: { x: number; y: number; w: number; h: number }; coverage?: string } }).artwork;
        const gN = sp.ground ? parseInt(sp.ground.slice(1), 16) : 0xffffff;
        const gr2 = (gN >> 16) & 255, gg2 = (gN >> 8) & 255, gb2 = gN & 255;
        const tboxes = (sp.elements || []).map((e) => e.box).filter(Boolean) as { x: number; y: number; w: number; h: number }[];
        /* DENSE-CLUSTER extent (owner failure 2026-08-26: parchment texture
           and corner vignettes counted as artwork, inflating the box): a
           grid cell counts as artwork only when a substantial share of its
           pixels clearly differs from the ground; the outer 2% border is
           ignored entirely. */
        const GC = 32, GR = 20;
        const cellHit: number[][] = Array.from({ length: GR }, () => Array(GC).fill(0));
        const cellTot: number[][] = Array.from({ length: GR }, () => Array(GC).fill(0));
        for (let y = Math.floor(PH * 0.02); y < PH * 0.98; y += 2) {
          const fy = y / PH, gy = Math.min(GR - 1, Math.floor((y * GR) / PH));
          for (let x = Math.floor(PW * 0.02); x < PW * 0.98; x += 2) {
            const fx = x / PW;
            let inText = false;
            for (const tb of tboxes) {
              if (fx >= tb.x - 0.015 && fx <= tb.x + tb.w + 0.015 && fy >= tb.y - 0.015 && fy <= tb.y + tb.h + 0.015) { inText = true; break; }
            }
            if (inText) continue;
            const gx = Math.min(GC - 1, Math.floor((x * GC) / PW));
            cellTot[gy][gx]++;
            const i = (y * PW + x) * 4;
            if (Math.abs(px[i] - gr2) + Math.abs(px[i + 1] - gg2) + Math.abs(px[i + 2] - gb2) > 110) cellHit[gy][gx]++;
          }
        }
        let cx0 = GC, cy0 = GR, cx1 = -1, cy1 = -1, artCells = 0;
        for (let gy = 0; gy < GR; gy++) for (let gx = 0; gx < GC; gx++) {
          if (cellTot[gy][gx] > 8 && cellHit[gy][gx] / cellTot[gy][gx] > 0.18) {
            artCells++;
            if (gx < cx0) cx0 = gx; if (gx > cx1) cx1 = gx;
            if (gy < cy0) cy0 = gy; if (gy > cy1) cy1 = gy;
          }
        }
        if (spArt && artCells > 6 && cx1 >= cx0 && cy1 >= cy0) {
          const nb = { x: cx0 / GC, y: cy0 / GR, w: (cx1 - cx0 + 1) / GC, h: (cy1 - cy0 + 1) / GR };
          const share = artCells / (GC * GR);
          const modelBox = spArt.box; // the transcriber's opinion
          const plausibleFull = nb.w > 0.88 && nb.h > 0.82 && share > 0.5;
          /* a "contained" artwork measuring near-full-height means the
             measurement is contaminated (stray glyphs, texture) — in that
             case the transcriber's box is the safer truth (owner failure
             2026-08-26: a full-height phantom box disabled the no-overlap
             law and stretched the art over the hero) */
          if (plausibleFull) { spArt.box = nb; spArt.coverage = "full"; }
          else if (nb.h < 0.92 && nb.w < 0.95) { spArt.box = nb; spArt.coverage = "contained"; }
          else if (modelBox) { spArt.coverage = "contained"; /* keep modelBox */ }
        }
      } catch {}
    }
  } catch {}

  /* 2. ARTWORK — the division of labour (owner 2026-08-25):
       · the DREAM decides subject + composition (+ a soft palette hint)
       · the BOARDS decide visual style: card technique language, Image
         Play refinements (favour/avoid), verified image rules
       · FLUX + the style LoRA repaints the craft (the old hybrid, with
         the dream in ChatGPT's story seat)
     Region aspect still comes from the dream so tall regions get tall art. */
  let artwork: string | null = null;
  let artworkError: string | undefined;
  let artAlign = "xMidYMid";
  let artInk: { x: number; y: number; w: number; h: number } | null = null;
  let artworkMode2: "contained" | "full" = "contained";
  if (p.reuseArtwork && p.reuseArtwork.startsWith("data:image/")) {
    // offline iteration path: reuse a saved artwork, skip all generation
    try {
      const an = analyzeArtwork(p.reuseArtwork);
      if (an?.bboxFull || an?.bbox) artInk = (an.bboxFull || an.bbox) as { x: number; y: number; w: number; h: number };
      const cx = an?.centroid?.x ?? 0.5, cy = an?.centroid?.y ?? 0.5;
      artAlign = `x${cx < 0.42 ? "Min" : cx > 0.58 ? "Max" : "Mid"}Y${cy < 0.42 ? "Min" : cy > 0.58 ? "Max" : "Mid"}`;
    } catch {}
    artwork = p.reuseArtwork;
    artworkMode2 = (spec as { artwork?: { coverage?: string } }).artwork?.coverage === "full" ? "full" : "contained";
    const resultR: RebuildResult = { spec, artwork, artAlign, artworkMode: artworkMode2, styleKey: p.style || "contemporary", fonts: GOOGLE_FONTS, artInk };
    try {
      fs.mkdirSync(path.join(process.cwd(), "data", "debug"), { recursive: true });
      fs.writeFileSync(path.join(process.cwd(), "data", "debug", "last-rebuild.json"), JSON.stringify({ dream, ...resultR }));
    } catch {}
    return resultR;
  }
  let artworkMode: "contained" | "full" = "contained";
  const art = (spec as { artwork?: { subject?: string; palette?: string[]; box?: { w: number; h: number }; coverage?: string } }).artwork;
  const styleKey = ["traditional", "contemporary", "punk"].includes(String(body.style)) ? String(body.style) : "contemporary";

  /* FULL-BLEED DREAMS (owner report 2026-08-25: a full-scene dream was
     crushed into a pasted rectangle on flat ground): when the illustration
     IS the label, the replica must be built the same way — the entire
     dream, text erased, becomes the background; the LoRA restyles the
     whole scene; vector type is set into it. */
  if (art?.coverage === "full") {
    artworkMode = "full";
    try {
      let styleLangF = "";
      try {
        const prof = (await getProfiles())[styleKey];
        const aggF = (await feedbackAggregates())[styleKey];
        const cardsF = (prof?.variants || []).filter((c) => (aggF?.weights?.[c.key] ?? 1) >= 0.5);
        const cardF = cardsF.length ? cardsF[Math.floor(Math.random() * cardsF.length)] : null;
        if (cardF) styleLangF = ` Rendering technique (the house style): ${(cardF as { language?: string }).language || [cardF.medium, cardF.mood].filter(Boolean).join("; ")}`;
        else if (prof?.charter) styleLangF = ` Rendering technique (the house style): ${prof.charter.slice(0, 500)}`;
      } catch {}
      const fullPrompt =
        `Reproduce this exact label design WITHOUT any text: erase every letter, number, word and typographic element completely, ` +
        `and keep EVERYTHING else identical — the full scene, textures, colours, composition, edge to edge. ` +
        `Where text was, continue the underlying scene/texture naturally.` + styleLangF;
      const makeFull = (extra = "") =>
        gen429(() => generateOpenAIImage({ prompt: fullPrompt + extra, size: { w: 1536, h: 1024 }, reference: dream } as never));
      const craftFull = (base: string) =>
        restyleWithFlux(
          base,
          { shortPrompt: `${art?.subject || vision}. Keep the exact composition — repaint only the rendering technique. No text anywhere.`, art: { preset: `${styleKey}/dream` } } as never,
          { width: 832, height: 512 }
        ).catch(() => base);
      let raw = await craftFull(await makeFull());
      try {
        const check = await verifyImage(raw, [NO_TEXT_RULE]);
        if (!check.ok) raw = await craftFull(await makeFull(` STRICT: the previous attempt still contained lettering — ${check.violations.join(" | ")}.`));
      } catch {}
      artwork = finishArtwork(raw); // opaque full background — no keying
    } catch (e) {
      console.error("dream full-bleed artwork failed:", e instanceof Error ? e.message : e);
      artwork = null;
      artworkError = e instanceof Error ? e.message : String(e);
    }
    return { spec, artwork, artAlign, artworkMode, styleKey, fonts: GOOGLE_FONTS, artworkError };
  }

  try {
    const palette = (art?.palette || []).filter((h) => /^#[0-9a-fA-F]{6}$/.test(h));
    const bx = art?.box;
    const regionAspect = bx && bx.h > 0 ? (bx.w * 1536) / (bx.h * 1024) : 1.5;
    const size = regionAspect < 0.83 ? { w: 1024, h: 1536 } : regionAspect > 1.2 ? { w: 1536, h: 1024 } : { w: 1024, h: 1024 };
    const fluxSizeOv = regionAspect < 0.83 ? { width: 512, height: 832 } : regionAspect > 1.2 ? { width: 832, height: 512 } : { width: 640, height: 640 };

    // style language: a board card (non-rejected, random) + refinement lines
    let styleLang = "", fbLines = "";
    try {
      const prof = (await getProfiles())[styleKey];
      const agg = (await feedbackAggregates())[styleKey];
      const cards = (prof?.variants || []).filter((c) => (agg?.weights?.[c.key] ?? 1) >= 0.5);
      const card = cards.length ? cards[Math.floor(Math.random() * cards.length)] : null;
      if (card)
        styleLang =
          ` Visual style (the house technique — it OVERRIDES the reference design's rendering): ` +
          `${(card as { language?: string }).language || [card.medium, card.mood].filter(Boolean).join("; ")}`;
      else if (prof?.charter) styleLang = ` Visual style (the house technique): ${prof.charter.slice(0, 600)}`;
      if (agg?.favour?.length) fbLines += ` Favour: ${agg.favour.slice(0, 4).join("; ")}.`;
      if (agg?.avoid?.length) fbLines += ` Avoid: ${agg.avoid.slice(0, 4).join("; ")}.`;
    } catch {}
    let userRules = "";
    try {
      userRules = ruleLines(await getImageRules(), styleKey).map((l) => ` ${l}.`).join("");
    } catch {}

    const sketchPrompt =
      `Recreate this illustration exactly — the same subject, the same composition, every element in the same place — filling the whole canvas. ` +
      (art?.subject ? `The illustration: ${art.subject}. ` : "") +
      `Remove any text, letters or numbers completely.` +
      styleLang + fbLines + userRules +
      (palette.length ? ` Palette leaning: ${palette.join(", ")}.` : "") +
      ` Single composition on a pure white background; its edges dissolve into white; no borders or frames.`;

    /* the reference is a CROP of the dream's own illustration region —
       handing the model the whole dream let it recompose the scene
       (subject re-centred, rooster cropped, live-observed) */
    let artRef = dream;
    try {
      const m2 = dream.match(/^data:image\/png;base64,(.+)$/);
      if (m2 && bx && bx.w > 0.05 && bx.h > 0.05) {
        const img = sharp(Buffer.from(m2[1], "base64"));
        const meta = await img.metadata();
        const MW = meta.width || 1536, MH = meta.height || 1024;
        const bxy = bx as unknown as { x: number; y: number; w: number; h: number };
        const left = Math.max(0, Math.floor(bxy.x * MW));
        const top = Math.max(0, Math.floor(bxy.y * MH));
        const cw = Math.min(MW - left, Math.ceil(bx.w * MW));
        const chh = Math.min(MH - top, Math.ceil(bx.h * MH));
        if (cw > 60 && chh > 60) {
          const crop = await sharp(Buffer.from(m2[1], "base64")).extract({ left, top, width: cw, height: chh }).png().toBuffer();
          artRef = `data:image/png;base64,${crop.toString("base64")}`;
        }
      }
    } catch {}

    const makeBase = (extra = "") =>
      gen429(() => generateOpenAIImage({ prompt: sketchPrompt + extra, size, reference: artRef } as never));
    const craft = (base: string) =>
      restyleWithFlux(
        base,
        {
          shortPrompt:
            `${art?.subject || vision}. Keep the exact composition of the input image — repaint only the rendering technique. ` +
            `No text, no borders, pure white background.`,
          art: { preset: `${styleKey}/dream` },
        } as never,
        fluxSizeOv
      ).catch(() => base); // no LoRA / flux hiccup → the styled base still stands

    let raw = await craft(await makeBase());
    // verify the core laws (text leakage from the dream is the big one)
    try {
      const check = await verifyImage(raw, [NO_TEXT_RULE, WHITE_BG_RULE, NO_BORDER_RULE]);
      if (!check.ok) raw = await craft(await makeBase(` STRICT — the previous attempt violated: ${check.violations.join(" | ")}.`));
    } catch {}
    raw = finishArtwork(raw); // soft palette hint only — no mechanical lock (owner)
    try {
      const an = analyzeArtwork(raw);
      const cx = an?.centroid?.x ?? 0.5, cy = an?.centroid?.y ?? 0.5;
      artAlign = `x${cx < 0.42 ? "Min" : cx > 0.58 ? "Max" : "Mid"}Y${cy < 0.42 ? "Min" : cy > 0.58 ? "Max" : "Mid"}`;
      /* CONTENT-PINNED PLACEMENT (owner round 3): the generated artwork has
         its own internal margins — aligning its rectangle to the dream box
         still lets the subject wander. Ship the INK bbox so the engine can
         map the content itself onto the dream's measured artwork box. */
      if (an?.bboxFull || an?.bbox) artInk = (an.bboxFull || an.bbox) as { x: number; y: number; w: number; h: number };
    } catch {}
    artwork = keyArtwork(raw);
  } catch (e) {
    console.error("dream artwork failed:", e instanceof Error ? e.message : e);
    artwork = null;
    artworkError = e instanceof Error ? e.message : String(e);
  }

  const result: RebuildResult = { spec, artwork, artAlign, artworkMode, styleKey, fonts: GOOGLE_FONTS, artworkError, artInk };
  /* every rebuild is dumped so renderer work iterates on SAVED data —
     never on fresh paid generations (owner, 2026-08-26) */
  try {
    fs.mkdirSync(path.join(process.cwd(), "data", "debug"), { recursive: true });
    fs.writeFileSync(path.join(process.cwd(), "data", "debug", "last-rebuild.json"), JSON.stringify({ dream, ...result }));
  } catch {}
  return result;
}
