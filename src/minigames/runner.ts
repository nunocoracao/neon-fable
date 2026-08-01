/**
 * The join between a run and a lattice.
 *
 * ./breach.ts is the game and knows nothing about GameState; ../data/breach.ts
 * is the content and knows nothing about arithmetic. This is where the
 * two meet: what the runner brings to a terminal (room to move, and what
 * they can see before they step), and what a finished run is worth.
 *
 * Everything here is pure over GameState, so the whole of a breach —
 * opening it, playing it, being paid for it — can be driven in a test
 * without a DOM.
 */
import { BREACH_RESCUE_FAILURES } from "../data/assists";
import { tunedCredits } from "../data/difficulty";
import { requireItem } from "../data/items";
import {
  BREACH_FLAG_PREFIX,
  breachDifficulty,
  breachFlag,
  type BreachContext,
} from "../data/breach";
import { dialogueUnlockTags, effectiveStats } from "../inventory/selectors";
import type { ItemResolver } from "../inventory/items";
import { applyEffects } from "../narrative/effects";
import type { Effect } from "../narrative/types";
import { collectShard } from "../state/lore";
import type { GameState } from "../state/gameState";
import { assistOn, rulesModifiers } from "../state/rules";
import {
  breachSeed,
  generateLattice,
  startBreach,
  type BreachGame,
  type BreachOutcome,
  type BreachVision,
} from "./breach";

/** Tech at which a runner gets no extra buffer — and none is taken away. */
export const BREACH_TECH_FLOOR = 5;

/** Tech at which a runner reads trace logic off the grid unaided. */
export const BREACH_TRACE_TECH = 8;

/**
 * The gear channels the lattice reads, named in the same vocabulary
 * doors already use (see `unlock-dialogue` effects on items): threat
 * optics resolve what a node is carrying, and a cortical lattice speaks
 * enough machine to pick the watchdogs out of the grid. Reading the tags
 * rather than the item ids means a later implant that talks the same way
 * helps here for free.
 */
export const BREACH_VALUE_TAG = "optic-scan";
export const BREACH_TRACE_TAG = "machine-cant";

/** The background that came up through the Weave, and its head start. */
export const BREACH_NET_TAG = "net";
export const BREACH_NET_BONUS = 1;

/** Credits a full breach pays per fragment of data carried out. */
export const CREDITS_PER_DATA = 2;

/** Credits a full breach pays per completed fragment chain. */
export const CREDITS_PER_CHAIN = 5;

/** What a runner brings to a terminal, and why. */
export interface RunnerRead {
  /** Effective Tech, gear folded in. */
  tech: number;
  /** Budget over the lattice's own cheapest route, before difficulty. */
  bonus: number;
  vision: BreachVision;
  /** One line per thing that is helping, for the briefing panel. */
  notes: string[];
}

/**
 * What this character is worth at a terminal. Reads effective stats —
 * a Diver Harness really does make you a better runner — and the gear
 * channels above; nothing here consumes RNG or touches the run.
 */
export function readRunner(
  state: GameState,
  resolve: ItemResolver = requireItem,
): RunnerRead {
  const tech = effectiveStats(state.player, resolve).tech;
  const tags = dialogueUnlockTags(state.player, resolve);
  const fromNet = state.player.tags.includes(BREACH_NET_TAG)
    ? BREACH_NET_BONUS
    : 0;
  const fromTech = Math.max(0, tech - BREACH_TECH_FLOOR);
  const vision: BreachVision = {
    traces: tech >= BREACH_TRACE_TECH || tags.includes(BREACH_TRACE_TAG),
    values: tags.includes(BREACH_VALUE_TAG),
  };
  const notes: string[] = [];
  if (fromTech > 0) notes.push(`Tech ${tech}: +${fromTech} buffer`);
  if (fromNet > 0) notes.push(`You came up through the Weave: +${fromNet} buffer`);
  if (vision.traces) {
    notes.push(
      tags.includes(BREACH_TRACE_TAG)
        ? "Cortical lattice: watchdog nodes marked"
        : "You read the watchdog logic off the grid unaided",
    );
  }
  if (vision.values) notes.push("Threat optics: fragment yields readable");
  return { tech, bonus: fromTech + fromNet, vision, notes };
}

/**
 * The lattice this terminal is showing this run, and the buffer to route
 * it with. Seeded off the context id and the run's own RNG seed, so the
 * grid is the same every time this save opens this terminal — reloading
 * is not a reroll — and different in the next playthrough.
 *
 * The budget is the lattice's own cheapest route plus the difficulty's
 * slack plus whatever the runner brings, which is what makes every
 * generated grid solvable by construction at any stat line.
 */
