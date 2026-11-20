import type { GameState, PlayerId } from '../engine';
import type { RngState } from '../engine/rng';
import { planEasy, type PlanResult } from './easy';
import { planNormal, type AiHooks } from './normal';

export type Difficulty = 'easy' | 'normal';
export type { PlanResult, AiHooks };

/** Every planner shares this shape: plan(state, player, rng) → actions plus the advanced AI RNG. */
export function plan(
  difficulty: Difficulty,
  state: GameState,
  player: PlayerId,
  rng: RngState,
  hooks: AiHooks = {},
): PlanResult {
  return difficulty === 'easy' ? planEasy(state, player, rng) : planNormal(state, player, rng, hooks);
}
