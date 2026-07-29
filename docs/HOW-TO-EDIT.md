# How to edit — a cookbook

Every change below is in `src/label-engine.js` unless noted. After any edit:

```bash
node build.js          # rebuild dist/
node tests/verify.js   # confirm nothing overlaps / breaches the margin
```

---

## Change a composition's positions, sizes or colours
Find `LC_COMPS`. Each element is `{id, y, s, a, col, role, ...}` where `y`/`s`
are in **reference points** (the PDF's coordinate space: 226.8 pt tall trim),
`a` is `l|c|r`, `col` is `rd|dk|wt`. Example — nudge the estate up and enlarge it
on composition C1:
```js
{id:'C1', group:1, img:[87.3,47.2,207.5,112.8], top:[
  {id:1,y:25.5,s:17,a:'c',col:'dk',role:'title'},
  {id:2,y:120,  s:22,a:'c',col:'rd',role:'estate'},   // was y:125, s:20
  {id:3,y:145.2,s:16,a:'c',col:'dk',role:'aoc'} ], foot:lcFlat(0)},
```
The correlation pass may still reposition rank 3/4 relative to 2/5 — see
`ARCHITECTURE.md §5`. To move the whole footer, edit `LC_FLAT` / `LC_FRFOOT`.

## Add a new composition
1. Add an entry to `LC_COMPS` (copy the closest existing one). Give it a unique
   `id`, the right `group`, an `img` box (or `null`), and its elements.
2. Add the `id` to the matching pool in `LC_GROUPS`.
That's it — it enters the rotation automatically.

## Change / add a font
* The **font kits** are `SCHEMES` (each has `display`, `label`, `vintage`,
  `grape`). To add a family: add its Google-Fonts name to `FONTS_URL` (top of the
  file), add an `F.<key>` entry, then a new `SCHEMES.<name>` kit.
* The **pools** decide which kits each column can use: `LC_SERIF` (image
  options) and `LC_SCRIPT` (no-image options). Add your scheme name to one.
* If a scheme is cursive, also add its name to `LC_SCRIPTSET` so the estate is
  set mixed-case rather than forced caps.
* Role → font mapping is `lcFont()`. Letter-spacing is capped there at `0.08`.

## Change background tones
Edit `LC_BGS` (white → warm papers). Order matters only for which seed shows
which tone.

## Change red / dark ink
`LC_RED` and `LC_DK` near the top of the composition section.

## Frames
`lcFrameSVG` controls geometry: `I` (edge inset), `g` (gap between the two
lines), `swO`/`swI` (2 pt / 1 pt widths), and the chamfer size. The style rotation
(`cham` / `square` / `cham50` / `square50`) is set in `renderPriorityOptions`:
```js
const frameStyle = ['cham','square','cham50','square50'][(seed*3+gi)%4];
```
Add or reorder styles there. `lcRectPath` draws one rectangle (continuous path,
cuts a gap only where `gaps` says).

## Change which columns are no-image / small / large
`LC_GROUPS` — three arrays of composition ids. Move an id between arrays or add
one. `LC_GNAME` holds the internal names.

## Change the field ↔ rank mapping (e.g. re-order fields)
The **order** lives in `src/editor-embed.js`:
```js
let order = ['producer','wineName','appellation','classification','vintage',
             'grape','regionCountry','special','attributes','alcVol'];
```
Index `i` is rank `i+1`. Swapping two entries swaps them everywhere (list,
wireframe badges, and the generated labels). The engine itself is order-agnostic
— it always renders rank `n` from `order[n-1]`.

## Replace the placeholder vineyard image
`src/img-data.js` is just `window.__VINEYARD__ = "data:image/jpeg;base64,…"`.
Replace the data URL with your own engraving (landscape, light on white reads
best under multiply). The engine reads it as `CL_IMG_DATA`. If you change its
aspect ratio, update `CL_RATIO` (width ÷ height) so the "cover the box" maths
stays correct.

## Tune the layout correlations
All in `lcRender` pass 1: the footer-anchor block, the estate-centring / 3-tight-
to-2 branch, and the classification-centring block. `PTf` (= `PT*fscale`) is the
"physical, non-stretching" unit used so groups stay tight on tall labels.

## Edit the wireframe preview
`previewLayout` (bottom of the engine). It's schematic and mirrors the same
correlations; adjust the `iy0/iy1` image band or the `foot()`/`put()` calls to
change how the hierarchy diagram reads.

## Self-hosting the fonts (production / offline)
1. Download the WOFF2s for the families listed in `FONTS_URL`.
2. Replace `FONTS_URL` with a local stylesheet URL (or inline `@font-face`
   rules), and update the `@import` that `ensureFonts()` injects.
3. Rebuild. The SVGs will then render identically without hitting Google.

## Where the two deliverables come from
`build.js` inlines `img-data.js` + `label-engine.js` (+ `editor-embed.js` for the
configurator) into `src/prototype-shell.html` and `src/configurator-base.html`.
If the client ever ships a new configurator page, drop it in as
`src/configurator-base.html` — the injection anchors (`Front Label Information`,
the orientation section, `</body>`) are what `build.js` looks for.
