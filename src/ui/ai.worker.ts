/// <reference lib="webworker" />
import { plan, type Difficulty } from '../ai';
import type { GameState, PlayerId } from '../engine';

export interface AiRequest {
  id: number;
  difficulty: Difficulty;
  state: GameState;
  player: PlayerId;
  rng: number;
}

self.onmessage = (e: MessageEvent<AiRequest>) => {
  const { id, difficulty, state, player, rng } = e.data;
  self.postMessage({ id, result: plan(difficulty, state, player, rng) });
};
