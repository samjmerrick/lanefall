// The damage counter that travels through a lane's combat. Pure presentation: the store decides where
// each counter is and what it shows, driven by the engine's events; this only draws it there.
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from './app';
import { animationScale } from './settings';
import { useMatch, type CombatCounter, type CounterTarget } from './store';

function selectorFor(t: CounterTarget): string {
  switch (t.type) {
    case 'strip':
      return `[data-strip="${t.lane}"]`;
    case 'unit':
      return `[data-uid="${t.uid}"]`;
    case 'hero':
      return `[data-hero="${t.player}"]`;
  }
}

function centreOf(t: CounterTarget): { x: number; y: number } | null {
  const el = document.querySelector(selectorFor(t));
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function useReduceMotion(): boolean {
  const setting = useApp((s) => s.profile.settings.reduceMotion);
  let system = false;
  try {
    system = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    // no matchMedia: treat as no preference
  }
  return setting || system;
}

function Counter({ c, sibling, reduce }: { c: CombatCounter; sibling: boolean; reduce: boolean }) {
  const at = centreOf(c.target);
  if (!at) return null;
  // Normal and Pierce counters sit side by side so both stay readable.
  const dx = sibling ? (c.kind === 'power' ? -13 : 15) : 0;
  const x = at.x + dx;
  const y = at.y;
  const dur = 0.22 * animationScale();
  return (
    <motion.span
      className={`combat-counter combat-counter--${c.kind} combat-counter--${c.attacker === 0 ? 'player' : 'opponent'}${c.value === 0 ? ' combat-counter--spent' : ''}`}
      initial={reduce ? { opacity: 0, x, y } : { opacity: 0, scale: 0.6, x, y }}
      animate={{ opacity: 1, scale: 1, x, y }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.12 } }}
      transition={{ duration: reduce ? 0.12 : dur, ease: 'easeOut' }}
      aria-hidden="true"
    >
      {c.kind === 'pierce' ? `✦${c.value}` : c.value}
    </motion.span>
  );
}

export function CombatFx() {
  const counters = useMatch((s) => s.counters);
  const reduce = useReduceMotion();
  const hasBoth = counters.some((c) => c.kind === 'power') && counters.some((c) => c.kind === 'pierce');
  return (
    <div className="combat-fx" aria-hidden="true">
      <AnimatePresence>
        {counters.map((c) => (
          // Reduce motion: a new key at every stop makes the counter fade in at the stop instead of travelling.
          <Counter key={reduce ? `${c.id}:${c.stop}` : c.id} c={c} sibling={hasBoth} reduce={reduce} />
        ))}
      </AnimatePresence>
    </div>
  );
}
