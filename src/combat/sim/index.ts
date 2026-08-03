/**
 * The combat balance harness: seeded auto-battles run through the real
 * engine, swept across encounters, builds and difficulty presets, and
 * folded into a reproducible table of win rates and fight lengths.
 *
 * Test tooling. Nothing in the shipped game imports this directory — the
 * balance tests and any future dev screen do. See ../../data/balance.ts
 * for the targets it is measured against.
 */
export {
  STAT_SPREADS,
  buildGame,
  buildStaticBand,
  coreBuilds,
  makeBuild,
  type ChromeLevel,
  type SimBuild,
  type StatSpread,
} from "./builds";
export {
  SIM_POLICY_IDS,
  playTurn,
  simPolicy,
  type SimPolicy,
  type SimPolicyId,
} from "./policies";
export { ROUND_CEILING, simulateBattle, type BattleResult } from "./run";
export {
  aggregate,
  cellSeed,
  groupBy,
  runCell,
  runSweep,
  type Aggregate,
  type SweepCell,
  type SweepReport,
  type SweepSpec,
} from "./sweep";
export {
  aggregateTable,
  foldBy,
  formatTable,
  section,
  type LabelledAggregate,
  type TableColumn,
} from "./report";
