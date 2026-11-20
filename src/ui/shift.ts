// Shift by drag: which of your units may Shift now, and where. Read from the engine's legal actions;
// the UI adds no rules of its own.
import { legalActions, type GameState, type PlannedAction } from '../engine';
import { dropKey } from './drag';
import { HUMAN, useMatch } from './store';

/** Unit uid → drop key → the shift it would plan. */
export type ShiftTargets = Map<number, Map<string, PlannedAction>>;

const EMPTY: ShiftTargets = new Map();
const cache = new WeakMap<GameState, ShiftTargets>();

/** The shifts the engine offers `HUMAN` in this state, grouped by unit. Cached per state object. */
export function shiftTargets(game: GameState): ShiftTargets {
  const hit = cache.get(game);
  if (hit) return hit;
  const out: ShiftTargets = new Map();
  for (const a of legalActions(game, HUMAN)) {
    if (a.type !== 'plan' || a.action.type !== 'shift') continue;
    const targets = out.get(a.action.uid) ?? new Map<string, PlannedAction>();
    targets.set(dropKey(a.action), a.action);
    out.set(a.action.uid, targets);
  }
  cache.set(game, out);
  return out;
}

/** Shiftable units right now. Empty while a round plays, and in the tutorial (it scripts every play). */
export function useShiftTargets(): ShiftTargets {
  const game = useMatch((s) => s.game);
  const busy = useMatch((s) => s.busy);
  const tutorial = useMatch((s) => s.mode === 'tutorial');
  if (!game || busy || tutorial) return EMPTY;
  return shiftTargets(game);
}
