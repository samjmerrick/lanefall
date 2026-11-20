import { describe, expect, it } from 'vitest';
import {
  applyAction,
  initMatch,
  legalActions,
  resolveRound,
  IllegalActionError,
  type GameState,
} from '../../src/engine';
import { byUid, clearHands, FILLER, give, place, plan, resolve, setup, unitAt } from './helpers';

const deck = Array.from({ length: 30 }, () => FILLER);

describe('setup and mulligan', () => {
  it('starts in the mulligan phase with 4 cards each and 20 HP', () => {
    const s = initMatch({ decks: [deck, deck] }, 5);
    expect(s.phase).toBe('mulligan');
    expect(s.players.map((p) => p.hand.length)).toEqual([4, 4]);
    expect(s.players.map((p) => p.deck.length)).toEqual([26, 26]);
    expect(s.players.map((p) => p.hp)).toEqual([20, 20]);
    expect(new Set(s.lanes.map((l) => l.effectId)).size).toBe(3);
  });

  it('replaces mulliganed cards and starts round 1 when both are done', () => {
    const mixed = [
      ...Array.from({ length: 15 }, () => 'ember-spark-imp'),
      ...Array.from({ length: 15 }, () => FILLER),
    ];
    let s = initMatch({ decks: [mixed, deck] }, 3);
    const uids = s.players[0].hand.slice(0, 2).map((h) => h.uid);
    s = applyAction(s, { type: 'mulligan', player: 0, uids });
    expect(s.players[0].hand).toHaveLength(4);
    expect(s.players[0].hand.some((h) => uids.includes(h.uid))).toBe(false);
    expect(s.players[0].deck).toHaveLength(26);
    expect(s.phase).toBe('mulligan');
    expect(() => applyAction(s, { type: 'mulligan', player: 0, uids: [] })).toThrow(IllegalActionError);
    s = applyAction(s, { type: 'mulligan', player: 1, uids: [] });
    expect(s.phase).toBe('plan');
    expect(s.round).toBe(1);
  });

  it('rejects bad mulligans', () => {
    const s = initMatch({ decks: [deck, deck] }, 3);
    const uid = s.players[0].hand[0]!.uid;
    expect(() => applyAction(s, { type: 'mulligan', player: 0, uids: [uid, uid] })).toThrow(/Duplicate/);
    expect(() => applyAction(s, { type: 'mulligan', player: 0, uids: [999] })).toThrow(/not in hand/);
  });

  it('rejects unknown cards', () => {
    expect(() => initMatch({ decks: [['nope-card'], deck] }, 1)).toThrow(/Unknown card/);
  });

  it('round 1 initiative is set by the seed', () => {
    const firsts = new Set(
      Array.from({ length: 20 }, (_, i) => initMatch({ decks: [deck, deck] }, i).initiative),
    );
    expect(firsts).toEqual(new Set([0, 1]));
  });
});

