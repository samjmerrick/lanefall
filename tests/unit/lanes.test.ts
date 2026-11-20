import { describe, expect, it } from 'vitest';
import {
  getLaneEffect,
  LANE_EFFECTS,
  lanePower,
  unitMaxHealth,
  unitPower,
  type GameState,
} from '../../src/engine';
import { byUid, clearHands, give, place, plan, resolve, setup, unitAt } from './helpers';

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
    const b = place(s, 1, 0, 'bastion-militia');
    a.basePower = 0;
    b.basePower = 0;
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

  it('ships 33 lane effects', () => {
    expect(LANE_EFFECTS).toHaveLength(33);
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

  it('Gorge: overflow damage here is tripled (units there have -1 Power)', () => {
    let s = withLeft('lane-gorge');
    place(s, 0, 0, 'ember-ash-raider'); // 3 -> 2 Power
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

  it('Stormfront: End of Round, 3 damage to each unit here', () => {
    let s = withLeft('lane-storm');
    const a = place(s, 0, 0, 'bastion-cathedral-guard');
    const b = place(s, 1, 0, 'bastion-cathedral-guard');
    a.basePower = -1; // +1 from the lane: no combat damage
    b.basePower = -1;
    s = resolve(s).state;
    expect(byUid(s, a.uid)!.damage).toBe(3);
    expect(byUid(s, b.uid)!.damage).toBe(3);
  });

  it('Oasis and Cursed Land: End of Round, heal or damage both heroes', () => {
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

/** Hand size after the round: the next round's draw is the same for both players. */
const handSizes = (s: GameState) => [s.players[0].hand.length, s.players[1].hand.length];

describe('retuned lanes', () => {
  it('Sanctuary: no hero damage, and the player with more power here heals 4', () => {
    let s = withLeft('lane-sanctuary');
    s.players[0].hp = 90;
    place(s, 0, 0, 'ember-magma-brute');
    place(s, 1, 0, 'bastion-recruit');
    s = resolve(s).state;
    expect(s.players[1].hp).toBe(100);
    expect(s.players[0].hp).toBe(94);
  });

  it('Sanctuary: a tie in power heals nobody', () => {
    let s = withLeft('lane-sanctuary');
    s.players[0].hp = 90;
    s.players[1].hp = 90;
    place(s, 0, 0, 'ember-ash-raider');
    place(s, 1, 0, 'ember-ash-raider');
    s = resolve(s).state;
    expect([s.players[0].hp, s.players[1].hp]).toEqual([90, 90]);
  });

  it('Crucible: +2 Power, but units here are destroyed at End of Round', () => {
    let s = withLeft('lane-crucible');
    const u = place(s, 0, 0, 'ember-spark-imp');
    expect(unitPower(s, { unit: u, lane: 0, slot: 0 })).toBe(4);
    s = resolve(s).state;
    expect(s.players[1].hp).toBe(96);
    expect(byUid(s, u.uid)).toBeUndefined();
    expect(s.players[0].discard).toContain('ember-spark-imp');
  });

  it('Bridge: one unit per side, with +2/+2', () => {
    const s = withLeft('lane-bridge');
    const u = place(s, 0, 0, 'bastion-recruit');
    expect(unitPower(s, { unit: u, lane: 0, slot: 0 })).toBe(3);
    expect(unitMaxHealth(s, { unit: u, lane: 0, slot: 0 })).toBe(4);
  });

  it('Chasm: one unit per side, overflow doubled', () => {
    let s = withLeft('lane-chasm');
    place(s, 0, 0, 'ember-spark-imp');
    s = resolve(s).state;
    expect(s.players[1].hp).toBe(100 - 4);
  });

  it('Lowlands: -1 Power, overflow doubled', () => {
    let s = withLeft('lane-lowlands');
    place(s, 0, 0, 'ember-ash-raider'); // 3 -> 2
    s = resolve(s).state;
    expect(s.players[1].hp).toBe(100 - 4);
  });

  it('Ashfield: more power here draws a card', () => {
    let s = withLeft('lane-ashfield');
    const before = handSizes(s);
    place(s, 0, 0, 'ember-magma-brute');
    place(s, 1, 0, 'bastion-militia');
    s = resolve(s).state;
    const after = handSizes(s);
    expect(after[0]! - before[0]!).toBe(after[1]! - before[1]! + 1);
  });
});

describe('new lane mechanics', () => {
  it('Open Road: units here have Pierce, so nothing soaks', () => {
    let s = withLeft('lane-road');
    place(s, 0, 0, 'ember-ash-raider');
    const enemy = place(s, 1, 0, 'bastion-militia');
    enemy.basePower = 0;
    s = resolve(s).state;
    expect(s.players[1].hp).toBe(97);
    expect(byUid(s, enemy.uid)!.damage).toBe(0);
  });

  it('Bloodmoon: Lifesteal, and -1 Power', () => {
    let s = withLeft('lane-bloodmoon');
    s.players[0].hp = 90;
    place(s, 0, 0, 'ember-magma-brute'); // 5 -> 4
    s = resolve(s).state;
    expect(s.players[1].hp).toBe(96);
    expect(s.players[0].hp).toBe(94);
  });

  it('Aegis Gate: units played here, and units summoned here, enter with a Barrier', () => {
    let s = withLeft('lane-aegis');
    const captain = give(s, 0, 'bastion-muster-captain'); // On Reveal: summon a 1/1 Levy
    const plain = give(s, 0, 'bastion-recruit');
    s.players[0].mana = 8;
    s = plan(
      s,
      0,
      { type: 'playUnit', uid: captain, lane: 0, slot: 0 },
      { type: 'playUnit', uid: plain, lane: 1, slot: 0 },
    );
    s = resolve(s).state;
    const here = s.lanes[0].slots[0].filter((u) => u !== null);
    expect(here).toHaveLength(2); // captain and Levy
    expect(here.every((u) => u!.barrier)).toBe(true);
    expect(unitAt(s, 0, 1)!.barrier).toBe(false);
  });

  it('Ambush: a unit entering deals 1 damage to a random enemy unit here', () => {
    let s = withLeft('lane-ambush');
    const enemy = place(s, 1, 0, 'bastion-cathedral-guard');
    enemy.basePower = 0;
    const uid = give(s, 0, 'bastion-recruit');
    s.players[0].mana = 8;
    s = plan(s, 0, { type: 'playUnit', uid, lane: 0, slot: 0 });
    const res = resolve(s);
    const hits = res.events.filter((e) => e.type === 'DamageDealt' && e.uid === enemy.uid);
    expect(hits[0]).toMatchObject({ amount: 1 }); // the ping, before combat deals the recruit's 1
    expect(byUid(res.state, enemy.uid)!.damage).toBe(2);
  });

  it('Scriptorium: the player with more power here draws a card; a tie draws nothing', () => {
    const s = withLeft('lane-scriptorium');
    const before = handSizes(s);
    place(s, 0, 0, 'ember-magma-brute');
    place(s, 1, 0, 'bastion-recruit');
    const after = handSizes(resolve(s).state);
    expect(after[0]! - before[0]!).toBe(after[1]! - before[1]! + 1);

    let tie = withLeft('lane-scriptorium');
    const b = handSizes(tie);
    place(tie, 0, 0, 'bastion-recruit');
    place(tie, 1, 0, 'bastion-recruit');
    tie = resolve(tie).state;
    expect(handSizes(tie).map((n, i) => n - b[i]!)).toEqual([1, 1]);
  });

  it('Leyline: the player with more power here gains 1 mana next round', () => {
    let s = withLeft('lane-leyline');
    place(s, 0, 0, 'ember-magma-brute');
    s = resolve(s).state;
    expect(s.round).toBe(2);
    expect(s.players[0].mana).toBe(3);
    expect(s.players[1].mana).toBe(2);
  });

  it('Catacombs: a unit that dies here draws its owner a card', () => {
    let s = withLeft('lane-catacombs');
    const before = handSizes(s);
    place(s, 0, 0, 'ember-magma-brute');
    place(s, 1, 0, 'bastion-recruit');
    s = resolve(s).state;
    const after = handSizes(s);
    expect(after[1]! - before[1]!).toBe(after[0]! - before[0]! + 1);
  });

  it('Phoenix Nest: a unit that dies here returns to its owner’s hand (tokens do not)', () => {
    let s = withLeft('lane-phoenix');
    clearHands(s);
    place(s, 0, 0, 'ember-magma-brute');
    const imp = place(s, 1, 0, 'ember-spark-imp');
    s = resolve(s).state;
    expect(byUid(s, imp.uid)).toBeUndefined();
    expect(s.players[1].hand.filter((h) => h.cardId === 'ember-spark-imp')).toHaveLength(1);
    expect(s.players[1].discard).not.toContain('ember-spark-imp');
  });

  it('Reverse Ranks: damage hits the back row first', () => {
    let s = withLeft('lane-ranks');
    place(s, 0, 0, 'ember-spark-imp');
    const front = place(s, 1, 0, 'bastion-militia', { slot: 0 });
    const back = place(s, 1, 0, 'bastion-militia', { slot: 3 });
    front.basePower = 0;
    back.basePower = 0;
    s = resolve(s).state;
    expect(byUid(s, back.uid)!.damage).toBe(2);
    expect(byUid(s, front.uid)!.damage).toBe(0);
  });

  it('Culling Field: damage hits the weakest unit first, Guard still first', () => {
    let s = withLeft('lane-cull');
    place(s, 0, 0, 'ember-spark-imp');
    const strong = place(s, 1, 0, 'bastion-militia', { slot: 0 }); // 3 Health
    const weak = place(s, 1, 0, 'bastion-recruit', { slot: 1 }); // 2 Health
    strong.basePower = 0;
    weak.basePower = 0;
    s = resolve(s).state;
    expect(byUid(s, weak.uid)).toBeUndefined();
    expect(byUid(s, strong.uid)!.damage).toBe(0);

    let g = withLeft('lane-cull');
    place(g, 0, 0, 'ember-spark-imp');
    const guard = place(g, 1, 0, 'bastion-wall-warden', { slot: 1 }); // Guard, 4 Health
    const small = place(g, 1, 0, 'bastion-recruit', { slot: 0 });
    guard.basePower = 0;
    small.basePower = 0;
    g = resolve(g).state;
    expect(byUid(g, guard.uid)!.damage).toBe(2);
    expect(byUid(g, small.uid)!.damage).toBe(0);
  });

  it('Crossroads: End of Round, each unit here moves to another lane', () => {
    let s = withLeft('lane-crossroads');
    const u = place(s, 0, 0, 'bastion-recruit');
    const res = resolve(s);
    s = res.state;
    expect(unitAt(s, 0, 0)).toBeNull();
    expect(byUid(s, u.uid)).toBeDefined();
    expect(res.events).toContainEqual(expect.objectContaining({ type: 'UnitMoved', uid: u.uid, from: 0 }));
  });

  it('Duelling Ring: only the strongest unit on each side attacks (+1 Power)', () => {
    let s = withLeft('lane-ring');
    place(s, 0, 0, 'ember-spark-imp'); // 3
    place(s, 0, 0, 'ember-ash-raider'); // 4
    place(s, 0, 0, 'ember-spark-imp');
    s = resolve(s).state;
    expect(s.players[1].hp).toBe(100 - 4);
  });

  it('Shroud: enemy spells cannot target units here, but friendly ones can', () => {
    let s = withLeft('lane-shroud');
    const mine = place(s, 0, 0, 'bastion-recruit');
    const theirs = place(s, 1, 0, 'bastion-recruit');
    const bolt = give(s, 0, 'ember-cinder-bolt'); // enemy unit
    const kindle = give(s, 1, 'ember-kindle'); // friendly unit
    s.players[0].mana = 8;
    s.players[1].mana = 8;
    expect(() =>
      plan(s, 0, { type: 'playSpell', uid: bolt, target: { kind: 'unit', uid: theirs.uid } }),
    ).toThrow(/invalid target/);
    s = plan(s, 1, { type: 'playSpell', uid: kindle, target: { kind: 'unit', uid: theirs.uid } });
    expect(mine.uid).not.toBe(theirs.uid);

    // The same spell is legal in an Open Field.
    const o = setup({ heroHp: 100 });
    clearHands(o);
    o.players[0].mana = 8;
    const enemy = place(o, 1, 0, 'bastion-recruit');
    const b = give(o, 0, 'ember-cinder-bolt');
    expect(() =>
      plan(o, 0, { type: 'playSpell', uid: b, target: { kind: 'unit', uid: enemy.uid } }),
    ).not.toThrow();
  });

  it('Shroud: a spell planned at a unit that shifts in fizzles at reveal', () => {
    let s = setup({ heroHp: 100, lanes: ['lane-plain', 'lane-shroud', 'lane-plain'] });
    clearHands(s);
    s.players[0].mana = 8;
    // The Left lane is plain, so the spell is legal when planned.
    const enemy = place(s, 1, 0, 'tide-mist-sprite');
    const bolt = give(s, 0, 'ember-cinder-bolt');
    s = plan(s, 0, { type: 'playSpell', uid: bolt, target: { kind: 'unit', uid: enemy.uid } });
    s.lanes[1].revealed = true;
    s = plan(s, 1, { type: 'shift', uid: enemy.uid, lane: 1, slot: 0 });
    const res = resolve(s);
    expect(res.events).toContainEqual(
      expect.objectContaining({ type: 'CardFizzled', reason: 'target shrouded' }),
    );
  });
});
