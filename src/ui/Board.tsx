import { useShallow } from 'zustand/react/shallow';
import { AnimatePresence, motion } from 'motion/react';
import {
  getCard,
  getLaneEffect,
  LANES,
  soakOrder,
  type LaneIndex,
  type PlayerId,
  type UnitForecast,
} from '../engine';
import { CardEmblem } from './CardView';
import { dropClass, useDrag } from './drag';
import { AI, HUMAN, useMatch, type Fx } from './store';
import { useForecast } from './forecast';
import { FADE_SECONDS, useDurationScale } from './motion';
import { useReduceMotion } from './useReduceMotion';
import type { ViewUnit } from './view';

function FxFloat({ fx }: { fx: Fx[] }) {
  const reduce = useReduceMotion();
  const scale = useDurationScale();
  return (
    <AnimatePresence>
      {fx.map((f) => (
        <motion.span
          key={f.id}
          className={`fx fx--${f.kind}`}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.8 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: -18, scale: 1.1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: (reduce ? FADE_SECONDS : 0.45) * scale }}
        >
          {f.kind === 'damage' ? `−${f.amount}` : `+${f.amount}`}
        </motion.span>
      ))}
    </AnimatePresence>
  );
}

function ShieldGlyph() {
  return (
    <svg className="badge__shield" viewBox="0 0 10 12" aria-hidden="true">
      <path d="M5 0.5 9.5 2v4.2C9.5 8.9 7.6 10.8 5 11.5 2.4 10.8 0.5 8.9 0.5 6.2V2z" fill="currentColor" />
    </svg>
  );
}

function BarrierGlyph() {
  return (
    <svg className="loss__barrier" viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2 10 10 2" stroke="#ff6b6b" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function forecastText(f: UnitForecast | undefined): string {
  if (!f) return '';
  if (f.barrier) return ', forecast: Barrier absorbs the hit';
  return `, forecast: takes ${f.damage} damage${f.dies ? ' and dies' : ''}`;
}

/** Soak position (top left) and forecast loss (above the health number) on a unit or planned unit. */
function TokenMarks({
  rank,
  guard,
  forecast,
}: {
  rank: number | null;
  guard: boolean;
  forecast?: UnitForecast;
}) {
  return (
    <>
      {rank !== null && (
        <span
          className={`badge${guard ? ' badge--guard' : ''}`}
          title={guard ? `Guard: takes damage in position ${rank}` : `Takes damage in position ${rank}`}
        >
          {guard && <ShieldGlyph />}
          {rank}
        </span>
      )}
      {forecast && (
        <span
          className={`loss${forecast.dies ? ' loss--dies' : ''}${forecast.barrier ? ' loss--barrier' : ''}`}
        >
          {forecast.barrier ? (
            <BarrierGlyph />
          ) : (
            <>
              {forecast.dies && <span aria-hidden="true">☠</span>}
              <span>−{forecast.damage}</span>
            </>
          )}
        </span>
      )}
    </>
  );
}

export function UnitToken({
  unit,
  rank,
  forecast,
}: {
  unit: ViewUnit;
  rank: number | null;
  forecast?: UnitForecast;
}) {
  const card = getCard(unit.cardId);
  const fx = useMatch(
    useShallow((s) => s.fx.filter((f) => 'unit' in f.target && f.target.unit === unit.uid)),
  );
  const showDetail = useMatch((s) => s.showDetail);
  const drag = useDrag((s) => s.drag);
  const reduce = useReduceMotion();
  const scale = useDurationScale();
  const key = `unit:${unit.uid}`;
  const remaining = unit.health - unit.damage;
  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
      animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
      exit={reduce ? { opacity: 0 } : { scale: 0.4, opacity: 0, rotate: -8 }}
      transition={{ duration: (reduce ? FADE_SECONDS : 0.2) * scale }}
      className={`token faction-${card.faction}${unit.barrier ? ' token--barrier' : ''}${
        unit.guard ? ' token--guard' : ''
      }${dropClass(drag, key)}`}
      data-drop={key}
      data-uid={unit.uid}
      role="button"
      tabIndex={0}
      aria-label={`${card.name}, ${unit.power} power, ${remaining} health${forecastText(forecast)}`}
      onClick={() => showDetail(unit.cardId)}
    >
      <CardEmblem id={card.id} faction={card.faction} />
      <span className="token__power">{unit.power}</span>
      <span className={`token__health${unit.damage > 0 ? ' token__health--hurt' : ''}`}>{remaining}</span>
      <TokenMarks rank={rank} guard={unit.guard} forecast={forecast} />
      <FxFloat fx={fx} />
    </motion.div>
  );
}

function GhostToken({
  uid,
  cardId,
  rank,
  forecast,
  onTap,
}: {
  uid: number;
  cardId: string;
  rank: number | null;
  forecast?: UnitForecast;
  onTap: () => void;
}) {
  const card = getCard(cardId);
  const drag = useDrag((s) => s.drag);
  // A planned unit can be the target of a friendly spell queued after it.
  const key = `unit:${uid}`;
  return (
    <button
      type="button"
      data-drop={key}
      className={`token token--ghost faction-${card.faction}${drag?.targets.has(key) ? dropClass(drag, key) : ''}`}
      aria-label={`Planned: ${card.name}${forecastText(forecast)}. Tap to take back.`}
      onClick={onTap}
    >
      <CardEmblem id={card.id} faction={card.faction} />
      <span className="token__power">{card.power}</span>
      <span className="token__health">{card.health}</span>
      <TokenMarks rank={rank} guard={card.keywords.includes('guard')} forecast={forecast} />
    </button>
  );
}

