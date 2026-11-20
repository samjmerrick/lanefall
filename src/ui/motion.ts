// One place for animation timing: the URL `?speed=` (tests and debugging) and the Fast animations setting.
import { useApp } from './app';
import { animationScale } from './settings';

/** Effective duration multiplier: URL speed × (Fast animations ? 0.5 : 1). Multiply every duration by it. */
export function durationScale(fastAnimations: boolean): number {
  return animationScale() * (fastAnimations ? 0.5 : 1);
}

/** The scale for the profile as it is now (for code outside React, such as the match store). */
export function currentScale(): number {
  return durationScale(useApp.getState().profile.settings.fastAnimations);
}

/** The scale as a hook, so components re-render when the setting changes. */
export function useDurationScale(): number {
  return durationScale(useApp((s) => s.profile.settings.fastAnimations));
}

/** Length of the opacity fade that replaces movement when Reduce motion is on, in seconds. */
export const FADE_SECONDS = 0.12;
