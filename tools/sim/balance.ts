// Balance report generator (spec M8): pnpm sim:balance [n=1000] [--out docs/balance.md] [--workers k]
// Plays every faction pair Normal vs Normal, n matches per seat, and writes a reproducible Markdown report.
import { readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { collectibleCards, type Faction } from '../../src/engine';
import { factionDeck } from './decks';
import { playBotMatch } from './runner';

export const FACTION_IDS: Faction[] = ['ember', 'bastion', 'tide', 'grove', 'dusk'];
export const FACTION_TARGET = { min: 45, max: 55 };
export const CARD_TARGET_MAX = 60;

export interface Job {
  seed: number;
  /** Factions of player 0 and player 1. */
  factions: [Faction, Faction];
}

/** What is kept of one match. */
export interface GameRecord {
  seed: number;
  factions: [Faction, Faction];
  winner: 0 | 1 | null;
  /** Only meaningful for draws: 'hp' = both heroes at 0 or less, 'rounds' = equal HP after the last round. */
  reason: 'hp' | 'rounds';
  rounds: number;
  /** Distinct card ids each player revealed. */
  played: [string[], string[]];
}

export interface Tally {
  games: number;
  wins: number;
  draws: number;
}

export interface BalanceStats {
  matches: number;
  factions: Record<string, Tally>;
  /** pairs[row][col]: the row faction's results against the column faction. */
  pairs: Record<string, Record<string, Tally>>;
  draws: { total: number; hp: number; rounds: number };
  avgRounds: number;
  cards: Record<string, { played: number; wins: number }>;
}

export interface Exceptions {
  factions: Record<string, string>;
  cards: Record<string, string>;
}

export interface ReportMeta {
  nPerSeat: number;
  ai: string;
  deck: string;
  cards: { id: string; name: string; faction: string; cost: number }[];
  exceptions: Exceptions;
}

export interface Violations {
  factions: { id: string; winPct: number }[];
  cards: { id: string; winPct: number; played: number }[];
}

/** Fixed job order: pairs in faction order, A-first then B-first, n matches each, seeds counting up from 1. */
export function makeJobs(n: number): Job[] {
  const jobs: Job[] = [];
  let seed = 1;
  for (let i = 0; i < FACTION_IDS.length; i++) {
    for (let j = i + 1; j < FACTION_IDS.length; j++) {
      const a = FACTION_IDS[i]!;
      const b = FACTION_IDS[j]!;
      for (const factions of [
        [a, b],
        [b, a],
      ] as [Faction, Faction][]) {
        for (let k = 0; k < n; k++) jobs.push({ seed: seed++, factions });
      }
    }
  }
  return jobs;
}

export function playJob(job: Job): GameRecord {
  const decks: [string[], string[]] = [factionDeck(job.factions[0]), factionDeck(job.factions[1])];
  const { final, events } = playBotMatch({ decks }, job.seed, ['normal', 'normal']);
  const played: [Set<string>, Set<string>] = [new Set(), new Set()];
  for (const e of events) if (e.type === 'CardRevealed') played[e.player].add(e.cardId);
  return {
    seed: job.seed,
    factions: job.factions,
    winner: final.result!.winner,
    reason: final.result!.reason,
    rounds: final.round,
    played: [[...played[0]].sort(), [...played[1]].sort()],
  };
}

const tally = (): Tally => ({ games: 0, wins: 0, draws: 0 });

function record(t: Tally, won: boolean, drew: boolean): void {
  t.games++;
  if (won) t.wins++;
  if (drew) t.draws++;
}

/** Win rate = wins / games; a draw counts as a loss for both sides. */
export function aggregate(records: GameRecord[]): BalanceStats {
  const stats: BalanceStats = {
    matches: records.length,
    factions: {},
    pairs: {},
    draws: { total: 0, hp: 0, rounds: 0 },
    avgRounds: 0,
    cards: {},
  };
  let rounds = 0;
  for (const r of records) {
    rounds += r.rounds;
    const drew = r.winner === null;
    if (drew) {
      stats.draws.total++;
      stats.draws[r.reason]++;
    }
    for (const p of [0, 1] as const) {
      const f = r.factions[p];
      const o = r.factions[p === 0 ? 1 : 0];
      const won = r.winner === p;
      record((stats.factions[f] ??= tally()), won, drew);
      record(((stats.pairs[f] ??= {})[o] ??= tally()), won, drew);
      for (const c of r.played[p]) {
        const cs = (stats.cards[c] ??= { played: 0, wins: 0 });
        cs.played++;
        if (won) cs.wins++;
      }
    }
  }
  stats.avgRounds = records.length ? rounds / records.length : 0;
  return stats;
}

const pct = (num: number, den: number): number => (den === 0 ? 0 : (num / den) * 100);
const fmt = (x: number): string => x.toFixed(1);

export function findViolations(stats: BalanceStats): Violations {
  const factions = Object.entries(stats.factions)
    .map(([id, t]) => ({ id, winPct: pct(t.wins, t.games) }))
    .filter((f) => f.winPct < FACTION_TARGET.min || f.winPct > FACTION_TARGET.max)
    .sort((a, b) => a.id.localeCompare(b.id));
  const cards = Object.entries(stats.cards)
    .map(([id, c]) => ({ id, winPct: pct(c.wins, c.played), played: c.played }))
    .filter((c) => c.winPct > CARD_TARGET_MAX)
    .sort((a, b) => b.winPct - a.winPct || a.id.localeCompare(b.id));
  return { factions, cards };
}

/** Out-of-target items that have no entry in the exceptions file. */
export function missingReasons(stats: BalanceStats, exceptions: Exceptions): string[] {
  const v = findViolations(stats);
  return [
    ...v.factions.filter((f) => !exceptions.factions[f.id]).map((f) => `faction ${f.id}`),
    ...v.cards.filter((c) => !exceptions.cards[c.id]).map((c) => `card ${c.id}`),
  ];
}

export function renderReport(stats: BalanceStats, meta: ReportMeta): string {
  const out: string[] = [];
  const nFactions = FACTION_IDS.length;
  out.push('# Balance report', '');
  out.push(
    'Generated by `pnpm sim:balance`; do not edit by hand. Reproducible: the same card data and `n` give the same file.',
    '',
  );
  out.push(`- Matches per seat per pairing: ${meta.nPerSeat}`);
  out.push(`- Total matches: ${stats.matches}`);
  out.push(`- AI levels: ${meta.ai}`);
  out.push(`- Decks: ${meta.deck}`);
  out.push(`- Seeds: 1 to ${stats.matches}, assigned in a fixed order`);
  out.push(`- Win rate = wins / games; a draw counts as a loss for both players`);
  out.push(
    `- Targets: every faction wins ${FACTION_TARGET.min}-${FACTION_TARGET.max}% of its matches; no card's win rate when played is above ${CARD_TARGET_MAX}%`,
    '',
  );

  out.push(
    '## Factions',
    '',
    '| Faction | Wins / games | Win % | Draw % | In target |',
    '|---|---|---|---|---|',
  );
  const violations = findViolations(stats);
  const badFactions = new Set(violations.factions.map((f) => f.id));
  for (const f of FACTION_IDS) {
    const t = stats.factions[f] ?? tally();
    out.push(
      `| ${f} | ${t.wins} / ${t.games} | ${fmt(pct(t.wins, t.games))} | ${fmt(pct(t.draws, t.games))} | ${badFactions.has(f) ? '✗' : '✓'} |`,
    );
  }

  out.push(
    '',
    '## Pairings',
    '',
    "Row faction's win % against the column faction (both seats combined).",
    '',
  );
  out.push(`| | ${FACTION_IDS.join(' | ')} |`, `|---|${'---|'.repeat(nFactions)}`);
  for (const r of FACTION_IDS) {
    const cells = FACTION_IDS.map((c) => {
      if (r === c) return '-';
      const t = stats.pairs[r]?.[c];
      return t ? fmt(pct(t.wins, t.games)) : 'n/a';
    });
    out.push(`| ${r} | ${cells.join(' | ')} |`);
  }

  out.push('', '## Draws and length', '');
  out.push(`- Draws: ${stats.draws.total} (${fmt(pct(stats.draws.total, stats.matches))}%)`);
  out.push(`- Both heroes at 0 HP or less (reason \`hp\`): ${stats.draws.hp}`);
  out.push(`- Equal HP after the last round (reason \`rounds\`): ${stats.draws.rounds}`);
  out.push(`- Average match length: ${stats.avgRounds.toFixed(2)} rounds`);

  const rows = meta.cards
    .filter((c) => (stats.cards[c.id]?.played ?? 0) > 0)
    .map((c) => {
      const s = stats.cards[c.id]!;
      return { ...c, played: s.played, winPct: pct(s.wins, s.played) };
    })
    .sort((a, b) => b.winPct - a.winPct || a.id.localeCompare(b.id));
  out.push(
    '',
    '## Cards',
    '',
    'Win rate when played: the player revealed the card at least once in the match. Sorted by win % descending.',
    '',
  );
  out.push('| Card | Name | Faction | Cost | Played | Win % |', '|---|---|---|---|---|---|');
  for (const c of rows)
    out.push(`| ${c.id} | ${c.name} | ${c.faction} | ${c.cost} | ${c.played} | ${fmt(c.winPct)} |`);

  const never = meta.cards.filter((c) => !stats.cards[c.id]);
  out.push('', '## Never played', '');
  if (never.length === 0) out.push('None.');
  else for (const c of never) out.push(`- ${c.id} (${c.name}, ${c.faction}, cost ${c.cost})`);

  out.push('', '## Exceptions', '');
  const items: string[] = [];
  for (const f of violations.factions) {
    items.push(
      `- Faction ${f.id} (${fmt(f.winPct)}%): ${meta.exceptions.factions[f.id] ?? 'MISSING REASON'}`,
    );
  }
  for (const c of violations.cards) {
    items.push(
      `- Card ${c.id} (${fmt(c.winPct)}% over ${c.played} matches): ${meta.exceptions.cards[c.id] ?? 'MISSING REASON'}`,
    );
  }
  if (items.length === 0) out.push('None: every faction and card is within target.');
  else out.push(...items);
  out.push('');
  return out.join('\n');
}

export function buildMeta(nPerSeat: number, exceptions: Exceptions): ReportMeta {
  return {
    nPerSeat,
    ai: 'Normal vs Normal',
    deck: 'mono-faction, 30 cards: every collectible card of the faction once, then its commons again',
    cards: collectibleCards().map((c) => ({ id: c.id, name: c.name, faction: c.faction, cost: c.cost })),
    exceptions,
  };
}

/** Plays all jobs, split into contiguous chunks across workers; results come back in job (seed) order. */
export async function playAll(jobs: Job[], workers = availableParallelism()): Promise<GameRecord[]> {
  const count = Math.max(1, Math.min(workers, jobs.length));
  if (count === 1) return jobs.map(playJob);
  const size = Math.ceil(jobs.length / count);
  const chunks: Promise<GameRecord[]>[] = [];
  for (let i = 0; i < jobs.length; i += size) {
    const chunk = jobs.slice(i, i + size);
    chunks.push(
      new Promise((resolve, reject) => {
        const w = new Worker(fileURLToPath(import.meta.url), { workerData: { balanceJobs: chunk } });
        w.once('message', resolve);
        w.once('error', reject);
        w.once('exit', (code) => code !== 0 && reject(new Error(`worker exited with ${code}`)));
      }),
    );
  }
  return (await Promise.all(chunks)).flat();
}

export async function generate(nPerSeat: number, exceptions: Exceptions, workers?: number) {
  const stats = aggregate(await playAll(makeJobs(nPerSeat), workers));
  return { stats, markdown: renderReport(stats, buildMeta(nPerSeat, exceptions)) };
}

function loadExceptions(): Exceptions {
  const raw = JSON.parse(
    readFileSync(new URL('./balance-exceptions.json', import.meta.url), 'utf8'),
  ) as Partial<Exceptions>;
  return { factions: raw.factions ?? {}, cards: raw.cards ?? {} };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let out = 'docs/balance.md';
  let n = 1000;
  let workers: number | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') out = args[++i] ?? out;
    else if (args[i] === '--workers') workers = Number(args[++i]);
    else n = Number(args[i]);
  }
  if (!Number.isInteger(n) || n < 1) throw new Error('n must be a positive integer');
  const exceptions = loadExceptions();
  const start = performance.now();
  const { stats, markdown } = await generate(n, exceptions, workers);
  writeFileSync(out, markdown);
  const secs = ((performance.now() - start) / 1000).toFixed(1);
  console.log(`${stats.matches} matches (${n} per seat per pairing) in ${secs} s, report written to ${out}`);
  for (const f of FACTION_IDS) {
    const t = stats.factions[f]!;
    console.log(`  ${f.padEnd(8)} ${fmt(pct(t.wins, t.games))}% wins, ${fmt(pct(t.draws, t.games))}% draws`);
  }
  console.log(
    `  draws ${stats.draws.total} (hp ${stats.draws.hp}, rounds ${stats.draws.rounds}), average ${stats.avgRounds.toFixed(2)} rounds`,
  );
  const v = findViolations(stats);
  console.log(`  out of target: ${v.factions.length} factions, ${v.cards.length} cards`);
  const missing = missingReasons(stats, exceptions);
  if (missing.length > 0) {
    console.error(`MISSING REASON for: ${missing.join(', ')}`);
    process.exitCode = 1;
  }
}

if (!isMainThread && (workerData as { balanceJobs?: Job[] } | null)?.balanceJobs) {
  parentPort!.postMessage((workerData as { balanceJobs: Job[] }).balanceJobs.map(playJob));
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
