import { useShallow } from 'zustand/react/shallow';
import { AnimatePresence, motion } from 'motion/react';
import { getCard, getLaneEffect, LANES, type LaneIndex, type PlayerId } from '../engine';
import { CardEmblem } from './CardView';
import { dropClass, useDrag } from './drag';
import { AI, HUMAN, useMatch, type Fx } from './store';
import type { ViewUnit } from './view';

function FxFloat({ fx }: { fx: Fx[] }) {
  return (
    <AnimatePresence>
      {fx.map((f) => (
        <motion.span
          key={f.id}
          className={`fx fx--${f.kind}`}
          initial={{ opacity: 0, y: 4, scale: 0.8 }}
          animate={{ opacity: 1, y: -18, scale: 1.1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
        >
          {f.kind === 'damage' ? `−${f.amount}` : `+${f.amount}`}
        </motion.span>
      ))}
    </AnimatePresence>
  );
}

export function UnitToken({ unit }: { unit: ViewUnit }) {
  const card = getCard(unit.cardId);
  const fx = useMatch(
    useShallow((s) => s.fx.filter((f) => 'unit' in f.target && f.target.unit === unit.uid)),
  );
  const showDetail = useMatch((s) => s.showDetail);
  const drag = useDrag((s) => s.drag);
  const key = `unit:${unit.uid}`;
  const remaining = unit.health - unit.damage;
  return (
    <motion.div
      layout
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.4, opacity: 0, rotate: -8 }}
      transition={{ duration: 0.2 }}
      className={`token faction-${card.faction}${unit.barrier ? ' token--barrier' : ''}${
        card.keywords.includes('guard') ? ' token--guard' : ''
      }${dropClass(drag, key)}`}
      data-drop={key}
      data-uid={unit.uid}
      role="button"
      tabIndex={0}
      aria-label={`${card.name}, ${unit.power} power, ${remaining} health`}
      onClick={() => showDetail(unit.cardId)}
    >
      <CardEmblem id={card.id} faction={card.faction} />
      <span className="token__power">{unit.power}</span>
      <span className={`token__health${unit.damage > 0 ? ' token__health--hurt' : ''}`}>{remaining}</span>
      <FxFloat fx={fx} />
    </motion.div>
  );
}

function GhostToken({ uid, cardId, onTap }: { uid: number; cardId: string; onTap: () => void }) {
  const card = getCard(cardId);
  const drag = useDrag((s) => s.drag);
  // A planned unit can be the target of a friendly spell queued after it.
  const key = `unit:${uid}`;
  return (
    <button
      type="button"
      data-drop={key}
      className={`token token--ghost faction-${card.faction}${drag?.targets.has(key) ? dropClass(drag, key) : ''}`}
      aria-label={`Planned: ${card.name}. Tap to take back.`}
      onClick={onTap}
    >
      <CardEmblem id={card.id} faction={card.faction} />
      <span className="token__power">{card.power}</span>
      <span className="token__health">{card.health}</span>
    </button>
  );
}

function LaneGrid({ lane, side }: { lane: LaneIndex; side: PlayerId }) {
  const view = useMatch((s) => s.view);
  const game = useMatch((s) => s.game);
  const unplan = useMatch((s) => s.unplan);
  const active = useMatch((s) => s.activeLane === lane);
  const drag = useDrag((s) => s.drag);
  if (!view || !game) return null;
  const units = view.lanes[lane].slots[side];
  const plan = side === HUMAN ? game.players[HUMAN].plan : [];
  const laneKey = `lane:${lane}`;
  return (
    <div
      className={`lane-grid lane-grid--${side === HUMAN ? 'player' : 'opponent'}${active ? ' lane--active' : ''}${dropClass(drag, laneKey)}`}
      data-drop={laneKey}
      data-lane={lane}
    >
      {units.map((u, slot) => {
        const key = `slot:${lane}:${slot}`;
        const plannedIndex = plan.findIndex(
          (a) => a.type === 'playUnit' && a.lane === lane && a.slot === slot,
        );
        const planned = plannedIndex >= 0 ? plan[plannedIndex]! : null;
        const plannedUid = planned && planned.type === 'playUnit' ? planned.uid : undefined;
        const plannedCard =
          plannedUid !== undefined
            ? game.players[HUMAN].hand.find((h) => h.uid === plannedUid)?.cardId
            : undefined;
        return (
          <div
            key={slot}
            className={`slot slot--${side === HUMAN ? 'player' : 'opponent'}${side === HUMAN ? dropClass(drag, key) : ''}`}
            data-drop={side === HUMAN ? key : undefined}
            data-slot={slot}
          >
            <AnimatePresence>{u && <UnitToken key={u.uid} unit={u} />}</AnimatePresence>
            {!u && plannedCard && plannedUid !== undefined && (
              <GhostToken uid={plannedUid} cardId={plannedCard} onTap={() => unplan(plannedIndex)} />
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
  if (!view) return null;
  const l = view.lanes[lane];
  const effect = l.revealed ? getLaneEffect(l.effectId) : null;
  const power = (p: PlayerId) => l.slots[p].reduce((sum, u) => sum + (u?.power ?? 0), 0);
  const key = `lane:${lane}`;
  return (
    <div className={`lane-info${active ? ' lane-info--active' : ''}${dropClass(drag, key)}`} data-drop={key}>
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

export function LaneStrip() {
  return (
    <section className="lane-strip" data-zone="lane-strip" aria-label="Lane effects">
      {LANES.map((lane) => (
        <LaneInfo key={lane} lane={lane} />
      ))}
    </section>
  );
}
