import { get, set } from 'idb-keyval';
import type { KeyValueStore } from './slots';

export * from './profile';
export * from './slots';
export * from './code';
export { migrate } from './migrations';

/** The browser's IndexedDB, through idb-keyval. */
export const idbStore: KeyValueStore = { get, set };

export type PersistStatus = 'granted' | 'denied' | 'unsupported';

/** Asks the browser not to evict our storage. Safe to call on every launch. */
export async function requestPersistence(): Promise<PersistStatus> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return 'unsupported';
  try {
    if (await navigator.storage.persisted()) return 'granted';
    return (await navigator.storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
}
