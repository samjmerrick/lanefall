import { describe, expect, it } from 'vitest';
import { factionDeck } from '../../tools/sim/decks';
import { playBotMatch } from '../../tools/sim/runner';

const decks: [string[], string[]] = [factionDeck('ember'), factionDeck('bastion')];

describe('determinism', () => {
  it('the same seed and actions give an identical event log, byte for byte', () => {
    for (const seed of [1, 42, 9001]) {
      const a = playBotMatch({ decks }, seed);
      const b = playBotMatch({ decks }, seed);
      expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
      expect(JSON.stringify(b.final)).toBe(JSON.stringify(a.final));
    }
  });

  it('different seeds give different matches', () => {
    expect(JSON.stringify(playBotMatch({ decks }, 1).events)).not.toBe(
      JSON.stringify(playBotMatch({ decks }, 2).events),
    );
  });

  it('game state survives a JSON round trip mid-match', () => {
    const { final } = playBotMatch({ decks }, 7);
    expect(JSON.parse(JSON.stringify(final))).toEqual(final);
  });
});
