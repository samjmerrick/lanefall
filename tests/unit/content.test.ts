import { describe, expect, it } from 'vitest';
import {
  CARDS,
  collectibleCards,
  generatedText,
  getCard,
  getLaneEffect,
  LANE_EFFECTS,
  starterCollection,
} from '../../src/engine';
import { CardSchema, FACTIONS } from '../../src/engine/schema';

describe('content', () => {
  it('ships 150 cards: 30 per faction, 12 starter commons each', () => {
    const cards = collectibleCards();
    expect(cards).toHaveLength(150);
    for (const f of FACTIONS) {
      expect(
        cards.filter((c) => c.faction === f),
        f,
      ).toHaveLength(30);
      const starters = cards.filter((c) => c.faction === f && c.unlock === 'starter');
      expect(starters, f).toHaveLength(12);
      expect(
        starters.every((c) => c.rarity === 'common'),
        f,
      ).toBe(true);
    }
    expect(starterCollection().size).toBe(60);
  });

  it('follows the mana curve per faction within one card per step', () => {
    const target: Record<number, number> = { 1: 4, 2: 6, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2 };
    for (const f of FACTIONS) {
      const pool = collectibleCards().filter((c) => c.faction === f);
      for (const [cost, n] of Object.entries(target)) {
        const have = pool.filter((c) => Math.min(c.cost, 7) === Number(cost)).length;
        expect(Math.abs(have - n), `${f} at ${cost}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("every card's text is generated from its data", () => {
    for (const c of CARDS) expect(c.text, c.id).toBe(generatedText(c));
  });

  it('has unique ids and every summoned card exists', () => {
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    for (const c of CARDS)
      for (const e of c.effects)
        if (e.action.op === 'summon') expect(getCard(e.action.cardId).token).toBe(true);
  });

  it('every card has rules text when it has keywords or effects', () => {
    for (const c of CARDS) if (c.keywords.length || c.effects.length) expect(c.text, c.id).not.toBe('');
  });

  it('has about 1 in 3 spells per faction', () => {
    for (const f of FACTIONS) {
      const spells = collectibleCards().filter((c) => c.faction === f && c.type === 'spell').length;
      expect(spells).toBeGreaterThanOrEqual(8);
      expect(spells).toBeLessThanOrEqual(12);
    }
  });

  it('has a pool of lane effects with unique ids', () => {
    expect(LANE_EFFECTS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(LANE_EFFECTS.map((l) => l.id)).size).toBe(LANE_EFFECTS.length);
    expect(() => getLaneEffect('lane-nope')).toThrow(/Unknown lane effect/);
  });

  it('the schema rejects malformed cards', () => {
    const base = {
      id: 'ember-x',
      name: 'X',
      faction: 'ember',
      cost: 1,
      text: '',
      rarity: 'common',
      unlock: 'starter',
    };
    expect(CardSchema.safeParse({ ...base, type: 'unit' }).success).toBe(false);
    expect(
      CardSchema.safeParse({ ...base, type: 'unit', power: 1, health: 1, targeting: 'lane' }).success,
    ).toBe(false);
    expect(CardSchema.safeParse({ ...base, type: 'spell', power: 1 }).success).toBe(false);
    expect(CardSchema.safeParse({ ...base, type: 'spell', keywords: ['guard'] }).success).toBe(false);
    const dmg = { op: 'damage', target: 'target', amount: 1 };
    expect(
      CardSchema.safeParse({ ...base, type: 'spell', effects: [{ trigger: 'onReveal', action: dmg }] })
        .success,
    ).toBe(false);
    expect(
      CardSchema.safeParse({
        ...base,
        type: 'spell',
        targeting: 'none',
        effects: [{ trigger: 'spell', action: dmg }],
      }).success,
    ).toBe(false);
    expect(
      CardSchema.safeParse({
        ...base,
        type: 'unit',
        power: 1,
        health: 1,
        effects: [{ trigger: 'ongoing', action: { op: 'draw', count: 1 } }],
      }).success,
    ).toBe(false);
    expect(
      CardSchema.safeParse({
        ...base,
        type: 'unit',
        power: 1,
        health: 1,
        effects: [{ trigger: 'spell', action: { op: 'draw', count: 1 } }],
      }).success,
    ).toBe(false);
    expect(
      CardSchema.safeParse({
        ...base,
        type: 'spell',
        targeting: 'enemyUnit',
        effects: [{ trigger: 'spell', action: dmg }],
      }).success,
    ).toBe(true);
    const laneDmg = { op: 'damage', target: 'enemyUnitsInLane', amount: 1 };
    expect(
      CardSchema.safeParse({ ...base, type: 'spell', effects: [{ trigger: 'spell', action: laneDmg }] })
        .success,
    ).toBe(false);
    expect(
      CardSchema.safeParse({
        ...base,
        type: 'unit',
        power: 1,
        health: 1,
        effects: [{ trigger: 'onReveal', action: dmg }],
      }).success,
    ).toBe(false);
  });
});
