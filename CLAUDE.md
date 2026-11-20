# Lanefall

Portrait-mode, single-player 3-lane card battler (PWA). **The spec is `docs/spec.md` — it is the source of truth.**

## Commands

- `pnpm dev` — dev server
- `pnpm lint` — ESLint + Prettier check (`pnpm format` to fix)
- `pnpm typecheck` — `tsc -b`
- `pnpm test` — Vitest unit and simulation tests
- `pnpm e2e` — Playwright (builds, serves on :4173, tests at 360×740, 390×844, 430×932)
- `pnpm sim` — bot-vs-bot balance simulator (from M1)
- `pnpm build` — production build (`VITE_BASE=/lanefall/` for GitHub Pages; CI sets it)

## Folder rules

- `src/engine/` — pure rules. No React, no DOM, no `src/ui` imports. Lint bans `Math.random` and `Date`
  here and in `src/run/` and `src/ai/`: all randomness comes from the seeded RNG in game state.
- `src/content/` — JSON content, validated by Zod schemas.
- `src/run/`, `src/ai/`, `src/save/` — roguelike run, opponent planners, persistence.
- `src/ui/` — React screens. Only sends actions to the engine and animates returned events; never computes results.
- `tools/sim/` — CLI simulator. `tests/unit`, `tests/e2e` — tests.

## Working rules

- One milestone (M0–M8, see spec) per branch and PR; don't start the next until CI is green.
- Spec silent on something? Pick the simplest option and log it in `docs/decisions.md` (date, question, decision).
- Any game-rule change updates `docs/spec.md` in the same PR.
- After UI changes, run `pnpm e2e` and look at `test-results/screens/*.png` before committing.
- New dependency → one-line reason in the PR description.
