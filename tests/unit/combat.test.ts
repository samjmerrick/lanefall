import { describe, expect, it } from 'vitest';
import { assignLaneDamage, previewCombat, soakOrder, type GameEvent } from '../../src/engine';
import { arrangeSlots, planNormal } from '../../src/ai/normal';
import { seedRng } from '../../src/engine/rng';
import { byUid, clearHands, give, place, plan, resolve, setup } from './helpers';

describe('soakOrder', () => {
  it('puts Guard first, then ascending slot', () => {
    const units = [
      { id: 'a', slot: 3, guard: false },
      { id: 'b', slot: 0, guard: false },
      { id: 'c', slot: 2, guard: true },
      { id: 'd', slot: 1, guard: true },
    ];
    expect(soakOrder(units).map((u) => u.id)).toEqual(['d', 'c', 'b', 'a']);
    expect(units[0]!.id).toBe('a'); // input untouched
  });
});

describe('slot damage order', () => {
  it('front row soaks before back row regardless of play order', () => {
    const s = setup({ heroHp: 100 });
    clearHands(s);
    place(s, 0, 0, 'ember-spark-imp'); // 2 power
    const back = place(s, 1, 0, 'bastion-militia', { slot: 3 }); // played first
    const front = place(s, 1, 0, 'bastion-militia', { slot: 1 });
    const { state } = resolve(s);
    expect(byUid(state, front.uid)!.damage).toBe(2);
    expect(byUid(state, back.uid)!.damage).toBe(0);
  });

  it('skips gaps and does not shift when units die', () => {
    const s = setup({ heroHp: 100 });
    clearHands(s);
    place(s, 0, 0, 'ember-magma-brute'); // 6 power
    const a = place(s, 1, 0, 'bastion-recruit', { slot: 0 }); // 2 health
    const b = place(s, 1, 0, 'bastion-recruit', { slot: 3 });
    const { state } = resolve(s);
    expect(byUid(state, a.uid)).toBeUndefined();
    expect(byUid(state, b.uid)).toBeUndefined();
    expect(state.players[1].hp).toBe(98);
  });

  it('a Guard in the back row is still hit first', () => {
    const s = setup({ heroHp: 100 });
    clearHands(s);
    place(s, 0, 0, 'ember-spark-imp');
    const front = place(s, 1, 0, 'bastion-militia', { slot: 0 });
    const guard = place(s, 1, 0, 'bastion-shieldbearer', { slot: 3 }); // 1/1 Guard
    const [mine] = assignLaneDamage(s, 0);
    expect(mine.units.map((h) => h.uid)).toEqual([guard.uid, front.uid]);
  });

  it('a Barrier unit absorbs its assigned hit', () => {
    const s = setup({ heroHp: 100 });
    clearHands(s);
    place(s, 0, 0, 'ember-magma-brute'); // 6
    const knight = place(s, 1, 0, 'bastion-paladin', { slot: 0 }); // 3/3 barrier
    const next = place(s, 1, 0, 'bastion-recruit', { slot: 1 });
    const [mine] = assignLaneDamage(s, 0);
    expect(mine.units).toEqual([
      { uid: knight.uid, amount: 3, barrier: true },
      { uid: next.uid, amount: 2, barrier: false },
    ]);
    const { state } = resolve(s);
    expect(byUid(state, knight.uid)!.damage).toBe(0);
    expect(byUid(state, knight.uid)!.barrier).toBe(false);
  });
});

describe('assignLaneDamage and LaneCombat', () => {
  it('reports overflow, pierce, hero damage and lifesteal per attacker', () => {
    const s = setup({ lanes: ['lane-chasm', 'lane-plain', 'lane-plain'], heroHp: 100 });
    s.lanes[0].revealed = true;
    clearHands(s);
    place(s, 0, 0, 'ember-spark-imp', { keywords: ['lifesteal'] }); // 2
    place(s, 0, 0, 'ember-ember-hound'); // 2 pierce
    place(s, 1, 0, 'bastion-recruit'); // 1/2
    const [mine, theirs] = assignLaneDamage(s, 0);
    expect(mine).toMatchObject({ attacker: 0, overflow: 0, pierce: 2, hero: 2, lifesteal: 2 });
    expect(theirs).toMatchObject({ attacker: 1, hero: 0 });
    expect(mine.units).toHaveLength(1);
  });

  it('emits the initiative side first, with hits on the event', () => {
    for (const initiative of [0, 1] as const) {
      const s = setup({ heroHp: 100 });
      clearHands(s);
      s.initiative = initiative;
      place(s, 0, 0, 'ember-flame-colossus'); // 7/4
      place(s, 1, 0, 'ember-flame-colossus');
      const { events } = resolve(s);
      const combat = events.find((e) => e.type === 'LaneCombat') as Extract<
        GameEvent,
        { type: 'LaneCombat' }
      >;
      expect(combat.order).toEqual([initiative, initiative === 0 ? 1 : 0]);
      expect(combat.hits[0].attacker).toBe(0);
      const start = events.indexOf(combat);
      const dmg = events.slice(start).filter((e) => e.type === 'DamageDealt');
      const uidOf = (p: 0 | 1) => combat.hits[p].units[0]!.uid;
      // The first DamageDealt is the initiative side's hit on the other side's unit.
      expect(dmg[0]).toMatchObject({ uid: uidOf(initiative) });
    }
  });

  it('hero damage and Lifesteal follow the unit hits of the same side', () => {
    const s = setup({ heroHp: 100 });
    clearHands(s);
    s.initiative = 1;
    place(s, 0, 0, 'ember-magma-brute', { keywords: ['lifesteal'] });
    s.players[0].hp = 50;
    place(s, 1, 0, 'bastion-recruit');
    place(s, 1, 0, 'ember-spark-imp');
    const { events } = resolve(s);
    const types = events.map((e) => e.type);
    const combat = types.indexOf('LaneCombat');
    const heroHit = events.findIndex((e) => e.type === 'HeroDamaged' && e.player === 1);
    const heroHeal = events.findIndex((e) => e.type === 'HeroHealed');
    expect(heroHit).toBeGreaterThan(combat);
    expect(heroHeal).toBeGreaterThan(events.findIndex((e) => e.type === 'HeroDamaged' && e.player === 1));
  });
});

