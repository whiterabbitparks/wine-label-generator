# 8K Labels — CONTINUE HERE (session handoff)

Single source of truth for resuming work on any machine. Updated 2026-07-29,
after the Next.js migration restart. Where anything disagrees with older docs
(including `8k-labels-package/CONTINUE-HERE.md`, which describes the
single-file era), **this file wins**.

---

## 1. What this project is now

**8K Labels** is a wine-label generator: a winemaker enters label details in an
interactive layout preview, optionally writes a story / uploads a reference,
and gets the same label in **6 design styles** as print-ready SVG (real mm,
5 mm safe margin, 2 mm bleed).

It now runs as a **Next.js app** (App Router, repo root) that hosts the
original vanilla-JS configurator **verbatim** — the original code is the spec,
not a starting point for rewrites. A backend API route does image generation
(mock provider today, OpenAI provider ready).

### Why "verbatim"? (read this before changing anything)

A first React port (commits up to `85d1b12`) re-authored the UI from source
reading and a placeholder engine. It diverged from the real site (invented
tabs, wrong label rendering) and was **rejected and deleted**. The restart
treats `8k-labels-package/dist/configurator.html` *as rendered in a browser*
as a pixel-level spec, transplants it byte-for-byte, and proves equivalence
with automated parity gates. Do not reintroduce the old approach.

---

## 2. Fresh-machine setup

```bash
git clone <repo> && cd WineLabelGenerator
npm install                          # Next 15 + React 19 + Playwright (uses system Chrome, no browser download)
cd 8k-labels-package && node build.js && cd ..   # regenerates dist/configurator.html (gitignored) — the parity spec
cp .env.example .env.local           # IMAGE_PROVIDER=mock by default
npm run dev                          # → http://localhost:3000
```

---

## 3. Architecture

| Piece | Where | Rule |
|---|---|---|
| Original source | `8k-labels-package/src/` (+ `build.js` → `dist/configurator.html`) | The ONLY place to change configurator behavior/UI |
| Transplanted scripts | `public/engine/{shell,img-data,label-engine,editor-embed,image-gen}.js` | **Generated — never hand-edit** |
| Transplanted HTML/CSS | `src/app/shell-body.ts`, `src/app/configurator.css` | **Generated — never hand-edit** |
| Extractor | `tests/parity/extract-shell.mjs` | Regenerates all of the above from dist |
| Host page | `src/app/page.tsx` | Renders the HTML once, loads scripts sequentially post-hydration; React never touches that DOM again |
| Image API | `src/app/api/generate-label-image/route.ts` + `src/lib/image-provider/{mock,openai}.ts` | Providers switched by `IMAGE_PROVIDER` env; key server-side only |
| Client↔backend seam | `window.EightKImageGen.provider` (set in `page.tsx`) | Integrate ONLY through the original's exposed hooks |
| Engine test harness | `/engine-test` page | Font-safe readiness flag for the golden check |

**Change flow:** edit `8k-labels-package/src/*` → `node build.js` (in package)
→ `node tests/parity/extract-shell.mjs` → re-run parity gates below. If the
change is intentional, re-baseline first (`npm run capture:original`,
`npm run golden:extract`).

---

## 4. Parity gates (run after ANY configurator/engine change)

```bash
npm run build                 # must pass
npm run golden:check          # engine: 144/144 SVGs byte-identical vs golden corpus (self-starts dev on :3199)
npx next start -p 3200 &      # then:
npm run capture:ported        # screenshots the ported app (10 UI states)
npm run compare:screens       # 0.000% pixel diff required (gallery compared by card SET — its order is random by design)
node tests/parity/test-imagegen.mjs http://localhost:3200   # generate-artwork e2e
```

`tests/parity/reference/` (original's screenshots) and `tests/parity/golden/`
(144 engine SVGs: 2 datasets × 3 sizes × seeds 0,1,2,7 × 6 styles) are
**committed as the spec**. `ported/`, `diff/`, `failures/` are regenerable and
gitignored.

### Known trap: the font-loading race

`ensureFonts()` injects a Google-Fonts `@import` then calls
`document.fonts.load()`. Until the stylesheet is parsed, families are
unregistered → `load()` silently no-ops AND `fonts.check()` returns true via
system fallback → the engine measures with wrong metrics (wrong wraps/arcs).
**Only trust `FontFace` entries with `status === 'loaded'` per family**,
re-invoking `ensureFonts()` each poll — see `src/app/engine-test/page.tsx`.

---

## 5. Image generation (per-style set architecture)

**The server is the creative brain.** The client sends only the raw BRIEF
(`{vision, reference, data, seed}` — `EightKImageGen.buildBrief()`); prompt
assembly happens server-side, one prompt per label style:

- **Style Catalog** (`src/lib/styles/catalog.ts`): one entry per engine style
  (traditional/contemporary/flora/premium/minimalist/artistic), each with
  **sub-styles** (art-direction recipes; picked per-generation from the seed),
  a **focus-area spec** (`guidance` baked into prompts; `clearZone` fractions
  for a future subject-detection v2) and an image **treatment** (multiply).
  Defaults are placeholders pending the owner's style reference PDFs; a Mongo
  `settings/style-catalog` doc overrides them when present.
- **Orchestrator** `POST /api/generate-label-set` (brief in → 6 style-matched
  images out, parallel, 429-retry, complete sets cached in-memory by brief
  signature). Partial failure returns the styles that succeeded + `errors`.
- Client: `generateSet()` / `generateIfNeeded()` (Show Labels — runs even with
  an EMPTY story; the server falls back to the wine facts for the subject) →
  `window.__LABEL_IMGS__` (per-style map) + `window.__LABEL_IMG__` (traditional,
  legacy single slot) → `8kRepaint`. **There is no client-facing artwork UI**
  (the "Label Artwork" panel was removed 2026-07-31): generation is invisible
  and each artwork appears inside its own style's label. ALL SIX styles embed
  their style's image — Traditional via the heritage engine, the other five via
  `sImage()` in label-engine.js with **provisional v1 positions** (contemporary
  right field / flora centred block / premium emblem / minimalist mark /
  artistic full-bleed poster, light plate on dark variants) to be refined by
  the owner's style layout rules.
- Images render with `mix-blend-mode:multiply` ALWAYS (matches print
  treatment). Print colour decision: SVG stays RGB; a CMYK **PDF export step**
  is the planned print deliverable (not built yet).
- **House rule (owner, 2026-07-31): artwork is ALWAYS on a clean solid pure-
  white background** — enforced server-side in `src/lib/styles/prompt.ts`
  (`WHITE_BG`, appended to every prompt, deliberately outside the admin-
  editable template) + background negatives in the default negative prompt.
  With multiply, the white vanishes on the label. The mock provider renders
  on white accordingly.
- **openai** provider: VERIFIED live 2026-07-31 (model `gpt-image-2` valid).
  OpenAI caps ~5 images/min → the set fan-out relies on the retry in
  `src/lib/image-provider/index.ts`. **mock** stays free/offline/deterministic.
- Legacy single-image `POST /api/generate-label-image` remains for the admin
  drawer's Test generate.
- Parity captures force the package's offline placeholder on BOTH sides via
  `window.__PARITY_OFFLINE__` (set in `capture-original.mjs`, honoured in
  `page.tsx`) — server-generated art is environment-dependent and must not
  reach the pixel-compare.

---

## 5b. TEMPORARY testing conveniences (revert before launch)

- **DEMO_FILL** in `8k-labels-package/src/editor-embed.js`: empty label boxes
  fall back to their "E.g." reference texts in the rendered SVGs so testing
  needs no typing. Owner-requested 2026-07-31, explicitly temporary —
  **revert by setting `DEMO_FILL=false`** (then rebuild + extract + re-run
  gates). The empty-box warning and grey placeholders are unaffected.

**Standing rule (owner, 2026-08-13): label grounds.** Never paint
split-colour backgrounds (two-tone bands/panels behind the composition), and
never place the artwork on a dark ground — the artwork is multiply-blended
dark ink, so a dark ground makes it invisible. Comps that include the image
zone always sit on a single light ground. (Removed: contemporary colour-block
band + orange full ground, flora diagonal accent band, premium charcoal
variant, artistic near-black riso ground. Text-only comps may still use a
bold single-colour ground, e.g. the minimalist red panel.)

## 5-LAYOUTS-V6 (2026-08-16, supersedes V5) — artwork fills 85% of its
MEASURED free area, may bleed off the label; dead-space flags

Owner reviewed V5 renders against hand-made mockups: images still too
small (85%-of-a-small-declared-box is still small) and some comps
cluster content on top leaving an empty band below. Rulings (owner):
1. **Artwork alone is EXEMPT from the 5mm margin** — it may bleed to and
   off the label edge (standard full-bleed print; edges dissolve to white
   + multiply, so it trims cleanly). TEXT keeps the 5mm rule; the
   verifier now exempts `<image>` and checks everything else as before.
2. **Fill = 85% of the MEASURED free area, not the declared box.**
   Implementation (label-engine.js): every text primitive (sBlock, sRot,
   sArcText) records its ink rect into a per-render registry; sImageBox
   emits a placement TOKEN (paint order preserved) and sWrap→resolveArt
   places it once all text is known: the rect grows at the 1.6 artwork
   ratio from the box centre — centre may slide up to 25% of the label
   (grid-searched) so the artwork migrates INTO empty bands — until it
   (minus a 5%/side dissolving fringe) would come within MINGAP of text
   ink or leave the bleed bounds; final area = ARTFILL of that maximum;
   floor = contain-in-box. Deterministic; without artwork resolveArt is
   a no-op (goldens 72/72 untouched, no re-baseline).
3. **ARTFILL is admin-tunable**: Hard Rules tab → "Artwork fill of its
   free area" (30–100%, default 85) → settings/hard-rules.artFillPct →
   hints.__hardRules → engine ARTFILL. Same pipe as minGapMM.
4. **Dead-space flags (advisory, never failing)**: check-hard-rules.mjs
   injects a stub artwork and reports any artwork comp keeping an empty
   horizontal band >20% of the label height (warnings section); the
   Layout Playground measures the same off-screen (display unchanged)
   and badges cards "dead space N%". V6 cut the sweep's warnings from
   10 renders to 1 (traditional comp#1 seed 4242, 22% — borderline).
   The owner reviews flagged comps and asks for per-comp restructures.
5. **Artwork never draws its own frame/border** — NO_BORDER_RULE joins
   NO_TEXT_RULE as a code-side built-in (prompt positive + negative +
   vision-verified check with regenerate-once) in both generation routes.

## 5-IMAGES-V5 (2026-08-16, same day, later) — no enclosing shapes at the
SOURCE; verifier misfire guard; approved-layouts gallery

Owner: ovals/borders still appearing. Root cause found: COMP_SHAPES itself
requested "oval cameo vignette", "circular medallion", "rectangular plate",
"arched niche" — the prompts were ASKING for enclosures, so the border rule
never stood a chance. Fixes:
- COMP_SHAPES rewritten (supersedes 'not all ovals'): 8 OPEN arrangements
  (free-form, silhouette-defined, panoramic sweep, column, diagonal sweep,
  constellation, centred mass with trailing details, asymmetric mass) —
  variety by arrangement, never by enclosing geometry. zoneSentence welds
  "composition is NEVER enclosed: no frame/border/oval/medallion/…" onto
  every prompt. NO_BORDER_RULE hardened: a solid/shaded oval, circle,
  cameo, medallion, arch or rectangle bounding the whole artwork IS a
  violation (small shaped objects inside an open scene are not).
- verifyImage misfire guard (owner report: "stay focused" flagged with
  reason 'image does not contain any people' — a self-contradiction):
  system prompt now says absence is never a violation, and a post-filter
  DROPS any violation whose reason describes absence. subjectFocusRule
  check clarified: only EXTRA figures violate; an absent/stylised subject
  does not.
- Layout Playground: "★ Selected layouts" is its own STYLE DROPDOWN entry
  (like Fonts) — auto-loads every selected comp of every style, grouped,
  never mixed with fresh rolls (roll button/reviewAll hidden there). Each
  card: style name, comp #, "Remove ✕" → verdict "clear" (API) →
  clearLayoutFeedback deletes that comp's WHOLE feedback history (back to
  unrated) — out of the selected set without counting as a rejection.
- **SELECTION IS A STATE, not a vote sum** (owner bug 2026-08-16: comps he
  approved didn't show as selected — earlier rejections had netted the
  cumulative weight below 1). layoutWeights now: LAST verdict wins —
  approve → 2 (selected), reject → 0.4, unrated → 1. Approved-only
  transform unchanged (weight > 1). Roll cards use layoutBadge
  (selected / rejected / unrated), not the image-side weightBadge.

## 5-LOOKS (2026-08-16, same day, latest) — approvals are complete LOOKS

Owner diagnosis: 101 verdicts had hit only 13 distinct comps and only 4
were last-verdict-approved. Two causes: (1) default rolls sampled under
customer weights, so once anything was approved the playground looped on
already-approved comps; (2) he judges complete looks (arrangement + font
+ colours) but the system recorded naked skeletons, so he'd reject a comp
whose outfit was wrong. Owner decision: **approve LOOKS.**
- A look = the card's render seed + the FROZEN pick-relevant hint arrays
  (palettes / heroFonts / secondaryFonts / smallFonts) active when judged.
  Frozen means approved looks reproduce byte-for-byte forever, immune to
  later board re-derivations or font-pool changes (PROVEN: direct render
  vs via-look render identical for all 3 styles).
- Engine: `withLook(key,seed,fn)` wraps each style in renderStyleOptions —
  hints.looks present → seeded pick of ONE look per session, style renders
  with the look's own seed under its frozen hints (swap+restore). No looks
  → previous behaviour; no hints → byte-identical (goldens 72/72 kept).
- Server: layoutFeedback docs carry {seed, hints}; approvedLooks() = last
  verdict per (style, seed); buildLayoutHints: a style with looks sends
  entry.looks and SKIPS the weights transform (looks dominate); styles
  without looks keep legacy comp-level gating. layout-feedback API:
  GET returns {weights, looks}; POST accepts seed+hints (sanitized) and
  verdict clear deletes per-look (with seed) or per-comp (without).
- Playground: rolls ALWAYS explore (weights+looks stripped; distinct comps
  per roll; "Review every composition" checkbox removed — ★ Selected shows
  the customer set instead). Verdicts ride with seed+hints. ★ Selected
  renders every approved look EXACTLY + legacy comp approvals labelled
  "arrangement only"; Remove clears per-look.
DONE same day: clean-slate wipe executed (styleRefs 64, layoutRefs 36,
profiles, all 219 feedback docs → backed up in `data/_backup-2026-08-16/`,
ref image files moved there too). KEPT: fontFeedback, settings (hard
rules / image rules / catalog / case prefs), users, generated-images.
Boards are empty until the owner re-uploads and re-derives.

## 6-COLOUR-SYSTEM (2026-08-17, owner rulings) — wine-kind gamut + harmony

Owner wrote the missing rules + ruled on colour. SUPERSEDES the
2026-08-16 ground rule. Engine (palAdapt/palPick, WINE_KIND per render):
- GROUNDS under artwork: always LIGHT. red/rosé → white/warm/pink;
  white/orange → white/warm, never pink. Bold/dark grounds ONLY on
  palette entries marked panel:true (they force a text-only comp):
  red products → red/dark-red/black panels; white products → black/
  orange/deep-yellow/green/blue/tan/brown panels (MSCH gained deep green
  + deep blue panels for whites).
- ELEMENTS: red wine → blacks/greys + red hue range [335..25]; white →
  blacks/greys + warm/earth/green [15..170]. Off-gamut elements are
  RECOLOURED (hue clamped to nearest allowed edge, S×0.9, L kept) so
  board palettes keep character. PUNK ONLY: single most saturated
  off-gamut element survives untouched = one free vivid accent.
- IMAGE side ("layout must not limit artwork" — owner): prompt gains a
  seeded "Colour world" sentence per wine kind — the LOOSE reading of the
  same harmonious family (artwork may be vivid/many-coloured, punk gets
  full saturation); the strict reading lives in the engine gamut. Both
  sides share ancestry, neither constrains the other.
- IMAGE RULES box FILLED (via live compile): 6 global anti-AI/copyright/
  print-imperfection rules + 2 per style (traditional hand-cut roughness,
  contemporary economy, punk protected rawness). Art Direction extra
  refined (dead "1:1 square" removed).
- FONT RACE ROOT-FIXED: ensureFonts now loads "italic 500 Cormorant
  Garamond" (the face the browser substitutes for the engine's italic-600
  runs — it was NEVER loaded, causing run-to-run golden wobble on
  shrink-fitted italic lines, surfaced by new comp #8). engine-test NEED
  list extended (CG 500 italic, Playfair 600, Prata, Grenze, Manufacturing
  Consent). Goldens re-baselined, 72/72 stable across 3 consecutive runs.
TRAP (cost an hour): the parity/e2e suite targets the ROOT page — on
branch UX_Tasting_Journey the root is the journey UI, so captures/e2e
must run on the MAIN branch (classic at root). Also: goldens rewrote
.next again — rebuild before `next start` (documented trap, re-hit).

## 7-PROVIDERS (2026-08-18) — four engines + the winning HYBRID

Owner-driven provider trials, all behind IMAGE_PROVIDER + a per-batch
A/B dropdown in Image Play (job.provider override):
- openai (gpt-image): best STORY comprehension; house default until now.
- recraft: style_id per style ("Sync boards to Recraft", Image Refs) —
  gorgeous technique, poor scene comprehension/anatomy (owner verdict).
  RECRAFT_API_KEY. Note: Recraft memberships ≠ API units (separate).
- flux (fal.ai): per-style REAL LoRA trained from the boards ("Train FLUX
  LoRA" per style, ~$2/3min via queue + fal storage upload — data-URI
  zips are rejected as "URL too long"; pending runs persist and resume so
  a paid run can't be lost). Best technique, learned the boards' oval/
  toned-paper habits; text comprehension mediocre. FAL_KEY.
- **hybrid (the winner so far): gpt-image composes the story, then FLUX
  image-to-image (strength 0.62, lora 0.9) repaints it in the board's
  LoRA craft.** Live-verified: "man in the wine cellar" → correct figure
  + barrel in genuine engraving. Tuning dials: strength (content
  fidelity) and lora scale (technique strength).
- Providers plug in via src/lib/image-provider/{recraft,flux}.ts;
  finishArtwork (webp→png via sharp for recraft) + all verified rules
  apply to every provider. shortPrompt (buildShortPrompt) serves
  style-conditioned providers: subject + geometry + non-negotiables.
- COMPARE-AND-CORRECT (image-rules.compareToReference): output judged
  side-by-side against its reference card; ≤4 craft corrections → one
  corrective regeneration. Wired in playground (result.refine) + sets.
- **EXACT COLOURS (owner rule 2026-08-18): card-palette.ts extracts each
  reference's ink palette (deterministic, cached settings/card-palettes);
  prompts request ONLY those inks and finishArtwork's palette-lock stage
  MAPS every coloured pixel to the nearest reference ink (luminance
  preserved) — invented hues cannot survive. Backgrounds stay under the
  white-ground rules.** finishArtwork also does paper neutralization
  (border-ring white balance) and WHITE_BG_RULE is vision-checked.
- LoRAs trained so far: traditional only — owner to train contemporary
  and punk from the admin buttons.

## 6-RULES-AUDIT (2026-08-17) — "do the admin rules actually work?"

Owner challenged whether admin rules influence anything. Audit verdict:
- WORKING: Art Direction global rules/avoid (assembled into every prompt
  as "House rules:"/"Avoid:"), built-in rules, Hard Rules tab, derived
  per-card art language, feedback notes. The owner's doubt came from the
  GENERATIONS LOG capping stored prompts at 2000 chars — the trailing
  rules sections were cut from view (not from the model). FIXED: log now
  stores 12000 chars + the negative.
- WIRED BUT EMPTY: verified Image Rules box (owner never wrote any) and
  Art Direction per-style rules (doc predates the perStyle revamp).
- WEAK/INERT: Layout Refs "Rules" — steers ONLY colour/type derivation;
  owner's saved lines were all geometry topics (engine-enforced anyway).
  UI note rewritten to say so honestly. Dead letter removed from the
  owner's extra ("1:1 square" — image size is code).
- BUG FIXED: derived card fields could smuggle enclosure language back
  into prompts ("enclosed oval structure" seen live) — deEnclose() in
  prompt.ts neutralizes enclosure vocabulary in medium/composition/
  language/charter at prompt time (existing cards fixed, no re-derive).

## 6-UX-JOURNEY (2026-08-17, branch UX_Tasting_Journey) — new customer
flow preview: Calibration (swipe approved looks) → Sommelier Interview →
Print House (staged progress) → Tasting Flight (pour away/crown) →
Winner + tier cards (payments inert). Classic configurator kept at
/classic on that branch; engine/admin/curation shared. Owner evaluating.

## 6-QUALITY-ROADMAP (2026-08-17) — owner-approved priority order

Owner milestone review: images still read as AI; layouts lack diversity
(and he correctly sensed layouts trace to his old PDFs — "Derive layout
language" extracts palettes/fonts ONLY, never arrangements; every
arrangement is hand-coded engine comps). Agreed plan, in order:
1. **Ink-discipline post-process** — SHIPPED (below).
2. **Board→comp workflow** — SHIPPED (marker below); owner marks board
   labels 🔨 "build this as a composition" in Layout Refs; Claude reads
   the marked list (layoutRefs.buildRequest) and hand-builds each as a
   verified engine comp. Plus comp MUTATIONS (parameterized anchoring/
   scale/alignment per comp, verifier-swept) — NOT built yet.
   **First batch DONE (2026-08-17): traditional comps 7-9** from the
   owner's 3 marked boards — #7 Jullouville (wide engraving band, serif
   name between two short divider rules, centred caps data), #8 Perrin
   (emblem, tracked producer caps, blackletter name + italic appellation
   + cuvée grouped mid), #9 Pegau (arched producer caps via sArcText —
   baseline SM+1.25×size or the arc crosses the top margin — crest box,
   blackletter, red accent line). Traditional pool 6→9 (STYLE_BOXES +
   HERO_ALTS + VARIANT_COUNTS all updated; counts read from
   STYLE_BOXES.length now). **Look pinning added with it: withLook sets
   FORCED_V from the stored look variant (pickV consults it), because
   pool growth remaps seed→comp and would silently change approved
   looks.** Goldens re-baselined (mapping shift, intentional).
