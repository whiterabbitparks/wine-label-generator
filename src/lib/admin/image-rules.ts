import { getDb } from "@/lib/db";

/* VERIFIED image rules (owner, 2026-08-15): plain-English rules that
   actually work. On SAVE each rule is COMPILED once by a text model into
   three forms: a positive prompt clause (image models paint toward
   positives, not away from negatives), avoid-keywords for the negative
   list, and a precise check question with disambiguation (so e.g.
   engraving hatching is not mistaken for "ornament"). Every generated
   image is checked; violators regenerate with the broken rules prepended. */

export interface CompiledRule {
  /** the owner's original line — shown in violations */
  src: string;
  /** positive phrasing injected into every prompt */
  positive: string;
  /** comma-separable avoid keywords for the negative list */
  negative: string;
  /** precise yes/no violation question for the verifier */
  check: string;
}

export interface ImageRules {
  global: string;
  perStyle: Record<string, string>;
  compiledGlobal?: CompiledRule[];
  compiledPerStyle?: Record<string, CompiledRule[]>;
}

const DOC_ID = "image-hard-rules";
const STYLES = ["traditional", "contemporary", "punk", "minimalist"];

export async function getImageRules(): Promise<ImageRules> {
  try {
    const db = await getDb();
    const doc = (await db.collection("settings").findOne({ _id: DOC_ID } as never)) as ImageRules | null;
    return {
      global: doc?.global || "",
      perStyle: doc?.perStyle || {},
      compiledGlobal: doc?.compiledGlobal || [],
      compiledPerStyle: doc?.compiledPerStyle || {},
    };
  } catch {
    return { global: "", perStyle: {} };
  }
}

function rawLines(text: string): string[] {
  return String(text || "").split("\n").map((l) => l.trim()).filter((l) => l.length > 2);
}

/** Compile plain-English rules into prompt/negative/check forms (one call). */
async function compileRules(lines: string[]): Promise<CompiledRule[]> {
  const fallback = lines.map((src) => ({ src, positive: src, negative: "", check: `Does the image break this rule: "${src}"?` }));
  if (!lines.length) return [];
  const key = process.env.OPENAI_API_KEY;
  if (!key) return fallback;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You compile an art director's plain-English image rules for a generation pipeline. " +
              "For EACH rule return three forms: " +
              "positive — rephrase as what SHOULD be painted (image models follow positives; " +
              'e.g. "no ornaments on qvevri" → "any qvevri is a plain, smooth, undecorated clay vessel with a simple silhouette and no handles"); ' +
              "negative — 3-6 comma-separated avoid-keywords; " +
              "check — one precise yes-means-VIOLATED question for a vision inspector, with " +
              "disambiguation so legitimate technique is not misread (e.g. engraving hatching or " +
              "shading lines on a surface are NOT ornament; only deliberate decorative patterns, " +
              "carvings, reliefs or attached parts count). " +
              'Return strict JSON {"rules":[{"src","positive","negative","check"}]} in the same order.',
          },
          { role: "user", content: lines.map((l, i) => `${i + 1}. ${l}`).join("\n") },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const parsed = JSON.parse(json.choices?.[0]?.message?.content || "{}") as { rules?: Partial<CompiledRule>[] };
    const rules = Array.isArray(parsed.rules) ? parsed.rules : [];
    if (rules.length !== lines.length) return fallback;
    return rules.map((r, i) => ({
      src: lines[i],
      positive: String(r.positive || lines[i]).slice(0, 400),
      negative: String(r.negative || "").slice(0, 200),
      check: String(r.check || `Does the image break this rule: "${lines[i]}"?`).slice(0, 400),
    }));
  } catch {
    return fallback;
  }
}

