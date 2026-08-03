/**
 * Encounter content: which enemies spawn where on which arena grid, and
 * what winning pays out. Grids are small and match future iso combat
 * arenas (positions are tile coordinates).
 *
 * ## Which look a spawn wears
 *
 * Humanoid archetypes come as look families (see ./enemyLooks). A spawn
 * either pins a record with `look` — for a scene that wants a specific
 * face across the table — or leaves it to spawnLookIndex, a seeded pick
 * stable per encounter and slot. Stable means what it says: the same
 * fight staffs itself with the same faces on every replay, on every
 * reload, and in every session, because the seed is the encounter id and
 * the slot index and nothing else. No RNG state is consumed, so look
 * variety can never shift a damage roll.
 */
import type { FlagMap } from "../state/flags";
import { createRng, nextInt } from "../state/rng";
import { enemyLookCount, getEnemy } from "./enemies";
import { takedownFlag } from "./stealth";

export interface EncounterPosition {
  x: number;
  y: number;
}

export interface EncounterSpawn {
  enemyId: string;
  position: EncounterPosition;
  /**
   * Pins this spawn to one record of the archetype's look family;
   * out-of-range values clamp. Omit to take the seeded pick.
   */
  look?: number;
  /**
   * A flag that keeps this body out of the fight while it holds true —
   * how work done before a fight shows up inside one. Two things write
   * one: a Breach run at a terminal that takes a drone off a muster
   * roster (see src/data/breach.ts), and a silent takedown on a
   * patrolling guard (see src/data/stealth.ts). The rule is
   * deliberately narrow: a spawn can be *absent*, never added, moved,
   * or re-statted, so an encounter with the flag unset is byte-for-byte
   * the fight it always was.
   *
   * Never put one on the last body in an encounter — a fight with
   * nobody in it cannot be won. `encounters.test.ts` fails on that.
   */
  absentWhenFlag?: string;
}

export interface EncounterRewardItem {
  itemId: string;
  quantity?: number;
}

export interface EncounterRewards {
  credits: number;
  items?: EncounterRewardItem[];
}

export interface Encounter {
  id: string;
  name: string;
  grid: { width: number; height: number };
  /**
   * Iso map (src/data/maps.ts) the battle is fought on. Its dimensions
   * must match `grid` — combat positions are the map's tile coordinates.
   */
  arenaMapId: string;
  playerStart: EncounterPosition;
  enemies: EncounterSpawn[];
  rewards: EncounterRewards;
  /** Whether the flee action is allowed; defaults to true. */
  fleeable?: boolean;
  /**
   * A named antagonist's fight, rather than a fight with some bodies in
   * it. Nothing in the combat rules reads this — it is a presentation
   * fact, and the one thing that reads it is the score, which puts an
   * extra layer over the district's combat mix for these
   * (src/audio/score.ts). Kept as an authored field rather than derived
   * from the roster because "this is the set piece" is a writing
   * decision: a two-tile chassis is not automatically a boss and a
   * one-tile antagonist is not automatically not.
   */
  boss?: boolean;
}