3. **Provider A/B test** (Recraft / FLUX style conditioning vs gpt-image)
   — NOT started. Architecture ready via IMAGE_PROVIDER.
4. **Generated layouts** (LLM proposes comps in engine vocabulary →
   hard-rules verifier kills broken → playground approval gate) — later.
5. **LoRA custom style model** — needs owner decision (training data +
   setup cost); the real endgame for non-AI-looking art.

**INK DISCIPLINE (owner 2026-08-17), in finishArtwork()
(image-provider/index.ts, replaces whitenEdges, same call site):** every
generated PNG gets deterministic paper grain (∝ ink coverage — white
stays clean) and LUMINANCE-quantized tones (INK_LEVELS=6, all channels
scaled by one factor so hue is exactly preserved — per-channel posterize
bands into false colours, tested and rejected), then the white-edge
snap+feather. Smooth AI gradients break into flat ink layers like a
screen print. Constants INK_LEVELS/GRAIN_AMP are code-side tunables.
Cached pre-ship sets keep old pixels until regenerated.

## 5-COLOUR-AND-EDGES (2026-08-16)

**Standing rule (owner): label BACKGROUND colours are white/warm tones for
EVERY wine; red/pink grounds are additionally allowed ONLY for red wines
(wineColorName matches /red/i; rosé currently counts as non-red). Cool or
dark grounds never pass.** Enforced in the engine's palPick (bgAllowed:
HSL classify the bg — whiteWarm L≥0.78 & (S≤0.28 or hue 15-70); redPink
hue ≥335/≤25 & S≥0.15) so it governs built-ins, board palettes AND
approved looks alike; a list with no allowed entry keeps its inks on a
forced warm-white #FBF7EF. Notable: the minimalist red panel and punk
red/pink grounds are now red-wine-only. Goldens re-baselined (9 diffs,
all in the White dataset, punk+contemporary — the rule working).

**WHITE-EDGE GUARANTEE (owner): generated near-white grounds printed as a
faint square under multiply.** whitenEdges() in image-provider/index.ts
post-processes EVERY generated PNG (inside generateImageWithRetry, so
set + playground + legacy single all get it): alpha flattened onto white,
near-white snapped to #FFF through a soft knee (min-channel ≥248 → white,
232-248 smoothstep, below untouched), outer 4% of each edge feathered to
white. Non-PNG (mock SVG) passes through; failures return the original.
pngjs promoted to a runtime dependency (+@types/pngjs dev).

**LOOKS-ONLY GATE (owner 2026-08-16, after seeing unapproved layouts on
the page post-wipe): customers NEVER see unapproved layouts — no
fallback.** buildLayoutHints always sends `__looksOnly:true`; the engine
(setStyleHints → LOOKS_ONLY) renders a quiet white "STYLE — designs are
being curated" card for any style without approved looks. Exemptions:
test rigs with `window.__SEED0__` pinned (parity/e2e/captures) render
normally, and the admin Layout playground strips the flag so the owner
can always see everything. editor-embed refetches /api/layout-hints on
every "Layout alternatives" press (window.__8kRefreshHints), so admin
approvals reach an open customer page without a reload.
NOTE: cached customer sets generated before this ship may still show oval
artwork until regenerated (new story/seed or server restart clears the
in-memory cache).

## 5-UI-V2 (2026-08-16) — white/grey theme, B&W uncropped covers

Owner redesign of the configurator shell (all in build.js theme block +
configurator-base.html; label engine untouched, goldens unchanged):
- **White & grey UI** replaces the beige era: page/inputs/active tab
  #FFFFFF, inactive tabs #E3E3E1 (hover #D4D4D2), stale preview button
  #DCDCDA. Black 2px lines stay. (CLAUDE.md UI rule updated.)
