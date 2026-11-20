// Lane damage assignment. Pure: reads a state, returns who hits what. round.ts applies the result.
import {
  activeLaneEffect,
  canPlaceAt,
  findUnit,
  firstFreeSlot,
  hasKeywordHere,
  unitPower,
  unitRemainingHealth,
  type UnitLocation,
} from './board';
import { createUnit, type Ctx } from './effects';
import type { LaneEffectDef } from './schema';
import { LANES, other, type GameState, type LaneIndex, type PlayerId } from './types';

export interface UnitHit {
  uid: number;
  amount: number;
  /** The target has a Barrier, which absorbs the whole hit. */
  barrier: boolean;
}

/** What one side's units do in a lane, from the pre-combat board. */
export interface SideHits {
  attacker: PlayerId;
  /** Hits on the enemy's units, in the order they are dealt. */
  units: UnitHit[];
  /** Normal power left after the enemy units soaked. */
  overflow: number;
  /** Power of Pierce units (goes straight to the enemy hero). */
  pierce: number;
  /** Total hero damage: overflow x lane multiplier + pierce, or 0 if the lane forbids hero damage. */
  hero: number;
  /** Total power of Lifesteal units; heals the attacker if `hero` > 0. */
  lifesteal: number;
}

/**
 * Order in which a side's units soak damage: Guard first, then by the lane's rule. By default
 * that is by slot (0, 1 front row; 2, 3 back row); a lane may soak the back row first, or the unit
 * with the least Health first (ties by slot). Empty slots are skipped by the caller; gaps never close.
 */
export function soakOrder<T extends { slot: number; guard: boolean; health?: number }>(
  units: T[],
  mode: LaneEffectDef['soak'] = 'front',
): T[] {
  const rank = (a: T, b: T) =>
    mode === 'back'
      ? b.slot - a.slot
      : mode === 'weakest'
        ? (a.health ?? 0) - (b.health ?? 0) || a.slot - b.slot
        : a.slot - b.slot;
  return [...units].sort((a, b) => Number(b.guard) - Number(a.guard) || rank(a, b));
}

function locationsOf(s: GameState, lane: LaneIndex, player: PlayerId): UnitLocation[] {
  const out: UnitLocation[] = [];
  s.lanes[lane].slots[player].forEach((unit, slot) => unit && out.push({ unit, lane, slot }));
  return out;
}

/** Both sides' damage assignments for a lane, indexed by attacker. */
export function assignLaneDamage(s: GameState, lane: LaneIndex): [SideHits, SideHits] {
  const effect = activeLaneEffect(s, lane);
  const sides = ([0, 1] as const).map((player) => {
    const units = locationsOf(s, lane, player);
    let normal = 0;
    let pierce = 0;
    let lifesteal = 0;
    // A duelling lane counts only the highest-Power unit (the lowest slot wins a tie).
    let dealers = units;
    const mult = effect.champion > 0 ? effect.champion : 1;
    if (effect.champion > 0 && units.length > 0) {
      const power = (l: UnitLocation) => unitPower(s, l);
      dealers = [units.reduce((best, l) => (power(l) > power(best) ? l : best))];
    }
    for (const l of dealers) {
      const p = unitPower(s, l) * mult;
      if (hasKeywordHere(s, l, 'pierce')) pierce += p;
      else normal += p;
      if (hasKeywordHere(s, l, 'lifesteal')) lifesteal += p;
    }
    return { units, normal, pierce, lifesteal };
  });
  const hits = ([0, 1] as const).map((attacker): SideHits => {
    const me = sides[attacker]!;
    const targets = soakOrder(
      sides[other(attacker)]!.units.map((loc) => ({
        loc,
        slot: loc.slot,
        guard: hasKeywordHere(s, loc, 'guard'),
        health: unitRemainingHealth(s, loc),
      })),
      effect.soak,
    );
    let left = me.normal;
    const units: UnitHit[] = [];
    for (const { loc } of targets) {
      if (left <= 0) break;
      const take = Math.min(left, unitRemainingHealth(s, loc));
      if (take <= 0) continue;
      units.push({ uid: loc.unit.uid, amount: take, barrier: loc.unit.barrier });
      left -= take;
    }
    const hero = effect.heroDamage ? left * effect.overflowMultiplier + me.pierce : 0;
    return { attacker, units, overflow: left, pierce: me.pierce, hero, lifesteal: me.lifesteal };
  });
  return hits as [SideHits, SideHits];
}

/** Total power per side in a lane (normal + Pierce), for the LaneCombat event. */
export function lanePowers(s: GameState, lane: LaneIndex): [number, number] {
  const total = (p: PlayerId) => locationsOf(s, lane, p).reduce((sum, l) => sum + unitPower(s, l), 0);
  return [total(0), total(1)];
}

export interface UnitForecast {
  /** Damage assigned to the unit (a Barrier absorbs it whole: see `barrier`). */
  damage: number;
  /** The unit would die from the assigned damage. */
  dies: boolean;
  /** A Barrier absorbs the hit, so the unit takes no damage and survives. */
  barrier: boolean;
}

export interface CombatPreview {
  /** Every unit on the board (and the player's planned units, by hand uid) that would be hit. */
  units: Record<number, UnitForecast>;
  /** Hero damage by player taking it, then lane. */
  hero: [[number, number, number], [number, number, number]];
}

/**
 * Forecast of lane combat if `player`'s planned units were on the board at printed stats.
 * Ignores On Reveal effects, spells, shifts and the opponent's plan. Pure: clones the state.
 */
export function previewCombat(state: GameState, player: PlayerId): CombatPreview {
  const s = structuredClone(state);
  const ctx: Ctx = { s, events: [] };
  for (const a of state.players[player].plan) {
    if (a.type !== 'playUnit') continue;
    const card = s.players[player].hand.find((h) => h.uid === a.uid);
    if (!card) continue;
    const slot = canPlaceAt(s, a.lane, player, a.slot) ? a.slot : firstFreeSlot(s, a.lane, player);
    if (slot === null) continue;
    s.lanes[a.lane].slots[player][slot] = createUnit(ctx, card.cardId, player, card.uid);
  }
  const preview: CombatPreview = {
    units: {},
    hero: [
      [0, 0, 0],
      [0, 0, 0],
    ],
  };
  for (const lane of LANES) {
    const hits = assignLaneDamage(s, lane);
    for (const side of hits) {
      preview.hero[other(side.attacker)][lane] = side.hero;
      for (const hit of side.units) {
        const loc = findUnit(s, hit.uid)!;
        const dies = !hit.barrier && hit.amount >= unitRemainingHealth(s, loc);
        preview.units[hit.uid] = { damage: hit.barrier ? 0 : hit.amount, dies, barrier: hit.barrier };
      }
    }
  }
  return preview;
}
