import type { ReactNode } from 'react';
import type { Keyword } from '../engine';
import type { Effect } from '../engine/schema';
import { GLOSSARY, KEYWORD_NAMES } from './glossary';

/** Trigger markers for effects that are not keywords. `spell` is implied by the card type. */
export type EffectMark = 'onReveal' | 'ongoing' | 'endOfRound' | 'lastBreath';

const MARK_NAMES: Record<EffectMark, string> = {
  onReveal: 'On Reveal',
  ongoing: 'Ongoing',
  endOfRound: 'End of Round',
  lastBreath: 'Last Breath',
};

/** 24 x 24 line-art paths: 2 px stroke with round caps and joins, same style as the card art. */
const PATHS: Record<Keyword | EffectMark, ReactNode> = {
  guard: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />,
  barrier: <circle cx="12" cy="12" r="8" strokeDasharray="3.2 2.6" />,
  pierce: <path d="M12 21V4M6 10l6-6 6 6M7 17h10" />,
  rally: <path d="M6 21V4M6 5h12l-3.5 4L18 13H6" />,
  growth: <path d="M12 21V11M12 11c0-4 3-6 7-6 0 4-3 6-7 6zM12 16c0-3-2-5-6-5 0 3 2 5 6 5z" />,
  regenerate: <path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v4.5h-4.5" />,
  lifesteal: <path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" />,
  shift: <path d="M4 8h16M16 4l4 4-4 4M20 16H4M8 12l-4 4 4 4" />,
  ephemeral: <path d="M7 3h10M7 21h10M8 3v3l4 6-4 6v3M16 3v3l-4 6 4 6v3" />,
  onReveal: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  ongoing: (
    <path d="M12 12c-2-3-3-4-5-4a4 4 0 0 0 0 8c2 0 3-1 5-4zm0 0c2 3 3 4 5 4a4 4 0 0 0 0-8c-2 0-3 1-5 4z" />
  ),
  endOfRound: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  lastBreath: <path d="M6 12a6 6 0 0 1 12 0v3h-2.5v4h-7v-4H6zM9.5 12h.01M14.5 12h.01" />,
};

function label(kind: Keyword | EffectMark): { name: string; help: string } {
  const name = kind in KEYWORD_NAMES ? KEYWORD_NAMES[kind as Keyword] : MARK_NAMES[kind as EffectMark];
  return { name, help: GLOSSARY[name] ?? '' };
}

export function KeywordIcon({ kind }: { kind: Keyword | EffectMark }) {
  const { name, help } = label(kind);
  return (
    <svg
      className={`kw kw--${kind}`}
      viewBox="0 0 24 24"
      role="img"
      aria-label={name}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>{help ? `${name}: ${help}` : name}</title>
      {PATHS[kind]}
    </svg>
  );
}

/** Distinct non-spell triggers on a card's effects, in a stable order. */
function effectMarks(effects: readonly Effect[]): EffectMark[] {
  const order: EffectMark[] = ['onReveal', 'ongoing', 'endOfRound', 'lastBreath'];
  return order.filter((t) => effects.some((e) => e.trigger === t));
}

/** Keywords first (Shift leading, since it is actionable), then effect markers. */
function cardIconKinds(keywords: readonly Keyword[], effects: readonly Effect[]): (Keyword | EffectMark)[] {
  const ks = [...keywords].sort((a, b) => Number(b === 'shift') - Number(a === 'shift'));
  return [...ks, ...effectMarks(effects)];
}

export function KeywordRow({
  keywords,
  effects = [],
  className = 'kw-row',
  max,
}: {
  keywords: readonly Keyword[];
  effects?: readonly Effect[];
  className?: string;
  max?: number;
}) {
  const kinds = cardIconKinds(keywords, effects).slice(0, max);
  if (kinds.length === 0) return null;
  return (
    <span className={className}>
      {kinds.map((k) => (
        <KeywordIcon key={k} kind={k} />
      ))}
    </span>
  );
}
