import { HAGGLE, haggleChance, type VendorId } from "../data/economy";
import { hashSeed, nextFloat } from "../state/rng";

/**
 * One argument, per counter, per act — and the same argument every time
 * it is replayed.
 *
 * The roll is not drawn from the run's live RNG stream, which would
 * make the outcome depend on how many footsteps or shots happened
 * first. It is derived from the *transaction context* alone: this
 * counter, this act, this run's seed. Two consequences, and both are
 * pinned by tests: the result cannot be reloaded away (a save reloaded
 * before the click produces the same answer), and a test can name the
 * exact context that wins.
 *
 * The outcome is still written to the ledger the instant it is made,
 * because determinism is a property of the model and persistence is a
 * property of the promise — "you had your go" must survive a re-tune of
 * the odds.
 */

/** Everything the roll depends on. Nothing here is live state. */
export interface HaggleContext {
  vendorId: VendorId;
  act: number;
  /** The run's own seed (GameState.rng.seed). */
  seed: number;
}

/** The stable seed a context rolls from. */
export function haggleSeed(context: HaggleContext): number {
  return hashSeed(`haggle:${context.vendorId}:${context.act}:${context.seed}`);
}

/** The roll a context makes, in [0, 1). Same context, same number. */
export function haggleRoll(context: HaggleContext): number {
  return nextFloat({ seed: haggleSeed(context) }).value;
}

export interface HaggleAttempt {
  /** Odds this attempt had, as a fraction. */
  chance: number;
  /** The context's own roll. */
  roll: number;
  won: boolean;
}

/**
 * How the argument goes at this much effective Cool. Below
 * HAGGLE.minCool the chance is zero and the roll can only lose — the
 * counter is not being talked down by somebody who cannot hold their
 * face.
 */
export function haggleAttempt(
  context: HaggleContext,
  cool: number,
): HaggleAttempt {
  const chance = haggleChance(cool);
  const roll = haggleRoll(context);
  return { chance, roll, won: roll < chance };
}

/** True when this much Cool is even allowed to try. */
export function canAttemptHaggle(cool: number): boolean {
  return cool >= HAGGLE.minCool;
}