export const encounters: Encounter[] = [
  {
    id: "enc-auric-scout",
    name: "Auric Scout Team",
    grid: { width: 8, height: 6 },
    arenaMapId: "undercroft-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [
      { enemyId: "nme-auric-agent", position: { x: 6, y: 2 } },
      { enemyId: "nme-static-drone", position: { x: 6, y: 4 } },
    ],
    rewards: {
      credits: 45,
      items: [{ itemId: "con-trauma-patch" }],
    },
  },
  {
    id: "enc-rustyard-ambush",
    name: "Rustyard Ambush",
    grid: { width: 7, height: 7 },
    arenaMapId: "rustyard-arena",
    playerStart: { x: 3, y: 6 },
    enemies: [
      // Pinned: the ambush is two named faces of the crew, not a coin flip.
      { enemyId: "nme-rustyard-bruiser", position: { x: 1, y: 1 }, look: 1 },
      { enemyId: "nme-rustyard-bruiser", position: { x: 5, y: 1 }, look: 2 },
    ],
    rewards: {
      credits: 45,
      items: [{ itemId: "con-surge-stim" }],
    },
  },
  {
    id: "enc-vault-guardian",
    name: "Vault Guardian",
    grid: { width: 8, height: 6 },
    arenaMapId: "vault-arena",
    playerStart: { x: 1, y: 2 },
    enemies: [
      { enemyId: "nme-vault-sentinel", position: { x: 6, y: 3 } },
      { enemyId: "nme-auric-agent", position: { x: 7, y: 1 } },
    ],
    rewards: {
      credits: 90,
      items: [{ itemId: "con-trauma-patch", quantity: 2 }],
    },
    fleeable: false,
  },
  {
    id: "enc-pump-gate",
    name: "Pump-Deck Gate Wardens",
    grid: { width: 8, height: 6 },
    arenaMapId: "undercroft-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [
      { enemyId: "nme-auric-warden", position: { x: 6, y: 2 }, look: 0 },
      { enemyId: "nme-auric-warden", position: { x: 6, y: 4 }, look: 1 },
    ],
    rewards: {
      credits: 45,
      items: [{ itemId: "con-trauma-patch" }],
    },
  },
  {
    id: "enc-pumpworks-court",
    name: "Pumpworks Assault",
    grid: { width: 9, height: 7 },
    arenaMapId: "pumpworks-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [
      { enemyId: "nme-auric-warden", position: { x: 7, y: 2 } },
      { enemyId: "nme-static-drone", position: { x: 7, y: 4 } },
    ],
    rewards: {
      credits: 55,
      items: [{ itemId: "con-trauma-patch" }],
    },
    fleeable: false,
  },
  {
    id: "enc-pumpworks-inner",
    name: "The Custodian's Deck",
    grid: { width: 9, height: 7 },
    arenaMapId: "pumpworks-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [{ enemyId: "nme-pump-custodian", position: { x: 7, y: 3 } }],
    rewards: {
      credits: 55,
      items: [{ itemId: "con-surge-stim" }],
    },
    fleeable: false,
  },
  {
    id: "enc-pumpworks-voss",
    name: "Pumpworks Holdout",
    grid: { width: 9, height: 7 },
    arenaMapId: "pumpworks-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [
      // The whole Court crew, one of each: everyone Voss could raise.
      { enemyId: "nme-court-sapper", position: { x: 7, y: 2 }, look: 0 },
      { enemyId: "nme-court-sapper", position: { x: 6, y: 5 }, look: 1 },
      { enemyId: "nme-court-sapper", position: { x: 7, y: 3 }, look: 2 },
    ],
    rewards: {
      credits: 55,
      items: [{ itemId: "con-trauma-patch" }],
    },
    fleeable: false,
  },
  {
    id: "enc-relay-crown",
    name: "Relay Crown Interdiction",
    grid: { width: 7, height: 6 },
    arenaMapId: "relay-crown-arena",
    playerStart: { x: 3, y: 5 },
    enemies: [
      { enemyId: "nme-auric-agent", position: { x: 3, y: 0 } },
      { enemyId: "nme-static-drone", position: { x: 5, y: 1 } },
    ],
    rewards: {
      credits: 55,
      items: [{ itemId: "con-trauma-patch" }],
    },
    fleeable: false,
  },
  {
    id: "enc-exchange-gate",
    name: "Exchange Gate Checkpoint",
    grid: { width: 8, height: 6 },
    arenaMapId: "vault-arena",
    playerStart: { x: 1, y: 2 },
    enemies: [
      { enemyId: "nme-cordon-enforcer", position: { x: 6, y: 1 }, look: 0 },
      { enemyId: "nme-cordon-enforcer", position: { x: 6, y: 4 }, look: 2 },
    ],
    rewards: {
      credits: 85,
      items: [{ itemId: "con-trauma-patch" }],
    },
  },
  {
    id: "enc-collectors",
    name: "Collections Call",
    grid: { width: 8, height: 6 },
    arenaMapId: "undercroft-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [
      { enemyId: "nme-auric-collector", position: { x: 6, y: 2 } },
      { enemyId: "nme-static-drone", position: { x: 6, y: 4 } },
    ],
    rewards: {
      credits: 125,
      items: [{ itemId: "con-trauma-patch" }],
    },
    fleeable: false,
  },
  {
    id: "enc-vent-crawler",
    name: "The Coolant Vault Den",
    grid: { width: 9, height: 7 },
    arenaMapId: "cycler-floor-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [{ enemyId: "nme-vent-crawler", position: { x: 7, y: 3 } }],
    rewards: {
      credits: 80,
      items: [{ itemId: "con-field-kit" }],
    },
  },
  {
    id: "enc-cordon-court",
    name: "The Cordon Core — Sapper Breach",
    grid: { width: 9, height: 7 },
    arenaMapId: "cycler-floor-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [{ enemyId: "nme-halex-proxy", position: { x: 7, y: 3 }, look: 0 }],
    rewards: {
      credits: 110,
      items: [{ itemId: "con-trauma-patch", quantity: 2 }],
    },
    fleeable: false,
  },
  {
    id: "enc-cordon-voss",
    name: "The Cordon Core — Eleven Seconds",
    grid: { width: 9, height: 7 },
    arenaMapId: "cycler-floor-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [
      { enemyId: "nme-halex-proxy", position: { x: 7, y: 3 }, look: 0 },
      { enemyId: "nme-static-drone", position: { x: 7, y: 1 } },
    ],
    rewards: {
      credits: 110,
      items: [{ itemId: "con-field-kit" }],
    },
    fleeable: false,
  },
  {
    id: "enc-cordon-lone",
    name: "The Cordon Core — Uninvited",
    grid: { width: 9, height: 7 },
    arenaMapId: "cycler-floor-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [
      { enemyId: "nme-halex-proxy", position: { x: 7, y: 3 }, look: 0 },
      { enemyId: "nme-static-drone", position: { x: 6, y: 5 } },
    ],
    rewards: {
      credits: 125,
      items: [{ itemId: "con-field-kit" }],
    },
    fleeable: false,
  },
  {
    id: "enc-spire-gate",
    name: "Registry Gate Interdiction",
    grid: { width: 8, height: 6 },
    arenaMapId: "vault-arena",
    playerStart: { x: 1, y: 2 },
    enemies: [
      { enemyId: "nme-cordon-enforcer", position: { x: 6, y: 1 } },
      { enemyId: "nme-auric-warden", position: { x: 6, y: 4 } },
      { enemyId: "nme-static-drone", position: { x: 7, y: 2 } },
    ],
    rewards: {
      credits: 155,
      items: [{ itemId: "con-trauma-patch" }],
    },
  },
  {
    id: "enc-spire-collectors",
    name: "The Trust's Collectors",
    grid: { width: 8, height: 6 },
    arenaMapId: "vault-arena",
    playerStart: { x: 1, y: 2 },
    enemies: [
      { enemyId: "nme-auric-collector", position: { x: 6, y: 1 }, look: 0 },
      { enemyId: "nme-auric-collector", position: { x: 6, y: 4 }, look: 1 },
    ],
    rewards: {
      credits: 185,
      items: [{ itemId: "con-field-kit" }],
    },
    fleeable: false,
  },
  {
    // The Vertical Market's fight, staged and waiting: the district's
    // arena and its shakedown crew are authored here so a later story
    // beat only has to point a choice at this id. Nothing in the
    // narrative starts it yet.
    id: "enc-market-scaffold",
    name: "Scaffold Row Shakedown",
    grid: { width: 9, height: 7 },
    arenaMapId: "market-scaffold-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [
      { enemyId: "nme-rustyard-bruiser", position: { x: 7, y: 2 } },
      { enemyId: "nme-rustyard-bruiser", position: { x: 7, y: 4 } },
      { enemyId: "nme-static-drone", position: { x: 6, y: 5 } },
    ],
    rewards: {
      credits: 85,
      items: [{ itemId: "con-surge-stim" }],
    },
  },
  {
    // The Flooded Quays' fight, staged the same way: the walkway arena
    // and what comes up it are authored ahead of the beat that will use
    // them. Nothing in the narrative starts it yet.
    id: "enc-quays-salvage",
    name: "Lockgate Walkway Toll",
    grid: { width: 9, height: 7 },
    arenaMapId: "quays-walkway-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [
      // The two hands who work the spans, and whatever the crew keeps
      // in the water under the catwalk. Either hand can be taken off
      // the roster before the shooting by somebody who crossed quietly
      // (see the store-crossing zone in ./stealth.ts); the thing under
      // the boards cannot, which is why it is the body that guarantees
      // this fight always has somebody in it.
      {
        enemyId: "nme-rustyard-bruiser",
        position: { x: 7, y: 3 },
        absentWhenFlag: takedownFlag("store-crossing", "west-hand"),
      },
      {
        enemyId: "nme-rustyard-bruiser",
        position: { x: 7, y: 5 },
        absentWhenFlag: takedownFlag("store-crossing", "east-hand"),
      },
      { enemyId: "nme-vent-crawler", position: { x: 6, y: 5 } },
    ],
    rewards: {
      credits: 85,
      items: [{ itemId: "con-field-kit" }],
    },
  },
  {
    // The executive floor's own fight: the house detail that works the
    // directors' level, called when a claimant declines to leave it.
    id: "enc-exec-security",
    name: "Executive Floor Detail",
    grid: { width: 9, height: 7 },
    arenaMapId: "exec-floor-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [
      // The detail itself. The lead can be stood down before the
      // shooting by somebody who crossed the floor quietly and got a
      // hand over a mouth (see the exec-detail zone in ./stealth.ts);
      // the second wears Cordon interdiction plate, which is the whole
      // reason there is nothing to get a hand around — and the reason
      // this fight can never be walked into empty.
      {
        enemyId: "nme-auric-warden",
        position: { x: 7, y: 2 },
        absentWhenFlag: takedownFlag("exec-detail", "lead"),
      },
      { enemyId: "nme-cordon-enforcer", position: { x: 7, y: 4 } },
      // The floor's eye in the air, and the one body on this level that
      // can be dealt with before the shooting: it rides the muster
      // relay's roster, and a Breach run at that relay takes it off.
      {
        enemyId: "nme-static-drone",
        position: { x: 6, y: 5 },
        absentWhenFlag: "exec-muster-dark",
      },
    ],
    rewards: {
      credits: 160,
      items: [{ itemId: "con-trauma-patch", quantity: 2 }],
    },
  },
  {
    // The executive floor's strongroom detail: one Warden Chassis, which
    // is two tiles by two of it (see nme-warden-chassis). Spawned at
    // (6, 2) it stands on (6,2)-(7,3) — the block has to fit the 9×7
    // arena, and a maps.test lint checks exactly that for every spawn.
    id: "enc-exec-warden",
    name: "The Warden Chassis",
    grid: { width: 9, height: 7 },
    arenaMapId: "exec-floor-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [{ enemyId: "nme-warden-chassis", position: { x: 6, y: 2 } }],
    rewards: {
      credits: 250,
      items: [{ itemId: "con-field-kit" }, { itemId: "con-trauma-patch", quantity: 2 }],
    },
    // A strongroom door does not let you back out of the room.
    fleeable: false,
    boss: true,
  },
  {
    id: "enc-crown-court",
    name: "The Crown Ring — Sappers' Breach",
    grid: { width: 9, height: 7 },
    arenaMapId: "spire-crown-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [{ enemyId: "nme-locus-aspect", position: { x: 7, y: 3 }, look: 0 }],
    rewards: {
      credits: 230,
      items: [{ itemId: "con-field-kit" }],
    },
    fleeable: false,
    boss: true,
  },
  {
    id: "enc-crown-auric",
    name: "The Crown Ring — Chair's Override",
    grid: { width: 9, height: 7 },
    arenaMapId: "spire-crown-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [
      { enemyId: "nme-locus-aspect", position: { x: 7, y: 3 }, look: 0 },
      { enemyId: "nme-static-drone", position: { x: 7, y: 1 } },
    ],
    rewards: {
      credits: 230,
      items: [{ itemId: "con-trauma-patch", quantity: 2 }],
    },
    fleeable: false,
    boss: true,
  },
  {
    id: "enc-crown-alone",
    name: "The Crown Ring — Unfiled",
    grid: { width: 9, height: 7 },
    arenaMapId: "spire-crown-arena",
    playerStart: { x: 1, y: 3 },
    enemies: [
      { enemyId: "nme-locus-aspect", position: { x: 7, y: 3 }, look: 0 },
      { enemyId: "nme-cordon-enforcer", position: { x: 6, y: 5 } },
    ],
    rewards: {
      credits: 240,
      items: [{ itemId: "con-field-kit" }],
    },
    fleeable: false,
    boss: true,
  },
];

