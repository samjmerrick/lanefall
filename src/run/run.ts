// Roguelike run state. A run is its config (seed, hero, card pool) plus the list of choices made;
// `replayRun` rebuilds the state from those, so saves stay small and every bug is reproducible.
import { getCard, type MatchConfig } from '../engine';
import { nextInt, seedRng, shuffle, type RngState } from '../engine/rng';
import type { AiHooks, Difficulty } from '../ai';
import { ENEMIES, RELICS, getEnemy, getHero, getRelic } from './content';
import type { RunChoice, RunConfig } from './schema';
import { MAP_ROWS, generateMap, type MapNode, type RunMap } from './map';

export const START_HEARTS = 3;
export const START_GOLD = 30;
export const CARD_CHOICES = 3;
export const NODE_XP = 10;
export const BOSS_XP = 100;
export const REMOVE_PRICE = 40;
export const RELIC_PRICE = 75;
export const CARD_PRICES = { common: 25, uncommon: 40, rare: 60, legendary: 80 } as const;
export const SHOP_CARDS = 4;
export const SHOP_RELICS = 2;
/** Gold for an empty treasure chest (every relic already owned). */
export const TREASURE_GOLD = 50;

export type { RunConfig, RunChoice };

export interface ShopItem {
  kind: 'card' | 'relic';
  id: string;
  price: number;
  sold: boolean;
}

export type RunPhase =
  | { kind: 'map' }
  | { kind: 'match'; enemyId: string; seed: number }
  | { kind: 'reward'; cards: string[]; gold: number }
  | { kind: 'shop'; stock: ShopItem[]; removed: boolean }
  | { kind: 'rest' }
  | { kind: 'treasure'; relicId: string | null; gold: number }
  | { kind: 'over'; won: boolean; abandoned: boolean };

export interface RunState {
  config: RunConfig;
  rng: RngState;
  act: number;
  map: RunMap;
  /** -1 before the first step; MAP_ROWS is the boss row. */
  row: number;
  col: number;
  hearts: number;
  gold: number;
  deck: string[];
  relics: string[];
  phase: RunPhase;
  nodesCleared: number;
  bossesBeaten: number;
  /** Number of choices applied so far. */
  step: number;
}

export class IllegalChoiceError extends Error {}

function fail(msg: string): never {
  throw new IllegalChoiceError(msg);
}

export function startRun(config: RunConfig): RunState {
  const hero = getHero(config.heroId);
  const [map, rng] = generateMap(seedRng(config.seed));
  return {
    config,
    rng,
    act: 1,
    map,
    row: -1,
    col: 0,
    hearts: START_HEARTS,
    gold: START_GOLD,
    deck: [...hero.starterDeck],
    relics: [],
    phase: { kind: 'map' },
    nodesCleared: 0,
    bossesBeaten: 0,
    step: 0,
  };
}

export function currentNode(r: RunState): MapNode | null {
  return r.row < 0 ? null : (r.map.rows[r.row]?.[r.col] ?? null);
}

/** Columns of the next row the player may move to. */
export function nextCols(r: RunState): number[] {
  if (r.row >= MAP_ROWS) return [];
  if (r.row < 0) return r.map.rows[0]!.map((n) => n.col);
  return currentNode(r)!.next;
}

function runBonus(r: RunState, key: 'fightGold' | 'shopDiscount' | 'cardChoices'): number {
  return r.relics.reduce((n, id) => n + (getRelic(id).run[key] ?? 0), 0);
}

/** Cards that can appear in rewards and shops: owned cards of the hero's faction. */
export function cardPool(r: RunState): string[] {
  const faction = getHero(r.config.heroId).faction;
  return r.config.pool.filter((id) => {
    const c = getCard(id);
    return !c.token && c.faction === faction;
  });
}

function draw<T>(r: RunState, list: readonly T[], n: number): T[] {
  const [shuffled, rng] = shuffle(r.rng, list);
  r.rng = rng;
  return shuffled.slice(0, n);
}

function roll(r: RunState, min: number, max: number): number {
  const [v, rng] = nextInt(r.rng, min, max);
  r.rng = rng;
  return v;
}

function price(r: RunState, base: number): number {
  return Math.round((base * (100 - Math.min(90, runBonus(r, 'shopDiscount')))) / 100);
}

function unownedRelics(r: RunState): string[] {
  return RELICS.map((x) => x.id).filter((id) => !r.relics.includes(id));
}

function enterNode(r: RunState): void {
  const node = currentNode(r)!;
  switch (node.type) {
    case 'fight':
    case 'boss': {
      const pool = ENEMIES.filter((e) => e.act === r.act && e.kind === node.type);
      const enemy = draw(r, pool, 1)[0]!;
      r.phase = { kind: 'match', enemyId: enemy.id, seed: roll(r, 1, 0x7fffffff) };
      return;
    }
    case 'rest':
      r.nodesCleared++;
      r.phase = { kind: 'rest' };
      return;
    case 'shop': {
      r.nodesCleared++;
      const cards = draw(r, cardPool(r), SHOP_CARDS).map((id): ShopItem => ({
        kind: 'card',
        id,
        price: price(r, CARD_PRICES[getCard(id).rarity]),
        sold: false,
      }));
      const relics = draw(r, unownedRelics(r), SHOP_RELICS).map((id): ShopItem => ({
        kind: 'relic',
        id,
        price: price(r, RELIC_PRICE),
        sold: false,
      }));
      r.phase = { kind: 'shop', stock: [...cards, ...relics], removed: false };
      return;
    }
    case 'treasure': {
      r.nodesCleared++;
      const relicId = draw(r, unownedRelics(r), 1)[0] ?? null;
      if (relicId) r.relics.push(relicId);
      else r.gold += TREASURE_GOLD;
      r.phase = { kind: 'treasure', relicId, gold: relicId ? 0 : TREASURE_GOLD };
      return;
    }
  }
}

