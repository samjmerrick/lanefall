import type { Difficulty } from '../../src/ai';
import { factionDeck } from './decks';
import { playBotMatch } from './runner';

// pnpm sim [matches=1000] [p1=easy] [p2=easy]
const n = Number(process.argv[2] ?? 1000);
const ai: [Difficulty, Difficulty] = [
  (process.argv[3] as Difficulty) ?? 'easy',
  (process.argv[4] as Difficulty) ?? 'easy',
];
const decks: [string[], string[]] = [factionDeck('ember'), factionDeck('bastion')];
const wins = [0, 0];
let draws = 0;
let rounds = 0;
let byRounds = 0;
const start = performance.now();
for (let seed = 1; seed <= n; seed++) {
  const { final } = playBotMatch({ decks }, seed, ai);
  rounds += final.round;
  if (final.result?.reason === 'rounds') byRounds++;
  if (final.result?.winner === null) draws++;
  else wins[final.result!.winner]!++;
}
const ms = performance.now() - start;
console.log(`${n} matches, Ember (P1, ${ai[0]}) vs Bastion (P2, ${ai[1]})`);
console.log(`P1 wins ${wins[0]}, P2 wins ${wins[1]}, draws ${draws}`);
console.log(`average length ${(rounds / n).toFixed(2)} rounds; ${byRounds} went the full 8 rounds`);
console.log(`${(ms / n).toFixed(2)} ms per match`);
