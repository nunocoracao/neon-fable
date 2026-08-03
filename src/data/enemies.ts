import type { CharacterVisual } from "../character/appearance";
import type { Stats } from "../character/stats";
import type { RangeType } from "../inventory/items";
import type { DroneArtId } from "../iso/art/drone";
import type { MechArtId } from "../iso/art/mech";
import {
  AURIC_AGENT_LOOKS,
  AURIC_COLLECTOR_LOOKS,
  AURIC_WARDEN_LOOKS,
  CORDON_ENFORCER_LOOKS,
  COURT_SAPPER_LOOKS,
  HALEX_PROXY_LOOKS,
  LOCUS_ASPECT_LOOKS,
  PUMP_CUSTODIAN_LOOKS,
  RUSTYARD_BRUISER_LOOKS,
  VAULT_SENTINEL_LOOKS,
  VENT_CRAWLER_LOOKS,
  type EnemyLookFamily,
} from "./enemyLooks";

/**
 * Enemy content. Enemies are pure typed data mirroring the player's combat
 * inputs (stats, weapon, armor, abilities); the combat engine builds
 * combatants from them. Encounters in encounters.ts place them on grids.
 *
 * ## How an archetype is drawn
 *
 * `spriteKind` says which art system draws it, and the rest of the
 * record follows from that tag:
 *
 * - `"humanoid"` — a look *family* of two or three authored records
 *   (./enemyLooks), each composed through the layered appearance
 *   pipeline. Which one a given spawn wears is the encounter's call
 *   (see spawnLookIndex in ./encounters), so a squad is a squad rather
 *   than a row of clones. Index 0 is the archetype's canonical read.
 * - `"drone"` — an authored non-humanoid chassis (../iso/art/drone).
 *   No appearance, no gear, no face; the renderer resolves the tag
 *   through the sprite-kind union in ../iso/art/entity and never asks
 *   what it is drawing.
 * - `"mech"` — an authored chassis too big to stand on one tile
 *   (../iso/art/mech): a 64×96 frame drawn over the block its
 *   `footprint` claims. Same union, same indifference downstream.
 *
 * ## How much floor an archetype stands on
 *
 * `footprint` is the other field that is not about numbers: absent means
 * the single tile everything on the board used to be, and a value claims
 * a block anchored at the spawn's minimum-x, minimum-y tile. Movement,
 * occupancy, reach, and every telegraph read it (see
 * ../combat/footprint.ts). It is a plain field on every archetype rather
 * than a property of being a boss — a two-tile barricade drone would
 * carry it just as well.
 *
 * Hostility reads through appearance data, not engine tinting: every
 * humanoid look carries a crimson or magenta optic (eyeColor) as the
 * hostile cue — enemies.test pins the convention across every record of
 * every family, and the drone's authored camera eye burns the same red.
 * Gear on a look is cosmetic only; combat numbers come from
 * stats/weapon/armor.
 */

export interface EnemyWeapon {
  name: string;
  damage: number;
  rangeType: RangeType;
}

/**
 * What an archetype is made of. Purely presentational so far: a body
 * crumples when it dies, a chassis sparks out (see ../iso/reaction.ts).
 */
export type EnemyChassis = "flesh" | "machine";

/** Which art system draws an archetype. */
export const ENEMY_SPRITE_KINDS = ["humanoid", "drone", "mech"] as const;

export type EnemySpriteKind = (typeof ENEMY_SPRITE_KINDS)[number];

/** Tiles an archetype stands on, anchored at its spawn position. */
export interface EnemyFootprint {
  width: number;
  height: number;
}

/** Everything an archetype is, apart from how it is drawn. */
interface EnemyBase {
  id: string;
  name: string;
  description: string;
  stats: Stats;
  maxHp: number;
  weapon: EnemyWeapon;
  /** Flat damage reduction, like an outfit's armor. */
  armor: number;
  /** Flesh or machine; decides how the archetype dies on screen. */
  chassis: EnemyChassis;
  /** Abilities from src/data/abilities.ts the enemy AI may use. */
  abilityIds: string[];
  /**
   * Tiles this archetype occupies, anchored at the spawn's position.
   * Absent is the single tile almost everything stands on.
   */
  footprint?: EnemyFootprint;
}

