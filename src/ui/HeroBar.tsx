import { useShallow } from 'zustand/react/shallow';
import { AnimatePresence, motion } from 'motion/react';
import { manaLeft, MAX_ROUNDS, RESERVE_CAP, type PlayerId } from '../engine';
import { HUMAN, useMatch } from './store';

export function HeroBar({ side }: { side: PlayerId }) {
  const game = useMatch((s) => s.game);
  const view = useMatch((s) => s.view);
  const busy = useMatch((s) => s.busy);
  const endTurn = useMatch((s) => s.endTurn);
  const fx = useMatch(useShallow((s) => s.fx.filter((f) => 'hero' in f.target && f.target.hero === side)));
  if (!game || !view) return null;
  const p = game.players[side];
  const isPlayer = side === HUMAN;
  const left = isPlayer ? manaLeft(game, side) : { mana: p.mana, reserve: p.reserve };
  const canEnd = isPlayer && game.phase === 'plan' && !busy && !p.ready;
  return (
    <div
      className={`hero-bar hero-bar--${isPlayer ? 'player' : 'opponent'}`}
      data-zone={`${isPlayer ? 'player' : 'opponent'}-bar`}
    >
      <span className="hero-bar__hp" aria-label={`${isPlayer ? 'Your' : 'Opponent'} HP ${view.hp[side]}`}>
        ♥ {view.hp[side]}
        <AnimatePresence>
          {fx.map((f) => (
            <motion.span
              key={f.id}
              className={`fx fx--${f.kind}`}
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: 1, y: -16 }}
              exit={{ opacity: 0 }}
            >
              {f.kind === 'damage' ? `−${f.amount}` : `+${f.amount}`}
            </motion.span>
          ))}
        </AnimatePresence>
      </span>
      <span className="hero-bar__mana" aria-label={`Mana ${left.mana} of ${p.mana}`}>
        ◆ {left.mana}/{p.mana}
      </span>
      <span className="hero-bar__reserve" aria-label={`Reserve ${left.reserve}`}>
        {Array.from({ length: RESERVE_CAP }, (_, i) => (
          <span key={i} className={`pip${i < left.reserve ? ' pip--on' : ''}`} />
        ))}
      </span>
      {game.initiative === side && game.phase === 'plan' && (
        <span className="hero-bar__first" title="Reveals first this round">
          1st
        </span>
      )}
      {!isPlayer && (
        <>
          <span className="hero-bar__stat" aria-label="Opponent cards in hand">
            ✋ {p.hand.length}
          </span>
          <span className="hero-bar__round">
            R{Math.max(1, game.round)}/{MAX_ROUNDS}
          </span>
        </>
      )}
      <span className="hero-bar__stat" aria-label={`${isPlayer ? 'Your' : 'Opponent'} deck`}>
        ▤ {p.deck.length}
      </span>
      {isPlayer && (
        <button
          type="button"
          className="end-turn"
          disabled={!canEnd}
          onClick={() => void endTurn()}
          aria-label="End Turn"
        >
          {busy && game.phase === 'plan' ? '…' : 'End Turn'}
        </button>
      )}
    </div>
  );
}
