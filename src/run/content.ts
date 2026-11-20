// Run content: heroes, relics and enemies, validated with Zod at load.
import heroesJson from '../content/heroes.json';
import relicsJson from '../content/relics.json';
import enemiesJson from '../content/enemies.json';
import { z } from 'zod';
import { getCard, type Faction } from '../engine';
import { FACTIONS, MatchModifierSchema } from '../engine/schema';

export const HeroSchema = z.object({
  id: z.string().regex(/^hero-[a-z-]+$/),
  name: z.string().min(1),
  title: z.string().min(1),
  faction: z.enum(FACTIONS),
  passive: z.string().min(1),
  modifiers: z.array(MatchModifierSchema),
  unlock: z.enum(['starter', 'track']),
  starterDeck: z.array(z.string()).length(12),
});

export const RelicSchema = z.object({
  id: z.string().regex(/^relic-[a-z-]+$/),
  name: z.string().min(1),
  text: z.string().min(1),
  modifiers: z.array(MatchModifierSchema).default([]),
  /** Run-level effects (outside matches). */
  run: z
    .object({
      fightGold: z.number().int().min(0).default(0),
      shopDiscount: z.number().int().min(0).max(90).default(0),
      cardChoices: z.number().int().min(0).max(3).default(0),
    })
    .partial()
    .default({}),
});

export const EnemySchema = z.object({
  id: z.string().regex(/^(enemy|boss)-[a-z-]+$/),
  name: z.string().min(1),
  act: z.number().int().min(1).max(3),
  kind: z.enum(['fight', 'boss']),
  difficulty: z.enum(['easy', 'normal']),
  deck: z.array(z.string()).min(10),
  modifiers: z.array(MatchModifierSchema).default([]),
  /** The boss rule as shown to the player. */
  rule: z.string().optional(),
  ai: z.object({ seesPlan: z.boolean().optional() }).default({}),
});

export type HeroDef = z.infer<typeof HeroSchema>;
export type RelicDef = z.infer<typeof RelicSchema>;
export type EnemyDef = z.infer<typeof EnemySchema>;

export const HEROES: readonly HeroDef[] = z.array(HeroSchema).parse(heroesJson);
export const RELICS: readonly RelicDef[] = z.array(RelicSchema).parse(relicsJson);
export const ENEMIES: readonly EnemyDef[] = z.array(EnemySchema).parse(enemiesJson);

for (const h of HEROES)
  for (const id of h.starterDeck)
    if (getCard(id).faction !== h.faction) {
      throw new Error(`${h.id}: ${id} is not ${h.faction}`);
    }
for (const e of ENEMIES) for (const id of e.deck) getCard(id);

function byId<T extends { id: string }>(list: readonly T[], kind: string) {
  const map = new Map(list.map((x) => [x.id, x]));
  return (id: string): T => {
    const x = map.get(id);
    if (!x) throw new Error(`Unknown ${kind}: ${id}`);
    return x;
  };
}

export const getHero = byId(HEROES, 'hero');
export const getRelic = byId(RELICS, 'relic');
export const getEnemy = byId(ENEMIES, 'enemy');

export function starterHeroes(): HeroDef[] {
  return HEROES.filter((h) => h.unlock === 'starter');
}

export type { Faction };
