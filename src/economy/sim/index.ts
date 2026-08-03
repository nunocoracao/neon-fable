/**
 * The economy balance harness: canonical playthroughs replayed through
 * the real narrative, combat and counter code, with every credit that
 * moved written down and folded into a ledger.
 *
 * Test tooling. Nothing in the shipped game imports this directory —
 * the ledger bounds and any future dev screen do. See
 * ../../data/economyBalance.ts for the targets it is measured against,
 * and ../../combat/sim for the same idea applied to fights.
 */
export { classifyEvent } from "./classify";
export {
  byCategory,
  closing,
  FAUCET_CATEGORIES,
  FLOW_CATEGORIES,
  foldEvents,
  gross,
  income,
  isFaucet,
  makeLedger,
  net,
  spend,
  trough,
  type FlowCategory,
  type Ledger,
  type LedgerEntry,
} from "./ledger";
export {
  ECONOMY_PROFILE_IDS,
  ECONOMY_PROFILES,
  requireEconomyProfile,
  type EconomyProfile,
  type EconomyProfileId,
} from "./profiles";
export { ledgerReport, sweepReport, sweepSummary } from "./report";
export {
  benchPullStep,
  clinicStep,
  dyeStep,
  restyleStep,
  sellBagStep,
  shopStep,
  stockStep,
} from "./steps";
export {
  cellsFor,
  runEconomyCell,
  runEconomySweep,
  withInterludes,
  type ChapterBreak,
  type EconomyCell,
} from "./sweep";
