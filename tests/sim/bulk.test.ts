import { describe, expect, it } from 'vitest';
import { MAX_ROUNDS } from '../../src/engine';
import { factionDeck } from '../../tools/sim/decks';
import { playBotMatch } from '../../tools/sim/runner';

const MATCHES = 10_000;

describe('bulk simulation', () => {
  it(`${MATCHES} random bot-vs-bot matches all finish within ${MAX_ROUNDS} rounds with no errors`, () => {
    const pairs: [string[], string[]][] = [
      [factionDeck('ember'), factionDeck('bastion')],
      [factionDeck('bastion'), factionDeck('ember')],
      [factionDeck('ember'), factionDeck('ember')],
      [factionDeck('bastion'), factionDeck('bastion')],
    ];
    for (let seed = 1; seed <= MATCHES; seed++) {
      const { final } = playBotMatch({ decks: pairs[seed % pairs.length]! }, seed);
      if (final.phase !== 'over' || final.round > MAX_ROUNDS || final.round < 1) {
        throw new Error(`seed ${seed}: phase ${final.phase}, round ${final.round}`);
      }
    }
    expect(true).toBe(true);
  }, 300_000);
});