function LaneGrid({ lane, side }: { lane: LaneIndex; side: PlayerId }) {
  const view = useMatch((s) => s.view);
  const game = useMatch((s) => s.game);
  const unplan = useMatch((s) => s.unplan);
  const active = useMatch((s) => s.activeLane === lane);
  const drag = useDrag((s) => s.drag);
  const forecast = useForecast();
  if (!view || !game) return null;
  const units = view.lanes[lane].slots[side];
  const plan = side === HUMAN ? game.players[HUMAN].plan : [];
  const laneKey = `lane:${lane}`;

  // What stands in each slot: a unit, or (on your side) a planned unit that is not on the board yet.
  const planned = units.map((u, slot) => {
    if (u) return null;
    const index = plan.findIndex((a) => a.type === 'playUnit' && a.lane === lane && a.slot === slot);
    const action = index >= 0 ? plan[index]! : null;
    if (!action || action.type !== 'playUnit') return null;
    const cardId = game.players[HUMAN].hand.find((h) => h.uid === action.uid)?.cardId;
    return cardId ? { index, uid: action.uid, cardId } : null;
  });
  // Soak order of this side, planned units included. Only worth showing with two or more.
  const entries = units.flatMap((u, slot) => {
    const p = planned[slot];
    if (u) return [{ slot, guard: u.guard }];
    if (p) return [{ slot, guard: getCard(p.cardId).keywords.includes('guard') }];
    return [];
  });
  const rankOf = (slot: number): number | null => {
    if (entries.length < 2) return null;
    const i = soakOrder(entries).findIndex((e) => e.slot === slot);
    return i >= 0 ? i + 1 : null;
  };

  return (
    <div
      className={`lane-grid lane-grid--${side === HUMAN ? 'player' : 'opponent'}${active ? ' lane--active' : ''}${dropClass(drag, laneKey)}`}
      data-drop={laneKey}
      data-lane={lane}
    >
      {units.map((u, slot) => {
        const key = `slot:${lane}:${slot}`;
        const p = planned[slot];
        return (
          <div
            key={slot}
            className={`slot slot--${side === HUMAN ? 'player' : 'opponent'}${slot < 2 ? ' slot--front' : ''}${side === HUMAN ? dropClass(drag, key) : ''}`}
            data-drop={side === HUMAN ? key : undefined}
            data-slot={slot}
          >
            <AnimatePresence>
              {u && <UnitToken key={u.uid} unit={u} rank={rankOf(slot)} forecast={forecast?.units[u.uid]} />}
            </AnimatePresence>
            {p && (
              <GhostToken
                uid={p.uid}
                cardId={p.cardId}
                rank={rankOf(slot)}
                forecast={forecast?.units[p.uid]}
                onTap={() => unplan(p.index)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function LaneInfo({ lane }: { lane: LaneIndex }) {
  const view = useMatch((s) => s.view);
  const active = useMatch((s) => s.activeLane === lane);
  const drag = useDrag((s) => s.drag);
  const forecast = useForecast();
  if (!view) return null;
  const l = view.lanes[lane];
  const effect = l.revealed ? getLaneEffect(l.effectId) : null;
  const power = (p: PlayerId) => l.slots[p].reduce((sum, u) => sum + (u?.power ?? 0), 0);
  const key = `lane:${lane}`;
  const toOpponent = forecast?.hero[AI][lane] ?? 0;
  const toYou = forecast?.hero[HUMAN][lane] ?? 0;
  return (
    <div
      className={`lane-info${active ? ' lane-info--active' : ''}${dropClass(drag, key)}`}
      data-drop={key}
      data-strip={lane}
    >
      <span className="lane-info__powers">
        <span className="lane-info__power lane-info__power--opponent" aria-label="Opponent lane power">
          {power(AI)}
        </span>
        <span className="lane-info__power lane-info__power--player" aria-label="Your lane power">
          {power(HUMAN)}
        </span>
      </span>
      <span className="lane-info__effect" title={effect?.text}>
        {effect ? (
          <>
            <strong>{effect.name}</strong>
            <span>{effect.text}</span>
          </>
        ) : (
          <span className="lane-info__hidden">Revealed round {lane + 1}</span>
        )}
      </span>
      {(toOpponent > 0 || toYou > 0) && (
        <span className="lane-info__hero">
          {toOpponent > 0 && (
            <span
              className="hero-hit hero-hit--opponent"
              aria-label={`Forecast: ${toOpponent} damage to opponent`}
            >
              ▲{toOpponent}
            </span>
          )}
          {toYou > 0 && (
            <span className="hero-hit hero-hit--player" aria-label={`Forecast: ${toYou} damage to you`}>
              ▼{toYou}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

export function Lanes({ side }: { side: PlayerId }) {
  return (
    <section
      className={`lanes lanes--${side === HUMAN ? 'player' : 'opponent'}`}
      data-zone={side === HUMAN ? 'player-lanes' : 'opponent-lanes'}
      aria-label={side === HUMAN ? 'Your lanes' : 'Opponent lanes'}
    >
      {LANES.map((lane) => (
        <LaneGrid key={lane} lane={lane} side={side} />
      ))}
    </section>
  );
}

/** Says what the forecast leaves out. Sits on the top edge of the board, clear of the lane strip's arrows. */
export function ForecastLabel() {
  const forecast = useForecast();
  return forecast ? <span className="forecast-label">Forecast · before reveal effects</span> : null;
}

export function LaneStrip() {
  return (
    <section className="lane-strip" data-zone="lane-strip" aria-label="Lane effects">
      {LANES.map((lane) => (
        <LaneInfo key={lane} lane={lane} />
      ))}
    </section>
  );
}
