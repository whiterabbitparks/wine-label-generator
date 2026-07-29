# Developer handoff

For whoever picks this up next. Read `ARCHITECTURE.md` for how it works and
`RULES.md` for what it must do; this file is the practical "getting productive"
and "what to watch out for" note.

## Setup

```bash
node --version          # needs >= 16 (uses only stdlib for the build)
npm install             # only needed for the verifier (installs Playwright/Chromium)
npm run build           # -> dist/configurator.html + dist/prototype.html
npm run verify          # headless check: margins / overlaps / artboard+bleed
```

The **build has zero runtime dependencies** — `node build.js` uses only Node's
standard library. Playwright is a *dev-only* dependency, used solely by the
verifier. If you don't want it, you can skip `npm install` and just build.

Open `dist/configurator.html` directly in a browser (no server needed).

## Repo layout recap
`src/` = edit here · `build.js` = inlines src into `dist/` · `dist/` = generated,
don't hand-edit · `tests/verify.js` = regression check · `docs/` = specs ·
`design-references/` = the client PDFs the compositions were traced from.

## How the compositions were derived (to add or correct one)
The `LC_COMPS` entries are exact tracings of `design-references/Layout_Compositions.pdf`
(and the Option_/Vertical_ PDFs). They were extracted with `pdfplumber`:

```python
import pdfplumber
p = pdfplumber.open("design-references/Layout_Compositions.pdf").pages[0]
for r in p.rects:   print(r['x0'], r['top'], r['x1'], r['bottom'])          # black image boxes + frames
for w in p.extract_words(extra_attrs=['fontname','size']): print(w)          # text: position, size, font
for c in p.chars:   print(c['text'], c.get('non_stroking_color'))            # colours
```

Page geometry: 294.8 × 238.1 pt = 104 × 84 mm artboard (100 × 80 mm trim + 2 mm
bleed). Positions in `LC_COMPS` are stored in these **artboard points**; the
engine converts to output units at render time (see `ARCHITECTURE.md §1`). To
add a composition faithfully: extract its boxes/words/colours as above, drop the
numbers into a new `LC_COMPS` entry, and add its id to a `LC_GROUPS` pool.

## Known limitations / gotchas
* **Fonts need network.** Type loads from Google Fonts via `@import` in each SVG.
  Without network it falls back to a system serif (layout still correct). For
  production, self-host per `HOW-TO-EDIT.md → Self-hosting the fonts`.
* **Only the Traditional / Heritage style is implemented.** The configurator's
  other style cards (Premium, Minimalist, Artistic/Punk, Flora & Fauna) are not
  wired to the engine yet — they'd each be a new set of compositions + schemes.
* **`src/configurator-base.html` is the client's page.** `build.js` injects into
  it by matching text anchors (`Front Label Information`, the orientation
  section, `</body>`). If the client ships a redesigned page, keep those anchors
  or update the selectors in `build.js`.
* **The placeholder image** (`src/img-data.js`) is a stand-in engraving. Real
  user uploads would replace `window.__VINEYARD__`; if the real pipeline feeds
  images differently, wire it into `CL_IMG_DATA` in the engine.
* **Logo upload** in the editor is a stub button (no file handling yet).
* The verifier checks geometry (margins/overlaps/bleed), not visual/font
  fidelity — that still needs a human eye after big changes.

## Sensible next steps (if extending)
* Self-host fonts and remove the network dependency.
* Wire real image upload → replace the placeholder per option.
* Add the other four style families (new `LC_COMPS` groups + scheme pools).
* Persist the user's selected option + size to the order/checkout flow.
* Add a PNG/PDF export alongside the existing SVG download if print needs it.

## Ownership
Design and brand assets (the reference PDFs, the vineyard engraving placeholder,
the configurator page) belong to the client (8K Labels). Confirm licensing of
the Google Fonts families before shipping self-hosted copies (all the ones used
are OFL/Apache and free to self-host, but verify per family).
