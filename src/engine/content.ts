import cardsJson from '../content/cards.json';
import decksJson from '../content/decks.json';
import lanesJson from '../content/lanes.json';
import { cardText } from './text';
import {
  CardListSchema,
  DeckDefListSchema,
  LaneEffectListSchema,
  type CardDef,
  type DeckDef,
  type LaneEffectDef,
} from './schema';

/** Suffix marking an upgraded card id, e.g. `ember-kindle+`. */
export const UPGRADED = '+';

const bump = (n: number) => n + (n > 0 ? 1 : n < 0 ? -1 : 0);

/**
 * A card's upgraded version: the card's `upgrade` overrides if given; otherwise a unit gets +1 Power,
 * and a spell gets +1 on every damage/heal/buff amount, or costs 1 less if it has no amounts.
 */
export function upgradeCard(card: CardDef): CardDef {
  const u = card.upgrade;
  const base: CardDef = { ...card, id: card.id + UPGRADED, name: card.name + UPGRADED, upgrade: undefined };
  if (u) return { ...base, ...u };
  if (card.type === 'unit') return { ...base, power: (card.power ?? 0) + 1 };
  let bumped = false;
  const effects = card.effects.map((e) => {
    const a = e.action;
    if (a.op === 'damage' || (a.op === 'heal' && a.amount !== 'full')) {
      bumped = true;
      return { ...e, action: { ...a, amount: (a.amount as number) + 1 } };
    }
    if (a.op === 'buff') {
      bumped = true;
      return { ...e, action: { ...a, power: bump(a.power), health: bump(a.health) } };
    }
    return e;
  });
  return bumped ? { ...base, effects } : { ...base, cost: Math.max(0, card.cost - 1) };
}

const BASE_CARDS: readonly CardDef[] = CardListSchema.parse(cardsJson);

function withText(card: CardDef, byId: Map<string, CardDef>): CardDef {
  const text = cardText(card, {
    tokenName: (id) => {
      const t = byId.get(id)!;
      return { name: t.name, power: t.power ?? 0, health: t.health ?? 1 };
    },
  });
  return { ...card, text };
}

const baseById = new Map(BASE_CARDS.map((c) => [c.id, c]));
/** Base cards (as written in cards.json). Upgraded versions are looked up with `getCard('<id>+')`. */
export const CARDS: readonly CardDef[] = BASE_CARDS;
const UPGRADES: readonly CardDef[] = BASE_CARDS.filter((c) => !c.token).map((c) =>
  withText(upgradeCard(c), baseById),
);
export const LANE_EFFECTS: readonly LaneEffectDef[] = LaneEffectListSchema.parse(lanesJson);
/** Pre-built decks: one per faction and faction pair available so far. Read-only; players copy them to edit. */
export const PREBUILT_DECKS: readonly DeckDef[] = DeckDefListSchema.parse(decksJson);

const cardById = new Map([...CARDS, ...UPGRADES].map((c) => [c.id, c]));
const laneById = new Map(LANE_EFFECTS.map((l) => [l.id, l]));

export function getCard(id: string): CardDef {
  const card = cardById.get(id);
  if (!card) throw new Error(`Unknown card: ${id}`);
  return card;
}

export function getLaneEffect(id: string): LaneEffectDef {
  const lane = laneById.get(id);
  if (!lane) throw new Error(`Unknown lane effect: ${id}`);
  return lane;
}

export function isUpgraded(id: string): boolean {
  return id.endsWith(UPGRADED);
}

/** The base card id of a possibly upgraded id. */
export function baseId(id: string): string {
  return isUpgraded(id) ? id.slice(0, -UPGRADED.length) : id;
}

/** Rules text generated from the card's data (cards.json `text` must match it). */
export function generatedText(card: CardDef): string {
  return withText(card, baseById).text;
}

/** Collectible (non-token) cards. */
export function collectibleCards(): CardDef[] {
  return CARDS.filter((c) => !c.token);
}

/** Cards every new profile owns: the starter commons of each faction. */
export function starterCollection(): Set<string> {
  return new Set(CARDS.filter((c) => !c.token && c.unlock === 'starter').map((c) => c.id));
}
