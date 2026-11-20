import { getCard, type Faction } from '../engine';
import { GLYPHS } from './factions';
import { emblemFor, polygonPoints } from './emblem';

export function CardEmblem({ id, faction }: { id: string; faction: Faction }) {
  const e = emblemFor(id);
  return (
    <svg className="emblem" viewBox="0 0 100 100" aria-hidden="true">
      {Array.from({ length: e.rings }, (_, i) => (
        <polygon
          key={i}
          points={polygonPoints(e.sides, 42 - i * 12, e.rotation + i * 15)}
          className="emblem__ring"
        />
      ))}
      <polygon points={polygonPoints(e.inner, 10, e.rotation)} className="emblem__core" />
      <text x="50" y="58" className="emblem__glyph" textAnchor="middle">
        {GLYPHS[faction]}
      </text>
    </svg>
  );
}

export function CardView({ cardId, size = 'hand' }: { cardId: string; size?: 'hand' | 'large' }) {
  const card = getCard(cardId);
  const isUnit = card.type === 'unit';
  return (
    <div
      className={`card card--${size} faction-${card.faction}`}
      aria-label={card.name}
      data-card-id={cardId}
    >
      <span className="card__cost" aria-label={`Cost ${card.cost}`}>
        {card.cost}
      </span>
      <div className="card__art">
        <CardEmblem id={card.id} faction={card.faction} />
      </div>
      <span className="card__name">{card.name}</span>
      {size === 'large' && <p className="card__text">{card.text || 'No abilities.'}</p>}
      {isUnit ? (
        <>
          <span className="card__power">{card.power}</span>
          <span className="card__health">{card.health}</span>
        </>
      ) : (
        <span className="card__type">Spell</span>
      )}
    </div>
  );
}