export async function saveImageRules(rules: Pick<ImageRules, "global" | "perStyle">): Promise<void> {
  const global = String(rules.global || "").slice(0, 3000);
  const perStyle = Object.fromEntries(STYLES.map((s) => [s, String(rules.perStyle?.[s] || "").slice(0, 3000)]));
  const compiledGlobal = await compileRules(rawLines(global));
  const compiledPerStyle: Record<string, CompiledRule[]> = {};
  for (const s of STYLES) compiledPerStyle[s] = await compileRules(rawLines(perStyle[s]));
  const db = await getDb();
  await db.collection("settings").updateOne(
    { _id: DOC_ID } as never,
    { $set: { global, perStyle, compiledGlobal, compiledPerStyle, updatedAt: new Date() } },
    { upsert: true }
  );
}

/** Compiled rule list applying to one style: global + that style's rules. */
export function ruleLines(rules: ImageRules, style: string): CompiledRule[] {
  const g = rules.compiledGlobal?.length ? rules.compiledGlobal : rawLines(rules.global).map((src) => ({ src, positive: src, negative: "", check: `Does the image break this rule: "${src}"?` }));
  const p = rules.compiledPerStyle?.[style]?.length
    ? rules.compiledPerStyle[style]
    : rawLines(rules.perStyle?.[style] || "").map((src) => ({ src, positive: src, negative: "", check: `Does the image break this rule: "${src}"?` }));
  return [...g, ...p];
}

