import type { Faction } from '../engine';

/** Each faction has a glyph as well as a colour, so factions can be told apart without colour. */
export const GLYPHS: Record<Faction, string> = {
  ember: '▲',
  tide: '≈',
  grove: '♣',
  bastion: '■',
  dusk: '◐',
};
