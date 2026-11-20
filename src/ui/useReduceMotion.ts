import { useApp } from './app';

export function useReduceMotion(): boolean {
  const setting = useApp((s) => s.profile.settings.reduceMotion);
  let system = false;
  try {
    system = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    // no matchMedia: treat as no preference
  }
  return setting || system;
}