/** Vision check against the compiled rules; violations carry the reason. */
export async function verifyImage(
  imageDataUrl: string,
  rules: CompiledRule[]
): Promise<{ ok: boolean; violations: string[] }> {
  if (!rules.length) return { ok: true, violations: [] };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: true, violations: [] };
  const model = process.env.OPENAI_VERIFY_MODEL || "gpt-4o-mini";
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You inspect a generated wine-label artwork. For each numbered question, " +
              "answer whether the VIOLATION it describes is clearly visible in the image. " +
              "List a question ONLY when you can point at the violating content actually " +
              "PRESENT in the image; if the content a question asks about is absent, that " +
              "rule PASSES — absence is never a violation. When uncertain, answer no (the " +
              "rule passes). " +
              'Return strict JSON {"violations":[{"n": question number, "reason": one short sentence naming the violating content you SEE}]} — empty array if none.',
          },
          {
            role: "user",
            content: [
              { type: "text", text: rules.map((r, i) => `${i + 1}. ${r.check}`).join("\n") },
              { type: "image_url", image_url: { url: imageDataUrl, detail: "low" } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return { ok: true, violations: [] };
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const parsed = JSON.parse(json.choices?.[0]?.message?.content || "{}") as { violations?: { n?: number; reason?: string }[] };
    const violations = (Array.isArray(parsed.violations) ? parsed.violations : [])
      .map((v) => {
        const r = rules[(Number(v?.n) || 0) - 1];
        if (!r) return null;
        const reason = String(v?.reason || "").slice(0, 140);
        // MISFIRE GUARD (owner report 2026-08-16): the inspector sometimes
        // lists a violation whose own reason describes ABSENCE ("the image
        // does not contain any people") — a self-contradiction. Absence is
        // never a violation; drop those.
        if (/\b(does not|doesn't|do not)\s+(contain|have|show|include)|\bno\s+(visible|readable|people|text|figures|animals)\b|\babsent\b|\bnone\s+(present|visible)\b/i.test(reason))
          return null;
        return `${r.src}${reason ? ` — ${reason}` : ""}`;
      })
      .filter(Boolean)
      .slice(0, 8) as string[];
    return { ok: violations.length === 0, violations };
  } catch {
    return { ok: true, violations: [] };   // the check must never block generation
  }
}

/* COMPARE-AND-CORRECT (owner 2026-08-18): the strongest text-side lever —
   after generation, put the OUTPUT side by side with the actual REFERENCE
   image and extract concrete corrective deltas (technique, line quality,
   light, detail scale, colour behaviour); the caller regenerates once with
   them. The automated version of the owner's own eye. Never blocks
   generation; empty list = close enough. */
export async function compareToReference(
  generatedDataUrl: string,
  referenceDataUrl: string
): Promise<string[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You compare a GENERATED image (B) against a REFERENCE artwork (A) whose technique it must match. " +
              "Subjects are expected to differ — judge ONLY the craft: printing/drawing technique and tool marks, " +
              "line quality and weight, lighting (direction, contrast), detail scale/density, and colour behaviour. " +
              "Return up to 4 CONCRETE corrective instructions for regenerating B to match A's craft " +
              '(e.g. "use coarser cross-hatching with visible tool wobble", "reduce micro-detail: 4-6 large forms", ' +
              '"flatten the lighting: single light source, higher contrast"). NEVER suggest adding borders, frames, ' +
              "text, or enclosing shapes — those are forbidden by other rules. If B already matches A's craft well, return none. " +
              'Strict JSON: {"corrections": ["...", ...]}.',
          },
          {
            role: "user",
            content: [
              { type: "text", text: "A = reference:" },
              { type: "image_url", image_url: { url: referenceDataUrl, detail: "low" } },
              { type: "text", text: "B = generated:" },
              { type: "image_url", image_url: { url: generatedDataUrl, detail: "low" } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const parsed = JSON.parse(json.choices?.[0]?.message?.content || "{}") as { corrections?: unknown };
    return (Array.isArray(parsed.corrections) ? parsed.corrections : [])
      .map((c) => String(c).slice(0, 200))
      // safety net: a correction must never smuggle in what other rules ban
      .filter((c) => c.length > 5 && !/border|frame|cartouche|enclos|oval|text|letter/i.test(c))
      .slice(0, 4);
  } catch {
    return [];
  }
}

/* Built-in hard rule (owner, 2026-08-15): artwork never contains text,
   glyphs or numbers — UNLESS the winemaker's story explicitly asks for
   lettering. Joins the same compiled pipeline (prompt clause, avoid-list,
   verified check with retry) but lives in code, not the editable doc. */
export const NO_TEXT_RULE: CompiledRule = {
  src: "never generate texts, glyphs or numbers (built-in)",
  positive:
    "The artwork is pure imagery with no text of any kind — no letters, words, numerals, glyphs, monograms, inscriptions, signatures or typographic marks.",
  negative: "text, letters, words, numbers, typography, inscription, signature, watermark, gibberish lettering",
  check:
    "Does the image contain any readable or pseudo-readable text, letters, numerals, glyphs or typographic marks (including AI gibberish lettering)? Purely decorative non-alphabetic patterns do not count.",
};

/* Built-in hard rule (owner, 2026-08-16): artwork never draws its own frame
   or border — the scene must dissolve openly into the white ground (the
   label layouts are frameless by rule, and a drawn border would smuggle a
   frame back in). Code-side like NO_TEXT_RULE; applies to every generation. */
export const NO_BORDER_RULE: CompiledRule = {
  src: "never enclose the artwork in a frame, border, oval or any shape (built-in)",
  positive:
    "The scene is completely open and unframed: its edges dissolve softly into the pure white background. There is no enclosing frame, border, outline box, oval, circle, cameo, medallion, cartouche, keyline, decorative band or any geometric shape that contains the composition.",
  negative:
    "frame, border, outline box, oval frame, circular medallion, cameo, cartouche, enclosing line, decorative band, vignette boundary, rounded rectangle frame, enclosing shape",
  check:
    "Is the composition contained inside ANY enclosing form — a drawn frame, border, outline, band, OR a solid/shaded oval, circle, cameo, medallion, arch or rectangle whose edge bounds the whole artwork? A small object of that shape INSIDE an open scene does not count; a shape that contains the composition does.",
};

/* Built-in hard rules (owner, 2026-08-17): architecture & geography.
   1. NO buildings of any kind unless the story asks for one.
   2. Geography is either PRECISE (a known place → landscape/plants must be
      plausible there) or NEUTRAL (no place known → nothing that pins one). */
export function wantsBuilding(vision: string | undefined): boolean {
  return /\b(castle|ch[âa]teau|tower|church|monaster|cathedral|chapel|house|hut|cottage|cabin|building|winery|cellar|architect|village|town|city|bridge|ruin|palace|temple|barn|fortress|marani|street)\b/i.test(
    String(vision || "")
  );
}
export const NO_ARCHITECTURE_RULE: CompiledRule = {
  src: "no buildings unless the story asks (built-in)",
  positive:
    "The scene contains no buildings or architectural structures of any kind — no castles, towers, churches, houses, ruins or bridges; the composition relies on natural forms, figures and objects instead.",
  negative: "castle, church, tower, house, building, ruins, cityscape, bridge, architecture",
  check:
    "Does the image contain any building or architectural structure (castle, tower, church, house, ruin, bridge or similar)? Small objects, furniture and vessels do not count.",
};
export function geographicRule(place: string): CompiledRule {
  const s = place.slice(0, 140);
  return {
    src: "geographic accuracy (built-in)",
    positive: `Geographic truth: the setting is ${s} — terrain, landscape, vegetation and plant species must be accurate and plausible for ${s}; nothing that contradicts that place, and any requested architecture must be in that region's own style.`,
    negative: "misplaced vegetation, wrong-climate plants, foreign landmark architecture",
    check: `The intended setting is: "${s}". Does the image clearly contradict that geography — vegetation, terrain or architecture that could not belong there (e.g. tropical palms in a temperate wine region)? Only clear contradictions count.`,
  };
}
export const NEUTRAL_GEO_RULE: CompiledRule = {
  src: "stay geographically neutral (built-in)",
  positive:
    "No specific place is intended: keep landscape and vegetation geographically neutral — timeless, generic wine-country forms; no landmark buildings and no plant species or terrain that pin a specific real region.",
  negative: "famous landmarks, unmistakably region-specific architecture, exotic region-pinning species",
  check:
    "Does the image contain a recognizable real-world landmark, or unmistakably region-specific vegetation/architecture that pins one specific place? Generic hills, vines and trees do not count.",
};

/* Built-in hard rule (owner, 2026-08-17): QVEVRI ANATOMY. A qvevri is a
   plain vessel — completely smooth clean clay, NO ornaments, NO handles,
   NO carvings. When shown buried it is buried WHOLE: only the round mouth
   is visible flush with the ground — never a half-buried body. Applied
   only when the story mentions a qvevri, and skipped entirely when the
   customer explicitly asks for decoration/handles/half-buried. */
export function mentionsQvevri(vision: string | undefined): boolean {
  return /\b(qvevri|kvevri|kwevri|quevri|churi)\b/i.test(String(vision || ""));
}
export function qvevriOverridden(vision: string | undefined): boolean {
  return /\b(handle|ornament|decorat|carv|relief|engraved\s+qvevri|half[- ]?buried|partially\s+buried|sticking\s+out)\b/i.test(
    String(vision || "")
  );
}
export const QVEVRI_RULE: CompiledRule = {
  src: "qvevri are plain and buried whole (built-in)",
  positive:
    "Any qvevri is rendered truthfully: a plain clay vessel with a completely smooth, clean, undecorated surface — no ornaments, no reliefs, no carvings and no handles of any kind. If it is shown buried in the earth it is buried WHOLE: only its round mouth/opening is visible, flush with the ground — never a half-buried vessel with its body protruding.",
  negative:
    "ornamented qvevri, decorated clay vessel, carved qvevri, qvevri with handles, amphora handles, half-buried vessel, vessel body protruding from the ground",
  check:
    "If the image contains a qvevri or similar large clay wine vessel: does it have handles, ornaments, carvings or any surface decoration, OR is it shown partially buried with its body protruding from the ground? A vessel standing fully above ground with a smooth plain surface is fine. If no such vessel appears, answer no.",
};

/* Built-in rule (owner, 2026-08-19): TIMELESS NEUTRALITY. Unless the story
   explicitly asks for a specific time, culture or ethnicity, nothing in the
   image may pin one: no period costume, no folk/national dress, no
   culture-specific accessories, no era-specific architecture or props.
   People and settings read modern-but-neutral, or simply timeless.
   (Live-observed failure this rule exists for: "man in the cellar" came
   back as a 17th-century figure.) Skipped when the customer names an era,
   culture, ethnicity or historical style themselves. */
export function mentionsEra(vision: string | undefined): boolean {
  return /\b(ancient|medieval|renaissance|baroque|victorian|edwardian|antique|retro|vintage|soviet|ussr|roman|greek|ottoman|persian|byzantine|colonial|belle.?[ée]poque|art\s*(deco|nouveau)|\d{2}(th|st|nd|rd)\s*century|1[5-9]\d\d s?|folk|national\s+(dress|costume)|traditional\s+(dress|costume|clothing|outfit)|chokha|kimono|toga|knight|samurai|viking|cowboy|pharaoh|tsar|king|queen|monk|priest|peasant\s+(dress|costume)|ethnic)\b/i.test(
    String(vision || "")
  );
}
export const TIMELESS_RULE: CompiledRule = {
  src: "timeless neutrality (built-in)",
  positive:
    "Unless the story itself specifies a time, culture or ethnicity, keep everything era-neutral and culture-neutral: any people wear simple modern-but-timeless clothing (plain shirts, work clothes, unremarkable garments) with no period costume, no folk or national dress and no culture-specific accessories; any objects, tools or structures are contemporary-neutral or timeless in design, never evoking a particular historical era, country or ethnic tradition.",
  negative:
    "period costume, historical dress, folk costume, national dress, traditional ethnic clothing, medieval clothing, victorian clothing, old-fashioned suit, tricorn hat, bonnet, armor, era-specific architecture, culturally specific ornament",
  check:
    "Does a person wear clearly historical, period, folk or national costume, or does clothing, accessories or architecture unmistakably evoke one specific historical era, culture or ethnicity? Plain modern or timeless clothing and generic settings are fine. If no people or such elements appear, answer no.",
};

/* Built-in rule (2026-08-17): PURE WHITE GROUND, now vision-CHECKED too.
   WHITE_BG has always ridden the prompt, but style-conditioned providers
   inherit their references' toned paper (live-observed: tan ground from
   Recraft) — under multiply a tan block prints. The check makes the
   regenerate loop enforce it on every provider. */
/* GLITCH GUARD (owner 2026-08-28: two-headed rooster, man/rooster fusion):
   generation artifacts, verified like every other law. */
export const NO_GLITCH_RULE: CompiledRule = {
  src: "no anatomical glitches (built-in)",
  positive:
    "Every figure, person and animal is anatomically coherent — one head each, the right number of limbs, no fused or merged bodies, no accidental human-animal hybrids.",
  negative: "two heads, extra limbs, fused bodies, merged creatures, anatomical glitch, mutation",
  check:
    "Does any person, animal or creature show duplicated or fused anatomy — two heads, extra or missing limbs, bodies merged together, or an unrequested human-animal hybrid? Stylised simplification is fine; answer yes only for genuine glitches.",
};

export const WHITE_BG_RULE: CompiledRule = {
  src: "pure white background (built-in)",
  positive:
    "The artwork sits on a clean, solid, PURE WHITE background — no coloured or toned paper, no beige/tan ground, no texture and no gradient behind the scene.",
  negative: "beige background, tan paper background, coloured background, textured paper ground, gradient background",
  check:
    "Look at the ground AROUND the composition: if it is beige, tan, cream, sepia, grey or ANY colour or texture other than clean pure white, that IS a violation — answer yes. Answer no only when the surrounding ground is genuinely white.",
};

/* Built-in rule (owner, 2026-08-17): DOMINANT COLOUR. Red may lead the
   palette only on red products; white/amber products lead with yellows,
   greens, blues, browns and earth tones. Pushed for traditional and
   contemporary only — punk is exempt — and only for non-red products. */
export const NO_RED_DOMINANCE_RULE: CompiledRule = {
  src: "red never dominates a non-red product's image (built-in)",
  positive:
    "The palette is led by yellows, golds, greens, blues, browns and earth tones; red appears only as a small accent, never as the dominant colour of the image.",
  negative: "red-dominated palette, overall crimson wash, predominantly red image",
  check:
    "Is RED clearly the DOMINANT colour of this image overall — a red-led palette or red wash? Small red accents or details do not count; only an image whose overall colour impression is red.",
};

/* Built-in dynamic rule (owner, 2026-08-17): FORMAL LANGUAGE. Outputs drift
   toward realistic rendering (especially human figures). The gate is the
   chosen art direction's TECHNIQUE, not the style name: engraving-family
   techniques carry their own printmaker's realism (allowed, never
   photographic); everything else — especially punk — must be deliberately
   STYLIZED: simplified, exaggerated, graphic, cartoonish. */
export function stylizationRule(styleKey: string, cardText: string): CompiledRule {
  const realistTech = /engrav|etch|copperplate|burin|stipple|mezzotint|dry.?point|aquatint|intaglio|photoreal/i.test(
    String(cardText || "")
  );
  if (realistTech)
    return {
      src: "print realism, never photographic (built-in)",
      positive:
        "Figures and faces, if any, are rendered with the print technique's own discipline — engraved line, hatching and tone — never photographic, never like a 3D render.",
      negative: "photographic face, photorealistic skin, 3D-rendered figure",
      check:
        "Do any figures or faces look like a PHOTOGRAPH or 3D render rather than a hand-printed image? Realistic engraved/etched rendering with visible line work is fine — only photographic/CGI likeness counts.",
    };
  const punk = styleKey === "punk";
  return {
    src: "stylized formal language, no realism (built-in)",
    positive:
      `The formal language is deliberately STYLIZED, never realistic: figures, faces, animals and objects are simplified, exaggerated, graphic — bold expressive shapes over anatomical accuracy${punk ? ", with raw cartoonish energy" : ""}. No academic realism, no naturalistic shading, nothing photographic.`,
    negative:
      "realistic human figures, academic realism, naturalistic anatomy, realistic shading, photorealism, lifelike portrait",
    check:
      "Are human figures, faces or animals rendered in a realistic academic manner — naturalistic proportions, lifelike shading — instead of being deliberately stylized and simplified? If the artwork is an engraving/etching-style print, answer no; only realistic rendering in a non-engraving style counts.",
  };
}

/** Does the winemaker's story explicitly ask for lettering? */
export function wantsText(vision: string | undefined): boolean {
  return /\b(text|letter|lettering|word|writing|written|inscription|sign\s+say|says|saying|glyph|number|digit|numeral|typograph|caption|monogram|slogan|motto)\b/i.test(
    String(vision || "")
  );
}

/* Subject focus (owner, 2026-08-15): "gorilla in chokha" must yield ONE
   gorilla in a chokha — not a crowd with a gorilla in it. Unless the story
   itself asks for multiple figures, a dynamic rule pins the generation (and
   the verified check) to exactly the stated subject. */
export function wantsCrowd(vision: string | undefined): boolean {
  return /\b(people|crowd|villagers|family|families|friends|dancers|dancing|feast|supra|banquet|group|couple|guests|harvesters|workers|men|women|children|figures|musicians|procession|celebration|everyone|together)\b/i.test(
    String(vision || "")
  );
}
export function subjectFocusRule(subject: string): CompiledRule {
  const s = subject.slice(0, 160);
  return {
    src: "stay focused on the subject (built-in)",
    positive: `Depict EXACTLY this and nothing else animate: ${s}. One single subject, dominant in the frame; no additional people, human figures, animals or characters of any kind.`,
    negative: "extra people, background figures, crowd, bystanders, additional characters, additional animals",
    check: `The intended subject is: "${s}". Does the image contain EXTRA people, human figures, animals or characters beyond that subject (e.g. bystanders, a crowd, additional animals)? Answer yes ONLY if such extra figures are visibly present. The subject being absent, abstract or stylised is NOT a violation of this rule.`,
  };
}
