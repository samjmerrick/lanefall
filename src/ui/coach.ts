// What the tutorial coach asks for right now, for the screens that highlight and gate it.
import { requiredAction, TUTORIAL, type TutorialStep } from '../run';
import { dropKey } from './drag';
import { useMatch } from './store';

/** The current coach step, or undefined outside the tutorial. */
export function useCoachStep(): TutorialStep | undefined {
  return useMatch((s) => (s.mode === 'tutorial' ? TUTORIAL.steps[s.tutorialStep] : undefined));
}

/** The drop zone the current step wants a card dropped on ('board' for an untargeted spell). */
export function useCoachKey(): string | null {
  const step = useCoachStep();
  const game = useMatch((s) => s.game);
  if (!step || !game) return null;
  const action = requiredAction(step, game);
  return action ? dropKey(action) : null;
}