const encountersById = new Map(encounters.map((e) => [e.id, e]));

export function getEncounter(id: string): Encounter | undefined {
  return encountersById.get(id);
}

export function requireEncounter(id: string): Encounter {
  const encounter = encountersById.get(id);
  if (!encounter) {
    throw new Error(`No encounter with id "${id}"`);
  }
  return encounter;
}

/** One body that is actually turning up, and the slot it was authored in. */
export interface LiveSpawn {
  spawn: EncounterSpawn;
  /** Index in the encounter's own list — never the filtered one. */
  slot: number;
}

/**
 * The bodies a fight actually starts with, given what the run has done
 * to the world. Absent spawns drop out; everybody else keeps their
 * authored slot, so the faces a fight staffs itself with and the ids
 * the log names are identical whether or not somebody stood a drone
 * down first (see spawnLookIndex, and EncounterSpawn.absentWhenFlag).
 */
export function liveSpawns(encounter: Encounter, flags: FlagMap): LiveSpawn[] {
  return encounter.enemies.flatMap((spawn, slot) =>
    spawn.absentWhenFlag !== undefined && flags[spawn.absentWhenFlag] === true
      ? []
      : [{ spawn, slot }],
  );
}

/**
 * A stable numeric seed for one encounter slot: FNV-1a over the
 * encounter id and the slot index. Pure, and identical across sessions
 * — a fight's faces are part of the fight, not of the playthrough.
 */
export function spawnLookSeed(encounterId: string, slot: number): number {
  let hash = 0x811c9dc5;
  const source = `${encounterId}:${slot}`;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Which record of an archetype's look family the spawn in this slot
 * wears: the pinned index when the encounter names one, otherwise a
 * seeded pick from the family. Always in range for the family (a
 * one-look archetype — anything with an authored sprite set — always
 * comes back 0), so the caller never has to bounds-check.
 */
export function spawnLookIndex(
  encounterId: string,
  slot: number,
  spawn: EncounterSpawn,
): number {
  // An unknown archetype has one look: whatever the provider falls back to.
  const enemy = getEnemy(spawn.enemyId);
  const count = enemy ? enemyLookCount(enemy) : 1;
  if (spawn.look !== undefined) {
    return Math.min(Math.max(0, Math.trunc(spawn.look)), count - 1);
  }
  if (count <= 1) return 0;
  return nextInt(createRng(spawnLookSeed(encounterId, slot)), 0, count - 1).value;
}
