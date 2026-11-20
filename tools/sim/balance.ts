// Balance report generator (spec M8): pnpm sim:balance [n=1000] [--out docs/balance.md] [--workers k]
// Plays every faction pair Normal vs Normal, n matches per seat, and writes a reproducible Markdown report.
import { readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { collectibleCards, getCard, LANE_EFFECTS, type Faction } from '../../src/engine';
import { factionDeck } from './decks';
import { playBotMatch } from './runner';

export const FACTION_IDS: Faction[] = ['ember', 'bastion', 'tide', 'grove', 'dusk'];
export const FACTION_TARGET = { min: 45, max: 55 };
export const CARD_TARGET_MAX = 60;
/**
 * Lane targets. Unit share: an even split is 33%. Hero damage is relative to the mean over all lane
 * effects. The damage leader's win rate and the draw rate catch lanes that decide, or never decide, a match.
 */
export const LANE_TARGET = {
  shareMin: 20,
  shareMax: 55,
  damageMin: 0.4,
  damageMax: 1.8,
  leaderWinMin: 40,
  leaderWinMax: 80,
  drawMax: 8,
  /** Lane effects with fewer appearances than this are not judged. */
  minAppearances: 100,
};

export interface Job {
  seed: number;
  /** Factions of player 0 and player 1. */
  factions: [Faction, Faction];
}

/** What one lane saw in one match. Units and mana count plays from round 3 on, when every lane is revealed. */
export interface LaneRecord {
  effectId: string;
  units: [number, number];
  mana: [number, number];
  /** Hero damage dealt by each player through the lane's combat, from the round the lane is revealed. */
  damage: [number, number];
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
  lanes: [LaneRecord, LaneRecord, LaneRecord];
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
  lanes: Record<string, LaneTally>;
}

export interface LaneTally {
  appearances: number;
  /** Units and mana committed here, and in all three lanes of the same matches (rounds 3 to 8). */
  units: number;
  mana: number;
  matchUnits: number;
  matchMana: number;
  damage: number;
  /** Matches where one player dealt more hero damage through this lane, and how many that player won. */
  leaderGames: number;
  leaderWins: number;
  draws: number;
}

export interface Exceptions {
  factions: Record<string, string>;
  cards: Record<string, string>;
  lanes: Record<string, string>;
}

export interface ReportMeta {
  nPerSeat: number;
  ai: string;
  deck: string;
  cards: { id: string; name: string; faction: string; cost: number }[];
  exceptions: Exceptions;
}

export interface LaneRow {
  id: string;
  appearances: number;
  unitPct: number;
  manaPct: number;
  damagePerMatch: number;
  /** Damage per match relative to the mean over all lane effects. */
  damageRatio: number;
  leaderWinPct: number;
  drawPct: number;
  /** Which targets are missed: any of 'share', 'damage', 'leader', 'draws'. */
  flags: string[];
}

export interface Violations {
  factions: { id: string; winPct: number }[];
  cards: { id: string; winPct: number; played: number }[];
  lanes: { id: string; flags: string[] }[];
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
  const lanes = final.lanes.map((l) => ({
    effectId: l.effectId,
    units: [0, 0],
    mana: [0, 0],
    damage: [0, 0],
  })) as GameRecord['lanes'];
  let round = 1; // beginRound(1) happens in initMatch, so its event is not in the stream
  for (const e of events) {
    if (e.type === 'CardRevealed') played[e.player].add(e.cardId);
    else if (e.type === 'RoundStarted') round = e.round;
    else if (e.type === 'UnitPlaced' && round >= 3) {
      lanes[e.lane].units[e.player]++;
      lanes[e.lane].mana[e.player] += getCard(e.cardId).cost;
    } else if (e.type === 'HeroDamaged' && e.lane !== null && round >= e.lane + 1) {
      lanes[e.lane].damage[e.player === 0 ? 1 : 0] += e.amount;
    }
  }
  return {
    seed: job.seed,
    factions: job.factions,
    winner: final.result!.winner,
    reason: final.result!.reason,
    rounds: final.round,
    played: [[...played[0]].sort(), [...played[1]].sort()],
    lanes,
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
    lanes: {},
  };
  let rounds = 0;
  for (const r of records) {
    rounds += r.rounds;
    const drew = r.winner === null;
    if (drew) {
      stats.draws.total++;
      stats.draws[r.reason]++;
    }
    const sum = (pick: (l: LaneRecord) => [number, number]) =>
      r.lanes.reduce((n, l) => n + pick(l)[0] + pick(l)[1], 0);
    const matchUnits = sum((l) => l.units);
    const matchMana = sum((l) => l.mana);
    for (const l of r.lanes) {
      const lt = (stats.lanes[l.effectId] ??= {
        appearances: 0,
        units: 0,
        mana: 0,
        matchUnits: 0,
        matchMana: 0,
        damage: 0,
        leaderGames: 0,
        leaderWins: 0,
        draws: 0,
      });
      lt.appearances++;
      lt.units += l.units[0] + l.units[1];
      lt.mana += l.mana[0] + l.mana[1];
      lt.matchUnits += matchUnits;
      lt.matchMana += matchMana;
      lt.damage += l.damage[0] + l.damage[1];
      if (drew) lt.draws++;
      if (l.damage[0] !== l.damage[1]) {
        lt.leaderGames++;
        if (r.winner === (l.damage[0] > l.damage[1] ? 0 : 1)) lt.leaderWins++;
      }
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
  const lanes = laneRows(stats)
    .filter((l) => l.flags.length > 0)
    .map((l) => ({ id: l.id, flags: l.flags }));
  return { factions, cards, lanes };
}

/** One row per lane effect in content order, with the targets it misses. */
export function laneRows(stats: BalanceStats): LaneRow[] {
  const all = Object.values(stats.lanes);
  const appearances = all.reduce((n, l) => n + l.appearances, 0);
  const meanDamage = all.reduce((n, l) => n + l.damage, 0) / Math.max(1, appearances);
  const T = LANE_TARGET;
  const rows: LaneRow[] = [];
  for (const effect of LANE_EFFECTS) {
    const l = stats.lanes[effect.id];
    if (!l) continue;
    const damagePerMatch = l.damage / l.appearances;
    const row: LaneRow = {
      id: effect.id,
      appearances: l.appearances,
      unitPct: pct(l.units, l.matchUnits),
      manaPct: pct(l.mana, l.matchMana),
      damagePerMatch,
      damageRatio: meanDamage > 0 ? damagePerMatch / meanDamage : 0,
      leaderWinPct: pct(l.leaderWins, l.leaderGames),
      drawPct: pct(l.draws, l.appearances),
      flags: [],
    };
    if (l.appearances >= T.minAppearances) {
      if (row.unitPct < T.shareMin || row.unitPct > T.shareMax) row.flags.push('share');
      if (row.damageRatio < T.damageMin || row.damageRatio > T.damageMax) row.flags.push('damage');
      if (l.leaderGames > 0 && (row.leaderWinPct < T.leaderWinMin || row.leaderWinPct > T.leaderWinMax))
        row.flags.push('leader');
      if (row.drawPct > T.drawMax) row.flags.push('draws');
    }
    rows.push(row);
  }
  return rows;
}

/** Out-of-target items that have no entry in the exceptions file. */
export function missingReasons(stats: BalanceStats, exceptions: Exceptions): string[] {
  const v = findViolations(stats);
  return [
    ...v.factions.filter((f) => !exceptions.factions[f.id]).map((f) => `faction ${f.id}`),
    ...v.cards.filter((c) => !exceptions.cards[c.id]).map((c) => `card ${c.id}`),
    ...v.lanes.filter((l) => !exceptions.lanes[l.id]).map((l) => `lane ${l.id}`),
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
    `- Targets: every faction wins ${FACTION_TARGET.min}-${FACTION_TARGET.max}% of its matches; no card's win rate when played is above ${CARD_TARGET_MAX}%; every lane effect meets the lane targets in the Lanes section`,
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

  const T = LANE_TARGET;
  out.push(
    '',
    '## Lanes',
    '',
    "Per lane effect over every match it appeared in. Units and Mana: the share of all units played (and their mana) in the same matches that went into this lane, in rounds 3 to 8 when every lane is revealed (an even split is 33%). Hero dmg: hero damage dealt through the lane's combat per match, from the round it is revealed (x mean is relative to the mean over all lane effects; damage from End of Round effects is not counted). Leader wins: win rate of the player who dealt more hero damage through the lane. Draw %: matches drawn while the lane was present.",
    '',
    `Targets: unit share ${T.shareMin}-${T.shareMax}%; hero damage ${T.damageMin}-${T.damageMax}x the mean; leader wins ${T.leaderWinMin}-${T.leaderWinMax}%; draws at most ${T.drawMax}%.`,
    '',
    '| Lane | Appears | Units % | Mana % | Hero dmg | x mean | Leader wins % | Draw % | In target |',
    '|---|---|---|---|---|---|---|---|---|',
  );
  for (const l of laneRows(stats)) {
    out.push(
      `| ${l.id} | ${l.appearances} | ${fmt(l.unitPct)} | ${fmt(l.manaPct)} | ${l.damagePerMatch.toFixed(2)} | ${l.damageRatio.toFixed(2)} | ${fmt(l.leaderWinPct)} | ${fmt(l.drawPct)} | ${l.flags.length > 0 ? `✗ ${l.flags.join(', ')}` : '✓'} |`,
    );
  }

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
  for (const l of violations.lanes) {
    items.push(`- Lane ${l.id} (${l.flags.join(', ')}): ${meta.exceptions.lanes[l.id] ?? 'MISSING REASON'}`);
  }
  if (items.length === 0) out.push('None: every faction, card and lane is within target.');
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
  return { factions: raw.factions ?? {}, cards: raw.cards ?? {}, lanes: raw.lanes ?? {} };
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
  console.log(
    `  out of target: ${v.factions.length} factions, ${v.cards.length} cards, ${v.lanes.length} lanes`,
  );
  for (const l of laneRows(stats)) {
    console.log(
      `  ${l.id.padEnd(16)} n=${String(l.appearances).padStart(5)} units ${fmt(l.unitPct).padStart(5)}% dmg x${l.damageRatio.toFixed(2)} leader ${fmt(l.leaderWinPct)}% draws ${fmt(l.drawPct)}% ${l.flags.join(',')}`,
    );
  }
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
