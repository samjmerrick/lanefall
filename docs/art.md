# Card art style guide

Every card has an SVG icon at `src/content/art/<card id>.svg`; upgraded cards (`<id>+`) reuse the base card's. Cards without a file fall back to the generated emblem. Per-card subjects are in `docs/art-briefs.json`.

This is placeholder art: simple geometric line icons, meant to be replaced by illustrated art later. To swap in raster art, change the glob pattern in `src/ui/art.ts` (one file per card id).

## Style: geometric line icon on a faction disc

- **One subject, one silhouette**, recognisable at 40 px (board tokens) and without colour.
- **Geometric, not hand-drawn.** Use straight segments, 45° and 90° angles, true circular arcs (`a` in paths) and symmetry where the subject allows. Put coordinates on an even grid (whole even numbers). No wobbly freehand curves. Quadratic curves and arcs are fine for organic parts that need them, such as tentacles, tails, flames and smoke, but keep them smooth and few.
- **Lines only.** Every mark is a 4-unit stroke with round caps and joins. No fills, no shading and no second colour.
- **Fill the disc.** The subject spans about x 14–86 and y 10–90. Cost 1–2 creatures are a little smaller; cost 5+ and legendaries fill the disc.
- **Spells** show an object or action (bolt, shield, swirl, burst), not a character. A diagonal or radial layout sets them apart from units.
- **Leave space.** Keep at least 6 units between parallel lines, so they don't merge at 40 px. Use 4–12 strokes per icon.
- **No text, letters or numbers.** No logos, and no copies of characters from existing games.

## Exact structure (enforced by `tests/unit/art.test.ts`)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="DISC"/><g fill="none" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke="LINE">…shapes…</g></svg>
```

- Inside the `<g>`: only `path line polyline polygon circle ellipse rect`. Shapes carry no `fill`, `stroke`, `stroke-width`, `opacity` or `transform` attributes; everything is inherited.
- The file is at most 2048 bytes (typically about 400).

| Faction | Theme                          | DISC      | LINE      |
| ------- | ------------------------------ | --------- | --------- |
| Ember   | fire, volcanoes, aggression    | `#3a1418` | `#ff9a3c` |
| Tide    | water, sea, magic, cunning     | `#0f2440` | `#8fd0ff` |
| Grove   | nature, growth, beasts         | `#14301b` | `#a6d96a` |
| Bastion | stone, order, knights, defence | `#2b2a26` | `#e8e2cf` |
| Dusk    | shadow, night, death, trickery | `#221333` | `#c9a3f0` |

## Checking your work

`pnpm art:sheet <faction or id prefix>` writes `art-sheets/<filter>.png`, showing each card at 120, 64 and 40 px. Look at it. At 40 px the subject must still be recognisable. Cards in a faction must also look like one set, and like the reference pieces.

Reference pieces: `ember-spark-imp`, `tide-kraken`, `grove-elder-stag`, `bastion-shieldbearer`, `dusk-shadow-bolt`.
