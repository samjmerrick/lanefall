// Match setup and planning-phase actions.
import { canPlaceAt, findUnit, hasKeyword, unitsOf, activeLaneEffect } from './board';
import { getCard, LANE_EFFECTS } from './content';
import { drawCard, randomInt, type Ctx } from './effects';
import { seedRng, shuffle } from './rng';
import { MatchModifierSchema, type MatchModifier } from './schema';
import { beginRound, isAffordable } from './round';
import {
  DEFAULT_HERO_HP,
  IllegalActionError,
  LANES,
  RESERVE_CAP,
  SLOTS_PER_SIDE,
  STARTING_HAND,
  type Action,
  type GameState,
  type LaneIndex,
  type MatchConfig,
  type PlannedAction,
  type PlayerId,
  type PlayerState,
  type SpellTarget,
} from './types';

function newPlayer(hp: number, deck: string[], mods: readonly MatchModifier[]): PlayerState {
  for (const m of mods) if (m.kind === 'heroHp') hp += m.amount;
  hp = Math.max(1, hp);
  let reserve = 0;
  for (const m of mods) if (m.kind === 'startReserve') reserve += m.amount;
  return {
    hp,
    maxHp: hp,
    mana: 0,
    reserve: Math.min(RESERVE_CAP, reserve),
    bonusMana: 0,
    deck,
    hand: [],
    discard: [],
    plan: [],
    ready: false,
    mulliganed: false,
  };
}

const emptySide = () => Array.from({ length: SLOTS_PER_SIDE }, () => null);

/** Creates a match in the mulligan phase: decks shuffled, lane effects chosen, 4 cards drawn each. */
export function initMatch(config: MatchConfig, seed: number): GameState {
  for (const deck of config.decks) for (const id of deck) getCard(id);
  const modifiers: [MatchModifier[], MatchModifier[]] = [
    (config.modifiers?.[0] ?? []).map((m) => MatchModifierSchema.parse(m)),
    (config.modifiers?.[1] ?? []).map((m) => MatchModifierSchema.parse(m)),
  ];
  const hp = config.heroHp ?? DEFAULT_HERO_HP;
  let rng = seedRng(seed);
  const [deck0, r1] = shuffle(rng, config.decks[0]);
  const [deck1, r2] = shuffle(r1, config.decks[1]);
  rng = r2;
  let laneIds = config.laneEffects;
  if (!laneIds) {
    const [ids, r3] = shuffle(
      rng,
      LANE_EFFECTS.map((l) => l.id),
    );
    rng = r3;
    laneIds = [ids[0]!, ids[1]!, ids[2]!];
  }
  const s: GameState = {
    version: 1,
    round: 0,
    phase: 'mulligan',
    rng,
    initiative: 0,
    players: [newPlayer(hp, deck0, modifiers[0]), newPlayer(hp, deck1, modifiers[1])],
    lanes: [0, 1, 2].map((i) => ({
      effectId: laneIds[i]!,
      revealed: false,
      slots: [emptySide(), emptySide()],
    })) as GameState['lanes'],
    nextUid: 1,
    nextPlayOrder: 1,
    result: null,
    modifiers,
  };
  const ctx: Ctx = { s, events: [] };
  s.initiative = randomInt(ctx, 0, 1) as PlayerId;
  const handSize = modifiers.map(
    (mods) => STARTING_HAND + mods.reduce((n, m) => n + (m.kind === 'startHand' ? m.amount : 0), 0),
  );
  for (let i = 0; i < Math.max(...handSize); i++)
    for (const p of [0, 1] as const) if (i < handSize[p]!) drawCard(ctx, p);
  return s;
}

// ---------- Validation ----------

/** The slot is empty now, not claimed by another planned action, and the lane has room left. */
function slotAvailable(s: GameState, player: PlayerId, plan: PlannedAction[], lane: LaneIndex, slot: number) {
  if (!canPlaceAt(s, lane, player, slot)) return false;
  const into = plan.filter((a) => a.type !== 'playSpell' && a.lane === lane);
  if (into.some((a) => a.type !== 'playSpell' && a.slot === slot)) return false;
  return unitsOf(s, lane, player).length + into.length < activeLaneEffect(s, lane).maxUnits;
}

function targetValid(s: GameState, player: PlayerId, cardId: string, target: SpellTarget): boolean {
  const targeting = getCard(cardId).targeting;
  switch (targeting) {
    case 'none':
      return target.kind === 'none';
    case 'lane':
      return target.kind === 'lane' && LANES.includes(target.lane);
    default: {
      if (target.kind !== 'unit') return false;
      const loc = findUnit(s, target.uid);
      if (!loc) return false;
      if (targeting === 'enemyUnit') return loc.unit.owner !== player;
      if (targeting === 'friendlyUnit') return loc.unit.owner === player;
      return true;
    }
  }
}

