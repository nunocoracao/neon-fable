import type { CharacterVisual } from "../character/appearance";
import type { Stats } from "../character/stats";
import type { RangeType } from "../inventory/items";

/**
 * Enemy content. Enemies are pure typed data mirroring the player's combat
 * inputs (stats, weapon, armor, abilities); the combat engine builds
 * combatants from them. Encounters in encounters.ts place them on grids.
 *
 * Hostility reads through appearance data, not engine tinting: every
 * archetype's visual carries a crimson or magenta optic (eyeColor) as
 * the hostile cue — enemies.test pins the convention. Gear on the
 * visual is cosmetic only; combat numbers come from stats/weapon/armor.
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
  /** Authored look, rendered through the layered appearance pipeline. */
  visual: CharacterVisual;
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
    // Pressed corporate gray: spire suit, slicked hair, crimson optics.
    visual: {
      appearance: {
        skinTone: "golden-tan",
        build: "lean",
        hairStyle: "slicked",
        hairColor: "raven",
        eyes: "narrow",
        eyeColor: "crimson",
        brows: "straight",
        mouth: "neutral",
        faceDetail: "none",
        headwear: "none",
      },
      outfit: "out-spire-suit",
      weapon: "wpn-compact-pistol",
    },
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
    // Scarred scrapyard bulk with salvage-grade chrome arms.
    visual: {
      appearance: {
        skinTone: "deep-umber",
        build: "heavy",
        hairStyle: "none",
        hairColor: "raven",
        eyes: "standard",
        eyeColor: "crimson",
        brows: "heavy",
        mouth: "frown",
        faceDetail: "scar",
        headwear: "none",
      },
      weapon: "wpn-stun-baton",
      enhancements: { arms: "cyb-myomer-arms" },
    },
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
    // Hooded shell, sensor band, breather grille: barely a face at all.
    visual: {
      appearance: {
        skinTone: "porcelain",
        build: "lean",
        hairStyle: "none",
        hairColor: "silver",
        eyes: "cyber-band",
        eyeColor: "crimson",
        brows: "straight",
        mouth: "breather",
        faceDetail: "circuit-ink",
        headwear: "hood",
      },
    },
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
    // Chromed security slab: plate, reinforced arms, dermal armor.
    visual: {
      appearance: {
        skinTone: "porcelain",
        build: "heavy",
        hairStyle: "none",
        hairColor: "silver",
        eyes: "cyber-band",
        eyeColor: "crimson",
        brows: "heavy",
        mouth: "breather",
        faceDetail: "none",
        headwear: "none",
      },
      outfit: "out-cordon-plate",
      weapon: "wpn-stun-baton",
      enhancements: { arms: "cyb-torsion-frame", dermal: "cyb-dermal-weave" },
    },
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
    // Flood-grey harness and a service cap pulled low over red optics.
    visual: {
      appearance: {
        skinTone: "warm-brown",
        build: "heavy",
        hairStyle: "buzz",
        hairColor: "raven",
        eyes: "narrow",
        eyeColor: "crimson",
        brows: "heavy",
        mouth: "frown",
        faceDetail: "none",
        headwear: "cap",
      },
      outfit: "out-diver-harness",
      weapon: "wpn-compact-pistol",
    },
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
    // Patched wet-rig, tied-back hair, magenta work-lenses.
    visual: {
      appearance: {
        skinTone: "golden-tan",
        build: "lean",
        hairStyle: "ponytail",
        hairColor: "auburn",
        eyes: "standard",
        eyeColor: "magenta",
        brows: "straight",
        mouth: "neutral",
        faceDetail: "none",
        headwear: "cap",
      },
      outfit: "out-diver-harness",
      weapon: "wpn-shard-knife",
    },
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
    // Mineral-crusted caretaker frame: dark shell, inked plating seams.
    visual: {
      appearance: {
        skinTone: "deep-umber",
        build: "heavy",
        hairStyle: "none",
        hairColor: "chestnut",
        eyes: "cyber-band",
        eyeColor: "crimson",
        brows: "heavy",
        mouth: "breather",
        faceDetail: "circuit-ink",
        headwear: "none",
      },
      weapon: "wpn-stun-baton",
      enhancements: { arms: "cyb-torsion-frame" },
    },
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
    // Matte interdiction plate under a tech hood; patient red stare.
    visual: {
      appearance: {
        skinTone: "porcelain",
        build: "heavy",
        hairStyle: "buzz",
        hairColor: "raven",
        eyes: "narrow",
        eyeColor: "crimson",
        brows: "straight",
        mouth: "frown",
        faceDetail: "none",
        headwear: "hood",
      },
      outfit: "out-cordon-plate",
      weapon: "wpn-rail-spitter",
    },
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
    // The good coat: ghostline mantle, silvered hair, magenta appraisal.
    visual: {
      appearance: {
        skinTone: "warm-brown",
        build: "lean",
        hairStyle: "slicked",
        hairColor: "silver",
        eyes: "narrow",
        eyeColor: "magenta",
        brows: "arched",
        mouth: "smirk",
        faceDetail: "none",
        headwear: "none",
      },
      outfit: "out-ghostline-mantle",
      weapon: "wpn-compact-pistol",
    },
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
    // Feral duct chassis: scarred shell, scavenged claw-arms, red band.
    visual: {
      appearance: {
        skinTone: "golden-tan",
        build: "lean",
        hairStyle: "none",
        hairColor: "raven",
        eyes: "cyber-band",
        eyeColor: "crimson",
        brows: "heavy",
        mouth: "breather",
        faceDetail: "scar",
        headwear: "none",
      },
      weapon: "wpn-shard-knife",
      enhancements: { arms: "cyb-myomer-arms" },
    },
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
    // Polished civic idol: spire suit, dyed scalp glyph, magenta band.
    visual: {
      appearance: {
        skinTone: "porcelain",
        build: "lean",
        hairStyle: "glyph",
        hairColor: "silver",
        eyes: "cyber-band",
        eyeColor: "magenta",
        brows: "arched",
        mouth: "neutral",
        faceDetail: "cyber-lines",
        headwear: "none",
      },
      outfit: "out-spire-suit",
      weapon: "wpn-spindle-projector",
      enhancements: { neural: "cyb-lattice-coprocessor" },
    },
  },
  {
    id: "nme-locus-aspect",
    name: "Locus Custodial Aspect",
    description:
      "A founders-era custodial chassis in civic white, woken to see the " +
      "Succession through. It speaks in the Cordon's voice — the Cordon " +
      "always spoke in its.",
    stats: { body: 8, reflexes: 5, tech: 7, cool: 8, intelligence: 7 },
    maxHp: 26,
    weapon: { name: "Succession Writ", damage: 5, rangeType: "ranged" },
    armor: 2,
    abilityIds: ["ability-mandate-pulse"],
    // Founders-era custodian in civic white, jacked into the registry.
    visual: {
      appearance: {
        skinTone: "porcelain",
        build: "heavy",
        hairStyle: "none",
        hairColor: "silver",
        eyes: "cyber-band",
        eyeColor: "crimson",
        brows: "straight",
        mouth: "breather",
        faceDetail: "circuit-ink",
        headwear: "none",
      },
      outfit: "out-ghostline-mantle",
      weapon: "wpn-spindle-projector",
      enhancements: { neural: "cyb-lattice-coprocessor", dermal: "cyb-dermal-weave" },
    },
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
