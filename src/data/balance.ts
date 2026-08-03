/**
 * What the fights are supposed to feel like, written down as numbers.
 *
 * Balance is the one part of the game that cannot be read off the code:
 * every figure in ./enemies.ts, ./abilities.ts and ./difficulty.ts is
 * locally sensible and only the *whole* of them decides whether a fight
 * is a fight. So the intent lives here, as content — which encounter is
 * met at which point in a run, and what a healthy result looks like —
 * and the simulation harness (src/combat/sim) measures the real engine
 * against it. Nothing in the game reads this file at runtime; the tests
 * do, which is exactly the point: a data edit that breaks the curve
 * fails CI rather than shipping.
 *
 * ## Progression tiers
 *
 * A run has three rough shapes, and every encounter is written for one
 * of them:
 *
 * - **opening** — the intro and Chapter 1. Background starting gear, no
 *   chrome, no advancement, a patch or two in the bag.
 * - **mid** — Chapter 2 and the side-quest chains. One tier-2 piece, a
 *   first implant, one unlocked ability, one perk, a small kit.
 * - **late** — Chapter 3 and the finale. Tier-2 weapon and coat, a
 *   modded weapon, two implants, two abilities, two perks, a real bag.
 *
 * "At-level" means a build of the encounter's own tier. That is the only
 * cell the targets below make a promise about — walking a Chapter 1 kit
 * into the Crown Ring is allowed to go badly.
 *
 * ## The targets
 *
 * Deliberately coarse. They are wide enough that an ordinary content
 * edit — a weapon's damage moved a point, an enemy given four more
 * frame — does not turn CI red, and tight enough to catch the two
 * failures that actually matter: a fight nobody can win, and a fight
 * nobody can lose.
 */

/** Where in a run an encounter is written to be met. */
export type ProgressionTier = "opening" | "mid" | "late";

export const PROGRESSION_TIERS: readonly ProgressionTier[] = [
  "opening",
  "mid",
  "late",
];

/** What kind of promise a fight makes: a night's work, or the set piece. */
export type EncounterClass = "standard" | "boss";

export interface EncounterBalance {
  /** Id in ./encounters.ts. */
  encounterId: string;
  tier: ProgressionTier;
  /** Set pieces are allowed — required — to be harder than the rest. */
  class: EncounterClass;
}

/**
 * Every authored encounter, tiered. The list is exhaustive by test
 * (balance.test.ts fails on an encounter with no entry), so a new fight
 * cannot quietly escape the sweep.
 */
export const encounterBalance: readonly EncounterBalance[] = [
  // --- Opening: the intro and Chapter 1 --------------------------------
  { encounterId: "enc-auric-scout", tier: "opening", class: "standard" },
  { encounterId: "enc-rustyard-ambush", tier: "opening", class: "standard" },
  { encounterId: "enc-pump-gate", tier: "opening", class: "standard" },
  { encounterId: "enc-pumpworks-court", tier: "opening", class: "standard" },
  { encounterId: "enc-pumpworks-inner", tier: "opening", class: "standard" },
  { encounterId: "enc-pumpworks-voss", tier: "opening", class: "standard" },
  { encounterId: "enc-relay-crown", tier: "opening", class: "standard" },
  // --- Mid: Chapter 2 and the side-quest chains ------------------------
  { encounterId: "enc-vault-guardian", tier: "mid", class: "standard" },
  { encounterId: "enc-exchange-gate", tier: "mid", class: "standard" },
  { encounterId: "enc-collectors", tier: "mid", class: "standard" },
  { encounterId: "enc-vent-crawler", tier: "mid", class: "standard" },
  { encounterId: "enc-market-scaffold", tier: "mid", class: "standard" },
  { encounterId: "enc-quays-salvage", tier: "mid", class: "standard" },
  { encounterId: "enc-cordon-court", tier: "mid", class: "standard" },
  { encounterId: "enc-cordon-voss", tier: "mid", class: "standard" },
  { encounterId: "enc-cordon-lone", tier: "mid", class: "standard" },
  // --- Late: Chapter 3 and the finale ----------------------------------
  { encounterId: "enc-spire-gate", tier: "late", class: "standard" },
  { encounterId: "enc-spire-collectors", tier: "late", class: "standard" },
  { encounterId: "enc-exec-security", tier: "late", class: "standard" },
  { encounterId: "enc-exec-warden", tier: "late", class: "boss" },
  { encounterId: "enc-crown-court", tier: "late", class: "boss" },
  { encounterId: "enc-crown-auric", tier: "late", class: "boss" },
  { encounterId: "enc-crown-alone", tier: "late", class: "boss" },
];

