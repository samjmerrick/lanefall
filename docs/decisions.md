# Decisions

Choices made where `docs/spec.md` is silent. Newest last.

| Date       | Question                                   | Decision                                                                                                                         |
| ---------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-20 | TypeScript version                         | Pin `~6.0` — typescript-eslint does not yet support TypeScript 7.                                                                |
| 2026-11-20 | GitHub Pages base path                     | Build reads `VITE_BASE` (default `/`); the deploy job sets `/<repo>/`.                                                           |
| 2026-11-20 | When does CI run, and when does it deploy? | Lint, typecheck, unit and e2e run on every push and PR; deploy to Pages only on push to `main` after checks pass.                |
| 2026-11-20 | Determinism lint rule scope                | Bans `Math.random`, `Date` and `performance` in `src/engine`, `src/run`, `src/ai`; also bans imports of React or `src/ui` there. |
| 2026-11-20 | Hand fan at narrow widths                  | Card spacing shrinks with viewport width (max 62 px) so 8 cards fit at 360 px with no overflow.                                  |
| 2026-11-20 | Landscape threshold                        | Show "Rotate your phone" when landscape and height ≤ 500 px, so desktop browsers still show the game.                            |
| 2026-11-20 | PWA icons                                  | Generated from `public/icon.svg` by `tools/render-icons.ts` and committed.                                                       |
| 2026-11-20 | `workbox-window`                           | Added as a dev dependency; `vite-plugin-pwa`'s register module imports it and the build fails without it.                        |
