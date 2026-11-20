// Haptics and sound. Both are optional extras: every call is a no-op when the setting is off or the
// browser lacks the API (iOS has no vibrate; jsdom and Playwright have no AudioContext in practice).
import { useApp } from './app';

export type HapticKind = 'tap' | 'play' | 'hit' | 'heroHit' | 'win' | 'lose';
export type SfxKind = 'tap' | 'play' | 'reveal' | 'hit' | 'heroHit' | 'death' | 'win' | 'lose' | 'levelUp';

const HAPTIC_PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  play: 15,
  hit: 10,
  heroHit: [30, 40, 30],
  win: [20, 60, 20, 60, 40],
  lose: [80, 60, 120],
};

/** Minimum gap between two sounds or buzzes of the same kind, in ms. */
export const THROTTLE_MS = 40;

const lastPlayed = new Map<string, number>();

/** True if `key` may fire now; records the time when it may. */
export function allow(key: string, now: number): boolean {
  const last = lastPlayed.get(key);
  if (last !== undefined && now - last < THROTTLE_MS) return false;
  lastPlayed.set(key, now);
  return true;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

export function haptic(kind: HapticKind): void {
  if (!useApp.getState().profile.settings.haptics) return;
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    if (!allow(`h:${kind}`, now())) return;
    navigator.vibrate(HAPTIC_PATTERNS[kind]);
  } catch {
    // Vibration can be blocked by the browser; ignore.
  }
}

// ---------- Sound: short synthesised tones ----------

interface Note {
  /** Start frequency in Hz. */
  f: number;
  /** End frequency, for a slide. */
  to?: number;
  /** Seconds after the sound starts. */
  at: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
}

const SOUNDS: Record<SfxKind, Note[]> = {
  tap: [{ f: 520, at: 0, dur: 0.05, type: 'triangle', gain: 0.5 }],
  play: [{ f: 330, to: 440, at: 0, dur: 0.09, type: 'triangle' }],
  reveal: [{ f: 600, to: 900, at: 0, dur: 0.1, type: 'sine', gain: 0.6 }],
  hit: [{ f: 180, to: 90, at: 0, dur: 0.08, type: 'square', gain: 0.5 }],
  heroHit: [{ f: 140, to: 60, at: 0, dur: 0.22, type: 'sawtooth', gain: 0.7 }],
  death: [{ f: 300, to: 70, at: 0, dur: 0.2, type: 'triangle', gain: 0.7 }],
  win: [
    { f: 523, at: 0, dur: 0.14 },
    { f: 659, at: 0.14, dur: 0.14 },
    { f: 784, at: 0.28, dur: 0.14 },
    { f: 1047, at: 0.42, dur: 0.3 },
  ],
  lose: [
    { f: 392, at: 0, dur: 0.2, type: 'triangle' },
    { f: 330, at: 0.2, dur: 0.2, type: 'triangle' },
    { f: 262, at: 0.4, dur: 0.35, type: 'triangle' },
  ],
  levelUp: [
    { f: 440, at: 0, dur: 0.1 },
    { f: 554, at: 0.1, dur: 0.1 },
    { f: 659, at: 0.2, dur: 0.1 },
    { f: 880, at: 0.3, dur: 0.25 },
  ],
};

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Creates or resumes the AudioContext. Browsers only allow this after a user gesture. */
export function unlockAudio(): void {
  try {
    const c = context();
    if (c && c.state === 'suspended') void c.resume();
  } catch {
    // ignore
  }
}

if (typeof window !== 'undefined') {
  const once = () => {
    unlockAudio();
    window.removeEventListener('pointerdown', once, true);
    window.removeEventListener('keydown', once, true);
  };
  window.addEventListener('pointerdown', once, true);
  window.addEventListener('keydown', once, true);
}

export function sfx(kind: SfxKind): void {
  if (!useApp.getState().profile.settings.sound) return;
  try {
    const c = context();
    if (!c || c.state !== 'running') return;
    if (!allow(`s:${kind}`, now())) return;
    const t0 = c.currentTime;
    for (const n of SOUNDS[kind]) {
      const osc = c.createOscillator();
      const amp = c.createGain();
      const start = t0 + n.at;
      const peak = 0.12 * (n.gain ?? 1);
      osc.type = n.type ?? 'sine';
      osc.frequency.setValueAtTime(n.f, start);
      if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, start + n.dur);
      amp.gain.setValueAtTime(0.0001, start);
      amp.gain.exponentialRampToValueAtTime(peak, start + 0.01);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + n.dur);
      osc.connect(amp).connect(c.destination);
      osc.start(start);
      osc.stop(start + n.dur + 0.02);
    }
  } catch {
    // Audio failures must never affect play.
  }
}
