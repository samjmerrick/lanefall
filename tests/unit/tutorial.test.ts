import { describe, expect, it } from 'vitest';
import { applyAction, initMatch, resolveRound, type GameState, type PlannedAction } from '../../src/engine';
import {
  opponentPlan,
  requiredAction,
  stepAllows,
  tutorialConfig,
  TUTORIAL,
  TUTORIAL_SEED,
} from '../../src/run';

/** Mulligans nothing, as the tutorial does. */
export function tutorialStart(seed = TUTORIAL_SEED): GameState {
  let s = initMatch(tutorialConfig(), seed);
  s = applyAction(s, { type: 'mulligan', player: 0, uids: [] });
  return applyAction(s, { type: 'mulligan', player: 1, uids: [] });
}

/** Follows every coach step with the engine API and the scripted opponent; returns the state after each round. */
export function followScript(s: GameState): GameState[] {
  const rounds: GameState[] = [];
  for (const step of TUTORIAL.steps) {
    if (step.kind === 'play' || step.kind === 'cast') {
      const action = requiredAction(step, s);
      if (!action) throw new Error(`step not playable in round ${s.round}: ${step.text}`);
      s = applyAction(s, { type: 'plan', player: 0, action });
    } else if (step.kind === 'endTurn') {
      s = applyAction(s, { type: 'endTurn', player: 0 });
      for (const action of opponentPlan(s)) s = applyAction(s, { type: 'plan', player: 1, action });
      s = applyAction(s, { type: 'endTurn', player: 1 });
      s = resolveRound(s).state;
      rounds.push(s);
    }
  }
  return rounds;
}

describe('tutorial match', () => {
  it('starts with the cards the first step needs and a Forge lane on the left', () => {
    const s = tutorialStart();
    expect(s.lanes.map((l) => l.effectId)).toEqual(['lane-forge', 'lane-plain', 'lane-plain']);
    const first = TUTORIAL.steps.find((st) => st.kind === 'play')!;
    expect(requiredAction(first, s)).not.toBeNull();
    expect(s.players[0].hand).toHaveLength(5);
    expect(s.players[1].hand.some((h) => h.cardId === 'bastion-recruit')).toBe(true);
  });

  it('is won by the player in round 3 when the steps are followed', () => {
    const rounds = followScript(tutorialStart());
    expect(rounds).toHaveLength(3);
    expect(rounds[0]!.phase).toBe('plan');
    expect(rounds[0]!.players[1].hp).toBe(7); // the Imp's 3 Power (2 + Forge) is unblocked
    expect(rounds[1]!.phase).toBe('plan');
    expect(rounds[1]!.players[1].hp).toBe(2); // Militia soaks 3 of the Left lane's 8 Power
    expect(rounds[1]!.players[0].hp).toBeGreaterThan(0);
    const end = rounds[2]!;
    expect(end.phase).toBe('over');
    expect(end.result).toMatchObject({ winner: 0 });
    expect(end.round).toBe(3);
  });

  it('only allows the plays a step asks for', () => {
    const s = tutorialStart();
    const step = TUTORIAL.steps.find((st) => st.kind === 'play')!;
    const need = requiredAction(step, s)!;
    expect(stepAllows(step, s, need)).toBe(true);
    if (need.type === 'playUnit') {
      const wrongSlot: PlannedAction = { ...need, slot: need.slot + 1 };
      const wrongLane: PlannedAction = { ...need, lane: ((need.lane + 1) % 3) as 0 | 1 | 2 };
      expect(stepAllows(step, s, wrongSlot)).toBe(false);
      expect(stepAllows(step, s, wrongLane)).toBe(false);
    }
    const other = s.players[0].hand.find((h) => h.cardId !== (step.kind === 'play' ? step.card : ''))!;
    expect(stepAllows(step, s, { type: 'playUnit', uid: other.uid, lane: 0, slot: 0 })).toBe(false);
    expect(stepAllows(TUTORIAL.steps[0], s, need)).toBe(false);
  });
});
