/**
 * Assists: four switches that make the game more legible or more
 * forgiving, each on its own and none of them tied to a difficulty
 * preset (see ./difficulty.ts). A player on Blackout can leave the
 * previews up; a player on Drift can turn everything off and still be
 * playing Drift.
 *
 * Every one of them is deterministic, for the same reason difficulty is:
 * an assist either changes a figure the math already produced, or
 * changes what is drawn. None of them touches a roll, so a seed plays
 * the same fight with every switch in every position.
 *
 * The catalog is content — id, label, and what it actually does in
 * words — and the switch positions are run state (see
 * src/state/rules.ts). Anything that reads an assist reads the state;
 * anything that *renders* the list reads this.
 */

/**
 * Least damage a landed blow of the player's deals with the floor on.
 * Two rather than one: the engine's own floor is already 1 (see
 * attackDamage), so an assist that promised one would promise nothing.
 */
export const ASSIST_DAMAGE_FLOOR = 2;

/**
 * Lockouts this run has to have collected before a lattice offers to
 * route itself. Counted across terminals rather than per terminal,
 * because a terminal is attempted once (see src/data/breach.ts) — there
 * is no such thing as failing the same one twice.
 */
export const BREACH_RESCUE_FAILURES = 3;

export const ASSIST_IDS = [
  "always-preview",
  "damage-floor",
  "bold-telegraphs",
  "breach-rescue",
] as const;

export type AssistId = (typeof ASSIST_IDS)[number];

export interface Assist {
  id: AssistId;
  /** The word the settings row puts on it. */
  label: string;
  /** What it does, said plainly. */
  blurb: string;
}

export const ASSISTS: readonly Assist[] = [
  {
    id: "always-preview",
    label: "Keep previews up",
    blurb:
      "The outcome chip stays on the likeliest target while an action " +
      "is open, instead of waiting for you to point at somebody. The " +
      "figures are the same figures — you just do not have to hunt for " +
      "them.",
  },
  {
    id: "damage-floor",
    label: "Damage floor",
    blurb:
      `A blow of yours that lands never deals less than ` +
      `${ASSIST_DAMAGE_FLOOR} points, however much plating it met. ` +
      "Misses still miss.",
  },
  {
    id: "bold-telegraphs",
    label: "Bold telegraphs",
    blurb:
      "Paints the marked ground — reach, range, impact, and the wind-up " +
      "somebody else has aimed at you — considerably stronger. Which " +
      "tiles are marked does not change.",
  },
  {
    id: "breach-rescue",
    label: "Breach rescue",
    blurb:
      `After ${BREACH_RESCUE_FAILURES} terminals have locked you out, a ` +
      "lattice offers to route itself. You take what the core holds and " +
      "none of the data along the way.",
  },
];

const byId = new Map(ASSISTS.map((entry) => [entry.id, entry]));

export function getAssist(id: string): Assist | undefined {
  return byId.get(id as AssistId);
}

export function requireAssist(id: string): Assist {
  const found = getAssist(id);
  if (!found) throw new Error(`No assist "${id}"`);
  return found;
}

/** Which switches are on. Always complete — every id, every time. */
export type AssistState = Record<AssistId, boolean>;

/** Everything off: what a fresh run plays with unless it says otherwise. */
export function noAssists(): AssistState {
  return Object.fromEntries(ASSIST_IDS.map((id) => [id, false])) as AssistState;
}

/**
 * Coerces any value into a complete switchboard: only `true` counts as
 * on, unknown keys are dropped, and a missing key is off. A save or a
 * settings payload from a build with fewer assists therefore comes back
 * with the newer ones off, which is the only reading that cannot switch
 * something on behind a player's back.
 */
export function clampAssists(value: unknown): AssistState {
  const record =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    ASSIST_IDS.map((id) => [id, record[id] === true]),
  ) as AssistState;
}

/** True when at least one switch is on. */
export function anyAssistOn(assists: AssistState): boolean {
  return ASSIST_IDS.some((id) => assists[id]);
}
