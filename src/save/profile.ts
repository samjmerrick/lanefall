import { z } from 'zod';

export const CURRENT_SCHEMA = 1;
export const MAX_SAVED_DECKS = 20;
export const MAX_DECK_NAME = 24;

export const SavedDeckSchema = z.object({
  id: z.string().regex(/^d\d+$/),
  name: z.string().min(1).max(MAX_DECK_NAME),
  cover: z.string(),
  cards: z.array(z.string()),
});

const RecordSchema = z.object({ played: z.number().int().min(0), won: z.number().int().min(0) });

export const ProfileSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA),
  xp: z.number().int().min(0),
  level: z.number().int().min(1),
  /** Ids of everything unlocked beyond the starting collection (cards, heroes, relics). */
  unlocks: z.array(z.string()),
  decks: z.array(SavedDeckSchema).max(MAX_SAVED_DECKS),
  nextDeckId: z.number().int().min(1),
  settings: z.object({
    fastAnimations: z.boolean(),
    reduceMotion: z.boolean(),
  }),
  stats: z.object({
    /** Quick Play results per deck id (saved deck ids and pre-built ids). */
    quickPlay: z.record(z.string(), RecordSchema),
  }),
  ascension: z.object({ best: z.number().int().min(0) }),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type SavedDeck = z.infer<typeof SavedDeckSchema>;

export function newProfile(): Profile {
  return {
    schemaVersion: CURRENT_SCHEMA,
    xp: 0,
    level: 1,
    unlocks: [],
    decks: [],
    nextDeckId: 1,
    settings: { fastAnimations: false, reduceMotion: false },
    stats: { quickPlay: {} },
    ascension: { best: 0 },
  };
}
