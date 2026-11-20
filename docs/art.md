# Card art style guide

Every card has a hand-drawn SVG illustration at `src/content/art/<card id>.svg`. Upgraded cards (`<id>+`) reuse their base card's art. Cards without art fall back to the generated emblem. Per-card subjects are in `docs/art-briefs.json`.

## Style: bold flat medallion

- **One subject, one silhouette.** It must read at 40 px (board tokens). Ask: could you name it from its shadow alone?
- **Medallion backdrop.** Every piece starts with the faction disc: `<circle cx="50" cy="50" r="46" fill="DISC"/>`. The subject sits on it and may break out past its edge (horns, wings, flames), but stays inside the 100×100 box with about 2 units of margin. Outside the disc is transparent.
- **Outline.** All subject shapes get the shared outline colour `#14161d` with `stroke-width="3"` and `stroke-linejoin="round"`. Small inner details (eyes, cracks) can use `stroke-width="2"` or a plain fill with no stroke.
- **Flat fills, 3–4 tones.** Use the faction's dark, main and light tones, plus at most one accent. Shade with a single darker shape on one side (light from the top left), never with gradients. Gradients are allowed only as one radial glow behind the subject on a spell, and even then sparingly.
- **Scale tells cost.** Cost 1–2 creatures are small and cute and fill about 60% of the disc. Cost 5+ fill the disc or burst out of it, so they look imposing. Legendaries get one extra flourish, such as a crown, halo or aura ring.
- **Spells** show an object or action (a bolt, a shield, a swirl), not a character. Use a strong diagonal or radial burst so they read differently from units.
- **No text, letters or numbers** in the art. No faces of real people, no logos, no copies of existing games' characters.

## Palettes

Shared: outline `#14161d`, bone/white `#f4efe6`, steel `#5b6170`.

| Faction | Theme | Disc | Dark | Main | Light | Accent |
|---|---|---|---|---|---|---|
| Ember | fire, volcanoes, aggression | `#3a1418` | `#8f1d22` | `#e5484d` | `#ff9a3c` | `#ffd36b` (hot glow) |
| Tide | water, sea, magic, cunning | `#0f2440` | `#1d4f8f` | `#3e93f7` | `#8fd0ff` | `#e6f6ff` (foam) |
| Grove | nature, growth, beasts | `#14301b` | `#2c6b38` | `#46a758` | `#a6d96a` | `#8a5a34` (bark) |
| Bastion | stone, order, knights, defence | `#2b2a26` | `#8c8572` | `#e8e2cf` | `#ffffff` | `#d9a520` (gold) |
| Dusk | shadow, night, death, trickery | `#221333` | `#4d2a73` | `#8e4ec6` | `#c9a3f0` | `#7cf2c2` (spectral eyes) |

Stay inside your faction's palette and the shared colours. A creature's skin, fur or armour uses the faction tones (for example, Ember imps are red, not grey).

## Technical rules (enforced by `tests/unit/art.test.ts`)

- The root element is `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">`, with no width or height.
- Allowed elements: `svg g path circle ellipse rect polygon polyline line defs linearGradient radialGradient stop clipPath`. No `text`, `image`, `use`, `filter`, `style`, scripts, `href`, `on*` or `style=` attributes. `url(#id)` may only point at the file's own defs, and ids are prefixed with the card id (for example `ember-meteor-glow`).
- The file is at most 4096 bytes; aim for under 2.5 KB. Round coordinates to whole numbers or one decimal, and remove editor cruft.
- Use presentation attributes (`fill=`, `stroke=`), and a `<g>` to share stroke settings.

## Checking your work

`pnpm art:sheet <faction>` writes `art-sheets/<faction>.png`, showing each card's art at 120, 64 and 40 px on the card frame. Look at it. At 40 px the subject must still be recognisable and must not turn into mush or a blob. Compare against the reference pieces, so a faction looks like one set.

Reference pieces: `ember-spark-imp`, `tide-kraken`, `grove-elder-stag`, `bastion-shieldbearer`, `dusk-shadow-bolt`.
