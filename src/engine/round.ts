// Round flow: start of round, reveal, lane combat, end of round and win checks.
import { allUnits, canPlaceAt, findUnit, firstFreeSlot, hasKeyword, unitsOf } from './board';
import { assignLaneDamage, lanePowers } from './combat';
import { getCard } from './content';
import {
  createUnit,
  damageHero,
  damageUnit,
  drawCard,
  healHero,
  healUnit,
  laneEffectEndOfRound,
  moveUnit,
  processDeaths,
  runPrimitive,
  runTrigger,
  type Ctx,
  type Source,
} from './effects';
import {
  IllegalActionError,
  LANES,
  MAX_MANA,
  MAX_ROUNDS,
  other,
  RESERVE_CAP,
  type GameEvent,
  type GameState,
  type LaneIndex,
  type PlannedAction,
  type PlayerId,
} from './types';

export function planCost(s: GameState, player: PlayerId, plan: PlannedAction[] = s.players[player].plan) {
  let unit = 0;
  let spell = 0;
  const hand = s.players[player].hand;
  for (const a of plan) {
    if (a.type === 'shift') continue;
    const card = hand.find((h) => h.uid === a.uid);
    if (!card) continue;
    const cost = getCard(card.cardId).cost;
    if (a.type === 'playUnit') unit += cost;
    else spell += cost;
  }
  return { unit, spell };
}

/** Mana and Reserve left after paying for the current plan (spells use Reserve first). */
export function manaLeft(s: GameState, player: PlayerId): { mana: number; reserve: number } {
  const p = s.players[player];
  const { unit, spell } = planCost(s, player);
  const fromReserve = Math.min(p.reserve, spell);
  return { mana: p.mana - unit - (spell - fromReserve), reserve: p.reserve - fromReserve };
}

/** Units are paid from mana only; spells may also use Reserve. */
export function isAffordable(s: GameState, player: PlayerId, plan: PlannedAction[]): boolean {
  const p = s.players[player];
  const { unit, spell } = planCost(s, player, plan);
  return unit <= p.mana && unit + spell <= p.mana + p.reserve;
}

/** Starts round `round`: initiative, mana, draw, lane reveal. Mutates the draft. */
export function beginRound(ctx: Ctx, round: number): void {
  const s = ctx.s;
  if (round > 1) s.initiative = other(s.initiative);
  s.round = round;
  s.phase = 'plan';
  ctx.events.push({ type: 'RoundStarted', round, initiative: s.initiative });
  for (const player of [0, 1] as const) {
    const p = s.players[player];
    p.mana = Math.min(MAX_MANA, round) + p.bonusMana;
    p.bonusMana = 0;
    p.plan = [];
    p.ready = false;
    ctx.events.push({ type: 'ManaRefilled', player, mana: p.mana, reserve: p.reserve });
  }
  for (const player of [s.initiative, other(s.initiative)]) drawCard(ctx, player);
  if (round <= 3) {
    const lane = (round - 1) as LaneIndex;
    s.lanes[lane].revealed = true;
    ctx.events.push({ type: 'LaneRevealed', lane, effectId: s.lanes[lane].effectId });
  }
  roundStartModifiers(ctx, round);
}

/** Runs each player's round-start modifiers, initiative player first. May end the match. */
function roundStartModifiers(ctx: Ctx, round: number): void {
  const s = ctx.s;
  let ran = false;
  for (const player of [s.initiative, other(s.initiative)]) {
    for (const m of s.modifiers[player]) {
      if (m.kind !== 'roundStart' || (m.rounds && !m.rounds.includes(round))) continue;
      runPrimitive(ctx, m.action, { owner: player, lane: null, unitUid: null, targetUid: null });
      ran = true;
    }
  }
  if (!ran) return;
  processDeaths(ctx);
  checkHp(ctx);
}

function takeFromHand(s: GameState, player: PlayerId, uid: number) {
  const hand = s.players[player].hand;
  const i = hand.findIndex((h) => h.uid === uid);
  if (i < 0) return null;
  const [card] = hand.splice(i, 1);
  return card!;
}

