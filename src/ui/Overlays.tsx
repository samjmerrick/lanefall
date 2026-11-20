import { AnimatePresence, motion } from 'motion/react';
import { getCard } from '../engine';
import { FADE_SECONDS, useDurationScale } from './motion';
import { useReduceMotion } from './useReduceMotion';
import { CardView } from './CardView';
import { glossaryFor, KEYWORD_NAMES } from './glossary';
import { XP_LOSS, XP_WIN } from './app';
import { useRun } from './runStore';
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
  const back = useMatch((s) => s.leave);
  const mode = useMatch((s) => s.mode);
  const startTutorial = useMatch((s) => s.startTutorial);
  const finishTutorial = useMatch((s) => s.finishTutorial);
  const finishMatch = useRun((s) => s.finishMatch);
  const scale = useDurationScale();
  if (!game || game.phase !== 'over' || busy || !game.result) return null;
  const { winner, reason } = game.result;
  const tutorialWon = mode === 'tutorial' && winner === HUMAN;
  const title = tutorialWon
    ? 'Tutorial complete'
    : winner === null
      ? 'Draw'
      : winner === HUMAN
        ? 'Victory'
        : 'Defeat';
  return (
    <motion.div
      className={`overlay overlay--result result--${title.toLowerCase()}`}
      role="dialog"
      aria-label="Match result"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 * scale }}
    >
      <h2 className="result__title">{title}</h2>
      <p className="overlay__hint">
        {reason === 'hp' ? `Decided in round ${game.round}` : 'Decided on HP after round 8'}
      </p>
      <p className="result__hp">
        You ♥ {Math.max(0, game.players[HUMAN].hp)} · Opponent ♥ {Math.max(0, game.players[AI].hp)}
      </p>
      {mode === 'tutorial' ? (
        <>
          <p className="result__xp">
            {tutorialWon
              ? 'You know the basics. Good luck out there!'
              : 'That is not how it was meant to go.'}
          </p>
          {tutorialWon ? (
            <button type="button" className="primary" onClick={finishTutorial}>
              Back to menu
            </button>
          ) : (
            <>
              <button type="button" className="primary" onClick={startTutorial}>
                Try again
              </button>
              <button type="button" className="secondary" onClick={back}>
                Back to menu
              </button>
            </>
          )}
        </>
      ) : mode === 'run' ? (
        <>
          <p className="result__xp">{winner === HUMAN ? 'The way ahead is clear' : 'You lose 1 Heart'}</p>
          <button type="button" className="primary" onClick={() => finishMatch(winner === HUMAN)}>
            Continue
          </button>
        </>
      ) : (
        <>
          <p className="result__xp">+{winner === HUMAN ? XP_WIN : XP_LOSS} XP</p>
          <button type="button" className="primary" onClick={() => void start()}>
            Play again
          </button>
          <button type="button" className="secondary" onClick={back}>
            Change deck
          </button>
        </>
      )}
    </motion.div>
  );
}

export function CardDetail() {
  const cardId = useMatch((s) => s.detail);
  const close = useMatch((s) => s.showDetail);
  const scale = useDurationScale();
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
          transition={{ duration: 0.3 * scale }}
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
  const reduce = useReduceMotion();
  const scale = useDurationScale();
  return (
    <div className="reveal" aria-live="polite">
      <AnimatePresence>
        {revealing && (
          <motion.div
            key={revealing.id}
            className={`reveal__card reveal__card--${revealing.player === HUMAN ? 'player' : 'opponent'}`}
            // The flip takes about 250 ms; the card then stays up for the rest of the event's hold.
            // Reduce motion: a short fade in place of the flip.
            initial={reduce ? { opacity: 0 } : { rotateY: 90, scale: 0.7, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { rotateY: 0, scale: 1, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
            transition={{ duration: (reduce ? FADE_SECONDS : 0.25) * scale }}
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
