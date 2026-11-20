import { emblemFor, polygonPoints } from './emblem';
import type { FactionId, PlaceholderCard } from './placeholder';

const GLYPHS: Record<FactionId, string> = {
  ember: '▲',
  tide: '≈',
  grove: '♣',
  bastion: '■',
  dusk: '◐',
};

export function CardEmblem({ id, faction }: { id: string; faction: FactionId }) {
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

export function CardView({ card }: { card: PlaceholderCard }) {
  const isUnit = card.power !== undefined;
  return (
    <div className={`card faction-${card.faction}`} aria-label={card.name}>
      <span className="card__cost">{card.cost}</span>
      <div className="card__art">
        <CardEmblem id={card.id} faction={card.faction} />
      </div>
      <span className="card__name">{card.name}</span>
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

export function UnitToken({ card }: { card: PlaceholderCard }) {
  return (
    <div className={`token faction-${card.faction}`} aria-label={card.name}>
      <CardEmblem id={card.id} faction={card.faction} />
      <span className="token__power">{card.power}</span>
      <span className="token__health">{card.health}</span>
    </div>
  );
}
