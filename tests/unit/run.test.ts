import { describe, expect, it } from 'vitest';
import { getCard, starterCollection } from '../../src/engine';
import { seedRng } from '../../src/engine/rng';
import {
  BOSS_XP,
  ENEMIES,
  HEROES,
  IllegalChoiceError,
  MAP_ROWS,
  NODE_XP,
  RELICS,
  REMOVE_PRICE,
  START_HEARTS,
  applyChoice,
  cardPool,
  currentNode,
  generateMap,
  getEnemy,
  getHero,
  getRelic,
  mapProblems,
  nextCols,
  replayRun,
  runMatch,
  runXp,
  startRun,
  starterHeroes,
  type NodeType,
  type RunState,
} from '../../src/run';

const pool = [...starterCollection()];
const config = (seed = 1, heroId = 'hero-pyra') => ({ seed, heroId, pool });

/** A run standing on a node of the given type in row 1 (test setup only). */
function at(type: NodeType, extra: Partial<RunState> = {}): RunState {
  const r = { ...startRun(config()), ...extra };
  r.map = structuredClone(r.map);
  r.row = 0;
  r.col = 0;
  r.map.rows[1]![0]!.type = type;
  for (const n of r.map.rows[0]!) n.next = [0];
  return applyChoice(r, { t: 'move', col: 0 });
}

const illegal = (r: RunState, c: Parameters<typeof applyChoice>[1]) =>
  expect(() => applyChoice(r, c)).toThrow(IllegalChoiceError);

describe('content', () => {
  it('has 3 starter heroes with a 12-card starter deck of their faction, 10 relics and an act 1 boss', () => {
    expect(starterHeroes()).toHaveLength(3);
    for (const h of HEROES) for (const id of h.starterDeck) expect(getCard(id).faction).toBe(h.faction);
    expect(RELICS).toHaveLength(10);
    expect(ENEMIES.filter((e) => e.act === 1 && e.kind === 'boss')).toHaveLength(1);
    expect(ENEMIES.filter((e) => e.act === 1 && e.kind === 'fight').length).toBeGreaterThanOrEqual(3);
    expect(() => getHero('hero-nobody')).toThrow(/Unknown hero/);
    expect(() => getRelic('relic-nope')).toThrow(/Unknown relic/);
    expect(() => getEnemy('enemy-nope')).toThrow(/Unknown enemy/);
  });
});

describe('map generation', () => {
  it('across 1,000 seeds every map is connected and every path reaches the boss', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const [map] = generateMap(seedRng(seed));
      expect(mapProblems(map), `seed ${seed}`).toEqual([]);
      // Walk every path from row 0: each must end at the boss.
      const ends = new Set<string>();
      const walk = (row: number, col: number): void => {
        const node = map.rows[row]![col]!;
        if (node.type === 'boss') return void ends.add(`${row}`);
        expect(node.next.length).toBeGreaterThan(0);
        for (const c of node.next) walk(row + 1, c);
      };
      for (const n of map.rows[0]!) walk(0, n.col);
      expect([...ends]).toEqual([String(MAP_ROWS)]);
    }
  });

  it('first row is fights, the row before the boss is rests, and paths never cross', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const [map] = generateMap(seedRng(seed));
      expect(map.rows[0]!.every((n) => n.type === 'fight')).toBe(true);
      expect(map.rows[MAP_ROWS - 1]!.every((n) => n.type === 'rest')).toBe(true);
      for (const row of map.rows.slice(0, MAP_ROWS)) {
        for (let i = 1; i < row.length; i++) {
          expect(Math.min(...row[i]!.next)).toBeGreaterThanOrEqual(Math.max(...row[i - 1]!.next));
        }
        // Paths only lead to neighbouring columns (drawn positions at most 0.3 of the width apart).
        const next = map.rows[row[0]!.row + 1]!;
        for (const n of row)
          for (const c of n.next)
            expect(
              Math.abs((n.col + 1) / (row.length + 1) - (c + 1) / (next.length + 1)),
            ).toBeLessThanOrEqual(0.3);
      }
    }
  });

  it('is the same for the same seed', () => {
    expect(generateMap(seedRng(42))[0]).toEqual(generateMap(seedRng(42))[0]);
    expect(generateMap(seedRng(42))[0]).not.toEqual(generateMap(seedRng(43))[0]);
  });

  it('mapProblems reports broken maps', () => {
    const [map] = generateMap(seedRng(5));
    map.rows[2]![0]!.next = [];
    map.rows[3]![0]!.next.push(9);
    map.rows[MAP_ROWS]![0]!.type = 'fight';
    const problems = mapProblems(map);
    expect(problems).toContain('2:0 is a dead end');
    expect(problems.some((p) => p.includes('links to missing'))).toBe(true);
    expect(problems).toContain('last row is not the boss');
    expect(mapProblems({ rows: map.rows.slice(0, 3) })).toContain(`expected ${MAP_ROWS + 1} rows`);
  });
});

