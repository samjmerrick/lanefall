import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { collectibleCards } from '../../src/engine';
import {
  aggregate,
  buildMeta,
  findViolations,
  generate,
  makeJobs,
  missingReasons,
  renderReport,
  type Exceptions,
  type GameRecord,
} from '../../tools/sim/balance';

const none: Exceptions = { factions: {}, cards: {} };

function rec(seed: number, winner: 0 | 1 | null, over: Partial<GameRecord> = {}): GameRecord {
  return {
    seed,
    factions: ['ember', 'bastion'],
    winner,
    reason: 'rounds',
    rounds: 8,
    played: [['ember-a'], ['bastion-b']],
    ...over,
  };
}

describe('balance generator (small run)', () => {
  const N = 4;

  it('is deterministic, and totals add up', async () => {
    // In-process only: worker threads need the tsx loader, which Vitest does not provide.
    const one = await generate(N, none, 1);
    const again = await generate(N, none, 1);
    expect(again.markdown).toBe(one.markdown);
    expect(one.stats.matches).toBe(10 * 2 * N);
    expect(makeJobs(N).map((j) => j.seed)).toEqual(Array.from({ length: 80 }, (_, i) => i + 1));
    const games = Object.values(one.stats.factions).reduce((a, t) => a + t.games, 0);
    expect(games).toBe(2 * one.stats.matches);
    const wins = Object.values(one.stats.factions).reduce((a, t) => a + t.wins, 0);
    expect(wins + one.stats.draws.total).toBe(one.stats.matches);
    expect(one.stats.draws.hp + one.stats.draws.rounds).toBe(one.stats.draws.total);
  }, 60_000);

  it('lists every collectible card in the card table or the never-played list', async () => {
    const { markdown } = await generate(N, none, 1);
    const cards = markdown.split('## Cards')[1]!.split('## Never played')[0]!;
    const never = markdown.split('## Never played')[1]!.split('## Exceptions')[0]!;
    for (const c of collectibleCards()) {
      expect(cards.includes(`| ${c.id} |`) || never.includes(`- ${c.id} (`), c.id).toBe(true);
    }
  }, 60_000);
});

describe('aggregate and renderReport', () => {
  // ember wins 3 of 4 (one draw counted as a loss); card ember-a is played in all four.
  const records = [
    rec(1, 0),
    rec(2, 0),
    rec(3, 0),
    rec(4, null, { reason: 'hp', rounds: 4, played: [['ember-a', 'ember-c'], ['bastion-b']] }),
  ];
  const stats = aggregate(records);

  it('counts a draw as a loss and breaks draws down by reason', () => {
    expect(stats.factions.ember).toEqual({ games: 4, wins: 3, draws: 1 });
    expect(stats.factions.bastion).toEqual({ games: 4, wins: 0, draws: 1 });
    expect(stats.pairs.ember!.bastion).toEqual({ games: 4, wins: 3, draws: 1 });
    expect(stats.draws).toEqual({ total: 1, hp: 1, rounds: 0 });
    expect(stats.avgRounds).toBeCloseTo(7, 5);
    expect(stats.cards['ember-a']).toEqual({ played: 4, wins: 3 });
    expect(stats.cards['ember-c']).toEqual({ played: 1, wins: 0 });
  });

  it('flags out-of-target factions and cards', () => {
    const v = findViolations(stats);
    expect(v.factions.map((f) => f.id)).toEqual(['bastion', 'ember']);
    expect(v.cards.map((c) => c.id)).toEqual(['ember-a']);
  });

  it('shows MISSING REASON, or the reason when an exception exists', () => {
    const meta = buildMeta(1, none);
    const bare = renderReport(stats, meta);
    const section = bare.split('## Exceptions')[1]!;
    expect(section).toContain('- Faction ember (75.0%): MISSING REASON');
    expect(section).toContain('- Card ember-a (75.0% over 4 matches): MISSING REASON');
    expect(missingReasons(stats, none)).toEqual(['faction bastion', 'faction ember', 'card ember-a']);

    const ex: Exceptions = {
      factions: { ember: 'aggro by design', bastion: 'defensive by design' },
      cards: { 'ember-a': 'signature card' },
    };
    const covered = renderReport(stats, buildMeta(1, ex)).split('## Exceptions')[1]!;
    expect(covered).not.toContain('MISSING REASON');
    expect(covered).toContain('aggro by design');
    expect(covered).toContain('signature card');
    expect(missingReasons(stats, ex)).toEqual([]);
  });

  it('reports in-target data cleanly', () => {
    const balanced = aggregate([rec(1, 0), rec(2, 1)]);
    const md = renderReport(balanced, buildMeta(1, none));
    expect(md).toContain('None: every faction and card is within target.');
    expect(md).not.toContain('✗');
  });
});

describe('committed docs/balance.md', () => {
  it('has no exception without a reason', (ctx) => {
    const path = new URL('../../docs/balance.md', import.meta.url);
    if (!existsSync(path)) {
      console.warn('docs/balance.md does not exist yet: run `pnpm sim:balance` to generate it');
      ctx.skip();
      return;
    }
    const md = readFileSync(path, 'utf8');
    const section = md.split('## Exceptions')[1];
    expect(section, 'docs/balance.md has no Exceptions section').toBeDefined();
    expect(section).not.toContain('MISSING REASON');
  });
});