describe('round sequence', () => {
  it('refills mana to the round number, capped at 8', () => {
    let s = setup({ heroHp: 1000 });
    expect(s.players[0].mana).toBe(1);
    for (let round = 2; round <= 8; round++) {
      s = resolve(s).state;
      expect(s.round).toBe(round);
      expect(s.players[0].mana).toBe(Math.min(8, round));
    }
  });

  it('keeps up to 2 unspent mana as Reserve', () => {
    let s = setup();
    s.players[0].mana = 5;
    s.players[1].mana = 1;
    s = resolve(s).state;
    expect(s.players[0].reserve).toBe(2);
    expect(s.players[1].reserve).toBe(1);
  });

  it('Reserve pays for spells but not units', () => {
    const s = setup();
    clearHands(s);
    s.players[0].mana = 0;
    s.players[0].reserve = 2;
    const spell = give(s, 0, 'ember-fireball');
    const unit = give(s, 0, 'bastion-recruit');
    expect(() => plan(s, 0, { type: 'playUnit', uid: unit, lane: 0, slot: 0 })).toThrow(/mana/);
    const next = plan(s, 0, { type: 'playSpell', uid: spell, target: { kind: 'none' } });
    const after = resolve(next).state;
    expect(after.players[1].hp).toBe(17);
    expect(after.players[0].reserve).toBe(0);
  });

  it('draws 1 card per round and burns draws past 8', () => {
    let s = setup();
    expect(s.players[0].hand).toHaveLength(5);
    s = resolve(s).state;
    expect(s.players[0].hand).toHaveLength(6);
    give(s, 0, FILLER);
    give(s, 0, FILLER);
    expect(s.players[0].hand).toHaveLength(8);
    const { state, events } = resolve(s);
    expect(state.players[0].hand).toHaveLength(8);
    expect(events.some((e) => e.type === 'CardBurned' && e.player === 0)).toBe(true);
  });

  it('does nothing when drawing from an empty deck', () => {
    let s = setup();
    s.players[0].deck = [];
    const before = s.players[0].hand.length;
    s = resolve(s).state;
    expect(s.players[0].hand).toHaveLength(before);
  });

  it('reveals the Left, Centre and Right lane effects in rounds 1, 2 and 3', () => {
    let s = setup({ lanes: ['lane-forge', 'lane-chasm', 'lane-narrows'], heroHp: 100 });
    expect(s.lanes.map((l) => l.revealed)).toEqual([true, false, false]);
    s = resolve(s).state;
    expect(s.lanes.map((l) => l.revealed)).toEqual([true, true, false]);
    const { state, events } = resolve(s);
    expect(state.lanes.map((l) => l.revealed)).toEqual([true, true, true]);
    expect(events).toContainEqual({ type: 'LaneRevealed', lane: 2, effectId: 'lane-narrows' });
  });

  it('lets cards be taken back until End Turn', () => {
    let s = setup();
    const uid = s.players[0].hand[0]!.uid;
    s = plan(s, 0, { type: 'playUnit', uid, lane: 0, slot: 0 });
    expect(s.players[0].plan).toHaveLength(1);
    s = applyAction(s, { type: 'unplan', player: 0, index: 0 });
    expect(s.players[0].plan).toHaveLength(0);
    expect(() => applyAction(s, { type: 'unplan', player: 0, index: 0 })).toThrow(IllegalActionError);
    s = applyAction(s, { type: 'endTurn', player: 0 });
    expect(() => plan(s, 0, { type: 'playUnit', uid, lane: 0, slot: 0 })).toThrow(/Cannot plan/);
    expect(() => applyAction(s, { type: 'endTurn', player: 0 })).toThrow(IllegalActionError);
    expect(() => applyAction(s, { type: 'unplan', player: 0, index: 0 })).toThrow(IllegalActionError);
  });

  it('drops planned actions that become unaffordable when an earlier one is taken back', () => {
    let s = setup();
    clearHands(s);
    s.players[0].mana = 2;
    const a = give(s, 0, FILLER);
    const b = give(s, 0, FILLER);
    s = plan(
      s,
      0,
      { type: 'playUnit', uid: a, lane: 0, slot: 0 },
      { type: 'playUnit', uid: b, lane: 0, slot: 1 },
    );
    s = applyAction(s, { type: 'unplan', player: 0, index: 0 });
    expect(s.players[0].plan).toEqual([{ type: 'playUnit', uid: b, lane: 0, slot: 1 }]);
  });

  it('a friendly spell can target a unit planned earlier this turn', () => {
    let s = setup();
    clearHands(s);
    s.players[0].mana = 8;
    const unit = give(s, 0, FILLER);
    const kindle = give(s, 0, 'ember-kindle');
    const bolt = give(s, 0, 'ember-cinder-bolt');
    const kindleAt = { type: 'playSpell', uid: kindle, target: { kind: 'unit', uid: unit } } as const;
    // Not before the unit is planned, and never for enemy-unit spells.
    expect(() => plan(s, 0, kindleAt)).toThrow(/target/);
    s = plan(s, 0, { type: 'playUnit', uid: unit, lane: 0, slot: 0 });
    expect(() => plan(s, 0, { type: 'playSpell', uid: bolt, target: { kind: 'unit', uid: unit } })).toThrow(
      /target/,
    );
    const legal = legalActions(s, 0).filter((a) => a.type === 'plan' && a.action.uid === kindle);
    expect(legal.map((a) => a.type === 'plan' && a.action)).toContainEqual(kindleAt);
    s = plan(s, 0, kindleAt);
    // Taking the unit back drops the spell aimed at it.
    const back = applyAction(s, { type: 'unplan', player: 0, index: 0 });
    expect(back.players[0].plan).toEqual([]);
    s = applyAction(s, { type: 'endTurn', player: 0 });
    s = applyAction(s, { type: 'endTurn', player: 1 });
    const { state, events } = resolveRound(s);
    expect(events).toContainEqual(expect.objectContaining({ type: 'UnitBuffed', uid: unit, power: 2 }));
    expect(state.players[1].hp).toBeLessThan(s.players[1].hp);
  });

  it('rejects illegal plans', () => {
    let s = setup();
    clearHands(s);
    s.players[0].mana = 8;
    const unit = give(s, 0, FILLER);
    const spell = give(s, 0, 'ember-cinder-bolt');
    const friendly = place(s, 0, 1, FILLER);
    expect(() => plan(s, 0, { type: 'playUnit', uid: 999, lane: 0, slot: 0 })).toThrow(/not in hand/);
    expect(() => plan(s, 0, { type: 'playUnit', uid: spell, lane: 0, slot: 0 })).toThrow(/not a unit/);
    expect(() => plan(s, 0, { type: 'playSpell', uid: unit, target: { kind: 'none' } })).toThrow(
      /not a spell/,
    );
    expect(() => plan(s, 0, { type: 'playUnit', uid: unit, lane: 1, slot: 0 })).toThrow(/slot/);
    expect(() => plan(s, 0, { type: 'playUnit', uid: unit, lane: 1, slot: 7 })).toThrow(/slot/);
    expect(() =>
      plan(s, 0, { type: 'playSpell', uid: spell, target: { kind: 'unit', uid: friendly.uid } }),
    ).toThrow(/target/);
    expect(() => plan(s, 0, { type: 'playSpell', uid: spell, target: { kind: 'none' } })).toThrow(/target/);
    s = plan(s, 0, { type: 'playUnit', uid: unit, lane: 0, slot: 0 });
    expect(() => plan(s, 0, { type: 'playUnit', uid: unit, lane: 0, slot: 1 })).toThrow(/already planned/);
    expect(() => resolveRound(s)).toThrow(/Both players/);
  });

  it('reveals the initiative player first and alternates initiative each round', () => {
    let s = setup({ heroHp: 100 });
    clearHands(s);
    const first = s.initiative;
    const second = first === 0 ? 1 : 0;
    s.players[first].mana = 1;
    s.players[second].mana = 1;
    const a = give(s, first, FILLER);
    const b = give(s, second, FILLER);
    s = plan(s, second, { type: 'playUnit', uid: b, lane: 0, slot: 0 });
    s = plan(s, first, { type: 'playUnit', uid: a, lane: 0, slot: 0 });
    const { state, events } = resolve(s);
    const reveals = events.filter((e) => e.type === 'CardRevealed').map((e) => e.player);
    expect(reveals).toEqual([first, second]);
    expect(state.initiative).toBe(second);
  });

  it('expires round buffs at End of Round and keeps damage on survivors', () => {
    let s = setup({ heroHp: 100 });
    clearHands(s);
    const mine = place(s, 0, 0, 'bastion-militia'); // 2/3
    place(s, 1, 0, 'ember-spark-imp'); // 2/1
    mine.roundPower = 3;
    s = resolve(s).state;
    const after = byUid(s, mine.uid)!;
    expect(after.roundPower).toBe(0);
    expect(after.damage).toBe(2);
    expect(unitAt(s, 1, 0)).toBeNull();
  });

  it('a spell whose target has gone fizzles without refunding mana', () => {
    let s = setup({ heroHp: 100 });
    clearHands(s);
    const first = s.initiative;
    const second = first === 0 ? 1 : 0;
    // A unit of the second player's, killed by the first player's bolt before the second player's buff reveals.
    const victim = place(s, second, 0, 'ember-spark-imp');
    s.players[first].mana = 1;
    s.players[second].mana = 2;
    const bolt = give(s, first, 'ember-cinder-bolt');
    const blessing = give(s, second, 'bastion-blessing');
    s = plan(s, first, { type: 'playSpell', uid: bolt, target: { kind: 'unit', uid: victim.uid } });
    s = plan(s, second, { type: 'playSpell', uid: blessing, target: { kind: 'unit', uid: victim.uid } });
    const { state, events } = resolve(s);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'CardFizzled', uid: blessing, reason: 'target gone' }),
    );
    expect(state.players[second].reserve).toBe(0);
    expect(state.players[second].discard).toContain('bastion-blessing');
  });

  it('a planned unit whose lane fills up fizzles; one whose slot is taken moves to a free slot', () => {
    let s = setup({ heroHp: 100, lanes: ['lane-narrows', 'lane-plain', 'lane-plain'] });
    clearHands(s);
    s.players[0].mana = 8;
    const captain = give(s, 0, 'bastion-muster-captain');
    const recruit = give(s, 0, FILLER);
    s = plan(
      s,
      0,
      { type: 'playUnit', uid: captain, lane: 0, slot: 0 },
      { type: 'playUnit', uid: recruit, lane: 0, slot: 1 },
    );
    const { events } = resolve(s);
    // The Levy summoned by the captain takes the second (and last) Narrows place.
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'CardFizzled', uid: recruit, reason: 'lane full' }),
    );

    let t = setup({ heroHp: 100 });
    clearHands(t);
    t.players[0].mana = 8;
    const c2 = give(t, 0, 'bastion-muster-captain');
    const r2 = give(t, 0, FILLER);
    t = plan(
      t,
      0,
      { type: 'playUnit', uid: c2, lane: 0, slot: 0 },
      { type: 'playUnit', uid: r2, lane: 0, slot: 1 },
    );
    const res = resolve(t);
    expect(res.events).toContainEqual(
      expect.objectContaining({ type: 'UnitPlaced', uid: r2, lane: 0, slot: 2 }),
    );
  });
});

