import { describe, expect, it } from 'vitest';
import { applyAction, initMatch, legalActions } from '../../src/engine';
import { clearHands, FILLER, give, place, setup } from './helpers';

describe('legalActions', () => {
  it('offers keep or replace-all during the mulligan, then nothing once done', () => {
    const deck = Array.from({ length: 30 }, () => FILLER);
    let s = initMatch({ decks: [deck, deck] }, 1);
    const options = legalActions(s, 0);
    expect(options).toHaveLength(2);
    expect(options[0]).toEqual({ type: 'mulligan', player: 0, uids: [] });
    s = applyAction(s, options[1]!);
    expect(legalActions(s, 0)).toEqual([]);
  });

  it('lists playable units per free slot, spell targets, and End Turn', () => {
    const s = setup();
    clearHands(s);
    s.players[0].mana = 8;
    const enemy = place(s, 1, 0, FILLER);
    place(s, 0, 1, FILLER);
    give(s, 0, FILLER);
    give(s, 0, 'ember-cinder-bolt');
    give(s, 0, 'bastion-rally-cry');
    give(s, 0, 'ember-fireball');
    give(s, 0, 'bastion-blessing');
    const acts = legalActions(s, 0);
    const plans = acts.flatMap((a) => (a.type === 'plan' ? [a.action] : []));
    expect(plans.filter((a) => a.type === 'playUnit')).toHaveLength(11);
    expect(
      plans.filter((a) => a.type === 'playSpell' && a.target.kind === 'unit' && a.target.uid === enemy.uid),
    ).toHaveLength(1);
    expect(plans.filter((a) => a.type === 'playSpell' && a.target.kind === 'lane')).toHaveLength(3);
    expect(plans.filter((a) => a.type === 'playSpell' && a.target.kind === 'none')).toHaveLength(1);
    expect(plans.filter((a) => a.type === 'playSpell' && a.target.kind === 'unit')).toHaveLength(2);
    expect(acts.at(-1)).toEqual({ type: 'endTurn', player: 0 });
  });

  it('every listed action is accepted by applyAction', () => {
    const s = setup();
    s.players[0].mana = 8;
    place(s, 0, 0, FILLER, { keywords: ['shift'] });
    place(s, 1, 2, FILLER);
    give(s, 0, 'ember-meteor');
    give(s, 0, 'bastion-divine-shield');
    for (const a of legalActions(s, 0)) expect(() => applyAction(s, a)).not.toThrow();
  });

  it('offers nothing after End Turn', () => {
    const s = applyAction(setup(), { type: 'endTurn', player: 0 });
    expect(legalActions(s, 0)).toEqual([]);
    expect(legalActions(s, 1).length).toBeGreaterThan(1);
  });
});