/** Returns a reason the planned action is illegal, or null if it is legal. */
function checkPlanned(s: GameState, player: PlayerId, a: PlannedAction): string | null {
  const p = s.players[player];
  if (p.plan.some((x) => x.uid === a.uid)) return 'already planned';
  if (a.type === 'shift') {
    const loc = findUnit(s, a.uid);
    if (!loc || loc.unit.owner !== player) return 'no such unit';
    if (!hasKeyword(loc.unit, 'shift')) return 'unit cannot Shift';
    if (loc.unit.shiftUsed) return 'Shift already used';
    if (loc.lane === a.lane) return 'already in that lane';
    if (!slotAvailable(s, player, p.plan, a.lane, a.slot)) return 'slot unavailable';
    return null;
  }
  const card = p.hand.find((h) => h.uid === a.uid);
  if (!card) return 'card not in hand';
  const def = getCard(card.cardId);
  if (a.type === 'playUnit') {
    if (def.type !== 'unit') return 'not a unit';
    if (!slotAvailable(s, player, p.plan, a.lane, a.slot)) return 'slot unavailable';
  } else {
    if (def.type !== 'spell') return 'not a spell';
    if (!targetValid(s, player, card.cardId, a.target)) return 'invalid target';
  }
  if (!isAffordable(s, player, [...p.plan, a])) return 'not enough mana';
  return null;
}

/** Applies a mulligan or planning action. Pure: returns a new state. Throws IllegalActionError. */
export function applyAction(state: GameState, action: Action): GameState {
  const s = structuredClone(state);
  const p = s.players[action.player];
  switch (action.type) {
    case 'mulligan': {
      if (s.phase !== 'mulligan' || p.mulliganed) throw new IllegalActionError('Mulligan not allowed now');
      const unique = new Set(action.uids);
      if (unique.size !== action.uids.length) throw new IllegalActionError('Duplicate mulligan card');
      const returned = p.hand.filter((h) => unique.has(h.uid));
      if (returned.length !== unique.size) throw new IllegalActionError('Mulligan card not in hand');
      const ctx: Ctx = { s, events: [] };
      p.hand = p.hand.filter((h) => !unique.has(h.uid));
      for (let i = 0; i < returned.length; i++) drawCard(ctx, action.player);
      const [deck, rng] = shuffle(s.rng, [...p.deck, ...returned.map((h) => h.cardId)]);
      p.deck = deck;
      s.rng = rng;
      p.mulliganed = true;
      if (s.players[0].mulliganed && s.players[1].mulliganed) beginRound(ctx, 1);
      return s;
    }
    case 'plan': {
      if (s.phase !== 'plan' || p.ready) throw new IllegalActionError('Cannot plan now');
      const reason = checkPlanned(s, action.player, action.action);
      if (reason) throw new IllegalActionError(`Illegal ${action.action.type}: ${reason}`);
      p.plan.push(action.action);
      return s;
    }
    case 'unplan': {
      if (s.phase !== 'plan' || p.ready) throw new IllegalActionError('Cannot change plan now');
      if (action.index < 0 || action.index >= p.plan.length)
        throw new IllegalActionError('No such planned action');
      p.plan.splice(action.index, 1);
      // Taking back an action can strand later ones (a slot or mana they relied on); keep only those still legal.
      const rest = p.plan;
      p.plan = [];
      for (const a of rest) if (checkPlanned(s, action.player, a) === null) p.plan.push(a);
      return s;
    }
    case 'endTurn': {
      if (s.phase !== 'plan' || p.ready) throw new IllegalActionError('Cannot end turn now');
      p.ready = true;
      return s;
    }
  }
}

/**
 * All single actions `player` may take now. In the mulligan phase this offers keeping the hand or
 * replacing all of it (any subset is legal through applyAction). In planning it lists every playable
 * card, target, slot and Shift, plus endTurn.
 */
export function legalActions(s: GameState, player: PlayerId): Action[] {
  const p = s.players[player];
  if (s.phase === 'mulligan') {
    if (p.mulliganed) return [];
    return [
      { type: 'mulligan', player, uids: [] },
      { type: 'mulligan', player, uids: p.hand.map((h) => h.uid) },
    ];
  }
  if (s.phase !== 'plan' || p.ready) return [];
  const out: Action[] = [];
  const candidates: PlannedAction[] = [];
  for (const card of p.hand) {
    const def = getCard(card.cardId);
    if (def.type === 'unit') {
      for (const lane of LANES)
        for (let slot = 0; slot < SLOTS_PER_SIDE; slot++)
          candidates.push({ type: 'playUnit', uid: card.uid, lane, slot });
    } else {
      for (const target of spellTargets(s, def.targeting))
        candidates.push({ type: 'playSpell', uid: card.uid, target });
    }
  }
  for (const lane of LANES) {
    for (const unit of unitsOf(s, lane, player)) {
      if (!hasKeyword(unit, 'shift')) continue;
      for (const to of LANES)
        for (let slot = 0; slot < SLOTS_PER_SIDE; slot++)
          candidates.push({ type: 'shift', uid: unit.uid, lane: to, slot });
    }
  }
  for (const a of candidates)
    if (checkPlanned(s, player, a) === null) out.push({ type: 'plan', player, action: a });
  out.push({ type: 'endTurn', player });
  return out;
}

function spellTargets(s: GameState, targeting: string): SpellTarget[] {
  if (targeting === 'none') return [{ kind: 'none' }];
  if (targeting === 'lane') return LANES.map((lane) => ({ kind: 'lane', lane }));
  const out: SpellTarget[] = [];
  for (const lane of LANES)
    for (const side of s.lanes[lane].slots)
      for (const u of side) if (u) out.push({ kind: 'unit', uid: u.uid });
  return out;
}
