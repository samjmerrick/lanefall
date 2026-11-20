import type React from 'react';
import { useEffect } from 'react';
import { getCard, legalActions, type PlannedAction } from '../engine';
import { CardView } from './CardView';
import { dropKey, keyAt, useDrag } from './drag';
import { HUMAN, useMatch } from './store';

const TAP_SLOP = 8;
const LIFT = 70;

function laneName(lane: number) {
  return ['Left', 'Centre', 'Right'][lane];
}

function describeTarget(a: PlannedAction, unitName: (uid: number) => string): string {
  if (a.type !== 'playSpell') return '';
  if (a.target.kind === 'lane') return ` → ${laneName(a.target.lane)}`;
  if (a.target.kind === 'unit') return ` → ${unitName(a.target.uid)}`;
  return '';
}

/** Spells queued this turn, shown above the hand; tap one to take it back. */
function QueuedSpells() {
  const game = useMatch((s) => s.game);
  const view = useMatch((s) => s.view);
  const unplan = useMatch((s) => s.unplan);
  if (!game || !view) return null;
  const hand = game.players[HUMAN].hand;
  const unitName = (uid: number) => {
    for (const lane of view.lanes)
      for (const side of lane.slots) for (const u of side) if (u?.uid === uid) return getCard(u.cardId).name;
    return 'unit';
  };
  const spells = game.players[HUMAN].plan
    .map((a, index) => ({ a, index }))
    .filter(({ a }) => a.type === 'playSpell');
  if (spells.length === 0) return null;
  return (
    <div className="queued" aria-label="Queued spells">
      {spells.map(({ a, index }) => {
        const card = hand.find((h) => h.uid === a.uid);
        return (
          <button key={a.uid} type="button" className="queued__chip" onClick={() => unplan(index)}>
            {card ? getCard(card.cardId).name : '?'}
            {describeTarget(a, unitName)} ✕
          </button>
        );
      })}
    </div>
  );
}

export function Hand() {
  const game = useMatch((s) => s.game);
  const busy = useMatch((s) => s.busy);
  const play = useMatch((s) => s.play);
  const showDetail = useMatch((s) => s.showDetail);
  const drag = useDrag((s) => s.drag);
  const setDrag = useDrag((s) => s.set);

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const d = useDrag.getState().drag;
      if (!d) return;
      const moved = d.moved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > TAP_SLOP;
      setDrag({
        ...d,
        x: e.clientX,
        y: e.clientY,
        moved,
        hover: moved ? keyAt(e.clientX, e.clientY - LIFT, d.targets) : null,
      });
    };
    const up = (e: PointerEvent) => {
      const d = useDrag.getState().drag;
      setDrag(null);
      if (!d) return;
      if (!d.moved) {
        showDetail(d.cardId);
        return;
      }
      const key = keyAt(e.clientX, e.clientY - LIFT, d.targets);
      const action = key ? d.targets.get(key) : undefined;
      if (action) play(action);
    };
    const cancel = () => setDrag(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [drag !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!game) return null;
  const me = game.players[HUMAN];
  const plannedUids = new Set(me.plan.map((a) => a.uid));
  const cards = me.hand.filter((h) => !plannedUids.has(h.uid));
  const n = cards.length;
  const canPlan = game.phase === 'plan' && !me.ready && !busy;
  const legal = canPlan ? legalActions(game, HUMAN) : [];
  const playableUids = new Set(legal.flatMap((a) => (a.type === 'plan' ? [a.action.uid] : [])));

  const onPointerDown = (e: React.PointerEvent, uid: number, cardId: string) => {
    if (e.button !== 0) return;
    const targets = new Map<string, PlannedAction>();
    for (const a of legal) {
      if (a.type === 'plan' && a.action.uid === uid) targets.set(dropKey(a.action), a.action);
    }
    setDrag({
      uid,
      cardId,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      targets,
      hover: null,
    });
  };

  return (
    <section className="hand" data-zone="hand" aria-label="Your hand">
      <QueuedSpells />
      {cards.map((card, i) => {
        const offset = i - (n - 1) / 2;
        const playable = playableUids.has(card.uid);
        const dragging = drag?.uid === card.uid && drag.moved;
        return (
          <div
            key={card.uid}
            className={`hand__slot${playable ? ' hand__slot--playable' : ''}${dragging ? ' hand__slot--dragging' : ''}`}
            data-uid={card.uid}
            onPointerDown={(e) => onPointerDown(e, card.uid, card.cardId)}
            style={
              {
                '--offset': offset,
                '--abs-offset': Math.abs(offset),
                '--gaps': Math.max(1, n - 1),
                zIndex: i,
              } as React.CSSProperties
            }
          >
            <CardView cardId={card.cardId} />
          </div>
        );
      })}
    </section>
  );
}

/** The card following the finger while dragging, plus a target arrow for spells. */
export function DragLayer() {
  const drag = useDrag((s) => s.drag);
  if (!drag || !drag.moved) return null;
  const isSpell = getCard(drag.cardId).type === 'spell';
  return (
    <div className="drag-layer" aria-hidden="true">
      {isSpell && (
        <svg className="drag-arrow">
          <line x1={drag.startX} y1={drag.startY} x2={drag.x} y2={drag.y - LIFT} />
          <circle cx={drag.x} cy={drag.y - LIFT} r="7" />
        </svg>
      )}
      <div
        className="drag-card"
        style={{ transform: `translate(${drag.x}px, ${drag.y - LIFT}px) translate(-50%, -50%)` }}
      >
        <CardView cardId={drag.cardId} />
      </div>
    </div>
  );
}
