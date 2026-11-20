import type { Difficulty } from '../ai';
import { CardView } from './CardView';
import { GLYPHS } from './factions';
import { PLAYABLE_FACTIONS } from './decks';
import { useMatch } from './store';

const FACTION_INFO = {
  ember: { name: 'Ember', style: 'Aggro: cheap units and direct hero damage.', sample: 'ember-blaze-runner' },
  bastion: {
    name: 'Bastion',
    style: 'Swarm: many small units, buffs and healing.',
    sample: 'bastion-wall-warden',
  },
} as const;

const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'normal', label: 'Normal' },
];

export function SetupScreen() {
  const faction = useMatch((s) => s.faction);
  const difficulty = useMatch((s) => s.difficulty);
  const setFaction = useMatch((s) => s.setFaction);
  const setDifficulty = useMatch((s) => s.setDifficulty);
  const start = useMatch((s) => s.startMatch);
  return (
    <main className="setup" aria-label="New match">
      <header className="setup__header">
        <h1>Lanefall</h1>
        <p>Three lanes. Hidden plans. Overflow wins.</p>
      </header>
      <h2 className="setup__label">Your deck</h2>
      <div className="setup__decks" role="radiogroup" aria-label="Your deck">
        {PLAYABLE_FACTIONS.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={faction === f}
            className={`deck-choice faction-${f}${faction === f ? ' deck-choice--on' : ''}`}
            onClick={() => setFaction(f)}
          >
            <CardView cardId={FACTION_INFO[f].sample} />
            <span className="deck-choice__name">
              {GLYPHS[f]} {FACTION_INFO[f].name}
            </span>
            <span className="deck-choice__style">{FACTION_INFO[f].style}</span>
          </button>
        ))}
      </div>
      <h2 className="setup__label">Opponent</h2>
      <div className="segmented" role="radiogroup" aria-label="AI difficulty">
        {DIFFICULTIES.map((d) => (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={difficulty === d.id}
            className={difficulty === d.id ? 'segmented--on' : ''}
            onClick={() => setDifficulty(d.id)}
          >
            {d.label}
          </button>
        ))}
      </div>
      <button type="button" className="primary setup__start" onClick={() => void start()}>
        Start match
      </button>
    </main>
  );
}
