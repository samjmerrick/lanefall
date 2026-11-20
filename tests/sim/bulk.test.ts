import { describe, expect, it } from 'vitest';
import { MAX_ROUNDS } from '../../src/engine';
import { FACTIONS } from '../../src/engine/schema';
import { factionDeck } from '../../tools/sim/decks';
import { playBotMatch } from '../../tools/sim/runner';

const MATCHES = 10_000;

describe('bulk simulation', () => {
  it(`${MATCHES} random bot-vs-bot matches all finish within ${MAX_ROUNDS} rounds with no errors`, () => {
    // Every ordered pairing of the five faction decks, so every card gets played.
    const pairs: [string[], string[]][] = FACTIONS.flatMap((a) =>
      FACTIONS.map((b): [string[], string[]] => [factionDeck(a), factionDeck(b)]),
    );
    for (let seed = 1; seed <= MATCHES; seed++) {
      const { final } = playBotMatch({ decks: pairs[seed % pairs.length]! }, seed);
      if (final.phase !== 'over' || final.round > MAX_ROUNDS || final.round < 1) {
        throw new Error(`seed ${seed}: phase ${final.phase}, round ${final.round}`);
      }
    }
    expect(true).toBe(true);
  }, 300_000);
});
