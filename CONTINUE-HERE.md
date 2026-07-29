# 8K Labels — CONTINUE HERE (session handoff)

This is the single source of truth for resuming work. It reflects the **current**
state after the multi-style + image-generation work. Older notes in `docs/`
(ARCHITECTURE.md, RULES.md, HOW-TO-EDIT.md, HANDOFF.md) are still useful for the
Traditional engine internals but predate the 6-style system and the image
pipeline — trust THIS file where they disagree.

---

## 1. What this project is

**8K Labels** is a wine-label generator. A winemaker enters their label details
in a single interactive "layout preview," optionally writes a story / uploads a
reference, and presses **Show Labels**. The tool generates the **same label in 6
distinct design styles** as print-ready SVG (sized in real mm, 5 mm safe margin,
2 mm bleed).

Everything is a **single self-contained HTML file** (`dist/configurator.html`) —
no server, no build-time network. Open it directly in a browser.

---

## 2. How to build & verify

```bash
cd 8k-labels-package
node build.js            # -> dist/configurator.html + dist/prototype.html  (Node stdlib only, no deps)
node tests/verify.js     # headless Playwright: 144 Traditional variants, checks 5mm margins/overlaps/bleed
```

The verifier needs Playwright + Chromium. In this environment Chromium is at
`/opt/pw-browsers/chromium` (the test already falls back to it). If missing:
`npm i -D playwright`.

`build.js` inlines, in order: `src/img-data.js` → `src/label-engine.js` →
`src/editor-embed.js` → `src/image-gen.js`, plus a CSS block, into the client
shell `src/configurator-base.html`. **Never hand-edit `dist/` — edit `src/` and rebuild.**

---

## 3. File map (edit these)

| File | Role |
|---|---|
| `src/label-engine.js` | **THE ENGINE.** Traditional heritage renderer (`lcRender`, `LC_COMPS`) + the 6-style system (`renderStyleOptions` and `styleTraditional/Contemporary/Flora/Premium/Minimal/Artistic`). Fonts, helpers, per-element floors, hierarchy. |
| `src/editor-embed.js` | The interactive layout-preview editor (`#labelEditor`), the option grid (`paint()` → `renderStyleOptions`), gallery, warning gate. Exposes `window.EightKEditor`. |
| `src/image-gen.js` | Image-generation pipeline: client "Generate artwork" panel + hidden back-office "Art Direction" panel. `window.EightKImageGen`. |
| `src/img-data.js` | Vineyard placeholder engraving as a data URL (`window.__VINEYARD__`). |
| `src/configurator-base.html` | The client page shell (hero, tabs, Your Vision, size, front/back sections). ~2.8 MB (embedded media). |
| `src/prototype-shell.html` | Standalone engine playground (`dist/prototype.html`). |
| `build.js` | Inliner. Also holds the big scoped CSS string for the editor/options. |
| `tests/verify.js` | Regression check (margins/overlaps/bleed across 144 Traditional variants). |
| `design-references/*.pdf` | Client reference PDFs the Traditional compositions were traced from. |

---

## 4. Core conventions (MUST hold)

- **Units:** 1 unit = 0.1 mm. `PT_U = 25.4/72*10 ≈ 3.5278` units per pt. Artboard `viewBox="0 0 W H"` with `W = widthMM*10`.
- **Safety margin:** 5 mm = `SM = 50` units. **No text may cross it on any side.** Verified by `tests/verify.js` (Traditional) and a margin sweep for the styles.
- **Bleed:** 2 mm = 20 units; background rect extends beyond the trim.
- **Absolute font floor:** 7 pt (`MINU`). Nothing smaller anywhere.

### Box numbering (the client's mental model)
1 Producer · 2 Upload logo · 3 Wine Name · 4 Appellation · 5 Grape ·
6 Region & Country · 7 Vintage · 8 Special Designation · 9 Classification ·
10 Attributes (Sweetness/Color/Type) · 11 Alcohol & Volume.

