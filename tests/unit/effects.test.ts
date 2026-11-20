import { describe, expect, it } from 'vitest';
import { processDeaths, runPrimitive, selectUnits, type Ctx, type Source } from '../../src/engine/effects';
import { byUid, clearHands, FILLER, give, place, plan, resolve, setup } from './helpers';

function ctx() {
  const s = setup({ heroHp: 20 });
  clearHands(s);
  const c: Ctx = { s, events: [] };
  return c;
}
const src = (
  lane: 0 | 1 | 2 | null = 0,
  unitUid: number | null = null,
  targetUid: number | null = null,
): Source => ({
  owner: 0,
  lane,
  unitUid,
  targetUid,
});

describe('effect primitives', () => {
  it('damage and heal heroes, healing capped at starting HP', () => {
    const c = ctx();
    runPrimitive(c, { op: 'damage', target: 'enemyHero', amount: 3 }, src());
    runPrimitive(c, { op: 'damage', target: 'friendlyHero', amount: 2 }, src());
    expect(c.s.players.map((p) => p.hp)).toEqual([18, 17]);
    runPrimitive(c, { op: 'heal', target: 'friendlyHero', amount: 5 }, src());
    runPrimitive(c, { op: 'heal', target: 'enemyHero', amount: 'full' }, src());
    expect(c.s.players.map((p) => p.hp)).toEqual([20, 20]);
  });

  it('heals units by an amount or fully', () => {
    const c = ctx();
    const u = place(c.s, 0, 0, 'bastion-cathedral-guard', { damage: 5 });
    runPrimitive(c, { op: 'heal', target: 'allFriendlyUnits', amount: 2 }, src());
    expect(u.damage).toBe(3);
    runPrimitive(c, { op: 'heal', target: 'allFriendlyUnits', amount: 'full' }, src());
    expect(u.damage).toBe(0);
    runPrimitive(c, { op: 'heal', target: 'allFriendlyUnits', amount: 2 }, src());
    expect(c.events.filter((e) => e.type === 'UnitHealed')).toHaveLength(2);
  });

  it('draws cards for the source owner', () => {
    const c = ctx();
    runPrimitive(c, { op: 'draw', count: 2 }, src());
    expect(c.s.players[0].hand).toHaveLength(2);
    expect(c.s.players[1].hand).toHaveLength(0);
  });

  it('summons into the source lane, and not without a lane or a free slot', () => {
    const c = ctx();
    runPrimitive(c, { op: 'summon', cardId: 'bastion-levy', count: 5 }, src(1));
    expect(c.s.lanes[1].slots[0].filter(Boolean)).toHaveLength(4);
    runPrimitive(c, { op: 'summon', cardId: 'bastion-levy', count: 1 }, src(null));
    expect(c.events.filter((e) => e.type === 'UnitSummoned')).toHaveLength(4);
  });

  it('moves units to another lane with a free slot', () => {
    const c = ctx();
    const u = place(c.s, 0, 0, FILLER);
    runPrimitive(c, { op: 'move', target: 'self' }, src(0, u.uid));
    expect(c.s.lanes[0].slots[0][0]).toBeNull();
    expect(c.events).toContainEqual(expect.objectContaining({ type: 'UnitMoved', uid: u.uid, from: 0 }));
  });

  it('gainMana adds mana next round', () => {
    let s = setup({ heroHp: 100 });
    const c: Ctx = { s, events: [] };
    runPrimitive(c, { op: 'gainMana', amount: 2 }, src());
    s = resolve(s).state;
    expect(s.players[0].mana).toBe(4);
    expect(s.players[1].mana).toBe(2);
  });

  it('destroy kills regardless of Barrier', () => {
    const c = ctx();
    const u = place(c.s, 1, 0, 'bastion-paladin');
    runPrimitive(c, { op: 'destroy', target: 'allEnemyUnits' }, src());
    processDeaths(c);
    expect(byUid(c.s, u.uid)).toBeUndefined();
  });

  it('buffs permanently or for the round', () => {
    const c = ctx();
    const u = place(c.s, 0, 0, FILLER);
    runPrimitive(
      c,
      { op: 'buff', target: 'self', power: 2, health: 1, duration: 'permanent' },
      src(0, u.uid),
    );
    runPrimitive(c, { op: 'buff', target: 'self', power: 1, health: 1, duration: 'round' }, src(0, u.uid));
    expect(u).toMatchObject({ basePower: 3, baseHealth: 3, roundPower: 1, roundHealth: 1 });
  });

  it('selectors pick the right units', () => {
    const c = ctx();
    const a = place(c.s, 0, 0, FILLER);
    const b = place(c.s, 0, 0, FILLER);
    const d = place(c.s, 0, 1, FILLER);
    const e1 = place(c.s, 1, 0, FILLER);
    const e2 = place(c.s, 1, 2, FILLER);
    const uids = (sel: Parameters<typeof selectUnits>[1], s: Source = src(0, a.uid)) =>
      selectUnits(c, sel, s)
        .map((l) => l.unit.uid)
        .sort();
    expect(uids('friendlyUnitsInLane')).toEqual([a.uid, b.uid].sort());
    expect(uids('otherFriendlyUnitsInLane')).toEqual([b.uid]);
    expect(uids('enemyUnitsInLane')).toEqual([e1.uid]);
    expect(uids('allUnitsInLane')).toEqual([a.uid, b.uid, e1.uid].sort());
    expect(uids('allFriendlyUnits')).toEqual([a.uid, b.uid, d.uid].sort());
    expect(uids('otherFriendlyUnits')).toEqual([b.uid, d.uid].sort());
    expect(uids('allEnemyUnits')).toEqual([e1.uid, e2.uid].sort());
    expect([e1.uid, e2.uid]).toContain(uids('randomEnemyUnit')[0]);
    expect(uids('randomEnemyUnitInLane')).toEqual([e1.uid]);
    expect([a.uid, b.uid, d.uid]).toContain(uids('randomFriendlyUnit')[0]);
    expect(uids('randomEnemyUnitInLane', src(1))).toEqual([]);
    expect(uids('target', src(0, null, e2.uid))).toEqual([e2.uid]);
    expect(uids('friendlyUnitsInLane', src(null))).toEqual([]);
  });
});