function fizzle(ctx: Ctx, player: PlayerId, uid: number, cardId: string, reason: string) {
  ctx.s.players[player].discard.push(cardId);
  ctx.events.push({ type: 'CardFizzled', player, uid, cardId, reason });
}

function revealUnit(ctx: Ctx, player: PlayerId, a: Extract<PlannedAction, { type: 'playUnit' }>) {
  const card = takeFromHand(ctx.s, player, a.uid);
  if (!card) return;
  ctx.events.push({ type: 'CardRevealed', player, uid: card.uid, cardId: card.cardId });
  const slot = canPlaceAt(ctx.s, a.lane, player, a.slot) ? a.slot : firstFreeSlot(ctx.s, a.lane, player);
  if (slot === null) return fizzle(ctx, player, card.uid, card.cardId, 'lane full');
  const unit = createUnit(ctx, card.cardId, player, card.uid);
  ctx.s.lanes[a.lane].slots[player][slot] = unit;
  ctx.events.push({ type: 'UnitPlaced', player, uid: unit.uid, cardId: unit.cardId, lane: a.lane, slot });
  if (hasKeyword(unit, 'rally')) {
    const src: Source = { owner: player, lane: a.lane, unitUid: unit.uid, targetUid: null };
    runPrimitive(
      ctx,
      { op: 'buff', target: 'otherFriendlyUnitsInLane', power: 1, health: 0, duration: 'round' },
      src,
    );
  }
  runTrigger(ctx, { unit, lane: a.lane }, 'onReveal');
}

function revealSpell(ctx: Ctx, player: PlayerId, a: Extract<PlannedAction, { type: 'playSpell' }>) {
  const card = takeFromHand(ctx.s, player, a.uid);
  if (!card) return;
  ctx.events.push({ type: 'CardRevealed', player, uid: card.uid, cardId: card.cardId });
  const def = getCard(card.cardId);
  let lane: LaneIndex | null = null;
  let targetUid: number | null = null;
  if (a.target.kind === 'unit') {
    const loc = findUnit(ctx.s, a.target.uid);
    const ok =
      loc !== null &&
      (def.targeting === 'anyUnit' ||
        (def.targeting === 'enemyUnit' && loc.unit.owner !== player) ||
        (def.targeting === 'friendlyUnit' && loc.unit.owner === player));
    if (!ok) return fizzle(ctx, player, card.uid, card.cardId, 'target gone');
    lane = loc.lane;
    targetUid = loc.unit.uid;
  } else if (a.target.kind === 'lane') {
    lane = a.target.lane;
  }
  const src: Source = { owner: player, lane, unitUid: null, targetUid };
  for (const effect of def.effects) runPrimitive(ctx, effect.action, src);
  ctx.s.players[player].discard.push(card.cardId);
}

function revealShift(ctx: Ctx, player: PlayerId, a: Extract<PlannedAction, { type: 'shift' }>) {
  const loc = findUnit(ctx.s, a.uid);
  if (!loc || loc.unit.owner !== player || loc.unit.shiftUsed || loc.lane === a.lane) return;
  const slot = canPlaceAt(ctx.s, a.lane, player, a.slot) ? a.slot : firstFreeSlot(ctx.s, a.lane, player);
  if (slot === null) return;
  loc.unit.shiftUsed = true;
  moveUnit(ctx, loc, a.lane, slot);
}

function reveal(ctx: Ctx): void {
  const s = ctx.s;
  // Mana is spent as planned, whether or not cards later fizzle.
  for (const player of [0, 1] as const) {
    const p = s.players[player];
    const left = manaLeft(s, player);
    p.mana = left.mana;
    p.reserve = Math.min(RESERVE_CAP, left.mana + left.reserve);
  }
  for (const player of [s.initiative, other(s.initiative)]) {
    const plan = s.players[player].plan;
    s.players[player].plan = [];
    for (const a of plan) {
      if (a.type === 'playUnit') revealUnit(ctx, player, a);
      else if (a.type === 'playSpell') revealSpell(ctx, player, a);
      else revealShift(ctx, player, a);
      processDeaths(ctx);
    }
  }
}