describe('lane combat', () => {
  it('both sides deal their lane power at the same time', () => {
    const s = setup({ heroHp: 100 });
    clearHands(s);
    const a = place(s, 0, 0, 'ember-spark-imp'); // 2/1
    const b = place(s, 1, 0, 'ember-spark-imp');
    const { state, events } = resolve(s);
    expect(byUid(state, a.uid)).toBeUndefined();
    expect(byUid(state, b.uid)).toBeUndefined();
    expect(events).toContainEqual({ type: 'LaneCombat', lane: 0, power: [2, 2] });
  });

  it('assigns damage in play order, each unit taking up to its remaining Health, overflow to the hero', () => {
    let s = setup({ heroHp: 100 });
    clearHands(s);
    place(s, 0, 0, 'ember-magma-brute'); // 6/3
    const first = place(s, 1, 0, 'bastion-recruit'); // 1/2
    const second = place(s, 1, 0, 'bastion-recruit');
    s = resolve(s).state;
    expect(byUid(s, first.uid)).toBeUndefined();
    expect(byUid(s, second.uid)).toBeUndefined();
    expect(s.players[1].hp).toBe(98);
  });

  it('stops assigning when power runs out', () => {
    let s = setup({ heroHp: 100 });
    clearHands(s);
    place(s, 0, 0, 'ember-spark-imp'); // 2 power
    const a = place(s, 1, 0, 'bastion-militia'); // 2/3
    const b = place(s, 1, 0, 'bastion-militia');
    s = resolve(s).state;
    expect(byUid(s, a.uid)!.damage).toBe(2);
    expect(byUid(s, b.uid)!.damage).toBe(0);
    expect(s.players[1].hp).toBe(100);
  });

  it('resolves lanes Left, Centre, Right', () => {
    const s = setup({ heroHp: 100 });
    clearHands(s);
    for (const lane of [2, 0, 1] as const) place(s, 0, lane, 'ember-spark-imp');
    const { events } = resolve(s);
    expect(events.filter((e) => e.type === 'LaneCombat').map((e) => e.lane)).toEqual([0, 1, 2]);
  });
});

