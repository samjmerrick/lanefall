// Every card (and its upgraded version) is played into a standard board, and each of its effects is
// checked against the events the engine emits in the window its trigger fires in. Together with the
// generated-text check in content.test.ts, this tests that each card does what its text says.
import { describe, expect, it } from 'vitest';
import {
  CARDS,
  getCard,
  unitMaxHealth,
  unitPower,
  UPGRADED,
  type CardDef,
  type GameEvent,
  type GameState,
  type LaneIndex,
  type PlannedAction,
  type Unit,
} from '../../src/engine';
import type { Primitive } from '../../src/engine/schema';
import { clearHands, give, place, plan, resolve, setup } from './helpers';

const LANE: LaneIndex = 1;
const TOUGH = 30;

interface Board {
  s: GameState;
  ally: Unit;
  foe: Unit;
  farFoe: Unit;
}

function sturdy(u: Unit, damage = 2): Unit {
  u.basePower = 1;
  u.baseHealth = TOUGH;
  u.damage = damage;
  u.keywords = [];
  u.barrier = false;
  return u;
}

/** Heroes on 90/100, a damaged friendly unit and enemy unit in the centre lane, and an enemy unit on the left. */
function board(): Board {
  const s = setup({ heroHp: 100 });
  clearHands(s);
  for (const p of s.players) p.hp = 90;
  s.players[0].mana = 10;
  const ally = sturdy(place(s, 0, LANE, 'bastion-militia'));
  const foe = sturdy(place(s, 1, LANE, 'bastion-militia'));
  const farFoe = sturdy(place(s, 1, 0, 'bastion-militia'));
  return { s, ally, foe, farFoe };
}

function spellAction(card: CardDef, uid: number, b: Board): PlannedAction {
  switch (card.targeting) {
    case 'enemyUnit':
    case 'anyUnit':
      return { type: 'playSpell', uid, target: { kind: 'unit', uid: b.foe.uid } };
    case 'friendlyUnit':
      return { type: 'playSpell', uid, target: { kind: 'unit', uid: b.ally.uid } };
    case 'lane':
      return { type: 'playSpell', uid, target: { kind: 'lane', lane: LANE } };
    default:
      return { type: 'playSpell', uid, target: { kind: 'none' } };
  }
}

/** Uids a selector may pick on the standard board; `random` selectors pick exactly one of them. */
function expectedUnits(sel: string, card: CardDef, b: Board, self: number): { uids: number[]; random: boolean } {
  const friendlyInLane = [b.ally.uid, ...(card.type === 'unit' ? [self] : [])];
  const enemies = [b.foe.uid, b.farFoe.uid];
  const sets: Record<string, number[]> = {
    self: [self],
    target: [card.targeting === 'friendlyUnit' ? b.ally.uid : b.foe.uid],
    friendlyUnitsInLane: friendlyInLane,
    otherFriendlyUnitsInLane: [b.ally.uid],
    enemyUnitsInLane: [b.foe.uid],
    randomEnemyUnitInLane: [b.foe.uid],
    allUnitsInLane: [...friendlyInLane, b.foe.uid],
    allFriendlyUnits: friendlyInLane,
    randomFriendlyUnit: friendlyInLane,
    otherFriendlyUnits: [b.ally.uid],
    allEnemyUnits: enemies,
    randomEnemyUnit: enemies,
  };
  const uids = sets[sel];
  if (!uids) throw new Error(`no expectation for selector ${sel}`);
  return { uids, random: sel.startsWith('random') };
}

/** Checks one primitive against the events of its trigger window. */
function checkPrimitive(a: Primitive, events: GameEvent[], card: CardDef, b: Board, self: number) {
  const where = `${card.id} ${a.op}`;
  const unitsHit = (match: (e: GameEvent, uid: number) => boolean, sel: string, opts: { damaged?: boolean } = {}) => {
    const { uids, random } = expectedUnits(sel, card, b, self);
    // Heals only show on units that were damaged (the card's own new unit is not).
    const candidates = opts.damaged ? uids.filter((u) => u !== self || card.type !== 'unit') : uids;
    const hit = candidates.filter((uid) => events.some((e) => match(e, uid)));
    if (random) expect(hit.length, where).toBe(1);
    else expect(hit.sort(), where).toEqual([...candidates].sort());
  };
  switch (a.op) {
    case 'damage':
      if (a.target === 'enemyHero' || a.target === 'friendlyHero') {
        const player = a.target === 'enemyHero' ? 1 : 0;
        expect(events, where).toContainEqual({ type: 'HeroDamaged', player, amount: a.amount, lane: null });
      } else {
        unitsHit(
          (e, uid) =>
            (e.type === 'DamageDealt' && e.uid === uid && e.amount === a.amount) ||
            (e.type === 'BarrierBroken' && e.uid === uid),
          a.target,
        );
      }
      return;
    case 'heal':
      if (a.target === 'enemyHero' || a.target === 'friendlyHero') {
        const player = a.target === 'friendlyHero' ? 0 : 1;
        const amount = a.amount === 'full' ? 10 : a.amount;
        expect(events, where).toContainEqual({ type: 'HeroHealed', player, amount });
      } else {
        const amount = a.amount === 'full' ? 2 : Math.min(2, a.amount);
        unitsHit((e, uid) => e.type === 'UnitHealed' && e.uid === uid && e.amount === amount, a.target, {
          damaged: true,
        });
      }
      return;
    case 'buff':
      unitsHit(
        (e, uid) =>
          e.type === 'UnitBuffed' &&
          e.uid === uid &&
          e.power === a.power &&
          e.health === a.health &&
          e.duration === a.duration,
        a.target,
      );
      return;
    case 'draw':
      expect(events.filter((e) => e.type === 'CardDrawn' && e.player === 0).length, where).toBe(a.count);
      return;
    case 'summon':
      expect(
        events.filter((e) => e.type === 'UnitSummoned' && e.cardId === a.cardId && e.lane === LANE).length,
        where,
      ).toBe(a.count);
      return;
    case 'move':
      unitsHit((e, uid) => e.type === 'UnitMoved' && e.uid === uid, a.target);
      return;
    case 'gainMana':
      expect(events, where).toContainEqual({ type: 'ManaGained', player: 0, amount: a.amount });
      return;
    case 'grantKeyword':
      unitsHit((e, uid) => e.type === 'KeywordGranted' && e.uid === uid && e.keyword === a.keyword, a.target);
      return;
    case 'destroy':
      unitsHit((e, uid) => e.type === 'UnitDied' && e.uid === uid, a.target);
      return;
  }
}