function matchEnded(r: RunState, won: boolean): void {
  const node = currentNode(r)!;
  if (!won) {
    r.hearts--;
    if (r.hearts <= 0) r.phase = { kind: 'over', won: false, abandoned: false };
    else if (node.type === 'boss')
      enterNode(r); // a rematch against the boss
    else r.phase = { kind: 'map' };
    return;
  }
  r.nodesCleared++;
  if (node.type === 'boss') {
    r.bossesBeaten++;
    r.phase = { kind: 'over', won: true, abandoned: false };
    return;
  }
  const cards = draw(r, cardPool(r), CARD_CHOICES + runBonus(r, 'cardChoices'));
  const gold = roll(r, 15, 25) + runBonus(r, 'fightGold');
  r.gold += gold;
  r.phase = { kind: 'reward', cards, gold };
}

/** Applies one choice. Pure: returns a new state, or throws IllegalChoiceError. */
export function applyChoice(state: RunState, choice: RunChoice): RunState {
  const r = structuredClone(state);
  const phase = r.phase;
  if (phase.kind === 'over') fail('The run is over');
  if (choice.t === 'abandon') {
    if (phase.kind === 'match') fail('Leave the match before abandoning');
    r.phase = { kind: 'over', won: false, abandoned: true };
  } else if (phase.kind === 'map') {
    if (choice.t !== 'move') fail(`Cannot ${choice.t} on the map`);
    if (!nextCols(r).includes(choice.col)) fail(`Cannot move to column ${choice.col}`);
    r.row++;
    r.col = choice.col;
    enterNode(r);
  } else if (phase.kind === 'match') {
    if (choice.t !== 'matchEnd') fail('Finish the match first');
    matchEnded(r, choice.won);
  } else if (phase.kind === 'reward') {
    if (choice.t !== 'pick') fail('Pick a card or skip');
    if (choice.index !== null) {
      const card = phase.cards[choice.index] ?? fail('No such card');
      r.deck.push(card);
    }
    r.phase = { kind: 'map' };
  } else if (phase.kind === 'shop') {
    if (choice.t === 'leave') r.phase = { kind: 'map' };
    else if (choice.t === 'buy') {
      const item = phase.stock[choice.index] ?? fail('No such item');
      if (item.sold) fail('Already sold');
      if (item.price > r.gold) fail('Not enough gold');
      r.gold -= item.price;
      item.sold = true;
      if (item.kind === 'card') r.deck.push(item.id);
      else r.relics.push(item.id);
    } else if (choice.t === 'removeCard') {
      if (phase.removed) fail('Only one card can be removed per shop');
      if (REMOVE_PRICE > r.gold) fail('Not enough gold');
      if (r.deck.length <= 1) fail('Your deck needs at least one card');
      if (!r.deck[choice.index]) fail('No such card');
      r.deck.splice(choice.index, 1);
      r.gold -= REMOVE_PRICE;
      phase.removed = true;
    } else fail(`Cannot ${choice.t} in a shop`);
  } else if (phase.kind === 'rest') {
    if (choice.t === 'rest') {
      if (r.hearts >= START_HEARTS) fail('Hearts are already full');
      r.hearts++;
    } else if (choice.t !== 'leave') fail(`Cannot ${choice.t} at a rest`);
    r.phase = { kind: 'map' };
  } else if (phase.kind === 'treasure') {
    if (choice.t !== 'leave') fail('Take the treasure and leave');
    r.phase = { kind: 'map' };
  }
  r.step++;
  return r;
}

export function replayRun(config: RunConfig, choices: readonly RunChoice[]): RunState {
  return choices.reduce(applyChoice, startRun(config));
}

/** XP earned so far: 10 per node cleared, 100 per boss, doubled for a full win. */
export function runXp(r: RunState): number {
  const xp = r.nodesCleared * NODE_XP + r.bossesBeaten * BOSS_XP;
  return r.phase.kind === 'over' && r.phase.won ? xp * 2 : xp;
}

export interface RunMatch {
  config: MatchConfig;
  seed: number;
  difficulty: Difficulty;
  hooks: AiHooks;
  enemyId: string;
}

/** The match for the current node: your run deck, hero passive and relics against the enemy. */
export function runMatch(r: RunState): RunMatch {
  if (r.phase.kind !== 'match') fail('No match in progress');
  const enemy = getEnemy(r.phase.enemyId);
  const hero = getHero(r.config.heroId);
  return {
    config: {
      decks: [r.deck, enemy.deck],
      modifiers: [[...hero.modifiers, ...r.relics.flatMap((id) => getRelic(id).modifiers)], enemy.modifiers],
    },
    seed: r.phase.seed,
    difficulty: enemy.difficulty,
    hooks: enemy.ai,
    enemyId: enemy.id,
  };
}

/** The AI's random stream for a match, separate from the match RNG. */
export function matchAiRng(seed: number): RngState {
  return seedRng((seed ^ 0x5bd1e995) >>> 0);
}
