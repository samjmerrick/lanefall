// URL options, mainly for tests and debugging: ?seed=123&speed=0.2
function param(name: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

export function urlSeed(): number | null {
  const v = param('seed');
  return v !== null && /^\d+$/.test(v) ? Number(v) : null;
}

/** Animation speed multiplier for durations (1 = normal, 0.5 = twice as fast). */
export function animationScale(): number {
  const v = Number(param('speed'));
  return Number.isFinite(v) && v > 0 ? v : 1;
}

export function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]!;
}
