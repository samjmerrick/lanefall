import { z } from 'zod';

export const FACTIONS = ['ember', 'tide', 'grove', 'bastion', 'dusk'] as const;
export const KEYWORDS = [
  'guard',
  'barrier',
  'pierce',
  'rally',
  'growth',
  'regenerate',
  'lifesteal',
  'shift',
  'ephemeral',
] as const;

/** Selectors that pick units. Lane-relative selectors use the source's lane. */
export const UNIT_SELECTORS = [
  'self',
  'target',
  'friendlyUnitsInLane',
  'otherFriendlyUnitsInLane',
  'enemyUnitsInLane',
  'allUnitsInLane',
  'allFriendlyUnits',
  'otherFriendlyUnits',
  'allEnemyUnits',
  'randomEnemyUnit',
  'randomEnemyUnitInLane',
  'randomFriendlyUnit',
] as const;
export const HERO_SELECTORS = ['friendlyHero', 'enemyHero'] as const;

const UnitSelector = z.enum(UNIT_SELECTORS);
const AnySelector = z.enum([...UNIT_SELECTORS, ...HERO_SELECTORS]);
const Keyword = z.enum(KEYWORDS);
const posInt = z.number().int().positive();

export const PrimitiveSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('damage'), target: AnySelector, amount: posInt }),
  z.object({ op: z.literal('heal'), target: AnySelector, amount: z.union([posInt, z.literal('full')]) }),
  z.object({
    op: z.literal('buff'),
    target: UnitSelector,
    power: z.number().int(),
    health: z.number().int(),
    duration: z.enum(['permanent', 'round']),
  }),
  z.object({ op: z.literal('draw'), count: posInt }),
  z.object({ op: z.literal('summon'), cardId: z.string(), count: posInt.default(1) }),
  z.object({ op: z.literal('move'), target: UnitSelector }),
  z.object({ op: z.literal('gainMana'), amount: posInt }),
  z.object({ op: z.literal('grantKeyword'), target: UnitSelector, keyword: Keyword }),
  z.object({ op: z.literal('destroy'), target: UnitSelector }),
]);

export const TRIGGERS = ['onReveal', 'ongoing', 'endOfRound', 'lastBreath', 'spell'] as const;

export const EffectSchema = z.object({
  trigger: z.enum(TRIGGERS),
  action: PrimitiveSchema,
});

export const TARGETING = ['none', 'enemyUnit', 'friendlyUnit', 'anyUnit', 'lane'] as const;

export const CardSchema = z
  .object({
    id: z.string().regex(/^[a-z]+-[a-z0-9-]+$/),
    name: z.string().min(1),
    faction: z.enum(FACTIONS),
    type: z.enum(['unit', 'spell']),
    cost: z.number().int().min(0).max(10),
    power: z.number().int().min(0).optional(),
    health: z.number().int().min(1).optional(),
    keywords: z.array(Keyword).default([]),
    targeting: z.enum(TARGETING).default('none'),
    effects: z.array(EffectSchema).default([]),
    text: z.string(),
    rarity: z.enum(['common', 'uncommon', 'rare', 'legendary']),
    unlock: z.enum(['starter', 'track']),
    token: z.boolean().default(false),
  })
  .superRefine((card, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message: `${card.id}: ${message}` });
    if (card.type === 'unit') {
      if (card.power === undefined || card.health === undefined) issue('units need power and health');
      if (card.targeting !== 'none') issue('units cannot have targeting');
      if (card.effects.some((e) => e.trigger === 'spell')) issue('units cannot have spell effects');
    } else {
      if (card.power !== undefined || card.health !== undefined) issue('spells have no power or health');
      if (card.keywords.length > 0) issue('spells have no keywords');
      if (card.effects.some((e) => e.trigger !== 'spell')) issue('spell effects must use the spell trigger');
      if (card.effects.length === 0) issue('spells need at least one effect');
    }
    for (const e of card.effects) {
      if (e.trigger === 'ongoing' && e.action.op !== 'buff') issue('ongoing effects must be buffs');
      if (
        'target' in e.action &&
        e.action.target === 'target' &&
        !['enemyUnit', 'friendlyUnit', 'anyUnit'].includes(card.targeting)
      )
        issue('the target selector needs unit targeting');
    }
  });

export const CardListSchema = z.array(CardSchema);

export const LaneEffectSchema = z.object({
  id: z.string().regex(/^lane-[a-z0-9-]+$/),
  name: z.string().min(1),
  text: z.string().min(1),
  powerBonus: z.number().int().default(0),
  healthBonus: z.number().int().default(0),
  overflowMultiplier: z.number().int().min(0).default(1),
  maxUnits: z.number().int().min(1).max(4).default(4),
  heroDamage: z.boolean().default(true),
  endOfRound: z.array(PrimitiveSchema).default([]),
});

export const LaneEffectListSchema = z.array(LaneEffectSchema);

export type CardDef = z.infer<typeof CardSchema>;
export type LaneEffectDef = z.infer<typeof LaneEffectSchema>;
export type Primitive = z.infer<typeof PrimitiveSchema>;
export type Effect = z.infer<typeof EffectSchema>;
export type Keyword = (typeof KEYWORDS)[number];
export type Faction = (typeof FACTIONS)[number];
export type UnitSelector = (typeof UNIT_SELECTORS)[number];
export type Targeting = (typeof TARGETING)[number];
