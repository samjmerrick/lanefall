import { create } from 'zustand';
import type { AiHooks, Difficulty } from '../ai';
import { matchAiRng, type RunMatch } from '../run';
import {
  applyAction,
  initMatch,
  resolveRound,
  type GameEvent,
  type GameState,
  type LaneIndex,
  type PlannedAction,
  type PlayerId,
  type SideHits,
} from '../engine';
import { seedRng } from '../engine/rng';
import { runAi } from './aiClient';
import { PREBUILT_DECKS } from '../engine';
import { useApp, type DeckChoice } from './app';
import { useRun } from './runStore';
import { animationScale, randomSeed, urlSeed } from './settings';
import { applyEvent, eventDuration, viewFromState, type BoardView } from './view';

export const HUMAN: PlayerId = 0;
export const AI: PlayerId = 1;

export interface Fx {
  id: number;
  kind: 'damage' | 'heal';
  amount: number;
  target: { unit: number } | { hero: PlayerId };
}

/** Where a damage counter is drawn: the lane strip cell, a unit, or a hero's HP. */
export type CounterTarget =
  { type: 'strip'; lane: LaneIndex } | { type: 'unit'; uid: number } | { type: 'hero'; player: PlayerId };

/** The number that travels from the lane strip through the enemy units to their hero. */
export interface CombatCounter {
  id: number;
  kind: 'power' | 'pierce';
  attacker: PlayerId;
  value: number;
  target: CounterTarget;
  /** Increases at every stop, so Reduce motion can fade in a fresh counter instead of moving one. */
  stop: number;
}

/** What the stepper tracks while one lane's combat events play. */
interface CombatScript {
  lane: LaneIndex;
  hits: [SideHits, SideHits];
  current: PlayerId | null;
}

const COMBAT_EVENTS = new Set<GameEvent['type']>([
  'LaneCombat',
  'DamageDealt',
  'BarrierBroken',
  'HeroDamaged',
  'HeroHealed',
]);

export interface Revealing {
  id: number;
  cardId: string;
  player: PlayerId;
}

interface MatchStore {
  /** Quick Play, or a run node's match (autosaved after every End Turn). */
  mode: 'quick' | 'run';
  deck: DeckChoice | null;
  difficulty: Difficulty;
  hooks: AiHooks;
  /** Run mode: the enemy being fought. */
  enemyId: string | null;
  opponentDeck: string | null;
  seed: number;
  game: GameState | null;
  view: BoardView | null;
  /** True while the AI thinks or a round animates. */
  busy: boolean;
  aiRng: number;
  mulligan: number[];
  detail: string | null;
  fx: Fx[];
  revealing: Revealing | null;
  activeLane: LaneIndex | null;
  counters: CombatCounter[];
  error: string | null;

