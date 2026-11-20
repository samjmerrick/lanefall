/**
 * Seeded pseudo-random generator (mulberry32). The state is a single uint32 so it
 * serialises into GameState as plain JSON.
 */
export type RngState = number;

export function seedRng(seed: number): RngState {
  return seed >>> 0;
}

/** Returns a float in [0, 1) and the next state. Pure: never mutates its input. */
export function nextFloat(state: RngState): [value: number, next: RngState] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

/** Returns an integer in [min, max] inclusive and the next state. */
export function nextInt(state: RngState, min: number, max: number): [value: number, next: RngState] {
  const [f, next] = nextFloat(state);
  return [min + Math.floor(f * (max - min + 1)), next];
}