### Engine field order → ids
`order = ['producer','wineName','appellation','grape','vintage','classification','regionCountry','special','attributes','alcVol']`
maps to id1…id10 (`slot(id)=order[id-1]`). **Grape and Classification are swapped**
vs. a naive reading: grape is the prominent rank-4 box (id4), classification is
the small centred box (id6).

### Per-element minimum font size (final SVG) — `HFLOOR` in `label-engine.js`
Producer 12pt · WineName 15pt · Appellation 10pt · Grape 9pt · Vintage 8pt ·
Region 8pt · Special 8pt · Classification 8pt · Attributes 7pt · Alc/Vol 7pt.
IDs 1·2·3 may wrap to 2 centred rows if too wide (`HWRAP`).

### Size hierarchy (Traditional `enforceHier`)
WineName > Producer > Appellation > Grape > Vintage > (Region = Special =
Classification, equal) > (Attributes, Alc/Vol). Tiers: `[[2],[1],[3],[4],[5],[6,7,8],[9,10]]`.

### Attribute dropdowns (editor)
Sweetness: N/A, Dry, Semi-Dry, Semi-Sweet, Sweet.
Color: N/A, Red, White, Orange, Rosé.
Type: N/A, Wine, Sparkling Wine, Pét-Nat, Fortified Wine, Ice Wine, Dessert Wine.
Boxes auto-size to the widest option in the live font (so "Sparkling Wine" never clips); all three equal width.

---

## 5. The 6-style system

`window.LabelEngine.renderStyleOptions(d, order, {widthMM,heightMM,seed})` → 6
options, one per style, `[{name, rank:key, style, desc, svg}]`. `STYLE_LIST`
order is fixed:

1. **Traditional** — heritage serif, arched producer, vineyard engraving, framed. Reuses `lcRender`. **Image compositions only** (pools `C1,C2,C7,C8,C5,C3`).
2. **Contemporary** — clean grotesque (Archivo/Jost/Bebas), left accent bar, oversized vintage, accent rule.
3. **Flora & Fauna** — botanical sprig ornament + leaf divider, elegant Fraunces/Cormorant serif, centred.
4. **Premium** — gold double-frame, monogram crest from producer initials, Cinzel caps; light **and** dark variants (seed parity).
5. **Minimalist** — sparse Jost, one hairline accent, big whitespace.
6. **Artistic / Punk** — oversized Anton name with a slight tilt, hand-marker (Caveat) producer/vintage, ink-scrawl underline.

The accent colour follows wine colour (`lcAccent`): white→green, orange→brown,
rosé→pink, else red. "Other Layout Options" reseeds for variations *within* each
style. All styles keep text inside the 5 mm margin (validated).

**Fonts:** `FONTS_URL` in `label-engine.js` loads the serifs/scripts plus the
added Jost, Archivo, Anton, Bebas Neue, Caveat, Fraunces. `ensureFonts()` waits
on them before rendering so proportions are correct.

---

## 6. Image-generation pipeline (current state)

**Two strictly separated layers.**

**Client (front)** — winemaker only gives a **story** (`#visionText`) + optional
sketch/photo (`#sketchFile` → `window.__LABEL_REF__`) and presses **Generate
artwork**. No rules, no prompt, no style controls. Lives in the `#imgGen` panel
under "Your Vision."

**Creator (back office)** — open the page at `…/configurator.html#art-direction`
(or `?admin=1`) to reveal the **Art Direction** drawer (hidden from clients). It
controls: image **style preset**, **house rules / art direction** (plain English),
**negative prompt**, **prompt template**, a **live assembled-prompt preview**, and
shows the **server-config JSON** your backend will store.

**Final prompt = art direction (yours) + client story (theirs) + reference (theirs).**
The client only ever contributes the middle piece.

### The image slot
`label-engine.js` `lcImageSVG` uses `window.__LABEL_IMG__` when set (the generated
image), else the vineyard placeholder. `EightKImageGen.setImage(url)` sets it and
fires a `8kRepaint` event; `EightKEditor` repaints shown labels live.

