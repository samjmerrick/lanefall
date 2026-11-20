// Normal AI: list affordable sets of plays (pruned to the best 200 by a quick score), simulate each
// against an empty opponent plan, and pick the highest-scoring result.
import weightsJson from '../content/ai-weights.json';
import {
  allUnits,
  getCard,
  lanePower,
  legalActions,
  LANES,
  other,
  resolveRound,
  unitMaxHealth,
  unitPower,
  type Action,
  type GameState,
  type PlannedAction,
  type PlayerId,
} from '../engine';
import type { RngState } from '../engine/rng';
import type { PlanResult } from './easy';

export const CANDIDATE_LIMIT = 200;
/** Pruning score for a planned Shift: below any card's value, above a tie. */
const SHIFT_BONUS = 0.5;

export interface Weights {
  heroHp: number;
  lanePower: number;
  board: number;
  hand: number;
  win: number;
}

export const WEIGHTS: Weights = weightsJson;

/** A shallow copy of `s` where `player`'s plan is replaced. Cheap; never mutate the result. */
function withPlan(s: GameState, player: PlayerId, plan: PlannedAction[]): GameState {
  const players = [...s.players] as GameState['players'];
  players[player] = { ...players[player], plan };
  return { ...s, players };
}

/**
 * Removes what the planner must not see: the opponent's planned (face-down) cards.
 * The opponent's hand is left in place because nothing the planner does reads it.
 */
/** Boss overrides for planning (see `ai` in enemies.json). */
export interface AiHooks {
  seesPlan?: boolean;
}

export function hideOpponent(s: GameState, player: PlayerId): GameState {
  const opp = other(player);
  const players = [...s.players] as GameState['players'];
  players[opp] = { ...players[opp], plan: [], ready: false };
  players[player] = { ...players[player], plan: [], ready: false };
  return { ...s, players };
}

function planKey(plan: PlannedAction[]): string {
  return plan
    .map((a) =>
      a.type === 'playSpell'
        ? `s${a.uid}:${a.target.kind === 'unit' ? `u${a.target.uid}` : a.target.kind === 'lane' ? `l${a.target.lane}` : 'n'}`
        : `${a.type[0]}${a.uid}:${a.lane}`,
    )
    .sort()
    .join('|');
}

function quickScore(s: GameState, player: PlayerId, plan: PlannedAction[]): number {
  let score = 0;
  const hand = s.players[player].hand;
  for (const a of plan) {
    if (a.type === 'shift') {
      // A Shift costs nothing, so it would tie with the plan it extends and always lose the pruning
      // below to plans that spend more. A small bonus keeps shifted variants among the candidates;
      // the simulation decides whether the move is any good.
      score += SHIFT_BONUS;
      continue;
    }
    const card = getCard(hand.find((h) => h.uid === a.uid)!.cardId);
    score += card.type === 'unit' ? (card.power ?? 0) + (card.health ?? 0) : card.cost * 2.5;
  }
  return score;
}

/** One action per (card, lane). Slots matter for damage order, but `arrangeSlots` fixes them once a plan is chosen. */
function distinctPlays(s: GameState, player: PlayerId): PlannedAction[] {
  const seen = new Set<string>();
  const out: PlannedAction[] = [];
  for (const a of legalActions(s, player)) {
    if (a.type !== 'plan') continue;
    const key = planKey([a.action]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a.action);
  }
  return out;
}

export function enumeratePlans(
  base: GameState,
  player: PlayerId,
  limit = CANDIDATE_LIMIT,
): PlannedAction[][] {
  const all: { plan: PlannedAction[]; score: number }[] = [{ plan: [], score: 0 }];
  const seen = new Set<string>(['']);
  let frontier: PlannedAction[][] = [[]];
  while (frontier.length > 0) {
    const next: { plan: PlannedAction[]; score: number }[] = [];
    for (const plan of frontier) {
      const s = withPlan(base, player, plan);
      for (const a of distinctPlays(s, player)) {
        const p = [...plan, a];
        const key = planKey(p);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ plan: p, score: quickScore(base, player, p) });
      }
    }
    next.sort((a, b) => b.score - a.score);
    const kept = next.slice(0, limit);
    all.push(...kept);
    frontier = kept.map((n) => n.plan);
  }
  all.sort((a, b) => b.score - a.score);
  return all.slice(0, limit).map((n) => n.plan);
}

