import { CURRENT_SCHEMA, ProfileSchema, type Profile } from './profile';

/**
 * migrations[n] upgrades a save from schema n to n + 1. Add one per schema bump, each with a unit
 * test that loads a stored sample save of the old version (tests/fixtures/save-v<n>.json).
 */
export const migrations: Record<number, (old: Record<string, unknown>) => Record<string, unknown>> = {
  // v2 (M4): run stats per hero and the active run.
  1: (old) => {
    const stats = (old.stats ?? {}) as Record<string, unknown>;
    return { ...old, stats: { ...stats, runs: {} }, activeRun: null };
  },
  // v3 (M5): runs gained acts, elites and events, so a v2 run's choices no longer replay. It is dropped.
  2: (old) => ({ ...old, activeRun: null }),
};

/** Runs migrations in order up to the current schema, then validates. Throws if the save is invalid. */
export function migrate(raw: unknown): Profile {
  if (typeof raw !== 'object' || raw === null) throw new Error('Save is not an object');
  let data = raw as Record<string, unknown>;
  let version = data.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error('Save has no valid schemaVersion');
  }
  if (version > CURRENT_SCHEMA) throw new Error(`Save is from a newer version (schema ${version})`);
  while (version < CURRENT_SCHEMA) {
    const step = migrations[version];
    if (!step) throw new Error(`No migration from schema ${version}`);
    data = { ...step(data), schemaVersion: version + 1 };
    version += 1;
  }
  return ProfileSchema.parse(data);
}
