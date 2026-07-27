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
