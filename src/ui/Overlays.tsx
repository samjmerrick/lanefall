import { AnimatePresence, motion } from 'motion/react';
import { getCard } from '../engine';
import { CardView } from './CardView';
import { glossaryFor, KEYWORD_NAMES } from './glossary';
import { AI, HUMAN, useMatch } from './store';

export function MulliganOverlay() {
  const game = useMatch((s) => s.game);
  const selected = useMatch((s) => s.mulligan);
  const toggle = useMatch((s) => s.toggleMulligan);
  const confirm = useMatch((s) => s.confirmMulligan);
  const busy = useMatch((s) => s.busy);
  if (!game || game.phase !== 'mulligan' || game.players[HUMAN].mulliganed) return null;
  return (
    <div className="overlay" role="dialog" aria-label="Mulligan">
      <h2>Starting hand</h2>
      <p className="overlay__hint">Tap cards to replace them. You can do this once.</p>
      <div className="mulligan">
        {game.players[HUMAN].hand.map((h) => (
          <button
            key={h.uid}
            type="button"
            className={`mulligan__card${selected.includes(h.uid) ? ' mulligan__card--out' : ''}`}
            aria-pressed={selected.includes(h.uid)}
            onClick={() => toggle(h.uid)}
          >
            <CardView cardId={h.cardId} />
          </button>
        ))}
      </div>
      <button type="button" className="primary" disabled={busy} onClick={confirm}>
        {selected.length === 0 ? 'Keep hand' : `Replace ${selected.length}`}
      </button>
    </div>
  );
}

export function ResultOverlay() {
  const game = useMatch((s) => s.game);
  const busy = useMatch((s) => s.busy);
  const start = useMatch((s) => s.startMatch);
  const back = useMatch((s) => s.backToSetup);
  if (!game || game.phase !== 'over' || busy || !game.result) return null;
  const { winner, reason } = game.result;
  const title = winner === null ? 'Draw' : winner === HUMAN ? 'Victory' : 'Defeat';
  return (
    <motion.div
      className={`overlay overlay--result result--${title.toLowerCase()}`}
      role="dialog"
      aria-label="Match result"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <h2 className="result__title">{title}</h2>
      <p className="overlay__hint">
        {reason === 'hp' ? `Decided in round ${game.round}` : 'Decided on HP after round 8'}
      </p>
      <p className="result__hp">
        You ♥ {game.players[HUMAN].hp} · Opponent ♥ {game.players[AI].hp}
      </p>
      <button type="button" className="primary" onClick={() => void start()}>
        Play again
      </button>
      <button type="button" className="secondary" onClick={back}>
        Change deck
      </button>
    </motion.div>
  );
}

export function CardDetail() {
  const cardId = useMatch((s) => s.detail);
  const close = useMatch((s) => s.showDetail);
  return (
    <AnimatePresence>
      {cardId && (
        <motion.div
          className="overlay overlay--detail"
          role="dialog"
          aria-label={getCard(cardId).name}
          onClick={() => close(null)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <CardView cardId={cardId} size="large" />
          <dl className="glossary">
            {[
              ...getCard(cardId).keywords.map((k) => KEYWORD_NAMES[k]),
              ...glossaryFor(getCard(cardId).text).map(([t]) => t),
            ]
              .filter((t, i, all) => all.indexOf(t) === i)
              .map((term) => {
                const def = glossaryFor(term)[0]?.[1];
                return def ? (
                  <div key={term}>
                    <dt>{term}</dt>
                    <dd>{def}</dd>
                  </div>
                ) : null;
              })}
          </dl>
          <button type="button" className="secondary" onClick={() => close(null)}>
            Close
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function RevealBanner() {
  const revealing = useMatch((s) => s.revealing);
  return (
    <div className="reveal" aria-live="polite">
      <AnimatePresence>
        {revealing && (
          <motion.div
            key={revealing.id}
            className={`reveal__card reveal__card--${revealing.player === HUMAN ? 'player' : 'opponent'}`}
            initial={{ rotateY: 90, scale: 0.7, opacity: 0 }}
            animate={{ rotateY: 0, scale: 1, opacity: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.25 }}
          >
            <span className="reveal__who">{revealing.player === HUMAN ? 'You' : 'Opponent'}</span>
            <CardView cardId={revealing.cardId} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ErrorToast() {
  const error = useMatch((s) => s.error);
  if (!error) return null;
  return (
    <div className="toast" role="alert" onClick={() => useMatch.setState({ error: null })}>
      {error}
    </div>
  );
}
