# Design rules (the living spec)

The authoritative list of rules the label engine follows. When a rule and the
code disagree, this document is the intent; fix the code. Grouped by topic.

## Physical output & geometry
* Artboard = the **real trim size** the user enters (e.g. 100 × 80 mm). The SVG
  carries `width`/`height` in mm and a matching `viewBox`; the artboard does
  **not** include the bleed.
* **2 mm bleed**: the background colour and the image extend 2 mm beyond the
  artboard on all sides. Nothing else does.
* **5 mm safety margin**: no text or layout element ever crosses it. Only the
  background and the image may reach the artboard/bleed edge.
* One internal unit = 0.1 mm.

## Ranks (field → priority)
1 Producer / Estate / Brand · 2 Wine Name / Cuvée · 3 Appellation · 4
Classification · 5 Vintage · 6 Grape variety · **7 Region & Country** · **8
Special Designation / Vineyard / Production Claim** · 9 Sweetness·Colour·Type ·
10 Alcohol·Volume.
(Rank 7 and 8 were swapped so Region & Country is 7th; applies in the field list
and the preview.)

## The three options / generation
* The UI shows **3 columns**: option 1 = **no image**, option 2 = **small
  image**, option 3 = **large image**. In one click it generates **9** options
  (3 rounds). "Other options" **replaces** the 9 with a fresh 9.
* **No image never repeats a base** before the variety is exhausted; each column
  rotates through its distinct compositions first.
* Only **fonts, background tone and frame** vary between generations — the
  **layouts/compositions are fixed** and reproduced exactly from the reference
  PDF (positions, sizes, colours, justification).

## Typography
* Use only the agreed font set. **No gothic / blackletter.**
* **No-image options** lean on **calligraphic / cursive** faces for the main
  name; image options use traditional serifs.
* Vary caps vs mixed case: titles and the estate name are usually **all caps**
  on serif kits; lower-hierarchy lines stay mixed case; script kits set the
  estate in cursive mixed-case.
* **Letter-spacing (tracking) is capped at 0.08 em.**
* When changing fonts, never break the layout, keep the size hierarchy, and
  don't let anything overlap.

## Layout correlations (must hold at any size / aspect)
* **1** is independent (top).
* **2 and 3 are one group** — appellation stays close under the estate; do not
  let them drift apart. **Exception:** in no-image layouts the estate (2) is
  centred in the free space between 1 and 3 (whether it lands on one line or
  two, it sits in the true centre of that gap).
* **4** always sits in the **centre of the distance between 3 and 5** (and
  shrinks to fit if that gap is tight).
* **4** stays toward the bottom of the composition.
* **5, 6, 7, 8, 9, 10 are the last group.** The top footer row (7·5·8) must not
  move far from the bottom row (9·6·10) — no more than about twice the row
  height apart, however tall the label gets.
* When resizing, stretch conscientiously: fill space, keep breathing room, don't
  create asymmetric gaps, and **don't change font sizes unless necessary**. If a
  font would go below **6.5 pt**, stop shrinking. Use condensed treatment for
  narrow vertical labels where horizontal space is tight.
* These same correlations are mirrored in the wireframe preview.

## Image
* The black box in the reference defines the **active image area**. The image
  **fills** that area on its short axis and may overflow the long axis; it is
  **never cropped inside the label** — it is clipped only at the label/bleed
  edge. The whole image is shown.
* On toned backgrounds the image is applied with **multiply** blending.
* All three image options must **always contain an image** (regenerating must
  never drop it). No-image is its own dedicated column.

## Text over the image
* Text that sits over the image gets a thin **outline in the label's background
  colour** (~1 mm — doubled from the original 0.5 mm) so the type never visibly
  merges with the engraving. Implemented as a background-colour halo drawn
  underneath the solid-colour text.

## Frames
* Frames are optional variety — some options have a frame, some don't.
* A frame is a **double line**: **outer 2 pt, inner 1 pt**, always.
* The **distance between the outer and inner lines is constant everywhere**
  (including around the corners), and the **distance from the label edge is the
  same on all four sides**.
* Frame lines are **joined** (continuous, mitred corners) — no gaps or stray
  square artifacts at the joins.
* Corner styles vary: **chamfered** (cut) corners and **straight** corners.
  When cut, the chamfer is 1.5× the original size. A **50 %-opacity** line
  variant is also in the rotation.
* **Framed lower text stays with the frame's lower line** as the label grows.
* Leave **2 mm clear** between any frame line and adjacent text; the rotated
  side text (ranks 9·10) sits 2 mm inside the right frame edge and **reads
  bottom-to-top**.

## Editor / UI
* The wireframe note reads: *"This isn't the final artwork — use it to set the
  visual hierarchy of your label's elements."*
* **Field titles removed** above the input boxes; the freed space is collapsed
  so the list is compact.
* Under each generated label: a **selectable radio** + **"Option #N"** (numbers
  grow with more generations). Selecting shows a **thin green outline** on the
  label; the thumbnail hover uses a soft shadow with **no white border** (the
  edge is exactly the label's own edge).
* Clicking a thumbnail opens a **gallery lightbox** with close and prev/next to
  click through all present options.