- **Covers**: grayscale(1) filter on all [data-cover=hero] images; the
  hero container no longer hard-codes an aspect ratio or max-height — it
  takes the image's own ratio. The REAL cropper was the cover parallax:
  updateParallax() set an inline `scale(1.35)` (inline style beats the
  theme's transform:none), zooming every cover and cutting the sides.
  PARALLAX_SCALE is now 1 (scale 1 also clamps the translateY buffer to
  0, so the handler is a harmless no-op). Covers fit the window width
  exactly, full scene visible. The three embedded assets (HERO_SRC/
  HERO_BACK_SRC/HERO_BOTTLE_SRC in configurator-base.html) are 1800×657
  full-scene engravings — they were never the problem.
- **Type**: menu links, tab titles and big buttons 19px → 13.3px (−30%);
  logo wordmark stays 19px; section titles (.section-head h2) now match
  tab titles at 13.3px.
- **Your Vision** section head has id=visionHead; its underline is
  removed (other section underlines stay).
- **Pricing gate**: #frontReveal .pricing is hidden until a specific
  front label is selected (selIdx >= 0, toggled in editor-embed paint()).

## 5-LAYOUTS-V4 (2026-08-16) — hard rule: max 3 typefaces per label

**Standing rule (owner, 2026-08-16): no label uses more than 3 font
FAMILIES** (weights/italics of one family count as one). Implementation:
- Every text element in every comp routes through the hero/secondary/small
  role picks (HP/F2/F3) — the hard-coded faces that bypassed the curated
  pools (sBlock/sRot/sArcText calls in ~12 comps) now take the role pick
  with their old face as the designed fallback (unhinted output unchanged
  for those).
- Comps whose DESIGNED fallbacks mixed 4-5 families were collapsed to ≤3:
  contempX v2 (producer archivo→jost), flora v2 (producer fraunces→
  archivo), flora v3 (producer archivo→jost), flora v4 (producer archivo→
  jost, vintage fraunces→cormorant), premium v0/v2/v3/v4 (appellation
  cormorant→EB Garamond italic 500). Goldens re-baselined (1 comp diff).
- check-hard-rules.mjs now enforces ≤3 families in BOTH modes: unhinted,
  and under tracer hints (Girassol/Felipa/Estonia — faces no comp uses as
  designed fallbacks) where any designed family showing through = a
  role-bypass. Sweeps 300 seeds to hit every comp.
- Since each role picks ONE font per label render, curated pools of any
  size still yield ≤3 families per label.

## 5-LAYOUTS-V3 (2026-08-16) — approved-only fonts & compositions

**Standing rule (owner, 2026-08-16): customers get ONLY selected fonts and
ONLY approved layouts.**
- Fonts: buildLayoutHints hero pool = Fonts-playground approvals only (the
  board-derived pool no longer auto-joins; it only seeds the deck).
  Secondary/small were already approved-only. A role with no selections
  falls back to each comp's designed font.
- Comps: once a style has ANY net-approved comp (weight > 1), every
  non-approved comp is sent as weight EXACTLY 0 and the engine's
  pickVariant treats 0 as "never render" (positive weights keep the 0.05
  floor; all-zero → uniform fallback; no-hints path byte-identical, goldens
  untouched). With no approvals yet the old soft fade applies.
- Layout playground "Review every composition" strips ONLY the weights from
  the live hints so excluded comps can still be audited and re-approved.
- Layout comments steer the next derivation (palettes/font character on
  re-analyze) — they do NOT move elements. Moving elements inside a comp =
  engine code change per comp; owner writes the wish as a comment and asks
  Claude to implement it.

## 5-LAYOUTS-V2 (2026-08-16) — one hint source; no frames ever

**Standing rule (owner, 2026-08-16): NO frames or borders on any layout.**
The Traditional comps that copied framed boards (variants 0 Gewürztraminer,
2 Mittelwihr, 5 Margaux/Ausone) now render frameless; goldens re-baselined
(only those rects diffed). Short divider rules (e.g. the premium gold line)
are not frames and stay.

**Bug fix — "web layouts don't match the Layout playground":** layout hints
had TWO sources. Boot + playground fetched `/api/layout-hints`
(buildLayoutHints — board palettes, approved fonts+case, comp weights,
minGap). But every artwork generation returned `layoutHints` built by the
OLD `layoutHintsFrom(imageProfiles)` (palettes only), and page.tsx fed that
to `setStyleHints`, which replaces hints WHOLESALE — wiping fonts, weights
and the gap rule the moment a customer generated artwork. Now
generate-label-set returns `await buildLayoutHints()` (fresh even on cache
hits) and `layoutHintsFrom` is deleted. ONE source of truth; web ≡
playground.

## 5-IMAGES-V4 (2026-08-15) — refinement-loop semantics, final form

**Standing rule (owner, 2026-08-15): a rejection NEVER devalues the
reference.** "The problem most of the time is how image generation
interprets the reference, not the reference itself." Removing a reference
from the pool = deleting it in Image Refs — nothing else. Consequences
(supersedes the V3 weight>0.55 bench / retire mechanics):
- feedback.ts: verdicts are `up`/`down` only ("retire" removed everywhere;
  legacy retire docs count as rejections). Approvals boost weight (+1);
  rejections change NOTHING in the weights — they increment
  `cardNotes[key].rejections` instead.
- prompt.ts: a card with rejections gets a divergence instruction early in
  the prompt ("N earlier interpretations of this style were rejected —
  take a clearly DIFFERENT interpretation… while keeping the reference
  technique"), merged with any per-card fix-notes.
- Playground bench: ALL cards always in rotation, ordered least-recently-
  shown first (`cardSeen` Mongo collection) so successive rounds walk the
  whole board before repeating. `includeRejected` checkbox + retire link
  removed from the UI; stats line now total / boosted / unjudged.
Also from this era (same day, earlier sessions):
- keep/fix comment fields are independent of the verdict (👍 keep counted
  even on reject, 👎 fix counted even on approve; legacy `comment` falls
  back by verdict). Per-card notes ride in the prompt.
- COMP_SHAPES rotation in prompt.ts — 8 composition shapes seeded per
  style/card/story (owner: "not all ovals").
- Built-in verified rules (image-rules.ts, code-side like WHITE_BG):
  NO_TEXT_RULE unless the story asks for lettering (`wantsText`);
  `subjectFocusRule` pins generation to exactly the stated subject unless
  the story asks for a crowd (`wantsCrowd`); prompt.ts welds a
  subject-exclusivity clause onto the subject line for the same cases.

## 5-IMAGES-V3 (2026-08-15) — PER-REFERENCE style cards + verified rules

Owner: rejections kept coming back; wants each reference image remembered
as ONE specific style. Root bug found: feedback was keyed by auto-N
direction keys that RESHUFFLED on every re-derive, orphaning all
verdicts (36 orphans wiped). Now:
- analyzeStyle derives ONE style card PER REFERENCE image (incremental —
  only new refs analyzed; force=true redoes all; deleting a ref removes
  its card). Card key = reference id — permanent identity; feedback
  sticks forever. 56 cards derived (traditional 7 / contemporary 29 /
  punk 20).
- Image Play shows the SOURCE REFERENCE thumbnail beside each generated
  image for 1:1 judging. (Bench weight>0.55 / retire mechanics from this
  era are SUPERSEDED by 5-IMAGES-V4: rejections no longer touch weights.)
- VERIFIED image rules (src/lib/admin/image-rules.ts, settings/
  image-hard-rules, /api/admin/image-rules, UI section in Image Rules):
  plain-English rules, one per line, global+per-style. EVERY generated
  image (playground AND customer sets) is inspected against them by a
  vision model (OPENAI_VERIFY_MODEL, default gpt-4o-mini); violators are
  regenerated once with the broken rules made strict; playground cards
  show pass/fail. Check never blocks generation on API failure.

## 5-IMAGES-V2 (2026-08-15) — cluster-first derivation, anti-AI prompting

Owner: images looked generic-AI and identical across styles. Root cause:
one-pass analysis of 12 low-res refs with gpt-4o-mini produced art-school
category language shared by all styles. Fix (style-refs.ts analyzeStyle):
PASS 1 clusters the whole board (≤24 refs, low detail) by technical
language; PASS 2 derives ONE direction per cluster from ≤4 refs at HIGH
detail with a banned-generic-vocabulary list (real processes only:
burin, riso, linocut…); PASS 3 text audit rewrites anything overlapping
other styles' directions. Default vision model now gpt-4o
(OPENAI_VISION_MODEL overrides). Charter retired (empty) — per-direction
language leads prompts. prompt.ts: ANALOG demand appended to every
prompt + ANTI_AI_NEGATIVE appended to every negative (both hard-coded
outside admin template, like WHITE_BG). All 3 styles re-derived live:
traditional 4 directions (copperplate/wood engraving/litho-stipple/navy
linocut), contemporary 7, punk 6. Pending experiment (owner to judge
current results first): single reference image as technique anchor.

## 5-HARD-RULES (2026-08-15) — mechanical constraints, verifier-enforced

Owner's hard rules, implemented in the ENGINE and proven by
tests/parity/check-hard-rules.mjs (renders 3 sizes × 8 seeds × 3 styles,
measures INK geometry via canvas metrics — quantized, upright-measured,
latin-ext-probed so goldens stay byte-stable):
1. 5mm margin — nothing crosses it (frames moved inside, sImageBox clamps,
   sRot verticals positioned inside; sRot splits into two columns when the
   7pt floor cannot fit the height).
2. 7pt font floor (sBlock/sRot/sArcText clamp).
3. ≥1mm between text blocks — TUNABLE in the admin Hard Rules tab
   (settings/hard-rules → hints.__hardRules.minGapMM → engine MINGAP).
Geometry now uses REAL ink extents (inkVA): sBlock top/bottom are visible
edges, stackUp is bottom-anchored (fromBottom), fitHero squeezes heroes
between artwork and stack. Several comps restructured to bottom-anchored
stacks. The verifier also flags any composition that crashes into the
error fallback. Admin UI compacted; tabs renamed (Image Refs/Rules/Play,
Layout Refs/Play, Fonts, Hard Rules, Generations, Users).

## 5-RESTART (2026-08-14, branch Popika_Label&Image_Generation) — READ FIRST

Owner reset: previous layout/image guideline eras were compounding
confusion. New world, supersedes older 5x sections below where they clash:

**THREE public styles**: `traditional` · `contemporary` (merged pool of the
old contemporary+flora+premium+minimalist comps — 22 comps, internal pools
keep their own palettes/typography) · `punk` (old artistic). Engine:
`cVariantFor` maps contemporary's merged index; `LabelEngine.variantFor`
exposes it; sets are 3 images (cheaper). Mongo refs migrated
(flora/premium/minimalist→contemporary, artistic→punk); old profiles,
feedback and per-style art rules WIPED; image profiles re-derived for 3.

**Admin panel split (page.tsx)**: Image · Refs / Rules / Playground (the
old tools, 3 styles) and NEW **Layout · Refs & Rules** + **Layout ·
Playground** (`src/lib/admin/layout-refs.ts`, APIs under
/api/admin/layout-*). Layout refs are their own uploads
(data/layout-refs/, `layoutRefs`); "Derive layout language" (vision +
owner rules) produces palettes + a hero-font pool mapped onto engine
fonts (FONT_CHOICES); the playground renders REAL comps client-side
(engine script + variantFor) and approve/reject writes `layoutFeedback`
→ per-comp weights.

**The one influence pipeline (no hidden overrides)**: GET /api/layout-hints
(public) = palettes + heroFonts + weights per style → editor-embed fetches
at boot → LabelEngine.setStyleHints → palPick/heroPick/pickVariant consume
them. Without hints: built-ins (goldens deterministic; parity/tests pin
__SEED0__=0 and skip the fetch via __PARITY_OFFLINE__). Verified e2e:
posting a reject changes /api/layout-hints weights immediately.

Gates now: goldens 72/72 (3 styles), parity 0.000%, both e2e suites pass.

## 5c-fix3. Structural label copies + per-direction image language (2026-08-14)

Owner: comps still read as the old templates (shared 3-column footer
skeleton from the PDF era) and each style's images converged on one look.
- **Layouts**: all six styles rebuilt as STRUCTURAL COPIES of specific full
  labels on the boards (named in comments: Gewürztraminer, La Couspaude,
  Mittelwihr, Kirile, Olive Tree, Margaux / Gotes, ñor, Saperavi, Wine
  People, horizon, Finca Collado / Hermit Ram, Elephant, Chico Malo,
  Hamilton, Aleria / Sinegal, Ram's Gate, Campinún, 1780, Implicit / …).
  The uniform sRow footer is GONE — every comp carries its own small-print
  structure (centred stacks via stackUp, corner stacks, vertical edge
  captions via the new shared `sRot`). Variant counts now 6/6/5/5/6/6.
  Text-only comps are allowed (minimalist scrawl/panel) — e2e pins
  __SEED0__=0 so embed assertions see the artwork comps.
- **Images**: vision pass now derives a self-contained 40-70-word
  `language` PER art direction (each mirroring one distinct cluster of the
  board, "different artists" rule); buildStylePrompt leads with the CHOSEN
  direction's language, charter only as legacy fallback — so consecutive
  generations look like different artists from the same board.
Goldens re-baselined; parity 0.000%; profiles re-derived live.

## 5c-fix2. AUTOMATIC combinatorial variety (2026-08-14, supersedes the
New-artwork button — owner rejected any manual button)

Variety is now automatic and combinatorial:
- **Engine**: `sRand/sPick` (deterministic hash PRNG) + `STYLE_SALT`;
  composition, palette and hero font are INDEPENDENT seeded picks per
  style. `HERO_ALTS` gives every composition 2-4 board-compatible hero
  fonts (blackletter comps offer blackletters, script comps scripts…) →
  ~100+ combinations per style. `styleZones` uses the same variant pick so
  server prompts match the shown comp. Red minimalist panel forces the
  text-only comp (light-ground rule). Goldens re-baselined (144/144).
- **Client**: `baseSeed` random per session; every "Layout alternatives"
  press = `newSeed()` (fresh random combo, never a fixed cycle; prev/next
  history still works). `EightKImageGen.seed` random per session too, so
  every visit gets new art directions; within a session the cache holds
  (layout edits stay free). `window.__SEED0__` pins both seeds for
  parity/tests (set in capture-original.mjs).
- **Server**: art-direction rotation mixes a hash of the story into the
  pick — same session + new story = new directions. No New-artwork button.
e2e: layout roll changes rendered SVGs with zero generation calls.

## 5c-fix. Variety unblocked; auto-hint overrides retired (2026-08-14)

Owner reported layouts still felt like the old templates and images never
varied. Root causes found and fixed:
1. `EightKImageGen.seed` was hard-coded 0 — the server always picked the
   same art direction per style and always answered from cache. FIX: new
   **"New artwork"** button (`#engNewArt`, next to Layout alternatives)
   bumps the seed and regenerates the set — the ONE deliberate paid action
   (6 images, cached per seed). "Layout alternatives" stays free and never
   touches artwork (owner decision). `buildBrief` zones now follow the seed.
2. The engine's vision-hint layer was flattening the reference-designed
   comps: `heroFont` replaced EVERY comp's hero font with one font per
   style, `pickVariant` filtered out non-"centered" comps, `hintPal`
   replaced the board palettes with washed auto-derived chords. All three
   overrides RETIRED — `setStyleHints` still accepts the server payload but
   rendering ignores it. Goldens unchanged (144/144, no re-baseline).
e2e: test-imagegen asserts reseed = cached + New artwork = exactly one new
set call with changed artwork.

## 5c. Reference-FIRST layouts (branch Labels_By_Reference_Test)

**2026-08-13 third pass (owner request): compositions + typography derived
directly from the uploaded reference boards (`data/style-refs/`, viewed as
contact sheets); the focal/fade zone template era is RETIRED.** Image
placement doctrine now: each composition reserves a FREE AREA rectangle
(`STYLE_BOXES` in label-engine.js) that text never enters, and the artwork
is drawn centred inside it — 'meet', full opacity, multiply, no masks, no
crops. `LabelEngine.styleZones(seed)` still exports {focal,fade,shape} for
the server prompts, derived from each box (`zoneFromBox`: focal = box inset
7%, fade = box +6%, shape from aspect), so the generation contract is
unchanged. Rules kept: element hierarchy, NO text overlap at any size,
7pt minimum, Google/free fonts only, light grounds under artwork.
37 compositions total — Traditional 7 (Alsace blackletter oval, Bordeaux,
framed type-only, red letterpress sans, engraved-portrait script signature,
airy engraving over tracked caps, left column), Contemporary 7 (corner caps
+ centred motif, giant lowercase serif, split condensed, arched caps ring,
letterspaced serif caps, horizon field, script signature), Flora 6 (big
beast, arched stamped caps, naturalist plate, brush hero, airy creature,
beast + script), Premium 5 (ghost numerals, tracked-caps silence, hairlines,
data-sheet + emblem at foot, crest + copperplate script), Minimalist 6
(airy centre, left column, oversized word, colour panel, handwritten scrawl,
mark at the foot), Artistic 6 (naive centre, poster, handwritten corner
title, rotated side caps, arched hand-lettering, riso band). New Google
fonts: Grenze Gotisch 600 (blackletter), IM Fell English SC (stamped
antique caps); arc via sArcText, rotated side caps via a local rotText.
2026-08-11 era (26 comps, focal/fade zones) is in git history; the
`Layout Styles/*.pdf` era survives on branch Popika_test if ever needed.

## 5c-old. Reference-driven design rules (first pass)

Derived 2026-08-11 from the owner's `Layout Styles/References/` (211 images,
6 styles). PDF geometry, sizes and hierarchy stay authoritative; references
drive colour, ink and image direction. Owner rules: NO layout element may
overlap another at any label size; artwork variety comes from ink/ground
colours as much as subjects.

- **Palettes rotate per press** (modulus differs from the composition count,
  so pairs keep changing): Traditional papers ivory/cream/straw with accent
  inks brand-red/oxblood/sepia/slate-blue; Contemporary grounds white/cream/
  coral/blush/sage; Minimalist ink/warm/cobalt/coral hero schemes; Flora leaf
  inks green/vermilion/terracotta/forest; Premium ivory/white/charcoal;
  Artistic riso grounds cream/tomato/blush/near-black.
- **Type**: Artistic hand = Permanent Marker (new font); other families per
  the PDFs (Tinos, EB Garamond, Barlow/Barlow Condensed, Archivo 300-800).
- **Image sub-styles** rewritten in `src/lib/styles/catalog.ts` to mirror the
  reference boards — 25 recipes incl. single-ink engravings in sepia/oxblood/
  slate, Matisse cut-outs, gradient horizons, red/black woodcut animals,
  gold-line crests, naive wine-drinker line art, riso posters. White-background
  rule unchanged.

## 5d. Image-generation architecture v2 (2026-08-12, in progress)

**Focal doctrine corrected (owner clarification):** the black/gradient zones
are COMPOSITIONAL, not visual effects. The renderer no longer applies any
alpha masks — `sImageZone` draws the artwork at full opacity ('meet', so the
subject can never be cropped). Instead, generation is **layout-first**: the
engine's `STYLE_ZONES` table (per style/variant) is exported via
`LabelEngine.styleZones(seed)`, the brief carries each style's zone + the
label's aspect bucket (landscape/portrait/square), and the server verbalizes
the geometry into the prompt (subject inside the focal area; only expendable
surroundings spreading outward; scene dissolving into pure white before the
edges — which multiply then makes vanish on the label). The mock provider
draws its subject inside the focal box as pipeline proof.

**BUILT (2026-08-13 later): style CHARTER leads every prompt.**
Owner feedback after approve/reject exercises: generation obeyed rules/avoids
but resembled the reference boards too little. Fix: the vision pass now also
derives a `charter` per style — a dense 60-120-word subject-agnostic paragraph
of the board's visual DNA (line quality, texture, shading, ink application,
printing feel, abstraction, negative space) — and `buildStylePrompt` PREPENDS
it ("Artistic language (follow it exactly): … invent an original composition —
never replicate any existing artwork") so the boards' language outweighs the
trailing rule lists (image models weight early tokens most). Variant `medium`
descriptions are now 20-40 words (tool, stroke weight, texture, imperfections).
Older profiles without a charter fall back to their `summary`. Both prompt
paths covered (set orchestrator + admin Playground); charter shown in the
admin Styles tab. All 6 styles re-analyzed live 2026-08-13.

**BUILT (2026-08-13): refinement loop + per-style direction + type/composition hints.**
- /admin Playground tab: generate a test batch for one style (one image per
  art direction, live provider), approve/reject with optional comments.
  Feedback lives in Mongo `styleFeedback`; aggregates reweight the art-
  direction rotation (approved directions enter the pool extra times),
  rejection comments join the style's negative prompt, approval comments
  become "favour:" rules. Cache key includes feedback state.
- /admin Art Direction revamped: global rules/avoid + per-style rules/avoid
  for the SIX real styles (config.perStyle in settings doc); legacy preset
  picker removed from UI; prompt template moved under Advanced with an
  explanation. buildStyleJob merges global + per-style + feedback lines.
- Vision analysis also derives layout typography ({display enum, case}) and
  composition ({alignment}) per style; layoutHints carry them and the engine
  maps display->already-loaded fonts for the HERO text only (hintPal ->
  heroFont) and prefers layout variants whose alignment matches the boards
  (pickVariant tags). Engine without hints is byte-identical (goldens 144/144).

**REVISED (2026-08-13): references are style-language only.**
Owner rules after reviewing real output: (1) reference images must NEVER
reach the image model — as image[] inputs the edits endpoint copied their
shapes and subjects, and diversity collapsed onto the boards; (2) subject
matter comes ONLY from the brief/wine facts, references define visual
language; (3) each style needs several distinct art directions. So: the
vision pass now derives 6-8 subject-agnostic art directions per style
(anti-copy rules in the instruction) plus 3-5 layout palettes (light
grounds enforced by sanitizePalettes). Generation rotates art directions
by seed and appends the variant's ink treatment to the prompt; the boards
themselves stay server-side. Layout palettes flow to the client as
result.layoutHints -> LabelEngine.setStyleHints() and REPLACE the built-in
scheme tables per style (engine renders byte-identically without hints —
goldens unchanged). Note: same story + same seed still returns the cached
set by design; variety appears on regenerate (new seed).

**BUILT (2026-08-12): per-style reference boards + derived variety.**
/admin gained a Styles tab (default): upload reference images per style
(stored in data/style-refs/ + Mongo `styleRefs`), delete, and "Derive
variety" — a vision pass (gpt-4o-mini, OPENAI_VISION_MODEL overrides) that
studies the board and stores 4-6 variation recipes in `styleProfiles`.
Generation: derived recipes OVERRIDE catalog sub-styles for that style
(seeded rotation), up to 2 reference images rotate into every gpt-image
call as image inputs (edits endpoint, image[] array), and the prompt gains
"follow the exact artistic language of the attached references". Cache key
includes ref ids + profile timestamps. Styles without refs keep the
catalog fallback. Verified end-to-end incl. a live vision analysis.

**Later (fuller curation):** Style charter + sub-styles in
Mongo with /admin editing; reference-image uploads per sub-style passed as
image inputs to gpt-image; a Playground tab generating trial grids;
approve/reject with reason tags; approved exemplars reused as references;
sampling weights for diversity control. Diversity = sub-style x ink/palette
variant x composition variant x layout, all seeded and logged.

## 6. What's DONE / what's NEXT

DONE: verbatim transplant with proven parity (engine 144/144 byte-identical;
UI 0.000% pixel diff on 9/10 states, gallery card-set identical); image
backend in mock mode with e2e coverage; old port + tracked `.next/` removed.
Milestone commit `4da0504`.

NEXT (in rough priority):
1. Owner delivers style reference PDFs + layout rules → replace the placeholder
   sub-styles in `src/lib/styles/catalog.ts` and build image slots + layout
   variants for the remaining styles (incl. per-layout focus/clear-zone values).
   DONE (2026-08-11) for **Traditional** (9 comps), **Contemporary v2**
   (5 comps) and **Minimalist** (6 comps) — transplanted from the owner's
   `Layout Styles/*.pdf` with exact geometry, plus the owner's FOCAL/FADE
   image-zone spec: solid black = focal area (subject must live there),
   gradient = fade area (expendable content only). Zones render via
   `sImageZone()` (linear/radial dissolve masks, multiply). Fonts: Tinos for
   Times, EB Garamond native, Barlow/Barlow Condensed for DIN, Archivo
   300/400 for Helvetica/Light; arched producer via `sArcText` (textPath).
   Reseed cycles comps via Math.floor(seed/2)%N. Still pending: Flora,
   Premium, Artistic (awaiting owner PDFs; they keep provisional v1 slots).
2. Focus-area v2: subject-detection pass after generation, position the image
   so the subject sits in the layout's clear zone.
3. CMYK PDF export step (SVG master stays RGB) for the print deliverable.
4. Rate-limit `/api/generate-label-set` (TODO(security)) before any public
   deploy — one request = 6 paid model calls.
5. Admin: catalog editing UI (sub-styles per style), seed/shuffle control in
   the client, persist the set cache in Mongo for multi-instance deploys.
6. Deferred by user: mobile/responsive parity (capture scripts are
   1440px-only), logo placement rules (box 2).

## 7. Engine internals reference

For label-engine conventions (units, HFLOOR font floors, hierarchy tiers,
compositions, the 6 styles, data shape), see
`8k-labels-package/CONTINUE-HERE.md` §4–5 and `8k-labels-package/docs/` —
still accurate for the engine itself; ignore their "single HTML file / no
server" framing and their pending-work lists, which this file supersedes.

## 8. DEMO DAY prep (2026-08-18, investor demo)

- **Hybrid is the web default now**: `.env.local` has `IMAGE_PROVIDER=hybrid`
  (gpt-image composes the story → FLUX img2img + per-style LoRA repaints the
  craft). `IMAGE_QUALITY="dev"` stays until launch (quarter-cost, ~8–10¢ per
  finished image incl. the corrective pass; full set ≈ 68–76s). Flip to
  `"prod"` + consider an upscale pass when publishing.
- **Engine fixes (gated + goldens re-baselined twice)**:
  1. `sFlow` now applies an empty line's `pre` offset — briefs without
     appellation/producer/vintage no longer collapse the text flow into the
     hero zone (live collisions in punk v2 and flora v1).
  2. Punk v4 small print stacks up from the foot; hero shrink-fits above it
     (down-flow used to crowd the bottom lines on full briefs).
  3. The legal line ("… Alc. by Vol. / N mL") gets maxW 62% in punk v1/v2 —
     wrapFit silently DROPS TRAILING WORDS when a line can't fit its column
     at the 7pt floor, and the truncation was baked into 6 goldens. If a new
     comp ever gives the legal line a narrow column, re-check this.
- **Journey polish**: flight pours round-robin across styles (first four
  glasses show the range); SVG scaling uses `width="100%"` only (SVG rejects
  `height="auto"`); favicon added (`src/app/icon.svg`).
- `start-demo.sh` (repo root): kill :3200 → build if missing → start → open.
- Known cosmetic: punk look seed 34465 sets grape/vintage very tight (still
  readable); owner can Remove that look in admin if it bothers him.

## 9. GROUND COLOUR RULES v2 (owner, 2026-08-19)

- Grounds are WARM, SOLID, FOOD-FRIENDLY. No acid/toxic/chemical hues ever
  (the toxic-green snail label triggered this).
- PINK ground only when the image itself contains pink; otherwise the tint
  is replaced by old paper.
- Neutral / monochrome (grey-black) artwork → OLD-PAPER grounds: warm pastel
  yellows and light beiges (never chemical lemon yellow).
- Cool-hued image inks (green/blue) still make grounds, but muted and warmed
  (olive/sage, blended toward paper) — never bright pastels or acid bolds.
- Punk: warm inks lead the bold grounds (solid, S≤0.62); cool inks give
  muted deep voices; neutral punk art gets warm sand/ochre papers. The punk
  PROMPT now demands colour-DOMINATED images (multi-colour printing, not
  monochrome drawings).
- All implemented in labelPaletteFromImage (card-palette.ts); engine
  wine-kind gamut + ΔL≥0.32 contrast guard unchanged on top.
- HIGHLIGHT RULE (owner 2026-08-19): monochrome image/layout allowed, but
  70% of renders colour ≥1 worthy element (accent role: appellation/vintage/
  grape lines; neutral sub small-print carries a softened highlight) in the
  wine's family — reds on reds, greens on whites. hlAcc() in palPick,
  imgPalettes path only. Punk v1 appellation joined the accent role.
- Kirile (traditional v3) artwork box enlarged per owner duck reference.
- SCREEN-PRINT MODE (owner 2026-08-19): generate-label-set keys artwork at
  SEND time (keyArtwork in image-provider: white → ink-density alpha;
  cache/verifier/palette extraction stay opaque). Engine picks blend per
  ground: L≥0.60 multiply (renders identically to the old opaque-white
  image — multiply is linear), L<0.60 normal compositing (opaque inks on
  coloured stock, data-sp="1"). Dark-on-dark artwork is gone; goldens and
  parity untouched.
- TIMELESS NEUTRALITY (owner 2026-08-19): unless the story names a time,
  culture or ethnicity, images may not pin one — no period/folk costume,
  no culture-specific accessories or era-specific architecture; people and
  settings read modern-but-neutral or timeless. TIMELESS_RULE +
  mentionsEra() in image-rules.ts, wired in set route + playground,
  verifier-checked like the other built-ins.

## 10. BRANCH POPIKA_IMage&layout_relation (owner GO 2026-08-20)

Goal: image↔layout relation — image-aware layouts, interlocks, then the
composer + harmony critic + vocabulary gate (see the strategy discussion,
sections above). Built so far:
- IMAGE INTELLIGENCE: art-analysis.ts — per-artwork density grid (24×15),
  quiet zones (usable negative space, up to 3 rects), ink bbox + centroid,
  open side, ink share. Computed in generate-label-set on the opaque image,
  ships as hints[style].imgAnalysis. Foundation for interlocks/full-bleed.
- PROOF BENCH (admin tab): judge FINISHED labels (real artwork + layout +
  fonts, exactly the customer render). Approve, or Reject with "what
  failed" chips (image/arrangement/fonts/colour/interplay) + note →
  /api/admin/proof-feedback (collection proof_feedback) — the corpus for
  the future harmony critic. Cards show the artwork mini-map with quiet
  zones. "Re-render layouts" re-deals looks on the same artwork set.
Next on this branch: interlock effects (text-behind-subject, knockout hero,
silhouette wrap) consuming imgAnalysis; composition contracts in prompts;
then the LLM composer emitting engine specs.
- IMAGE-AWARE PLACEMENT (2026-08-20, first consumer of imgAnalysis):
  resolveArt lets the artwork's QUIET grid cells (density ≤0.07) slide
  under text blocks — artwork grows into its own negative space and text
  may sit inside the image's calm areas; dense ink still respects the gap
  (mechanical legibility). With analysis present the punk boost caps at
  the verified max size (an unverified overshoot broke the promise).
  imgAnalysis rides setStyleHints persistence + withLook like imgPalettes.
  Bench draws quiet zones ON the label at the artwork's real placement
  ("Show/Hide quiet zones"). No-hints path unchanged; goldens 72/72.
- RECRAFT REMOVED (owner 2026-08-20): provider, routes, admin sync UI and
  env key stripped — hybrid (gpt→FLUX LoRA) is the only styled path.
- INTEGRATED COMP PREVIEW (2026-08-20): styleIntegrated() — full-bleed
  artwork, name set INTO the reserved top band, halo small print ON the
  artwork. Reachable only via the __integrated hint flag (Proof Bench
  "Integrated preview" toggle) — customers/goldens/parity untouched until
  the owner blesses the direction. stackUp forwards halo.

## 11. BRANCH POPIKA_ALTERNATIVE_ENGINE (owner GO 2026-08-25)

The pivot after the owner's experiment (raw gpt-image whole-label beat our
comps artistically): the model becomes the COMPOSER, its output a BLUEPRINT
never material. Pipeline v1 (all live in Proof Bench "Dream mode"):
  DREAM  /api/admin/dream: gpt-image designs the complete label (sketch,
         typos allowed; prompt carries real brief text + approved-font
         spirit + style mood).
  TRANSCRIBE  gpt-4o reads the dream as GEOMETRY → JSON spec: per element
         role/box/align/caps/tracking/nearest-approved-font/weight/colour;
         ground; artwork {box, subject, palette}. One element per role
         (split wine names covered by one box).
  ARTWORK  clean gen from the dream's subject (openai path, palette lock,
         finish, keying).
  REBUILD  engine renderDreamSpec(): REAL brief text as vector type at the
         transcribed geometry — 5mm margins clamped, 7pt floor, contrast
         guard, wine may wrap 2 lines, legal line always prints (halo),
         word-dropping forbidden (min widths 34%/60%). Artwork placed
         exactly (inflated 1.12 vs 'meet' letterboxing), multiply/screen-
         print by ground. Never reached by normal paths (goldens 72/72).
