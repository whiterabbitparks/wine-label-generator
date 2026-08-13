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

## 5c. Reference-FIRST layouts (branch Labels_By_Reference_Test)

**2026-08-11 second pass (owner decision): the PDF layout templates are
RETIRED on this branch.** All six styles' compositions are designed from the
`Layout Styles/References/` boards. Rules kept: element hierarchy, NO text
overlap at any size (sFlow gap-tracked stacks + sRow disjoint zones +
single-line shrink-to-fit heroes), text never covers the artwork's focal
area (zones placed per composition at design time), Google/free fonts only.
26 compositions total: Traditional 5, Contemporary 5, Flora 4, Premium 3,
Minimalist 4 (incl. colour panel), Artistic 4 — each with focal/fade artwork
zones and per-style palette rotation. The `Layout Styles/*.pdf` era survives
on branch Popika_test if ever needed.

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
