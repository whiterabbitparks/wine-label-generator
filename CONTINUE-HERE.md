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

## 5-LAYOUTS-V5 (2026-08-16) — artwork fills 80% of its free area

**Standing rule (owner, 2026-08-16): layout artwork fills ~80% of its free
area.** sImageBox no longer plain-contains the 1.6:1 artwork (which
letterboxed it to ~55% of many boxes): the drawn rect grows at the
artwork ratio, centred on the box, until its area is 80% of the free
area — never smaller than contain, never past the 5mm margins (clamped;
verified for all comps). Overflow beyond the box is visually quiet
because artwork edges dissolve into white and multiply-blend. Goldens
unaffected (no artwork in golden renders).

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
