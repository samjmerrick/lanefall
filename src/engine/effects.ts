// Effect primitives, target selectors and the shared mutation helpers used while resolving.
// All functions here mutate a draft state owned by the caller (see resolveRound / applyAction).
import {
  activeLaneEffect,
  allUnits,
  findUnit,
  firstFreeSlot,
  isRandomSelector,
  lanePower,
  selectorMatches,
  unitMaxHealth,
  type SelectorSource,
  type UnitLocation,
} from './board';
import { getCard } from './content';
import { nextInt } from './rng';
import type { Primitive, UnitSelector } from './schema';
import {
  HAND_LIMIT,
  LANES,
  other,
  type GameEvent,
  type GameState,
  type LaneIndex,
  type PlayerId,
  type Unit,
} from './types';

export interface Ctx {
  s: GameState;
  events: GameEvent[];
}

/** Where an effect comes from: who owns it, which lane it happens in, and its unit/target if any. */
export type Source = SelectorSource;

export function randomInt(ctx: Ctx, min: number, max: number): number {
  const [v, next] = nextInt(ctx.s.rng, min, max);
  ctx.s.rng = next;
  return v;
}

function pickRandom<T>(ctx: Ctx, items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[randomInt(ctx, 0, items.length - 1)];
}

export function selectUnits(ctx: Ctx, sel: UnitSelector, src: Source): UnitLocation[] {
  const matches = allUnits(ctx.s).filter((l) => selectorMatches(sel, src, l));
  if (!isRandomSelector(sel)) return matches;
  const pick = pickRandom(ctx, matches);
  return pick ? [pick] : [];
}

function heroOf(sel: 'friendlyHero' | 'enemyHero', src: Source): PlayerId {
  return sel === 'friendlyHero' ? src.owner : other(src.owner);
}

// ---------- Mutation helpers ----------

export function damageUnit(ctx: Ctx, unit: Unit, amount: number): void {
  if (amount <= 0) return;
  if (unit.barrier) {
    unit.barrier = false;
    ctx.events.push({ type: 'BarrierBroken', uid: unit.uid });
    return;
  }
  unit.damage += amount;
  ctx.events.push({ type: 'DamageDealt', uid: unit.uid, amount });
}

export function healUnit(ctx: Ctx, unit: Unit, amount: number | 'full'): void {
  const healed = amount === 'full' ? unit.damage : Math.min(unit.damage, amount);
  if (healed <= 0) return;
  unit.damage -= healed;
  ctx.events.push({ type: 'UnitHealed', uid: unit.uid, amount: healed });
}

export function damageHero(ctx: Ctx, player: PlayerId, amount: number, lane: LaneIndex | null): void {
  if (amount <= 0) return;
  ctx.s.players[player].hp -= amount;
  ctx.events.push({ type: 'HeroDamaged', player, amount, lane });
}

export function healHero(ctx: Ctx, player: PlayerId, amount: number | 'full'): void {
  const p = ctx.s.players[player];
  const missing = Math.max(0, p.maxHp - p.hp);
  const healed = amount === 'full' ? missing : Math.min(missing, amount);
  if (healed <= 0) return;
  p.hp += healed;
  ctx.events.push({ type: 'HeroHealed', player, amount: healed });
}

export function drawCard(ctx: Ctx, player: PlayerId): void {
  const p = ctx.s.players[player];
  const cardId = p.deck.pop();
  if (cardId === undefined) return; // Empty deck: no draw, no penalty.
  if (p.hand.length >= HAND_LIMIT) {
    p.discard.push(cardId);
    ctx.events.push({ type: 'CardBurned', player, cardId });
    return;
  }
  const uid = ctx.s.nextUid++;
  p.hand.push({ uid, cardId });
  ctx.events.push({ type: 'CardDrawn', player, uid, cardId });
}

export function createUnit(ctx: Ctx, cardId: string, owner: PlayerId, uid?: number): Unit {
  const card = getCard(cardId);
  return {
    uid: uid ?? ctx.s.nextUid++,
    cardId,
    owner,
    basePower: card.power ?? 0,
    baseHealth: card.health ?? 1,
    roundPower: 0,
    roundHealth: 0,
    damage: 0,
    keywords: [...card.keywords],
    barrier: card.keywords.includes('barrier'),
    shiftUsed: false,
    doomed: false,
    playOrder: ctx.s.nextPlayOrder++,
  };
}

function summon(ctx: Ctx, cardId: string, owner: PlayerId, lane: LaneIndex): void {
  const slot = firstFreeSlot(ctx.s, lane, owner);
  if (slot === null) return;
  const unit = createUnit(ctx, cardId, owner);
  ctx.s.lanes[lane].slots[owner][slot] = unit;
  ctx.events.push({ type: 'UnitSummoned', player: owner, uid: unit.uid, cardId, lane, slot });
  enterLane(ctx, unit, lane);
}

export function moveUnit(ctx: Ctx, loc: UnitLocation, to: LaneIndex, slot: number): void {
  const owner = loc.unit.owner;
  ctx.s.lanes[loc.lane].slots[owner][loc.slot] = null;
  ctx.s.lanes[to].slots[owner][slot] = loc.unit;
  ctx.events.push({ type: 'UnitMoved', uid: loc.unit.uid, from: loc.lane, to, slot });
  enterLane(ctx, loc.unit, to);
}

/** Runs the lane effect's onEnter primitives for a unit that has just arrived (played, summoned or moved). */
export function enterLane(ctx: Ctx, unit: Unit, lane: LaneIndex): void {
  const src: Source = { owner: unit.owner, lane, unitUid: unit.uid, targetUid: null };
  for (const action of activeLaneEffect(ctx.s, lane).onEnter) runPrimitive(ctx, action, src);
}