const balanceById = new Map(
  encounterBalance.map((entry) => [entry.encounterId, entry]),
);

export function getEncounterBalance(
  encounterId: string,
): EncounterBalance | undefined {
  return balanceById.get(encounterId);
}

export function requireEncounterBalance(encounterId: string): EncounterBalance {
  const entry = balanceById.get(encounterId);
  if (!entry) {
    throw new Error(`No balance entry for encounter "${encounterId}"`);
  }
  return entry;
}

/** Every encounter written for one tier, in authored order. */
export function encountersAtTier(tier: ProgressionTier): EncounterBalance[] {
  return encounterBalance.filter((entry) => entry.tier === tier);
}

/**
 * What a healthy cell looks like. Every figure is a *band*, and both
 * ends of every band mean something:
 *
 * - `minWinRate` is the floor across all at-level builds pooled. Below
 *   it the fight is a wall rather than a fight.
 * - `maxWinRate` is the ceiling. Above it nothing is being asked; a
 *   standard fight is allowed to be nearly free at the top end, a set
 *   piece is not.
 * - `minBuildWinRate` is the promise that no build is hard-gated out:
 *   the *worst* at-level build must still clear it. This is the figure
 *   the whole exercise exists for — a dumped-Body talker on the middle
 *   preset has to be able to finish the campaign.
 * - `minRounds` / `maxRounds` are the turn envelope, measured as the
 *   mean round count of decided fights. Too short and the fight is a
 *   coin flip nobody played; too long and it is arithmetic.
 * - `maxHealthLeft` is how much frame a *won* fight may leave behind. It
 *   is how "demanding" is actually measured: a win rate can only say
 *   whether the fight was survived, and a set piece that everybody
 *   survives at nine tenths of their frame was not a set piece. A
 *   standard fight is allowed to be cheap, so its figure is open.
 */
export interface BalanceTarget {
  minWinRate: number;
  maxWinRate: number;
  minBuildWinRate: number;
  minRounds: number;
  maxRounds: number;
  maxHealthLeft: number;
}

/**
 * The targets, per encounter class, measured at-level on the middle
 * preset (Grind). Drift and Blackout are checked separately, as an
 * *ordering* rather than a band — see DIFFICULTY_ORDERING below — because
 * what a preset promises is "kinder" or "harder", not a number.
 */
export const BALANCE_TARGETS: Readonly<Record<EncounterClass, BalanceTarget>> =
  {
    standard: {
      // A night's work at the right time of the run is winnable, and a
      // well-kitted party is allowed to walk through one — the promise
      // a standard fight makes is about its floor, not its ceiling.
      minWinRate: 0.8,
      maxWinRate: 1,
      // And winnable by *everybody*: the worst at-level build still
      // takes better than half of them.
      minBuildWinRate: 0.55,
      // Long enough to be a fight, short enough to be a scene.
      minRounds: 2,
      maxRounds: 18,
      maxHealthLeft: 1,
    },
    boss: {
      // Demanding but fair. "Fair" is the floor and the ceiling on the
      // *cost*, not on the win rate: a set piece is allowed to be won
      // reliably by a party that came prepared, as long as winning it
      // takes a real share of the frame off everybody.
      minWinRate: 0.5,
      maxWinRate: 1,
      // Even the build the boss is worst for gets a real shot at it.
      minBuildWinRate: 0.25,
      minRounds: 3,
      maxRounds: 26,
      // The one figure that makes a boss a boss: you do not walk out of
      // one at three quarters.
      maxHealthLeft: 0.75,
    },
  };

/**
 * What the presets promise relative to one another, as the sweep can
 * actually measure it: Drift is never harder than Grind, and Blackout is
 * never kinder. Stated as a tolerance rather than a strict inequality
 * because a pooled win rate is a sample — two presets can land a point
 * apart on a fight that everybody wins either way, and that is not a
 * regression.
 */
export const DIFFICULTY_ORDERING = {
  /** Win rate Drift may fall below Grind by before it is a bug. */
  driftSlack: 0.05,
  /** Win rate Blackout may rise above Grind by before it is a bug. */
  blackoutSlack: 0.05,
} as const;

/**
 * How much the optional systems are allowed to be worth. Both ends are
 * a design promise:
 *
 * - `minEdge` — stims, perks and mods have to *show* in the outcomes.
 *   A system nobody can measure is a system nobody will use.
 * - `maxEdge` — and they have to stay optional. A build that skips all
 *   of them still finishes the campaign, so no single system may be
 *   worth more than this much win rate on its own.
 */
export const OPTIONAL_SYSTEM_EDGE = {
  minEdge: 0.01,
  maxEdge: 0.4,
} as const;
