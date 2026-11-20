import { useApp } from '../app';

export function MenuScreen() {
  const go = useApp((s) => s.go);
  const profile = useApp((s) => s.profile);
  const fellBack = useApp((s) => s.fellBack);
  return (
    <main className="menu" aria-label="Main menu">
      <header className="menu__header">
        <h1>Lanefall</h1>
        <p>Three lanes. Hidden plans. Overflow wins.</p>
        <p className="menu__xp">
          Level {profile.level} · {profile.xp} XP
        </p>
      </header>
      {fellBack && (
        <p className="notice" role="status">
          Your latest save was damaged, so the previous one was loaded.
        </p>
      )}
      <nav className="menu__nav">
        <button type="button" className="primary" onClick={() => go('quickplay')}>
          Quick Play
        </button>
        <button type="button" className="secondary" onClick={() => go('decks')}>
          Decks
        </button>
        <button type="button" className="secondary" onClick={() => go('collection')}>
          Collection
        </button>
        <button type="button" className="secondary" onClick={() => go('settings')}>
          Settings
        </button>
      </nav>
    </main>
  );
}
