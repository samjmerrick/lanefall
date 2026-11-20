import { describe, expect, it, vi } from 'vitest';

// Only two factions have cards so far; add fake Tide and Grove cards to test the 2-faction limit.
vi.mock('../../src/engine/content', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/engine/content')>();
  const fake = (id: string, faction: 'tide' | 'grove') => ({
    id,
    name: id,
    faction,
    type: 'unit' as const,
    cost: 1,
    power: 1,
    health: 2,
    keywords: [],
    targeting: 'none' as const,
    effects: [],
    text: '',
    rarity: 'common' as const,
    unlock: 'starter' as const,
    token: false,
  });
  const cards = [...real.CARDS, fake('tide-fake', 'tide'), fake('grove-fake', 'grove')];
  return {
    ...real,
    CARDS: cards,
    getCard: (id: string) => cards.find((c) => c.id === id) ?? real.getCard(id),
  };
});

const { canAddCard, deckProblems } = await import('../../src/engine/deck');

describe('faction limit', () => {
  it('rejects a deck with 3 factions', () => {
    const cards = [
      ...Array.from({ length: 28 }, (_, i) => (i < 14 ? 'ember-spark-imp' : 'bastion-recruit')),
      'tide-fake',
      'tide-fake',
    ];
    expect(deckProblems(cards).map((p) => p.rule)).toContain('factions');
  });

  it('canAddCard refuses a third faction', () => {
    expect(canAddCard(['ember-spark-imp', 'bastion-recruit'], 'tide-fake')).toBe(false);
    expect(canAddCard(['ember-spark-imp', 'grove-fake'], 'grove-fake')).toBe(true);
  });
});
