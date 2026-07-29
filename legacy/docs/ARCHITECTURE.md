# Architecture

How `src/label-engine.js` is organised and how a label is rendered. Read this
alongside the source — every section below names the exact identifiers.

## 1. Coordinate system & units

* Everything internal is in **units of 0.1 mm**. `PT_UNIT` (`= 25.4/72*10 ≈
  3.5278`) converts PostScript points → units. The reference PDFs were authored
  in points, so composition positions are stored in **reference points** and
  multiplied by `PT` (`= PT_UNIT`) at render time.
* The **reference artboard** is 294.8 × 238.1 pt = 104 × 84 mm (a 100 × 80 mm
  trim + 2 mm bleed all round). Constants: `LC_BU` (2 mm bleed = 20 u),
  `LC_MARGU` (5 mm text margin = 50 u), `LC_RTWu`/`LC_RTHu` (reference trim
  1000 × 800 u).
* **Output artboard = the real trim size** (`AWu = twMM*10`, `AHu = thMM*10`).
  The background and image are drawn from `-LC_BU` to `AWu+LC_BU` so they bleed
  2 mm beyond the board; the SVG `viewBox` is the trim, `width/height` are in mm.

The mapping from a reference point to an output unit is the `map()` closure
inside `lcRender`: `map(xu,yu) = ((xu-LC_BU)*sx, (yu-LC_BU)*sy)` where
`sx = twMM*10/1000`, `sy = thMM*10/800`. `fscale = min(sx,sy)` is the uniform
scale used for anything that must stay proportional to the *design* (font
sizes, frame insets, gaps) rather than stretch with the aspect ratio.

## 2. Data model

### Compositions — `LC_COMPS`
An array of the fixed layouts pulled from `Layout_Compositions.pdf`. Each entry:

```js
{ id:'C5', group:2, frame:0, arch:0, img:[x0,y0,x1,y1],   // img box in ref pt, or null
  top:[ {id,y,s,a,col,role,over,lines}, ... ],            // ranks 1-3 (+ any headline rows)
  foot:[ ...footer elements... ] }
```

* `id` — internal name (C1…C10, C4F).
* `group` — **0 = no image, 1 = small image, 2 = large image**.
* `frame` — draw the double frame?
* `arch` — default: arch the title (GRAND VIN) on a curve. (Regenerate also
  toggles this per round.)
* `img` — the black "active image area" box from the reference, in reference
  points, or `null` for the imageless compositions.
* Each **element**: `id` = rank 1-10 (maps to a field via `order[id-1]`); `y` =
  reference-point top; `s` = point size; `a` = `'l'|'c'|'r'` justification;
  `col` = `'rd'` red / `'dk'` dark / `'wt'` white; `role` = font role (see §4);
  `over` = force the over-image outline; `lines` = allow N lines (estate = 2);
  `combine:[7,8]` = join two ranks with `/` (framed footer); `side:[9,10]` =
  render rotated up the right frame edge; `capsFirst` = uppercase the first
  combined part.

Shared footers: `LC_FLAT` (the two-row footer for imageless/frameless), and
`LC_FRFOOT` (framed footer — classification/vintage/grape centred, region+
special combined, sweetness+alc rotated down the right edge).

### Grouping into the 3 UI options — `LC_GROUPS`
```js
[['C6','C4','C4F'], ['C1','C2','C7'], ['C5','C8','C9','C3','C10']]
//   no image           small image        large image
```
`renderPriorityOptions(d, order, {widthMM, heightMM, seed})` returns exactly
**three** options (one per group). For a given `seed` it picks
`pool[seed % pool.length]` from each group — so consecutive seeds exhaust the
distinct bases before repeating. The editor renders three consecutive seeds at
once (**9 options**); "Other options" advances the base seed by 3.

### Fonts — `SCHEMES`, `LC_SERIF`, `LC_SCRIPT`
`SCHEMES` is the font kit table (family + weight + baseline for each role). The
no-image group draws its scheme from `LC_SCRIPT` (calligraphic/cursive); the
image groups from `LC_SERIF` (traditional serifs, **no blackletter**).
`lcFont(role, scheme)` resolves a role → concrete font, caps flag and tracking
(letter-spacing is capped at 0.08 em).

