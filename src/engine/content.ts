import cardsJson from '../content/cards.json';
import lanesJson from '../content/lanes.json';
import { CardListSchema, LaneEffectListSchema, type CardDef, type LaneEffectDef } from './schema';

export const CARDS: readonly CardDef[] = CardListSchema.parse(cardsJson);
export const LANE_EFFECTS: readonly LaneEffectDef[] = LaneEffectListSchema.parse(lanesJson);

const cardById = new Map(CARDS.map((c) => [c.id, c]));
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

/** Collectible (non-token) cards. */
export function collectibleCards(): CardDef[] {
  return CARDS.filter((c) => !c.token);
}
