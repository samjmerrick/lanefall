// Plays bot-vs-bot matches through the public engine API.
import { plan, type AiHooks, type Difficulty } from '../../src/ai';
import {
  applyAction,
  initMatch,
  resolveRound,
  type GameEvent,
  type GameState,
  type MatchConfig,
  type PlayerId,
} from '../../src/engine';
import { seedRng, type RngState } from '../../src/engine/rng';

export interface MatchRecord {
  seed: number;
  final: GameState;
  events: GameEvent[];
}

/** AI streams are derived from the match seed but separate from the match RNG. */
function aiSeed(seed: number, player: PlayerId): RngState {
  return seedRng((seed ^ (0x9e3779b9 * (player + 1))) >>> 0);
}

export function playBotMatch(
  config: MatchConfig,
  seed: number,
  difficulty: [Difficulty, Difficulty] = ['easy', 'easy'],
  hooks: [AiHooks, AiHooks] = [{}, {}],
): MatchRecord {
  let s = initMatch(config, seed);
  const rngs: [RngState, RngState] = [aiSeed(seed, 0), aiSeed(seed, 1)];
  const events: GameEvent[] = [];
  for (const p of [0, 1] as const) {
    const { actions, rng } = plan(difficulty[p], s, p, rngs[p]);
    rngs[p] = rng;
    for (const a of actions) s = applyAction(s, a);
  }
  for (let guard = 0; s.phase === 'plan'; guard++) {
    if (guard > 20) throw new Error(`Match ${seed} did not end`);
    for (const p of [0, 1] as const) {
      const { actions, rng } = plan(difficulty[p], s, p, rngs[p], hooks[p]);
      rngs[p] = rng;
      for (const a of actions) s = applyAction(s, a);
    }
    const res = resolveRound(s);
    s = res.state;
    events.push(...res.events);
  }
  return { seed, final: s, events };
}
