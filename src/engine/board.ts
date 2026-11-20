// Board queries and derived unit stats. Pure reads over GameState.
import { getCard, getLaneEffect } from './content';
import type { LaneEffectDef, UnitSelector } from './schema';
import {
  LANES,
  other,
  SLOTS_PER_SIDE,
  type GameState,
  type LaneIndex,
  type PlayerId,
  type Unit,
} from './types';

export interface UnitLocation {
  unit: Unit;
  lane: LaneIndex;
  slot: number;
}

const NO_EFFECT: LaneEffectDef = {
  id: 'lane-hidden',
  name: 'Hidden',
  text: '',
  powerBonus: 0,
  healthBonus: 0,
  overflowMultiplier: 1,
  maxUnits: SLOTS_PER_SIDE,
  heroDamage: true,
  endOfRound: [],
};

/** The lane's effect if revealed, otherwise a neutral effect. */
export function activeLaneEffect(s: GameState, lane: LaneIndex): LaneEffectDef {
  const l = s.lanes[lane];
  return l.revealed ? getLaneEffect(l.effectId) : NO_EFFECT;
}

export function unitsOf(s: GameState, lane: LaneIndex, player: PlayerId): Unit[] {
  return s.lanes[lane].slots[player].filter((u): u is Unit => u !== null);
}

/** Every unit in play, ordered by lane, then the given player first, then play order. */
export function allUnits(s: GameState, first: PlayerId = s.initiative): UnitLocation[] {
  const out: UnitLocation[] = [];
  for (const lane of LANES) {
    for (const p of [first, other(first)]) {
      const side: UnitLocation[] = [];
      s.lanes[lane].slots[p].forEach((unit, slot) => unit && side.push({ unit, lane, slot }));
      side.sort((a, b) => a.unit.playOrder - b.unit.playOrder);
      out.push(...side);
    }
  }
  return out;
}

export function findUnit(s: GameState, uid: number): UnitLocation | null {
  for (const lane of LANES) {
    for (const p of [0, 1] as const) {
      const slot = s.lanes[lane].slots[p].findIndex((u) => u?.uid === uid);
      if (slot >= 0) return { unit: s.lanes[lane].slots[p][slot]!, lane, slot };
    }
  }
  return null;
}

/** Slot is usable: in range, empty and within the lane's unit cap. */
export function canPlaceAt(s: GameState, lane: LaneIndex, player: PlayerId, slot: number): boolean {
  const side = s.lanes[lane].slots[player];
  if (slot < 0 || slot >= SLOTS_PER_SIDE || side[slot] !== null) return false;
  return unitsOf(s, lane, player).length < activeLaneEffect(s, lane).maxUnits;
}

export function firstFreeSlot(s: GameState, lane: LaneIndex, player: PlayerId): number | null {
  for (let slot = 0; slot < SLOTS_PER_SIDE; slot++) if (canPlaceAt(s, lane, player, slot)) return slot;
  return null;
}

interface Aura {
  power: number;
  health: number;
}

/** Sum of Ongoing buffs from other units that apply to `target`. */
function auraFor(s: GameState, target: UnitLocation): Aura {
  const aura: Aura = { power: 0, health: 0 };
  for (const src of allUnits(s)) {
    for (const effect of getCard(src.unit.cardId).effects) {
      if (effect.trigger !== 'ongoing' || effect.action.op !== 'buff') continue;
      const from = { owner: src.unit.owner, lane: src.lane, unitUid: src.unit.uid, targetUid: null };
      if (!isRandomSelector(effect.action.target) && selectorMatches(effect.action.target, from, target)) {
        aura.power += effect.action.power;
        aura.health += effect.action.health;
      }
    }
  }
  return aura;
}

/** Context for matching a unit against a selector: who owns the effect, where, and its own unit. */
export interface SelectorSource {
  owner: PlayerId;
  lane: LaneIndex | null;
  unitUid: number | null;
  targetUid: number | null;
}

/**
 * Whether `t` matches a non-random selector. Random selectors match every candidate here;
 * the caller then picks one.
 */
export function selectorMatches(sel: UnitSelector, src: SelectorSource, t: UnitLocation): boolean {
  const friendly = t.unit.owner === src.owner;
  const self = t.unit.uid === src.unitUid;
  const inLane = src.lane !== null && t.lane === src.lane;
  switch (sel) {
    case 'self':
      return self;
    case 'target':
      return t.unit.uid === src.targetUid;
    case 'friendlyUnitsInLane':
      return friendly && inLane;
    case 'otherFriendlyUnitsInLane':
      return friendly && inLane && !self;
    case 'enemyUnitsInLane':
    case 'randomEnemyUnitInLane':
      return !friendly && inLane;
    case 'allUnitsInLane':
      return inLane;
    case 'allFriendlyUnits':
    case 'randomFriendlyUnit':
      return friendly;
    case 'otherFriendlyUnits':
      return friendly && !self;
    case 'allEnemyUnits':
    case 'randomEnemyUnit':
      return !friendly;
  }
}

export function isRandomSelector(sel: UnitSelector): boolean {
  return sel.startsWith('random');
}

export function unitPower(s: GameState, loc: UnitLocation): number {
  const lane = activeLaneEffect(s, loc.lane);
  const p = loc.unit.basePower + loc.unit.roundPower + lane.powerBonus + auraFor(s, loc).power;
  return Math.max(0, p);
}

export function unitMaxHealth(s: GameState, loc: UnitLocation): number {
  const lane = activeLaneEffect(s, loc.lane);
  return loc.unit.baseHealth + loc.unit.roundHealth + lane.healthBonus + auraFor(s, loc).health;
}

export function unitRemainingHealth(s: GameState, loc: UnitLocation): number {
  return Math.max(0, unitMaxHealth(s, loc) - loc.unit.damage);
}

export function lanePower(s: GameState, lane: LaneIndex, player: PlayerId): number {
  let total = 0;
  s.lanes[lane].slots[player].forEach((unit, slot) => {
    if (unit) total += unitPower(s, { unit, lane, slot });
  });
  return total;
}

export function hasKeyword(unit: Unit, k: Unit['keywords'][number]): boolean {
  return unit.keywords.includes(k);
}
