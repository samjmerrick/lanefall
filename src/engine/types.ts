import type { Keyword, MatchModifier } from './schema';

export type PlayerId = 0 | 1;
export type LaneIndex = 0 | 1 | 2;

export const LANES: readonly LaneIndex[] = [0, 1, 2];
export const SLOTS_PER_SIDE = 4;
export const MAX_ROUNDS = 8;
export const MAX_MANA = 8;
export const RESERVE_CAP = 2;
export const HAND_LIMIT = 8;
export const STARTING_HAND = 4;
export const DEFAULT_HERO_HP = 20;

export interface Unit {
  uid: number;
  cardId: string;
  owner: PlayerId;
  /** Printed stats plus permanent buffs. */
  basePower: number;
  baseHealth: number;
  /** Buffs that expire at End of Round. */
  roundPower: number;
  roundHealth: number;
  damage: number;
  keywords: Keyword[];
  barrier: boolean;
  shiftUsed: boolean;
  /** Set by destroy effects and Ephemeral; the unit dies at the next death check. */
  doomed: boolean;
  /** Global play order, used for damage assignment and trigger order. */
  playOrder: number;
}

export interface HandCard {
  uid: number;
  cardId: string;
}

export type SpellTarget =
  { kind: 'none' } | { kind: 'unit'; uid: number } | { kind: 'lane'; lane: LaneIndex };

export type PlannedAction =
  | { type: 'playUnit'; uid: number; lane: LaneIndex; slot: number }
  | { type: 'playSpell'; uid: number; target: SpellTarget }
  | { type: 'shift'; uid: number; lane: LaneIndex; slot: number };

export interface PlayerState {
  hp: number;
  maxHp: number;
  mana: number;
  reserve: number;
  /** Extra mana added at the start of next round (gainMana effects). */
  bonusMana: number;
  /** Top of deck is the last element. */
  deck: string[];
  hand: HandCard[];
  discard: string[];
  plan: PlannedAction[];
  ready: boolean;
  mulliganed: boolean;
}

export interface LaneState {
  effectId: string;
  revealed: boolean;
  /** slots[player][slot] */
  slots: [(Unit | null)[], (Unit | null)[]];
}

export interface MatchResult {
  winner: PlayerId | null;
  reason: 'hp' | 'rounds';
}

export interface GameState {
  version: 1;
  round: number;
  phase: 'mulligan' | 'plan' | 'over';
  rng: number;
  initiative: PlayerId;
  players: [PlayerState, PlayerState];
  lanes: [LaneState, LaneState, LaneState];
  nextUid: number;
  nextPlayOrder: number;
  result: MatchResult | null;
  /** Per-player match modifiers (hero passive, relics, boss rule). */
  modifiers: [MatchModifier[], MatchModifier[]];
}

export interface MatchConfig {
  decks: [string[], string[]];
  heroHp?: number;
  /** Force specific lane effects (Left, Centre, Right); otherwise drawn by seed. */
  laneEffects?: [string, string, string];
  /** Per-player match modifiers (hero passive, relics, boss rule). */
  modifiers?: [MatchModifier[], MatchModifier[]];
}

export type Action =
  | { type: 'mulligan'; player: PlayerId; uids: number[] }
  | { type: 'plan'; player: PlayerId; action: PlannedAction }
  | { type: 'unplan'; player: PlayerId; index: number }
  | { type: 'endTurn'; player: PlayerId };

export type GameEvent =
  | { type: 'RoundStarted'; round: number; initiative: PlayerId }
  | { type: 'ManaRefilled'; player: PlayerId; mana: number; reserve: number }
  | { type: 'CardDrawn'; player: PlayerId; uid: number; cardId: string }
  | { type: 'CardBurned'; player: PlayerId; cardId: string }
  | { type: 'LaneRevealed'; lane: LaneIndex; effectId: string }
  | { type: 'CardRevealed'; player: PlayerId; uid: number; cardId: string }
  | { type: 'UnitPlaced'; player: PlayerId; uid: number; cardId: string; lane: LaneIndex; slot: number }
  | { type: 'UnitSummoned'; player: PlayerId; uid: number; cardId: string; lane: LaneIndex; slot: number }
  | { type: 'UnitMoved'; uid: number; from: LaneIndex; to: LaneIndex; slot: number }
  | { type: 'CardFizzled'; player: PlayerId; uid: number; cardId: string; reason: string }
  | { type: 'UnitBuffed'; uid: number; power: number; health: number; duration: 'permanent' | 'round' }
  | { type: 'KeywordGranted'; uid: number; keyword: Keyword }
  | { type: 'DamageDealt'; uid: number; amount: number }
  | { type: 'BarrierBroken'; uid: number }
  | { type: 'UnitHealed'; uid: number; amount: number }
  | { type: 'UnitDied'; uid: number; cardId: string; owner: PlayerId; lane: LaneIndex }
  | { type: 'LaneCombat'; lane: LaneIndex; power: [number, number] }
  | { type: 'HeroDamaged'; player: PlayerId; amount: number; lane: LaneIndex | null }
  | { type: 'HeroHealed'; player: PlayerId; amount: number }
  | { type: 'ManaGained'; player: PlayerId; amount: number }
  | { type: 'RoundEnded'; round: number }
  | { type: 'MatchEnded'; winner: PlayerId | null; reason: 'hp' | 'rounds' };

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalActionError';
  }
}

export function other(p: PlayerId): PlayerId {
  return p === 0 ? 1 : 0;
}
