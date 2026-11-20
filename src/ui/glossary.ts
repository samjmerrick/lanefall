import type { Keyword } from '../engine';

export const KEYWORD_NAMES: Record<Keyword, string> = {
  guard: 'Guard',
  barrier: 'Barrier',
  pierce: 'Pierce',
  rally: 'Rally',
  growth: 'Growth',
  regenerate: 'Regenerate',
  lifesteal: 'Lifesteal',
  shift: 'Shift',
  ephemeral: 'Ephemeral',
};

export const GLOSSARY: Record<string, string> = {
  Guard: 'Enemy lane damage is assigned to this unit before non-Guard units.',
  Barrier: 'Prevents the next damage this unit would take, then is removed.',
  Pierce: "This unit's Power skips enemy units and goes straight to the enemy hero.",
  Rally: 'On Reveal: other friendly units in this lane get +1 Power this round.',
  Growth: 'End of Round: +1 Power and +1 Health.',
  Regenerate: 'End of Round: heal this unit fully.',
  Lifesteal: "When this lane deals hero damage, your hero heals by this unit's Power.",
  Shift: 'During planning, may move to another lane once per match.',
  Ephemeral: 'Dies at End of Round.',
  'On Reveal': 'Effect resolves when the card reveals.',
  Ongoing: 'Effect applies while the unit is in play.',
  'Last Breath': 'Effect resolves when the unit dies.',
  'End of Round': 'Effect resolves at the end of each round.',
};

/** Glossary entries whose term appears in the card's rules text. */
export function glossaryFor(text: string): [string, string][] {
  return Object.entries(GLOSSARY).filter(([term]) => text.includes(term));
}
