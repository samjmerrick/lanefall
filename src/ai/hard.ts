// Hard AI: take Normal's 20 best plans, then score each against 30 sampled opponent plans and pick the
// best average. The opponent's hand is hidden: each sample deals them a guessed hand from the cards
// they have not played (their hand and deck together), then picks one of their strongest plays.
//
// Work is a fixed amount, so the result is deterministic for a given AI RNG. A clock can be passed
// (the UI's worker does): if the budget runs out, the best plan so far is returned. Samples run in
// the outer loop, so every candidate has been scored against the same opponents at any cut-off.
import { other, type GameState, type PlannedAction, type PlayerId } from '../engine';
import { nextInt, shuffle, type RngState } from '../engine/rng';
import type { PlanResult } from './easy';
import {
  enumeratePlans,
  arrangeSlots,
  evaluate,
  hideOpponent,
  mulliganChoice,
  simulate,
  toActions,
  type AiHooks,
} from './normal';

export const HARD_CANDIDATES = 20;
export const HARD_SAMPLES = 30;
/** Opponent plans considered per sample; one of these is picked at random. */
const OPPONENT_OPTIONS = 6;
export const HARD_BUDGET_MS = 500;

export interface Clock {
  now(): number;
  budgetMs?: number;
}

/** A copy of `s` where the opponent holds a random hand drawn from their unseen cards. */
function guessOpponent(s: GameState, player: PlayerId, rng: RngState): [GameState, RngState] {
  const opp = other(player);
  const p = s.players[opp];
  const unseen = [...p.hand.map((h) => h.cardId), ...p.deck];
  const [cards, next] = shuffle(rng, unseen);
  const hand = p.hand.map((h, i) => ({ uid: h.uid, cardId: cards[i]! }));
  const players = [...s.players] as GameState['players'];
  players[opp] = { ...p, hand };
  return [{ ...s, players }, next];
}

export function planHard(
  state: GameState,
  player: PlayerId,
  rng: RngState,
  hooks: AiHooks = {},
  clock?: Clock,
): PlanResult {
  if (state.phase === 'mulligan') return { actions: [mulliganChoice(state, player)], rng };
  const start = clock?.now() ?? 0;
  const outOfTime = () => clock !== undefined && clock.now() - start > (clock.budgetMs ?? HARD_BUDGET_MS);
  const base = hideOpponent(state, player);
  const opp = other(player);

  // Opponent plans to test against: the real plan for a boss that sees it, otherwise samples.
  const samples: { s: GameState; plan: PlannedAction[] }[] = [];
  if (hooks.seesPlan) samples.push({ s: base, plan: state.players[opp].plan });

  // Candidates: Normal's best plans against an empty opponent plan.
  const candidates = enumeratePlans(base, player)
    .map((plan) => ({ plan, score: evaluate(simulate(base, player, plan), player) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, HARD_CANDIDATES)
    .map((c) => ({ plan: c.plan, total: 0 }));

  let r = rng;
  const sampleCount = hooks.seesPlan ? 1 : HARD_SAMPLES;
  for (let i = 0; i < sampleCount && !outOfTime(); i++) {
    let sample = samples[i];
    if (!sample) {
      let guessed: GameState;
      [guessed, r] = guessOpponent(base, player, r);
      const options = enumeratePlans(guessed, opp, OPPONENT_OPTIONS);
      let pick: number;
      [pick, r] = nextInt(r, 0, options.length - 1);
      sample = { s: guessed, plan: options[pick]! };
    }
    for (const c of candidates) c.total += evaluate(simulate(sample.s, player, c.plan, sample.plan), player);
  }

  let best = candidates[0]!;
  for (const c of candidates) if (c.total > best.total) best = c;
  return { actions: toActions(player, arrangeSlots(base, player, best.plan)), rng: r };
}
