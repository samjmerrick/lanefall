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
    /** Overrides for the upgraded version (`<id>+`). Omitted: see `upgradeCard`. */
    upgrade: z
      .object({
        cost: z.number().int().min(0).max(10).optional(),
        power: z.number().int().min(0).optional(),
        health: z.number().int().min(1).optional(),
        keywords: z.array(Keyword).optional(),
        effects: z.array(EffectSchema).optional(),
      })
      .optional(),
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
    // Lane-relative selectors and summons need a lane: a unit's own, a chosen lane, or a target's.
    const hasLane = card.type === 'unit' || card.targeting !== 'none';
    for (const e of [...card.effects, ...(card.upgrade?.effects ?? [])]) {
      const a = e.action;
      if (!hasLane && (a.op === 'summon' || ('target' in a && /InLane$/.test(a.target))))
        issue('lane-relative effects need a lane');
      if (card.type === 'spell' && card.targeting !== 'lane' && 'target' in a && a.target === 'self')
        issue('spells have no self');
      if (card.type === 'unit' && 'target' in a && a.target === 'target') issue('units have no target');
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

/** Selectors usable without a source unit or lane (match modifiers run at round start). */
const GLOBAL_SELECTORS: readonly string[] = [
  'allFriendlyUnits',
  'allEnemyUnits',
  'randomEnemyUnit',
  'randomFriendlyUnit',
  'friendlyHero',
  'enemyHero',
];

/**
 * A per-player rule for one match: hero passives, relics and boss rules are built from these.
 * `roundStart` primitives run after mana refill and the draw, on the listed rounds (all rounds if omitted).
 */
export const MatchModifierSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('heroHp'), amount: z.number().int() }),
    z.object({ kind: z.literal('startReserve'), amount: posInt }),
    z.object({ kind: z.literal('startHand'), amount: posInt }),
    z.object({
      kind: z.literal('roundStart'),
      rounds: z.array(z.number().int().min(1).max(8)).optional(),
      action: PrimitiveSchema,
    }),
  ])
  .superRefine((m, ctx) => {
    if (m.kind !== 'roundStart') return;
    if ('target' in m.action && !GLOBAL_SELECTORS.includes(m.action.target))
      ctx.addIssue({ code: 'custom', message: `roundStart cannot use the ${m.action.target} selector` });
    if (m.action.op === 'summon' || m.action.op === 'move')
      ctx.addIssue({ code: 'custom', message: `roundStart cannot use ${m.action.op}` });
  });
export type MatchModifier = z.infer<typeof MatchModifierSchema>;

export const DeckDefSchema = z.object({
  id: z.string().regex(/^pre-[a-z-]+$/),
  name: z.string().min(1),
  cover: z.string(),
  cards: z.array(z.string()),
});
export const DeckDefListSchema = z.array(DeckDefSchema);
export type DeckDef = z.infer<typeof DeckDefSchema>;