describe('run flow', () => {
  it('starts on the map with 3 Hearts, starting gold and the hero starter deck', () => {
    const r = startRun(config());
    expect(r.phase).toEqual({ kind: 'map' });
    expect(r.hearts).toBe(START_HEARTS);
    expect(r.deck).toEqual(getHero('hero-pyra').starterDeck);
    expect(currentNode(r)).toBeNull();
    expect(nextCols(r)).toEqual(r.map.rows[0]!.map((n) => n.col));
  });

  it('only allows moves along the paths', () => {
    let r = startRun(config());
    illegal(r, { t: 'move', col: 7 });
    illegal(r, { t: 'pick', index: 0 });
    r = applyChoice(r, { t: 'move', col: 0 });
    expect(r.phase.kind).toBe('match');
    illegal(r, { t: 'move', col: 0 });
    illegal(r, { t: 'abandon' });
  });

  it('winning a fight offers 3 cards of the hero faction and gold; picking adds one to the deck', () => {
    let r = applyChoice(startRun(config()), { t: 'move', col: 0 });
    const gold = r.gold;
    r = applyChoice(r, { t: 'matchEnd', won: true });
    if (r.phase.kind !== 'reward') throw new Error('expected a reward');
    expect(r.phase.cards).toHaveLength(3);
    expect(new Set(r.phase.cards).size).toBe(3);
    for (const id of r.phase.cards) expect(getCard(id).faction).toBe('ember');
    expect(r.gold - gold).toBe(r.phase.gold);
    expect(r.phase.gold).toBeGreaterThanOrEqual(15);
    const card = r.phase.cards[1]!;
    illegal(r, { t: 'pick', index: 5 });
    r = applyChoice(r, { t: 'pick', index: 1 });
    expect(r.deck).toHaveLength(13);
    expect(r.deck.at(-1)).toBe(card);
    expect(r.phase).toEqual({ kind: 'map' });
    expect(r.nodesCleared).toBe(1);
  });

  it('skipping a reward keeps the deck', () => {
    let r = applyChoice(startRun(config()), { t: 'move', col: 0 });
    r = applyChoice(applyChoice(r, { t: 'matchEnd', won: true }), { t: 'pick', index: null });
    expect(r.deck).toHaveLength(12);
  });

  it('losing costs a Heart and gives no reward; the run ends at 0 Hearts', () => {
    let r = applyChoice(startRun(config()), { t: 'move', col: 0 });
    r = applyChoice(r, { t: 'matchEnd', won: false });
    expect(r.hearts).toBe(2);
    expect(r.phase).toEqual({ kind: 'map' });
    expect(r.nodesCleared).toBe(0);
    r = at('fight', { hearts: 1 });
    r = applyChoice(r, { t: 'matchEnd', won: false });
    expect(r.phase).toEqual({ kind: 'over', won: false, abandoned: false });
    illegal(r, { t: 'leave' });
  });

  it('the boss: a loss with Hearts left is a rematch, a win ends the run with doubled XP', () => {
    let r = startRun(config());
    r.row = MAP_ROWS - 1;
    r.col = 0;
    r = applyChoice(r, { t: 'move', col: 0 });
    expect(currentNode(r)!.type).toBe('boss');
    if (r.phase.kind !== 'match') throw new Error('expected a match');
    expect(getEnemy(r.phase.enemyId).kind).toBe('boss');
    const first = r.phase.seed;
    r = applyChoice(r, { t: 'matchEnd', won: false });
    expect(r.phase.kind).toBe('match');
    expect(r.phase.kind === 'match' && r.phase.seed).not.toBe(first);
    expect(runMatch(r).hooks.seesPlan).toBe(true);
    r = applyChoice(r, { t: 'matchEnd', won: true });
    expect(r.phase).toEqual({ kind: 'over', won: true, abandoned: false });
    expect(nextCols(r)).toEqual([]);
    expect(runXp(r)).toBe((NODE_XP + BOSS_XP) * 2);
  });

  it('rest restores a Heart (not past full) or can be left', () => {
    let r = at('rest', { hearts: 2 });
    expect(r.phase).toEqual({ kind: 'rest' });
    illegal(r, { t: 'buy', index: 0 });
    r = applyChoice(r, { t: 'rest' });
    expect(r.hearts).toBe(3);
    r = at('rest');
    illegal(r, { t: 'rest' });
    expect(applyChoice(r, { t: 'leave' }).phase).toEqual({ kind: 'map' });
  });

  it('treasure gives a free relic, or gold once every relic is owned', () => {
    let r = at('treasure');
    if (r.phase.kind !== 'treasure') throw new Error('expected treasure');
    expect(r.relics).toEqual([r.phase.relicId]);
    illegal(r, { t: 'rest' });
    expect(applyChoice(r, { t: 'leave' }).phase).toEqual({ kind: 'map' });
    r = at('treasure', { relics: RELICS.map((x) => x.id) });
    expect(r.phase).toEqual({ kind: 'treasure', relicId: null, gold: 50 });
  });

  it('shop sells cards and relics for gold, and removes one card per visit', () => {
    let r = at('shop', { gold: 500 });
    if (r.phase.kind !== 'shop') throw new Error('expected a shop');
    expect(r.phase.stock.filter((i) => i.kind === 'card')).toHaveLength(4);
    expect(r.phase.stock.filter((i) => i.kind === 'relic')).toHaveLength(2);
    const card = r.phase.stock[0]!;
    r = applyChoice(r, { t: 'buy', index: 0 });
    expect(r.gold).toBe(500 - card.price);
    expect(r.deck.at(-1)).toBe(card.id);
    illegal(r, { t: 'buy', index: 0 });
    illegal(r, { t: 'buy', index: 99 });
    r = applyChoice(r, { t: 'buy', index: 4 });
    expect(r.relics).toHaveLength(1);
    const size = r.deck.length;
    r = applyChoice(r, { t: 'removeCard', index: 0 });
    expect(r.deck).toHaveLength(size - 1);
    illegal(r, { t: 'removeCard', index: 0 });
    illegal(r, { t: 'rest' });
    expect(applyChoice(r, { t: 'leave' }).phase).toEqual({ kind: 'map' });
  });

  it('shop refuses what you cannot afford', () => {
    const r = at('shop', { gold: 0 });
    illegal(r, { t: 'buy', index: 0 });
    illegal(r, { t: 'removeCard', index: 0 });
    const rich = at('shop', { gold: REMOVE_PRICE, deck: ['ember-spark-imp'] });
    illegal(rich, { t: 'removeCard', index: 0 });
    illegal(at('shop', { gold: REMOVE_PRICE }), { t: 'removeCard', index: 99 });
  });

  it('relics change the run: discount, extra gold, extra card choice', () => {
    const shop = at('shop', { relics: ['relic-silver-tongue'] });
    const full = at('shop');
    if (shop.phase.kind !== 'shop' || full.phase.kind !== 'shop') throw new Error('expected shops');
    expect(shop.phase.stock.find((i) => i.kind === 'relic')!.price).toBe(56);
    expect(full.phase.stock.find((i) => i.kind === 'relic')!.price).toBe(75);
    const fight = applyChoice(at('fight', { relics: ['relic-merchant-purse', 'relic-keen-eye'] }), {
      t: 'matchEnd',
      won: true,
    });
    if (fight.phase.kind !== 'reward') throw new Error('expected a reward');
    expect(fight.phase.cards).toHaveLength(4);
    expect(fight.phase.gold).toBeGreaterThanOrEqual(25);
  });

  it('the run match uses the run deck, hero passive and relic modifiers', () => {
    const r = at('fight', { relics: ['relic-iron-heart'] });
    const m = runMatch(r);
    expect(m.config.decks[0]).toEqual(r.deck);
    expect(m.config.modifiers![0]).toEqual([
      ...getHero('hero-pyra').modifiers,
      ...getRelic('relic-iron-heart').modifiers,
    ]);
    expect(m.difficulty).toBe('easy');
    expect(() => runMatch(startRun(config()))).toThrow(IllegalChoiceError);
  });

  it('can be abandoned from the map and other screens', () => {
    const r = applyChoice(startRun(config()), { t: 'abandon' });
    expect(r.phase).toEqual({ kind: 'over', won: false, abandoned: true });
    expect(runXp(r)).toBe(0);
  });

  it('card pool is owned cards of the hero faction', () => {
    const r = startRun(config(1, 'hero-aldric'));
    expect(cardPool(r).length).toBe(12);
    expect(cardPool(r).every((id) => getCard(id).faction === 'bastion')).toBe(true);
  });

  it('replaying the same choices gives the same state', () => {
    const choices = [
      { t: 'move', col: 0 },
      { t: 'matchEnd', won: true },
      { t: 'pick', index: 2 },
    ] as const;
    const a = replayRun(config(9), [...choices]);
    const b = replayRun(config(9), [...choices]);
    expect(a).toEqual(b);
    expect(a.step).toBe(3);
  });
});
