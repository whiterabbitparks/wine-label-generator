# Layout templates — what I read, and what I would build

Source: `NEW UI/Comments/New/Layout_Options.pdf`, 12 pages, every page
104 × 84 mm. Read as vector, not as a picture: every text's exact
position, size, font and colour, and every box and ellipse.

The arc text survived. On template 2 "GRAND VIN" comes through as nine
separately placed letters rotating from +10.3° to −10.4°, and on
template 5 the wine name runs +25.9° to −25.4°. That is the curve
exactly as you drew it, which is what SVG was destroying.

Fonts are named in the file, so nothing was lost by not embedding:
Times New Roman (regular and bold) and EB Garamond Regular.

**Built and running locally (2026-09-22). Sections 5 to 7 say what
changed after his answers and how to look at it.**

---

## 1. The skeleton every template shares

Ten fields, and I matched them to the site's own placeholders as you
said:

| On the template | The field |
|---|---|
| GRAND VIN | producer |
| CHÂTEAU MARGAUX | wine name |
| Margaux AOC | appellation |
| Premier Grand Cru Classé | classification |
| 2018 | vintage |
| Cabernet Sauvignon, Merlot | grape variety |
| Bordeaux, France | region, country |
| Vieilles Vignes | special mention |
| Dry Red Wine | sweetness + colour + wine type |
| Alc.: 13.5% / 750 ml. | alcohol + volume |

Measured across all twelve:

| | |
|---|---|
| Type sizes used | 7, 8, 9, 10, 12, 13, 14, 16, 18, 20 pt |
| Smallest side margin | 6.6 mm |
| Smallest top gap | 5.9 mm |
| Inks | one near-black, one red |
| Faces | 3 |

Your 7 pt floor and 20 pt ceiling are exactly what you drew. Nothing in
the twelve breaks either bound, so the rule and the drawings agree.

Ten of the twelve share one bottom block: special mention and wine type
on the left, region and alcohol on the right, vintage between them,
baselines at roughly 69, 72 and 76 mm from the top. That block is the
constant. What changes above it is the arrangement.

---

## 2. The twelve, one line each

Artwork box in mm, measured from the top-left of the label.

| # | Arrangement | Artwork | Wine name |
|---|---|---|---|
| 1 | centred stack under the picture | band, top, full bleed, 104 × 41 | 20 pt |
| 2 | centred stack, arc producer over an oval | oval, 67.5 × 36.5 | 16 pt |
| 3 | centred head, picture in the middle | band, middle, full bleed, 104 × 39 | 18 pt |
| 4 | centred head, picture at the foot | band, foot, full bleed, 104 × 43.5 | 18 pt |
| 5 | arc wine name over an oval | oval, 77.8 × 37 | 18.7 pt, arced |
| 6 | two columns, oval above | oval, 65.9 × 40.7 | 14 pt |
| 7 | two columns split top and bottom | oval, 65.9 × 40.7 | 14 pt |
| 8 | two columns at the head, picture below | band, foot, full bleed, 104 × 52 | 14 pt |
| 9 | picture at the head, two columns below | band, top, full bleed, 104 × 52 | 14 pt |
| 10 | head, picture, foot | band, middle, full bleed, 104 × 45 | 14 pt |
| 11 | everything vertical, picture left | half, left, full bleed, 70.8 × 84 | 12 pt, 90° |
| 12 | everything vertical, picture right | half, right, full bleed, 70.8 × 84 | 12 pt, 90° |

Every rectangular picture bleeds off the label on three sides. The
ovals never touch the margin. That already follows your rule that only
background and bleed imagery may cross the safe margin.

The red moves. It is on the wine name in most, on the grape in 3, on
the vintage in 4, on the special mention and region in 2. So the accent
is a role that travels, not a fixed field. I read that as deliberate
and would keep it as a per-template choice.

---

## 3. The three columns, classical to free

Your three versions map onto what you drew like this:

- **Classical.** Centred composition, serif. Templates 1, 2, 3, 4.
- **Contemporary.** Two-column, cleaner and smaller, sans-serif.
  Templates 6, 7, 8, 9, 10.
- **Free.** Handwritten and artistic faces, the arrangements that break
  the grid. Templates 5, 11, 12.

Nothing you drew is grunge, so the free column takes the arced one and
the two vertical ones and gets its character from the faces. Draw more
when you want that column to go further.

---

## 4. Your rules, as they are implemented

**Collapse, never leave a hole.** Each template is an ordered list of
blocks with one anchor each. When a field is empty its block is removed
and everything below moves up by that block's height plus its gap. The
block below inherits the anchor. Nothing floats, nothing re-centres by
accident. For the bottom block, which is anchored to the label's foot,
the collapse runs upward instead.