  startMatch(deck?: DeckChoice, difficulty?: Difficulty): Promise<void>;
  startRunMatch(m: RunMatch, saved: { game: GameState; aiRng: number } | null): Promise<void>;
  toggleMulligan(uid: number): void;
  confirmMulligan(): void;
  play(action: PlannedAction): void;
  unplan(index: number): void;
  endTurn(): Promise<void>;
  showDetail(cardId: string | null): void;
  leave(): void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let fxId = 1;

export const useMatch = create<MatchStore>((set, get) => {
  async function aiTurn(state: GameState): Promise<GameState> {
    const { difficulty, aiRng, hooks } = get();
    const { actions, rng } = await runAi(difficulty, state, AI, aiRng, hooks);
    set({ aiRng: rng });
    let s = state;
    for (const a of actions) s = applyAction(s, a);
    return s;
  }

  function pushFx(e: GameEvent) {
    let fx: Fx | null = null;
    if (e.type === 'DamageDealt')
      fx = { id: fxId++, kind: 'damage', amount: e.amount, target: { unit: e.uid } };
    if (e.type === 'UnitHealed') fx = { id: fxId++, kind: 'heal', amount: e.amount, target: { unit: e.uid } };
    if (e.type === 'HeroDamaged')
      fx = { id: fxId++, kind: 'damage', amount: e.amount, target: { hero: e.player } };
    if (e.type === 'HeroHealed')
      fx = { id: fxId++, kind: 'heal', amount: e.amount, target: { hero: e.player } };
    if (!fx) return;
    const id = fx.id;
    set((st) => ({ fx: [...st.fx, fx] }));
    setTimeout(() => set((st) => ({ fx: st.fx.filter((f) => f.id !== id) })), 900);
  }

  /** Which attacker's damage this event is, if it belongs to the lane combat being played. */
  function attackerOf(cs: CombatScript, e: GameEvent): PlayerId | null {
    if (e.type === 'DamageDealt' || e.type === 'BarrierBroken')
      return ([0, 1] as const).find((a) => cs.hits[a].units.some((u) => u.uid === e.uid)) ?? null;
    if (e.type === 'HeroDamaged' && e.lane === cs.lane) return (1 - e.player) as PlayerId;
    return null;
  }

  /** The attacker's counters, waiting at the lane strip. */
  function stripCounters(cs: CombatScript, a: PlayerId): CombatCounter[] {
    const h = cs.hits[a];
    const normal = h.units.reduce((sum, u) => sum + u.amount, 0) + h.overflow;
    const target: CounterTarget = { type: 'strip', lane: cs.lane };
    const out: CombatCounter[] = [];
    if (normal > 0) out.push({ id: fxId++, kind: 'power', attacker: a, value: normal, target, stop: 0 });
    if (h.pierce > 0 && h.hero > 0)
      out.push({ id: fxId++, kind: 'pierce', attacker: a, value: h.pierce, target, stop: 0 });
    return out;
  }

  /** Move the counters to wherever this event hits. */
  function counterStop(cs: CombatScript, e: GameEvent, a: PlayerId) {
    const h = cs.hits[a];
    set((st) => ({
      counters: st.counters.flatMap((c): CombatCounter[] => {
        if (c.attacker !== a) return [c];
        if (e.type === 'HeroDamaged') {
          const value = c.kind === 'pierce' ? h.pierce : e.amount - h.pierce;
          return value > 0
            ? [{ ...c, value, target: { type: 'hero', player: e.player }, stop: c.stop + 1 }]
            : [];
        }
        if (c.kind === 'pierce' || (e.type !== 'DamageDealt' && e.type !== 'BarrierBroken')) return [c];
        const amount = h.units.find((u) => u.uid === e.uid)?.amount ?? 0;
        return [
          {
            ...c,
            value: Math.max(0, c.value - amount),
            target: { type: 'unit', uid: e.uid },
            stop: c.stop + 1,
          },
        ];
      }),
    }));
  }

  async function playback(events: GameEvent[]) {
    const profile = useApp.getState().profile.settings;
    const scale = animationScale() * (profile.fastAnimations ? 0.5 : 1);
    let cs: CombatScript | null = null;
    for (const e of events) {
      if (e.type === 'LaneCombat') {
        const first = e.order[0];
        cs = { lane: e.lane, hits: e.hits, current: first };
        set({ counters: stripCounters(cs, first) });
      } else if (cs && !COMBAT_EVENTS.has(e.type)) {
        cs = null;
        set({ counters: [] });
      }
      // The second attacker's counter appears at the strip before it moves to its first stop.
      const a = cs ? attackerOf(cs, e) : null;
      if (cs && a !== null && a !== cs.current) {
        const hadCounters = get().counters.length > 0;
        cs.current = a;
        set({ counters: stripCounters(cs, a) });
        if (hadCounters) await sleep(150 * scale);
      }
      set((st) => ({
        view: st.view ? applyEvent(st.view, e) : st.view,
        revealing:
          e.type === 'CardRevealed' ? { id: fxId++, cardId: e.cardId, player: e.player } : st.revealing,
        activeLane: e.type === 'LaneCombat' ? e.lane : e.type === 'RoundEnded' ? null : st.activeLane,
      }));
      if (cs && a !== null) counterStop(cs, e, a);
      pushFx(e);
      const ms = eventDuration(e, cs !== null) * scale;
      if (ms > 0) await sleep(ms);
      if (e.type === 'CardRevealed') set({ revealing: null });
    }
    set({ activeLane: null, revealing: null, counters: [] });
  }

  function guard<T>(f: () => T): T | undefined {
    try {
      return f();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return undefined;
    }
  }

  /** Run mode autosave: the match state after the AI has acted. */
  function autosave() {
    const { mode, game, aiRng } = get();
    if (mode === 'run' && game) useRun.getState().saveMatch(game, aiRng);
  }

  return {
    mode: 'quick',
    deck: null,
    difficulty: 'normal',
    hooks: {},
    enemyId: null,
    opponentDeck: null,
    seed: 0,
    game: null,
    view: null,
    busy: false,
    aiRng: 0,
    mulligan: [],
    detail: null,
    fx: [],
    revealing: null,
    activeLane: null,
    counters: [],
    error: null,

    async startMatch(deckArg, difficultyArg) {
      const deck = deckArg ?? get().deck;
      const difficulty = difficultyArg ?? get().difficulty;
      if (!deck) return;
      const seed = urlSeed() ?? randomSeed();
      // The opponent plays a random pre-built deck (a different one from yours when possible).
      const pool = PREBUILT_DECKS.filter((d) => d.id !== deck.id);
      const opponent = (pool.length > 0 ? pool : PREBUILT_DECKS)[seed % Math.max(1, pool.length)]!;
      let game = initMatch({ decks: [deck.cards, opponent.cards] }, seed);
      useApp.getState().go('match');
      set({
        mode: 'quick',
        hooks: {},
        enemyId: null,
        deck,
        difficulty,
        opponentDeck: opponent.id,
        seed,
        game,
        view: viewFromState(game),
        busy: true,
        aiRng: seedRng((seed ^ 0x5bd1e995) >>> 0),
        mulligan: [],
        fx: [],
        error: null,
      });
      game = await aiTurn(game); // AI mulligan
      set({ game, view: viewFromState(game), busy: false });
    },

    async startRunMatch(m, saved) {
      let game = saved?.game ?? initMatch(m.config, m.seed);
      useApp.getState().go('match');
      set({
        mode: 'run',
        deck: null,
        difficulty: m.difficulty,
        hooks: m.hooks,
        enemyId: m.enemyId,
        opponentDeck: null,
        seed: m.seed,
        game,
        view: viewFromState(game),
        busy: !saved,
        aiRng: saved?.aiRng ?? matchAiRng(m.seed),
        mulligan: [],
        fx: [],
        error: null,
      });
      if (saved) return;
      game = await aiTurn(game); // AI mulligan
      set({ game, view: viewFromState(game), busy: false });
      autosave();
    },

    toggleMulligan(uid) {
      set((st) => ({
        mulligan: st.mulligan.includes(uid) ? st.mulligan.filter((u) => u !== uid) : [...st.mulligan, uid],
      }));
    },

    confirmMulligan() {
      const { game, mulligan } = get();
      if (!game) return;
      const next = guard(() => applyAction(game, { type: 'mulligan', player: HUMAN, uids: mulligan }));
      if (next) {
        set({ game: next, view: viewFromState(next), mulligan: [] });
        autosave();
      }
    },

    play(action) {
      const { game, busy } = get();
      if (!game || busy) return;
      const next = guard(() => applyAction(game, { type: 'plan', player: HUMAN, action }));
      if (next) set({ game: next });
    },

    unplan(index) {
      const { game, busy } = get();
      if (!game || busy) return;
      const next = guard(() => applyAction(game, { type: 'unplan', player: HUMAN, index }));
      if (next) set({ game: next });
    },

    async endTurn() {
      const { game, busy } = get();
      if (!game || busy || game.phase !== 'plan') return;
      set({ busy: true });
      let s = applyAction(game, { type: 'endTurn', player: HUMAN });
      s = await aiTurn(s);
      const { state, events } = resolveRound(s);
      set({ view: viewFromState(s) });
      await playback(events);
      set({ game: state, view: viewFromState(state), busy: false });
      autosave();
      if (state.result && get().mode === 'quick') {
        const { winner } = state.result;
        const outcome = winner === null ? 'draw' : winner === HUMAN ? 'win' : 'loss';
        useApp.getState().recordQuickPlay(get().deck!.id, outcome);
      }
    },

    showDetail: (detail) => set({ detail }),
    leave() {
      const run = get().mode === 'run';
      set({ game: null, view: null, busy: false });
      // A run match stays saved; the run screen offers to resume it.
      useApp.getState().go(run ? 'run' : 'quickplay');
    },
  };
});
