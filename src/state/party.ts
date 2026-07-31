import { getCompanion, type Companion } from "../data/companions";
import type { CarriedInjury } from "../character/injury";
import type { Stats } from "../character/stats";

/**
 * The party: companions the player has recruited, and which of them is
 * currently walking with them. Plain serializable data on GameState —
 * no classes, no functions — so a party survives the JSON round-trip a
 * save is, and every operation here is a pure function returning a new
 * PartyState.
 *
 * A member carries its *own* copy of everything that can change during
 * a run (stats, hp, gear, look, loyalty), seeded from the companion
 * record at recruitment. Content is the seed, never the live value:
 * rebalancing a companion in src/data/companions.ts must not silently
 * rewrite a save, and a member that a later build has no content for
 * still loads and still reads.
 *
 * `recruited` and `active` are separate on purpose. Recruited is the
 * permanent fact ("this one joined you"); active is the revocable one
 * ("this one is with you right now") — a benched companion keeps its
 * hp, its gear, and its loyalty for when it comes back.
 *
 * One companion is out at a time. The rule lives in
 * setActiveCompanion (and in recruitCompanion, which routes through
 * it), never in the readers: activeMembers still returns a list, so a
 * later build that takes two along changes this one function and
 * nothing that consumes it.
 */

/** What a party member wears and swings; mirrors EquipmentState's gear slots. */
export interface CompanionEquipment {
  weapon: string | null;
  outfit: string | null;
}

export interface PartyMember {
  /** Content id in src/data/companions.ts. */
  companionId: string;
  /** Appearance ref: which authored look of theirs they are wearing. */
  lookId: string;
  /** They have joined at least once; never goes back to false. */
  recruited: boolean;
  /** They are travelling and fighting with the player right now. */
  active: boolean;
  stats: Stats;
  maxHp: number;
  /** Persists between fights, exactly like the player's. */
  hp: number;
  equipment: CompanionEquipment;
  abilityIds: string[];
  /**
   * How this one is getting on with the player. Choices tagged with
   * reactions move it (see src/narrative/loyalty.ts), and a `loyalty`
   * requirement gates on it — one number a companion arc grows, rather
   * than a scatter of flags.
   */
  loyalty: number;
  /**
   * What the last bad fight left them with, or nothing. The same field,
   * the same rules and the same one-at-a-time limit the player's wound
   * follows (see src/character/injury.ts) — a companion is hurt in
   * exactly the way anybody else is.
   */
  injury?: CarriedInjury | null;
}

export interface PartyState {
  members: PartyMember[];
}

export type PartyErrorCode = "unknown-companion" | "not-recruited";

export class PartyError extends Error {
  constructor(
    readonly code: PartyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PartyError";
  }
}

/** A fresh, empty party — what a new game and an old save both start with. */
export function emptyParty(): PartyState {
  return { members: [] };
}

/** The member record for a companion id, or undefined when never met. */
export function getMember(
  party: PartyState,
  companionId: string,
): PartyMember | undefined {
  return party.members.find((m) => m.companionId === companionId);
}

export function isRecruited(party: PartyState, companionId: string): boolean {
  return getMember(party, companionId)?.recruited === true;
}

/**
 * The companions travelling with the player, in recruitment order. The
 * party structure is a list from the start so a second companion is
 * content, not a refactor; today's content recruits one.
 */
export function activeMembers(party: PartyState): PartyMember[] {
  return party.members.filter((m) => m.recruited && m.active);
}

/** The single active companion, or null — what exploration follows. */
export function activeMember(party: PartyState): PartyMember | null {
  return activeMembers(party)[0] ?? null;
}

/** A fresh member seeded from a companion record. */
export function memberFrom(companion: Companion): PartyMember {
  return {
    companionId: companion.id,
    lookId: companion.defaultLookId,
    recruited: true,
    active: true,
    stats: { ...companion.stats },
    maxHp: companion.maxHp,
    hp: companion.maxHp,
    equipment: {
      weapon: companion.weaponId,
      outfit: companion.outfitId,
    },
    abilityIds: [...companion.abilityIds],
    loyalty: 0,
  };
}

