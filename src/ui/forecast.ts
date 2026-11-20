// The combat forecast shown while planning. The engine computes it; the UI only displays it.
import { previewCombat, type CombatPreview, type GameState } from '../engine';
import { HUMAN, useMatch } from './store';

const cache = new WeakMap<GameState, CombatPreview>();

/** Forecast for the current plan, or null while the round animates, during the mulligan and after the match. */
export function useForecast(): CombatPreview | null {
  return useMatch((s) => {
    const g = s.game;
    if (!g || s.busy || g.phase !== 'plan' || g.result) return null;
    let p = cache.get(g);
    if (!p) {
      p = previewCombat(g, HUMAN);
      cache.set(g, p);
    }
    return p;
  });
}
