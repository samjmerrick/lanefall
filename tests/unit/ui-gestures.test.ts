// Audit: every action the engine offers for every card (and its upgrade) must map to a drop zone the board
// renders (src/ui/Board.tsx), and no two actions of one card may share a zone (the drag would be ambiguous).
import { describe, expect, it } from 'vitest';
import { CARDS, getCard, legalActions, type PlannedAction } from '../../src/engine';
import { dropKey } from '../../src/ui/drag';
import { FILLER, clearHands, give, place, plan, setup } from './helpers';

const ids = CARDS.filter((c) => !c.token).flatMap((c) => [c.id, `${c.id}+`]);

describe('every card is playable through a drop zone the UI renders', () => {
  for (const id of new Set(ids)) {
    it(id, () => {
      const s = setup();
      clearHands(s);
      s.players[0].mana = 10;
      for (const lane of [0, 1, 2] as const) {
        place(s, 0, lane, FILLER, { slot: 1 });
        place(s, 1, lane, FILLER, { slot: 1 });
      }
      // A unit planned this turn: friendly spells may target it through its ghost token.
      const plannedUid = give(s, 0, FILLER);
      let g = plan(s, 0, { type: 'playUnit', uid: plannedUid, lane: 0, slot: 0 });
      const uid = give(g, 0, id);
      const onBoard = new Set<number>();
      for (const lane of g.lanes)
        for (const side of lane.slots) for (const u of side) if (u) onBoard.add(u.uid);

      const actions = legalActions(g, 0).flatMap((a) =>
        a.type === 'plan' && a.action.uid === uid ? [a.action] : [],
      );
      expect(actions.length, 'no legal play').toBeGreaterThan(0);
      const keys = new Map<string, PlannedAction>();
      for (const a of actions) {
        const key = dropKey(a);
        expect(keys.has(key), `two actions share ${key}`).toBe(false);
        keys.set(key, a);
        const rendered =
          key === 'board' ||
          /^lane:[012]$/.test(key) ||
          /^slot:[012]:[0-3]$/.test(key) ||
          (key.startsWith('unit:') &&
            (onBoard.has(Number(key.slice(5))) || Number(key.slice(5)) === plannedUid));
        expect(rendered, `no drop zone for ${key}`).toBe(true);
      }
      const def = getCard(id);
      if (def.type === 'unit') expect(keys.size).toBeGreaterThan(0);
      else if (def.targeting === 'none') expect([...keys.keys()]).toEqual(['board']);
      else if (def.targeting === 'lane')
        expect([...keys.keys()].sort()).toEqual(['lane:0', 'lane:1', 'lane:2']);
      else {
        expect([...keys.keys()].every((k) => k.startsWith('unit:'))).toBe(true);
        // Friendly spells reach the planned unit; enemy-only spells never offer it.
        expect(keys.has(`unit:${plannedUid}`)).toBe(def.targeting !== 'enemyUnit');
      }
      g = plan(g, 0, actions[0]!);
      expect(g.players[0].plan).toHaveLength(2);
    });
  }

  it('Shift offers one distinct drop slot per empty slot in other lanes', () => {
    const s = setup();
    clearHands(s);
    const u = place(s, 0, 0, FILLER, { keywords: ['shift'] });
    const shifts = legalActions(s, 0).flatMap((a) =>
      a.type === 'plan' && a.action.type === 'shift' && a.action.uid === u.uid ? [a.action] : [],
    );
    expect(shifts).toHaveLength(8);
    expect(new Set(shifts.map(dropKey)).size).toBe(8);
    expect(shifts.every((a) => a.type === 'shift' && a.lane !== 0)).toBe(true);
  });
});
