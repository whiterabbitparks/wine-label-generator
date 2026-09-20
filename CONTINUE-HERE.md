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
- MARKETING ROUND 14 (owner 2026-09-06, 10 items): (1) compliance rows
  fully clickable (wide ghost button ring→name). (2) checkout slots
  3-4 rebuilt at the ORIGINAL design's geometry (source of truth:
  WAIN/NEW UI/New_UI_Check Out copy.svg — the app's checkout.svg had
  its mock rasters stripped; <image> transforms decoded): shots
  97.6×184.9@(688,266.3) + 96.9×185.4@(791.1,265.7); marketing =
  137.9px hero @(925.71,273.84) + FOUR 25.1px thumbs at
  x[925.71,963.75,1001.89,1040.03] y422.44. (3) assets titles covered
  and re-rendered as "Two Product Shots" / "Five Marketing Images"
  (baked block translate(138.16/548.57, 556.39), st8 bold 15).
  (4) BOTTLE SHAPE: the owner's line-art bottle JPGs ride as a SECOND
  image input on shots AND lifestyle ("technical outline — match the
  silhouette precisely, render photoreal") — verified live: Burgundy
  came back with true sloping shoulders, no line-art bleed. (5) NO
  FACES house rule in every lifestyle prompt + scenario rewrites
  (sommelier from shoulders down, pour = hands only). (6) assets
  status message moved to x994.3 on the titles' baseline 556.39 in
  the 12px subtitle style. (7) pay button padding 0 (was pushed up).
  (8) back label centred on the dashed band midline (y280 fit area).
  (9) checkout format lines are 12px on baseline 227.13 (design
  tspans: title y0 bold15, desc y+14.4 12px, format y+43.2 12px).
  (10) MINI LOADER GLASSES: during a run every waiting asset box
  shows a half-size loader glass; the actively-generating one fills
  over ~45s (nuiWineRise keyframes on the clip rect transform), and
  the arriving image fades in over it. TRAP: unique clipPath ids per
  glass (sanitized stage keys).
- MARKETING ROUND 15 (owner 2026-09-06, closing the day): (1) mini
  glasses shrunk to 15px wide with the viewBox CROPPED to the glass
  itself ('215 95 170 315') — the old full 595×609 viewBox carried
  huge whitespace below the glass, which is why it sat high in the
  boxes. (2) SCREW CAP BUG: the silhouette outline drawings show a
  corked top and were overriding the closure selection — closureLine
  now leads "CLOSURE — NON-NEGOTIABLE" with explicit "NO cork, NO
  capsule" clauses for non-cork closures, and both prompts tell the
  model the outline's drawn closure is irrelevant. Verified live:
  glossy black knurled screw cap, no cork. (3) pay-button text was
  2.5px low (HNW's tall ascent vs naive flex centring) —
  paddingBottom 5 measured in: ink centre now within 0.5px of the
  button centre.
- BRANCH POPIKA_Back_To_Vector (2026-09-18) — the strategic turn. After
  the MVP milestone the owner raised four concerns (label art quality and
  sameness, no editable file, diversity vs control, "rules define
  everything but the result isn't there"). Diagnosis agreed: rules living
  in PROMPTS are suggestions, not rules; type and layout must come back
  into code (as the back label already is), with AI painting artwork that
  is designed to receive the type. Agreed order: (4) evaluation set first,
  (3) blind model bake-off, (1) hybrid engine, (2) trait system.
  Owner's answers on record: editable = PDF with live type + placed image
  (the print-shop standard), NO in-app editor; Marketing Assets price
  stays $9; references are NOT to be re-curated until the baseline exists
  (one variable at a time); "subject" comes from the customer's story and
  is constant across variations — technique / palette / type / layout are
  what vary, with a MINIMUM-DISTANCE rule (no Times next to Times New
  Roman). Curation = ~20 VALUES per style across 5-6 axes, not 30 parts.
  FONT LICENSING flagged: live type in a delivered PDF means the font
  travels — commercial faces (Helvetica Neue World) may not permit it.
- BRANCH POPIKA_Artists (2026-09-20) — THE ARTISTS. Owner's idea: real
  artists submit their works + a short questionnaire, the owner
  approves, an "AI artist" is built from them, the wizard shows three
  artists' versions, artists earn a share per label. Live (2.28.48.43)
  stays on POPIKA_Back_To_Vector. Decisions: start with ONE artist, all
  three columns show her; no smart selection yet; share % undecided.
- ROUND 104 — EVALUATE MADE PLAIN (2026-09-20, owner: "slick and clean;
  just prompt, the picture, two marks — Visual and Story — a note, and
  the model's name"). EvalPanel rewritten: per brief ONE ROW of every
  picture in the run, each headed by its painter's NAME (the style tag
  shows only when one painter painted all columns; different painters =
  the name IS the column). Shows the ARTWORK (`<id>--art.png`, flagged
  `art` on GET), the composed label behind an Artwork/Label switch —
  layouts are not judged here for now. Marks: Visual (= `score`, the
  hand) and Story (= new `story`, is the brief's story in the picture);
  note; prompt on demand with the technical first line stripped. GONE
  from the UI: faults, "should resemble", reference board, sizes,
  timings, blind, run A/B letters (compare = a second titled row), the
  mode selector (hybrid only; "As the wizard" is the default painter).
  `label` stays in the type for later. Story test (Mariam) filed as run
  "story-test-mariam" with painters named FLUX + Mariam LoRA / Sketch
  (gpt-image) → FLUX + LoRA / Ideogram + 4 of her works — data only,
  the engine untouched; script data/experiments/story-test.ts.
- ROUND 103 — TWO RATING AXES (2026-09-20, owner: "if I give a 5 for
  the illustration, don't read it as a 5 for the layout or the ground").
  EvalRating gains `label` (1–5, the composer's: layout, type, ground);
  `score` now means the ILLUSTRATION (the painter's / artist's); faults
  still name what is wrong. EvalItem records `painter`. What acts on a
  mark automatically: only feedbackAggregates() — a `score` ≥ 4 boosts
  the dealt style card, ≤ 2 counts a rejection — and artist items carry
  NO card, so an artist's marks change nothing by themselves; they are
  read by Claude (and later by the payout/quality reports). Old runs:
  their single score reads as "overall".
- ROUND 102 — THREE ARTISTS (2026-09-20). Keta Dvali (22 works, oil +
  charcoal, earth tones, "human, flow, nature") and Tal Tamam (26 works,
  bold oil, "human, distortion, family") prepared and trained the same
  way (triggers KTDVL / TLTMM, 1000 steps, trained in parallel, ≈ 6
  min). Areeba's folder is NOT ready (owner still collecting). Painters
  map: traditional = artist:mariam-kvashilava, contemporary =
  artist:tal-tamam, punk = artist:keta-dvali. The wizard heads each
  column with the ARTIST'S NAME (paintHybridLabel returns painter +
  artist; /api/dream-label sends `artist`; Dream.artist). Eval model
  "wizard" paints each style with its own painter (painterFor per item)
  — run #30 "artists-three-audition": 18/18, three clearly different
  hands side by side; sheet copied to ARTISTS/AUDITION-three-artists.png.
  Honest read: Mariam's twin is the truest; Tal's LoRA reads as generic
  gouache illustration — 26 works of the same subject family (faces,
  buses) did not carry the distortion into new subjects; Keta's twin
  keeps her palette and brush but drifts toward monochrome charcoal on
  some briefs (two techniques in one training set). Real wizard run
  verified: three columns headed MARIAM KVASHILAVA / TAL TAMAM / KETA
  DVALI, 9 layouts in 21 s.
- ROUND 101 — MARIAM KVASHILAVA, THE PILOT (2026-09-20). Material: 47
  works (screenshots of her paintings) + a one-page PDF profile in
  NEW UI/Comments/ARTISTS/Mariam Kvashilava/. Prepared into data/
  artists/mariam-kvashilava/ (works/*.jpg at ≤1024 px, profile.json with
  her seven answers, profile.pdf) — data/ is git-ignored, so the folder
  lives on this Mac only (back it up; the live server has none of it).
  TRAINING: fal flux-lora-fast-training via scratch train-lora.mjs (zip →
  fal storage → queue → poll), 1000 steps, is_style, trigger MRMKV,
  ≈ 6 min, ≈ $2 → lora.json (weights URL on fal). ENGINE: src/lib/label/
  artists.ts (listArtists/readArtist/artistStyleLine); painter id
  "artist:<id>" resolved by evalModel() → { via fal, endpoint fal-ai/
  flux-lora, lora, artist }; the ask's STYLE line becomes the artist's
  own answers and the house sub-style guidance is dropped; free-painter
  path (vignette ask, vignette fit); FLUX body = trigger + ask, 28 steps,
  guidance 3.5, lora scale 1.0. Painters dropdown and Evaluate list
  artists automatically once lora.json exists; painterFor accepts
  "artist:" ids. AUDITION run "artist-mariam-audition" (#29): 18/18,
  10–17 s each, ≈ $0.035 each — unmistakably her hand (fluid blue
  washes, open forms, the dream mood) across all six briefs; the
  vignette composition holds (drawing whole on its own pale ground,
  type below). Painters map (shared Mongo) is now artist:mariam for all
  three styles — on the LIVE server that id resolves to null (no data/
  artists there) and paintHybridLabel falls back to gpt-image-own.
  NEXT: owner + Mariam rate #29; then the /artists intake form, the
  admin Artists tab (approve → train → audition), artistId on labels,
  the payout report; LoRA scale/steps to tune from the ratings.
- ROUND 100 — THE VIGNETTE (2026-09-20, owner: "the illustration is cut
  in half by the background in #26; in #25 the text sits on the picture
  — I love Ideogram's look, find a way, it shouldn't be this hard").
  Two dead ends first: #27 "finished" (Ideogram inpainting the strip's
  foot into a quiet ground) wrote our own instructions INTO the picture
  as lettering on 4/12 — discarded, code removed. THE ANSWER is the one
  composition every painter knows: a SPOT ILLUSTRATION — "one self-
  contained drawing, isolated on a completely flat single-colour
  background, generous empty margin, the edges finish naturally". The
  composer's `fit: "vignette"` (palette.ts vignetteOf: ground = the 6 %
  border ring's mode colour; box = bounding box of everything that
  differs from it, ≥ 0.8 % of a row/column, 3 % pad) trims the air and
  places the drawing, whole, centred in the top area above the type, on
  the label filled with that same colour — no seam, no cut, no fade,
  nothing over the picture. Run #28 "ideogram-vignette": 6 painted, all
  six right (the cyan Saperavi, the black Rkatsiteli, the Chinuri
  bubbles, the grey Racha). The other 6 FAILED: fal.ai "User is locked.
  Reason: TOP_UP" — THE FAL BALANCE IS EMPTY (owner asked to be told).
  SAFETY: paintHybridLabel falls back to gpt-image-own when a fal
  painter throws (logged), so the site keeps painting while the balance
  is empty. Free painters = vignette in wizard and eval alike.
- ROUND 99 — NOTHING IS EVER CUT (2026-09-20, owner: "NO — the background
  is cutting the illustration"). The measured-foot band (#24) still cut
  paintings; type-on-the-painting (#25) was unreadable. THE FIX is at
  painting time: a free painter (Ideogram / nano-banana) is asked for
  the PICTURE ONLY, composed for its space — `wholeFrame` ask ("fills
  this whole frame edge to edge; the name is set BELOW the picture,
  outside this frame"), painted at landscape_16_9 (landscape / square
  labels) or landscape_4_3 (portrait labels). The composer's `fit:
  "top"` sets that strip whole into the top 60 % (62 % portrait) with
  xMidYMid slice (a hair of side crop at most), and the band below takes
  the painting's own bottom-edge colour (sliceColourOf 0.9–1.0) — hard
  edge, nothing over the picture, nothing shrunk. Ink: paper-white when
  the band's luminance < 0.6, else dark. Run #26 "ideogram-top": 12/12
  — pictures whole, bands reading as part of the print (black under
  the blue Saperavi, olive under the Château, taupe under the Chinuri).
  The crop modes (#22–#25) remain in code for stored labels only.
- ROUND 98 — THE FOOT IS MEASURED; THE ADMIN SIMPLIFIED (2026-09-20).
  (#1) options placeholders moved to where the labels sit (OPT_TOP 290,
  OPT_BOT 540). (#3, owner: "the fade is terrible; adding a background
  after obviously is not working") crop mode no longer fades: palette.ts
  zoneStatsOf() measures the painting's foot (luminance spread); spread
  < 0.11 → the type is set straight on the painting, nothing added;
  otherwise a flat band in the foot's own colour with a HARD edge. Run
  #24 "ideogram-foot" (funky + traditional): 12/12, one quiet foot, the
  rest hard bands — several read seamless because the band IS the
  painting's colour. The honest alternative the owner raised ("ask for
  the label-size image with ink only in certain areas") IS the mask —
  it works with gpt-image (masked/own-ground) and Ideogram's edit
  endpoint disappointed (#17–#21); for the free painters the measured
  band is the reliable path. (#2) the admin, again: Image Play and Art
  Direction removed (their providers were the old engine's — FLUX etc.);
  Evaluate lists only WIZARD_PAINTERS and runs hybrid only (mode select
  gone); ONE rating language — feedbackAggregates() now also reads the
  eval ratings: a 4–5 boosts the style card the item was dealt, a 1–2
  counts a rejected attempt (what Image Play's thumbs did); System shows
  RECENT LABELS from data/labels (/api/admin/labels, ?id= serves the PNG)
  instead of the old generation log. Bug-fix pass clean.
- ROUND 97 — THE ADMIN REORGANISED (2026-09-19, owner's answers: keep the
  ratings and fold /eval into the admin without duplicated functions;
  delete the old-engine parts if they have no effect; build it in the
  site's style). /admin now = four tabs — PAINTERS & RULES (PaintersCard,
  RegionsCard, marketing rules, illustration rules) · REFERENCES
  (IllustrationTextsCard + StylesTab; MarketingRefsCard) · EVALUATE
  (EvalPanel = the old /eval page as a component, ratings intact on disk;
  ArtNotesCard = the dream_feedback notes that artworkGuidance quotes,
  list/add/delete; PlaygroundTab + ArtDirectionTab as "Image Play") ·
  SYSTEM (GenerationsTab, UsersTab). ?tab= rides the URL; /eval forwards
  to /admin?tab=Evaluate. Style: the shared `S` in LegacyAdmin.tsx is
  now the site's language (white, HNW, black hairlines, black buttons,
  underline tabs; greens → black) and every legacy card inherits it.
  DELETED (no effect on the hybrid engine): Dream Studio (DreamRefsCard +
  StudioCore), DreamRulesCard, the frozen hard-rules card, /legacy,
  /dream, /api/admin/dream, /api/admin/dream-rules, /api/admin/dream-refs;
  the duplicate "Verified image rules" inside Image Play (the Rules tab
  holds the one copy — same store /api/admin/image-rules). KEPT because
  the live path reads them: styleProfiles (References), Image Play
  feedback (weights the style cards), dream_feedback notes, regions,
  painters, marketing charters/scenes/rules. Honest note: the
  illustration rules steer Image Play only — the wizard's ask carries its
  own style lines (wiring them in would be a functional change; not
  done). BUG-FIX PASS: every tab opened in Playwright — no console
  errors, no failed requests (only the deleted pages 404, as intended).
  STILL NOT BUILT: "download → correct in Illustrator → upload → diff".
- ROUND 96 — THE FREE PAINTERS JOIN (2026-09-19, owner: "the painters I
  gave 5s to — we must have them, absolutely"). Finding: every 5 the owner
  gave Ideogram / nano-banana was in ARTWORK mode (the free painting, no
  canvas: nano-banana/traditional 4.17, nano-banana/punk 4.00, ideogram/
  punk 3.75); the same painters on our canvas (#17–#21) scored ≤ 2.7. So
  a free painter now gets EXACTLY the bake-off ask (buildArtworkPrompt
  without ownGround/softGround) and the composer's new CROP mode
  (compose.ts `fit: "crop"`): the painting stays whole (cover-fit, no
  yield), the band is drawn OVER its foot at 60 % (62 % portrait) in the
  colour of the rows just above the cut (palette.ts sliceColourOf) with
  a 5 % gradient seam; the type takes ink/paper-white by that ground.
  Stored labels remember `fit` so the three layouts and later
  variations keep the crop. WIZARD_PAINTERS gained ideogram-3 and
  nano-banana ("free painting, cropped"). Runs #22 ideogram-crop and #23
  nano-crop (traditional + punk): 24/24, the look of the bake-off kept,
  bands seamless. PAINTERS SET (settings "painters", local and live share
  the Mongo): traditional = nano-banana, contemporary = gpt-image-own,
  punk/Funky = ideogram-3 — the owner changes it in /admin → Rules →
  Painters. COSTS (fal.ai list): Ideogram v3 BALANCED $0.06/image
  (+ ≈ $0.005 no-text gate), nano-banana $0.039; gpt-image low ≈ $0.02.
  A pack ≈ $0.20 (gpt) → $0.26 (nano) → $0.34 (ideogram). Known: fal
  painters ignore the gazetteer more (Svaneti towers on Racha again).
  NOT BUILT: "download → correct in Illustrator → upload → diff" (owner
  asked where it is; to be part of the admin reorganisation). ADMIN
  REORG proposed (one rating language 1–5 + faults + comment; tabs
  Painters & Rules / References / Evaluate / System; site-style chrome);
  three questions put to the owner (fold /eval into admin or delete;
  delete or archive the old-engine parts; restyle or only tidy).
- ROUND 95 — FIVE SMALL ONES (2026-09-19). (#1) the vision page's two
  sentences are one flowing paragraph (no <br>). (#2) under "Feel free to
  leave out fields…": "Type each field exactly as it should print:
  capitals, spelling and language stay as you enter them." (GE in i18n).
  (#3) the Georgian walkthrough card body is ONE wrapping paragraph
  (9.5 px / 14.4 leading) so the last word drops to its own line. (#4)
  the confirm modal's column titles 18 px (GE 15). (#5) the back product
  shot carried the FRONT label (the owner's back label was near-empty
  and the front shot rides along as a scale reference): buildShotPrompt
  side "back" now leads with "THIS IS THE BACK … the label is the FIRST
  image, a plain text-only label, even if nearly empty; the front label's
  artwork must NOT appear" and the reference-photo clause says its label
  is never copied. Not yet seen in a paid run.
- ROUND 94 — THE OWNER'S FIFTEEN + THE SAVE TOGGLE (2026-09-19). (#2)
  The parallax slice cascade is BACK (round 93's single-sheet change
  reverted) — the "old page reappears" glitch was the confirm popup on a
  still-present page. New PageKey "blank": openConfirm(kind, from) slides
  the page out to blank BEFORE the popup opens (no history entry, the bar
  keeps the from-page's stop via blankFrom), Create fades the loader in
  from blank, Edit / ✕ / backdrop slide the page back in (go(from, -1));
  a failed credit gate never leaves blank behind. The assets confirm
  stays on the assets page (its effect lives there). (#3/#4/#5/#6) The
  options page after Front_Label_UI.jpg: TRADITIONAL / CONTEMPORARY /
  FUNKY over each column with a dashed rule (y 221 / 242), the label
  with crosses (AREA 290–540), three dots (36 px apart, y 584), Save at
  637; no subtitle, no variation buttons. Every painting arrives with
  THREE layouts in ONE call (/api/dream-label `variants: 3` →
  `variants[]`): relayoutLabel(stored, data, avoid, recipe) re-draws the
  seed until the hero FACE (and size bucket) differ from every earlier
  layout; variant 2 = `big` (largest hero buckets), variant 3 = `flip`
  (the other alignment — compose.ts `align`). Proven: Caveat-left /
  Bebas-left / Anton-centred on one painting. "Punk" reads FUNKY
  (STYLE_NAMES + i18n "Funky"; the internal key stays "punk"). SAVE
  TOGGLES (owner mid-round): a second press un-saves and the film plays
  in REVERSE (nuiFlyBack, folder → page; flyToFolder(items, back)); the
  back label and the assets Save do the same; the gallery's Save flips
  too. (#12/#15) the folder mark: no thumbnails, hover scale 1.08,
  zIndex 55, click verified with a real mouse click → Final Pack. (#13)
  README icon traced from the owner's drawing (sheet, foot curling into
  a band that runs out right). (#14) credits page: T&C row back (ring +
  "I agree to the" + underlined "Terms & Conditions"), the gate message
  centred ABOVE the list; the root gate message moved to y 700 (it
  overlapped the options Save). WALKTHROUGH: (#1) the pointer taps ON
  Save (optSelect 720, 654); (#7) step 3 presses the back label's Save
  and it flies (TAP.bdSave); (#8) Georgian card titles 11 px, body 9 px;
  (#9) cursor without the drop-shadow filter (artefacts); (#10) loaders
  ≈1 s (two steps of 320 ms; assets 600/500/340×5/600); (#11) TUT_PACE
  1.2, 900 ms after the front save, 1.4 s before the self-press —
  71 s end to end. The dev "fake generation" switch fakes three layouts.
- ROUND 93 — THE OWNER'S TWENTY-ONE (2026-09-19). MARKETING: (#1) the
  cork under a capsule is HIDDEN — the old "through the glass, a 45 mm
  cylinder" clause made the model draw a cork sunk in the neck; the bare
  cork keeps "seated at the lip, nothing drawn below". (#2) grapes ONLY
  when the variety is known (grapeLine(colour, grape): no variety → "NO
  grapes anywhere"; known → exactly that variety, rosé = red-skinned);
  dealScenarios(…, noGrapes) drops the grape scenes; the wizard sends
  f.grape; the two marketing payloads lost their last DEMO_FRONT
  fallbacks (they would have sent "KORRA"/"White"). UI: (#4) page
  transitions are ONE sheet out then ONE sheet in (sliceDefs → a single
  slice; the arriving sheet waits SLIDE_MS; go() settles at 2×SLIDE_MS)
  — the slice cascade of round 16 is retired. (#12/#14) the bottle
  page's ring (18 px, 2 px stroke, 7.5 px dot) is THE ring: market menu
  (in a box that can't clip it), Final Pack rows and T&C (dotBtn ring:
  true r: 9 cover: 24 over the baked rings), credits. (#5) the credits
  page is drawn live at the page centre — no frame, no carousel, no
  T&C. (#6) "Total:" and the amount at 30 px bold, same edges, the
  total 24 px lower (bigTotal). (#7) the progress line ends at the last
  station on the Final Pack. (#8) EMPTY-DETAILS warning: all front
  fields empty → modal "All fields are empty" (Edit details / Continue
  anyway) before the confirm; same for the back details before the
  compliance step. (#11) the folder mark is a BUTTON to the Final Pack;
  rows and tree branches for things not yet made read pale (madeRow).
  (#15/#16) GALLERY: clicking a label (options), the back label, a shot
  or a marketing image opens it big with ‹ › ✕ and a Save inside; the
  thumb-for-hero swap is retired. (#17) stacked buttons sit one button-
  height apart (Save at 633.6 on options, 657.6 on back label; the
  assets Save at 657.6, right-aligned to the dashed area — #3). (#18)
  "Upload Another Label" inside the bottle frame, under the bottle.
  (#19) the folder mark rides above modal veils (zIndex 50). (#20) saved
  things peek out of the folder as a little deck (savedThumbs()). (#21)
  README icon redrawn after the owner's drawing. WALKTHROUGH: (#9)
  Georgian cards use 18/19/12.5/10 px; (#10) demo shots re-exported
  with their transparent air so the 130 % zoom matches real shots;
  (#13) "არ მჭირდება".
- ROUND 92 — SHOTS AT 130 % (2026-09-19). The assets page's two product
  shots draw at 130 % (SHOT_ZOOM, a transform on the img; the slot box
  stays) inside a clip the width of their column, so a wide picture can
  never cross the dashed rules; the Save film starts from the zoomed
  box. Reason: the shot PNGs carry transparent air around the bottle, so
  the bottle read small. Live. NOTE for the fake-generation dev switch:
  the stand-in label image is landscape and gets clipped by the column —
  expected; real shots are tall and transparent.
- ROUND 91 — "THE BACKGROUNDS ARE RUINED" (2026-09-19). The owner rated
  the canvas-painter runs (#17 1.94, #18 2.35, #19 2.75, #20 2.17 — vs
  #15 gpt-image own-ground 3.50) and saw "small illustrations locked in
  weird bright colours": the CANVAS painters were handed the bold punk
  GROUNDS list as their paper and a 4 %-framed mask window. The WIZARD
  never changed (painterFor() default = gpt-image-own, settings
  "painters" unset) — it has been at the #15 state throughout. Fix for
  canvas painters: groundFor(style, seed, soft) → paper/pale tones for
  every style, the window edge to edge (marginFrac 0), nano-banana told
  "edge to edge, never a smaller picture inside". Run #21 "ideogram-
  soft": grounds calm, several pictures bleed — but Ideogram still draws
  a bordered plate INSIDE the window on about half (its habit, not our
  canvas). Standing recommendation: wizard stays on gpt-image-own;
  Ideogram / nano-banana remain selectable in /admin → Painters as
  options, no further spend on them unless the owner asks.
- ROUND 90 — THE OTHER PAINTERS JOIN (2026-09-19, owner: "why aren't we
  using the models we praised? plug them in"). The hybrid engine can take
  any painter that leaves the type zone alone, so two fal painters now
  paint ON OUR CANVAS: `ideogram-3-edit` (fal-ai/ideogram/v3/edit — our
  paper as image_url, a WHITE-window-on-black mask as mask_url; both
  accept data URIs) and `nano-banana-edit` (fal-ai/nano-banana/edit —
  the paper as image_urls[0], the band by instruction only; no mask on
  that endpoint). EvalModel.canvas marks them; the eval gives fal
  painters without a canvas the way-1 ask. Runs: #17 Ideogram-on-canvas
  18/18 — clean bands everywhere, often striking (Tsolikouri's river
  vista, the colour-block Chinuri, the purple stag), BUT lettering on
  5/18 (gibberish paragraphs, "RACHA GEORGIA", "KARTLI"), a framed
  border once, Svaneti towers on Racha again → the no-text law now leads
  the ask and rides as negative_prompt (accepted by the endpoint; rerun
  = "hybrid-ideogram-canvas-notext"). #18 nano-banana-on-canvas 18/18 —
  keeps the band by instruction alone; traditional excellent; on bold
  punk grounds it paints a picture-in-picture (a cream plate with a
  seam) on 5/6, contemporary subtly so. WIRING: src/lib/label/
  painters.ts (WIZARD_PAINTERS, DEFAULT_PAINTERS, painterFor(style) from
  settings "painters"), /api/admin/painters, PaintersCard in /admin →
  Rules (one select per style); hybrid.ts asks painterFor(style) and
  gives canvas painters a paper tone (ownGround only for gpt-image-own).
  Default stays gpt-image-own until the owner chooses. THE NO-TEXT GATE
  (90b): the no-text law + negative_prompt cut Ideogram's lettering only
  to 3/18 (#19), so generateArtworkChecked() now LOOKS at every fal
  painter's picture (verifyImage + NO_TEXT_RULE, gpt-4o-mini) and
  repaints once if text is seen — run #20 "ideogram-canvas-gated": 18/18,
  8 repainted, ZERO visible lettering; arguably the strongest sheet so
  far (Tsolikouri's engraving, the Chinuri colour dunes, the Racha
  sunrise). Remaining Ideogram trait: it fills the mask window edge to
  edge, so a hard "plate" rectangle shows on some (a look, not a bug).
  Blind order after the smoke runs were removed: #16 ideogram (way 1),
  #17 ideogram-canvas, #18 nano-canvas, #19 ideogram-notext, #20
  ideogram-gated. Walkthrough (#1):
  tap(…, onTap) marks the selection the instant the ring blooms (bottle
  rings, markets, QR, Save) — the mark used to come a beat later.
- ROUND 89 — NIGHT NOTES (2026-09-19, owner asleep). (#1) the walkthrough
  no longer plays the variation re-roll (round 73 #7 retired): on the
  options page the pointer goes straight to Save on column 2 and the
  label FLIES into the folder mark. The film had not played before
  because the demo called saveFront() from a closure made before the
  demo labels existed (its `dreams` was []); the step now sets the
  selection and calls flyToFolder() directly with the sample's box
  (548.5, 240, 342.9 × 228.6). Verified with a poll for the flying <img>
  at 25.7 s. (#2) the "cut-off" red button on the Final Pack: measured in
  Chromium on welcome / vision / options / checkout — 43.2 × 43.2 CSS px
  (= 54 design px, 20 % under the old 68) on EVERY page, the button's
  parent has overflow visible, and the checkout crop shows a whole
  circle; not reproduced — ask the owner for a screenshot + browser
  (Safari suspected; a WebKit run was attempted). IDEOGRAM AS HYBRID
  PAINTER (owner asked why his favourite isn't used): run "hybrid-
  ideogram" (#16 in blind order; punk + contemporary; the eval now gives
  every fal painter the way-1 ask). Verdict: Ideogram ignores the
  reserved zone and the flat ground (10/12 "NOT flat"; coverage 16–58 %),
  so the composer shrinks the picture to 53–65 % and grows the band —
  the result is a "plate on a dark ground" poster look: some are strong
  (Saperavi punk, Rkatsiteli punk, Château punk, the teal contemporary
  Saperavi), others show a seam (a beige plate floating on a taupe
  ground). It would need its own layout scheme (picture kept whole on a
  ground taken from its edge) — a candidate for the punk "mask shape =
  layout" work, not for the wizard today. The wizard uses ONLY gpt-image.
- ROUND 88 — SAVE FILMS + THE LIVE TREE (2026-09-19). (#6/#7/#10) a
  "Save" flies the image into the header's folder mark: flyToFolder()
  clones it as an absolutely placed <img> with CSS vars --dx/--dy/--s and
  the nuiFly keyframes (a slight lift and tilt first, then the glide,
  1150 ms, cubic-bezier(.5,.02,.18,1)); several images go 150 ms apart
  and the mark bumps (nuiFolderBump) as the last lands. (#9) the options
  page: "Select" ring → black SAVE button under the variations (white
  "Saved" once chosen; saveFront()), gate text "Save a label design to
  continue", dots in up to TWO rows of 15 (DOTS_PER_ROW; MAX_VARS 29;
  the variations button greys when full). (#7) back label: Save under
  Edit (backSaved, reset when backPng changes). (#10) assets: Save under
  the dashed area's left corner (assetsSaved, reset on assetsSig); shots,
  hero and thumbs fly in sequence. (#8) back label frame 10 px off, like
  the front. (#1) the Final Pack tree is LIVE: the baked tree is wiped
  (patch 760,92,600,450) and redrawn — caption, trunk (nuiGrowY), bar
  from the trunk to the left-most branch (nuiGrowXR), branches, icons
  (the header's own folder path; a drawn doc for READ ME), names,
  arrows, then the files line by line (nuiFadeUp) — with the REAL ZIP
  names under the wine (Wine_Name until typed): Instructions.pdf,
  Terms&Conditions.pdf, the page link; _Bottle_Front/Back.png,
  _Image01–05.png; _Front_Label.pdf/.svg, Links/_Front_Artwork.png,
  Fonts/, _Back_Label.svg. Branches follow packSel; replays on each visit
  (treeN). WALKTHROUGH: (#2) pét-nat description; (#3) every pause ×1.45
  (TUT_PACE) and 1.9 s before the self-press — 71 s → 109 s; (#4) the
  Sparkling bottle's closures are "Sparkling Cork"/"Crown Cap", so the
  demo closure is "Sparkling Cork" (was "Cork" → empty ring); (#5) the
  assets step opens already loading (seed() at tut 5) — no grey boxes;
  the save film plays on the demo's Save too.
- ROUND 87 — LIVE (2026-09-19, owner "fix those and ship"). The back
  label's TEMP demo placeholders (2026-09-07) are OFF: an empty field
  prints nothing, its title goes with it, the template's rules stay;
  numeric minimums (12.5 % / 750 ml / 81 kcal) remain for the regulatory
  maths. Form inputs (front + back details, barcode) sit 2 px higher so
  typed text no longer rides its rule line. The red round button is 20 %
  smaller everywhere (NEXT_R 34 → 27, icons scaled) and on the Final Pack
  it double-pulses (nuiNudge) when it becomes the card and again when it
  becomes the download. DEPLOYED to 2.28.48.43 from this branch (rsync
  --exclude data; label fonts installed to /usr/local/share/fonts/
  8k-labels + fc-cache; npm ci; build; restart). COSTS (owner asked): the
  wizard calls only OpenAI's image model (key in .env.local, pay-as-you-go
  on platform.openai.com — no subscription); FAL was used only on /eval.
  One pack = 3 front paintings + 2 product shots + 5 lifestyle = 10
  images; variations are free (re-layout in code). At IMAGE_QUALITY=dev
  ("low") that is roughly $0.15–0.20 per pack at list prices; "medium"
  ~ $0.6, "high" ~ $2.5. Verify on the OpenAI usage page.
- ROUND 86 — VARIATIONS WITHOUT GENERATIONS + THE KORRA WALKTHROUGH
  (2026-09-19). (#3, owner's idea) a Variation now KEEPS the column's
  painting and re-sets the type with a fresh seed — relayoutLabel() in
  hybrid.ts, `relayout: <id>` on /api/dream-label, ~1 s, no model call,
  NO credit (round 56 #7's gate lifted for variations; the button reads
  "Punk Variation", no "(1 Credit)"). New faces, hero size, wine-ink role
  and air each time; same picture, same ground. (#1) the "Check your
  details" modal lists only filled rows — no placeholders (reverses round
  67). (#2) glasses fill faster: loader 4 %/s for 10 s then 1.5 %/s to
  0.72; asset glasses 8 %/1.5 s active, 5 %/3 s waiting; the variation
  slot's glass runs on a 6 s clock. (#4) small thumbs: the glass+dots
  group rides 10 px higher, dots 2 px under the glass. (#5) Sparkling
  bottle + cork: bottleDescription() adds a SPARKLING TOP clause — a
  mushroom cork with cage (bare or under the hood), 3 cm above the lip,
  "the outline stops at the glass lip", total height +3 cm — because the
  shot traced the outline drawing, which ends at the lip. Not yet seen in
  a paid run. DEMO LEAK: the product page (/api/product payload, page.tsx
  fx2) still fell back to the Château Margaux demo values for empty
  fields — KORRA's page showed "Margaux AOC / Grand Cru Classé / Bordeaux,
  France / Vieilles Vignes"; gone, as is the demo country in the back-
  label payload. The back-label COMPOSER's own TEMP placeholders (owner
  2026-09-07, "switch off before launch") remain — that's why KORRA's back
  label says "Popiashvili Cellars". WALKTHROUGH = KORRA: public/newui/
  demo/* rebuilt from the owner's pack (labels 1-3 = traditional /
  contemporary / punk-yellow, label3b = the blue punk re-layout, back
  label from its SVG, shots and five images from the ZIP, landing = a
  screenshot of /p/tb1yg0j6); DEMO_FRONT/VISION/DESC/BACK/BOTTLE are
  KORRA's (white pet-nat, Rkatsiteli 2023, Giorgi's Marani; clear
  Sparkling bottle, cork, black matte hood — DEMO_SHADE 0.97); the
  variation plays on the PUNK column (TAP.varBtn/dot0/dot1 moved to
  x≈1131). Verified unattended: STEP 1→6→card in 71 s.
- ROUND 85 — THE OWNER'S TWELVE (2026-09-19, after the first hybrid ZIP;
  #1 withdrawn by the owner). UI: (#3) the Final Pack's baked "Proceed to
  payment" and "Download" bars are wiped; the red round button IS the
  payment (owner's card icon, Red_Buttons_Pay&Download.svg) and, once
  paid, the download tray — gensMode pays for credits the same way.
  (#2) every ring+dot is now ONE SVG with both circles on the same centre
  (ringSvg / dotBtn / variation dots / market ring) — CSS boxes centred
  by translate rounded to the grid separately and the dot drifted.
  (#6/#7) the selection frame stands 10 px OFF the label with the crosses
  on its corners (owner's board); dashedBox, dashBox and every dashed
  rule are SVG hairlines on the half-pixel with crispEdges — the CSS
  gradients doubled/thinned at fractional scales. (#4) the walkthrough
  advances by itself: 1.6 s after a step plays, the button presses itself
  (nuiPress, one scale) and the next step starts; only the closing card
  waits and only there the double nudge plays. Verified: STEP 1→6→card in
  75 s unattended. (#5) no "Packing…" line. ENGINE: (#8) the SVG root is
  width/height in MM (viewBox keeps the 12 px/mm grid) — Illustrator
  opens 110 × 80 at 110 × 80; the 7 pt floor now binds the OPENING sizes
  too (small labels opened at 5 pt); and since six lines at 7 pt don't
  fit 34 % of 80 mm, the band grows to what the stack needs at its floors
  and the ART yields (80 % on Château Margaux) — dropping a line is the
  last resort, after the hard floors. (#9) hero opens at 11–15 % of H
  (8–11 % portrait), dealt by seed. (#10) traditional on a light ground:
  7 labels in 10 set ONE role (hero / secondary / small, dealt) in the
  wine's colour — reds for red, greens for white, earth for amber, blush
  for rosé (WINE_INKS in compose.ts). (#11) the painter's ask carries a
  PALETTE line by wine colour (wineMood in models.ts) so a white wine
  never gets a blood-red ground. PACKAGE (#12): TIFF gone; the front label
  ships as PDF (live type, page in mm, artwork embedded and cropped as
  shown, fonts embedded whole), SVG with the artwork LINKED from
  Links/<wine>_Front_Artwork.png, and Fonts/. An .ai is a PDF with Adobe
  private data — the PDF opens in Illustrator as editable type, so no .ai
  is written. PDF LESSON (proven on all 61 faces): pdf-lib's fontkit
  threw "beyond buffer length" on 15 originals embedded whole, and its
  subsetter silently dropped glyphs from EB Garamond — so public/fonts/
  labels-pdf/ holds fontTools-cleaned copies (all glyphs, DSIG/meta/hdmx/
  GPOS/GSUB/GDEF dropped, no hinting) and pdf.ts embeds those, whole.
  Rebuild command in pdf.ts. DEPLOY NOTE: the live server needs
  public/fonts/labels installed for librsvg (→ /usr/local/share/fonts +
  fc-cache); the PDF needs nothing extra.
- ROUND 84 — THE WIZARD ON THE HYBRID ENGINE (owner "let's build the
  web-page", 2026-09-19). /api/dream-label now runs src/lib/label/
  hybrid.ts::paintHybridLabel — buildArtworkPrompt(ownGround) →
  gpt-image-own (traditional: paper tone + mask; contemporary/punk: the
  painter's own ground by kind) → flatGroundOf → composeLabel. No text is
  painted, so the proofread/strict-redream machinery is gone from this
  path. The result carries an `id`: the SVG (live type, artwork embedded),
  PNG, art and prompt live under data/labels/<id>/ (store.ts); the page
  keeps only the id on the Dream. /api/package takes `frontId` and adds
  `<wine>_Front_Label.svg` + `Fonts/<the TTFs the SVG sets>` beside the
  TIFF (fontFilesOf reads font-family/weight/style off the SVG). The
  customer's sketch rides as an image input (references[] after the
  masked canvas; reference when unmasked). buildDreamPayload sends the
  label's real mm; nextFromFront's duplicate payload builder — which STILL
  carried the Château Margaux demo fallback round 78 removed elsewhere —
  is gone. Verified: API smoke (punk landscape, traditional portrait with
  a sketch), the ZIP (TIFF + SVG + 3 TTFs), and a Playwright drive of the
  real wizard on :3200 (walkthrough → vision → Create → three hybrid
  labels in 13 s at dev quality, credits 5→2). Variations go through the
  same path. NOT yet: PDF with live type (next), fonts on the live server
  (public/fonts/labels → /usr/local/share/fonts + fc-cache) before deploy,
  the eval "download → correct → upload" diff.
- ROUND 83 — WAY 1: THE PAINTER CHOOSES THE GROUND (owner 2026-09-19:
  "a list of colours limits variety; every illustration has its own
  background colour — read it off the picture and the ground will be
  organic"). The mask can't coexist with a painter-chosen ground (we hand
  the canvas), so for contemporary + punk the painter goes UNMASKED with
  the reserved-zone ask + "ONE flat solid colour, edge to edge, into the
  type zone", and flatGroundOf() (palette.ts) reads the colour off the
  bottom fifth (mode colour, coverage, `flat` when ≥55% / last rows ≥80%);
  the composer draws the band in it. Traditional keeps paper tones + the
  mask (owner: monochrome on warm paper is right there). Painter id
  `gpt-image-own`; `styles: [...]` narrows a run. Findings: pass 1 (#14):
  18/18, every ground 100% flat, the seam/"frame" gone — but freed, gpt-
  image drifted back to cream (punk 4/6, contemporary 5/6) and one punk
  became a traditional drawing: the dark canvas had been carrying the
  punk-ness. Pass 2 (#15, punk + contemporary): the painter is told the
  KIND of ground per style (OWN_GROUND_KIND: punk bold/saturated never
  paper; contemporary paper-white or one quiet tint), still no list →
  punk red/blue/orange/blue/red/blue with two-ink art that belongs to the
  ground (the best punk set so far); contemporary warm papers + one pale
  pink Racha whose art and ground are one. Detector proven on old runs
  too: masked pictures read back within ~5 units of the given colour;
  Ideogram fills the band (not flat) — for such painters the ink-foot
  rule carries. Ground policy going into the wizard: traditional = paper
  pool + mask; contemporary/punk = own ground by kind, read off the art.
  Open: Caveat as a punk hero is weak (move to secondary); punk colours
  cluster on blue/red — the trait system can steer later.
- ROUND 82b — THE SEED THAT NEVER MOVED (2026-09-19). Every punk label in
  the v1.2 set (#12) had the same navy ground #1E2A44, and the faces
  repeated too. Cause: `seed * 2246822519` (groundFor) and `seed *
  2654435761` (pickRoles) — a 32-bit seed times a 32-bit constant
  overflows the double, so the residue was the same for every seed.
  Fix: one exported `mix(seed, salt)` in src/lib/typeset/fonts.ts (murmur
  finaliser on Math.imul); faces use salts 1–3, the ground salt 7, so
  they don't move in lockstep. Verified the spread on the real item-id
  seeds before rebuilding. Run "hybrid-v1_3" (#13 in blind order) is the
  same v1.2 rules with the spread working — compare against #12.
- ROUND 82 — COMPOSER v1.2 + THE GAZETTEER (2026-09-19). Owner's rules
  after seeing hybrid v1: (1) GROUP the lines into logical blocks —
  producer + name, appellation + vintage, grape + origin, alcohol +
  volume — 120% leading INSIDE a block, real air BETWEEN blocks; never
  name + alcohol. Each block is ONE <text> with a <tspan> per line, so
  Illustrator opens it as one editable paragraph (owner: "in SVG every
  line was a separate object"). (2) The beige band under a colourful
  illustration: the GROUND is now chosen BEFORE the ask — groundFor(style,
  seed): traditional = paper tones, contemporary = pale tints, punk = bold
  flat colours (deep blue, red, mustard, black, green, orange, purple);
  the painter gets that exact canvas, the composer draws the band in it,
  the type is set for contrast (drawing's ink on light, paper-white on
  dark/saturated) — one ground, no seam; inkFootOf() now treats the given
  ground as "empty", not just cream. (3) THE GAZETTEER: src/lib/eval/
  regions.ts holds Claude's drafts for 10 Georgian regions (landscape,
  buildings, plants, what NOT to draw); /admin → Rules → "Regions" card
  (RegionsCard.tsx, /api/admin/regions, settings/_id "regions") lets the
  owner correct and save; regionNote() injects the match into the ask.
  First smoke with it: Kakheti came back as the Alazani plain with the
  Caucasus wall, no invented village. (4) HARD CLAUSE: no buildings /
  towers / churches / castles unless the story names them (owner x4).
  (5) FIT ORDER fixed after a smoke lost three lines to a full-size hero:
  close air a little → shrink everything in proportion to a COMFORTABLE
  size (hero ≥ 7% of H) → drop the least important line → shrink to hard
  floors. On a short landscape band six lines still don't all fit at
  comfortable sizes — the least important go (special, then origin);
  BAND_MIN 0.34 could rise for text-heavy wines.
  NEXT (agreed order): wire the WIZARD to the hybrid engine on this branch
  (no UI change — the three option columns come from the new engine);
  PDF with live type + embedded fonts in the Final Pack (SVG stays as the
  source; Playwright print-to-PDF is the likely path); "download →
  correct in Illustrator → upload" on /eval with a code diff of what the
  owner moved (their idea — the best training signal we can get); punk
  layout schemes where the MASK SHAPE is the layout (centre block,
  diagonal, full-bleed with type over art) — later.
- ROUND 81c — HYBRID v1, FIRST FULL SET (2026-09-19): run "hybrid-v1"
  on /eval (#11 in blind order), 18/18 after the Archivo fix (7 retried).
  The first labels the new way: three visibly different styles
  (traditional = centred serif over engraving; contemporary = left bold
  sans / Fraunces over two-colour red-sun art; punk = left rough faces
  over loud single-ink prints), the wine name at rank on every label,
  letterspaced secondaries, legal pinned to the 5 mm foot, type in the
  drawing's own ink (cyan Château on the punk print, blue Tsolikouri).
  No text errors, no doubled lines, no invented words — by construction.
  The art yielded (80-98%) on most, i.e. the ink-foot rule fires often:
  gpt-image's mask is soft. Still open: Racha → towers on every painter
  (gazetteer), the gap art→type on some (spacing tuning), legal at the
  7pt floor reads small, contemporary Saperavi's hero ink sampled red
  from the sun (accent vs ink choice needs a rule). Compare on /eval:
  Run A = #1 (baseline, whole-label dream) vs Run B = #11 (hybrid v1).
- ROUND 81 — THE TYPOGRAPHY ENGINE, v1.1 (2026-09-19). src/lib/typeset/:
  fonts.ts — the legacy engine's Google pool (34 families, 61 TTFs) is
  DOWNLOADED to public/fonts/labels/ (opentype.js measures every line;
  librsvg renders the same file — install them as system fonts:
  ~/Library/Fonts/8k-labels locally, /usr/local/share/fonts on the
  server + fc-cache, the back-label lesson) and distilled into per-style
  ROLE POOLS (hero / secondary / small + alignment: traditional centred
  serif, contemporary left sans, punk left rough), picked by seed.
  Owner 2026-09-19: labels use ONLY Google fonts (the UI face gets
  swapped for a free one at the very end). palette.ts — inkOf() samples
  the drawing's dominant DARK ink (median, outlier-proof) + accent +
  paper; inkFootOf() finds the last inked row. compose.ts — sets the
  type INTO the band of a masked artwork: measured hierarchy (producer /
  HERO / appellation+vintage / classification·grape·origin / special /
  legal), fit by closing gaps → dropping the least important line →
  shrinking with floors (hero ≥ 2.2x 7pt, never under 2x the secondary),
  legal pinned to the 5 mm foot, ink from the art. LESSONS from the
  smokes, now law: (a) the type starts below the drawing's LAST INKED
  ROW, not the mask window — gpt-image feathers past its mask (the
  masked "guarantee" is soft: 18/18 looked clean, but the foot drifts
  60→75%); (b) when the drawing leaves too little room the ART YIELDS
  (drawn smaller, top-anchored) before the type is crushed; (c) a
  varietal's grape is never printed twice. Output: SVG with live type
  (the future PDF) + PNG; /eval mode "hybrid" runs masked painter →
  composer, files PNG + SVG + the raw art; OpenAI-backed runs go one
  style at a time with a 3s breath (the per-minute quota). opentype.js
  needs the NAMESPACE import (no ES default) and the exact file bytes
  (Buffer slab trap).
- ROUND 80 — THE OWNER'S BLIND VERDICT (2026-09-18/19). Overall (all
  styles): #10 gpt-image MASKED 3.53 (punk 4.6!) · #4 nano-banana 3.39
  (trad 4.2, punk 4.0, cont 2.0) · #1 baseline 3.00 · #6 gpt-image plain
  2.93 (cont 4.3, punk 1.6) · #5 ideogram 2.88 (punk 3.8, cont 1.4) ·
  #8 ideogram rerun 2.67 · #9 cut-out 2.46 (raw material, judged
  unfairly as a result) · #7/#2 flux 1.9/1.7 · #3 recraft 1.8.
  FAULT PATTERN: composition / type / colour faults exist ONLY on the
  baseline and recraft — once type leaves the model's job, composition
  faults vanish. Subject + technique are what remain. → the hybrid split
  is validated by the owner's own marks.
  OWNER'S NOTES that become rules: (1) "avoid specific buildings /
  architecture if not requested" (x4) — painters invent churches,
  towers, châteaux → HARD CLAUSE in the artwork ask; (2) "beige bottom
  makes no sense" on PUNK when the art floats mid-frame (#6) — yet
  masked punk scored 4.6 because the art fills the window and the band
  reads as designed paper → the free-space treatment is PER STYLE
  (traditional/contemporary keep the band; punk gets a full window, or
  type over art); (3) "too AI / looks like AI" on gpt-image traditional,
  "amazing technique" on ideogram and nano-banana traditional → hand
  feel matters most in traditional; (4) contemporary is the weakest
  style for every painter EXCEPT gpt-image plain (4.3) — its two-colour
  flat/collage language is the contemporary the owner wants.
  DECISION (proposed): gpt-image with MASKING as the composer;
  nano-banana as a second composer (fast, cheap, loved on trad + punk)
  selectable as a trait; ideogram parked for a later hand-feel/texture
  pass; flux and recraft dropped. Cut-out kept as an INPUT for layouts
  that move/scale art — it can only be judged once composed.
  NEXT BUILD: the typography engine on masked artworks — plus the
  no-architecture clause, the region gazetteer, and code-side roughness.
- ROUND 79b — FREE-SPACE RESULTS (2026-09-18, both runs 18/18 after
  one-at-a-time retries; OpenAI's per-minute image quota is the wall —
  even ONE run with 3 styles in parallel trips it, so /api/eval retry
  with 4s breathing and a 70s cool-down between passes is the pattern).
  MASKED: the type band is untouched paper in 18/18 — the free-space
  problem is CLOSED by construction. Artwork quality high, style range
  real (single-ink blue screenprint punk, collage towers, a horizontal
  bubble smear); the illustration composes itself into the open window
  and vignettes into the paper. Paper colour is fixed at request time
  (the engine picks it BEFORE asking). CUT-OUT: 18/18 true alpha PNGs of
  the subject alone — maximum freedom (engine owns paper, position,
  scale, ground colour); needs placement logic since some pieces (the
  stag) run to the frame. Either kills the free-space problem; masked
  is the more "designed" result out of the box, cut-out the more
  flexible input. Recommendation: masked as the default ask, cut-out
  kept for layouts that need the art moved or scaled.
  NOTE: two runs named "run" (flux-pro 23:32, ideogram-3 23:40) were
  started by the OWNER from the /eval page — the button spends real
  money; harmless here (extra samples of the same painters).
  Blind mapping now: #1 baseline, #2 flux, #3 recraft, #4 nano-banana,
  #5 ideogram, #6 gpt-image, #7 flux (owner), #8 ideogram (owner),
  #9 cut-out, #10 masked.
- ROUND 79 — THE FREE-SPACE EXPERIMENTS (2026-09-18). The owner's
  reminder: "generate with text then erase" was tried before and failed
  (inpaint ghosts; the hole is the MODEL's type shape, not ours; nothing
  to re-typeset). Everything here decides the type's space BEFORE the
  model paints, or owns it outright. Two new ways of asking the same
  painter, both as EVAL_MODELS so they land on /eval as ordinary runs:
  gpt-image-cutout — the illustration alone on a TRANSPARENT ground
  (background:transparent), so the layout engine owns the paper and
  places art and type itself; gpt-image-masked — the edits endpoint
  with a paper canvas + a MASK that opens only the art window (top 60%,
  65% portrait, 4% margins): the type band comes back untouched by
  construction (GenerationJob.mask → form "mask"). Smoke: both accepted
  first try; the cut-out is a true alpha PNG of the subject only, the
  masked one has an untouched cream band. Full runs 2x18, sequential
  (both hit OpenAI). Plan of record: cutout = backbone (code owns the
  ground), zone-ask + ink measurement = safety net, masked = API-level
  guarantee if it holds up across briefs.
- ROUND 78c — BAKE-OFF RESULTS, Claude's read (2026-09-18; the owner's
  BLIND marks are the verdict, this is the pre-read). Five painters ×
  18 artwork-only asks, all complete (16 rate-limit 429s from running
  five at once, all recovered by /api/eval retry one at a time).
  gpt-image: reserved zone honoured ~16/18, no text, every subject
  right (the qvevri cross-sections are the best of anyone), strong
  style separation, the most label-ready compositions; clean, "AI-tidy"
  line. nano-banana: zone honoured ~17/18, no text, subjects right,
  real style separation (blue linocut punk, flat-sun contemporary),
  slightly flatter engraving; 9s. ideogram-3: the STRONGEST style
  separation and the most hand-made feel (pencil/etching, screenprint
  misregistration), subjects right — but fills the frame, zone mostly
  ignored; 20s. flux-pro: gorgeous surfaces, DOES NOT LISTEN — lost the
  subject in ~16/18, draws bottles and frames we forbade. recraft-3:
  writes garbled text on ~8/18 despite the ban, adds cartouches, three
  styles look like one storybook. GEOGRAPHY fails on EVERY painter
  (tower villages for Racha) — a region name in the prompt is not
  enough; the trait system needs a gazetteer of what each region LOOKS
  like. Shortlist for the hybrid's painter: gpt-image / nano-banana /
  ideogram — zone discipline vs hand feel is the trade the owner must
  call. Page blind mapping (do not reveal until marked): #1 baseline,
  #2 flux, #3 recraft, #4 nano-banana, #5 ideogram, #6 gpt-image.
- ROUND 78 — THE PAINTERS' BAKE-OFF (2026-09-18). The owner's baseline
  marks (18/18): traditional 3.67, punk 2.60, contemporary 2.50; faults
  composition 10, type 7, technique 6, colour 5, subject 4. Notes that
  matter: "looks AI — wants roughness", "group alcohol with volume",
  GEOGRAPHY (Svaneti towers on a Racha label — regions are sacred in
  wine), "image good, composition terrible". We agree: composition is
  the #1 fault, contemporary is the weakest style, the drawing itself is
  competent. → Confirms the hybrid direction: code owns composition/
  type/ground, the model paints.
  DEMO-FILL BUG (found through the eval, fixed here): buildDreamPayload
  replaced every EMPTY form field with the Château Margaux demo value —
  a blank Classification printed "Grand Cru Classé", French data on
  Georgian wines, thirteen lines on every label. Now empty stays empty
  (the engine keeps its own "Wine" / 12.5% / 750 mL fallbacks). This
  explains why the site's labels looked worse than the eval's.
  THE BAKE-OFF: mode A ("whole label", model paints type) was DROPPED —
  pointless once code sets the type. Mode B ("artwork only, a zone left
  empty for type") is the hybrid engine's own first building block, put
  to five painters with the SAME words: gpt-image (OpenAI), FLUX 1.1
  Pro, Ideogram 3, Recraft V3, Nano Banana (Gemini 2.5 Flash Image) —
  the last four via fal.ai (FAL_KEY; blocking endpoint like the LoRA
  path). Imagen 4 is no longer on fal (404 on every id). Recraft caps
  prompts at 1000 chars → a `short` form without the house-feedback
  tail. engine.ts exports artworkGuidance(style) so the artwork ask is
  steered by the same charter / sub-style deck / owner feedback as the
  dream. /eval gained mode + painter selects and a BLIND toggle (runs
  become "#1, #2…", painter and prompt hidden).
  SMOKE (one picture each): all five painted WITHOUT text. The reserved
  zone was honoured only by Nano Banana; FLUX lost the subject entirely
  (no winemaker); gpt-image and Ideogram filled the frame. LESSON for
  the hybrid: the empty zone cannot be trusted to the prompt — code must
  measure the artwork's ink and place type where the art is not (the
  candidate-scoring step in the plan is not optional).
- ROUND 77 — THE EVALUATION LOOP (2026-09-18): /eval (separate from
  /admin on purpose; behind the same session). src/lib/eval/briefs.ts
  holds SIX FROZEN briefs (3 wine colours + rosé + sparkling, 5 regions,
  all 3 label proportions, with/without producer, long and one-word
  visions) — change the engine, never the questions. /api/eval generates
  a RUN: every brief through every style with today's runDreamPhase (real
  model calls, 3 styles of a brief in parallel, briefs sequential), files
  PNGs + the full prompt per output + git commit under data/eval/<run>/.
  The page lays the style's reference board above the outputs; per
  output the owner marks the FIRST fault (subject / technique /
  composition / type / colour), an overall 1-5, the reference it should
  have resembled (click), a note; two runs compare side by side, brief
  by brief, with a tally. NOTE: gpt-image has no seed — a run is a
  sample, not a replay; the value is many samples of identical briefs
  across engine versions. Boards today: traditional 5 refs (small!),
  contemporary 11, punk 14. First run "baseline" = untouched engine.
- ROUND 76 (owner, 5 items, 2026-09-18):
  (1) the "Composing back label…" status line in the top-right corner is
  gone — the back-label page runs its own loader, that only added noise.
  (2) the T&C gate printed TWICE on checkout: the root-level bar message
  (round 59 #2, y648) and checkout's own under the payment button (round
  52 #1). The root one now skips the checkout page.
  (3) the walkthrough's click before the front details lands ON the
  Producer field (1060,279 — row baseline 284.5) instead of 60px above it.
  (4) the card's pointer was a CSS triangle butted against the card, and
  at fractional page scales the two shapes left a hairline between them.
  It is one SVG path now, overlapping the card by a pixel.
  (5) "Wine Description" moved OUT of its box — baseline 196 on the box's
  own left edge (136), between the title and the box and close to it —
  and the textarea took back the space it used to occupy.
- ROUND 75 (owner's new Final Pack artboard, 2026-09-17): the page turned
  around. LEFT is the ORDER — the carousel between its two chevrons, the
  T&C row, four priced rows and "Proceed to payment". RIGHT is WHAT YOU
  BUY — the folder tree hanging off the header's own folder mark (that is
  what the round-71 mark is for), the explanation, and a "Download" that
  stays grey and disabled until the payment goes through. A dashed rule at
  x720 divides them. Geometry straight out of the artboard (viewBox IS our
  1440x822.86): rows on 468.28 / 502.2 / 536.49 / 570.64 / 605.06, Total
  639.48, rings cx 171.15 with centre = baseline − 6.13, prices
  right-aligned to 617.14, buttons y651.43 h34.29 480 wide at 137.14 and
  822.86, carousel arrows centred on y308.57, tree axes 857.14 / 1055.24 /
  1267.6 (READ ME / MARKETING ASSETS / LABELS — the order changed).
  BOARD REBUILD: the export's <metadata> was malformed (a stray ]]> that
  broke every SVG parser) — strip it, strip the 15MB embedded label
  raster and the five prices, and it drops 17MB -> 67KB.
  OWNER'S ANSWERS: Marketing Assets stays at $9 (the board's $19 and its
  $296 total predate round 48 #7); Download unlocks only after Proceed to
  payment; the paragraph — which is OUTLINED on the board and so cannot
  follow the language switch — is covered and redrawn as live text.
  The board carries no back arrow any more, so checkout's "bawipe" and the
  ghost back button are gone, and its title joins every other page on
  baseline 149.08. The credits top-up view now borrows the same order
  column instead of its own centred card. NOTE: the artboard has no slide
  caption and no carousel ring dots, so neither is drawn.
- ROUND 74 (owner, 2 items, 2026-09-17):
  (1) the two label previews in CHECK YOUR DETAILS now stand the SAME
  height. Their dashed boxes were always equal — object-fit was sizing
  each image by its own aspect, so a square back label came out half
  again as tall as a landscape front one. dashBox() takes an optional
  imgH and both are given the tallest height at which BOTH still fit
  (min of the box height and inW/aspect for each), widths following.
  (2) clicking a marketing thumb swaps it into the big slot again —
  lifeOrder[] holds the running order (index 0 is whatever shows big),
  swapHero() exchanges a thumb with it, and a fresh run resets it.
- ROUND 73 (owner, 8 more on the walkthrough, 2026-09-17):
  (1) after the QR button the pointer climbs to the back-details column
  and clicks BEFORE a character of it is typed. (2) when a step's script
  finishes the arrow inflates twice (nuiNudge, replayed by keying the
  button on a counter) so the turn visibly passes to the visitor.
  (3) the doubled dashed outline on the back label was the DEMO IMAGE —
  it had been screenshotted WITH the page's dashed overlay baked in;
  re-grabbed through fetch(img.src) -> data URL, so it is now the real
  984x984 PNG. (4) the bottle step opens already set to Red / Bordeaux /
  Amber / Wax Seal / Matte and then changes type -> Burgundy, colour ->
  Olive Green, closure -> Cork, picks a red off the wheel (0.44,0.10,
  sampled through the same canvas the real handler uses) and drags the
  lightness to 0.79 — the owner's exact order. (5) step 5 and step 6
  bodies cut to THREE lines; a fourth sat 6.7px off the card's foot
  where three sit 21px off. (6) the closing card is the same box as
  every other (171.43, not 102.86) with its text still top-left, and it
  carries no Skip — its own arrow does that. (7) step 2 now MAKES a
  variation first: it presses "Contemporary Variation", the slot runs
  its label-shaped loader, the second design lands, the dots under the
  label flick between the two, and only then is one selected. The
  variation is a real second contemporary design (demo/label2b.jpg).
  (8) the pointer is hidden on the closing card, which has nothing to
  point at.
- ROUND 72 (owner, 14 items on the walkthrough, 2026-09-17):
  (1) the closing card stands on a BLANK page — the walkthrough stays on
  the assets page and a white sheet covers the band (the folder mark had
  to climb to z13 to stay above it). (2) its arrow hands over to Your
  Vision, not the home page. (3) TEMP while testing: EVERY arrival gets
  the walkthrough, refresh included — nui-tutorial-seen is no longer
  read or written; this wants to be per-visitor later. (4) a red
  underlined "Skip" sits top-right in the card. (5) the vision step now
  sets the LABEL SIZE (120 x 95) before moving to the details. (6) in
  the walkthrough a stop stays UNNAMED until the button leaves it — the
  name fades in over the travel; outside it every name shows as before.
  (7) bar labels dropped 15px -> 13px to match the header menu (GEO
  stays 11px or six Mtavruli names collide). (8) a red ring blooms at
  every scripted click. (9) FRONT LABEL opens on the real loader, run
  fast, and the finished designs land straight after it — no grey slots
  (the "15-35 seconds" note is hidden there, it would be a lie).
  (10) the rhythm is off the metronome: every pause is nudged 0.72-1.3x
  and typing slows at spaces, stops at punctuation. (11) a POINTER
  travels to whatever it is about to click — without it things simply
  happened on their own and read as a glitch. (12) the back label is
  seeded synchronously (and preloaded at start), so its empty slot is
  never on screen. (13) the bottle step now changes its mind — Bordeaux
  Prestige -> Bordeaux, Transparent -> Olive Green, Screw Cap -> Cork —
  keeps Matte, and drags the lightness knob 0.5 -> 0.79 (knob cx =
  1144.83 + shade * 121.64 on y 532.5). (14) the product page publishes
  only after the five marketing images are in; until then its column
  runs the loader glass.
- ROUND 71 (owner, 4 items, 2026-09-17):
  (1) NEW PROGRESS BAR, read straight out of the owner's
  New_Progress-Bar artboards (their viewBox IS our 1440x822.86, so the
  SVG numbers are page units — no measuring needed). Six labelled stops
  instead of three, one per wizard page, alternating: a 3.15 dot under a
  300-weight label for the pages you FILL IN (Front Label Details, Back
  Label Details, Bottle Details) and a 4.92 dot under a 700 caps label
  for the ones that hand you a RESULT (FRONT LABEL, BACK LABEL,
  MARKETING ASSETS). Stops at 303.38 / 469.98 / 636.58 / 803.18 /
  969.79 / 1136.39, line y 754.18 at 4px from the red start dot at
  142.06, labels on baseline 788.6, button r34 at 1302.86 with the
  artboard's own 34.3-long 3px arrow. A future big dot is white with a
  black ring, a future small dot is solid black. THICK now lands ON the
  current page's stop (no more half-way). NOTE: the artboard labels stop
  5 "Back Label Details" a second time — a copy/paste slip; it is the
  BOTTLE page, as that step's own card says. GEO drops to 11px or six
  Mtavruli labels collide.
  (2) FOLDER MARK traced verbatim from the artboard (two paths, white
  fill + 0.75 black stroke) at 1233.31,34.67 — it straddles the header
  edge on purpose. The header menu row's right edge moved 1303 -> 1200
  to clear it; the owner's artboard header carries only "8K", so the
  collision with ENG/GEO was not visible there.
  (3) MARKETING ASSETS rebuilt from the new Assets pair: FIVE images
  again (engine, fake path, checkout carousel and stage labels all went
  back to 5), a 274-square HERO plus four thumbs, and the whole block
  ~31px lower. The thumbs take one of the owner's two shapes — a 2x2 of
  122s (no product page) or a single column of four 62s (with it).
  Frame y 274.6 h 342.8, rules 274 / 411.5 / 891.25, right edge 1062.5
  or 1302.5. Headings: bold title on baseline 184, two 12px lines on
  213 and 227. The page column now carries the browser at 921.5,310.5
  (350.8 wide) with the QR at 925.5,548.5 and its italic caption.
  (4) THE WALKTHROUGH. A first-time visitor's press of the red arrow
  plays the whole job through on a finished sample instead of dropping
  them in an empty form. It runs the REAL pages driven by demo state —
  the fields type themselves in, the three designs arrive one by one and
  one is picked, the market picker opens and chooses, the bottle
  sections tick on, the asset run plays its stages — so the walkthrough
  can never drift from the product. The black card above the arrow is
  the artboard's (191.2 wide, foot on 685.72, 20.6 pointer to 706.31)
  and travels with the button, which rides the stop being explained.
  Seven cards; the last is the short one with "Let's build your pack!"
  and the arrow back home, which wipes the demo state, sets
  nui-tutorial-seen and starts the real thing from the top. While it
  plays, a transparent sheet over the content band swallows clicks so
  nothing can derail the story, and the assets + bottle-autodetect
  effects are held back so it can never reach the paid generator.
  SAMPLE ASSETS in public/newui/demo: three engine-built label designs
  and a back label pulled from a real mock-mode run, and the product
  shots / five marketing images / product page cropped out of the
  owner's own Assets artboards. The labels (mandolin player) and the
  photographed bottles (deer) are from DIFFERENT runs — the owner said
  "pick any, we can update it later".
- ROUND 70 (owner: "Upload label is not working", 2026-09-16): the
  bottle-page label upload was rewritten. THREE faults, all of them
  silent: (a) a file input fires NO change event when the same file is
  picked twice, so a second attempt with the same label did nothing —
  the input is now cleared at the end of every attempt (the Vision
  sketch upload had the same trap and got the same fix); (b) round 68's
  normalizeLabel decoded the file a SECOND time, and a file the browser
  cannot decode (HEIC, PDF, a damaged export) fell through both decodes
  without a word — the handler now decodes ONCE and flattenLabel() works
  on the image it already has; (c) any failure now says "That file could
  not be read — please use a PNG or JPEG" instead of nothing. Verified
  on four cases: fresh upload, the SAME file again, a 3000x2200 PNG
  (arrives as a 12KB JPEG), and a non-image — warning shown, the
  previously good label left untouched.
- ROUND 69 (owner, 3 items, 2026-09-16):
  (1) the three variation buttons read "<Style> Variation (1 Credit)" —
  singular, with the price that requestCredit actually charges.
  (2) the market chevron follows the PANEL, not the picks: up whenever
  the menu is closed (chosen markets or not), down while it is open.
  (3) MARKET COMPLIANCE and its paragraph now start on the same
  horizontal line as the Select Market button's top edge (653). Cap
  ascents measured live in the browser (17.54 at 700 24px HNW, 10.23
  at 14px) — note baseTop() assumes lineHeight == size, so the 18px
  line box adds 2px the helper does not know about. Verified: all
  three ink tops land on page row 652.5.
- ROUND 68 (owner, 6 items, 2026-09-16):
  (1) the PROGRESS BAR now paints ABOVE a modal's veil (container z45,
  was z8) so the red line, dots and round next button stay crisp while
  a pop-up is open; every one of its click zones goes pointerEvents
  "none" while `modalOpen` (confirm / email / terms / market) is true,
  so it looks live but cannot be used until the box is closed.
  (2) SELECT MARKET now matches the QR buttons above it: 12px roman
  black text on WHITE with a 1px black outline and a black chevron
  30% smaller (22x11 viewBox rendered at 15.4x7.7). It turns BLACK
  the moment the panel opens and STAYS black once markets are picked
  (`dark = marketOpen || picked.length > 0`).
  (3) the barcode / QR explanation lines moved up 10px (baselines
  517/535, GS1 link 553).
  (4) UPLOADED-LABEL BUG ("no bottle, no marketing images, just the
  label back"): a customer's file went to /images/edits raw — a
  12-megapixel phone photo, or a PNG whose alpha the model reads as
  the subject, makes the edit call hand the picture straight back.
  Every upload is now re-baked by `normalizeLabel()` into the shape
  our own labels have (flattened onto white, capped at 1400px on the
  long side, plain JPEG 0.92) before it becomes `customLabel`. Two
  companions: the multipart FILENAME now carries the real extension
  (`input-0.jpg`, not `.png` for a JPEG — the API validates it), and
  a failed asset run no longer dies in a bare `catch {}`; it logs and
  shows "Generation failed — please try again".
  (5) the credit number in the header bar is explicitly 700.
  (6) the Vision and Back-Label description boxes got their weighted
  frame back — 2px top+left, 1px right+bottom.
- ROUND 67 (owner, 2 items + two mid-round notes, 2026-09-16):
  (1) the modal veil no longer washes over the black bars — each modal
  now paints a TRANSPARENT full-page blocker (clicks) plus a white
  88% veil across the WHITE BAND only, so header and footer stay
  solid black. (2) MARKET PICKER rebuilt from the owner's three
  reference screens (Unclicked / Opened / Selected): a black button
  the size of the QR ones (753,653,241x34.3) with italic white text
  and a 22x11 chevron drawn to the reference (UP while closed and
  nothing picked, DOWN while open or after a pick); its label runs
  "Select Market" → "Select" (open) → "Selected" (picked); the drop-UP
  panel sits directly on the button (white, 1px border, "No compliance
  needed" first, dashed rule, 13 flag rows of 25px with our ring at
  the right, picked rows bold on #F2F1ED) and the chosen markets are
  listed as flag + name to the RIGHT of the button. The trigger rides
  z13 while open so pressing it closes the menu. MID-ROUND: (a) empty
  rows in the confirmation box now show their own grey placeholder
  (whole empty BLOCKS still disappear — round 66 #3); (b) the bottle
  drawing in the marketing box is sized by its INK (the JPG's outline
  fills only 32.6% x 68.8% of the canvas), so it stands 155 tall like
  the reference instead of shrinking inside object-fit.
- ROUND 66 (owner, 3 items, 2026-09-16): (1) a SPARKLING bottle now
  offers ONLY "Sparkling Cork" and "Crown Cap" in Closure Type (the
  still-wine closures and No Capsule disappear), and switching TO
  sparkling auto-moves a still closure to Sparkling Cork. (2) the
  marketing confirmation box follows its own reference screen: the
  bottle drawing (57,178,43x155), Front Label box (137.6,177.6,
  160x155), Back Label box (323.7,…,159x155) and the Product Details
  list at x500 (values 604, type one notch down at 14px so "Closure
  Type: Sparkling Cork" never collides). (3) EMPTY MEANS ABSENT in
  both boxes — no prompt → no "Prompt:" block, no sketch → no
  "Sketch" block or dashed box, no back label → no "Back Label"
  block, and the detail list carries only the rows that actually have
  a value (title hidden when none). The box HEIGHT is computed from
  what survives (buttons at contentBottom + 24/48, box = that + 76),
  so a nearly-empty check is a small box, a full one matches the
  reference's 740x560 / 740x455.
- ROUND 65 (owner, 4 items + mid-round note, 2026-09-16): (1) the
  footer back arrow is GONE — the BROWSER's Back/Forward walks the
  wizard instead: go() pushes {page} history entries (?page=…) and a
  popstate listener navigates back, with barJumped set so a history
  jump never starts a paid generation; the loader pushes NOTHING (a
  waypoint, not a destination), so Back from the labels page lands on
  Your Vision. Known consequence: Back from the welcome page leaves
  the site, and a refresh keeps the page but not its state (same as
  the old ?page= dev jump). (2) the red next button is 20% smaller
  (r 27.2, arrow 28.8×19.2). (3) "LABEL SIZE" title dropped; the row
  now reads "Label Width: / Label Height:". (4) the confirmation box
  was rebuilt to the owner's reference (Comments/New screenshot):
  740×560 centred in the WHITE BAND, uppercase 23px title + ✕, an
  italic credits line ("Each creation costs N credits" · "You have N
  Credits" with a red bold number), a dashed rule, then two columns
  — Prompt + Sketch box (or Front/Back label boxes) at x32 and the
  detail list at x385.5 (values 500, GEO 530) — and Edit Details
  (outlined, left) + Create (N Credits) (black, right). The cost is
  live: 3 for a label set, 1 for a marketing pack. MID-ROUND: every
  modal scrim now covers the FULL artboard (0..H) so the progress
  bar, next button and header are all inert until the box closes.
- ROUND 63 (owner's Comments/New mocks — UI RESTRUCTURE, 2026-09-16;
  functionality unchanged): (1) NEW PROGRESS BAR measured off the 3x
  artboards: it rides the white/black boundary at y753.7 — filled red
  start dot (r5.2) at 142.06, white station dots (r4.35, 1px ring) at
  428.7 / 720.2 / 1011.8, 3.6px red line with a round cap, station
  labels WHITE 14px baseline 788.2 inside the footer, and the NEXT
  action is a red round button (r34, #B71318, 36px white arrow) at
  x1268.4 — at x168.1 on the welcome page (it flies between the two
  via @keyframes btnFly). Back arrow = small white arrow at x52 in
  the footer. Line stops: vision/loader HALFWAY to Front Label,
  options ON it, backdetails halfway to Back Label, backdesign ON it,
  bottle halfway to Marketing, assets ON it, checkout at the button.
  (2) the FOOTER is empty — copyright, classic-interface link and the
  credits row are gone; the TEMP live-generation switch moved to the
  header (left of 8K) and the credit balance joined the header's
  right group. (3) PAGES MERGED: "front" and "compliance" are gone
  from ORDER — Your Vision + Front Label Details is one page (dashed
  column rule at x788; left: title/italic intro/2 buttons/textarea
  box 136,342,551x207/LABEL SIZE + W-H; right: title/intro/13 rows,
  captions 891.8 bold 14, inputs 1012, rules 1013→1302.86 at
  287+30i), Back Label Details + Market Compliance is one page
  (description box 136,208,551x208, 7 rows at 217+32i with captions
  755.5 and rules 990→1303, GTIN row + QR pair at y450, notes at 527,
  dashed band rule y586, then MARKET COMPLIANCE). Captions that used
  to be baked (FRONT_LABELS/BACK_LABELS) are drawn live; boards are
  white-patched. ALL page titles are now 24px bold on baseline
  149.08 (checkout 151.8) — the baked 19px ones are covered via
  PAGE_TITLE in pageSpace, which ALSO wipes the boards' old baked bar
  strip (y660-754; the Final-Pack board instead needs only its baked
  back arrow hidden). (4) MARKET DROPDOWN: the underlined MARKET word
  opens a 300px panel UPWARD (bottom at y640) with flag + name + our
  ring per country and a "No compliance needed" row; picks are
  summarised in grey under the trigger. GEO: field captions drop to
  13px and the compliance paragraph stacks under its (much wider)
  Mtavruli title. NOTE: the mock's "Create/Upload Barcode" buttons
  would resurrect invented GTINs (round 27) — the honest GTIN input
  keeps that slot instead.
- ROUND 62 (owner, 3 items + live bug, 2026-09-15): (1) variation
  buttons say just "{Style} Variations" (Create dropped, EN+GEO).
  (2) footer explainer "1 Credit = 3 new labels" removed. (3) CREDIT
  MODEL: 1 credit = 1 label — newcomers get 5, the initial 3-label
  run costs 3 (requestCredit(from, cost)), a variation 1, an assets
  pack 1. LIVE BUG FIXED: the server back label rendered TOFU
  rectangles — sharp/librsvg needs SYSTEM fonts; installed
  public/fonts/backlabel/BarlowCondensed-*.ttf into
  /usr/local/share/fonts/barlow + fc-cache on the server (part of
  any future server rebuild!). Verified with a live server render.
- DEPLOYED (2026-09-14): Hetzner CPX22 (Ubuntu 26.04, x86) at
  2.28.48.43 — app in /opt/8klabels, systemd service "8klabels"
  (npm run start :3000), Caddy on :80 reverse-proxying, ufw
  22/80/443, Node 22. Env carried from local .env.local
  (IMAGE_PROVIDER=openai, Mongo Atlas reachable). SSH: the owner's
  Mac key is authorized for root. UPDATE PROCEDURE: rsync -az
  --delete --exclude node_modules --exclude .next --exclude .git ./
  root@2.28.48.43:/opt/8klabels/ && ssh root@2.28.48.43 "cd
  /opt/8klabels && npm ci && npm run build && systemctl restart
  8klabels". PENDING: domain + HTTPS (Caddyfile swap), replace the
  hardcoded 8klabels.com QR domain, change admin John/Doe,
  server-side credit enforcement before any public audience.
- ROUND 61 (owner, 2 items, 2026-09-14): (1) variation dots sit
  MIDWAY between the label bottom and the variations button
  ((ly+lh+565)/2). (2) the More Variations button is OFF the assets
  page (moreVariations plumbing kept for later). Deployment to a
  Hetzner VPS begins this round — step by step with the owner.
- ROUND 60 (owner, 5 items, 2026-09-14 — pre-launch): (1) VARIATIONS
  REMODELLED: each style column is its own mini-carousel — one press
  = ONE new label of that style (1 credit), switcher dots appear
  under the label centered to it (1 + N dots), styleVars[3]/
  styleView[3]/varBusyCol replace varRuns/optPage; viewedDream(col)
  is THE selector everywhere (assets brief, bottle preview, back
  ground colour, checkout, package, popup thumb); pending slot shows
  a label-shaped glass. (2) landing thumb has ONE continuous loader
  — a single box+glass carries from generation into the iframe load
  (grey overlay inside the browser box until ppLoaded; ppFill floor
  0.55), QR appears after. (3) the credit balance moved to the BLACK
  FOOTER right-aligned to 1302.86 ("1 Credit = 3 new labels" grey ·
  "Credits available:" white + RED number/Add-credit link); the
  classic-interface link is gone from the footer (still at /classic);
  page-level indicators removed. (4) sigBack now carries qrMode AND
  selected column:view — ANY back-details change regenerates the
  back label. (5) gate messages at y648. NOTE: pricing wrinkle — a
  single variation now costs 1 credit while the explainer says "1
  Credit = 3 new labels"; owner to decide.
- ROUND 59 (owner, 5 items + Assets@3x mocks, 2026-09-14): (1) the
  bottle-preview label got its size BACK — the round-57 body-width
  cap was wrongly shrinking a 110mm label below the anchor-chart
  look (labels legitimately read wider than the silhouette: they
  wrap); only the red-line zone clamps now. (2) gate messages float
  at ROOT level (y658, unclipped) — truly midway between the Select
  row and the bar line. (3) all modals centered in the white band
  (confirm y84, gift y240, terms y144). (4) modal titles 700 60px,
  the credits sentence 26px; boxes grown (confirm 740×560, gift
  580×248, terms 680×440; terms TRACK 628/104/240). (5) ASSETS PAGE
  REBUILT to the mocks: FOUR equal marketing images (2×2 grid 273²
  at 479/278.75, cells 122+29 gaps, densifying 3/4-col via More
  Variations +4 per credit), shots in a SPLIT col1 (halves centered,
  slots 120×274 at 145.5/281.75, custom = one at 213.75), frame y
  243.5 h 343.5 ending at 821 without a landing — or extending to
  1303 with "Product Landing Page" (browser 340 at 892/279 + 36px
  /api/qr?u= QR at 892/522) when qrMode==="create" or on an empty
  preview jump. Sets are 4 lifestyle everywhere (ASSET_STAGES /4,
  engine 4*(batch+1) windows, stage text i/len). Spec text now
  "Transparent PNG / 700x2500px / 72dpi"; heroAsset retired.
- ROUND 58 (owner's Comments/maximum_margins silhouettes,
  2026-09-13): the red-line label limits are now LAW — LABEL_ZONE
  (fractions of the drawn bottle height, extracted programmatically
  from the six JPGs): Bordeaux .387-.909, Prestige .395-.894,
  Burgundy .607-.929, Sparkling .664-.927, Alsace .652-.944, IceWine
  .314-.938. The bottle-preview label clamps its HEIGHT to the zone
  and its POSITION into it (clampY), on top of the body-width cap;
  default zone [0.35,0.92] until a type is picked. Default 110×80
  labels sit inside every zone — no visual change for the normal
  flow.
- ROUND 57 (owner, 5 items, 2026-09-13): (1) credits RESET to 3 on
  every browser refresh (no persistence). (2) fake-mode stand-in is a
  REAL generated label (public/newui/sample-label.jpg, converted from
  the owner's downloaded Wine_Front_Label.tiff), not a bottle
  drawing. (3) the small marketing thumbs are QUIET placeholders
  (slot(...,quiet) — no message text). (4) "Marketing Assets" bar
  word → BOTTLE page; the empty label slot on the bottle is a
  clickable "Create front label" → front details; the message is the
  new SHORT version everywhere ("Create front label"/"Create back
  label", GEO "შექმენი წინა/უკანა ეტიკეტი"). (5) uploaded-label
  scale: BEST-GUESS mm by fitting the image aspect in a 110×120mm
  window (5mm steps, min 40×30) + the DRAWN label hard-clamps to the
  scanned silhouette (bw stored in bottleScans; ≤ body width −12px,
  ≤ 62% bottle height, aspect kept) — awaiting the owner's margin
  silhouettes to encode exact per-bottle zones. NOTE: the owner's
  comments drop folder is now Comments/New (directly under
  Comments).
- ROUND 56 (owner, 8 items + PSD, 2026-09-13): (1) PSD: "More
  Variations" — a black bar under the thumbs (grid+button = hero
  height); each press costs 1 credit and appends 5 lifestyle images
  via /api/marketing-assets {lifeOnly, batch}; dealScenarios deals a
  windowed batch*5 slice off ONE seed so batches never repeat scenes;
  the thumbs grid densifies 2×2(123)→3×3(78.7)→4×4 inside GH=256.
  (2) an EMPTY bar-jump to assets (selected<0, no custom) previews
  the FULL 3-column layout incl. the Landing-Page placeholder (never
  the browser); the credits indicator now rides vision, options
  (with the 1-Credit subline) AND assets — always. (3) TEMP DEV
  SWITCH "live generation" in the footer (nui-live-gen): off = all
  three generation paths (labels, variations, assets/more) fake with
  already-made art + staged loaders, no API calls; Pay&Download in
  fake mode packages fake art — REMOVE BEFORE LAUNCH (CLAUDE.md).
  (4) label-height drift KILLED MECHANICALLY: the finished front
  shot rides as an extra reference on the back shot ("copy its scale
  exactly; the photos must overlay"). (5) dealScenarios deletes
  near-duplicates (sim>=0.35) and tops up from the GENERIC list —
  never backfills with twins; owner's boards hold 8/12/10 distinct
  scenes (enough). (6) no QR row → the www line under READ ME is
  patched off (521,566,175x13). (7) CREDIT ECONOMY: everyone starts
  with 3 (localStorage null → 3); EVERY generation spends 1 through
  requestCredit(); at zero: no email → mailing-list GIFT modal ("1
  free credit", button "Add credit", +1); email known → CREDITS page
  (gensReturn remembers where to come back). Indicator at zero shows
  a red underlined "Add credit" link to the CREDITS page. (8) the
  gift button NEVER generates — it grants the credit, returns to the
  page, and the indicator digit spins slot-machine style (~900ms)
  before settling.
- ROUND 55 (owner's Comments/New_Progressbar/New folder — the NEW
  drop point for annotated screenshots, 2026-09-13): (1) top-up page
  is titled CREDITS (baked FINAL PACK covered, live 19px title) and
  its button says "Proceed to Payment"; the Total gap the owner
  circled was already closed by the 4-row list. (2) assets thirds
  mode: the two product shots ride the divider's exact height
  (gy..gy+300), each CENTERED in its half-cell (slots 180 wide at
  144.63 / 338.88 — wider slot = visibly bigger bottle; custom's
  single shot centered at 241.75). (3) Final Pack folder tree PRUNES
  with the selection: labels row off → patch(262,344,104,232) +
  connector-arm patch(306,339,138,7); marketing row off →
  patch(396,344,104,275); README always stays. (4) the agree warning
  sits under the Pay bar CENTERED TO THE BUTTON (x822.86/480 gens,
  width 480).
- ROUND 54 (owner, 4 items, 2026-09-13): (1) CREDITS replace
  "generations" — 1 credit = one 3-label run OR one marketing-assets
  pack; a repeat variations run now costs 1 credit; indicator says
  "Credits available: N" (bold, red digit) with the explainer
  "1 Credit = 3 new labels" on the second title line. (2) PRE-GEN
  CONFIRMATION POPUPS: the vision next-arrow and the assets page
  pause on "Check your details" — labels popup lists prompt, sketch,
  all 13 front fields (2-col grid) and size; assets popup shows
  front/back label thumbs + wine name/colour, bottle type/colour,
  closure type/colour (with swatch) and label size. Create fires the
  run (assets: confirmedAssetsSig + assetsTick re-arms the effect);
  Edit Details goes to front details / bottle; ✕ or scrim closes.
  Same-brief revisits replay the cache silently. (3) credit digit
  bold+red everywhere incl. the popup balance. (4) top-up list is
  FOUR rows: 3 Credits $2.99 / 5 $3.99 / 10 $7.99 / 100 $69.99
  (extra separator at 617.41; prices .toFixed(2)).
- ROUND 53 (owner, 8 items, 2026-09-12): (1) the gens top-up card
  keeps an EMPTY thumbnail box (live dashedBox+crosses at 480,137.14,
  480x274.29 — owner sends its image later), full baked rhythm
  centered (dx -342.86, dy 0). (2) credits indicator = bold 15 at the
  title line, digit in BAR_RED, shown on every options page; the
  "{Style} — Variations" header moved UNDER the page title (left,
  183.62 baseline). (3) style-correlation audited (click → modal →
  createVariations → API passes the style verbatim; pages label
  themselves from varRuns) and repeated styles number their pages
  "… 02", "… 03". (4) back label: QR renders ONLY when uploaded or
  requested (no more d.web/example fallback), "See ingredients"
  exists only beside a real QR, BOTTLED slides to x4 without one;
  client sends qrImage/qrUrl only for its chosen mode. (5) assets:
  qrMode !== "create" → landing column DIES and the thirds layout
  (2×2 145px thumbs, group centered right) applies with BOTH shots
  centered in the left third (divider between them). (6) the T&C
  ring resets to unchecked on EVERY checkout entry. (7) no
  Product_Page carousel slide unless qrMode === "create". (8) bar
  words jump to RESULT pages (Front Label → options, Back Label →
  backdesign); empty options/backdesign show the real furniture
  greyed & inert (#ECECEA fills, #C9C7BF rings/text); "Create a
  front label first" navigates to the front DETAILS page.
- ROUND 52 (owner, 4 items, 2026-09-12): (1) EVERY pay path
  (standard, own-label, gens top-up) gates on the T&C ring —
  requireAgree() shows "Agree to the Terms & Conditions to continue"
  under the Pay bar. (2) the gens top-up page hides the tree AND the
  carousel — ONE purchase card centered on the page (card x480,
  baked rhythm shifted dy -150; cover patches 126,158,706x470 +
  818,128,494x565 — the right one must reach 1312 or the baked
  corner-cross arms peek out). (3) clicking the underlined
  "Terms & Conditions" opens a modal: lorem body (TERMS_TEXT, 9
  paragraphs) behind a hidden-scrollbar div (.nui-noscroll), the
  house scroll = 1px hairline + draggable black dot (dragRef
  "terms"), black Agree / outlined Disagree buttons setting the
  ring, ✕ close. (4) the board paragraph text swapped IN THE SVG
  (public/newui/checkout.svg): "…including high-resolution,
  print-ready files and all necessary information and details."
  (4 lines now; SVG_GE keys renamed to match).
- ROUND 51 (owner, 10 items, 2026-09-12): (1) the fields-are-optional
  note returns under FRONT LABEL DETAILS ("Feel free to leave out…").
  (2+5) the credits indicator AND the "{Style} — Variations" header
  ride the page-title baseline (149.08). (3) the SECOND variations
  run ALWAYS asks for the email — a stored one only prefills the
  modal. (4) buying generations does NOT auto-run — back to the
  first-labels page (optPage 0); the Create-Variations buttons render
  on EVERY page including variations pages. (6) pressing Select on a
  selected label deselects it. (7/8) backdesign shows an
  informational "Width: N mm  Height: N mm" caption (front page's
  exact type, no input/underline) centered between the label and
  Edit; width = composed PNG aspect × height, ROUNDED TO 5 mm;
  height = the customer's front-label height verbatim. (9) BACK-SHOT
  LABEL HEIGHT ROOT CAUSE: the back shot's scale line claimed the
  FRONT label's width, so the model rescaled and height drifted —
  the client now sends backLabelMM (true rounded width, same height)
  and buildShotPrompt swaps it in for the back side. (10) carousel
  caption Product_Shot_Face.png → Product_Shot_Front.png (the ZIP
  already said Front).
- ROUND 50 (owner, 13 items, 2026-09-12): (1) VARIATIONS ARE
  MULTI-PAGE — varRuns: string[] (style per run), run k's dreams at
  3+3k..5+3k, base = optPage*3, N = runs+1 pager dots centered on the
  page axis at y542; AREA_BOT 528→519 so portrait labels leave the
  dots the same 18.5px air as dots→buttons. (2) GENERATION CREDITS:
  run 1 free, run 2 email-gated, run 3+ costs 3 credits (1 credit =
  1 image) or routes to the checkout in gensMode — a single-select
  top-up list (3X $1 / 9X $2 / 20X $5, no summing; the standard pack
  still sums) over the same layout; TEMP "before IP reset": Pay just
  adds credits (localStorage nui-gen-credits) and auto-fires the
  pending style. Credits indicator (my proposal, owner to comment):
  italic right-aligned "Generations available: N" on options page 0.
  (3) every gate message ("Select a label…", compliance, bottle) now
  renders ONCE in the static progress zone at y664 — midway between
  content and the bar line. (4) Matte/Glossy grey+freeze with the
  wheel. (5) engine: front/back labels declared SAME size in
  scaleLine. (6) bare cork = FULLY SEATED, never half-pulled;
  lifestyle adds "BOTTLE STATE: unopened unless the scene requires".
  (7) in-neck cork through glass: one clean uniform ~45mm cylinder,
  no doubling/blur (bare + capsule branches). (8) UI sparkling foil
  zone 0.505→0.455 (1/10 off the bottom). (9) changed brief clears
  productUrl before the assets rerun — stale landing thumbs die.
  (10) lifestyle "PRODUCT CONSISTENCY — NON-NEGOTIABLE" (sparkling
  never with a still cork). (11) wheel block y380→368. (12) both
  prompts: silhouette matched EXACTLY, "when in doubt TRACE the
  outline". (13) CHECKOUT REBUILT from the owner's Check Out copy 2
  board: public/newui/checkout.svg = New_UI_2.svg minus Illustrator
  metadata (8.8MB!), the mock label <image>, its caption and the 5
  price texts (script-stripped by coordinate). The board carries the
  folder tree + paragraph + carousel frame + thin arrows + T&C + row
  names + Pay bar; the overlay adds only: slide image/caption, ghost
  arrows/pay/back zones, live dots on baked rings (cx 857.14, cy
  497.28+34.43k; T&C 859.38,445.71), prices right-aligned to 1234
  (baseline-13.5, lineHeight 16 lands on the baked baseline), live
  total. gensMode covers rows with patch(822.5,469,481,150) — NOT
  taller, or it eats the baked "Total:". OWNER FOLLOW-UP: the tree
  layout is FULL-PACK ONLY — an own-label order covers the left block
  (patch 126,158,706x470) and the row list becomes ONE live row
  (Marketing Assets $9) + T&C + carousel + total.
- ROUND 49 (owner, 14 items, 2026-09-12): (1) vision GEO intro names
  the real button — "გამაკვირვე". (2) VARIATIONS EMAIL GATE: the
  Create-Variations buttons never disappear; first run free, any
  later run opens a modal (white scrim + 460×188 bordered box) asking
  for an email — format-validated, kept in localStorage
  (nui-var-email) and never re-asked; a re-run replaces slots 3..5
  and resets a selection pointing there; pager dots moved to y541 so
  buttons+pager coexist. REAL send-a-code verification needs an email
  provider (Resend etc.) — requestVariations/submitVarEmail is the
  plug-in point. (3) compliance subtitle loses "all"/"ყველა" in both
  languages (EN swapped at fetch, SVG_GE key renamed to match).
  (4) NO closure picked (own-label reset) also freezes the wheel
  block. (5) GEO "ხრახნიანი" (was ხრახნიანი თავსახური). (6) result
  rect DELETED; the lightness capsule is HORIZONTAL under the wheel
  (white left → black right, 136.64×15 at rel y157), wheel+bar share
  the column centre axis 1206.5. (7) Glossy is row 2 under Matte via
  the standard optRow. (8) own-label 2×2 thumbs are 145px — the
  block is EXACTLY hero-height (2·145+10=300), all gaps 10, group
  (610) centered. (9) engine grapeLine(): grapes in any lifestyle
  scene must match the wine colour family (red wine never with
  green/white grapes). (10) scene-repeat control: diversity
  threshold 0.55→0.35 AND each lifestyle prompt now lists what the
  other 4 images show ("SERIES — NON-NEGOTIABLE … must read clearly
  different"). (11) miniGlass 22→18 everywhere. (12) dashed divider
  between the two product shots (x273, hero-height y294..594, never
  touches the frame). (13) GEO Crown Cap = "გვირგვინი". (14) wax
  seal prompt: 5–7 mm chunky hand-dipped bulk, explicitly never
  foil/aluminium/metal. BONUS FIX: closure "No Capsule" fell into
  closureLine's default (cork+capsule!) — now takes the bare-mouth
  branch.
- ROUND 48 (owner, 7 items, 2026-09-12): (1) GEO declension:
  "თანამედროვეს ვარიაციები". (2) select radios say ONLY
  "Select"/"აირჩიე" — no style names, no variation numbers (UI_GE
  "Select" retranslated). (3) BOTTLE PAGE REBUILT as FIVE live
  columns: the baked 4-column chrome is stripped at fetch (regex
  removes the 3 dividers + 6 corner crosses by coordinate; content
  white-patched) and redrawn at a 191.9px rhythm with the baked
  proportions (header baseline 217.7 = col+35.2, ring cx col+43.2,
  text col+62.2, pitch 29.8; COLS_X 342.86/534.78/726.7/918.62/
  1110.54; parallax slices follow). NEW "Wine Color" column first
  (Red/White/Amber/Rosé) — generated flow preselects it from the
  front label's Colour field (EN+GEO wording matched, default Red),
  feeds the assets brief (wine.colour) and the run signature.
  "No cap" left the finish row and became closure type "No Capsule"
  (always last in the list); selecting it GREYS AND FREEZES the
  wheel+capsule+result bar (opacity .3, grayscale, inert) and the
  finish pick is no longer required. (4) own-label upload
  confirmation is GREEN (#3f6d2a) like every other ✓. (5) uploading
  an own label UNSELECTS every section (bottleTouched blocks the
  auto-suggest refill); the bottle next-arrow gates until every
  section has a pick ("Pick an option in every section to continue",
  red, y630); a fresh generation restores defaults. (6) own-label
  assets: the 4 thumbs ride 2×2 beside the hero (top flush with the
  hero top, every gap = 10, group centered in the right two-thirds).
  (7) Marketing Assets $19 → $9 (own-label pack totals $9).
- ROUND 47 (owner's New_Progressbar folder, 6 annotated screenshots
  2026-09-12): (1) NEW FUNCTION — "Upload Another Label" on the
  bottle page (underlined text under the bottle drawing): a customer
  who ALREADY has printed labels uploads one and the flow flips to
  assets-only mode — the upload rides the bottle preview (110mm wide,
  height from the image's own aspect), the marketing run uses it as
  the front label with back:null (engine already skips the back shot)
  and NO product-page publish, the assets board splits into vertical
  THIRDS (front shot centered in the first, image group centered in
  the merged right two-thirds, headers "Product Shot / Face" + "Five
  Marketing Images"), and the final pack preselects ONLY Marketing
  Assets ($19) with just 6 carousel slides. Without an upload NOTHING
  changes; a fresh label generation clears the mode. (2) assets hero
  is a SQUARE (300) that never crops (contain); the 4 thumbs scale to
  67.5 so their 10px gaps equal the hero↔strip gap; hero+strip ride
  as ONE group centered in their area, strip bottom flush with hero
  bottom. (3) "Creating your marketing assets — …" moved from the
  Landing-Page column to page-center just above the progress line
  (y634). (4) checkout: Product_Page browser thumb downsized to 340
  and centered in the frame; carousel arrows are SVG chevrons twice
  the old glyph size with the progress bar's 3px stroke; filename
  caption pulled 10px up. (5) options: "Variations are limited…"
  subtitle deletes itself once a variations run starts (!varStyle);
  the three Select radio labels ride ONE explicit baseline (real
  ascent+descent line-height + metric translate, baseline 17px from
  row top) — kills Safari's per-column baseline drift the owner
  circled, text optically on the circle's line. (6) front details
  page: baked title string-replaced to "FRONT LABEL DETAILS" at fetch
  time (SVG_GE gets the Mtavruli "…ᲓᲔᲢᲐᲚᲔᲑᲘ" key), and the two-line
  intro paragraph is deleted (white patch keeps covering the baked
  one).
- ROUND 46 (owner's New_Progressbar folder, 12 annotated refinement
  screenshots on the Round-45 build): (1) "Red line must grow in
  thirds" — THICK now splits every dot-to-dot segment EVENLY by its
  page count: front 270.49 / vision 398.93 (segment 1 thirds),
  backdetails 655.79 / compliance 784.23 (segment 2 thirds), bottle
  1108.04 (segment 3 half). (2) assets: red line AND thin baseline
  end flush with the last circle's right edge (1302.86 = 1297.96 +
  4.9) — "line and circle right edge must be aligned". (3) loader:
  back arrow HIDDEN (green X on mock; forward was already hidden)
  and the "15–35 seconds" note becomes a REAL measured average —
  nextFromFront stores each successful set's duration in
  localStorage 'nui-gen-secs' (last 10), the loader note averages
  them ("usually takes about {N} seconds."), falls back to 15–35
  until a first run exists. (4) options radios REBUILT: filled
  circle follows the selected IMAGE by index (selected === base+fi;
  owner's bug: middle label selected but wrong circle filled —
  style-based marking broke on variations where all 3 share one
  style); ring (15px, 2px border) + label ride ONE centered flex
  row per column (owner: "center", "push a bit up to be on the same
  line as circle"); variations page labels are numbered "Select
  {Style} 1/2/3"; clicking selects within the CURRENT page, no
  auto-flip to page 1. (5) variations loading placeholders take the
  varied style's real label shape (imgDims of that style's first
  label, form-dims fallback) instead of a generic square. (6)
  assets columns: ONE outer dashed frame + single vertical dashed
  dividers at x 410/846 ("one line, not two"), crosses on the
  divider ends; hero+thumb group centered in col 2 (hero x 449,
  thumbs x 733); landing preview centered in col 3 (866.5, 318.5).
  Verified with mock-provider Playwright flow (thirds on every
  page, index radios both pages, numbered variation labels,
  real-shape placeholders, single dividers, loader without arrows).
- ROUND 45 (owner's New_Progressbar mock folder — MAJOR redesign,
  4 answers confirmed): (1) PAGE ORDER CHANGED: front (details)
  FIRST, Your Vision second — generation fires from vision's next;
  welcome→front is the full slide; goBack skips loader to vision.
  (2) NEW BAR: 4 dots (unlabeled RED start + Front Label/Back Label/
  Marketing Assets at the old big-dot positions, labels bold under
  dots, MA right-aligned); red (#BA141A) continuous line grows page
  by page (THICK per page), station dots fill red per STEP_OF;
  forward arrow RED and HIDDEN on the loader; welcome's baked arrow
  covered and redrawn red (flying copy too); checkout has no bar.
  (3) vision: black buttons "Upload a sketch or a photo (Optional)"
  + "Surprise me" (always cycles ideas); baked idea button covered.
  (4) VARIATIONS (one-shot per label set): under each option a black
  "Create {Style} Variations" button — clicking generates 3 MORE
  dreams of that style (dream-label API, style LOWERCASE — capital
  fell through to "free"!), stored at dreams[3..5]; buttons vanish
  forever, two pager dots appear (First Labels ⟷ Variations page,
  header "{Style} — Variations" right-aligned); mini glasses fill
  slots while rendering; click-to-select works on both pages; Select
  {Style} radios select the style's first label; imgDims effect now
  skips holes (variation slots fill one by one). (5) backdetails:
  "Wine Description" is the textarea PLACEHOLDER, baked heading
  covered. (6) ASSETS "New layout": three headed columns — two tall
  shots · hero + vertical 4-thumb strip (thumbs swap into hero) ·
  BIG landing browser (416px, moved from checkout) with glass
  loader. (7) CHECKOUT "New layout": ‹ › CAROUSEL of all 10
  deliverables (filename captions, missing → routed grey
  placeholders), 4 pricing rows ("1 Hour session with human designer
  $49" replaces designer-$99), Total, black "Pay & Download" (agree
  checkbox dropped per mock). PACK renamed accordingly.
- ROUND 44 (owner, 3 items): (1) "No compliance needed" starts at the
  flag column (x 557.2, where the China flag above begins) and is
  BOLD like the country names. (2) cap-colour overlay vanished after
  leaving/returning to the bottle page — during a slide the canvas
  ref binds to a transient strip copy, and the SETTLED canvas (a new
  element) was never repainted; `prev` added to the paint effect's
  deps so settling triggers a repaint (verified: identical saturated
  pixel count before/after a bar round-trip). (3) "Copied ✓" renders
  in the confirmation green (#3f6d2a).
- ROUND 43 (owner, 3 items + mid-turn): (1) CAP_ZONES Screw Cap
  length was 0-0.055 (far shorter than Cork's 0.005-0.145) — matched
  to Cork's span. (2) No-compliance ring used r:9 (the bottle page's
  size) instead of matching the flag rows' own r:7.5 — fixed,
  verified pixel-identical to the EU/Japan rings. (3) ROOT CAUSE of
  the recurring "shows the previous bottle" bug: the round-28b
  restore-from-localStorage effect ran unconditionally at mount, so
  a brand-new session inherited the LAST session's published
  productUrl — and nothing ever cleared it until a fresh publish
  happened. Now setDreams(ok) (a genuinely NEW generation) resets
  productUrl, mints a fresh productCode, and clears the localStorage
  key — an old link can no longer leak into a new wine's checkout.
  Mid-turn: "Copy the link" used a bare try/catch around the ASYNC
  clipboard promise (never actually caught a rejection) and gave no
  feedback either way — now .then/.catch with a textarea/execCommand
  fallback and a visible "Copied ✓" (2s) confirmation.
- ROUND 42 (owner, 8th circles escalation — FINAL LAW): selection
  circles are NEVER a mix of baked art + covers + live dots again.
  On the bottle page (all four columns + Matte/Glossy) and the
  No-compliance row, dotBtn now COVERS the baked ring with white
  (cover:26/22) and draws OUR OWN ring (2px #111, r 9) + the 7.5px
  dot — both centred by the same 50%/50% transform, concentric BY
  CONSTRUCTION. The compliance flag rows keep their baked vector
  rings (those were always right). "No cap" keeps its baked ⊘ icon.
  No-compliance now TOGGLES OFF on a second click. Also fixed:
  round 41 #6 had made the whole assets small-thumb node conditional
  on the image — placeholder + loader glass had vanished; the thumb
  is always rendered, only the hero-swap CLICK needs the image.
- ROUND 41 (owner 2026-09-09, 19 items): (1) lifestyle prompt: WINE
  COLOUR NON-NEGOTIABLE — wine in glasses/pours matches the label's
  wine (glassWineShade). (2) bar semantics: on intermediate pages
  (loader/options/backdesign) the THICK line already reaches the
  NEXT station's dot, the dot fills only on arrival; dashed outlines
  sit EXACTLY on label edges. (3) bottle option WORDS select too
  (ghost buttons beside every circle incl finish). (4) placeholders
  lost the diagonal. (5/11/18) grey placeholders are CLICKABLE and
  routed: "Create a front label first"→vision (options empty, assets
  idle thumbs, checkout front/shots/context/landing), "Create a back
  label first"→backdetails (backdesign empty, checkout back slot);
  12px subtitle size. (6) assets small thumbs clickable only when
  the image exists. (7) assets status messages italic. (8) bottle
  silhouette shows a grey label placeholder at true position/default
  size when nothing selected. (9) compliance gained "No compliance
  needed" (ring at the old Arabic-Markets slot 536.4/509.89, ON by
  default; picking a market clears it, clearing all markets restores
  it; next allowed with empty markets). (10) bar DOTS clickable.
  (12) 8K logo → welcome. (13) old-bar flash on Download fixed: the
  white bar zone stays while sliding INTO checkout, covering the
  outgoing board's baked old bar. (14) small checkout thumbs carry
  no message. (15) QR-note price lines removed (EN+GE). (16) bottle
  dots nudged +0.42/+0.5px to the MEASURED baked ring centres.
  (17) loader glasses rise in visible STEPS (active +4.5%/2.5s,
  waiting +3%/4s) — never look stuck. (18) checkout landing slot
  shows the product preview ONLY when this session has a label
  (stale restored page hidden); QR now 25.1px on the small-thumb
  line; "Copy the link" (clipboard) bottom-right aligned. (19) ONE
  dash style everywhere — 4.12/4.12 px 1px #000 (the final-pack slot
  dashes are the sample): DASH const + dashedBox helper + pricing
  rows converted.
- ROUND 40 (owner 2026-09-09, mega-round; ProgressBarModifications
  mock + 9 items + 20% scale): (1) SEVEN-STAGE progress bar — Front
  Label(vision) · Details(front) · Back Label(backdetails) · Market
  Compliance(compliance) · Bottle(bottle) · Marketing Assets(assets)
  · Download(checkout); flow UNCHANGED (owner: "nothing in the flow
  changes!!!"); big dots+bold labels for main stations, small+regular
  for sub-stations; CIRCLE_X evenly spaced 142.06→1297.96; hit zones
  120/170px so neighbours never overlap (260px overlapped and
  Download stole Marketing Assets' clicks). (2) Edit button on
  backdesign pulled DOWN to (548.6,589,341.4) per mock; dashed
  outline (1px dashed, 10px offset) around the back-label preview.
  (3) ALL stages CLICKABLE → go(page); barJumped ref: a bar jump
  NEVER auto-generates — assets effect returns early, thumbs show
  grey "Not yet created" + darker diagonal (notMade helper; also
  checkout's empty slots + assets-page idle placeholders). Arrows
  clear the flag; the run starts only via bottle→next. (4) dashed
  outline round selected label (options, outlineOffset 6). (5)
  groundOf: per-channel medians could blend mixed edges into a
  nowhere-colour — now quantised DOMINANT edge colour (16-level bins,
  averaged within the winning bin). (6) SUBJECT-FIDELITY dream rule
  (vision-aware, built in assembleDreamRules): abstract stories stay
  fully non-figurative; concrete stories never gain unrequested
  landmarks (a château appeared inside "abstract splashes"). (7)
  loader block (glass/phrase/dots/note + cover patch) 26px up —
  centred between header and footer. (8) covered by (4). (9) scene
  DIVERSITY deal — greedy pick skips candidates >0.55 token-overlap
  with already-picked scenes (two grape-pile scenes in one set).
  SCALE: whole wizard at 80% — one uniform transform (scale*0.8),
  full-width band stripes (black header/white content) behind the
  centred artboard; TRAP: classic css caps main at max-width 1180 —
  the wizard main now carries maxWidth:none/width:100% inline.
- ROUND 39 (owner 2026-09-09): MAGNIFICATION REMOVED wizard-wide —
  the lightbox gallery (state + overlay) is deleted from page.tsx.
  Options page: clicking a LABEL IMAGE now SELECTS it (same as its
  Select button). Assets page: images are static; the small-thumb →
  hero SWAP ghost buttons stay. Backdesign + final pack: all images
  static, no zoom cursors. The PUBLIC product page (/p) keeps its
  gallery lightbox — that one is the owner's spec for customers.
- ROUND 38 (owner 2026-09-09, 3 items — bottle page): (1) CROWN-CAP
  BOTTLES: burgundy-crown.jpg + alsace-rhine-crown.jpg in
  public/newui/bottles (owner's drawings); the Crown Cap closure
  option exists ONLY for Burgundy/Sparkling/Alsace (CROWN_TYPES) —
  hidden + baked row patched otherwise, closure resets to Cork when
  the type leaves the trio; the wizard shows the -crown drawing and
  marketing bottleShapeRef sends it as the silhouette spec.
  (2) LABEL-ON-SILHOUETTE PREVIEW: the selected front label renders
  FLAT on the bottle drawing at its true position and scale —
  LABEL_ANCHOR (same values as the engine's LABEL_POS, duplicated
  client-side) + real mm sizes on a 30cm bottle (Alsace 35). The
  drawing is pixel-scanned once per variant (bottleScans ref: bbox +
  per-row silhouette spans). (3) COLOUR-WHEEL CAP OVERLAY: a canvas
  over the drawing paints the closure zone in the picked colour
  INSIDE the scanned silhouette, mix-blend multiply so the line art
  reads through (exactly the owner's Cap_reference look). CAP_ZONES
  fractions: capsule 0.5-14.5% + sparkling 0-50.5% measured from the
  references; screw/wax/crown derived. "No cap" finish → no overlay.
- ROUND 37 (owner 2026-09-09, 4 items): (1) sparkling auto-select on
  the bottle page detects GEORGIAN wording too (ცქრიალა/შამპან/
  პროსეკო + GEO terms for ice wine/alsace/burgundy) — the round 17
  mechanism existed but only spoke English. (2) SPARKLING CORK
  anatomy fixed in the closure prompt: with a foil hood the wire cage
  lives ENTIRELY UNDER the foil (soft embossed relief at most, no
  wire ever pokes through); "No cap" finish → bare muselet with cap
  plate, fully visible (the top-level no-cap guard now special-cases
  sparkling). (3) dream verdicts are UNDOABLE: feedback POST returns
  the row id, the studio card shows "undo" next to ✓/✗ recorded —
  deletes the row and re-opens the verdict buttons. (4) DELETING A
  REFERENCE KILLS ITS DERIVATIVES: style-refs deleteRef also removes
  the ref's style card from styleProfiles AND its locked palette
  (card-palettes map.<id>); dream-refs DELETE removes the ref's
  composition card from dream-cards-<style>. Charters refresh on the
  next Analyze (board-level, not per-ref).
- ROUND 36 (owner GO: RULES UNIFICATION): the full map first — FIVE
  owner-editable stores existed: dream-rules (ACTIVE, dreams),
  image-rules aka settings image-hard-rules (ACTIVE: dreams' art +
  playground — but editable ONLY from the frozen legacy admin!),
  config-store (classic engine + playground art direction — yet its
  editor sat in the ACTIVE Rules tab), layout-rules + hard-rules
  (classic, frozen). THE FIX, no semantic changes: the active Rules
  tab now holds THREE clearly-scoped editors — (1) Dream rules
  (label design laws, as before); (2) NEW IllustrationRulesCard
  editing image-rules (global + per-style) with an honest note that
  text/white-bg lines are filtered out of labels; (3) NEW Marketing
  rules (settings marketing-rules, one line each) — appended to BOTH
  shot and lifestyle prompts as "HOUSE RULES", hashed into the assets
  cache sig (charters loader now returns {life,shots,scenes,rules}).
  ArtDirectionTab (config editor) MOVED into the Image Play tab where
  its rules actually apply; the hard-rules info card is labelled
  "classic engine (frozen)". Scope purity guaranteed: each store
  kept its exact consumers — nothing crosses over.
- ROUND 35 (owner GO on cleanup items 1-3+5; rules-unification #4
  APPROVED but deferred to its own careful round): (1) illustration
  cards FORCE re-derived with the round-32 analyst (owner confirmed
  no meaningful hand edits): traditional 5 / contemporary 12 / punk
  14 — concrete technique language now ("burin-style strokes",
  "stochastic halftone", "1-4mm contour"). (2) dream studio got a
  QUIET saved-comments manager: "saved comments (N)" underline link
  under the dream controls → compact list (date · style · ✓/✗ ·
  text · ✕ delete); GET now ships row ids, DELETE /api/admin/
  dream-feedback?id= removes one. Comments do NOT expire — owner
  curates by hand. (3) dead branches deleted: migrate-3-styles,
  proof-feedback, font-case routes; "minimalist" removed from the
  ACTIVE dream lists + STYLE_MOOD (classic catalog untouched).
  IMPORTANT NON-DELETION: flux/fal turned out ALIVE — FAL_KEY is
  set, trained LoRAs exist in settings (fal-loras), and the dream
  REBUILD's craft pass calls restyleWithFlux with the style's LoRA
  preset (silent fallback when absent). Do NOT delete without a
  separate owner decision. (5) CLASSIC INTERFACE IS FROZEN (owner:
  "we won't return to it") — no new work, parity gates only matter
  if classic files are touched.
- ROUND 33 (owner: "at loader end the previous page's elements flash
  and slide away"): STALE-CLOSURE BUG in go(). nextFromFront captures
  go() while page==="front", generates for ~25s, then calls
  go("options") — the stale closure still read page="front", so
  setPrev("front") replayed the FRONT FORM as the exiting layer (and
  skipped the loader's fade-out + the outBase delay). FIX: the
  current page lives in pageNow (a ref go() reads at call time,
  never from its birth render); go() also ignores same-page calls;
  the ?page= dev-aid syncs the ref. Reproduced with IMAGE_PROVIDER=
  mock frame-bursts before, verified clean after: loader fades on
  white, THEN labels slide in. Trap for the future: any ASYNC flow
  that navigates twice must not trust closure state.
- ROUND 32 (owner: "reference analysis texts are mediocre → bad
  results"; GO on items 1-4, closed-loop #5 deferred): REFS-QUALITY
  REWORK. New shared analyst `src/lib/admin/vision.ts`: analystChat()
  (default model gpt-5.1 via OPENAI_VISION_MODEL, AUTO-FALLBACK to
  gpt-4o on 400/404; optional Claude analyst via ANALYST_PROVIDER=
  claude + ANTHROPIC_API_KEY), parseAnalystJSON(), pool(). The old
  sixteen-images-into-one-call-110-words compression is DEAD in both
  batched analyzers: (a) marketing-refs — per-image structured
  questionnaire (scene/setting/action/people/props/light/palette/
  composition/texture/era; shots variant: lighting/highlights/glass/
  grading/sharpness/camera) → synthesis charter (names distinct
  directions) + scenes come straight from per-image scene fields +
  "Exact board palette (measured): #…" appended from CODE pixel
  clustering (card-palette extractor, never hallucinated);
  (b) dream-refs — per-image layout questionnaire → synthesis
  doctrine with a REAL per-image Grounds line; composition cards now
  ride analystChat too. (c) style-refs cards (already per-image +
  code palettes) just switched brains — visionJSON delegates to
  analystChat; hand-edited cards still kept (no force). All six
  boards re-derived; charters now name concrete worlds ("Floor-Level
  Hi-Fi Lounge", "Monastic Object Altar") instead of stock prose.
  Deferred by owner: #5 closed-loop probe-compare-refine.
- ROUND 31b (owner clarification, SUPERSEDES the round 30/31
  orientation rule): the bottle may be in ANY pose — vertical was
  never the point. THE REAL RULE: the label sits ON THE BOTTLE'S
  AXIS — applied like a real glued label (label's vertical axis =
  bottle's base→neck axis), moving WITH the bottle in every pose;
  never rotated 90° on the glass, never sideways relative to the
  bottle. One clause now serves both board and generic scenes;
  the shot prompt carries a short version too (its "perfectly
  upright" stays — studio cutouts are upright by nature).
- ROUND 31 (owner, 4th refs escalation: "images look NOTHING like the
  references"): ROOT CAUSE was STRUCTURAL, not prompt wording — the
  five lifestyle scenes always came from our own fixed generic
  scenario list (sommelier/pour/grapes/cellar/…); the charter only
  coloured them, so the boards' actual stories could never appear.
  NOW: analyze also distills EACH board image into one concrete SCENE
  (setting, story/action, props, light, framing — 25-45 words, brand/
  label/faces banned) → settings marketing-scenes-<style> (re-derived
  on every analyze, no edit-lock). dealScenarios(seed, boardScenes)
  deals the 5 lifestyle images FROM THE BOARD when scenes exist
  (cycling if fewer than 5); the generic list is only the no-board
  fallback. Board-led prompts: scene leads ("RECREATE its setting,
  story, action… with THIS bottle as the hero"), STYLE_WORLD is
  DROPPED, charter stays as art direction. ORIENTATION conflict
  resolved openly: board scenes may pose the bottle as the reference
  shows (even lying) but the LABEL must always read correctly;
  generic scenes keep the strict upright rule. Cache sig + dryRun
  carry scenes (fromBoard flag). All three boards re-derived
  (traditional 10 / contemporary 13 / punk 9 scenes); the
  owner-disliked frozen traditional charter ("Command new scenes
  capturing contrasts") was UNLOCKED (editedAt cleared) and
  re-derived fresh.
- ROUND 30 (owner 2026-09-08, 6 items): (1) BACK-LABEL INK RULE
  (standing): ground darker than 50% grey (luma<128) → ALL layout ink
  (texts, rules, By-brand row) flips WHITE via one <g fill> wrapper;
  the codes band below y61.5 is always white and its ink stays black.
  (2) sparkling.jpg replaced with the owner's new image (same 800×1600
  — feeds both the wizard bottle page AND bottleShapeRef). (3) prompts:
  ORIENTATION — NON-NEGOTIABLE in lifestyle (bottle upright, label
  reads horizontal; pour may tilt, never flat) + "PERFECTLY UPRIGHT"
  in shots — a lifestyle came out horizontal with a sideways label.
  (4) shots: label applied EDGE-TO-EDGE — never white slivers above/
  below the label, never a border. (5) slot-5 thumb: while the iframe
  loads, the mini wine glass (living-loader fill, 700ms ticks
  0.14→0.9) sits centred in the browser frame on white; onLoad hides
  it; resets when productUrl changes. (6) final-pack titles lost their
  numbers ("Front label"…) — slot-1 heading is live, slots 2-5 edited
  in checkout.svg tspans, SVG_GE keys renamed to match.
  NOTE: NOT on Vercel — the app runs as a local `npm run start` on
  :3000; hosting/domain decision still pending.
- ROUND 29 (owner 2026-09-08, 7 items): (1+7) GTIN checksum was
  rejecting random test numbers → ANY 12/13-digit number is now
  accepted and drawn; only the final check digit is auto-corrected so
  the printed EAN scans. Hints: "✓ barcode will be drawn" / "needs 12
  or 13 digits". (2) LABEL POSITIONING per owner's charts (WAIN/
  Bottle types/Label positioning — black zone per outline, measured by
  script): TOP-anchored (label hangs DOWN from the zone's top line):
  Bordeaux 42.3%, Prestige 43.3%, Ice Wine 38.6% of bottle height;
  BOTTOM-anchored (built UP from the zone's bottom line): Burgundy
  9.3%, Sparkling 7.9%, Alsace/Rhine 6.6% above base. engine
  LABEL_POS + placementLine() convert pct→cm with each spec's height
  and ride in bottleDescription (shots AND lifestyle); the generic
  "label sits LOW" line is gone. (3) WAX SEAL spec: MEDIUM height
  (mouth + upper third of neck), substantial 2–3mm coat that ROUNDS
  the glass tip's edges, clean slightly-uneven lower edge, no drips.
  (4) CROWN CAP described as the pressed-steel beer-bottle cap
  (crimped ~21-flute skirt, flat top) — model kept missing it.
  (5) ONE LIGHT rule: label lit exactly as the glass — one object,
  never a pasted graphic (shots + lifestyle). (6) NO PAPER TEXTURE on
  labels in generated images — smooth flat print, subtle sheen only;
  contextual scene textures stay fine. Items 3-6 are STANDING RULES.
- ROUND 28b (owner: "landing page on final pack didn't load"): the
  publish WORKED (Mongo had the docs) — but productUrl lived only in
  React state, so any reload/server-restart made slot 5 forget the
  page forever (productCode is random per session). FIX: on publish
  the code is saved to localStorage 'nui-product-code'; on mount it
  is restored, RE-VERIFIED via GET /api/product, and only then shown
  — the same code is also reused for future publishes (one page per
  browser until real accounts exist). &pp= dev-aid skips the restore.
  Contributing cause (again): prod restarts while the owner tests.
- ROUND 28 (owner 2026-09-08, 5 items): (1) "Barcode:" label (700 15px,
  matching the baked st3 form labels) before the GTIN input; input
  moved to x252 — the GEORGIAN label is ~40px wider and must never
  touch the placeholder; the checksum hint moved BELOW the input line
  (252, 518). (2) Upload Ingredients is no longer a button — an
  underlined 13px text line one EMPTY row under the QR paragraph
  (per-language y: 557.83 + (lines+1)*18). (3) TRANSITION GHOST FIX,
  both wizard and product page: each slice's inner full-page div is
  now OPAQUE WHITE — an arriving slice covers the outgoing page the
  moment it lands. Root cause: compliance's late-delay exit rows
  (delay 270 + 650ms) outlived the incoming slides and floated over
  the settled page through the transparent background; opacity also
  kills text-over-text mid-flight. (4) checkout.svg: the baked slot-5
  mock (browser bar rect, PRODUCER/INGREDIENTS/GALLERY words, mock
  codes-band texts PRODUCT OF GEORGIA / WWW.POPIASHVILI.COM /
  BOTLLED/LOT/ALC line, mock QR square) DELETED from the board —
  the live browser preview + QR + link render there now. (5) product
  page rebuilt on wizard chrome logic: STATIC live header and STATIC
  progress bar (thick segment width-animates DOT_X[0]→DOT_X[idx],
  dots fill with transition, arrows are live svg buttons hidden at
  the ends); only the 68.57→740 content zone slides in 3 strips.
- ROUND 27 (owner 2026-09-08, HONEST BARCODE): the "Create Barcode"
  button invented random digits — a lie a scanner can't forgive, and
  GS1 GTINs must be registered to the BRAND owner (the winery), not
  to 8K, or Amazon/chains/export validation rejects them. NEW RULE:
  we never sell/invent barcodes. Back-details barcode side is now a
  single underlined GTIN INPUT (baked button rects covered white):
  the winery types its own GS1 number, live checksum validation
  (12-digit UPC normalised with leading 0, 13-digit EAN checked;
  green "✓ valid GTIN" / dark-red hint), plus a deliberately QUIET
  grey 11px italic link "No GTIN yet? Register at gs1.org" under the
  note (owner: don't disturb the design). composeBackLabel draws the
  EAN-13 ONLY from real digits (barcodeDigits) — no GTIN, no barcode
  (empty-fields-disappear law); random-digit fallback is dead at
  render. Checkout: Barcode $99 row REMOVED — 4 rows, 3 dashes,
  packSel is now boolean[4] (labels/QR/assets/designer), default
  total $247. Placeholder E.g. 4860012345676 is a real valid
  Georgian-prefix GTIN. i18n: dead barcode keys dropped, three new
  GTIN strings added. Upload-barcode-image UI removed (lib still
  accepts barcodeImage for legacy payloads).
- ROUND 26 (owner 2026-09-08, 4 items): (1)+(bis) barcode note was
  baked larger than the QR note in BOTH languages — covered
  (patch 136,542,440,66) and re-rendered live at the same 13px with
  the $99 price line, EN 4 lines / GEO 3 lines. (2) assets loader
  headline GEO: "თქვენი სამარკეტინგო მასალა მუშავდება". (3) PRODUCT
  PAGE BUILT from WAIN/NEW UI/Product Page (3 artboards → chrome-only
  boards in public/newui/product/{about,ingredients,gallery}.svg —
  <text> AND all 170 outlined-glyph <path>s stripped; chrome is pure
  line/circle/rect/polyline, each board bakes its own active dot +
  arrow state). /p/[code] (force-dynamic, Mongo products collection)
  renders the snapshot POSTed by the wizard to /api/product at the
  moment the marketing assets finish when Create QR is on: 20 wine
  fields, description, ingredients (placeholder nutrition rows until
  the upload feeds it), front/back shots, 5 lifestyle images in the
  artboard mosaic (409.6 big + 4× 204.8) with a lightbox. Sections
  slide with the wizard's 3-band parallax. TRAPS FOUND: (a) NEVER use
  a <main> tag on new pages — configurator.css styles main with
  padding 44px 40px 100px and shifts every hit zone (use a div);
  (b) HNW's font bounding box is ~1.66× the font size — an
  overflow:hidden span tighter than that clips text AT THE BASELINE
  and eats underlines (value rows use height 26 for 15px text).
  (4) sections navigate by arrows AND clicks on the progress-bar
  words (ghost buttons over the baked words at y788.56).
  Checkout slot 5 (per the owner's reference screenshot): browser
  frame at (1112,273,178×116) — traffic lights + URL pill — with the
  LIVE product page in a 0.1236-scaled iframe, soft drop shadow, the
  /api/qr PNG (margin 0) at (1112,399,36) and the italic underlined
  link below. Dev aids: /?page=checkout&pp=<code> previews slot 5
  without a paid run; POST /api/product seeds a test page (demotest1
  exists). QR still encodes placeholder domain 8klabels.com — decide
  the real domain BEFORE any customer prints.
- ROUND 24 (owner 2026-09-07, 7 items): (1) GEO page titles in
  MTAVRULI — HNW has ZERO Georgian capitals, but Apple's system
  Helvetica Neue has all 43, so board CSS font stacks gain
  ',Helvetica Neue' (board processing) and title dict values use
  U+1C90 codepoints (deploy note: non-Mac servers need a Mtavruli
  fallback). (2) idea button is a live styled button flipping to
  "Next idea"/"შემდეგი იდეა" (ideaN state). (3) GEO QR note = owner's
  2 lines, price $29 both languages. (7) barcode price $99 both
  languages. (4) loader: phrase / dots row (y520) / stay-note (y548).
  (5) mini glasses 22px. (6) REFERENCES-NO-INFLUENCE ROOT CAUSE
  (third escalation): the pipeline was PROVEN fine via the new
  dryRun mode (POST marketing-assets {dryRun:true} returns charter
  sizes + prompt head; engine logs [marketing] charter lengths) — the
  CHARTERS THEMSELVES were generic (the analyst distilled the boards
  into stock wine-photo language ≈ the default output). Analyst
  rewritten (stock vocabulary banned, concrete palettes/settings/
  light/era demanded — the dream-charter medicine) and all three
  boards re-derived (punk needed its editedAt lock cleared — a Save
  click had frozen it). New charters are distinctive; sig change
  busts old caches.
- ROUND 22 (owner 2026-09-07, 13 GEO refinements): reworded vision
  intro/upload button/front intro/loader note (საშუალოდ 30 წამი);
  placeholders stay ENGLISH in GEO (entries dropped); Ice Wine →
  აისვაინი, Matte → გლუვი; barcode note GE folds "GTIN შტრიხკოდის
  ფასი - $100." into line 3 (EN gets a live 4th line); the QR NOTE IS
  OUTLINED in the artboard — covered + rendered live in both langs
  incl. "Price of a QR Code & Product Web Page - $50."; Glossy's
  ring+text moved right (baked pair covered, live span) so the ring
  clears გლუვი; header menu + ENG/GEO = ONE baseline-aligned flex row,
  even 44px gaps, right edge on the progress line's right edge x1303;
  step labels: first left at margin, middle two CENTRED on their
  circles, შეკვეთა right-aligned to x1303. TRAP: translateSvg needed a
  FUNCTION replacer — "$100" in a replacement string ate "$1" as a
  backreference.
- ENG/GEO (owner 2026-09-07): full Georgian translation. The switch
  sits after Contact in the static header (pickLang + localStorage
  'nui-lang'). TWO dictionaries in src/app/newui-i18n.ts: SVG_GE swaps
  the artboards' live <tspan> strings in place (translateSvg runs at
  fetch → boardsGe cache; keys must match SOURCE encoding — &amp;,
  &apos;, curly ’), UI_GE covers every HTML overlay via t() (t
  consults UI_GE then SVG_GE). The owner's HNW files carry the full
  Mkhedruli set — Georgian renders in the real font (Georgian is
  unicameral: caps rows just render Mkhedruli). Fitted translations:
  UK → დიდი ბრიტანეთი, Region/Special → წარმოშობა:/მინაწერი: (long
  labels hit the input column). TRAPS: checkout slot-1 heading is
  OUTLINED in the artboard (not live text) — covered + re-rendered
  live in both languages; page.tsx local `const t` (loader creep)
  renamed `el` to free the t() name; front intro patch widened to 700
  (translated baked line ran past the old cover).
- ROUND 21 (owner 2026-09-07, 8 items): (1) loader-exit glitch — the
  fading loader showed through the staggered incoming slices; leaving
  the loader now fades it out on clean white FIRST (outBase = FADE_MS
  −40 added to incoming slice delays; go() timeout extended when
  page==='loader'). (2) options Select buttons one height lower
  (y582.9; warn to 632). (3) mini glasses 18px. (4) red wine hides the
  punt (opaque base clause; light wines show it subtly). (5) product
  shots: LABEL PLACEMENT clause — label low on the body, never at the
  shoulders (marketing images untouched). (6) wax seal = smooth even
  edge, NO drips. (7) references STILL replayed: the WIZARD's
  client-side "same inputs" skip predates charters — removed; the
  charter-aware server cache answers true duplicates instantly.
  (8) Bordeaux Prestige spec = subtly TAPERED sides (never parallel);
  standard Bordeaux = perfectly parallel sides.
- DEMO FILL RESTORED (owner 2026-09-07, testing speed): empty fields
  fall back to sample content in GENERATED results again — DEMO_FRONT
  in page.tsx (front dreams, back payload, assets brief) and the
  back-label sample set in composeBackLabel (v5 split fields incl.
  producer/importer company+address). Forms stay empty; SWITCH OFF
  BEFORE LAUNCH (like DEMO_FILL in the classic shell).
- ROUND 19 (owner 2026-09-07): (1) CACHE BUG — the marketing-assets
  cache signature ignored charters, so freshly analyzed reference
  boards replayed OLD images verbatim; loadMarketingCharters() is now
  hashed into the signature (route) and passed into the engine, and
  the lifestyle charter LEADS the prompt ("ART DIRECTION — follow
  CLOSELY … overrides the generic defaults") instead of trailing the
  style world. (2) LOADER MOVEMENT EVERYWHERE: label loader creep was
  sub-pixel (0.3/60s) — now 1.2%/s for 25s then a trickle to 0.45,
  MONOTONIC via fillMax ref (creep reset on a real jump could lower
  the level); assets waiting-glass crawl 0.6%/s to 0.5. Glasses 15px
  (top edge kept via marginTop 2), dots 16.5px. (3) ONE-LABEL BUG:
  the 3-style parallel burst can rate-limit styles out (owner got a
  single card) — rejected styles now retry ONCE sequentially, and
  cards re-sort to style order.
- SHOT REFS BOARD (owner 2026-09-07): the admin Marketing tab gained a
  GLOBAL "product shots" board (pseudo-style 'shots' in marketing-refs;
  studio-photography analysis prompt) — its charter
  (settings/marketing-charter-shots) rides every front/back bottle shot
  via buildShotPrompt. Lifestyle boards stay per style.
- ROUND 18 (owner 2026-09-07, 5 items): (1) 2mm BLEED on back-label
  SVG + TIFF deliverables (composeBackLabel opts.bleedMM; backgrounds
  extend into bleed, ground-stop line unmoved; previews stay trimmed;
  returned widthMM/heightMM include bleed so the TIFF pixel math
  stays true). (2) REAL TEXT MEASURING: W400 = per-glyph Barlow
  Condensed 400 advances measured in Chrome at 100px (the flat 0.41
  model called spaces 0.41 vs real 0.20 → premature wraps); tw() uses
  the table ×1.015 safety — description/warning now fill their lines.
  (3) QR ink runs EXACTLY from the ground-colour line (y61.5) to the
  barcode digits' baseline (y76.5): size 15.0, margin 0. (4) DELIVERY
  ZIP (/api/package + src/lib/zip.ts, a dependency-free STORE zip
  writer with CRC32): WINE_NAME/{1. LABELS/{Front tiff, Back svg,
  Fonts/Barlow ttfs}, 2. MARKETING ASSETS/{Bottle_Front/Back png,
  Image01..05 png}, Contract.pdf (hand-rolled minimal valid PDF
  sample)}; fonts staged in public/fonts/backlabel/; Proceed to
  payment now downloads this single ZIP (TEMP free). (5) PRODUCT QR:
  per-order productCode ref → qrUrl https://8klabels.com/p/{code}
  (placeholder domain; the landing page will resolve it later). ALSO:
  "By BRAND" needed tspan dx=0.9mm — librsvg drops NBSP glyphs.
  Verified: zip opens, TIFF/PDF valid, template render side-by-side.
- ROUND 17 (owner 2026-09-07, 4 items): (1) LIVING LOADERS — nothing
  ever freezes: the label loader's wine CREEPS between real progress
  jumps (dreamT ref resets on genProgress change; creep ≤0.28 over
  ~56s); assets mini-glasses are FILL-DRIVEN from a 700ms tick
  (done=0.93, active rises 0.14→0.9 over 45s from the stage
  timestamp, waiting glasses crawl slowly), 13px wide, with a
  three-dot nuiDot indicator 10px below each glass. (2) BOTTLE
  LOGIC: "Sparkling Cork" closure exists ONLY when the Sparkling
  bottle is selected (baked row covered otherwise; picking a
  non-sparkling type converts it to Cork); entering BOTTLE auto-picks
  the type from the front label's wording (sparkling/champagne/
  prosecco/cava/crémant/pét-nat → Sparkling+Sparkling Cork; ice
  wine/eiswein → Ice Wine; riesling/gewürz/alsace/rhine/mosel →
  Alsace; pinot noir/burgund/chardonnay → Burgundy) unless the
  customer already touched the type (bottleTouched ref). (3) BACK
  LABEL v5 — template-exact rebuild from WAIN/Back Label/
  back-label-template.svg (80×80, pt÷2.83465→mm): title = wine name
  LEFT 12pt semibold + "By BRAND" RIGHT (brand = producerCompany
  stripped of quotes/LLC; NBSP after "By" — SVG eats trailing tspan
  spaces); PRODUCER block LEFT / IMPORTED BY block RIGHT-aligned
  (BackLabelData gained producerCompany/Address + importerCompany/
  Address; joined fields remain fallbacks); PRODUCT OF | WWW row; ONE
  "LOT: … / …% ALC./VOL. … ML / CONTAINS SULFITES" line; regulatory
  zone below; GROUND COLOUR STOPS at y61.5 — codes band on CLEAN
  WHITE: QR 14.55mm @(4,61.45), BOTTLED @(21.3,65.5) 7.7pt, "See
  ingredients" @(21.2,76.0), EAN right-anchored. EMPTY FIELDS
  DISAPPEAR WITH THEIR TITLES; rules stay; flow + width ladder kept.
  Verified vs the reference render side-by-side. (4) BOTTLE IMAGES
  refreshed + -screw variants (no sparkling screw): page swaps image
  when Screw Cap is picked; marketing bottleShapeRef(type, closure)
  sends the screw outline so the drawn closure finally matches.
- ROUND 16 (owner 2026-09-06): (1) mini glasses 12px + marginTop 6.
  (2) PLACEHOLDERS OFF LABELS (owner: "show only what is typed",
  front AND back): DEMO_FRONT removed from page.tsx (fx/back payload/
  assets brief use raw typed values) and composeBackLabel's TEMP
  placeholder fills emptied (energyKcal keeps its computed default;
  form E.g. placeholders in inputs stay — they never printed).
  (3) CONTENT-AWARE PARALLAX: PAGE_SLICES generalizes the strip
  system — each slice is a clip RECT (page coords) + delay + mode
  ('slide' via new nuiIn/OutPx ±1440px keyframes — %-keyframes broke
  on narrow slices — or 'fade' = animate in place). front: headline,
  THIRTEEN per-row slices (x<806, 30px bands, delay 40+i*18), bottom,
  and the size REGION as a 'fade' slice while the frame runs szGrow
  800ms@90ms DURING the slide (inSlide only; settle/cold = static) so
  rows and box land together (~900ms). compliance: 4 country-row
  slices (delays 60/130/200/270). bottle: FIVE VERTICAL column slices
  cut just right of each dashed divider x342.86/582.86/822.86/1062.86
  (delays 0..240) — every column carries its own dashed frame, no more
  torn verticals. Other pages keep the 3-band fallback (sliceDefs()).
  go()/loader-fade timings use per-page maxSliceDelay. All verified
  mid-flight by screenshot: row staircase + growing box, row cascade,
  column cascade with intact dashes.
