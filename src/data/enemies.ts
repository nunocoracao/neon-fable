import type { Stats } from "../character/stats";
import type { RangeType } from "../inventory/items";

/**
 * Enemy content. Enemies are pure typed data mirroring the player's combat
 * inputs (stats, weapon, armor, abilities); the combat engine builds
 * combatants from them. Encounters in encounters.ts place them on grids.
 */

export interface EnemyWeapon {
  name: string;
  damage: number;
  rangeType: RangeType;
}

export interface Enemy {
  id: string;
  name: string;
  description: string;
  stats: Stats;
  maxHp: number;
  weapon: EnemyWeapon;
  /** Flat damage reduction, like an outfit's armor. */
  armor: number;
  /** Abilities from src/data/abilities.ts the enemy AI may use. */
  abilityIds: string[];
}

export const enemies: Enemy[] = [
  {
    id: "nme-auric-agent",
    name: "Auric Retrieval Agent",
    description:
      "Corporate asset-recovery in a pressed gray coat. Polite, insured, " +
      "and carrying a sidearm the Combine will deny issuing.",
    stats: { body: 4, reflexes: 6, tech: 5, cool: 6, intelligence: 5 },
    maxHp: 14,
    weapon: { name: "Service Pistol", damage: 4, rangeType: "ranged" },
    armor: 1,
    abilityIds: [],
  },
  {
    id: "nme-rustyard-bruiser",
    name: "Rustyard Bruiser",
    description:
      "Scrapyard muscle with salvage-grade arm rigs and a length of " +
      "rebar. Negotiates exclusively in blunt trauma.",
    stats: { body: 8, reflexes: 4, tech: 3, cool: 4, intelligence: 3 },
    maxHp: 20,
    weapon: { name: "Rebar Club", damage: 5, rangeType: "melee" },
    armor: 1,
    abilityIds: ["ability-crush"],
  },
  {
    id: "nme-static-drone",
    name: "Static Drone",
    description:
      "A palm-sized surveillance drone rewired to bite. Fast, fragile, " +
      "and wreathed in a halo of stolen charge.",
    stats: { body: 3, reflexes: 8, tech: 6, cool: 3, intelligence: 4 },
    maxHp: 8,
    weapon: { name: "Arc Stinger", damage: 3, rangeType: "ranged" },
    armor: 0,
    abilityIds: ["ability-shock-dart"],
  },
  {
    id: "nme-vault-sentinel",
    name: "Vault Sentinel",
    description:
      "A slab of chromed security chassis that predates the Combine's " +
      "rebrand. Still following the last order anyone gave it.",
    stats: { body: 7, reflexes: 5, tech: 4, cool: 5, intelligence: 4 },
    maxHp: 24,
    weapon: { name: "Shock Maul", damage: 6, rangeType: "melee" },
    armor: 3,
    abilityIds: ["ability-stun-strike"],
  },
  {
    id: "nme-auric-warden",
    name: "Auric Warden",
    description:
      "Reclamation-division security in flood-grey plate. Paid by the " +
      "hour to make sure nobody interferes with the water.",
    stats: { body: 6, reflexes: 5, tech: 4, cool: 5, intelligence: 4 },
    maxHp: 16,
    weapon: { name: "Riot Pistol", damage: 4, rangeType: "ranged" },
    armor: 2,
    abilityIds: [],
  },
  {
    id: "nme-court-sapper",
    name: "Cistern Court Sapper",
    description:
      "A Greywater engineer in a patched wet-rig, cutter in hand. Fights " +
      "like someone defending the only home left below the waterline.",
    stats: { body: 5, reflexes: 6, tech: 7, cool: 4, intelligence: 5 },
    maxHp: 12,
    weapon: { name: "Spark Cutter", damage: 4, rangeType: "melee" },
    armor: 1,
    abilityIds: ["ability-shock-dart"],
  },
  {
    id: "nme-pump-custodian",
    name: "Pump Custodian",
    description:
      "The Undertow's original caretaker machine, barnacled with fifty " +
      "years of mineral crust. It still keeps the deck. It always will.",
    stats: { body: 8, reflexes: 3, tech: 2, cool: 6, intelligence: 2 },
    maxHp: 24,
    weapon: { name: "Valve Hammer", damage: 6, rangeType: "melee" },
    armor: 3,
    abilityIds: ["ability-stun-strike"],
  },
  {
    id: "nme-cordon-enforcer",
    name: "Cordon Enforcer",
    description:
      "Halex's new security tier: matte-black interdiction plate over an " +
      "attitude of infinite patience. The Cordon does not argue. It waits.",
    stats: { body: 6, reflexes: 5, tech: 4, cool: 5, intelligence: 4 },
    maxHp: 15,
    weapon: { name: "Cordon Riot Gun", damage: 4, rangeType: "ranged" },
    armor: 2,
    abilityIds: ["ability-riot-net"],
  },
  {
    id: "nme-auric-collector",
    name: "Auric Collections Agent",
    description:
      "Contract enforcement in a good coat. Serves writs, collects debts, " +
      "and considers violence a late fee.",
    stats: { body: 5, reflexes: 6, tech: 4, cool: 6, intelligence: 5 },
    maxHp: 13,
    weapon: { name: "Writ-Server Pistol", damage: 4, rangeType: "ranged" },
    armor: 1,
    abilityIds: [],
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
    abilityIds: ["ability-coolant-vent"],
  },
  {
    id: "nme-halex-proxy",
    name: "Halex Mandate Proxy",
    description:
      "Director Halex's telepresence chassis: a polished civic idol with " +
      "the director's voice and none of the director's risk.",
    stats: { body: 7, reflexes: 5, tech: 6, cool: 7, intelligence: 6 },
    maxHp: 24,
    weapon: { name: "Mandate Lance", damage: 5, rangeType: "ranged" },
    armor: 1,
    abilityIds: ["ability-mandate-pulse"],
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
