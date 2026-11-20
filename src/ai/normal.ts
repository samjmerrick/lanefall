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
    if (a.type === 'shift') continue;
    const card = getCard(hand.find((h) => h.uid === a.uid)!.cardId);
    score += card.type === 'unit' ? (card.power ?? 0) + (card.health ?? 0) : card.cost * 2.5;
  }
  return score;
}

/** One action per (card, lane): the slot inside a lane does not change the outcome. */
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
  return { actions: toActions(player, best), rng };
}
