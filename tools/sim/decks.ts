import { collectibleCards, type Faction } from '../../src/engine';

/** A 30-card deck: every card of the faction once, then commons again until 30. */
export function factionDeck(faction: Faction): string[] {
  const cards = collectibleCards().filter((c) => c.faction === faction);
  const deck = cards.map((c) => c.id);
  const commons = cards.filter((c) => c.rarity === 'common');
  for (let i = 0; deck.length < 30; i++) deck.push(commons[i % commons.length]!.id);
  return deck;
}
