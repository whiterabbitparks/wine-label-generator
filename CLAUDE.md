# Claude working notes — 8K Labels

**Start here:** read `CONTINUE-HERE.md` (repo root). It is the living handoff
doc: architecture, the owner's standing design rules, and the feature log.
Keep it updated whenever a rule or feature changes.

## Who's who
- Giorgi (owner) is the art director, not a programmer — plain language,
  visual results. Rules they state once are permanent until revoked.
- Claude owns code, tests and shipping.

## Architecture in one breath
Original configurator lives in `8k-labels-package/src/` (label-engine.js,
editor-embed.js, image-gen.js, configurator-base.html, build.js). It is
built by `node 8k-labels-package/build.js` into `dist/configurator.html`,
then `node tests/parity/extract-shell.mjs` transplants it verbatim into the
Next.js app (`public/engine/*.js`, `src/app/shell-body.ts` — generated,
NEVER hand-edit). Server side: `src/app/api/generate-label-set` orchestrates
one artwork per label style (prompt assembly is server-owned), NDJSON
progress stream, in-memory cache. Admin under `/admin` (seed login
John/Doe), MongoDB Atlas db `8k-labels`.

## Ship cycle (exact order — deviating breaks things)
1. edit package src → `node 8k-labels-package/build.js`
2. `node tests/parity/extract-shell.mjs`
3. `npm run build`
4. `IMAGE_PROVIDER=mock PORT=3200 npm run start` (verify 200 first)
5. `npm run capture:original` + `capture:ported` + `compare:screens` (<0.5%)
6. `node tests/parity/test-imagegen.mjs http://localhost:3200` and
   `test-autogen.mjs` (both must PASS)
7. `node tests/parity/check-hard-rules.mjs` must PASS (margin/7pt/gap +
   crash detector) after ANY engine change.
8. **Goldens LAST**: `npm run golden:check` (72/72, 3 styles). `golden:extract`
   only for intentional engine-output changes.
9. commit + push, then rebuild/restart whatever server the owner uses.

## Traps (each cost real debugging time)
- Golden scripts start a dev server on :3199 that REWRITES `.next`; any
  running `next start` then 400s on chunks. Likewise `npm run build` breaks
  a running dev server. After goldens: rebuild before starting prod.
- Kill servers with `lsof -ti :PORT | xargs kill -9` — `pkill -f "next
  start"` misses detached `next-server` processes.
- First golden render on a cold dev server can flake once (Archivo 300 font
  race). Re-run before diagnosing.
- Engine "hint" features (LabelEngine.setStyleHints) must keep the no-hints
  path byte-identical so goldens never need re-baselining for them.
- The admin login username input has NO type attribute — Playwright
  `input[type=text]` selectors time out; use `locator('input').first()`.

## Non-negotiable design rules (full list in CONTINUE-HERE.md)
- Artwork always on pure white background; multiply blend on labels.
- Layout-detail edits never regenerate artwork (only story/sketch/seed do).
- Reference-board images NEVER go to the image model (they cause shape
  copying) — they steer only through the derived style profiles.
- No split-colour label backgrounds; no dark grounds under artwork.
- No frames or borders on any layout (2026-08-16).
- Customers get ONLY admin-selected fonts and ONLY approved layout comps
  (once any comp is approved for a style) (2026-08-16).
- Layout hints have ONE source: buildLayoutHints() (layout-refs.ts) — never
  derive layout hints from image profiles or send thinner hints anywhere.
- Alcohol/volume always "N% Alc. by Vol. / N mL".
- UI: Special Elite only (self-hosted), #ede3d6 ground, all-black 2px lines.
- DEMO_FILL=true in editor-embed.js is TEMPORARY — revert before launch.
