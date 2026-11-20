// Easy AI: random legal plays, preferring to spend its mana. Uses its own RNG stream.
import { applyAction, legalActions, type Action, type GameState, type PlayerId } from '../engine';
import { nextInt, type RngState } from '../engine/rng';

export interface PlanResult {
  actions: Action[];
  rng: RngState;
}

/** Picks plays one at a time until nothing more is affordable, then ends the turn. */
export function planEasy(state: GameState, player: PlayerId, rng: RngState): PlanResult {
  const actions: Action[] = [];
  let s = state;
  let r = rng;
  if (s.phase === 'mulligan') {
    return { actions: [{ type: 'mulligan', player, uids: [] }], rng: r };
  }
  for (let i = 0; i < 20; i++) {
    const plays = legalActions(s, player).filter((a) => a.type === 'plan');
    if (plays.length === 0) break;
    const [pick, next] = nextInt(r, 0, plays.length - 1);
    r = next;
    const action = plays[pick]!;
    s = applyAction(s, action);
    actions.push(action);
  }
  actions.push({ type: 'endTurn', player });
  return { actions, rng: r };
}
