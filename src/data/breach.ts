/**
 * What there is to breach, and what is in it.
 *
 * The minigame itself is engine (src/minigames/breach.ts) and knows
 * nothing about the city. This file is the content side: three
 * difficulties — the shape of the lattice each one generates and how
 * much room for error it leaves — and the terminals across the districts
 * that offer a run, each with what the core holds.
 *
 * ## How a reward is authored
 *
 * As ordinary story `Effect`s. A breach pays out through the same
 * `applyEffects` a dialogue choice does, so credits, items, and flags
 * need no vocabulary of their own here and a breach can never do
 * something a scene could not. Two things sit outside that list because
 * they are not effects: `shardId`, a memory shard pulled straight out of
 * the stack and filed like any pickup, and `partial`, which says whether
 * walking out early still pays for the data already harvested.
 *
 * The scaling half of the payout — credits per fragment of data, credits
 * per completed chain — is a rule rather than content, and lives with
 * the join in src/minigames/runner.ts. What a context authors is the
 * part that is unique to it.
 *
 * ## Fail states cost, but never block
 *
 * Every terminal is attempted once: the run's outcome is recorded under
 * `breach:<id>` and a recorded terminal will not open again. Losing one
 * therefore costs something real — the unlock, the advantage, the chip.
 * None of it is on the story's spine: the market locker and the salvage
 * cage both still have their authored keys, the executive floor's fight
 * is winnable with its drone up, and the Cordon precedent still lies on
 * the Ventworks floor for anybody with the Tech to read it. A breach is
 * a fourth key, never the only one.
 */
import type { Effect } from "../narrative/types";
import type { LatticeSpec } from "../minigames/breach";

export type BreachDifficultyId = "probe" | "guarded" | "hardened";

export interface BreachDifficulty {
  id: BreachDifficultyId;
  /** The word the overlay puts on the run. */
  label: string;
  /** One line of what routing this kind of lattice is like. */
  blurb: string;
  /** The grid a seed fills in. */
  lattice: LatticeSpec;
  /**
   * Budget over the lattice's own cheapest route. This is the whole of
   * what difficulty means: a hardened stack is not a bigger number, it
   * is less room to be wrong on a grid with more to be wrong about.
   */
  slack: number;
}

export const BREACH_DIFFICULTIES: readonly BreachDifficulty[] = [
  {
    id: "probe",
    label: "Probe",
    blurb: "Civil hardware. A watchdog or two, and nothing that logs.",
    lattice: {
      width: 5,
      height: 5,
      traces: 3,
      deads: 3,
      traceCost: [1, 2],
      value: [1, 3],
    },
    slack: 6,
  },
  {
    id: "guarded",
    label: "Guarded",
    blurb: "Somebody pays for this one to be watched. Route clean.",
    lattice: {
      width: 6,
      height: 5,
      traces: 5,
      deads: 4,
      traceCost: [2, 3],
      value: [1, 4],
    },
    slack: 5,
  },
  {
    id: "hardened",
    label: "Hardened",
    blurb: "Corp interdiction logic. It is counting your hops.",
    lattice: {
      width: 7,
      height: 5,
      traces: 7,
      deads: 5,
      traceCost: [2, 4],
      value: [2, 4],
    },
    slack: 4,
  },
];

const difficultiesById = new Map(
  BREACH_DIFFICULTIES.map((entry) => [entry.id, entry]),
);

export function breachDifficulty(id: BreachDifficultyId): BreachDifficulty {
  const found = difficultiesById.get(id);
  if (!found) throw new Error(`No breach difficulty "${id}"`);
  return found;
}

/** What a full breach is worth, beyond the data the route itself pays. */
export interface BreachRewards {
  /** Applied on a full breach, exactly as a choice's effects are. */
  effects?: readonly Effect[];
  /** A memory shard pulled out of the stack; filed like any pickup. */
  shardId?: string;
  /**
   * Whether withdrawing pays for the data harvested so far. False on
   * the terminals where there is nothing to carry out in your hands —
   * a security relay is either dark or it is not.
   */
  partial?: boolean;
}

export interface BreachContext {
  id: string;
  /** The terminal, as the overlay titles it. */
  name: string;
  /** The map it stands on; a lint pins the interactable to it. */
  mapId: string;
  difficulty: BreachDifficultyId;
  /** What the runner is looking at, before they jack in. */
  brief: string;
  /** What the core holds, said out loud before anybody commits. */
  prize: string;
  /** The line the terminal gives once it has already been run. */
  spent: string;
  rewards: BreachRewards;
}

/**
 * Four terminals, one per district that has something worth taking.
 * Deliberately spread across the acts and across the reward kinds: a
 * chip, two unlocks, and one advantage carried into a fight.
 */
