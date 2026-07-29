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

## 5. Image generation (current state)

- Client flow (unchanged from original): story + optional sketch → **Generate
  artwork** (`#ig_go`) → `EightKImageGen.buildJob()` → provider → image slots
  into the label (`window.__LABEL_IMG__`, `8kRepaint`).
- Provider now POSTs to `/api/generate-label-image`; response
  `{ imageDataUrl, provider }`.
- **mock** (active): deterministic engraving-style SVG from the job — same
  vision → same image, different vision → different scene; watermarked
  "MOCK ARTWORK". Free, offline.
- **openai** (written, **untested** — no key yet): `IMAGE_PROVIDER=openai` +
  `OPENAI_API_KEY` in `.env.local`. Generations endpoint, or edits when
  `job.reference` present; model default `gpt-image-2`
  (`OPENAI_IMAGE_MODEL` overrides). Verify the model name on first real run.
- Admin art-direction drawer: `/?admin=1` (or `#art-direction`).

---

## 6. What's DONE / what's NEXT

DONE: verbatim transplant with proven parity (engine 144/144 byte-identical;
UI 0.000% pixel diff on 9/10 states, gallery card-set identical); image
backend in mock mode with e2e coverage; old port + tracked `.next/` removed.
Milestone commit `4da0504`.

NEXT (in rough priority):
1. Test/harden the real OpenAI path when a key exists; add rate limiting to
   the generation route before any public deploy.
2. Persist the Art Direction config server-side (it resets on reload); load on init.
3. Real auth for the admin drawer (replace `?admin=1`).
4. Deferred by user: mobile/responsive parity (capture scripts are
   1440px-only), logo placement rules (box 2), per-style image treatments.

## 7. Engine internals reference

For label-engine conventions (units, HFLOOR font floors, hierarchy tiers,
compositions, the 6 styles, data shape), see
`8k-labels-package/CONTINUE-HERE.md` §4–5 and `8k-labels-package/docs/` —
still accurate for the engine itself; ignore their "single HTML file / no
server" framing and their pending-work lists, which this file supersedes.