function between(events: GameEvent[], from: (e: GameEvent) => boolean, to: (e: GameEvent) => boolean) {
  const start = events.findIndex(from);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = events.slice(start + 1);
  const end = rest.findIndex(to);
  return end < 0 ? rest : rest.slice(0, end);
}

function lastIndex(events: GameEvent[], pred: (e: GameEvent) => boolean) {
  for (let i = events.length - 1; i >= 0; i--) if (pred(events[i]!)) return i;
  return -1;
}

function testCard(id: string) {
  const card = getCard(id);
  const b = board();

  // Ongoing auras are checked on the board directly: the selected units gain the stats.
  const ongoing = card.effects.filter((e) => e.trigger === 'ongoing');
  if (ongoing.length > 0) {
    const before = { power: unitPower(b.s, { unit: b.ally, lane: LANE, slot: 0 }) };
    const self = place(b.s, 0, LANE, id);
    for (const e of ongoing) {
      const a = e.action as Extract<Primitive, { op: 'buff' }>;
      const { uids } = expectedUnits(a.target, card, b, self.uid);
      expect(uids).toEqual([b.ally.uid]);
      const loc = { unit: b.ally, lane: LANE, slot: 0 };
      expect(unitPower(b.s, loc), id).toBe(before.power + a.power);
      expect(unitMaxHealth(b.s, loc), id).toBe(TOUGH + a.health);
    }
    return;
  }

  // Last Breath: the unit is on the board as a nearly dead Guard, so the enemy's lane damage kills it.
  if (card.effects.some((e) => e.trigger === 'lastBreath')) {
    const unit = place(b.s, 0, LANE, id, { keywords: ['guard'] });
    unit.barrier = false;
    unit.damage = (card.health ?? 1) - 1;
    const { events } = resolve(b.s);
    const window = between(
      events,
      (e) => e.type === 'UnitDied' && e.uid === unit.uid,
      (e) => e.type === 'LaneCombat' || e.type === 'RoundEnded',
    );
    for (const e of card.effects) if (e.trigger === 'lastBreath') checkPrimitive(e.action, window, card, b, unit.uid);
    return;
  }

  const uid = give(b.s, 0, id);
  const action: PlannedAction =
    card.type === 'unit' ? { type: 'playUnit', uid, lane: LANE, slot: 1 } : spellAction(card, uid, b);
  const s = plan(b.s, 0, action);
  const { events } = resolve(s);
  expect(events, id).not.toContainEqual(expect.objectContaining({ type: 'CardFizzled' }));

  const reveal = between(
    events,
    (e) => e.type === 'CardRevealed' && e.uid === uid,
    (e) => e.type === 'LaneCombat',
  );
  const endOfRound = events.slice(
    lastIndex(events, (e) => e.type === 'LaneCombat') + 1,
    events.findIndex((e) => e.type === 'RoundEnded'),
  );
  for (const e of card.effects) {
    if (e.trigger === 'onReveal' || e.trigger === 'spell') checkPrimitive(e.action, reveal, card, b, uid);
    if (e.trigger === 'endOfRound') checkPrimitive(e.action, endOfRound, card, b, uid);
  }
  if (card.type === 'unit') {
    expect(reveal, id).toContainEqual(expect.objectContaining({ type: 'UnitPlaced', uid, lane: LANE }));
  }
}

describe('every card resolves as its text says', () => {
  const ids = CARDS.filter((c) => !c.token).flatMap((c) => [c.id, c.id + UPGRADED]);
  it.each(ids)('%s', (id) => testCard(id));
});

describe('upgraded cards', () => {
  it('units get +1 Power; spells get stronger amounts or cost 1 less', () => {
    expect(getCard('ember-spark-imp+')).toMatchObject({ name: 'Spark Imp+', power: 3, health: 1 });
    expect(getCard('ember-kindle+').text).toBe('Give a friendly unit +3 Power this round.');
    expect(getCard('tide-frost-snap+').text).toBe('Give an enemy unit -4 Power this round.');
    expect(getCard('tide-ripple+').cost).toBe(0);
    expect(() => getCard('bastion-levy+')).toThrow(/Unknown card/);
  });
});
