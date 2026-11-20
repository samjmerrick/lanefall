// Public engine API. The UI, AI and simulator import from here only.
export { initMatch, applyAction, legalActions } from './match';
export { assignLaneDamage, previewCombat, soakOrder } from './combat';
export type { SideHits, UnitHit, CombatPreview, UnitForecast } from './combat';
export { resolveRound, planCost, manaLeft } from './round';
export {
  lanePower,
  unitPower,
  unitMaxHealth,
  unitRemainingHealth,
  activeLaneEffect,
  findUnit,
  allUnits,
} from './board';
export {
  CARDS,
  LANE_EFFECTS,
  PREBUILT_DECKS,
  getCard,
  getLaneEffect,
  collectibleCards,
  starterCollection,
  upgradeCard,
  isUpgraded,
  baseId,
  generatedText,
  UPGRADED,
} from './content';
export * from './types';
export type { CardDef, DeckDef, LaneEffectDef, Keyword, Faction } from './schema';
export * from './deck';
