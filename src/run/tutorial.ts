// The tutorial match: scripted decks, opponent moves and coach steps (src/content/tutorial.json).
import tutorialJson from '../content/tutorial.json';
import { z } from 'zod';
import {
  getCard,
  getLaneEffect,
  type GameState,
  type LaneIndex,
  type MatchConfig,
  type PlannedAction,
  type PlayerId,
} from '../engine';
import { MatchModifierSchema } from '../engine/schema';

const cardId = z.string().refine((id) => {
  try {
    getCard(id);
    return true;
  } catch {
    return false;
  }
}, 'unknown card');
const lane = z.union([z.literal(0), z.literal(1), z.literal(2)]);
const text = z.string().min(1).max(110);

/** What a `cast` step aims at: a unit (one planned this turn, or one already on the board) or nothing. */
const CastTargetSchema = z.object({ card: cardId, planned: z.boolean() }).nullable();

export const TutorialStepSchema = z.discriminatedUnion('kind', [
  /** Shows the text; the player taps Next. */
  z.object({ kind: z.literal('info'), text }),
  /** Waits for this unit to be dragged into this slot (any other play is refused). */
  z.object({
    kind: z.literal('play'),
    text,
    card: cardId,
    lane,
    slot: z.number().int().min(0).max(3),
  }),
  /** Waits for this spell to be cast on this target (`null` for spells with no target). */
  z.object({ kind: z.literal('cast'), text, card: cardId, target: CastTargetSchema }),
  /** Waits for End Turn. */
  z.object({ kind: z.literal('endTurn'), text }),
  /** The reveal and combat play; the next step shows when they finish. */
  z.object({ kind: z.literal('watch'), text }),
]);

const OpponentMoveSchema = z.object({ card: cardId, lane, slot: z.number().int().min(0).max(3) });

export const TutorialSchema = z.object({
  seed: z.number().int().min(0),
  playerDeck: z.array(cardId).min(1),
  opponentDeck: z.array(cardId).min(1),
  laneEffects: z.tuple([z.string(), z.string(), z.string()]),
  /** Applied to the opponent only; `heroHp` lowers their hero so the match ends in round 3. */
  opponentModifiers: z.array(MatchModifierSchema),
  /** The opponent's units for round 1, 2, 3 (resolved to hand cards when played). */
  opponentPlan: z.array(z.array(OpponentMoveSchema)),
  steps: z.array(TutorialStepSchema).min(1),
});

export type TutorialStep = z.infer<typeof TutorialStepSchema>;
export type Tutorial = z.infer<typeof TutorialSchema>;

export const TUTORIAL: Tutorial = TutorialSchema.parse(tutorialJson);
for (const l of TUTORIAL.laneEffects) getLaneEffect(l);

export const TUTORIAL_SEED = TUTORIAL.seed;

/** The tutorial match setup: player 0 (Ember) against a weakened Bastion opponent. */
export function tutorialConfig(): MatchConfig {
  return {
    decks: [[...TUTORIAL.playerDeck], [...TUTORIAL.opponentDeck]],
    laneEffects: TUTORIAL.laneEffects,
    modifiers: [[], TUTORIAL.opponentModifiers],
  };
}

const HUMAN: PlayerId = 0;
const AI: PlayerId = 1;

/** Hand uid of the first card with this id that is not already planned. */
function freeUid(game: GameState, player: PlayerId, id: string): number | null {
  const p = game.players[player];
  const planned = new Set(p.plan.map((a) => a.uid));
  return p.hand.find((h) => h.cardId === id && !planned.has(h.uid))?.uid ?? null;
}

/** The uid of the unit a cast step aims at, or undefined if it is not there. */
function castTargetUid(step: Extract<TutorialStep, { kind: 'cast' }>, game: GameState): number | undefined {
  const t = step.target;
  if (!t) return undefined;
  if (t.planned) {
    const me = game.players[HUMAN];
    for (const a of me.plan)
      if (a.type === 'playUnit' && me.hand.find((h) => h.uid === a.uid)?.cardId === t.card) return a.uid;
    return undefined;
  }
  for (const l of game.lanes) for (const u of l.slots[HUMAN]) if (u && u.cardId === t.card) return u.uid;
  return undefined;
}

/** The play a `play` or `cast` step asks for, with the hand uid it would use; null for other steps. */
export function requiredAction(step: TutorialStep | undefined, game: GameState): PlannedAction | null {
  if (!step) return null;
  if (step.kind === 'play') {
    const uid = freeUid(game, HUMAN, step.card);
    return uid === null ? null : { type: 'playUnit', uid, lane: step.lane, slot: step.slot };
  }
  if (step.kind === 'cast') {
    const uid = freeUid(game, HUMAN, step.card);
    if (uid === null) return null;
    if (!step.target) return { type: 'playSpell', uid, target: { kind: 'none' } };
    const target = castTargetUid(step, game);
    return target === undefined ? null : { type: 'playSpell', uid, target: { kind: 'unit', uid: target } };
  }
  return null;
}

/** Whether the player's action is the one the step asks for (any copy of the right card will do). */
export function stepAllows(step: TutorialStep | undefined, game: GameState, action: PlannedAction): boolean {
  const need = requiredAction(step, game);
  if (!need || need.type !== action.type) return false;
  const card = game.players[HUMAN].hand.find((h) => h.uid === action.uid)?.cardId;
  const wanted = step && (step.kind === 'play' || step.kind === 'cast') ? step.card : null;
  if (card !== wanted) return false;
  if (need.type === 'playUnit' && action.type === 'playUnit')
    return need.lane === action.lane && need.slot === action.slot;
  if (need.type === 'playSpell' && action.type === 'playSpell')
    return JSON.stringify(need.target) === JSON.stringify(action.target);
  return false;
}

/** The opponent's scripted plan for the current round, as engine actions using its hand uids. */
export function opponentPlan(game: GameState): PlannedAction[] {
  const moves = TUTORIAL.opponentPlan[game.round - 1] ?? [];
  const out: PlannedAction[] = [];
  const used = new Set<number>();
  for (const m of moves) {
    const uid = game.players[AI].hand.find((h) => h.cardId === m.card && !used.has(h.uid))?.uid;
    if (uid === undefined) throw new Error(`Tutorial: the opponent has no ${m.card} in round ${game.round}`);
    used.add(uid);
    out.push({ type: 'playUnit', uid, lane: m.lane as LaneIndex, slot: m.slot });
  }
  return out;
}
