import { useApp } from '../app';
import { ScreenFrame } from './common';

export function CorruptScreen() {
  const raw = useApp((s) => s.corruptRaw);
  const reset = useApp((s) => s.resetProfile);
  return (
    <ScreenFrame title="Save problem" back={null}>
      <p>Both save slots are damaged, so your progress could not be loaded.</p>
      <p className="hint">
        The damaged data below is kept on this device when you start fresh. Copy it if you want to try to
        recover it.
      </p>
      <textarea
        className="code code--area"
        readOnly
        aria-label="Damaged save data"
        value={JSON.stringify(raw)}
      />
      <button type="button" className="primary wide" onClick={reset}>
        Start a new save
      </button>
    </ScreenFrame>
  );
}