### The provider hook (this is the ONE thing to wire for real generation)
```js
window.EightKImageGen.provider = async function(job){
  // job = { prompt, negative, reference (dataURL|null), size:{w,h},
  //         art:{preset,extra,negative,template}, data (wine fields), vision (story) }
  const r = await fetch('/api/generate-label-image', { method:'POST',
    headers:{'Content-Type':'application/json'}, body: JSON.stringify(job) });
  const { imageDataUrl } = await r.json();
  return imageDataUrl;   // an image / data URL that slots into the label
};
```
Until replaced, a built-in placeholder renders the prompt as a framed engraving
vignette so the whole flow is testable offline.

Useful handles: `EightKImageGen.buildPrompt()`, `.buildJob()`, `.getConfig()`,
`.setConfig({preset,extra,negative,template})`, `.generate()`, `.clearImage()`,
`.openAdmin()`.

---

## 7. Chosen model + SECURITY (read before wiring)

- Target model: **OpenAI `gpt-image-2`** (the current image model behind ChatGPT;
  `gpt-image-1.5` / `gpt-image-1` / `gpt-image-1-mini` also exist). Text→image =
  *generations* endpoint; reference sketch = *edits* endpoint (takes an input
  image). It returns **base64** → wrap as a data URL and return from `provider`.
- **The API key must live ONLY on your backend** (env var, e.g. `OPENAI_API_KEY`).
  Never put it in this HTML — it runs in the client browser and any key there is
  world-readable and will be abused. The `provider` calls YOUR backend; your
  backend holds the key and calls OpenAI.
- If a key was ever pasted anywhere client-side or in chat, **rotate it.**

---

## 8. What's DONE

- 6-style generator, all margin-clean across sizes (H + V), no JS errors.
- Traditional = image compositions only.
- Per-element font floors + hierarchy + 2-row wrapping; 5 mm margin enforced everywhere.
- Editor: single layout-preview, placeholders, empty→warning gate, responsive to size, attribute dropdowns auto-sized, "Other Layout Options" reseed.
- Style-selection section removed; page opens on "Your Vision"; options labelled by style name.
- Image pipeline: client story/upload → prompt → provider → image → label; front/back split; back-office Art Direction panel producing backend-ready config; live repaint.

## 9. What's PENDING (next steps)

1. **Backend endpoint** `/api/generate-label-image` calling `gpt-image-2`
   (generations; edits when `job.reference` present), returning `{imageDataUrl}`.
   Then set `window.EightKImageGen.provider` to call it. (Pick host: Node/Express,
   Vercel/Netlify function, or Cloudflare Worker.)
2. **Persist** the Art Direction config to that backend (source of truth) instead
   of in-memory; load it on page init.
3. **Per-style image treatments?** decide whether each style gets its own image
   look (engraving for Traditional, botanical for Flora, line icon for Minimalist,
   etc.) — the presets are the seed for this. (User deferred: "decide later.")
4. **Auto-generate on Show Labels?** currently generation is an explicit button;
   decide whether it should run as part of Show Labels (mind cost/latency).
5. **Logo (box 2) rules** — still deferred; how an uploaded logo is placed/sized.
6. Optionally extend `tests/verify.js` to sweep the 5 new styles (a margin sweep
   script was used ad-hoc; fold it into the test).

## 10. Handy globals (console)
`LabelEngine.renderStyleOptions(data, order, {widthMM,heightMM,seed})` ·
`LabelEngine.STYLE_LIST` · `EightKEditor.getData()` · `EightKImageGen.*` ·
`window.__LABEL_IMG__` (generated image) · `window.__LABEL_REF__` (uploaded reference).

Data object shape (what the styles consume):
`{producer, wine, appellation, classification, grape, region, country, special,
vintage, alcohol, volume, sweetness, wineType, wineColorName, wineColor}`.