describe('winning', () => {
  it('a hero on 0 HP after combat loses', () => {
    const s = setup({ heroHp: 2 });
    clearHands(s);
    place(s, 0, 0, 'ember-spark-imp');
    const { state, events } = resolve(s);
    expect(state.phase).toBe('over');
    expect(state.result).toEqual({ winner: 0, reason: 'hp' });
    expect(events.at(-1)).toEqual({ type: 'MatchEnded', winner: 0, reason: 'hp' });
    expect(() => resolveRound(state)).toThrow(IllegalActionError);
    expect(legalActions(state, 0)).toEqual([]);
  });

  it('both heroes at 0 or less is a draw', () => {
    let s = setup({ heroHp: 2 });
    clearHands(s);
    place(s, 0, 0, 'ember-spark-imp');
    place(s, 1, 1, 'ember-spark-imp');
    s = resolve(s).state;
    expect(s.result).toEqual({ winner: null, reason: 'hp' });
  });

  it('after round 8 the higher HP wins; equal HP is a draw', () => {
    let s: GameState = setup({ heroHp: 30 });
    while (s.phase === 'plan') {
      if (s.round === 8) s.players[1].hp = 29;
      s = resolve(s).state;
    }
    expect(s.round).toBe(8);
    expect(s.result).toEqual({ winner: 0, reason: 'rounds' });

    let t: GameState = setup({ heroHp: 30 });
    while (t.phase === 'plan') t = resolve(t).state;
    expect(t.result).toEqual({ winner: null, reason: 'rounds' });
  });

  it('End of Round hero damage can end the match', () => {
    const s = setup({ heroHp: 2 });
    clearHands(s);
    const titan = place(s, 0, 0, 'ember-inferno-titan', { damage: 2 }); // dies to 1 damage, Last Breath 2 to hero
    titan.keywords.push('ephemeral');
    place(s, 1, 0, 'bastion-shieldbearer', { slot: 0 });
    s.lanes[0].slots[1][0]!.basePower = 0;
    s.lanes[0].slots[1][0]!.baseHealth = 50;
    const { state } = resolve(s);
    expect(state.result).toEqual({ winner: 0, reason: 'hp' });
  });
});