/** An archetype drawn by the layered appearance system. */
export interface HumanoidEnemy extends EnemyBase {
  spriteKind: "humanoid";
  /** The archetype's authored look family; index 0 is canonical. */
  looks: EnemyLookFamily;
}

/** An archetype drawn from an authored non-humanoid sprite set. */
export interface DroneEnemy extends EnemyBase {
  spriteKind: "drone";
  /** Authored chassis in ../iso/art/drone. */
  droneArt: DroneArtId;
}

/** An archetype drawn from an authored multi-tile chassis set. */
export interface MechEnemy extends EnemyBase {
  spriteKind: "mech";
  /** Authored chassis in ../iso/art/mech. */
  mechArt: MechArtId;
}

export type Enemy = HumanoidEnemy | DroneEnemy | MechEnemy;

export const enemies: Enemy[] = [
  {
    id: "nme-auric-agent",
    name: "Auric Retrieval Agent",
    description:
      "Corporate asset-recovery in a pressed gray coat. Polite, insured, " +
      "and carrying a sidearm the Combine will deny issuing.",
    stats: { body: 4, reflexes: 6, tech: 5, cool: 6, intelligence: 5 },
    maxHp: 12,
    weapon: { name: "Service Pistol", damage: 3, rangeType: "ranged" },
    armor: 1,
    chassis: "flesh",
    abilityIds: [],
    spriteKind: "humanoid",
    looks: AURIC_AGENT_LOOKS,
  },
  {
    id: "nme-rustyard-bruiser",
    name: "Rustyard Bruiser",
    description:
      "Scrapyard muscle with salvage-grade arm rigs and a length of " +
      "rebar. Negotiates exclusively in blunt trauma.",
    stats: { body: 7, reflexes: 4, tech: 3, cool: 4, intelligence: 3 },
    maxHp: 15,
    weapon: { name: "Rebar Club", damage: 4, rangeType: "melee" },
    armor: 0,
    chassis: "flesh",
    // No ability: the Rustyard's muscle is a length of rebar and
    // the arm rigs that swing it, and nothing else. Crush belongs
    // to industrial myomer (see cyb-myomer-arms) — a pair of Act 1
    // thugs throwing 7 armor-ignoring damage every other turn is
    // what made this the one fight no starting build could win.
    abilityIds: [],
    spriteKind: "humanoid",
    looks: RUSTYARD_BRUISER_LOOKS,
  },
  {
    id: "nme-static-drone",
    name: "Static Drone",
    description:
      "A rotor-ringed surveillance shell rewired to bite. Fast, fragile, " +
      "and trailing a halo of stolen charge off its stinger.",
    stats: { body: 3, reflexes: 8, tech: 6, cool: 3, intelligence: 4 },
    maxHp: 8,
    weapon: { name: "Arc Stinger", damage: 2, rangeType: "ranged" },
    armor: 0,
    chassis: "machine",
    abilityIds: ["ability-shock-dart"],
    // Not a person in a hood: an authored chassis, drawn outside the
    // layered appearance system entirely (../iso/art/drone).
    spriteKind: "drone",
    droneArt: "static-drone",
  },
  {
    id: "nme-vault-sentinel",
    name: "Vault Sentinel",
    description:
      "A slab of chromed security chassis that predates the Combine's " +
      "rebrand. Still following the last order anyone gave it.",
    stats: { body: 7, reflexes: 5, tech: 4, cool: 5, intelligence: 4 },
    maxHp: 28,
    weapon: { name: "Shock Maul", damage: 6, rangeType: "melee" },
    armor: 3,
    chassis: "machine",
    abilityIds: ["ability-stun-strike"],
    spriteKind: "humanoid",
    looks: VAULT_SENTINEL_LOOKS,
  },
  {
    id: "nme-auric-warden",
    name: "Auric Warden",
    description:
      "Reclamation-division security in flood-grey plate. Paid by the " +
      "hour to make sure nobody interferes with the water.",
    stats: { body: 6, reflexes: 5, tech: 4, cool: 5, intelligence: 4 },
    maxHp: 15,
    weapon: { name: "Riot Pistol", damage: 4, rangeType: "ranged" },
    armor: 1,
    chassis: "flesh",
    abilityIds: [],
    spriteKind: "humanoid",
    looks: AURIC_WARDEN_LOOKS,
  },
  {
    id: "nme-court-sapper",
    name: "Cistern Court Sapper",
    description:
      "A Greywater engineer in a patched wet-rig, cutter in hand. Fights " +
      "like someone defending the only home left below the waterline.",
    stats: { body: 5, reflexes: 6, tech: 7, cool: 4, intelligence: 5 },
    maxHp: 11,
    weapon: { name: "Spark Cutter", damage: 4, rangeType: "melee" },
    armor: 1,
    chassis: "flesh",
    abilityIds: ["ability-shock-dart"],
    spriteKind: "humanoid",
    looks: COURT_SAPPER_LOOKS,
  },
  {
    id: "nme-pump-custodian",
    name: "Pump Custodian",
    description:
      "The Undertow's original caretaker machine, barnacled with fifty " +
      "years of mineral crust. It still keeps the deck. It always will.",
    stats: { body: 8, reflexes: 3, tech: 2, cool: 6, intelligence: 2 },
    maxHp: 20,
    weapon: { name: "Valve Hammer", damage: 4, rangeType: "melee" },
    armor: 2,
    chassis: "machine",
    abilityIds: ["ability-stun-strike"],
    spriteKind: "humanoid",
    looks: PUMP_CUSTODIAN_LOOKS,
  },
  {
    id: "nme-cordon-enforcer",
    name: "Cordon Enforcer",
    description:
      "Halex's new security tier: matte-black interdiction plate over an " +
      "attitude of infinite patience. The Cordon does not argue. It waits.",
    stats: { body: 6, reflexes: 5, tech: 4, cool: 5, intelligence: 4 },
    maxHp: 20,
    weapon: { name: "Cordon Riot Gun", damage: 5, rangeType: "ranged" },
    armor: 2,
    chassis: "flesh",
    abilityIds: ["ability-riot-net"],
    spriteKind: "humanoid",
    looks: CORDON_ENFORCER_LOOKS,
  },
  {
    id: "nme-auric-collector",
    name: "Auric Collections Agent",
    description:
      "Contract enforcement in a good coat. Serves writs, collects debts, " +
      "and considers violence a late fee.",
    stats: { body: 5, reflexes: 6, tech: 4, cool: 6, intelligence: 5 },
    maxHp: 18,
    weapon: { name: "Writ-Server Pistol", damage: 5, rangeType: "ranged" },
    armor: 1,
    chassis: "flesh",
    abilityIds: [],
    spriteKind: "humanoid",
    looks: AURIC_COLLECTOR_LOOKS,
  },
  {
    id: "nme-vent-crawler",
    name: "Vent Crawler",
    description:
      "A duct-maintenance chassis that stopped taking orders years ago and " +
      "started taking parts. The vent crews seal its den with prayer tape.",
    stats: { body: 7, reflexes: 4, tech: 3, cool: 2, intelligence: 2 },
    maxHp: 22,
    weapon: { name: "Shear Mandibles", damage: 5, rangeType: "melee" },
    armor: 2,
    chassis: "machine",
    abilityIds: ["ability-coolant-vent"],
    spriteKind: "humanoid",
    looks: VENT_CRAWLER_LOOKS,
  },
  {
    id: "nme-halex-proxy",
    name: "Halex Mandate Proxy",
    description:
      "Director Halex's telepresence chassis: a polished civic idol with " +
      "the director's voice and none of the director's risk.",
    stats: { body: 7, reflexes: 5, tech: 6, cool: 7, intelligence: 6 },
    maxHp: 30,
    weapon: { name: "Mandate Lance", damage: 6, rangeType: "ranged" },
    armor: 1,
    chassis: "machine",
    abilityIds: ["ability-mandate-pulse"],
    spriteKind: "humanoid",
    looks: HALEX_PROXY_LOOKS,
  },
  {
    id: "nme-warden-chassis",
    name: "Warden Chassis",
    description:
      "Auric's interior-security answer to a floor nobody is supposed to " +
      "reach: two and a half metres of interdiction plate on a walking " +
      "cradle, a hydraulic arm rated for structural demolition, and a " +
      "shoulder battery it announces before it uses. It does not chase. " +
      "It arrives, it plants, and it tells you where the salvo is going.",
    stats: { body: 10, reflexes: 4, tech: 6, cool: 8, intelligence: 3 },
    maxHp: 46,
    weapon: { name: "Interdiction Piston", damage: 7, rangeType: "melee" },
    armor: 4,
    chassis: "machine",
    // The smash is what it does up close; the volley is the turn it
    // spends telling you it is coming (see ability-shoulder-volley).
    abilityIds: ["ability-shoulder-volley", "ability-piston-smash"],
    spriteKind: "mech",
    mechArt: "warden-chassis",
    // The first thing in the Sprawl that does not fit on one tile.
    footprint: { width: 2, height: 2 },
  },
  {
    id: "nme-locus-aspect",
    name: "Locus Custodial Aspect",
    description:
      "A founders-era custodial chassis in civic white, woken to see the " +
      "Succession through. It speaks in the Cordon's voice — the Cordon " +
      "always spoke in its.",
    stats: { body: 8, reflexes: 5, tech: 7, cool: 8, intelligence: 7 },
    maxHp: 40,
    weapon: { name: "Succession Writ", damage: 8, rangeType: "ranged" },
    armor: 1,
    chassis: "machine",
    abilityIds: ["ability-mandate-pulse"],
    spriteKind: "humanoid",
    looks: LOCUS_ASPECT_LOOKS,
  },
];

