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
