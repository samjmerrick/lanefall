import { describe, expect, it } from 'vitest';
import { plan } from '../../src/ai';
import { enumeratePlans, evaluate, hideOpponent, planNormal } from '../../src/ai/normal';
import { applyAction, initMatch, resolveRound, type GameState } from '../../src/engine';
import { seedRng } from '../../src/engine/rng';
import { factionDeck } from '../../tools/sim/decks';
import { playBotMatch } from '../../tools/sim/runner';

const decks: [string[], string[]] = [factionDeck('ember'), factionDeck('bastion')];

/** Mid-match states reached by two Easy bots, for timing and behaviour checks. */
function sampleStates(count: number): GameState[] {
  const out: GameState[] = [];
  for (let seed = 1; out.length < count; seed++) {
    let s = initMatch({ decks }, seed);
    for (const p of [0, 1] as const)
      for (const a of plan('easy', s, p, seedRng(seed)).actions) s = applyAction(s, a);
    while (s.phase === 'plan' && out.length < count) {
      out.push(s);
      for (const p of [0, 1] as const)
        for (const a of plan('easy', s, p, seedRng(seed + s.round)).actions) s = applyAction(s, a);
      s = resolveRound(s).state;
    }
  }
  return out;
}

describe('Normal AI', () => {
  it('plans in under 200 ms', () => {
    let worst = 0;
    for (const s of sampleStates(60)) {
      const t = performance.now();
      planNormal(s, 1, seedRng(1));
      worst = Math.max(worst, performance.now() - t);
    }
    expect(worst).toBeLessThan(200);
  });

  it('only returns legal actions, ending with End Turn', () => {
    for (const s of sampleStates(30)) {
      const { actions } = planNormal(s, 0, seedRng(1));
      expect(actions.at(-1)).toEqual({ type: 'endTurn', player: 0 });
      let t = s;
      for (const a of actions) t = applyAction(t, a);
      expect(t.players[0].ready).toBe(true);
    }
  });

  it('considers at most 200 candidate plans, including passing', () => {
    for (const s of sampleStates(20)) {
      const plans = enumeratePlans(hideOpponent(s, 1), 1);
      expect(plans.length).toBeLessThanOrEqual(200);
      expect(plans.length).toBeGreaterThan(0);
    }
  });

  it('does not see the opponent’s planned cards', () => {
    const [s] = sampleStates(1);
    let withPlan = s!;
    for (const a of plan('easy', withPlan, 0, seedRng(3)).actions.slice(0, -1))
      withPlan = applyAction(withPlan, a);
    expect(planNormal(withPlan, 1, seedRng(1)).actions).toEqual(planNormal(s!, 1, seedRng(1)).actions);
  });

  it('scores wins and losses beyond any board position', () => {
    const [s] = sampleStates(1);
    expect(evaluate({ ...s!, result: { winner: 0, reason: 'hp' } }, 0)).toBe(10000);
    expect(evaluate({ ...s!, result: { winner: 1, reason: 'hp' } }, 0)).toBe(-10000);
    expect(evaluate({ ...s!, result: { winner: null, reason: 'rounds' } }, 0)).toBe(0);
  });

  it('mulligans expensive cards', () => {
    const s = initMatch({ decks }, 4);
    const { actions } = plan('normal', s, 0, seedRng(1));
    expect(actions).toHaveLength(1);
    expect(actions[0]!.type).toBe('mulligan');
  });

  it('beats Easy in most matches', () => {
    let wins = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const order: ['normal', 'easy'] | ['easy', 'normal'] =
        seed % 2 ? ['normal', 'easy'] : ['easy', 'normal'];
      const { final } = playBotMatch({ decks: seed % 2 ? decks : [decks[1], decks[0]] }, seed, order);
      const normalSeat = seed % 2 ? 0 : 1;
      if (final.result?.winner === normalSeat) wins++;
    }
    expect(wins).toBeGreaterThan(70);
  });
});