Cost ~5-8¢ + ~60s per dream at dev quality. Next: fidelity score
(overlay-compare), approve-as-look for dream specs, richer font library,
composition-contract tightening, then customer wiring.
- DREAM ENGINE v2 (owner directive 2026-08-25): "the dream leads, the
  architecture follows." Separate admin at /dream (Dream Studio) — old
  admin/branches fully intact. phase:"dream" designs the whole label
  (hierarchy-aware prompt, optional customer sketch as reference, prompt
  quotes the owner's dream_feedback comments so dreams compound);
  phase:"rebuild" transcribes geometry against an OPEN font library
  (~50 Google faces, "forget the approved fonts") and regenerates the
  artwork WITH THE DREAM AS IMAGE REFERENCE (owner-chosen path — text
  stripped, same illustration), finished+keyed. renderDreamSpec v2
  replicates verbatim: colours exact (contrast guard removed here), fonts
  loaded dynamically, artwork placed by box width at true aspect. Laws
  kept: 7pt (sBlock), 5mm text margins, legal line always; word-dropping
  structurally impossible (boxes widen to measured full-text width).
  Old comp/rules/looks paths untouched (goldens 72/72 remain).
- NEW ADMIN (owner 2026-08-25): /admin = Dream Engine panel only — tabs
  Dream Studio · Hard Rules · Generations · Users, with the standing rule
  noted in the header: fonts come from the open Google library only. The
  old-engine tabs (Image Refs/Rules/Play, Layout Refs/Play, Fonts, Proof
  Bench) are gone from it; the ENTIRE previous admin lives on at /legacy
  (src/app/legacy/LegacyAdmin.tsx, which also exports the reused tabs)
  and, of course, on the previous branches at /admin. Dream Studio is a
  shared component (src/app/dream/studio.tsx) used by both /admin and the
  standalone /dream page.
- ONE FULL ADMIN (owner 2026-08-25): /admin tabs = Dream Studio (with the
  new DREAM REFERENCES board: upload whole-label designs → "Analyze board"
  → dream charter text that rides every dream prompt; images never reach
  the model, refusal-guarded) · Image Refs (boards→cards, as before) ·
  Image Play (as before) · Rules (hard rules + verified image rules
  merged; min-gap and artwork-fill RETIRED — not imposed by the dream
  engine) · Generations · Users. Old admin at /legacy.
- ARTWORK DIVISION OF LABOUR (owner 2026-08-25): dream rebuild artwork now
  runs the corrected chain — the DREAM contributes subject + composition
  (+ soft palette hint, no mechanical lock); the BOARDS contribute visual
  style (card language / charter + Image Play favour/avoid + verified
  image rules in the sketch prompt); FLUX + the style LoRA repaints the
  craft (region-aspect flux size override); core rules verified with one
  corrective pass (text leakage from the dream is the main catch). Studio
  passes the dream's mood as the style (free→contemporary). LoRAs trained
  2026-08-25 from the new boards are saved in Mongo — code changes never
  require retraining.
- FULL-BLEED DREAMS (owner escalation 2026-08-25 — a full-scene dream was
  crushed into a pasted rectangle on flat ground): the transcriber now
  classifies artwork coverage full|contained. Full: the ENTIRE dream is
  reproduced text-erased (gpt edit, house-style language, LoRA restyle,
  NO_TEXT verified with one corrective pass) and becomes the label's
  opaque edge-to-edge background; vector type is set into the scene
  (non-hero roles halo'd). Contained keeps the boxed path. KNOWN WEAK:
  small text over busy scene areas is marginal — next fix is local-
  luminance placement/stronger guard using imgAnalysis.
- FRONT-TO-BACK (owner 2026-08-25): dream engine core extracted to
  src/lib/dream/engine.ts (admin route + public route share it). Public
  streamed endpoint /api/dream-label (NDJSON; TODO(security) rate-limit
  before deploy). NEW customer page at / — story + texts + optional
  sketch + direction → dream → replica (fonts loaded dynamically,
  "see the designer's sketch" toggle). Old configurator moved to
  /classic. DREAM REFERENCES are now PER STYLE (boards + charters
  dream-charter-<style>; "free" dreams run uncharted); studio card has
  style pills with counts. Known weak point unchanged: small text over
  busy scene areas is marginal (halo only) — local-luminance placement
  remains the named next fix.
- DREAM RULES + FIDELITY LOOP (owner GO 2026-08-25): lib/dream/rules.ts —
  curated built-ins (no frames · no invented medals/crests/dates/extra
  text · no ligature/decorative lettering · no ornaments around texts ·
  flat label no mockup · no gloss · timeless · qvevri), story outranks
  rules, owner editor in Rules tab (settings dream-rules, verified like
  image rules, one strict redream on violation). Fidelity: ink-snap
  (colour-keyed glyph-block measurement replaces the vision model's
  guessed boxes), measured text heights drive font size, renderDreamFitted
  runs up to 2 correction passes and reports a geometry score.
  HONEST FINDINGS from the first E2E: (1) the score EXCLUDES artwork
  placement, so it can read ~95% while a misplaced artwork sits under
  correctly-placed text — score must include artwork deviation; (2) the
  full-bleed background reproduction can DRIFT badly (subject re-centred,
  scene ground dropped to white) — needs a mechanical composition check
  vs the dream with retry. Both are the named next fixes.
- CLASSIC RUNS THE DREAM ENGINE (owner 2026-08-25): /classic keeps its UI
  untouched; "Show Labels" now runs THREE dream flows (one per style,
  parallel, ~2min, ~20-25¢) via /api/dream-label; renderStyleOptions is
  patched at the host so the style cards/lightbox/resize render fitted
  dream replicas (gen429 retry guards the parallel gpt burst). Notes:
  "Layout alternatives" is inert in dream mode (specs are fixed per
  generation); DEMO_FILL example values (e.g. "Margaux AOC") still leak
  into dream briefs for empty fields — standing pre-launch revert item.
- COMPOSITION CARDS + REPLICATION OVERHAUL (owner 2026-08-25/26): each
  dream reference now ALSO becomes a composition card (layout-only,
  subject-blind, settings dream-cards-<style>); every dream deals one
  from a per-style shuffled deck — consecutive dreams vary in ARRANGEMENT
  and stay true to the board (traditional = contained emblems again). The
  generic "integrated as one whole" line retires when a card leads.
  Replication is measurement-first now: artwork extent measured from the
  dream's pixels (ground-diff outside text boxes; overrides the guessed
  box AND the full/contained call); contained artwork regenerates from a
  CROP of the dream's own illustration (kills recomposition drift —
  verified: heraldic lions survived); element colours resampled inside
  snapped boxes; letter case decided by width-testing both hypotheses;
  text collisions resolved in the fit loop and penalized in the score.
  Artwork failures now SURFACE (artworkError + console) instead of
  silently rendering an empty label. NOTE: composition cards exist only
  for boards analyzed after this — re-run "Analyze board" for
  contemporary and punk.
