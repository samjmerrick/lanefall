import { describe, expect, it } from 'vitest';
import { getLaneEffect, LANE_EFFECTS, lanePower, unitMaxHealth, unitPower } from '../../src/engine';
import { byUid, clearHands, give, place, plan, resolve, setup } from './helpers';

function withLeft(effect: string) {
  const s = setup({ heroHp: 100, lanes: [effect, 'lane-plain', 'lane-plain'] });
  clearHands(s);
  s.players[0].mana = 8;
  return s;
}

describe('lane effects', () => {
  it('Forge: units here have +1 Power', () => {
    const s = withLeft('lane-forge');
    place(s, 0, 0, 'bastion-recruit');
    expect(lanePower(s, 0, 0)).toBe(2);
    place(s, 0, 1, 'bastion-recruit');
    expect(lanePower(s, 1, 0)).toBe(1);
  });

  it('effects are not active until revealed', () => {
    const s = setup({ heroHp: 100, lanes: ['lane-plain', 'lane-forge', 'lane-plain'] });
    place(s, 0, 1, 'bastion-recruit');
    expect(lanePower(s, 1, 0)).toBe(1);
  });

  it('Chasm: overflow damage here is doubled, Pierce is not', () => {
    let s = withLeft('lane-chasm');
    place(s, 0, 0, 'ember-spark-imp');
    place(s, 0, 0, 'ember-ember-hound'); // 2 Pierce
    s = resolve(s).state;
    expect(s.players[1].hp).toBe(100 - 4 - 2);
  });

  it('Narrows: only 2 units per side', () => {
    let s = withLeft('lane-narrows');
    place(s, 0, 0, 'bastion-recruit');
    const a = give(s, 0, 'bastion-recruit');
    const b = give(s, 0, 'bastion-recruit');
    s = plan(s, 0, { type: 'playUnit', uid: a, lane: 0, slot: 1 });
    expect(() => plan(s, 0, { type: 'playUnit', uid: b, lane: 0, slot: 2 })).toThrow(/slot/);
  });

  it('Bulwark: units here have +1 Health', () => {
    let s = withLeft('lane-bulwark');
    const u = place(s, 0, 0, 'bastion-recruit'); // 1/2 -> 1/3
    place(s, 1, 0, 'ember-spark-imp', { slot: 0 });
    s.lanes[0].slots[1][0]!.basePower = 2;
    s = resolve(s).state;
    expect(byUid(s, u.uid)).toBeDefined();
  });

  it('Sanctuary: heroes take no damage from this lane', () => {
    let s = withLeft('lane-sanctuary');
    place(s, 0, 0, 'ember-magma-brute');
    place(s, 0, 0, 'ember-skyfire-archer');
    s = resolve(s).state;
    expect(s.players[1].hp).toBe(100);
  });

  it('Ashfield: End of Round, 1 damage to each unit here', () => {
    let s = withLeft('lane-ashfield');
    const a = place(s, 0, 0, 'bastion-militia');
    const b = place(s, 1, 0, 'bastion-recruit');
    b.basePower = 0;
    a.basePower = 0;
    s = resolve(s).state;
    expect(byUid(s, a.uid)!.damage).toBe(1);
    expect(byUid(s, b.uid)!.damage).toBe(1);
  });

  it('Spring: End of Round, heal each unit here by 2', () => {
    let s = withLeft('lane-spring');
    const a = place(s, 0, 0, 'bastion-cathedral-guard', { damage: 3 });
    a.basePower = 0;
    s = resolve(s).state;
    expect(byUid(s, a.uid)!.damage).toBe(1);
  });

  it('ships 20 lane effects', () => {
    expect(LANE_EFFECTS).toHaveLength(20);
  });

  it.each(LANE_EFFECTS.filter((l) => l.powerBonus || l.healthBonus).map((l) => l.id))(
    '%s: stat bonuses apply to units here only',
    (id) => {
      const s = withLeft(id);
      const fx = getLaneEffect(id);
      const here = place(s, 0, 0, 'bastion-militia'); // 2/3
      const there = place(s, 0, 1, 'bastion-militia');
      expect(unitPower(s, { unit: here, lane: 0, slot: 0 })).toBe(Math.max(0, 2 + fx.powerBonus));
      expect(unitMaxHealth(s, { unit: here, lane: 0, slot: 0 })).toBe(3 + fx.healthBonus);
      expect(unitPower(s, { unit: there, lane: 1, slot: 0 })).toBe(2);
    },
  );

  it.each(LANE_EFFECTS.filter((l) => l.maxUnits < 4).map((l) => l.id))('%s: caps units per side', (id) => {
    let s = withLeft(id);
    const max = getLaneEffect(id).maxUnits;
    const uids = Array.from({ length: max + 1 }, () => give(s, 0, 'bastion-recruit'));
    for (let i = 0; i < max; i++) s = plan(s, 0, { type: 'playUnit', uid: uids[i]!, lane: 0, slot: i });
    expect(() => plan(s, 0, { type: 'playUnit', uid: uids[max]!, lane: 0, slot: max })).toThrow(/slot/);
  });

  it('Gorge: overflow damage here is tripled', () => {
    let s = withLeft('lane-gorge');
    place(s, 0, 0, 'ember-spark-imp');
    s = resolve(s).state;
    expect(s.players[1].hp).toBe(100 - 6);
  });

  it('Shrine: End of Round, fully heal each unit here', () => {
    let s = withLeft('lane-shrine');
    const a = place(s, 0, 0, 'bastion-cathedral-guard', { damage: 4 });
    a.basePower = 0;
    s = resolve(s).state;
    expect(byUid(s, a.uid)!.damage).toBe(0);
  });

  it('Stormfront: End of Round, 2 damage to each unit here', () => {
    let s = withLeft('lane-storm');
    const a = place(s, 0, 0, 'bastion-cathedral-guard');
    const b = place(s, 1, 0, 'bastion-cathedral-guard');
    a.basePower = 0;
    b.basePower = 0;
    s = resolve(s).state;
    expect(byUid(s, a.uid)!.damage).toBe(2);
    expect(byUid(s, b.uid)!.damage).toBe(2);
  });

  it('Oasis and Cursed Ground: End of Round, heal or damage both heroes', () => {
    let s = withLeft('lane-oasis');
    s.players[0].hp = 90;
    s.players[1].hp = 99;
    s = resolve(s).state;
    expect([s.players[0].hp, s.players[1].hp]).toEqual([92, 100]);
    let c = withLeft('lane-cursed');
    c = resolve(c).state;
    expect([c.players[0].hp, c.players[1].hp]).toEqual([99, 99]);
  });

  it('Barracks: End of Round, each unit here gains +1 Power for good', () => {
    let s = withLeft('lane-barracks');
    const a = place(s, 0, 0, 'bastion-cathedral-guard');
    s = resolve(s).state;
    expect(byUid(s, a.uid)!.basePower).toBe(5);
  });
});
