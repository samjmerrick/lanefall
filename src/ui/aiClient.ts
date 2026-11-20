// Runs the AI in a Web Worker so planning never blocks the UI; falls back to the main thread.
import { plan, type AiHooks, type Difficulty, type PlanResult } from '../ai';
import type { GameState, PlayerId } from '../engine';
import type { AiRequest } from './ai.worker';

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, (r: PlanResult) => void>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; result: PlanResult }>) => {
      pending.get(e.data.id)?.(e.data.result);
      pending.delete(e.data.id);
    };
  } catch {
    worker = null;
  }
  return worker;
}

export function runAi(
  difficulty: Difficulty,
  state: GameState,
  player: PlayerId,
  rng: number,
  hooks: AiHooks = {},
): Promise<PlanResult> {
  const w = getWorker();
  if (!w)
    return Promise.resolve(plan(difficulty, state, player, rng, hooks, { now: () => performance.now() }));
  const id = nextId++;
  const req: AiRequest = { id, difficulty, state, player, rng, hooks };
  return new Promise((resolve) => {
    pending.set(id, resolve);
    w.postMessage(req);
  });
}