export function evaluate(s: GameState, me: PlayerId, w: Weights = WEIGHTS): number {
  const opp = other(me);
  if (s.result) return s.result.winner === null ? 0 : s.result.winner === me ? w.win : -w.win;
  let score = w.heroHp * (s.players[me].hp - s.players[opp].hp);
  for (const lane of LANES) score += w.lanePower * (lanePower(s, lane, me) - lanePower(s, lane, opp));
  for (const loc of allUnits(s)) {
    const value = unitPower(s, loc) + unitMaxHealth(s, loc) - loc.unit.damage;
    score += w.board * (loc.unit.owner === me ? value : -value);
  }
  score += w.hand * s.players[me].hand.length;
  return score;
}

/** Plays `plan` against an empty opponent plan and returns the state after the round. */
export function simulate(
  base: GameState,
  player: PlayerId,
  plan: PlannedAction[],
  oppPlan: PlannedAction[] = [],
) {
  let s = withPlan(base, player, plan);
  s = withPlan(s, other(player), oppPlan);
  const players = [...s.players] as GameState['players'];
  players[0] = { ...players[0], ready: true };
  players[1] = { ...players[1], ready: true };
  return resolveRound({ ...s, players }).state;
}

export function mulliganChoice(s: GameState, player: PlayerId): Action {
  const uids = s.players[player].hand.filter((h) => getCard(h.cardId).cost >= 5).map((h) => h.uid);
  return { type: 'mulligan', player, uids };
}

/** Sort key for placing units front-first: Guard, then Barrier, then more Health, then less Power. */
function toughness(cardId: string): [number, number, number, number] {
  const c = getCard(cardId);
  return [
    c.keywords.includes('guard') ? 0 : 1,
    c.keywords.includes('barrier') ? 0 : 1,
    -(c.health ?? 0),
    c.power ?? 0,
  ];
}

/**
 * Re-slots the plan's new units within each lane. Damage is dealt front row first, so the
 * toughest units take the lowest free slots. Slots held by units on the board or by planned
 * shifts stay as they are. Action order (hence reveal order) is unchanged.
 */
export function arrangeSlots(s: GameState, player: PlayerId, plan: PlannedAction[]): PlannedAction[] {
  const out = [...plan];
  for (const lane of LANES) {
    const idx: number[] = [];
    const taken = new Set<number>();
    s.lanes[lane].slots[player].forEach((u, slot) => u && taken.add(slot));
    out.forEach((a, i) => {
      if (a.type === 'playUnit' && a.lane === lane) idx.push(i);
      else if (a.type === 'shift' && a.lane === lane) taken.add(a.slot);
    });
    if (idx.length < 2) continue;
    const free = [...idx.map((i) => (out[i] as Extract<PlannedAction, { type: 'playUnit' }>).slot)];
    for (let slot = 0; slot < 4 && free.length < idx.length; slot++) {
      if (!taken.has(slot) && !free.includes(slot)) free.push(slot);
    }
    free.sort((a, b) => a - b);
    const hand = s.players[player].hand;
    const key = (i: number) => toughness(hand.find((h) => h.uid === out[i]!.uid)!.cardId);
    const order = [...idx].sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      for (let k = 0; k < ka.length; k++) if (ka[k] !== kb[k]) return ka[k]! - kb[k]!;
      return 0;
    });
    order.forEach((i, n) => {
      out[i] = { ...(out[i] as Extract<PlannedAction, { type: 'playUnit' }>), slot: free[n]! };
    });
  }
  return out;
}

export function toActions(player: PlayerId, plan: PlannedAction[]): Action[] {
  return [...plan.map((action): Action => ({ type: 'plan', player, action })), { type: 'endTurn', player }];
}

export function planNormal(
  state: GameState,
  player: PlayerId,
  rng: RngState,
  hooks: AiHooks = {},
): PlanResult {
  if (state.phase === 'mulligan') return { actions: [mulliganChoice(state, player)], rng };
  const base = hideOpponent(state, player);
  // Boss hook: plan against the opponent's real planned cards instead of an empty plan.
  const oppPlan = hooks.seesPlan ? state.players[other(player)].plan : [];
  let best: PlannedAction[] = [];
  let bestScore = -Infinity;
  for (const plan of enumeratePlans(base, player)) {
    const score = evaluate(simulate(base, player, plan, oppPlan), player);
    if (score > bestScore) {
      bestScore = score;
      best = plan;
    }
  }
  return { actions: toActions(player, arrangeSlots(base, player, best)), rng };
}