- FLUX/LoRA RESTORED (owner verdict 2026-08-26: "flux lora is better"):
  the retirement commit is reverted — dream-rebuild artwork runs ChatGPT
  sketch → FLUX+LoRA craft again, IMAGE_PROVIDER=hybrid. The gpt-only
  experiment remains reachable in history; the tag phase-flux-lora marks
  the last pre-experiment state.
- REPLICATION ROUND 3 (owner 2026-08-26): (1) ASPECT — studio replicas now
  render at the dream's 3:2 (110×73.3); the fixed 110×80 canvas had been
  silently squeezing all geometry ~9% vertically. OPEN DECISION: customer
  pages still render label sizes (110×80) — either labels adopt 3:2 or
  dreams must adapt per size. (2) FONTS MEASURED — transcriber returns 3
  candidates per element; the studio renders a case-matched sample in each
  and pixel-compares against the dream's glyph crop; winner wins. (3)
  ARTWORK CONTENT-PINNED — server ships the artwork's FULL-ink bbox
  (analyzeArtwork bboxFull); the engine stretches the image so its ink
  lands exactly on the dream's measured box, with a 112% overhang clamp
  (first pass drowned the hero, live-observed, fixed). (4) Dream count
  selector (1-4, parallel) in the studio. Verified: fidelity 87%,
  composition/fonts/artwork all holding; residual nit — occasional
  near-touch in the small stack (2023/SAPERAVI).
- HARD LAW + MEASUREMENT SELF-HEALING (owner escalation 2026-08-26):
  process change first — every rebuild dumps to data/debug/last-rebuild
  .json and rebuild accepts reuseArtwork, so renderer iteration is FREE
  (no owner money on repeats). Fixes: dense-cluster art measurement
  (texture/vignette immune) + plausibility guard (near-full-height
  "contained" measurement = contaminated → transcriber box wins); snap
  fallback (dark-ink window when colour-key misses); THE HARD LAW — a
  text block clear of art in the dream stays clear in the replica, text
  never moves, art shrinks (binary search); arc flag + arched rendering;
  score punishes art-over-text (-20 each). HONEST STATE on the same
  failing dream (free reprocess): 60% → 69%, structure now correct (no
  art/text crossings), residuals: artwork renders smaller than the
  dream's, bottom stack compresses/near-touches, hero case missed once.
- DIAGNOSTIC SWEEP (owner 2026-08-26): dead-code audit came back clean
  (lint clean, no dead loops in the dream path); one vestige fixed —
  invalid styles no longer fall back to the retired "free" mode
  (traditional now). Bug fixes, all verified FREE on the saved failing
  pair: (1) the hard law now judges the artwork's INK region instead of
  the full image rect (white margins shrank art chronically); (2)
  minimum-gap cascade (0.8% H) replaces overlap-only resolution — no
  more near-touches; (3) case detector tests CASE x TRACKING jointly
  (spaced caps no longer read as mixed; adopted pair wins). Same dream:
  60% → 69% → 90%, 0 overlaps, 0 art-over-text. Goldens 72/72, hard
  rules PASS. Residuals, stated honestly: hero case still missed on this
  pair (caps rendered mixed), artwork mass ~10% under the dream's.
- BAND ERA + THE REAL DIAGNOSIS (owner escalation 2026-08-27): halo
  outlines REMOVED from dream replicas (owner: dream has none). Per-
  element ink-snap replaced by global line-band detection (row profile,
  run-length text/art discrimination, tall-band splitting, order-
  preserving DP matching, geometric coverage). Verified on the owner's
  saved pair across FIVE free reprocesses: small lines (producer,
  vintage, region, legal) now found reliably; BUT results still vary
  run-to-run because EVERY reprocess re-runs the vision transcription,
  whose boxes/coverage wobble — each mechanical layer that anchors on
  any part of it (artGuess for band exclusion) inherits the wobble, and
  textured artwork (woodcut stipple = short runs) defeats the run-length
  test. CONCLUSION, stated plainly: heuristics anchored to the noisy
  transcription cannot converge. THE FIX WITH GUARANTEES: segment the
  dream ONCE with proper 2-D connected-component analysis (stroke
  geometry separates glyphs from art deterministically — standard OCR
  preprocessing, pure JS, no model in the loop); the vision model keeps
  only role/font labelling. Deterministic: same dream → same regions,
  every time. ~Half-day build; testable free on saved pairs. Current
  honest state on the owner's pair: 75%, textured-art rows still
  misclassify.
- CC SEGMENTATION ERA (owner "go" 2026-08-27): the promised deterministic
  fix, DELIVERED WITH PROOF. Geometry now comes from one connected-
  component pass over the dream pixels (flood-fill labelling of the dark
  mask, glyph vs artwork by component size/stroke-width, glyphs clustered
  into lines, art bbox from art components; lines buried >45% inside art
  components are artwork texture, not text). The matcher no longer uses
  the transcriber's coordinates AT ALL: each component ≈ one printed
  character, so a line's GLYPH COUNT identifies its text against the
  brief (plus width-ratio at 0.3 weight, hero→tallest, legal→lowest,
  producer→topmost; exact min-cost assignment). The vision model is
  demoted to role/font/caps/arc labelling only. PROOF on the owner's
  saved pair: three reprocesses → three byte-identical geometries, every
  element on its true dream line (producer/hero/2023/SAPERAVI/KAKHETI,
  GEORGIA/legal), segmentation glyph counts literally matching the text
  lengths (18/15/4/8/14/33). Renderer fix: sBlock's letter-spacing comes
  from the correction-scaled size, so the box-widen `need` now measures
  with that same tracking — "CELLARS" no longer drops at the 7pt floor.
  Debug: spec.segLines lists every candidate line (y/h/w/n/artCover/
  kept) in the free-iteration dump. Gates: parity 0.000%, hard rules
  PASS, goldens 72/72. test-imagegen/test-autogen are N/A on this branch
  (they test the retired generate-label-set flow; /classic now runs
  dream flows — old flow lives on the old branches). Honest residuals:
  legal renders at the 7pt law floor (bigger than the dream's tiny
  line — the law wins); artwork style drift is a FLUX-craft matter, not
  geometry; arced lines may fragment into short segments (unmatched →
  transcriber fallback box).
- MEASURED TYPOGRAPHY (owner escalation 2026-08-27, "are you making fun
  of me"): three real defects found in the saved failing pair and fixed,
  all verified free. (1) Grape latched onto a phantom line (grass tufts
  42% inside artwork, 8 components = same count as SAPERAVI) — the
  art-cover rejection tightened 0.45→0.30. (2) The client width-guess
  case test overrode the server's correct caps — RETIRED whenever the
  segmentation measured the line; case now comes from glyph heights
  (median ≥ 62% of max = caps, which also reads SMALL CAPS correctly;
  true lowercase x-height sits near half). Tracking measured from median
  ink gap between neighbouring letters. (3) Arc measured from letter
  centres (ends sitting lower than the middle by >0.55 glyph heights =
  arched); arc lines get textH from the glyph height, not the inflated
  line box, and the measured sagitta drives the curve. Plus: the hard
  law now licenses the dream's own interpenetration — a text box the
  dream let leaves reach into allows the replica exactly that much
  overlap (truly clear boxes still get full PAD clearance), which
  stopped the chronic artwork under-sizing. Proof: 3 reprocesses →
  identical geometry AND typography; rendered pair shows arc producer,
  caps hero, correct stack order, full-size artwork. Gates: parity
  0.000%, hard rules PASS, goldens 72/72.
- CENTRING + CASE HARDENED (owner 2026-08-27, second pair): two defects,
  both structural fixes. (1) A dust speck at the canvas edge shared the
  producer row's height and stretched its box to x=0.005 — glyphs
  touching the outer 0.8% of the canvas are now rejected, AND each line
  is split at x-gaps wider than 2.5 glyph-heights keeping the dominant
  cluster (a speck can never stretch a box again), AND snapped text now
  anchors at its measured ink CENTRE (the dream's ink is the alignment —
  the transcriber's align flag only applies to guessed boxes). (2) The
  digit/capital-heavy legal line read as caps by glyph heights — case
  now uses DESCENDERS when the text predicts them (mixed case would
  show g/j/p/q/y below the baseline; caps never do; arc lines keep the
  height rule since their baseline bends). Proof: 3 reprocesses
  identical, pair rendered — producer centred, legal mixed like the
  dream, fidelity 92. Gates: parity 0.000%, hard rules PASS, goldens
  72/72.
- EFFICIENCY PACKAGE (owner GO 2026-08-28, three fronts):
  (1) LAYOUT VARIETY: root cause found in the stored composition cards —
  the analyzer had flattened diverse references into near-identical
  "centred illustration, name below" prose, and punk card 8 carried the
  reference's SUBJECT ("open mouth") which a dealt card then painted.
  Card prompt rewritten to geometry-only vocabulary (zones, fractions,
  alignment axes, scale contrasts, bleed edges, arcs; subjects and
  technique words banned); charter prompt bans depicted subjects (style
  is HOW, never WHAT). All three boards re-analyzed: cards now diverse
  (bleeds, vertical text, left columns, arcs). Quoted words/years from
  references are sanitized at save ("House Party" → "a text element");
  stored cards cleaned one-time.
  (2) REPLICATION: ground = modal page colour and ink = distance-from-
  ground with HYSTERESIS (strong ink seeds shapes, weak pixels only
  join), so coloured grounds (yellow punk) segment properly and paper
  grain can't spawn phantoms; full-bleed dreams now get the same line
  matching (they used to fall back to transcriber guesses — the yellow-
  pair failure); glyph colours weighted by ink-ness² (core decides, not
  antialiased edge); art bbox = 96% ink-mass box (specks can't stretch
  it); hard law licences are PER GLYPH (art may weave between words as
  the dream did, never over letters); ROLE_TEXT recipes now match the
  server prompt exactly (legal said "Dry Red" not "Dry Red Wine";
  special printed twice when it had its own line); empty transcription
  retries once then fails loudly (used to render a bare label
  silently — one of the "unstable" reports). Proof: Margaux pair, 3
  reprocesses identical, all 7 roles on true lines, fidelity 93.
  (3) GLITCHES: NO_GLITCH_RULE (two heads, fused bodies, hybrids) added
  to image-rules and wired into both artwork verify lists with the
  existing strict retry.
  Gates: parity 0.000%, hard rules PASS, goldens 72/72.
- DREAM-AS-CANVAS ERA (owner GO 2026-08-31, after "I am out of hopes"):
  ARCHITECTURE CHANGE. The dream image itself now becomes the label
  (artworkMode "canvas") — art fidelity is guaranteed by construction
  because every non-text pixel IS the dream. The engine erases ONLY the
  dream's painted letters (pure pixel work — no model touches the image:
  per-glyph fill from each glyph's own ring colour, then a band sweep for
  same-ink pixels, art components protected via the component map, fill
  blended from clean pixels above/below each column) and sets real vector
  type on the measured boxes. Generation paths (sketch/FLUX contained +
  full-bleed restyle) remain in code for rollback but are unreachable;
  per-label cost DROPS (no image generation — only transcription).
  Segmentation upgrades proven on the owner's punk arc-hero dream (the
  hardest specimen yet): LOCAL grounds (per-tile modal colour, bilinear —
  pink sky + yellow earth both read correctly), colour-constrained flood
  fill (a purple letter can't fuse with a teal leaf it touches), LINE
  TRACING (a text line = a left-to-right run of similar-height glyphs
  with continuous baseline — follows arcs, refuses foliage), sibling-
  aware burial (only ARTWORK ink buries a glyph), ORDER-PRESERVING DP
  match (vision reading order + pixel glyph counts; skipping decoration
  is free) — 5/5 identical correct assignments across runs. THE SAFE-
  ERASE RULE: an element is typeset ONLY when its traced line is whole
  (width + glyph-census checks) and its band is art-free; otherwise the
  dream's own painted text stays (it already carries the customer's real
  words — the dream is prompted with them). On the punk pair that means
  vintage+grape in vector, hero/producer/region/legal kept painted —
  fidelity 99, no doubles, no smears. Topology ensemble: 3 parallel
  transcriptions, median box per role; empty transcription retries then
  fails loudly. Every rebuild archives its pair to data/debug/pairs/
  (regression corpus — failing dreams are never lost). Legal-line law in
  canvas mode: painted IS printed. Gates: parity 0.000%, hard rules
  PASS, goldens 72/72. OPEN: print-resolution upscale of the canvas;
  arc-hero vector typesetting (kept-painted for now); FLUX/LoRA idle.
