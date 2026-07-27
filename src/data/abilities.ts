import type { StatKey } from "../character/stats";

/**
 * Combat ability content. Abilities are granted by items (grant-ability
 * effects on weapons/enhancements) or listed on enemies; the combat engine
 * interprets them. Pure typed data — no functions.
 */

export type AbilityEffect =
  | {
      type: "damage";
      amount: number;
      /** Skip the target's armor reduction. */
      ignoresArmor?: boolean;
      /** Turns the target skips after being hit. */
      stunTurns?: number;
    }
  | { type: "boost"; stat: StatKey; amount: number; turns: number };

export interface Ability {
  id: string;
  name: string;
  description: string;
  /** Maximum Manhattan distance to the target; 1 = melee reach. */
  range: number;
  /** Turns the ability stays unusable after firing. */
  cooldown: number;
  effect: AbilityEffect;
}

export const abilities: Ability[] = [
  {
    id: "ability-stun-strike",
    name: "Stun Strike",
    description:
      "A crackling overhead blow that scrambles nerves and servos alike, " +
      "dropping the target out of the fight for a beat.",
    range: 1,
    cooldown: 3,
    effect: { type: "damage", amount: 2, stunTurns: 1 },
  },
  {
    id: "ability-crush",
    name: "Crush",
    description:
      "Industrial myomer grip brought to bear on something that was not " +
      "rated for it. Armor plating does not help.",
    range: 1,
    cooldown: 2,
    effect: { type: "damage", amount: 7, ignoresArmor: true },
  },
  {
    id: "ability-shock-dart",
    name: "Shock Dart",
    description:
      "A dart of compressed static spat across the room. Cheap, fast, and " +
      "nastier than it looks.",
    range: 5,
    cooldown: 2,
    effect: { type: "damage", amount: 4 },
  },
  {
    id: "ability-riot-net",
    name: "Riot Net",
    description:
      "A weighted shock-mesh fired low and spinning. Being wrapped in one " +
      "costs you a beat of the fight and most of your dignity.",
    range: 4,
    cooldown: 3,
    effect: { type: "damage", amount: 2, stunTurns: 1 },
  },
  {
    id: "ability-coolant-vent",
    name: "Coolant Vent",
    description:
      "A gout of scalding cycler coolant dumped straight from the reservoir. " +
      "Armor plate conducts it beautifully.",
    range: 2,
    cooldown: 2,
    effect: { type: "damage", amount: 4, ignoresArmor: true },
  },
  {
    id: "ability-mandate-pulse",
    name: "Mandate Pulse",
    description:
      "A broadcast override spike tuned to civic hardware — and, at this " +
      "range, to nervous systems. The Cordon speaks and the room stops.",
    range: 5,
    cooldown: 3,
    effect: { type: "damage", amount: 4, stunTurns: 1 },
  },
  {
    id: "ability-combat-focus",
    name: "Combat Focus",
    description:
      "A practiced breathing loop that slows the world down. Reflexes " +
      "sharpen for a few heartbeats.",
    range: 0,
    cooldown: 4,
    effect: { type: "boost", stat: "reflexes", amount: 2, turns: 2 },
  },
];

const abilitiesById = new Map(abilities.map((a) => [a.id, a]));

export function getAbility(id: string): Ability | undefined {
  return abilitiesById.get(id);
}

export function requireAbility(id: string): Ability {
  const ability = abilitiesById.get(id);
  if (!ability) {
    throw new Error(`No ability with id "${id}"`);
  }
  return ability;
}