describe('previewCombat', () => {
  function board() {
    const s = setup({ heroHp: 100 });
    clearHands(s);
    s.players[0].mana = 8;
    place(s, 1, 0, 'ember-spark-imp'); // 2/1 enemy
    place(s, 1, 1, 'ember-magma-brute'); // 6/3
    const mine = give(s, 0, 'bastion-recruit'); // 1/2
    const guard = give(s, 0, 'bastion-wall-warden'); // 2/4 guard
    return { s, mine, guard };
  }

  it('matches the real round damage when planned units have no On Reveal', () => {
    const { s, mine, guard } = board();
    const planned = plan(
      s,
      0,
      { type: 'playUnit', uid: mine, lane: 0, slot: 0 },
      { type: 'playUnit', uid: guard, lane: 1, slot: 1 },
    );
    const preview = previewCombat(planned, 0);
    const { state, events } = resolve(planned);
    expect(preview.units[mine]).toEqual({ damage: 2, dies: true, barrier: false });
    expect(preview.units[guard]).toEqual({ damage: 4, dies: true, barrier: false });
    expect(byUid(state, mine)).toBeUndefined();
    expect(byUid(state, guard)).toBeUndefined();
    const real: [number[], number[]] = [
      [0, 0, 0],
      [0, 0, 0],
    ];
    for (const e of events)
      if (e.type === 'HeroDamaged' && e.lane !== null)
        real[e.player]![e.lane] = (real[e.player]![e.lane] ?? 0) + e.amount;
    expect(preview.hero).toEqual(real);
  });

  it('ignores the opponent plan and does not mutate the input', () => {
    const { s, mine } = board();
    const e = give(s, 1, 'ember-flame-colossus');
    s.players[1].mana = 8;
    const withOpp = plan(plan(s, 0, { type: 'playUnit', uid: mine, lane: 0, slot: 0 }), 1, {
      type: 'playUnit',
      uid: e,
      lane: 0,
      slot: 1,
    });
    const without = plan(s, 0, { type: 'playUnit', uid: mine, lane: 0, slot: 0 });
    const before = structuredClone(withOpp);
    expect(previewCombat(withOpp, 0)).toEqual(previewCombat(without, 0));
    expect(withOpp).toEqual(before);
  });
});

describe('AI slot heuristic', () => {
  it('puts the Guard and tougher units in front', () => {
    const s = setup();
    clearHands(s);
    s.players[0].mana = 8;
    const imp = give(s, 0, 'ember-spark-imp'); // 2/1
    const guard = give(s, 0, 'bastion-wall-warden'); // guard
    const tank = give(s, 0, 'bastion-militia'); // 2/3
    const raw = [imp, guard, tank].map((uid, i) => ({ type: 'playUnit', uid, lane: 0, slot: i }) as const);
    const out = arrangeSlots(s, 0, raw);
    const slotOf = (uid: number) => out.find((a) => a.uid === uid && a.type === 'playUnit')!;
    expect((slotOf(guard) as { slot: number }).slot).toBe(0);
    expect((slotOf(tank) as { slot: number }).slot).toBe(1);
    expect((slotOf(imp) as { slot: number }).slot).toBe(2);
  });

  it('keeps occupied slots free of new units', () => {
    const s = setup();
    clearHands(s);
    place(s, 0, 0, 'bastion-recruit', { slot: 0 });
    const a = give(s, 0, 'ember-spark-imp');
    const b = give(s, 0, 'bastion-wall-warden');
    const out = arrangeSlots(s, 0, [
      { type: 'playUnit', uid: a, lane: 0, slot: 1 },
      { type: 'playUnit', uid: b, lane: 0, slot: 2 },
    ]);
    expect(out.map((x) => (x as { slot: number }).slot).sort()).toEqual([1, 2]);
    expect((out[1] as { slot: number }).slot).toBe(1);
  });

  it('Normal plans with legal, tough-first slots', () => {
    const s = setup();
    clearHands(s);
    s.players[0].mana = 6;
    give(s, 0, 'ember-spark-imp');
    give(s, 0, 'bastion-wall-warden');
    const { actions } = planNormal(s, 0, seedRng(3));
    expect(actions.at(-1)).toMatchObject({ type: 'endTurn' });
  });
});