function laneCombat(ctx: Ctx, lane: LaneIndex): void {
  const s = ctx.s;
  // Assignments come from the pre-combat board; each side's strike is then applied in turn,
  // the player with initiative first. The order is presentational: nothing reads the other
  // side's results before deaths are processed.
  const hits = assignLaneDamage(s, lane);
  const first = s.initiative;
  const order: [PlayerId, PlayerId] = [first, other(first)];
  ctx.events.push({ type: 'LaneCombat', lane, power: lanePowers(s, lane), order, hits });
  for (const attacker of order) {
    const side = hits[attacker];
    const enemy = other(attacker);
    for (const hit of side.units) {
      const loc = findUnit(s, hit.uid);
      if (loc) damageUnit(ctx, loc.unit, hit.amount);
    }
    damageHero(ctx, enemy, side.hero, lane);
    if (side.hero > 0 && side.lifesteal > 0) healHero(ctx, attacker, side.lifesteal);
  }
  processDeaths(ctx);
}

function endOfRound(ctx: Ctx): void {
  const s = ctx.s;
  for (const loc of allUnits(s)) {
    // A unit may have died to an earlier End of Round effect this step.
    if (!findUnit(s, loc.unit.uid)) continue;
    if (hasKeyword(loc.unit, 'growth')) {
      runPrimitive(
        ctx,
        { op: 'buff', target: 'self', power: 1, health: 1, duration: 'permanent' },
        { owner: loc.unit.owner, lane: loc.lane, unitUid: loc.unit.uid, targetUid: null },
      );
    }
    if (hasKeyword(loc.unit, 'regenerate')) healUnit(ctx, loc.unit, 'full');
    runTrigger(ctx, loc, 'endOfRound');
  }
  for (const lane of LANES) laneEffectEndOfRound(ctx, lane);
  for (const loc of allUnits(s)) if (hasKeyword(loc.unit, 'ephemeral')) loc.unit.doomed = true;
  processDeaths(ctx);
  for (const loc of allUnits(s)) {
    loc.unit.roundPower = 0;
    loc.unit.roundHealth = 0;
  }
  // Losing temporary Health can be lethal.
  processDeaths(ctx);
}

/** Ends the match if a hero is on 0 HP or less. Returns true if the match is over. */
function checkHp(ctx: Ctx): boolean {
  const [a, b] = ctx.s.players;
  if (a.hp > 0 && b.hp > 0) return false;
  // Both down: the hero with more HP left wins; equal HP is a draw.
  const winner: PlayerId | null = a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1;
  endMatch(ctx, winner, 'hp');
  return true;
}

function endMatch(ctx: Ctx, winner: PlayerId | null, reason: 'hp' | 'rounds') {
  ctx.s.phase = 'over';
  ctx.s.result = { winner, reason };
  ctx.events.push({ type: 'MatchEnded', winner, reason });
}

/**
 * Resolves the current round once both players have ended their turn: reveal, combat,
 * End of Round, win checks, then starts the next round. Pure: returns a new state.
 */
export function resolveRound(state: GameState): { state: GameState; events: GameEvent[] } {
  if (state.phase !== 'plan') throw new IllegalActionError(`Cannot resolve a round in phase ${state.phase}`);
  if (!state.players[0].ready || !state.players[1].ready) {
    throw new IllegalActionError('Both players must end their turn first');
  }
  const ctx: Ctx = { s: structuredClone(state), events: [] };
  reveal(ctx);
  for (const lane of LANES) laneCombat(ctx, lane);
  if (!checkHp(ctx)) {
    endOfRound(ctx);
    ctx.events.push({ type: 'RoundEnded', round: ctx.s.round });
    if (!checkHp(ctx)) {
      if (ctx.s.round >= MAX_ROUNDS) {
        const [a, b] = ctx.s.players;
        endMatch(ctx, a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1, 'rounds');
      } else {
        beginRound(ctx, ctx.s.round + 1);
      }
    }
  }
  return { state: ctx.s, events: ctx.events };
}

export { unitsOf };
