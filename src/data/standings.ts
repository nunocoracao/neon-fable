import type { FlagValue } from "../state/flags";
import {
  SIDE_CHAIN_STEP,
  scaleStanding,
  type StandingDelta,
} from "./factions";
import { LAST_MILE_OUTCOMES } from "./story/lastMile";
import { UNDER_WATERLINE_OUTCOMES } from "./story/underWaterline";

/**
 * What the city already knows about a run: every recorded outcome, and
 * what it is worth to whom.
 *
 * Every entry keys on a flag the story wrote long before this system
 * existed, which is what makes standing recoverable from a save that
 * predates it — `deriveReputation` (src/state/reputation.ts) sums the
 * entries a save's flags match. The same table is the authority for the
 * `standing` tags on the choices that write those flags: a test in
 * ./standings.test.ts fails if a tagged choice and this table ever
 * disagree, so a live run and a re-loaded one cannot drift apart.
 *
 * Only write-once flags belong here. A flag a later beat overwrites
 * (`wanted-by-auric`, which Act 2's charter suspends) would be worth
 * one thing while the run was live and another read back off a finished
 * save — exactly the divergence this table exists to avoid.
 */
export interface StandingSource {
  flag: string;
  /** The written value that counts; matched with strict equality. */
  value: FlagValue;
  standing: StandingDelta;
}

/** A side chain's outcome table, read for its flag and its weights. */
type ChainOutcomes = Readonly<
  Record<string, { readonly flag: string; readonly standing: StandingDelta }>
>;

function chainStandings(outcomes: ChainOutcomes): StandingSource[] {
  return Object.values(outcomes).map((outcome) => ({
    flag: outcome.flag,
    value: true,
    standing: scaleStanding(outcome.standing, SIDE_CHAIN_STEP),
  }));
}

export const FACTION_STANDINGS: readonly StandingSource[] = [
  // --- Act 1: who you swore to, who you sold, and how the night ended
  {
    flag: "court-oath",
    value: true,
    standing: { court: 12 },
  },
  {
    flag: "voss-deal",
    value: true,
    standing: { auric: 10, court: -6 },
  },
  {
    flag: "betrayed-court",
    value: true,
    standing: { court: -25 },
  },
  {
    flag: "betrayed-voss",
    value: true,
    standing: { auric: -20 },
  },
  {
    // Selling a fixer's hiding place is the one thing the boards agree
    // is unforgivable, whoever it got sold to.
    flag: "sable-burned",
    value: true,
    standing: { market: -12 },
  },
  {
    flag: "voss-exposed",
    value: true,
    standing: { auric: -10, market: 6 },
  },
  {
    flag: "act1-outcome",
    value: "court",
    standing: { auric: -20, court: 25 },
  },
  {
    flag: "act1-outcome",
    value: "voss",
    standing: { auric: 25, court: -20 },
  },
  {
    flag: "act1-outcome",
    value: "broadcast",
    standing: { auric: -25, court: 10, market: 12 },
  },
  // --- Act 2: what the Cordon broke open, and into whose hands
  {
    // The bonded floor's manifest, read out on the Market's boards:
    // the one favour a run can do six levels of traders that is worth
    // as much to them as a chapter, because it is their own stock.
    flag: "boards-cut-in",
    value: true,
    standing: { market: 12, auric: -6 },
  },
  {
    flag: "act2-outcome",
    value: "charter",
    standing: { auric: -10, court: 20, market: 12 },
  },
  {
    flag: "act2-outcome",
    value: "takeover",
    standing: { auric: 30, court: -20 },
  },
  {
    flag: "act2-outcome",
    value: "severance",
    standing: { auric: -25, court: 25, market: -10 },
  },
  // --- Act 3: who holds the city afterwards
  {
    flag: "act3-outcome",
    value: "commons",
    standing: { auric: -20, court: 30, market: 10 },
  },
  {
    flag: "act3-outcome",
    value: "regency",
    standing: { auric: 30, court: -25 },
  },
  {
    flag: "act3-outcome",
    value: "freehold",
    standing: { auric: -30, court: 15, market: -15 },
  },
  {
    flag: "act3-outcome",
    value: "ghost",
    standing: { auric: -15, market: 20 },
  },
  // --- The district chains, at their own authored weights
  ...chainStandings(LAST_MILE_OUTCOMES),
  ...chainStandings(UNDER_WATERLINE_OUTCOMES),
];

/**
 * Every entry a single flag write matches. More than one is legal (two
 * powers can both care about the same sentence); the caller sums them.
 */
export function standingsForFlag(
  flag: string,
  value: FlagValue,
): StandingDelta[] {
  return FACTION_STANDINGS.filter(
    (source) => source.flag === flag && source.value === value,
  ).map((source) => source.standing);
}
