import { describe, expect, it } from 'vitest';
import { plan } from '../../src/ai';
import { HARD_BUDGET_MS, planHard } from '../../src/ai/hard';
import { applyAction, initMatch, resolveRound, type GameState } from '../../src/engine';
import { seedRng } from '../../src/engine/rng';
import { FACTIONS } from '../../src/engine/schema';
import { factionDeck } from '../../tools/sim/decks';
import { playBotMatch } from '../../tools/sim/runner';

/** Mid-match states across faction pairings, reached by two Easy bots. */
function sampleStates(count: number): GameState[] {
  const out: GameState[] = [];
  for (let seed = 1; out.length < count; seed++) {
    const a = FACTIONS[seed % 5]!;
    const b = FACTIONS[(seed * 3) % 5]!;
    let s = initMatch({ decks: [factionDeck(a), factionDeck(b)] }, seed);
    for (const p of [0, 1] as const)
      for (const act of plan('easy', s, p, seedRng(seed)).actions) s = applyAction(s, act);
    while (s.phase === 'plan' && out.length < count) {
      out.push(s);
      for (const p of [0, 1] as const)
        for (const act of plan('easy', s, p, seedRng(seed + s.round)).actions) s = applyAction(s, act);
      s = resolveRound(s).state;
    }
  }
  return out;
}

describe('Hard AI', () => {
  const states = sampleStates(40);

  it(`benchmark: the full search finishes within ${HARD_BUDGET_MS} ms on every sampled turn`, () => {
    const times: number[] = [];
    for (const s of states) {
      const t = performance.now();
      planHard(s, 1, seedRng(1));
      times.push(performance.now() - t);
    }
    times.sort((x, y) => x - y);
    const median = times[Math.floor(times.length / 2)]!;
    const p90 = times[Math.floor(times.length * 0.9)]!;
    console.log(`Hard AI full search: median ${median.toFixed(0)} ms, p90 ${p90.toFixed(0)} ms, worst ${times.at(-1)!.toFixed(0)} ms`);
    expect(times.at(-1)!).toBeLessThan(HARD_BUDGET_MS);
  });

  it('with a clock, never runs much past its budget and still returns a legal plan', () => {
    for (const s of states) {
      const t = performance.now();
      const { actions } = planHard(s, 0, seedRng(2), {}, { now: () => performance.now(), budgetMs: 50 });
      // The candidate list is built before the first check; allow for that.
      expect(performance.now() - t).toBeLessThan(50 + 250);
      let after = s;
      for (const a of actions) after = applyAction(after, a);
      expect(after.players[0].ready).toBe(true);
    }
  });

  it('is deterministic without a clock', () => {
    for (const s of states.slice(0, 5))
      expect(planHard(s, 1, seedRng(9)).actions).toEqual(planHard(s, 1, seedRng(9)).actions);
  });

  it('beats Normal more often than not', () => {
    let wins = 0;
    let losses = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const decks: [string[], string[]] = [factionDeck(FACTIONS[seed % 5]!), factionDeck(FACTIONS[(seed + 2) % 5]!)];
      const hardSeat = seed % 2;
      const order: ['hard', 'normal'] | ['normal', 'hard'] = hardSeat === 0 ? ['hard', 'normal'] : ['normal', 'hard'];
      const { final } = playBotMatch({ decks }, seed, order);
      if (final.result?.winner === hardSeat) wins++;
      else if (final.result?.winner !== null) losses++;
    }
    expect(wins).toBeGreaterThan(losses);
  }, 120_000);
});
