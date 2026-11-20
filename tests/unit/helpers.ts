import {
  applyAction,
  initMatch,
  resolveRound,
  type GameState,
  type Keyword,
  type LaneIndex,
  type PlannedAction,
  type PlayerId,
  type Unit,
} from '../../src/engine';
import { getCard } from '../../src/engine/content';

export const FILLER = 'bastion-recruit';

/** A match past the mulligan, in round 1 planning, all lanes plain unless given. */
export function setup(
  opts: { lanes?: [string, string, string]; seed?: number; deck?: string[]; heroHp?: number } = {},
): GameState {
  const deck = opts.deck ?? Array.from({ length: 30 }, () => FILLER);
  let s = initMatch(
    {
      decks: [deck, deck],
      laneEffects: opts.lanes ?? ['lane-plain', 'lane-plain', 'lane-plain'],
      heroHp: opts.heroHp,
    },
    opts.seed ?? 1,
  );
  s = applyAction(s, { type: 'mulligan', player: 0, uids: [] });
  s = applyAction(s, { type: 'mulligan', player: 1, uids: [] });
  return s;
}

let uidCounter = 10_000;

/** Puts a unit straight onto the board (test setup only; mutates s). */
export function place(
  s: GameState,
  player: PlayerId,
  lane: LaneIndex,
  cardId: string,
  opts: { slot?: number; keywords?: Keyword[]; damage?: number } = {},
): Unit {
  const card = getCard(cardId);
  const slot = opts.slot ?? s.lanes[lane].slots[player].findIndex((u) => u === null);
  const keywords = [...card.keywords, ...(opts.keywords ?? [])];
  const unit: Unit = {
    uid: uidCounter++,
    cardId,
    owner: player,
    basePower: card.power ?? 0,
    baseHealth: card.health ?? 1,
    roundPower: 0,
    roundHealth: 0,
    damage: opts.damage ?? 0,
    keywords,
    barrier: keywords.includes('barrier'),
    shiftUsed: false,
    doomed: false,
    playOrder: s.nextPlayOrder++,
  };
  s.lanes[lane].slots[player][slot] = unit;
  return unit;
}

/** Adds a card to a player's hand (mutates s) and returns its uid. */
export function give(s: GameState, player: PlayerId, cardId: string): number {
  const uid = s.nextUid++;
  s.players[player].hand.push({ uid, cardId });
  return uid;
}

export function clearHands(s: GameState): void {
  for (const p of s.players) p.hand = [];
}

export function plan(s: GameState, player: PlayerId, ...actions: PlannedAction[]): GameState {
  for (const action of actions) s = applyAction(s, { type: 'plan', player, action });
  return s;
}

/** Ends both turns and resolves the round. */
export function resolve(s: GameState) {
  s = applyAction(s, { type: 'endTurn', player: 0 });
  s = applyAction(s, { type: 'endTurn', player: 1 });
  return resolveRound(s);
}

export function unitAt(s: GameState, player: PlayerId, lane: LaneIndex, slot = 0): Unit | null {
  return s.lanes[lane].slots[player][slot] ?? null;
}

export function byUid(s: GameState, uid: number): Unit | undefined {
  for (const lane of s.lanes)
    for (const side of lane.slots) for (const u of side) if (u?.uid === uid) return u;
  return undefined;
}