// ---------- Primitive dispatch ----------

export function runPrimitive(ctx: Ctx, action: Primitive, src: Source): void {
  switch (action.op) {
    case 'damage':
      if (action.target === 'friendlyHero' || action.target === 'enemyHero') {
        damageHero(ctx, heroOf(action.target, src), action.amount, null);
      } else {
        for (const l of selectUnits(ctx, action.target, src)) damageUnit(ctx, l.unit, action.amount);
      }
      return;
    case 'heal':
      if (action.target === 'friendlyHero' || action.target === 'enemyHero') {
        healHero(ctx, heroOf(action.target, src), action.amount);
      } else {
        for (const l of selectUnits(ctx, action.target, src)) healUnit(ctx, l.unit, action.amount);
      }
      return;
    case 'buff':
      for (const l of selectUnits(ctx, action.target, src)) {
        if (action.duration === 'permanent') {
          l.unit.basePower += action.power;
          l.unit.baseHealth += action.health;
        } else {
          l.unit.roundPower += action.power;
          l.unit.roundHealth += action.health;
        }
        ctx.events.push({
          type: 'UnitBuffed',
          uid: l.unit.uid,
          power: action.power,
          health: action.health,
          duration: action.duration,
        });
      }
      return;
    case 'draw':
      for (let i = 0; i < action.count; i++) drawCard(ctx, src.owner);
      return;
    case 'summon':
      if (src.lane === null) return;
      for (let i = 0; i < action.count; i++) summon(ctx, action.cardId, src.owner, src.lane);
      return;
    case 'move':
      for (const l of selectUnits(ctx, action.target, src)) {
        const options: [LaneIndex, number][] = [];
        for (const lane of LANES) {
          if (lane === l.lane) continue;
          const slot = firstFreeSlot(ctx.s, lane, l.unit.owner);
          if (slot !== null) options.push([lane, slot]);
        }
        const pick = pickRandom(ctx, options);
        if (pick) moveUnit(ctx, l, pick[0], pick[1]);
      }
      return;
    case 'gainMana':
      ctx.s.players[src.owner].bonusMana += action.amount;
      ctx.events.push({ type: 'ManaGained', player: src.owner, amount: action.amount });
      return;
    case 'grantKeyword':
      for (const l of selectUnits(ctx, action.target, src)) {
        if (!l.unit.keywords.includes(action.keyword)) l.unit.keywords.push(action.keyword);
        if (action.keyword === 'barrier') l.unit.barrier = true;
        ctx.events.push({ type: 'KeywordGranted', uid: l.unit.uid, keyword: action.keyword });
      }
      return;
    case 'destroy':
      for (const l of selectUnits(ctx, action.target, src)) l.unit.doomed = true;
      return;
  }
}

export function runTrigger(
  ctx: Ctx,
  loc: { unit: Unit; lane: LaneIndex },
  trigger: 'onReveal' | 'endOfRound' | 'lastBreath',
): void {
  const src: Source = { owner: loc.unit.owner, lane: loc.lane, unitUid: loc.unit.uid, targetUid: null };
  for (const effect of getCard(loc.unit.cardId).effects) {
    if (effect.trigger === trigger) runPrimitive(ctx, effect.action, src);
  }
}

/**
 * Removes every unit whose damage reaches its Health (or that is doomed), then runs their
 * Last Breath effects. Repeats until no more units die, since Last Breath can kill.
 */
export function processDeaths(ctx: Ctx): void {
  for (let guard = 0; guard < 100; guard++) {
    const dying = allUnits(ctx.s).filter((l) => l.unit.doomed || l.unit.damage >= unitMaxHealth(ctx.s, l));
    if (dying.length === 0) return;
    for (const l of dying) {
      ctx.s.lanes[l.lane].slots[l.unit.owner][l.slot] = null;
      const card = getCard(l.unit.cardId);
      if (!card.token) {
        const owner = ctx.s.players[l.unit.owner];
        if (activeLaneEffect(ctx.s, l.lane).returnOnDeath && owner.hand.length < HAND_LIMIT) {
          const uid = ctx.s.nextUid++;
          owner.hand.push({ uid, cardId: l.unit.cardId });
          ctx.events.push({ type: 'CardDrawn', player: l.unit.owner, uid, cardId: l.unit.cardId });
        } else owner.discard.push(l.unit.cardId);
      }
      ctx.events.push({
        type: 'UnitDied',
        uid: l.unit.uid,
        cardId: l.unit.cardId,
        owner: l.unit.owner,
        lane: l.lane,
      });
    }
    for (const l of dying) {
      runTrigger(ctx, l, 'lastBreath');
      const src: Source = { owner: l.unit.owner, lane: l.lane, unitUid: null, targetUid: null };
      for (const action of activeLaneEffect(ctx.s, l.lane).onDeath) runPrimitive(ctx, action, src);
    }
  }
  throw new Error('processDeaths did not settle');
}

export function laneEffectEndOfRound(ctx: Ctx, lane: LaneIndex): void {
  const effect = activeLaneEffect(ctx.s, lane);
  // Lane effects have no owner; the initiative player is used only so "friendly"/"enemy" are defined.
  const src: Source = { owner: ctx.s.initiative, lane, unitUid: null, targetUid: null };
  for (const action of effect.endOfRound) runPrimitive(ctx, action, src);
  if (effect.winnerEndOfRound.length === 0) return;
  const [a, b] = [lanePower(ctx.s, lane, 0), lanePower(ctx.s, lane, 1)];
  if (a === b) return;
  const winner: PlayerId = a > b ? 0 : 1;
  for (const action of effect.winnerEndOfRound) {
    runPrimitive(ctx, action, { owner: winner, lane, unitUid: null, targetUid: null });
  }
}

export { findUnit };
