import { create } from 'zustand';
import type { Difficulty } from '../ai';
import {
  applyAction,
  initMatch,
  resolveRound,
  type GameEvent,
  type GameState,
  type LaneIndex,
  type PlannedAction,
  type PlayerId,
} from '../engine';
import { seedRng } from '../engine/rng';
import { runAi } from './aiClient';
import { PLAYABLE_FACTIONS, starterDeck, type PlayableFaction } from './decks';
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

export interface Revealing {
  id: number;
  cardId: string;
  player: PlayerId;
}

interface MatchStore {
  screen: 'setup' | 'match';
  faction: PlayableFaction;
  difficulty: Difficulty;
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
  error: string | null;

  setFaction(f: PlayableFaction): void;
  setDifficulty(d: Difficulty): void;
  startMatch(): Promise<void>;
  toggleMulligan(uid: number): void;
  confirmMulligan(): void;
  play(action: PlannedAction): void;
  unplan(index: number): void;
  endTurn(): Promise<void>;
  showDetail(cardId: string | null): void;
  backToSetup(): void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let fxId = 1;

export const useMatch = create<MatchStore>((set, get) => {
  async function aiTurn(state: GameState): Promise<GameState> {
    const { difficulty, aiRng } = get();
    const { actions, rng } = await runAi(difficulty, state, AI, aiRng);
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

  async function playback(events: GameEvent[]) {
    const scale = animationScale();
    for (const e of events) {
      set((st) => ({
        view: st.view ? applyEvent(st.view, e) : st.view,
        revealing:
          e.type === 'CardRevealed' ? { id: fxId++, cardId: e.cardId, player: e.player } : st.revealing,
        activeLane: e.type === 'LaneCombat' ? e.lane : e.type === 'RoundEnded' ? null : st.activeLane,
      }));
      pushFx(e);
      const ms = eventDuration(e) * scale;
      if (ms > 0) await sleep(ms);
      if (e.type === 'CardRevealed') set({ revealing: null });
    }
    set({ activeLane: null, revealing: null });
  }

  function guard<T>(f: () => T): T | undefined {
    try {
      return f();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return undefined;
    }
  }

  return {
    screen: 'setup',
    faction: 'ember',
    difficulty: 'normal',
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
    error: null,

    setFaction: (faction) => set({ faction }),
    setDifficulty: (difficulty) => set({ difficulty }),

    async startMatch() {
      const { faction } = get();
      const seed = urlSeed() ?? randomSeed();
      const others = PLAYABLE_FACTIONS.filter((f) => f !== faction);
      const opponent = others[seed % others.length]!;
      let game = initMatch({ decks: [starterDeck(faction), starterDeck(opponent)] }, seed);
      set({
        screen: 'match',
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

    toggleMulligan(uid) {
      set((st) => ({
        mulligan: st.mulligan.includes(uid) ? st.mulligan.filter((u) => u !== uid) : [...st.mulligan, uid],
      }));
    },

    confirmMulligan() {
      const { game, mulligan } = get();
      if (!game) return;
      const next = guard(() => applyAction(game, { type: 'mulligan', player: HUMAN, uids: mulligan }));
      if (next) set({ game: next, view: viewFromState(next), mulligan: [] });
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
    },

    showDetail: (detail) => set({ detail }),
    backToSetup: () => set({ screen: 'setup', game: null, view: null, busy: false }),
  };
});
