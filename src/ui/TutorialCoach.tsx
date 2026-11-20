import { motion } from 'motion/react';
import { FADE_SECONDS, useDurationScale } from './motion';
import { useCoachStep } from './coach';
import { useMatch } from './store';
import { useReduceMotion } from './useReduceMotion';

/** The tutorial's coach banner: one short instruction, with Next on steps that only explain. */
export function TutorialCoach() {
  const step = useCoachStep();
  const index = useMatch((s) => s.tutorialStep);
  const over = useMatch((s) => s.game?.phase === 'over');
  const next = useMatch((s) => s.tutorialNext);
  const reduce = useReduceMotion();
  const scale = useDurationScale();
  if (!step || over) return null;
  return (
    <motion.div
      key={index}
      className="coach"
      data-testid="coach"
      data-step={step.kind}
      role="status"
      aria-live="polite"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: (reduce ? FADE_SECONDS : 0.25) * scale }}
    >
      <p className="coach__text">{step.text}</p>
      {step.kind === 'info' && (
        <button type="button" className="primary coach__next" data-testid="coach-next" onClick={next}>
          Next
        </button>
      )}
    </motion.div>
  );
}
