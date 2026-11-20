import type React from 'react';
import { CardView, UnitToken } from './CardView';
import { HAND, LANES, OPPONENT_UNITS, PLAYER_UNITS, type PlaceholderCard } from './placeholder';

function lanePower(units: (PlaceholderCard | null)[]): number {
  return units.reduce((sum, u) => sum + (u?.power ?? 0), 0);
}

function LaneGrid({ units, side }: { units: (PlaceholderCard | null)[]; side: 'opponent' | 'player' }) {
  return (
    <div className={`lane-grid lane-grid--${side}`}>
      {units.map((u, i) => (
        <div key={i} className={`slot slot--${side}`}>
          {u && <UnitToken card={u} />}
        </div>
      ))}
    </div>
  );
}

function HeroBar({
  side,
  hp,
  mana,
  maxMana,
  reserve,
  hand,
  deck,
}: {
  side: 'opponent' | 'player';
  hp: number;
  mana: number;
  maxMana: number;
  reserve: number;
  hand?: number;
  deck: number;
}) {
  return (
    <div className={`hero-bar hero-bar--${side}`} data-zone={`${side}-bar`}>
      <span className="hero-bar__hp" aria-label="Hero HP">
        ♥ {hp}
      </span>
      <span className="hero-bar__mana" aria-label="Mana">
        ◆ {mana}/{maxMana}
      </span>
      <span className="hero-bar__reserve" aria-label="Reserve mana">
        {Array.from({ length: 2 }, (_, i) => (
          <span key={i} className={`pip${i < reserve ? ' pip--on' : ''}`} />
        ))}
      </span>
      {hand !== undefined && <span className="hero-bar__stat">✋ {hand}</span>}
      <span className="hero-bar__stat">▤ {deck}</span>
      {side === 'player' && (
        <button type="button" className="end-turn">
          End Turn
        </button>
      )}
    </div>
  );
}

export function MatchScreen() {
  const n = HAND.length;
  return (
    <main className="match" aria-label="Match">
      <HeroBar side="opponent" hp={20} mana={3} maxMana={3} reserve={0} hand={5} deck={22} />

      <section className="lanes lanes--opponent" data-zone="opponent-lanes" aria-label="Opponent lanes">
        {LANES.map((lane) => (
          <LaneGrid key={lane.id} units={OPPONENT_UNITS[lane.id] ?? []} side="opponent" />
        ))}
      </section>

      <section className="lane-strip" data-zone="lane-strip" aria-label="Lane effects">
        {LANES.map((lane) => (
          <div key={lane.id} className="lane-info">
            <span className="lane-info__power lane-info__power--opponent">
              {lanePower(OPPONENT_UNITS[lane.id] ?? [])}
            </span>
            <span className="lane-info__effect">
              <span aria-hidden="true">{lane.icon}</span> {lane.effect}
            </span>
            <span className="lane-info__power lane-info__power--player">
              {lanePower(PLAYER_UNITS[lane.id] ?? [])}
            </span>
          </div>
        ))}
      </section>

      <section className="lanes lanes--player" data-zone="player-lanes" aria-label="Your lanes">
        {LANES.map((lane) => (
          <LaneGrid key={lane.id} units={PLAYER_UNITS[lane.id] ?? []} side="player" />
        ))}
      </section>

      <HeroBar side="player" hp={20} mana={3} maxMana={3} reserve={1} deck={21} />

      <section className="hand" data-zone="hand" aria-label="Your hand">
        {HAND.map((card, i) => {
          const offset = i - (n - 1) / 2;
          return (
            <div
              key={card.id}
              className="hand__slot"
              style={
                {
                  '--offset': offset,
                  '--abs-offset': Math.abs(offset),
                  '--gaps': Math.max(1, n - 1),
                  zIndex: i,
                } as React.CSSProperties
              }
            >
              <CardView card={card} />
            </div>
          );
        })}
      </section>
    </main>
  );
}
