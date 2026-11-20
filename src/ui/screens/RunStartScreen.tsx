import { useState } from 'react';
import { getCard } from '../../engine';
import { starterHeroes } from '../../run';
import { GLYPHS } from '../factions';
import { useRun } from '../runStore';
import { ScreenFrame } from './common';

export function RunStartScreen() {
  const heroes = starterHeroes();
  const [heroId, setHeroId] = useState(heroes[0]!.id);
  const begin = useRun((s) => s.begin);
  return (
    <ScreenFrame
      title="New run"
      footer={
        <button type="button" className="primary wide" onClick={() => begin(heroId)}>
          Begin run
        </button>
      }
    >
      <p className="hint">
        Clear the map and beat the act boss. You have 3 Hearts; each lost match costs one.
      </p>
      <h2 className="label">Choose a hero</h2>
      <div className="list" role="radiogroup" aria-label="Hero">
        {heroes.map((h) => (
          <button
            key={h.id}
            type="button"
            role="radio"
            aria-checked={h.id === heroId}
            className={`list__row hero-row faction-${h.faction}${h.id === heroId ? ' list__row--on' : ''}`}
            onClick={() => setHeroId(h.id)}
          >
            <span className="hero-row__glyph" aria-hidden>
              {GLYPHS[h.faction]}
            </span>
            <span className="hero-row__text">
              <span className="hero-row__name">
                {h.name} <span className="hero-row__title">· {h.title}</span>
              </span>
              <span className="hero-row__passive">{h.passive}</span>
              <span className="hero-row__deck">
                Starter deck: {h.starterDeck.length} {getCard(h.starterDeck[0]!).faction} cards
              </span>
            </span>
          </button>
        ))}
      </div>
    </ScreenFrame>
  );
}
