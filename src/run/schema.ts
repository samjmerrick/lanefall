// Zod schemas for what a saved run holds: its config and the choices made so far.
import { z } from 'zod';

export const RunConfigSchema = z.object({
  seed: z.number().int().min(0),
  heroId: z.string(),
  /** Card ids the player owned at run start; card rewards and shops draw from these. */
  pool: z.array(z.string()),
});

const index = z.number().int().min(0);

export const RunChoiceSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('move'), col: index }),
  z.object({ t: z.literal('matchEnd'), won: z.boolean() }),
  z.object({ t: z.literal('pick'), index: index.nullable() }),
  z.object({ t: z.literal('buy'), index }),
  z.object({ t: z.literal('removeCard'), index }),
  z.object({ t: z.literal('rest') }),
  z.object({ t: z.literal('leave') }),
  z.object({ t: z.literal('abandon') }),
]);

export type RunConfig = z.infer<typeof RunConfigSchema>;
export type RunChoice = z.infer<typeof RunChoiceSchema>;