- NO-OVERLAP LAW (owner 2026-08-31, standing rule "never let texts
  overlap"): (1) canvas is now UNCONDITIONAL — even a rebuild that can
  typeset nothing ships the dream itself as the label; the FLUX/sketch
  generation path is unreachable (a zero-typeset run used to fall back to
  it — that produced the owner's overlapping label). (2) Kept-painted
  lines export their measured pixel boxes (element.paintedBox); the
  renderer treats them plus already-placed text as immovable obstacles:
  every typeset block is constrained to the free span between obstacles
  in its band — it shrinks, shifts its anchor, or wraps to one more line,
  but can never print over another text. Verified on the punk pair:
  canvas mode, 2 vector lines set between 4 painted ones, fidelity 99.
  Gates: parity 0.000%, hard rules PASS, goldens 72/72.
- SYSTEM REORGANISED AROUND THE CANVAS (owner 2026-08-31, "reorganize the
  system so it makes sense"): the illustration inside the dream IS the
  final art, so every image-quality asset changed address, not purpose:
  (1) Image Refs boards → style profiles/cards, weighted by Image Play
  feedback, now steer the DREAM prompt directly ("the ILLUSTRATION inside
  the label is executed in the house illustration style: …"). (2) The
  anatomy-glitch law moved into DREAM_BUILTINS (its old home, the craft
  verify, is unreachable) — every dream is inspected for fused creatures
  and redreamed once on violation. (3) NO_TEXT and WHITE_BG stay LEGACY-
  ONLY laws: a dream is a complete label and rightly contains its texts;
  there is no separate keyed artwork any more (the "artwork on pure white
  + multiply" law is thereby retired for the dream engine — still active
  in the legacy/classic engine; flagged to the owner). (4) Rules tab copy
  explains the merge. Image Play remains as a style lab: its feedback
  weights are exactly what the dream prompt consumes. Smoke-tested: dream
  generates, prompt carries the house illustration style line.
- LAYOUT OBEDIENCE (owner 2026-08-31, "dream is not listening to the
  references"): root cause was the CARD ANALYSIS reading references at
  detail:"low" (thumbnail vision) — it hallucinated "bleeding off edges"
  on 4 of 5 traditional references that are actually contained centred
  images, and even dictated "border encloses design" against the
  no-frames law. Fixes: (1) analysis at detail:"high", prompt leads with
  the illustration's AREA FRACTION and position, bleed only when ink
  truly touches an edge, border/frame talk banned + sanitised out.
  (2) The dealt card is now the DOMINANT prompt clause ("COMPOSITION —
  NON-NEGOTIABLE") and contained cards append an explicit containment
  directive. (3) Contained cards add a VERIFY check — a full-bleed dream
  against a contained card is redreamed once, strictly. All three boards
  re-analysed: traditional now reads "one fifth/one third, centred,
  contained" across the deck; contemporary/punk keep their genuine
  bleed cards. Smoke-tested: traditional dream measured at 13% contained
  top-centre artwork (pixel measurement, not eyeballing).
- VALIDATED ERASE + STILL CANVAS (owner 2026-08-31, "artefacts, doubled
  texts, web page text over image"): (1) The erase is now TWO-PHASE: it
  PLANS every pixel it would remove, AUDITS the band for painted ink the
  plan would miss, and only then applies — if ghosts would survive, the
  element is un-typeset and keeps the dream's painting. Invariant: vector
  text exists ONLY where its painted original provably vanished — doubles
  and artefacts are impossible by construction. Verified: every typeset
  band audits 0.0% leftover ink. (2) renderDreamFitted runs a SINGLE pass
  in canvas mode — the old 3-pass nudges/min-gap cascade slid text over
  the fixed canvas (the web-page overlap). (3) The canvas return path now
  writes last-rebuild.json + the pairs/ archive (it had skipped both — a
  whole day of owner runs went unrecorded). Gates: parity 0.000%, hard
  rules PASS, goldens 72/72. NOTE: the owner tests on his OWN server —
  it must be rebuilt+restarted to pick any of this up.
- CLEANUP ROUND (owner 2026-08-31, "artifacts everywhere, nothing is
  working"): THE BIG FINDING — the owner's web server on :3000 had been
  running since AUG 16, two weeks before the canvas engine existed; every
  "web" label came from the ancient build. It now runs the current build
  (kill via lsof, PORT=3000 npm run start — keep BOTH :3000 and :3200
  current after every ship). Real fixes on the new build: (1) SUB-STYLE
  DECK — illustration style cards now deal from a shuffled bag per style
  (full coverage before repeat, like composition cards); random selection
  repeated the same look. (2) ERASE, FINAL FORM — the three heuristic
  keep-paint pre-gates (width, glyph census, art-share) are DELETED;
  one honest gate remains: every erase is PLANNED (glyphs + touching
  outline/shadow components + same-ink sweep), all plans union, and each
  job is audited across the FULL label width of its arc-extended rows —
  neighbour text doesn't scare the audit because neighbours' own plans
  cover it. Only provably-clean erases apply; failures keep the painting.
  Verified on 4 archived owner pairs: ZERO ghost bands in every style
  (vector counts are conservative on chaotic punk art — painted text is
  correct text). Layout sameness note: traditional's references ARE
  similar (one-fifth/one-third centred) so its deck is honestly narrow —
  diversity there needs more diverse references, not code.
- GHOSTS CLOSED FOR GOOD (owner "?" 2026-08-31 late): two blindness bugs
  found via the archived pairs: (1) audits ran before neighbours' failures
  released their pixels (order hole — fixed with a stable audit loop that
  re-offers released pixels and re-audits until quiet); (2) a huge display
  name can DOMINATE its ground tiles so the "paper colour" becomes the ink
  colour and those letters turn invisible to every stage — mitigated with
  a 3×3 spatial median over the tile grid, and CLOSED by the ABSOLUTE
  POST-CHECK: after all fills, each band is re-scanned by pure colour
  match (no ground model to blind); if ink is still visible the band's
  original pixels are RESTORED and the text stays painted. Wrong typeset
  is now impossible regardless of upstream blindness. Audited on the
  owner's archived pairs across all styles: ZERO ghost bands. Honest
  price: vector rates are conservative (0-3 per label on busy art);
  raising them means smarter erasing, never looser gates. Transcription
  ERRORs seen tonight are the loud-fail working during OpenAI flakes —
  the studio shows the error instead of a bare label.
- BRANCH POPIKA_No_Vector (owner 2026-09-03): NO VECTOR — the dream IS
  the final label, full stop. (1) /api/dream-tiff converts any dream to
  a 300dpi LZW TIFF download (1536px = ~355dpi at 110mm width — no
  upscale needed); buttons in Dream Studio and the customer page.
  (2) runDreamPhase also returns a ~170KB 1024w JPEG `preview` — admin
  and customer views display it; the full PNG stays the print source.
  (3) REPLICATION REMOVED from this branch's flows: studio has no
  rebuild button (dream → judge → TIFF), /api/dream-label streams
  dream-only (cheaper: no transcription), classic's style cards show
  the dream images directly. runRebuildPhase and the whole vector
  machinery remain in the code untouched — branch
  POPIKA_ALTERNATIVE_ENGINE is the vector rollback anchor.
  (4) Owner IMAGE rules (global + per-style) now verify dreams directly,
  filtered of lines that only made sense for standalone artwork (text
  bans / white-background); illustration boards + Image Play feedback
  already steer the dream prompt. Smoke-tested end to end: dream →
  preview → TIFF 300dpi (metadata verified). NOTE: MongoDB (charters,
  cards, rules, feedback) is SHARED across branches — nothing was
  deleted, so switching branches stays safe.
- CLASSIC IS THE ONLY WEB MODE (owner 2026-09-03): the alternative
  customer UX is removed — the root page IS the classic configurator
  (src/app/page.tsx re-exports classic/page; /classic stays as an alias
  for parity captures and old links). The shell's "Proceed to Payment"
  download is dream-aware: dream labels (wrapper SVGs carry a
  data-dream="<style>" marker) hand off to window.__DREAM_TIFF__ — the
  classic wiring posts the FULL-RES dream to /api/dream-tiff and
  downloads a 300dpi TIFF; classic vector labels still download SVG (the
  shell learned a hook, not an endpoint). Gates after the shell edit:
  parity 0.000%, hard rules PASS, goldens 72/72.
- NO SEPARATE DEVICES (owner law 2026-09-03): the illustration is ONLY
  the story's scene and its entourage — no badges, stamps, roundels,
  seals, emblems, leaf-in-a-circle marks, logos, floating motifs or
  extra writings like "natural wine". New DREAM_BUILTINS rule (prompt
  clause + verified check + strict redream on violation); skipped only
  when the customer's story explicitly asks for such a device. Rules tab
  copy lists it.
- MINIMALIST + LAYOUT ALTERNATIVES + PROOFREAD (owner 2026-09-03):
  (1) Fourth style "minimalist" everywhere: STYLE_MOOD, every style
  validation list, dream-refs boards (upload references + Analyze to
  give it a charter/cards — dreams run uncharted until then), admin
  pills, studio mood select; classic's Show Labels now dreams FOUR
  labels and the Minimalist card joins as the fourth (grid goes 2×2 at
  4+ cards; legacy 3-card layout untouched — parity 0.000%).
  (2) LAYOUT ALTERNATIVES: with a style selected in classic, the button
  dreams 4 fresh labels WITHIN that style (each deals its own layout
  card, so arrangements differ), REPLACING the cards; "← Back to
  previous labels" restores the prior set (history stack). Shell learned
  only hooks (__DREAM_ALTS__/__DREAM_TIFF__ with marker keys like
  "punk#a3"); the wiring in classic/page.tsx owns the endpoints.
  (3) PROOFREAD: every dream is spell-checked against the EXACT brief
  texts inside the existing verify pass (typos, doubled lines, invented
  wording → strict redream). Rough mistakes get caught for ~a cent;
  microscopic print is excluded from the check honestly. Gates: parity
  0.000%, hard rules PASS, goldens 72/72.
- ALTERNATIVES REMOVED + SIZE-AWARE DREAMS (owner 2026-09-03): BOTH
  layout-alternatives UIs are gone — the legacy seed-reroll nav
  (engNav/engPrev/engRegen/engNext + mkRegen) and the dream-era button
  with its history stack (__DREAM_ALTS__ hook deleted). Fresh layouts =
  press Show Labels again. STALENESS: the label size fields
  (le_wmm/le_hmm/widthMM/heightMM) now re-arm Show Labels like every
  other input — any change after generation leads to fresh labels with
  the updated data (buildBrief is read at press time). ASPECT: the
  brief's labelAspect() now flows through /api/dream-label into
  runDreamPhase — portrait labels dream at 1024×1536, square at
  1024×1024, landscape at 1536×1024 (the provider needs {w,h}, not the
  old accidental string), and the prompt names the right aspect; classic
  style cards render at the label's true millimetres. Gates: parity
  0.000%, hard rules PASS, goldens 72/72.
- HOMOGENISATION FIXED (owner 2026-09-03 "all styles look same, beige"):
  audit of every steering corpus found two causes. (1) dream_feedback
  comments were fed to EVERY style unfiltered — a minimalist "try even
  smaller image" note was steering all four styles' compositions; the
  query is now style-scoped. (2) Charters had drifted to the same generic
  vocabulary (traditional AND contemporary both "elegant serif,
  sophistication") and said nothing about backgrounds, so the model
  defaulted everything to beige. Charter prompt now demands what makes
  THIS board different (stock words banned) plus a mandatory "Grounds:"
  line naming the references' actual background colours; all four boards
  re-analysed — punk: "deep orange, cream, pastel yellow, vivid green,
  bright blue…", contemporary adds soft gray/muted blue/rich burgundy,
  minimalist creamy white/tan/soft orange/taupe. HONEST NOTE: the
  traditional board's grounds really ARE "soft cream, muted beige" —
  beige traditional labels are faithful, not a bug; more colourful
  traditional needs more colourful references.
- PUNK GROUNDS + CONTRAST LAW (owner 2026-09-03): (1) punk's mood now
  declares THE BACKGROUND IS PART OF THE PAINTING — a bold field from the
  illustration's own palette, never a detached/beige backdrop. (2) Each
  punk dream DEALS a ground colour from the board charter's "Grounds:"
  palette (deck discipline — full coverage before repeats): deep orange,
  cream, pastel yellow, vivid green, muted beige, bright blue, sunny
  yellow; the clause insists the scene lives ON that field as one
  painting. Re-analyzing the punk board refreshes the deck automatically.
  (3) NEW ALL-STYLES LAW: healthy text contrast — dark grounds lift type
  and imagery brighter; the verify pass redreams any label whose wording
  sinks into its background. Note: "cream"/"muted beige" sit in the punk
  deck because punk references contain them — prune those references if
  beige punk is unwanted.
- GROUNDS UNCONTROLLED (owner GO 2026-09-03): the punk ground DECK is
  removed (prescribing a field colour before the model knows what it
  will paint = forced combinations) and punk's mood line softened to
  "background and illustration belong to one painted world". Grounds now
  emerge the same NATURAL way in all four styles: from the charter's
  reference-derived "Grounds:" line + the model's own integrated image-
  making. Still active (deliberately): charters' Grounds language,
  contained-card "clean flat ground" (layout, not colour), and the
  contrast law (safety, not aesthetics). Traditional staying mostly beige
  is faithfulness to its references.
- EDITABLE STEERING TEXTS (owner 2026-09-03): every analysis-derived text
  is now hand-editable in admin and saved VERBATIM (no sanitiser — these
  are the art director's deliberate words). Dream side (Dream Studio
  tab): per-style charter + each layout card, "Save steering texts";
  API: dream-refs POST {saveTexts, style, charter, cards}. Illustration
  side (Image Refs tab, new IllustrationTextsCard): per-style
  illustration charter + each style card's language; API: style-refs
  POST {saveTexts, style, charter, variants}. Both round-trip tested.
  ⚠ shown in UI: "Analyze board" REGENERATES from images and overwrites
  hand edits — re-analyze only after changing reference images.
- STEERING SURVIVES RE-ANALYSIS + NUMBERED REFS (owner 2026-09-03):
  Analyze board no longer destroys hand steering. Cards: a reference
  that already has a card KEEPS its text (edits included) — only NEW
  references are analyzed; deleted references' cards drop away. Charter:
  kept whenever editedAt > analyzedAt (i.e. the owner touched it since
  the last analysis), regenerated otherwise. Analyze now reads refs in
  the SAME oldest-first order as the UI (was newest-first — card numbers
  never matched the thumbnails), limit raised 8→16. UI: dream reference
  thumbs carry number badges; each layout card is labelled "reference
  #N" (or "reference removed"); illustration style cards show their
  reference's mini-thumbnail inline. Proven by round-trip: edit card +
  charter → re-analyze → both survive verbatim.
- IMAGE PLAY + COLOUR-TRUE CARDS (owner 2026-09-03): Image Play results
  now dominate the row (reference figure shrunk 110→64px). Style-card
  analysis (analyzeOneRef) now REQUIRES the first sentence of the
  language to declare the binding COLOUR STATE ("Strictly monochrome —
  black only" / duotone / limited palette / full colour) so a monochrome
  reference can no longer yield coloured results. NOTE: existing cards
  keep their old texts (preservation logic) — to give an EXISTING
  reference the colour-state, hand-edit its card (e.g. prepend "Strictly
  monochrome — black ink only.") or delete+re-upload that reference.
- IMAGE PLAY PROVIDER SANITY (owner 2026-09-03): "server default" WAS
  hybrid (GPT→FLUX) — not the web engine at all on this branch. Now
  .env.local IMAGE_PROVIDER=openai (gpt-image = the actual dream/web
  engine), the redundant "server default" dropdown entry is removed, and
  gpt-image is the preselected option; FLUX/hybrid remain as clearly
  labelled lab-only A/B choices. ⚠ CROSS-BRANCH: the old vector branches
  expect IMAGE_PROVIDER=hybrid — restore it in .env.local when switching
  back to POPIKA_ALTERNATIVE_ENGINE or older.
- CLEAN SEPARATION: DREAM = LAYOUT, IMAGE REFS = STYLE (owner 2026-09-03):
  the dream charter no longer speaks about typography character,
  illustration technique or mood — it is a LAYOUT DOCTRINE only
  (hierarchy, alignment, type-scale contrast, density/whitespace,
  illustration placement + the Grounds line); illustration style is
  governed exclusively by the Image Refs boards / Image Play feedback.
  Engine prompt renamed accordingly ("House LAYOUT doctrine … the
  illustration's artistic style is governed separately"). All four
  charters regenerated layout-only (cards preserved); UI labels updated.
  Image Play's default story = the panduri test prompt. NEXT UP (owner):
  build the BACK label.
- BACK LABEL v1 (owner 2026-09-03): deterministic vector typography — no
  AI. src/lib/back-label.ts + /api/back-label (json|png|tiff 300dpi,
  pixel-exact) + BackLabelCard in Dream Studio. Same height as front;
  width grows by 45mm columns as content/markets demand (EU-only ≈
  102mm). Laws: nothing under 6pt (verified structurally), 2.6mm block
  air, EAN-13 (valid checksum, random GS1-Georgia 482 prefix when blank)
  + QR e-label both 15mm. TEMP placeholders fill every empty field
  (REMOVE BEFORE LAUNCH, like DEMO_FILL). COMPLIANCE per the site's 13
  markets — CONFIDENCE: HIGH = US (statutory Government Warning text,
  CONTAINS SULFITES, importer, origin) and EU (Contains sulphites +
  energy E kJ/kcal per 100ml on-label, ingredients/nutrition via QR
  e-label per Reg 2021/2117, L-lot). MEDIUM = UK, Canada (bilingual),
  AU/NZ (pregnancy warning TEXT + standard drinks — the mandatory
  PICTOGRAM artwork is a placeholder note), Mexico. LOW (best-guess
  wording, needs legal check) = Japan, Korea, China, Brazil, Israel,
  Georgia domestic. NOT implemented: per-country recycling marks,
  deposit marks, strip stamps. Shell's own Back Label tab (panel-back)
  not yet wired to this API — wire after the owner approves the layout.
- BACK LABEL v2 — TEMPLATE-EXACT (owner PDF 2026-09-03): the owner's
  WAIN/Back_Label_Template.pdf (80×80mm, Avenir Next Condensed) is now
  the layout, parsed with PyMuPDF and encoded 1:1 in
  src/lib/back-label.ts: name 12pt / description+columns 8pt / all else
  7pt, ALL CAPS, importer|producer two-column zone, PRODUCT OF + web
  row, BOTTLED/LOT/ALC line, statutory US warning zone, bottom band =
  CONTAINS SULFITES + QR 19.2mm ("SEE INGREDIENTS:") + EAN-13
  31.7×14.4mm with digits. Font: Google's ARCHIVO NARROW (closest
  condensed match), three weights installed to ~/Library/Fonts —
  verified loaded by sharp's fontconfig empirically; DEPLOY NOTE: any
  server rendering back labels needs these TTFs installed. Whole face
  scales with front height (template native 80mm; studio default now
  80). Markets beyond US extend width in extra 80mm panels at the same
  7pt; the base face never changes. Barcode+QR identical every time
  (positions/sizes fixed) per owner's rule. Pure code — no AI anywhere
  in the back label.
- BACK LABEL v3 + WEB (owner JPEG 2026-09-04): the owner's JPEG revision
  (WAIN/Back_Label_Template.jpg) measured programmatically (2270px=80mm)
  and encoded: FIVE 0.2mm full-width section rules (missing from the PDF
  parse — the "not accurate"), JPEG-exact row baselines, bottom band =
  CONTAINS/SULFITES + SEE INGREDIENTS at x4.1, QR 15mm at x22.4, EAN-13
  at x44.2 with STANDARD digit typography (leading digit outside the
  start guard, six-digit groups under each half, guards longer than data
  bars). Uploaded barcode/QR files (panel-back qrFile/barcodeFile)
  replace generated codes. WEB WIRED: the shell's static Back Label tab
  now works — backPreviewBtn reads descText + label-row fields (no ids;
  looked up by row label), markets from the country grid flag order
  [EU,AU,KR,IL,US,NZ,BR,GE,GB,CN,MX,CA,JP], height from le_hmm; preview
  renders into backThumbBox + "Download print file (300dpi TIFF)"
  button. E2E-verified with a real browser click-through. Wiring lives
  in classic/page.tsx (no shell edit).
- BACK LABEL v4 — ZONES, NOT SAMPLES (owner 2026-09-04): the template is
  now understood as ZONES with sample content, not fixed texts. (1) The
  US warning area is THE REGULATORY ZONE — it carries only the SELECTED
  markets' texts (no US warning unless US is picked; AU-only shows the
  AU text there). (2) Allergen appears ONCE, spelling/language derived
  from the market mix (SULFITES/SULPHITES combined, + CONTIENT for CA);
  importer label adapts; PRODUIT DE joins product-of for CA. (3) FLOW
  LAYOUT: zone order/rules/sizes from the template, but content flows
  and the WIDTH climbs a ladder (80→230mm) until everything fits the
  fixed height — wider face = longer paragraph lines = fewer rows;
  regulatory content fills columns; no more empty bolted-on panels.
  (4) FONT TRUTH: Archivo Narrow measured 0.51×size/char and physically
  overflowed into the codes (the owner's overlap) — BARLOW CONDENSED
  measured 0.398, matching the template's Avenir Next Condensed;
  installed 400+500 (deploy note). Width model is measured + script-
  aware (CJK 1.02, Hebrew 0.5, Georgian 0.55, Latin 0.41) with
  character-level breaking for spaceless CJK sentences. Verified: 7
  market mixes rasterized and machine-scanned — ZERO right-edge
  overflow; codes band reserved (QR placed after measured allergen
  text, EAN right-anchored). US-only = 90mm (the extra 10mm is honest:
  Barlow is a touch wider than Avenir at 8pt).
- MINIMALIST ON IMAGE SIDE + BACK PANEL POLISH (owner 2026-09-04):
  minimalist added to every image-side style list (style-refs route,
  image-rules, LegacyAdmin pills incl. Image Play + proof styles) —
  upload minimalist image references + Analyze to give it style cards.
  Web back panel: generated label now sits between two 2px black rules
  with equal 26px air above/below (flags · gap · rule · gap · LABEL ·
  gap · rule · gap · pricing); the label-side download button is
  REMOVED — the back panel's Proceed to Payment downloads the 300dpi
  TIFF directly (TEMP until the payment phase exists). Browser-verified:
  rules render, old button gone, pay click downloads
  back-label-300dpi.tiff.
- BACK PANEL SPACING FIX (owner 2026-09-04): the shell styles
  backThumbBox as FLEX — the injected spacers/rules collapsed to
  zero-width flex items ("no space, no lines"). Forced block display +
  one block wrapper; browser-verified: both 2px rules render full-width
  with exactly 26px air above and below the label.
- BACK PANEL, FINAL SPACING (owner 2026-09-04): NO rules — only clean
  26px space above and below the generated label. Root cause of the
  pricing overlap: the shell gives backThumbBox a FIXED 380px height
  while the label is ~460px tall — height/maxHeight/overflow now
  overridden inline so the container grows with content.
  Browser-verified: label bottom 832 < pricing top 904, zero overlap.
- NEW UI v1 (owner's Illustrator redesign, 2026-09-05): root (/) is now
  the redesigned wizard; classic stays at /classic (switch links both
  ways). HANDWRITTEN NOTES were read via macOS Vision framework OCR
  (osascript JXA — scratchpad ocr.js pattern; pyobjc/swift both broken
  on this machine). Asset pipeline: owner artboards → public/newui/*.svg
  with Illustrator pgf/XMP blobs stripped (4-28MB → 2-49KB) and mock
  raster images removed; their frames recorded in
  public/newui/frames.json = live-content zones. Architecture: fixed
  1440×823 canvas scaled as one unit; each page = owner's SVG as base
  layer + transparent overlays at design coordinates; STATIC header +
  footer/step-bar as fixed HTML strips covering the artboards' identical
  strips (pages slide only in the middle band, per notes); slide-left
  transitions 520ms cubic-bezier(0.33,1,0.68,1). Wired: welcome arrow →
  vision (story + sketch + Give-me-an-idea from a 20-prompt generic
  list) → front details (13 field rows + size) → loader (pulsing dots)
  → options (3 frames, labels anchored TOP-RIGHT per owner, Select
  inverts white/black, one label per style — no variations yet) → back
  details (7 rows + description + create/upload toggles) → compliance
  (13 markets, Arabic removed) → back design (live PNG + Edit→details)
  → bottle (radio dots, closure shade DRAG slider, bottle photo
  placeholder awaiting owner images "neck clean") → assets (placeholder
  hero+thumb SWAP, product shots F/B) → checkout (previews, terms,
  Proceed→downloads front TIFF + back SVG, TEMP until payment).
  MINIMALIST MERGED into contemporary (DB: 8 dream refs, 8 cards, 5
  image refs, 5 variants moved; UI lists back to 3 styles). Back label
  now downloadable as editable SVG (format=svg). Font: design uses
  Helvetica Neue World (commercial) — rendering via system Helvetica
  Neue; licensed woff2 pending owner decision. NEXT: owner visual pass →
  pixel-correction round (overlay coordinates are first-pass; the
  machine-diff harness comes with corrections).
- NEW UI v2 (owner: "header deformed, arrow not clickable" — root cause:
  v1 RECREATED chrome in HTML instead of trusting the artboards): the
  baked chrome IS the interface now — black header/footer bars, white
  type, progress line, step circles all come from the owner's SVGs;
  zero HTML recreation. All overlay coordinates re-extracted from the
  SVGs themselves: nav arrows are in the bottom bar (back 69–103,
  forward 1337–1371 @y686; welcome start arrow 134–169 bottom-LEFT);
  front rows baseline 251.3 +30.33/row (inputs x264.9); back rows 247.1
  +33.1 (values x989.6); compliance columns x347/602/851/1108 rows
  +52.3 with "Arabic Markets" COVERED by a white patch (removed per
  owner, baked in art); Select centres 286.6/698/1109.5 @545; bottle
  option rows x405/645/884 +29.8, finish 1120/1187, shade slider on the
  BAKED vertical track x1261.1 y358.8–495.4 with preview swatch at
  1093.7; loader dots under "Designing your label…" (639.9,514).
  Browser-verified: start arrow, next/back arrows, slides, baked black
  bar rendering. The bottom progress line lengths are baked per page.
- NEW UI v3 — the 24-point precision round (owner 2026-09-05), all
  verified by scripted browser: (1) REAL Helvetica Neue World fonts
  found on the owner's system (Linotype TTFs) and self-hosted
  (public/newui/fonts, @font-face 'HNW' 300/400/400i/700).
  (2) Header/footer/progress bar are STATIC layers rebuilt 1:1 from
  extracted geometry with the real fonts; only the content band slides
  (welcome→vision slides full so the bar rides in). Thick progress line
  animates to per-page endpoints extracted from the artboards (front
  334.48 … assets 1106.38; checkout has no bar by design). Circles fill
  by stage. (3) Welcome arrow flies left→right during the first slide.
  (4/5) Front size box animates + follows W/H inputs inside the design's
  814×377 area; baked value texts covered, live captioned inputs.
  (6) Textareas bounded to design boxes, live word counters. (7) Loader
  wine rises with real generation progress (⅓ per style) via multiply
  blend. (8) Text re-centred; my extra dots gone. (9/10) Baked dots +
  Select+magnifier boxes covered; single full-width Select per label.
  (11/12) Labels centre-fit in frames; crosses drawn at the LIVE label's
  corners (baked crosses covered). (13) DEMO_FRONT template texts fill
  empty fields at generation (TEMP). (14) Front/back generations cached
  by input signature — revisits never regenerate. (15) Baked E.g. texts
  covered; real inputs with italic placeholders that clear on focus;
  typed text italic like the design. (16) Upload Barcode/QR wired into
  the back label (barcodeImage/qrImage). (17) Compliance/bottle/checkout
  selection = small black dot INSIDE the design's own rings (no doubled
  circles). (19) Back label bg = front label's sampled ground colour
  (bgColor param), centre-fit in the 342.9 square. (20) Edit button =
  label width. (21) Gallery mode (dark overlay, ‹ › ×) on front labels,
  back label, checkout previews. (22) Bottle: colour wheel artwork
  RESTORED from the original artboard (public/newui/colorwheel.png),
  drag-pick + lightness slider on the baked track + result bar; owner's
  bottle photo restored into its area. (23) Product shots fitted to the
  cross-marked area. (24) Pack items selectable (dot circles), LIVE
  total, agree square → circle. E2E-verified end to end incl. one real
  generation run.
- NEW UI v4 — rounds 3+4 (owner items 1-17 + mid-turn 18-20, 2026-09-05):
  step labels corrected to 15px bold @720; textareas INSIDE their drawn
  polyline boxes (vision 137-1303×240-446, backdetails to 686); overlays
  render only after the slide (fade 180ms); size preview = the OUTER
  frame itself (3px + corner pluses), TOP-RIGHT anchored, diagonal
  scale-in entry (szGrow), live-follows W/H; Width/Height captions bold
  14 on the Volume baseline, values regular, dashed line covered; list
  inputs baseline-true italic UNDERLINED (like design st16), same on
  back details; loader = the CLASSIC glass (SVG lifted verbatim from the
  shell) with wine rising by generation progress, FADE transitions;
  options labels sized by grid-cube rule (horizontal = full Select
  width; vertical fits 240-540 with 34.3 side cubes), Select buttons
  white/1px-outline → black "Selected"; upload labels display:block fix;
  compliance flags image restored (was stripped) — RINGS LIVE INSIDE IT,
  pixel-detected: x[282,534.5,786.9,1039.3] y[355.1,407.1,459.1,511.1];
  checkout rings pixel-detected x143.5 y[529…701] incl. the agree circle
  (design already had it); bottle rows y[279.5…426.5] cols
  [384.5,624.5,863.5] + finish; design's PRESELECTED dots covered white;
  frozen slider cursor covered + track redrawn; wheel/slider cursors =
  black OUTLINE circles; result colour rect enlarged cover + 1px border
  (killed red artifacts); bottle photo → placeholder (owner will upload
  option images). RING-DETECTION METHOD: rasterize artboards, scan for
  8-point dark ring / light centre — use it for any future circle sync.
- NEW UI v5 — round 5 (owner's 5 answers + Safari fonts, 2026-09-05):
  SAFARI FONTS ROOT CAUSE: artboard SVGs were loaded via <img>, which
  isolates them from page fonts → boards are now INLINED
  (dangerouslySetInnerHTML) and Helvetica Neue World ships self-hosted
  as woff2 (public/newui/fonts/HNW-*.woff2) with @font-face aliases for
  the artboard family names (HelveticaNeueWorld-55Roman/-56It/-75Bold/
  -45Light + 'Helvetica Neue World'). Word counters moved fully INSIDE
  their boxes (box outlines no longer interrupted); back arrow shows on
  Your Vision too; thin progress line ends AT the last circle (1297.9);
  size frame = 1px line with 3px/33px-arm corner pluses at the DESIGN
  coordinates (814.43,172.29)-(1302.86,549.41) — frame and pluses grow
  together in one top-right-anchored animated wrapper; W/H row per
  design: bold 14 captions at x951.3/1076.81 baseline 601.47, values
  italic underlined with unit attached; options Select buttons match
  design truth = SOLID BLACK w/ white 12px Roman "Select", selecting
  INVERTS to white "Selected"; labels sized by natural image aspect
  (imgDims probe) — no squeezing; selection dots centred via
  translate(-50%,-50%) everywhere; slider cursor transparent inside;
  checkout back-label preview moved to summary SLOT 2 (452,268 patch,
  contain-fit); barcode/QR uploads show "✓ uploaded" feedback and are
  wired into the back label; assets hero + thumbs got corner pluses.
  PIXEL-DIFF AUDIT METHOD: rasterize artboard (sharp density 96,
  1440×823) vs Playwright screenshot, mask live zones, cluster diff px
  on a 16px grid — remaining 1-3%/page is librsvg-vs-Chromium text
  antialiasing + ref font fallback, i.e. noise, verified by exact
  row/column scans of the structural lines.
- NEW UI v6 — parallax slides + font/glitch root causes (owner 2026-09-05,
  "transitions stiff, bold too heavy, something glitches on slide-in"):
  (1) GLITCH ROOT CAUSE (caught on camera): every Illustrator artboard
  ships the same global class names (.st0…) and ids (clippath…) whose
  meanings differ per file — during a slide both boards were inline and
  fought (front's FRONT LABEL heading rendered WHITE via vision's .st3
  until the old page unmounted; clip-paths could cross-resolve).
  namespaceSvg() in page.tsx now prefixes classes AND ids per page at
  fetch. (2) SECOND GLITCH: overlays used to pop in 180ms AFTER the
  slide (baked E.g. texts visible mid-slide, then covered). Overlays now
  ride INSIDE every slide layer (renderOverlay(p, inSlide) — inert
  ghosts, entry animations suppressed); nothing appears after the slide.
  Front size-frame keeps its diagonal szGrow entry at settle (hidden
  while ghosted). TRAP HIT: naming the new param "ghost" shadowed the
  ghost BUTTON STYLE const → all transparent buttons went native-grey;
  renamed inSlide. (3) PARALLAX: each slide moves as three vertical
  bands (STRIP_DELAYS 0/45/90ms, same 520ms speed+easing, fill both) —
  top lands first. Per-page STRIP_BOUNDS (page-coord y) sit in each
  artboard's natural gaps so cuts never cross a text row or drawn box
  (front's 2nd cut = 472, the gap between Special mention and
  Sweetness — 483 sliced the Sweetness row, caught in a mid-flight
  screenshot). Strips carry board+overlay (white patches shear
  invisibly white-on-white). Loader keeps fades. setPrev timeout =
  SLIDE_MS+90+60. Small covers added for the baked corner-plus tips at
  x798 (past the szarea patch's left edge). (4) HEAVY BOLD ROOT CAUSE:
  aliased @font-face families (HelveticaNeueWorld-75Bold/-56It…) had NO
  weight/style descriptors → faces registered as regular-upright while
  the artboards request font-weight:700/font-style:italic → Safari
  paints SYNTHETIC bold over the already-bold file (Chrome matched
  fine: before/after 0-px diff). All faces now carry font-weight +
  font-style; 'Helvetica Neue World' fallback family gained 300/italic
  faces; html gets font-synthesis:none. Real HNW kept — no substitute
  font. Verified on prod build: mid-slide frames clean, rest-state
  pixel-identical, npm run build passes (engine untouched — no
  golden/parity re-run needed).
- NEW UI v7 — the 25-item precision round (owner 2026-09-06). DEV AID:
  /?page=bottle jumps to any page without generating. INPUT ROWS
  (front+backdetails, items 1/2/4/5/14): text-decoration underlines are
  GONE — each row is an input (transparent bg, italic, baseline-true via
  IN_BASE=15.5 for 15px/20px-line text — pixel-measured ±1px against the
  baked labels) over a FIXED-LENGTH 1px black rule (front x264.9 w564.1
  at baseline+2.5; back x989.6 w313.3); placeholders 50% grey (#808080),
  E.G.→E.g. Intro text replaced ("Feel free to leave out fields you
  don't want on your front label."). SIZE BOX (6-9): area top 240.6
  (Producer cap line) bottom 554.57 (Wine Type baseline); W/H row on
  Volume's baseline 615.23, only the NUMBERS underlined (borderBottom);
  frame is EDGE-ANCHORED (right/top fixed, width/height transition
  480ms cubic-bezier(.8,0,.2,1)) so the top-right plus never moves and
  corners glide; design diagonal (TR→BL) inside as a stretch-SVG with
  non-scaling stroke. LOADER (10): glass centred (top 309.5 → optical
  centre 411.5), "Designing your label" + three dots animating opacity
  (nuiDot 1.2s staggered). SELECT INVERTED (11/18): white/outlined →
  black "Selected" (options + new Select under backdesign's Edit,
  backSel state); forward arrow on options without a selection shows a
  red centred warning "Select a label design to continue" (3.2s). RING
  TRUTH (16/17/19/24 — the recurring off-centre dots): all baked rings
  are r=7.5 VECTOR paths whose centres the SVGs give exactly; the old
  pixel-detected coords were 2-6px off. Dots (dotBtn helper) now sit at
  path centres: bottle cx385.64/625.64/864.64 cy283.07+~29.5/row,
  finish 1104.64/1173.21; checkout cx144.64 cy=row baseline−4.93
  ([531.56,565.85,600,634.42,668.84], agree 706.9). Bottle's 4 baked
  preselect dots covered by 11px white circles inside the rings.
  COMPLIANCE (15/16): flags.png contained a RASTER copy of names (old
  font!) AND rings that covered the SVG's real HNW names and its
  perfectly-aligned vector rings (centres x282.87/536.4/788.92/1045.54,
  y351.3/403.1/455.7/508.3) — now only 26×20 per-flag background
  windows of flags.png are shown (row-centred on the ring lines), names
  + rings come from the SVG, Arabic's orphan ring+name covered.
  BACKDETAILS BUTTONS (13): create/upload toggles are real buttons
  (active=black / inactive=white outlined, Select-language); TRAP: the
  classic theme's global CSS uppercases <label> — textTransform:none
  required on any NEW UI label with visible text. BOTTLE (19-21):
  slider = the design's white→black gradient capsule rebuilt in CSS at
  (1253.57,359.19,15×136.64,r7.5) — covers the frozen baked cursor
  without erasing the gradient (the old white patch was the "erased
  part"); cursor maps shade over the cap-centre travel (366.69→488.33);
  wheel marker starts centred with rgb 255,255,255 → result box starts
  WHITE; red ⊘ on "No cap" is the design's own icon. CHECKOUT (22-25):
  slots 3/4 get placeholder content (Shot Face/Back at x696/799 w82,
  Context at x906 w176, y284 h150 — real assets pending owner images);
  baked "TOTAL SUM: $200" (ends x1015; button starts x1032) covered by
  patch(848,694,172,22) and the live total rendered on the design
  baseline 711.83; the LAST dashed pricing rule (y685.99) covered.
  All verified by ?page= screenshots on the prod build.
- NEW UI v8 — round 8 (owner 2026-09-06, ~17 items). ROW-PITCH ROOT
  CAUSE (the "rows are messed up" saga, items 2/15b): the artboard
  tspans step 30px (front) / 32px (back) — the librsvg raster that
  earlier rounds measured renders them at 30.33/33.1 (rasterizer
  quirk), but BROWSERS render the tspan values. All rows re-pitched
  (front base 251.27+i*30, back 247.11+i*32); size area bottom = Wine
  Type baseline 551.27; W/H row on Volume baseline 611.27. SAFARI
  BASELINE: IN_BASE is no longer hardcoded — computed at runtime from
  canvas fontBoundingBox metrics of 'italic 15px HNW' (each browser
  centres line boxes with ITS OWN ascent/descent; formula
  (L−(a+d))/2+a reproduces the hardcoded 15.5 in Chrome and adapts in
  Safari). Rules end at the window centre x720 (#3); inputs get 5px
  left padding (#16); placeholders 30% grey #B3B3B3 (#6). W/H inputs
  size to their digits (no empty underline tail, #4) in baseline-flex
  groups at design offsets (+46.4/+51.6). Vision page: THICK.vision =
  142.06 → no thick bar yet; it slides in on vision→front (#1).
  BACKDETAILS (#5): 4 mode buttons start WHITE; create → black;
  upload → black after a file is picked (barcodeMode/qrMode state).
  COMPLIANCE (#7): no default markets + red gate warning like options.
  CHECKOUT (#11-15): pricing block RE-RENDERED as HTML 20.5px higher —
  top dashed rule dropped, 4 repeating-linear-gradient dashed rules,
  bold-15 titles, right-aligned prices ending x1302.9, rings drawn
  (r7.5/2px) with dots, agree ring at y686 = the back arrow's line
  (baked agree ring was at 703.27, NOT baseline−4.93 — my 706.9 was
  the "still off" dot), TOTAL SUM + my own black 12px pay button on
  the same line; the whole baked block covered by patch(130,503,
  1180,240). Slot 2 back label centre-fitted in (452,275,227,160) —
  the old 256px-wide patch was what CUT the x685.7 dashed divider.
  Slots: real sizes replace ???x??? (front f.width×f.height, back
  width from backDims px→mm); slot 5 gets a [Landing Page]
  placeholder covering the baked webpage mock. Pack defaults on
  entering checkout: Barcode/QR checked unless that mode is 'upload';
  designer-edit always unchecked (#13). Bottle: baked slider-cursor
  ring stroke poked past the capsule — erased under it (#9). Crosses
  zIndex 5 everywhere + drawn over the assets shot boxes (#10). All
  buttons 12px (backdesign Edit was 15 bold, #8).
- NEW UI v9 — round 9 (owner 2026-09-06, 7 items). (1) Into the LOADER
  the old page now fully slides out FIRST, then the loader fades in
  (faded() gained a delay param = SLIDE_TOTAL; go()'s setPrev timeout
  extends by FADE_MS for next==='loader'; out of the loader stays
  fade-out + slide-in together). (2) Loader subtext (italic 13px):
  "Please stay on this page — preparing your labels usually takes
  15–35 seconds." (3) Width/Height: caption + number + mm now share
  ONE baseline-aligned flex line (captions were sitting high because
  span line-boxes and input line-boxes baseline differently).
  (4) Size box top = the Producer row's input RULE y253.77 (area h
  297.5 to Wine Type's baseline). (5) COMPLIANCE RING TRAP: the svg
  has TWO ring sets at each cell — hidden r=7.5 paths AND the visible
  r=9.06 st3 rings 1.6px lower (centres y 352.87+52i). Covers (d23)
  hide the baked rings and dotBtn draws the same rings the final-pack
  page uses ({ring:true, cover:23}). (6) PUNK GROUNDS FREED
  (dream/engine.ts, supersedes 2026-09-03 "charter Grounds stays
  active" FOR PUNK ONLY): STYLE_MOOD.punk lost "fearless colour /
  one painted world" background language, and the charter's "Grounds:"
  sentence is stripped from punk prompts at assembly (charter doc in
  Mongo untouched — re-analysis keeps working). Contrast law stays.
  (7) All animations slower: SLIDE_MS 650, STRIP_DELAYS 0/55/110,
  FADE_MS 420, size-box 600/780ms, buttons 240ms, loader wine 650ms.
- NEW UI v10 — round 10 (owner 2026-09-06, 4 items). (1) Width/Height
  block is right-anchored to the size box's right edge x1302.86 (one
  flex line, Height group marginLeft 24), same Volume baseline.
  (2) Create Barcode / Create QR toggle OFF on second click (mode "").
  (3) Compliance ring rows are IRREGULAR — exact big-ring centres
  352.87/404.68/457.29/509.89 (uniform +52 left a black sliver of the
  baked Japan ring under its cover). (4) BACK-LABEL GROUND FIX:
  groundOf() now takes the MEDIAN of 112 border-ring samples on a
  120px canvas — the old 5-corner AVERAGE went darker than the front
  label whenever artwork or downscale smearing touched a corner
  (owner: "back label bg darker most of the time"). Median is
  outlier-proof; needs a real generation run to eyeball.
- BOTTLE PHOTOS (owner uploads 2026-09-06): the owner's 6 line-art
  bottle images (WAIN/Bottle types, 800×1600 = the area's exact 1:2)
  live in public/newui/bottles/{bordeaux,bordeaux-prestige,burgundy,
  sparkling,alsace-rhine,ice-wine}.jpg; the BOTTLE page placeholder is
  replaced by an <img> keyed by bottle.type (240ms fade on change,
  object-fit cover at 137.1,172,205.7×411.4). Colour/closure variants
  don't change the photo yet — owner to supply if wanted.
- NEW UI v12 — round 12 (owner 2026-09-06, 3 items): backdesign Select
  button removed (backSel state gone); size-box frame div inset 16 not
  16.5 so the 1px inside-drawn border's centreline lands exactly on the
  pluses' 16.5 axis (left pluses looked off the line); bottle photo got
  its four corner pluses drawn ON TOP (the JPEG covered the baked ones).
- MARKETING ASSETS ENGINE (owner 2026-09-06) — next stage after UI
  approval. src/lib/marketing/engine.ts + POST /api/marketing-assets
  (NDJSON stream, in-memory cache by brief signature incl. label-pixel
  hashes): 2 STUDIO PRODUCT SHOTS (front + back, straight-on, whole
  bottle, TRANSPARENT-alpha cutout — verified live: corner alpha 0,
  composites cleanly on any ground) + 5 LIFESTYLE images (square).
  The customer's own label PNGs travel to the model as image inputs
  (sketch precedent — customer-owned art; board references still never
  do). Provider extended: GenerationJob.references[] / transparent /
  quality; openai.ts sends background=transparent + image[] inputs;
  generateImageRawWithRetry = retry WITHOUT finishArtwork (ink
  discipline would destroy photos). PROMPT PHYSICS: BOTTLE_SPECS
  (Bordeaux 30cm/7.6 anchor, Prestige 31.5, Burgundy 29.5, Sparkling
  32, Alsace 35, Ice Wine 32/5.5 slim), liquidLine() = wine colour ×
  glass colour matrix (red in olive glass → near-black with green
  glints; amber wine darkens lighter; etc.), closureLine() = closure
  type + picked closure colour (wheel shadeRgb) + matte/glossy ("No
  cap" = bare cork, no capsule), scaleLine() = exact label mm vs
  bottle cm with % of height (verified: label scale correct in live
  test). LIFESTYLE: 8 scenario deck (sommelier/pour/grapes/cellar/
  table/terrace/hand/crate), seeded deal of 5; STYLE_WORLD entourage
  per style (traditional classic / contemporary minimal / punk raw);
  optional per-style MARKETING CHARTER from the new admin Marketing
  tab (upload reference photos per style → Analyze → photo-world
  charter via vision; refs never reach the model; hand edits survive
  re-analysis) — /api/admin/marketing-refs + marketingRefs collection
  + data/marketing-refs/. SIZES: model caps at 1024×1536/1024²;
  IMAGE_QUALITY=prod additionally upscales shots so the bottle's
  ALPHA BBOX = 2500px tall and lifestyle to 2500² (sharp lanczos,
  free) — dev skips upscales and uses quality 'low'. WIZARD: entering
  Marketing Assets auto-generates (sig-cached; sequential ~2-4 min
  under the 5 img/min cap) with an italic progress note; placeholders
  fill in as each image lands; hero/thumb swap + gallery work on real
  images; checkout slots 3-4 show the real shots/hero. Bottle-type
  photo inset 2px so the baked dashed frame stays visible. COST per
  full customer pack (labels 3 + shots 2 + lifestyle 5 + free code
  back label): dev/low ≈ $0.15-0.20, prod/medium ≈ $0.55-0.65, high
  tier would be ≈ $2.20. Live test 2026-09-06: Bordeaux + olive glass
  + red saperavi + matte dark-red cork capsule — all physics honoured,
  label reproduced exactly, cutout clean.
