/// <reference lib="webworker" />
import { plan, type AiHooks, type Difficulty } from '../ai';
import type { GameState, PlayerId } from '../engine';

export interface AiRequest {
  id: number;
  difficulty: Difficulty;
  state: GameState;
  player: PlayerId;
  rng: number;
  hooks?: AiHooks;
}

self.onmessage = (e: MessageEvent<AiRequest>) => {
  const { id, difficulty, state, player, rng, hooks } = e.data;
  self.postMessage({ id, result: plan(difficulty, state, player, rng, hooks, { now: () => performance.now() }) });
};