const enemiesById = new Map(enemies.map((e) => [e.id, e]));

export function getEnemy(id: string): Enemy | undefined {
  return enemiesById.get(id);
}

export function requireEnemy(id: string): Enemy {
  const enemy = enemiesById.get(id);
  if (!enemy) {
    throw new Error(`No enemy with id "${id}"`);
  }
  return enemy;
}

/**
 * How many looks an archetype can be drawn as. A humanoid has its
 * family; anything with an authored sprite set has exactly one, which
 * is what lets the encounter's pick run over every archetype without
 * asking what kind it is.
 */
export function enemyLookCount(enemy: Enemy): number {
  return enemy.spriteKind === "humanoid" ? enemy.looks.length : 1;
}

/**
 * One record of a humanoid archetype's look family, clamped into range
 * so a stale saved index can never blank a sprite. Undefined for
 * archetypes the layered appearance system does not draw.
 */
export function enemyLook(
  enemy: Enemy,
  index: number,
): CharacterVisual | undefined {
  if (enemy.spriteKind !== "humanoid") return undefined;
  const clamped = Math.min(
    Math.max(0, Math.trunc(index)),
    enemy.looks.length - 1,
  );
  return enemy.looks[clamped];
}

/** Separates an archetype id from the look index in a sprite id. */
const LOOK_SEPARATOR = "#";

/**
 * The renderer's id for one archetype wearing one of its looks. Two
 * spawns of the same archetype in different records get different
 * sprite ids — and therefore different composed looks and different
 * bake-cache entries — while two spawns of the same record share both.
 */
export function enemySpriteId(enemyId: string, lookIndex = 0): string {
  return `${enemyId}${LOOK_SEPARATOR}${Math.max(0, Math.trunc(lookIndex))}`;
}

/**
 * Read a sprite id back apart. Ids without a look suffix (and ids with
 * an unparseable one) read as the archetype's canonical look, so
 * anything that hands the provider a bare archetype id still renders.
 */
export function parseEnemySpriteId(spriteId: string): {
  enemyId: string;
  lookIndex: number;
} {
  const at = spriteId.lastIndexOf(LOOK_SEPARATOR);
  if (at < 0) return { enemyId: spriteId, lookIndex: 0 };
  const index = Number.parseInt(spriteId.slice(at + 1), 10);
  return {
    enemyId: spriteId.slice(0, at),
    lookIndex: Number.isFinite(index) && index >= 0 ? index : 0,
  };
}
