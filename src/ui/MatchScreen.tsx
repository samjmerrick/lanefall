import { ForecastLabel, Lanes, LaneStrip } from './Board';
import { CombatFx } from './CombatFx';
import { DragLayer, Hand } from './Hand';
import { HeroBar } from './HeroBar';
import { ErrorToast, MulliganOverlay, RevealBanner, ResultOverlay } from './Overlays';
import { AI, HUMAN } from './store';
import { dropClass, useDrag } from './drag';

export function MatchScreen() {
  const drag = useDrag((s) => s.drag);
  const dragging = drag?.moved ?? false;
  return (
    <main className={`match${dragging ? ' match--dragging' : ''}`} aria-label="Match">
      <HeroBar side={AI} />
      <div className={`board${drag?.targets.has('board') ? dropClass(drag, 'board') : ''}`} data-drop="board">
        <ForecastLabel />
        <Lanes side={AI} />
        <LaneStrip />
        <Lanes side={HUMAN} />
        <RevealBanner />
      </div>
      <HeroBar side={HUMAN} />
      <Hand />
      <CombatFx />
      <DragLayer />
      <MulliganOverlay />
      <ResultOverlay />
      <ErrorToast />
    </main>
  );
}
