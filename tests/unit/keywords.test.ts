import { describe, expect, it } from 'vitest';
import { lanePower, legalActions, unitPower } from '../../src/engine';
import { byUid, clearHands, give, place, plan, resolve, setup } from './helpers';

function board() {
  const s = setup({ heroHp: 100 });
  clearHands(s);
  s.players[0].mana = 8;
  s.players[1].mana = 8;
  return s;
}

describe('keywords', () => {
  it('Guard: enemy lane damage is assigned to Guard units first', () => {
    let s = board();
    place(s, 0, 0, 'ember-spark-imp'); // 2 power
    const plain = place(s, 1, 0, 'bastion-recruit'); // played first, 1/2
    const guard = place(s, 1, 0, 'bastion-wall-warden'); // Guard 2/4
    s = resolve(s).state;
    expect(byUid(s, guard.uid)!.damage).toBe(2);
    expect(byUid(s, plain.uid)!.damage).toBe(0);
  });

  it('Barrier: prevents the next damage, then is removed', () => {
    let s = board();
    place(s, 0, 0, 'ember-magma-brute'); // 6 power
    const paladin = place(s, 1, 0, 'bastion-paladin'); // 3/3 Barrier
    paladin.basePower = 0; // so the brute survives to attack again
    s = resolve(s).state;
    const after = byUid(s, paladin.uid)!;
    expect(after.damage).toBe(0);
    expect(after.barrier).toBe(false);
    // Barrier soaks the paladin's share; the rest overflows to the hero.
    expect(s.players[1].hp).toBe(97);
    s = resolve(s).state;
    expect(byUid(s, paladin.uid)).toBeUndefined();
  });

  it('Pierce: power skips enemy units and goes to the hero', () => {
    let s = board();
    place(s, 0, 0, 'ember-skyfire-archer'); // 2/3 Pierce
    const wall = place(s, 1, 0, 'bastion-wall-warden');
    wall.basePower = 0;
    s = resolve(s).state;
    expect(byUid(s, wall.uid)!.damage).toBe(0);
    expect(s.players[1].hp).toBe(98);
  });

  it('Rally: on reveal, other friendly units in the lane get +1 Power this round', () => {
    let s = board();
    const ally = place(s, 0, 0, 'bastion-recruit');
    const other = place(s, 0, 1, 'bastion-recruit');
    const squire = give(s, 0, 'bastion-squire');
    s = plan(s, 0, { type: 'playUnit', uid: squire, lane: 0, slot: 1 });
    const { state, events } = resolve(s);
    expect(events).toContainEqual({
      type: 'UnitBuffed',
      uid: ally.uid,
      power: 1,
      health: 0,
      duration: 'round',
    });
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'UnitBuffed', uid: other.uid }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'LaneCombat', lane: 0, power: [3, 0] }));
    expect(byUid(state, ally.uid)!.roundPower).toBe(0);
  });

  it('Growth: +1 Power and +1 Health at End of Round', () => {
    let s = board();
    const u = place(s, 0, 0, 'bastion-recruit', { keywords: ['growth'] });
    s = resolve(s).state;
    expect(byUid(s, u.uid)).toMatchObject({ basePower: 2, baseHealth: 3 });
  });

  it('Regenerate: fully healed at End of Round', () => {
    const s = board();
    const u = place(s, 0, 0, 'bastion-shield-sergeant', { keywords: ['regenerate'] }); // 3/5
    u.basePower = 0;
    place(s, 1, 0, 'ember-magma-brute').basePower = 4;
    const res = resolve(s);
    expect(res.events).toContainEqual({ type: 'DamageDealt', uid: u.uid, amount: 4 });
    expect(byUid(res.state, u.uid)!.damage).toBe(0);
  });

  it('Lifesteal: when the lane deals hero damage, heal by this unit’s Power', () => {
    let s = board();
    s.players[0].hp = 90;
    place(s, 0, 0, 'ember-magma-brute', { keywords: ['lifesteal'] }); // 6 power
    s = resolve(s).state;
    expect(s.players[1].hp).toBe(94);
    expect(s.players[0].hp).toBe(96);

    let t = board();
    t.players[0].hp = 90;
    place(t, 0, 0, 'ember-spark-imp', { keywords: ['lifesteal'] });
    const wall = place(t, 1, 0, 'bastion-cathedral-guard');
    wall.basePower = 0;
    t = resolve(t).state;
    expect(t.players[0].hp).toBe(90); // No hero damage, no healing.
  });

  it('Lifesteal healing cannot exceed starting HP', () => {
    let s = board();
    place(s, 0, 0, 'ember-magma-brute', { keywords: ['lifesteal'] });
    s = resolve(s).state;
    expect(s.players[0].hp).toBe(100);
  });

  it('Shift: may move to another lane once per match during planning', () => {
    let s = board();
    const u = place(s, 0, 0, 'bastion-recruit', { keywords: ['shift'] });
    const shifts = legalActions(s, 0).filter((a) => a.type === 'plan' && a.action.type === 'shift');
    expect(shifts.length).toBeGreaterThan(0);
    s = plan(s, 0, { type: 'shift', uid: u.uid, lane: 2, slot: 0 });
    const res = resolve(s);
    expect(res.events).toContainEqual({ type: 'UnitMoved', uid: u.uid, from: 0, to: 2, slot: 0 });
    s = res.state;
    expect(s.lanes[2].slots[0][0]?.uid).toBe(u.uid);
    expect(() => plan(s, 0, { type: 'shift', uid: u.uid, lane: 1, slot: 0 })).toThrow(/already used/);
    expect(() => plan(s, 0, { type: 'shift', uid: u.uid, lane: 2, slot: 1 })).toThrow();
  });

  it('Shift: rejects units without Shift and unknown units', () => {
    const s = board();
    const u = place(s, 0, 0, 'bastion-recruit');
    expect(() => plan(s, 0, { type: 'shift', uid: u.uid, lane: 1, slot: 0 })).toThrow(/cannot Shift/);
    expect(() => plan(s, 0, { type: 'shift', uid: 4242, lane: 1, slot: 0 })).toThrow(/no such unit/);
    const v = place(s, 0, 1, 'bastion-recruit', { keywords: ['shift'] });
    expect(() => plan(s, 0, { type: 'shift', uid: v.uid, lane: 1, slot: 1 })).toThrow(/already in that lane/);
  });

  it('Shift: a planned move into a lane that has filled up does nothing', () => {
    let s = setup({ heroHp: 100, lanes: ['lane-plain', 'lane-narrows', 'lane-plain'] });
    clearHands(s);
    s.players[0].mana = 8;
    s.lanes[1].revealed = true;
    const u = place(s, 0, 0, 'bastion-recruit', { keywords: ['shift'] });
    place(s, 0, 1, 'bastion-recruit');
    const captain = give(s, 0, 'bastion-muster-captain');
    s = plan(s, 0, { type: 'shift', uid: u.uid, lane: 1, slot: 3 });
    s = plan(s, 0, { type: 'playUnit', uid: captain, lane: 2, slot: 0 });
    // Fill Narrows after planning so the shift's destination is gone when it reveals.
    place(s, 0, 1, 'bastion-recruit');
    s = resolve(s).state;
    expect(byUid(s, u.uid)).toBeDefined();
    expect(s.lanes[0].slots[0].some((x) => x?.uid === u.uid)).toBe(true);
    expect(byUid(s, u.uid)!.shiftUsed).toBe(false);
  });

  it('Ephemeral: dies at End of Round', () => {
    const s = board();
    const u = place(s, 0, 0, 'ember-flame-dancer');
    const { state, events } = resolve(s);
    expect(byUid(state, u.uid)).toBeUndefined();
    expect(events).toContainEqual(expect.objectContaining({ type: 'UnitDied', uid: u.uid }));
    expect(state.players[1].hp).toBe(97);
  });

  it('On Reveal: resolves when the card reveals', () => {
    let s = board();
    const runner = give(s, 0, 'ember-blaze-runner');
    s = plan(s, 0, { type: 'playUnit', uid: runner, lane: 1, slot: 0 });
    const { events } = resolve(s);
    const revealed = events.findIndex((e) => e.type === 'UnitPlaced' && e.uid === runner);
    const hit = events.findIndex((e) => e.type === 'HeroDamaged' && e.lane === null);
    const combat = events.findIndex((e) => e.type === 'LaneCombat');
    expect(revealed).toBeLessThan(hit);
    expect(hit).toBeLessThan(combat);
  });

  it('Ongoing: applies while the unit is in play', () => {
    const s = board();
    const ally = place(s, 0, 0, 'bastion-recruit');
    const drummer = place(s, 0, 0, 'ember-war-drummer');
    const elsewhere = place(s, 0, 1, 'bastion-recruit');
    const loc = (u: typeof ally, lane: 0 | 1, slot: number) => ({ unit: u, lane, slot });
    expect(unitPower(s, loc(ally, 0, 0))).toBe(2);
    expect(unitPower(s, loc(drummer, 0, 1))).toBe(3);
    expect(unitPower(s, loc(elsewhere, 1, 0))).toBe(1);
    expect(lanePower(s, 0, 0)).toBe(5);
    s.lanes[0].slots[0][1] = null;
    expect(unitPower(s, loc(ally, 0, 0))).toBe(1);
  });

  it('Ongoing: losing a Health aura can kill a damaged unit', () => {
    let s = board();
    const ally = place(s, 0, 0, 'bastion-recruit', { damage: 2 }); // 1/2 + 1 Health from the aura
    const bearer = place(s, 0, 0, 'bastion-standard-bearer');
    bearer.doomed = true; // dies at the next death check
    const res = resolve(s);
    s = res.state;
    expect(byUid(s, ally.uid)).toBeUndefined();
  });

  it('Last Breath: resolves when the unit dies', () => {
    const s = board();
    place(s, 0, 0, 'ember-inferno-titan', { damage: 2 }); // 6/3, one more damage kills it
    place(s, 1, 0, 'ember-spark-imp');
    const { state, events } = resolve(s);
    const died = events.findIndex((e) => e.type === 'UnitDied' && e.cardId === 'ember-inferno-titan');
    const breath = events.findIndex((e, i) => i > died && e.type === 'HeroDamaged' && e.lane === null);
    expect(died).toBeGreaterThan(-1);
    expect(breath).toBeGreaterThan(died);
    expect(state.players[1].hp).toBeLessThan(100);
  });

  it('keywords can be granted by effects', () => {
    let s = board();
    const a = place(s, 0, 1, 'bastion-recruit');
    const shield = give(s, 0, 'bastion-divine-shield');
    s = plan(s, 0, { type: 'playSpell', uid: shield, target: { kind: 'lane', lane: 1 } });
    const { state, events } = resolve(s);
    expect(events).toContainEqual({ type: 'KeywordGranted', uid: a.uid, keyword: 'barrier' });
    expect(byUid(state, a.uid)).toMatchObject({ barrier: true });
  });
});
