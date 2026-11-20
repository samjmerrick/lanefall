import { describe, expect, it } from 'vitest';
import { initMatch, RESERVE_CAP, STARTING_HAND } from '../../src/engine';
import { MatchModifierSchema, type MatchModifier } from '../../src/engine/schema';
import { FILLER, place, plan, resolve, setup } from './helpers';

const deck = Array.from({ length: 30 }, () => FILLER);
const mods = (m: MatchModifier[]): [MatchModifier[], MatchModifier[]] => [m, []];

describe('match modifiers', () => {
  it('heroHp, startReserve and startHand change the opening state of one player only', () => {
    const s = initMatch(
      {
        decks: [deck, deck],
        modifiers: mods([
          { kind: 'heroHp', amount: 5 },
          { kind: 'startReserve', amount: 3 },
          { kind: 'startHand', amount: 1 },
        ]),
      },
      3,
    );
    expect(s.players[0].hp).toBe(25);
    expect(s.players[0].maxHp).toBe(25);
    expect(s.players[0].reserve).toBe(RESERVE_CAP);
    expect(s.players[0].hand).toHaveLength(STARTING_HAND + 1);
    expect(s.players[1].hp).toBe(20);
    expect(s.players[1].reserve).toBe(0);
    expect(s.players[1].hand).toHaveLength(STARTING_HAND);
  });

  it('hero HP never drops below 1', () => {
    const s = initMatch({ decks: [deck, deck], modifiers: mods([{ kind: 'heroHp', amount: -50 }]) }, 1);
    expect(s.players[0].hp).toBe(1);
  });

  it('roundStart runs on the listed rounds only', () => {
    let s = setup({
      modifiers: mods([
        { kind: 'roundStart', rounds: [1, 2], action: { op: 'damage', target: 'enemyHero', amount: 2 } },
      ]),
    });
    expect(s.players[1].hp).toBe(18); // round 1
    s = resolve(plan(plan(s, 0), 1)).state;
    expect(s.players[1].hp).toBe(16); // round 2
    s = resolve(plan(plan(s, 0), 1)).state;
    expect(s.players[1].hp).toBe(16); // round 3: not listed
  });

  it('roundStart unit effects hit units and deaths are processed', () => {
    let s = setup({
      modifiers: mods([{ kind: 'roundStart', action: { op: 'damage', target: 'allEnemyUnits', amount: 5 } }]),
    });
    place(s, 1, 0, FILLER);
    const { state, events } = resolve(plan(plan(s, 0), 1));
    s = state;
    expect(s.lanes[0].slots[1].every((u) => u === null)).toBe(true);
    expect(events.some((e) => e.type === 'UnitDied')).toBe(true);
  });

  it('a lethal roundStart effect ends the match', () => {
    const s = setup({
      heroHp: 2,
      modifiers: mods([{ kind: 'roundStart', action: { op: 'damage', target: 'enemyHero', amount: 2 } }]),
    });
    expect(s.phase).toBe('over');
    expect(s.result).toEqual({ winner: 0, reason: 'hp' });
  });

  it('rejects lane-relative selectors, summon and move at round start', () => {
    const bad = [
      { kind: 'roundStart', action: { op: 'damage', target: 'enemyUnitsInLane', amount: 1 } },
      { kind: 'roundStart', action: { op: 'summon', cardId: 'bastion-levy', count: 1 } },
      { kind: 'roundStart', action: { op: 'move', target: 'allFriendlyUnits' } },
    ];
    for (const m of bad) expect(MatchModifierSchema.safeParse(m).success).toBe(false);
    expect(
      MatchModifierSchema.safeParse({ kind: 'roundStart', action: { op: 'draw', count: 1 } }).success,
    ).toBe(true);
  });
});