### Palette
`LC_RED = #D71920`, `LC_DK = #231F20`. Backgrounds vary over `LC_BGS` (white →
warm paper tones).

## 3. The render pipeline — `lcRender(d, order, comp, cfg, twMM, thMM)`

1. **Background** rect, bleeding 2 mm past the artboard.
2. **Image** (`lcImageSVG`) — the engraving *covers* the black box on its short
   axis and overflows the long axis, clipped only at the artboard edge (never a
   crop line inside the label). `mix-blend-mode:multiply` so it sits on toned
   backgrounds. Uses `preserveAspectRatio="xMidYMid meet"` with a box at the
   image's native aspect, so the whole image is always shown.
3. **Pass 1 — fit + position by correlations** (this is the important part; see §5).
4. **Frame** (`lcFrameSVG` → `lcRectPath`) if `comp.frame`.
5. **Pass 2 — emit** each element as SVG `<text>` (two stacked elements when it
   overlaps the image: a background-colour halo underneath + the solid colour on
   top, so text never merges into the engraving). The title, when arched, is
   emitted on a quadratic `<path>` via `<textPath>`.
6. Wrap in `<svg>` with the physical `width/height` + `viewBox`, and a `<defs>`
   carrying the font `@import` and the artboard clip-path.

## 4. Font roles

`role` on an element selects the font from the active scheme:
`title` (GRAND VIN, always caps, arched when enabled) · `estate`
(CHÂTEAU MARGAUX, the display face) · `aoc` (appellation) · `cls`
(classification) · `vint` (vintage) · `grape` · `foot` (everything else, EB
Garamond). Titles and estates render caps on the serif kits; the script kits
render the estate in mixed-case cursive.

## 5. Layout correlations (pass 1)

Positions are **not** naively scaled by height — that stretches groups apart on
tall labels. Instead, anchors are placed and dependent elements derived, all
using `fscale` (uniform) spacing so relationships hold at any aspect ratio:

* **Footer block (ranks 5-10)** is anchored to the bottom (or, when framed,
  2 mm above the inner frame line). Its two rows keep their tight reference gap
  (never more than ~twice the row height apart).
* **Rank 3 (appellation)** stays tight under **rank 2 (estate)** — except in the
  **no-image** layouts, where rank 2 is centred in the gap between rank 1 and
  rank 3.
* **Rank 4 (classification)** is centred in the gap between rank 3 and rank 5,
  and shrunk to fit if that gap is tight.
* An **overlap guard** shrinks the upper of any colliding pair in the
  title/estate/appellation/classification stack (font floor 6.5 pt).

The wireframe preview (`previewLayout`) reproduces the same relationships
schematically so the editor's hierarchy diagram matches the output.

## 6. The frame — `lcFrameSVG` / `lcRectPath`

Two concentric rounded/straight rectangles drawn as **continuous paths** (corners
mitred, pen only lifts where a gap is cut). Constant inset from the edge on all
four sides (`I = 22·fscale`) and a constant perpendicular gap between the two
lines (`g = 13·fscale`) — including through the chamfer (`chamI = cham −
g·(2−√2)` keeps the offset constant around the corner). Outer line 2 pt, inner
1 pt. `cfg.frameStyle` cycles `cham` / `square` / `cham50` / `square50`
(chamfered or straight corners, solid or 50 %-opacity lines).

## 7. The configurator UI — `src/editor-embed.js`

Injected into `configurator-base.html` by `build.js`. It provides:
* a **wireframe** hierarchy diagram (`previewLayout`) with numbered draggable-by-
  arrows fields and a live margin/image box;
* the **field list** (order, values, logo upload) — the `order` array here is
  the single source of the rank → field mapping (rank 7 = Region & Country,
  rank 8 = Special Designation);
* the **options grid** — 9 thumbnails, a radio + "Option #N" under each,
  green selection outline, per-option "Download SVG", and a **gallery lightbox**
  (click a thumbnail → full-size with prev/next/close);
* the **"Other options"** button (replaces the 9 with a fresh 9).

The engine exposes `window.LabelEngine = { renderPriorityOptions, previewLayout,
ensureFonts, ... }`; the editor only ever calls those.
