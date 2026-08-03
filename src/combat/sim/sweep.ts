import type { DifficultyId } from "../../data/difficulty";
import { buildGame, type SimBuild } from "./builds";
import { simPolicy, type SimPolicyId } from "./policies";
import { simulateBattle, type BattleResult } from "./run";

/**
 * The sweep: every encounter against every build on every preset, a
 * handful of seeds each, folded into one table of win rates and fight
 * lengths.
 *
 * ## Reproducibility
 *
 * A cell's seeds are derived, not drawn: `cellSeed` hashes the
 * encounter id, the build id, the preset and the repeat index against
 * the sweep's own base seed. So the same `SweepSpec` produces the same
 * table on every machine and in every run, one cell can be re-run in
 * isolation and land on the same fights, and adding an encounter does
 * not shuffle the seeds of the ones already there. Nothing here calls
 * Math.random.
 */

export interface SweepSpec {
  encounterIds: readonly string[];
  builds: readonly SimBuild[];
  difficulties: readonly DifficultyId[];
  policyId: SimPolicyId;
  /** Fights per cell. Every one is a different seed. */
  repeats: number;
  /** Moves the whole table onto a different set of fights. */
  baseSeed: number;
}

/** One (encounter, build, preset) cell, folded. */
export interface SweepCell {
  encounterId: string;
  buildId: string;
  difficulty: DifficultyId;
  policyId: SimPolicyId;
  battles: number;
  wins: number;
  defeats: number;
  stalls: number;
  /** Wins over battles, in [0, 1]. */
  winRate: number;
  /** Mean rounds over decided fights; stalls do not have a length. */
  meanRounds: number;
  /** Mean share of frame left at the end, over wins only. */
  meanHealthLeft: number;
  /** Mean consumables opened per fight. */
  meanItemsUsed: number;
}

export interface SweepReport {
  spec: SweepSpec;
  cells: SweepCell[];
}

/**
 * FNV-1a over everything that identifies a fight. The same hash the
 * encounter look picker uses (see spawnLookSeed) for the same reason:
 * cheap, stable across engines, and a change to one input does not walk
 * the others.
 */
export function cellSeed(
  baseSeed: number,
  encounterId: string,
  buildId: string,
  difficulty: string,
  repeat: number,
): number {
  let hash = 0x811c9dc5 ^ (baseSeed >>> 0);
  const source = `${encounterId}|${buildId}|${difficulty}|${repeat}`;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // Zero is a legal RNG seed but an ugly one to see in a failure
  // message; nudging it costs nothing and keeps every seed printable.
  return hash === 0 ? 1 : hash;
}

function fold(
  encounterId: string,
  build: SimBuild,
  difficulty: DifficultyId,
  policyId: SimPolicyId,
  results: readonly BattleResult[],
): SweepCell {
  const wins = results.filter((r) => r.outcome === "victory");
  const decided = results.filter((r) => r.outcome !== "stalled");
  const mean = (values: number[]): number =>
    values.length === 0
      ? 0
      : values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    encounterId,
    buildId: build.id,
    difficulty,
    policyId,
    battles: results.length,
    wins: wins.length,
    defeats: results.filter((r) => r.outcome === "defeat").length,
    stalls: results.filter((r) => r.outcome === "stalled").length,
    winRate: results.length === 0 ? 0 : wins.length / results.length,
    meanRounds: mean(decided.map((r) => r.rounds)),
    meanHealthLeft: mean(wins.map((r) => r.healthLeft)),
    meanItemsUsed: mean(results.map((r) => r.itemsUsed)),
  };
}

/** Runs one cell: `repeats` seeded fights of one build against one fight. */
export function runCell(
  spec: SweepSpec,
  encounterId: string,
  build: SimBuild,
  difficulty: DifficultyId,
): SweepCell {
  const policy = simPolicy(spec.policyId);
  const results: BattleResult[] = [];
  for (let repeat = 0; repeat < spec.repeats; repeat++) {
    const seed = cellSeed(
      spec.baseSeed,
      encounterId,
      build.id,
      difficulty,
      repeat,
    );
    results.push(
      simulateBattle(buildGame(build, difficulty, seed), encounterId, policy),
    );
  }
  return fold(encounterId, build, difficulty, spec.policyId, results);
}

/** The whole table, in encounter × build × preset order. */
export function runSweep(spec: SweepSpec): SweepReport {
  const cells: SweepCell[] = [];
  for (const encounterId of spec.encounterIds) {
    for (const build of spec.builds) {
      for (const difficulty of spec.difficulties) {
        cells.push(runCell(spec, encounterId, build, difficulty));
      }
    }
  }
  return { spec, cells };
}

/* --- Folding the table ------------------------------------------------ */

/** A group of cells read as one figure — the shape every target asks for. */
export interface Aggregate {
  battles: number;
  wins: number;
  stalls: number;
  winRate: number;
  meanRounds: number;
  meanHealthLeft: number;
  meanItemsUsed: number;
  /** The lowest win rate any single cell in the group managed. */
  worstCellWinRate: number;
  /** Which cell that was, for a failure message worth reading. */
  worstCellId: string;
}

const EMPTY_AGGREGATE: Aggregate = {
  battles: 0,
  wins: 0,
  stalls: 0,
  winRate: 0,
  meanRounds: 0,
  meanHealthLeft: 0,
  meanItemsUsed: 0,
  worstCellWinRate: 0,
  worstCellId: "",
};

/**
 * Folds a group of cells. Means are weighted by battles rather than by
 * cell, so a group with an unequal number of fights per cell still
 * reports what actually happened.
 */
export function aggregate(cells: readonly SweepCell[]): Aggregate {
  if (cells.length === 0) return { ...EMPTY_AGGREGATE };
  let battles = 0;
  let wins = 0;
  let stalls = 0;
  let roundsWeight = 0;
  let rounds = 0;
  let healthWeight = 0;
  let health = 0;
  let items = 0;
  let worst: SweepCell = cells[0]!;
  for (const cell of cells) {
    battles += cell.battles;
    wins += cell.wins;
    stalls += cell.stalls;
    const decided = cell.battles - cell.stalls;
    rounds += cell.meanRounds * decided;
    roundsWeight += decided;
    health += cell.meanHealthLeft * cell.wins;
    healthWeight += cell.wins;
    items += cell.meanItemsUsed * cell.battles;
    if (cell.winRate < worst.winRate) worst = cell;
  }
  return {
    battles,
    wins,
    stalls,
    winRate: battles === 0 ? 0 : wins / battles,
    meanRounds: roundsWeight === 0 ? 0 : rounds / roundsWeight,
    meanHealthLeft: healthWeight === 0 ? 0 : health / healthWeight,
    meanItemsUsed: battles === 0 ? 0 : items / battles,
    worstCellWinRate: worst.winRate,
    worstCellId: `${worst.encounterId} × ${worst.buildId} @ ${worst.difficulty}`,
  };
}

/** Groups cells by whatever key the caller is asking a question about. */
export function groupBy(
  cells: readonly SweepCell[],
  key: (cell: SweepCell) => string,
): Map<string, SweepCell[]> {
  const groups = new Map<string, SweepCell[]>();
  for (const cell of cells) {
    const id = key(cell);
    const bucket = groups.get(id);
    if (bucket) bucket.push(cell);
    else groups.set(id, [cell]);
  }
  return groups;
}
