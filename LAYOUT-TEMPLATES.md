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

**Check this document, not the code. Nothing is built yet.**

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

- **Classical.** Centred composition, serif. Templates 1 to 5.
- **Contemporary.** Left-justified columns and vertical text, cleaner
  and smaller. Templates 6 to 12.
- **Free.** Brush or handwritten face, non-standard arrangement.
  **Nothing you drew is in this band.**

That is the one real gap. Templates 11 and 12 are vertical, which you
named as a contemporary option, so they do not fill the free slot
either. Question 4 below asks how you want to close it.

---

## 4. Your rules, as I would implement them

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
the type block keeps its sizes and its margins, and the picture's box
takes the difference. A rectangular box re-crops. An oval rescales and
keeps its centre. Type only moves once the picture cannot give any more,
and then it scales as a whole, never line by line.

**Typography.** 7 pt floor, 20 pt ceiling, hierarchy preserved: the wine
name is always the largest, the legal line always the smallest. Faces
vary within the column's band, but a swap has to be visible, so a new
face must differ in class, not just in name. No two text blocks closer
than 1 mm.

**Colour.** Wine type suggests a direction, the artwork decides inside it.
One ink and one accent per label, as you drew.

---

## 5. Six things I need from you before I build

1. **The legal line.** Your template reads `Alc.: 13.5% / 750 ml.` The
   standing rule in the project says `13.5% Alc. by Vol. / 750 mL`,
   which is the wording some markets require. Which one wins?

2. **20 pt at every size?** On this 104 mm label 20 pt is right. On a
   300 mm label it would look lost. Is 20 pt an absolute ceiling, or is
   it the ceiling at this size and it scales with the label?

3. **Times New Roman.** It is a commercial Monotype face. We deliver a
   PDF with live type, so the font travels with the file. EB Garamond is
   free and safe. Do you want me to find a free serif that reads like
   Times, or do you have a licence?

4. **The free column.** Do you want to draw two or three grunge
   templates, or should that column take templates 11 and 12 and get its
   freedom from brush faces and colour instead?

5. **Fields that a template never shows.** Template 5 has no appellation.
   Templates 11 and 12 join region, grape and legal into slash-separated
   lines. That is fine visually, but it means a customer who fills a
   field will not see it. Confirm that the back label carrying it is
   enough.

6. **Two reds.** The file has `#d71920` and `#c70001`. Same intent, or
   are they meant to be different?

---

## 6. What happens next

Once you have answered, I build **one** template end to end, render it at
several label sizes and with short and long wine names, and show you
before touching the other eleven. That is the step the earlier attempt
skipped.