export function openBreach(
  state: GameState,
  context: BreachContext,
  resolve: ItemResolver = requireItem,
): BreachGame {
  const difficulty = breachDifficulty(context.difficulty);
  const lattice = generateLattice(
    difficulty.lattice,
    breachSeed(context.id, state.rng.seed),
  );
  const runner = readRunner(state, resolve);
  return startBreach(lattice, {
    budget: lattice.minCost + difficulty.slack + runner.bonus,
    vision: runner.vision,
  });
}

/** Whether this run has already had its one attempt at a terminal. */
export function breachSpent(state: GameState, contextId: string): boolean {
  return breachFlag(contextId) in state.flags;
}

/**
 * How many terminals have locked this run out. Read straight off the
 * flags every finished run already writes — nothing extra is recorded
 * for the assist's sake — and counted across terminals rather than per
 * terminal, because a terminal is attempted once (see src/data/breach.ts).
 */
export function breachLockouts(state: GameState): number {
  let locked = 0;
  for (const [flag, value] of Object.entries(state.flags)) {
    if (flag.startsWith(BREACH_FLAG_PREFIX) && value === "locked-out") {
      locked += 1;
    }
  }
  return locked;
}

/**
 * Whether a lattice should offer to route itself: the assist is on and
 * this run has been shut out of BREACH_RESCUE_FAILURES terminals.
 *
 * Offered, never applied — the overlay puts a button on the briefing
 * and the player decides (see routeBreach). Somebody who has taken
 * three lockouts and still wants to route the fourth by hand is
 * entitled to, and an assist that took the game away would not be one.
 */
export function breachRescueOffered(state: GameState): boolean {
  return (
    assistOn(state.rules, "breach-rescue") &&
    breachLockouts(state) >= BREACH_RESCUE_FAILURES
  );
}

/** What a finished run pays, before anything is written to the run. */
export interface BreachAward {
  /** Credits the route itself earned. */
  credits: number;
  /** The context's own payout; empty unless the core was reached. */
  effects: readonly Effect[];
  /** A shard to file, or null. */
  shardId: string | null;
}

/**
 * The price of an outcome. A full breach pays for the data and the
 * chains and hands over everything the context authored; a withdrawal
 * pays for the data alone, and only where there was something to carry
 * out; a lockout pays nothing, which is the whole of what failing costs.
 */
export function breachAward(
  context: BreachContext,
  outcome: BreachOutcome,
): BreachAward {
  if (outcome.status === "breached") {
    return {
      credits:
        outcome.harvest * CREDITS_PER_DATA + outcome.chains * CREDITS_PER_CHAIN,
      effects: context.rewards.effects ?? [],
      shardId: context.rewards.shardId ?? null,
    };
  }
  if (outcome.status === "withdrawn" && context.rewards.partial === true) {
    return {
      credits: outcome.harvest * CREDITS_PER_DATA,
      effects: [],
      shardId: null,
    };
  }
  return { credits: 0, effects: [], shardId: null };
}

export interface BreachSettlement {
  state: GameState;
  award: BreachAward;
  /** True when the terminal had already been run and nothing was paid. */
  alreadySpent: boolean;
  /** The shard actually filed — null when it was already in the codex. */
  filedShardId: string | null;
}

/**
 * Folds a finished run back into the playthrough: records the outcome
 * under the terminal's flag, pays the award, and files the chip. Pure
 * and idempotent — a terminal already recorded pays nothing a second
 * time, so a double-fire of the overlay's close cannot double-pay.
 */
export function settleBreach(
  state: GameState,
  context: BreachContext,
  outcome: BreachOutcome,
  resolve: ItemResolver = requireItem,
): BreachSettlement {
  if (breachSpent(state, context.id)) {
    return {
      state,
      award: { credits: 0, effects: [], shardId: null },
      alreadySpent: true,
      filedShardId: null,
    };
  }
  // What the route earned, and then what the preset says a payday is
  // worth. Scaled here rather than inside breachAward so the award
  // stays a pure reading of the *run* — a briefing can quote what a
  // clean breach pays without knowing which city it is being paid in —
  // and so credits from a terminal and credits from a fight go through
  // the one seam (see tunedCredits).
  const earned = breachAward(context, outcome);
  const award: BreachAward = {
    ...earned,
    credits: tunedCredits(
      earned.credits,
      rulesModifiers(state.rules).creditRewardPct,
    ),
  };
  let next: GameState = {
    ...state,
    flags: { ...state.flags, [breachFlag(context.id)]: outcome.status },
  };
  if (award.credits > 0) {
    next = { ...next, credits: Math.max(0, next.credits + award.credits) };
  }
  next = applyEffects(next, [...award.effects], resolve);
  const filedShardId =
    award.shardId !== null && !next.lore.collected.includes(award.shardId)
      ? award.shardId
      : null;
  if (filedShardId !== null) next = collectShard(next, filedShardId);
  return { state: next, award, alreadySpent: false, filedShardId };
}
