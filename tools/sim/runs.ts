import type { Difficulty } from '../../src/ai';
import { starterCollection } from '../../src/engine';
import { starterHeroes } from '../../src/run';
import { playBotRun } from './run';

// pnpm sim:run [runs=500] [player=easy]
const n = Number(process.argv[2] ?? 500);
const player = (process.argv[3] as Difficulty) ?? 'easy';
const pool = [...starterCollection()];
const heroes = starterHeroes();
const stats = new Map(heroes.map((h) => [h.id, { runs: 0, won: 0, nodes: 0 }]));
let matches = 0;
const start = performance.now();
for (let seed = 1; seed <= n; seed++) {
  const hero = heroes[seed % heroes.length]!;
  const rec = playBotRun({ seed, heroId: hero.id, pool }, player);
  const st = stats.get(hero.id)!;
  st.runs++;
  st.nodes += rec.final.nodesCleared;
  if (rec.final.phase.kind === 'over' && rec.final.phase.won) st.won++;
  matches += rec.matches;
}
const ms = performance.now() - start;
console.log(`${n} bot runs (player AI: ${player}), ${matches} matches, ${(ms / n).toFixed(0)} ms per run`);
for (const [id, s] of stats)
  console.log(
    `${id}: won ${s.won}/${s.runs} (${((100 * s.won) / s.runs).toFixed(0)}%), ${(s.nodes / s.runs).toFixed(1)} nodes cleared`,
  );
