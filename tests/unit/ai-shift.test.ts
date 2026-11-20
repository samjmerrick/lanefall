import { describe, expect, it } from 'vitest';
import { applyAction } from '../../src/engine';
import { plan } from '../../src/ai';
import { seedRng } from '../../src/engine/rng';
import { clearHands, place, setup } from './helpers';

/** The AI's lone 1/1 Shift unit faces a 5/5 in lane 0; lanes 1 and 2 are empty on the other side. */
function pinned() {
  const s = setup();
  clearHands(s);
  const unit = place(s, 1, 0, 'tide-mist-sprite');
  place(s, 0, 0, 'bastion-paladin');
  return { s, unit };
}

describe('AI and Shift', () => {
  for (const difficulty of ['normal', 'hard'] as const) {
    it(`${difficulty} shifts a unit out of a losing lane, and the plan is legal`, () => {
      const { s, unit } = pinned();
      const { actions } = plan(difficulty, s, 1, seedRng(5));
      const shift = actions.flatMap((a) =>
        a.type === 'plan' && a.action.type === 'shift' ? [a.action] : [],
      );
      expect(shift).toHaveLength(1);
      expect(shift[0]!.uid).toBe(unit.uid);
      expect(shift[0]!.lane).not.toBe(0);
      let g = s;
      for (const a of actions) g = applyAction(g, a);
      expect(g.players[1].ready).toBe(true);
    });

    it(`${difficulty} is deterministic with a Shift on offer`, () => {
      const { s } = pinned();
      expect(plan(difficulty, s, 1, seedRng(9))).toEqual(plan(difficulty, s, 1, seedRng(9)));
    });
  }
});