export const BREACH_CONTEXTS: readonly BreachContext[] = [
  {
    // Act 2's on-ramp: the easiest lattice in the game, on the floor a
    // Tech build has every reason to be standing on anyway.
    id: "vent-archive",
    name: "Cordon Archive Stack",
    mapId: "exchange-ventworks",
    difficulty: "probe",
    brief:
      "A retired archive stack left racked against the coolant barrier, " +
      "still drawing trickle power off the main because nobody has ever " +
      "been paid to unplug it. The index is a civil one — old Waterworks " +
      "hardware, older than the Combine that inherited it — and it is " +
      "still politely offering to be read.",
    prize:
      "Somewhere under the corrosion is the Cordon's own precedent file: " +
      "the ruling the whole quarantine rests on, in the words it was " +
      "actually written in.",
    spent:
      "The stack answers with what it already gave you. There is nothing " +
      "else in it.",
    rewards: {
      shardId: "shard-cordon-precedent",
      effects: [
        { type: "credits", amount: 20 },
        { type: "set-flag", key: "vent-archive-read", value: true },
      ],
      partial: true,
    },
  },
  {
    id: "market-register",
    name: "Consignment Register",
    mapId: "vertical-market",
    difficulty: "guarded",
    brief:
      "The boards keep their own register, and it is a real one: every " +
      "locker on the gallery, who rented it, which week they stopped " +
      "paying, and which hasps the market's own crews have already been " +
      "asked to cut. The terminal is bolted to the scaffold at the end " +
      "of the east row with a chain through its handle.",
    prize:
      "A cut order with your route on it — the register will tell the " +
      "gallery's expired lockers that somebody is coming for one.",
    spent: "The register has already logged your cut order. It logs once.",
    rewards: {
      effects: [
        { type: "credits", amount: 25 },
        { type: "set-flag", key: "market-hasp-cut", value: true },
      ],
      partial: true,
    },
  },
  {
    id: "quays-lockgate",
    name: "Lockgate Control Cabinet",
    mapId: "flooded-quays",
    difficulty: "guarded",
    brief:
      "A control cabinet on the strand wall, wired to the lock hoists " +
      "that have not lifted anything since the Tide. The door was forced " +
      "years ago and left hanging. Behind it the boards are dry, lit, and " +
      "waiting for an instruction from a duty office that no longer exists.",
    prize:
      "The winch gear. Give the hoists a load to lift and the basin will " +
      "hand up whatever is chained to the strand.",
    spent:
      "The cabinet is already holding your instruction. It will not take " +
      "a second one.",
    rewards: {
      effects: [
        { type: "credits", amount: 20 },
        { type: "set-flag", key: "quays-hoist-cut", value: true },
      ],
      partial: true,
    },
  },
  {
    // The strongroom's own approach. Boss-adjacent on purpose: this is
    // the floor the Warden Chassis is cradled on, and the fight the
    // house calls when a claimant declines to leave it is the one the
    // relay is holding the drone for.
    id: "exec-muster",
    name: "Floor Muster Relay",
    mapId: "auric-executive",
    difficulty: "hardened",
    brief:
      "A service column keeping the directors' floor awake: registers, " +
      "door logs, and the muster relay that tells the house detail what " +
      "to bring when it is called. The interdiction logic behind it is " +
      "the tower's own, and it is the first thing on this level that has " +
      "looked at you properly.",
    prize:
      "The detail's drone sits on this relay's roster. Take it off and " +
      "whatever the floor calls tonight comes without its eye in the air.",
    spent:
      "The roster is already short one drone. There is nothing else on " +
      "it you can reach.",
    rewards: {
      // Nothing carried out in your hands, so nothing to keep by
      // walking early: the relay is either dark or it is not.
      effects: [{ type: "set-flag", key: "exec-muster-dark", value: true }],
      partial: false,
    },
  },
];

const contextsById = new Map(
  BREACH_CONTEXTS.map((context) => [context.id, context]),
);

export function getBreachContext(id: string): BreachContext | undefined {
  return contextsById.get(id);
}

export function requireBreachContext(id: string): BreachContext {
  const found = contextsById.get(id);
  if (!found) throw new Error(`No breach context "${id}"`);
  return found;
}

/** Every terminal offering a run on one map, in authored order. */
export function breachContextsOnMap(mapId: string): BreachContext[] {
  return BREACH_CONTEXTS.filter((context) => context.mapId === mapId);
}

/**
 * The flag a finished run is recorded under. One attempt per terminal:
 * the value is the outcome status, so a lockout closes the door exactly
 * as firmly as a breach does — which is what makes failing cost
 * something (see the file header for why that never blocks anybody).
 */
export function breachFlag(contextId: string): string {
  return `breach:${contextId}`;
}
