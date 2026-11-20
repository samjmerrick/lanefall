import type { GameState, PlayerId } from '../engine';
import type { RngState } from '../engine/rng';
import { planEasy, type PlanResult } from './easy';
import { planHard, type Clock } from './hard';
import { planNormal, type AiHooks } from './normal';

export type Difficulty = 'easy' | 'normal' | 'hard';
export type { PlanResult, AiHooks, Clock };

/**
 * Every planner shares this shape: plan(state, player, rng) → actions plus the advanced AI RNG.
 * `clock` lets Hard stop early at its time budget; without it, Hard does its full (deterministic) search.
 */
export function plan(
  difficulty: Difficulty,
  state: GameState,
  player: PlayerId,
  rng: RngState,
  hooks: AiHooks = {},
  clock?: Clock,
): PlanResult {
  if (difficulty === 'easy') return planEasy(state, player, rng);
  if (difficulty === 'hard') return planHard(state, player, rng, hooks, clock);
  return planNormal(state, player, rng, hooks);
}