/**
 * Recruits a companion, seeding a member from content. Idempotent: a
 * second recruitment of somebody already in the party only makes them
 * active again (a story that re-recruits a benched companion must not
 * reset their hp or their loyalty). Whoever just joined is the one who
 * walks out with the player — anybody already out steps back.
 */
export function recruitCompanion(
  party: PartyState,
  companionId: string,
): PartyState {
  const companion = getCompanion(companionId);
  if (!companion) {
    throw new PartyError(
      "unknown-companion",
      `No companion with id "${companionId}"`,
    );
  }
  const joined = getMember(party, companionId)
    ? party
    : { ...party, members: [...party.members, memberFrom(companion)] };
  return setActiveCompanion(joined, companionId);
}

/** Benches or un-benches a recruited companion; unknown ids throw. */
export function setActive(
  party: PartyState,
  companionId: string,
  active: boolean,
): PartyState {
  return updateMember(party, companionId, (member) => ({ ...member, active }));
}

/**
 * Takes one companion out and benches the rest — the party screen's
 * whole job, and the invariant everything downstream (the follower on
 * the map, the ally in the arena, whose aside lands) reads through
 * activeMember. `null` benches everybody, which is how a player goes
 * back to working alone; unknown or un-recruited ids throw.
 */
export function setActiveCompanion(
  party: PartyState,
  companionId: string | null,
): PartyState {
  if (companionId !== null && !getMember(party, companionId)) {
    throw new PartyError(
      "not-recruited",
      `Companion "${companionId}" is not in the party`,
    );
  }
  return {
    ...party,
    members: party.members.map((member) => {
      const active = member.recruited && member.companionId === companionId;
      return member.active === active ? member : { ...member, active };
    }),
  };
}

/** Writes a companion's hp back, clamped to [0, maxHp]. */
export function setCompanionHp(
  party: PartyState,
  companionId: string,
  hp: number,
): PartyState {
  return updateMember(party, companionId, (member) => ({
    ...member,
    hp: Math.max(0, Math.min(member.maxHp, Math.round(hp))),
  }));
}

/** What a companion is carrying out of their last bad fight, or null. */
export function companionInjury(
  party: PartyState,
  companionId: string,
): CarriedInjury | null {
  return getMember(party, companionId)?.injury ?? null;
}

/**
 * Writes a companion's injury — the one they take, the one time passes
 * on, or null when a clinic closes it. Unlike setCompanionHp this takes
 * the finished value rather than a rule, because the rules (worst
 * replaces, time counted off) are pure and shared with the player's
 * (see src/character/injury.ts).
 */
export function setCompanionInjury(
  party: PartyState,
  companionId: string,
  injury: CarriedInjury | null,
): PartyState {
  return updateMember(party, companionId, (member) =>
    (member.injury ?? null) === injury ? member : { ...member, injury },
  );
}

/** Where a companion stands; somebody never met stands at nothing. */
export function loyaltyOf(party: PartyState, companionId: string): number {
  return getMember(party, companionId)?.loyalty ?? 0;
}

/** Moves a companion's loyalty by `delta`; the total is unbounded. */
export function adjustLoyalty(
  party: PartyState,
  companionId: string,
  delta: number,
): PartyState {
  return updateMember(party, companionId, (member) => ({
    ...member,
    loyalty: member.loyalty + delta,
  }));
}

/** Re-dresses a companion: their appearance ref, and their gear. */
export function restyleCompanion(
  party: PartyState,
  companionId: string,
  change: { lookId?: string; equipment?: Partial<CompanionEquipment> },
): PartyState {
  return updateMember(party, companionId, (member) => ({
    ...member,
    lookId: change.lookId ?? member.lookId,
    equipment: { ...member.equipment, ...change.equipment },
  }));
}

function updateMember(
  party: PartyState,
  companionId: string,
  update: (member: PartyMember) => PartyMember,
): PartyState {
  const member = getMember(party, companionId);
  if (!member) {
    throw new PartyError(
      "not-recruited",
      `Companion "${companionId}" is not in the party`,
    );
  }
  return {
    ...party,
    members: party.members.map((m) => (m === member ? update(m) : m)),
  };
}