**5 mm safe margin.** No text and no rule may enter it. Picture may, and
only when it is a bleed picture. The verifier the engine already has
measures this on every render and fails the build, so it cannot drift.

**The image absorbs the change of shape.** When the label is not 104 × 84,
the type keeps its size and its distance from its own anchor edge, and
the picture's zone takes the difference. Type only scales once it no
longer fits, and then as a whole, never line by line, never past 7 pt.

**Typography.** 7 pt floor, 20 pt ceiling, hierarchy preserved: nothing
outgrows the wine name. Faces vary within the column's band, and the
pools are built so members differ in class, not just in name. No two
lines closer than 1 mm: a crowded row steps down in size together, and
the 5 mm margin counts as the row's outermost neighbour, so a long wine
name gives way to it exactly as it gives way to the line beside it.

**Colour.** Wine type suggests a direction, the artwork decides inside it.
One ink and one accent per label, as you drew.

---

## 5. Your answers, and what they changed

1. **The legal line** is `13.5% Alc. by Vol. / 750 mL`, the house wording,
   not the shorthand on the artboard. Built.
2. **20 pt is an absolute ceiling** for now, and 7 pt the floor. Built.
3. **Only free Google faces**, and the logic holds: serif for the
   classical column, sans for the contemporary, handwritten and artistic
   for the free one. The faces on the artboard were for looking at, not
   to be matched. Built — three pools, one per column.

Still open, and I have taken the obvious reading rather than stopping:

4. **The free column** has no grunge template drawn, so it takes the
   arced one and the two vertical ones, and gets its freedom from the
   written faces. Draw more when you want to.
5. **Fields a template never shows** — templates 11 and 12 join region,
   grape and the legal line into slash-separated lines, and template 5
   has no appellation. Left as you drew them.
6. **The two reds** are treated as one accent. The accent now comes off
   the painting anyway, with the wine type only as a direction.

## 6. What is built

- `tools/extract-templates.mjs` reads your PDF and writes the geometry.
  Re-run it whenever you re-draw a template and the engine follows.
- `src/lib/typeset/templates.ts` lays a label on a template: collapse,
  the 5 mm margin, the picture absorbing a change of shape, the type
  bounds, collisions, and the faces per column.
- The wizard's three columns now mean your three bands, and a variation
  is a DIFFERENT TEMPLATE from the same band.

To look at them without generating anything:

```
npx tsx tools/preview-templates.mts              # all twelve, full details
npx tsx tools/preview-templates.mts --sparse     # only name, vintage, legal
npx tsx tools/preview-templates.mts --long       # a very long name
npx tsx tools/preview-templates.mts --size 70x90 # a different shape
```

## 6b. His artboard is the measure (2026-09-23)

The owner laid the engine's labels over his own artboards: text on the
picture, lines far apart. The cause: after placing every line where he
drew it, a second sweep treated each ROW as a band across the whole
label, so his vintage in the middle of the foot "hit" the line above it
on the left and every row was pushed up until the name sat in the
picture. The vertical templates had the same fault mirrored (a line
turned -90 has its letters' tops facing LEFT).

Now:

- With his words at his size the label IS his artboard — every line on
  his baseline, at his size, in his weight (bold/regular read off the
  face he set it in). `npx tsx tools/match-artboards.mts` proves it for
  all twelve (±0.3 mm, x and y, size, weight, zone) and must pass.
- A line moves only when it must: an empty row closes up toward its
  edge; a long text steps down in size (7 pt floor); two lines move
  apart only if their INK (real glyph outlines, `inkExtent`) would touch,
  and only lines that share some width are compared.
- One family a label, in his two weights. No "the name is always the
  largest" cap — on template 11 his vintage is larger than his name.
- Arced words keep his letter-spacing (the sweep he drew is stored per
  arc) and shrink until they sit inside the 5 mm margin.
- The picture's zone keeps his distance from the type beside it; an
  edge on the label edge stays there. An oval shrinks only if a letter
  would touch the ellipse itself.
- `tools/check-templates.mts` measures real ink too (it called his own
  artboards collisions before). 1296 layouts, must PASS.
- Visual check: `npx tsx tools/his-vs-engine.mts "" out.png` (his PNG |
  engine | overlay) and `tools/show-layouts.mts "t02:80x110:long,…"`.
- Source PDF now lives in `NEW UI/Comments/Achive/Layout_Options.pdf`;
  his PNG exports of the same twelve are in `Comments/New`.

## 7. What I would change next, once you have looked

- The picture is FITTED into its zone, never cropped, because a painting
  is never cut is a standing rule. Your bands bleed off the label edge,
  so if you want them to read as full-bleed imagery that is a decision to
  take.
- Template 5's foot row crowds when every field is long: a centred grape
  between a left and a right line. It shrinks to fit, and warns.
