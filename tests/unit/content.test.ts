import { describe, expect, it } from 'vitest';
import { CARDS, collectibleCards, getCard, getLaneEffect, LANE_EFFECTS } from '../../src/engine';
import { CardSchema } from '../../src/engine/schema';

describe('content', () => {
  it('ships 40 starter cards: 20 Ember and 20 Bastion', () => {
    const cards = collectibleCards();
    expect(cards).toHaveLength(40);
    expect(cards.filter((c) => c.faction === 'ember')).toHaveLength(20);
    expect(cards.filter((c) => c.faction === 'bastion')).toHaveLength(20);
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
    for (const f of ['ember', 'bastion'] as const) {
      const spells = collectibleCards().filter((c) => c.faction === f && c.type === 'spell').length;
      expect(spells).toBeGreaterThanOrEqual(5);
      expect(spells).toBeLessThanOrEqual(8);
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
  });
});
