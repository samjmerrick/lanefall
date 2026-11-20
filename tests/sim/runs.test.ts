import { describe, expect, it } from 'vitest';
import { plan } from '../../src/ai';
import { applyAction, initMatch, resolveRound, starterCollection, type GameState } from '../../src/engine';
import { seedRng } from '../../src/engine/rng';
import {
  applyChoice,
  matchAiRng,
  replayRun,
  runMatch,
  startRun,
  starterHeroes,
  type RunChoice,
  type RunConfig,
  type RunState,
} from '../../src/run';
import { loadProfile, memoryStore, saveProfile } from '../../src/save/slots';
import { newProfile } from '../../src/save/profile';
import { botChoice, playBotRun } from '../../tools/sim/run';

const pool = [...starterCollection()];
const heroes = starterHeroes();

describe('bot runs', () => {
  it('the simulator completes 500 bot runs with no errors, and each replays to the same state', () => {
    let won = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const rec = playBotRun({ seed, heroId: heroes[seed % heroes.length]!.id, pool });
      expect(rec.final.phase.kind).toBe('over');
      if (rec.final.phase.kind === 'over' && rec.final.phase.won) won++;
      if (seed % 25 === 0) expect(replayRun(rec.config, rec.choices)).toEqual(rec.final);
    }
    expect(won).toBeGreaterThan(0);
  }, 60_000);
});

/** One planning round as the UI runs it: the human (a bot here) plans, then the AI, then resolve. */
function playRound(game: GameState, aiRng: number, r: RunState) {
  const m = runMatch(r);
  // The human's decisions are not part of the save, so their bot stream depends only on seed and round.
  const human = plan('easy', game, 0, seedRng(m.seed * 31 + game.round));
  let s = game;
  for (const a of human.actions) s = applyAction(s, a);
  const ai = plan(m.difficulty, s, 1, aiRng, m.hooks);
  for (const a of ai.actions) s = applyAction(s, a);
  if (game.phase === 'plan') s = resolveRound(s).state; // (a mulligan step has no round to resolve)
  return { game: s, aiRng: ai.rng };
}

interface Session {
  r: RunState;
  choices: RunChoice[];
  game: GameState | null;
  aiRng: number;
  botRng: number;
}

/** Advances the run by one step: a run choice, starting a match, or one match round. */
function step(x: Session): Session {
  const { r } = x;
  if (r.phase.kind === 'match') {
    if (!x.game) {
      const m = runMatch(r);
      return { ...x, game: initMatch(m.config, m.seed), aiRng: matchAiRng(m.seed) };
    }
    if (x.game.phase !== 'over') return { ...x, ...playRound(x.game, x.aiRng, r) };
    const c: RunChoice = { t: 'matchEnd', won: x.game.result?.winner === 0 };
    return { ...x, r: applyChoice(r, c), choices: [...x.choices, c], game: null };
  }
  const [c, botRng] = botChoice(r, x.botRng);
  return { ...x, r: applyChoice(r, c), choices: [...x.choices, c], botRng };
}

async function saveAndLoad(config: RunConfig, x: Session): Promise<Session & { botRng: number }> {
  const store = memoryStore();
  const profile = newProfile();
  profile.activeRun = {
    config,
    choices: x.choices,
    match: x.game ? { step: x.choices.length, game: x.game, aiRng: x.aiRng } : null,
  };
  await saveProfile(store, profile);
  const loaded = await loadProfile(store);
  if (loaded.status !== 'ok') throw new Error('save did not load');
  const run = loaded.profile.activeRun!;
  const r = replayRun(run.config, run.choices);
  expect(run.match?.step).toBe(r.step);
  return { r, choices: run.choices, game: run.match!.game, aiRng: run.match!.aiRng, botRng: x.botRng };
}

describe('resume', () => {
  it('a run closed mid-match and resumed reaches an identical state', async () => {
    for (const seed of [3, 17, 256]) {
      const config: RunConfig = { seed, heroId: heroes[seed % heroes.length]!.id, pool };
      const fresh = (): Session => ({ r: startRun(config), choices: [], game: null, aiRng: 0, botRng: 99 });

      // Uninterrupted run.
      let a = fresh();
      for (let i = 0; a.r.phase.kind !== 'over'; i++) a = step(a);

      // Same run, closed after round 2 of its third match and resumed from the save.
      let b = fresh();
      let matchesStarted = 0;
      while (true) {
        const startsMatch = b.r.phase.kind === 'match' && !b.game;
        b = step(b);
        if (startsMatch) matchesStarted++;
        if (matchesStarted === 3 && b.game && b.game.round === 3) break;
        if (b.r.phase.kind === 'over') throw new Error('run ended before the third match');
      }
      const midMatch = b.game;
      b = await saveAndLoad(config, b);
      expect(b.game).toEqual(midMatch);
      while (b.r.phase.kind !== 'over') b = step(b);

      expect(b.choices).toEqual(a.choices);
      expect(b.r).toEqual(a.r);
    }
  });
});
