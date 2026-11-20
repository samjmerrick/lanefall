import { collectibleCards, type Faction } from '../engine';

export const PLAYABLE_FACTIONS = ['ember', 'bastion'] as const satisfies readonly Faction[];
export type PlayableFaction = (typeof PLAYABLE_FACTIONS)[number];

/** A 30-card starter deck for a faction: each card once, then commons until 30. (Pre-built decks arrive in M3.) */
export function starterDeck(faction: Faction): string[] {
  const cards = collectibleCards().filter((c) => c.faction === faction);
  const deck = cards.map((c) => c.id);
  const commons = cards.filter((c) => c.rarity === 'common');
  for (let i = 0; deck.length < 30; i++) deck.push(commons[i % commons.length]!.id);
  return deck;
}