describe('starter card effects', () => {
  it('Torchbearer hits a random enemy unit in its lane', () => {
    let s = setup({ heroHp: 100 });
    clearHands(s);
    s.players[0].mana = 2;
    const enemy = place(s, 1, 2, 'bastion-cathedral-guard');
    enemy.basePower = 0;
    const t = give(s, 0, 'ember-torchbearer');
    s = plan(s, 0, { type: 'playUnit', uid: t, lane: 2, slot: 0 });
    const { events } = resolve(s);
    expect(events).toContainEqual({ type: 'DamageDealt', uid: enemy.uid, amount: 1 });
  });

  it('Meteor hits a unit and the enemy hero', () => {
    let s = setup({ heroHp: 100 });
    clearHands(s);
    s.players[0].mana = 5;
    const enemy = place(s, 1, 1, 'bastion-cathedral-guard');
    enemy.basePower = 0;
    const m = give(s, 0, 'ember-meteor');
    s = plan(s, 0, { type: 'playSpell', uid: m, target: { kind: 'unit', uid: enemy.uid } });
    const { state } = resolve(s);
    expect(byUid(state, enemy.uid)!.damage).toBe(5);
    expect(state.players[1].hp).toBe(98);
  });

  it('Grand Marshal gives other friendly units +1/+1 permanently', () => {
    let s = setup({ heroHp: 100 });
    clearHands(s);
    s.players[0].mana = 7;
    const ally = place(s, 0, 2, FILLER);
    const g = give(s, 0, 'bastion-grand-marshal');
    s = plan(s, 0, { type: 'playUnit', uid: g, lane: 0, slot: 0 });
    s = resolve(s).state;
    expect(byUid(s, ally.uid)).toMatchObject({ basePower: 2, baseHealth: 3 });
    expect(byUid(s, g)).toMatchObject({ basePower: 6, baseHealth: 6 });
  });

  it('High Cleric heals friendly units and the hero at End of Round', () => {
    let s = setup({ heroHp: 100 });
    clearHands(s);
    s.players[0].hp = 90;
    const ally = place(s, 0, 1, 'bastion-cathedral-guard', { damage: 3 });
    ally.basePower = 0;
    place(s, 0, 0, 'bastion-high-cleric').basePower = 0;
    s = resolve(s).state;
    expect(byUid(s, ally.uid)!.damage).toBe(1);
    expect(s.players[0].hp).toBe(91);
  });

  it('Call to Arms summons two Levies in the chosen lane', () => {
    let s = setup({ heroHp: 100 });
    clearHands(s);
    s.players[0].mana = 2;
    const c = give(s, 0, 'bastion-call-to-arms');
    s = plan(s, 0, { type: 'playSpell', uid: c, target: { kind: 'lane', lane: 2 } });
    s = resolve(s).state;
    expect(s.lanes[2].slots[0].filter((u) => u?.cardId === 'bastion-levy')).toHaveLength(2);
  });

  it('Mend and Fireball target heroes without choosing a target', () => {
    let s = setup({ heroHp: 100 });
    clearHands(s);
    s.players[0].mana = 3;
    s.players[0].hp = 95;
    const mend = give(s, 0, 'bastion-mend');
    const fire = give(s, 0, 'ember-fireball');
    s = plan(s, 0, { type: 'playSpell', uid: mend, target: { kind: 'none' } });
    s = plan(s, 0, { type: 'playSpell', uid: fire, target: { kind: 'none' } });
    s = resolve(s).state;
    expect(s.players[0].hp).toBe(99);
    expect(s.players[1].hp).toBe(96);
  });
});
