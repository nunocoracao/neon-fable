import type { StatKey } from "../character/stats";
import type { AbilityFxId } from "../iso/abilityFx";

/**
 * Combat ability content. Abilities are granted by items (grant-ability
 * effects on weapons/enhancements) or listed on enemies; the combat engine
 * interprets them. Pure typed data — no functions.
 *
 * Every ability also says what it *looks* like, by naming one of the
 * effect archetypes in src/iso/abilityFx.ts. The reference is typed, so
 * an ability cannot name a look that does not exist, and several
 * abilities may share one: a stun strike and a shock dart are the same
 * arc thrown at different reaches. Nothing downstream branches on an
 * ability id — the scene resolves the archetype and plays it.
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
  /** The effect archetype this plays as; see src/iso/abilityFx.ts. */
  effectRef: AbilityFxId;
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
    effectRef: "shock-arc",
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
    effectRef: "kinetic-slam",
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
    effectRef: "shock-arc",
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
    effectRef: "snare-mesh",
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
    effectRef: "nano-cloud",
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
    effectRef: "optic-flash",
  },
  {
    id: "ability-overclock-burst",
    name: "Overclock Burst",
    description:
      "A trained micro-seizure of the reflex chain: three shots downrange " +
      "in the time most people spend deciding to flinch.",
    range: 5,
    cooldown: 3,
    effect: { type: "damage", amount: 5 },
    effectRef: "volley-streak",
  },
  {
    id: "ability-shatter-hand",
    name: "Shatter Hand",
    description:
      "A strike drilled against pump housings and lock plates, aimed at " +
      "where a thing carries its own weight. Plating folds around it.",
    range: 1,
    cooldown: 3,
    effect: { type: "damage", amount: 6, ignoresArmor: true },
    effectRef: "kinetic-slam",
  },
  {
    id: "ability-bulwark-surge",
    name: "Bulwark Surge",
    description:
      "A diver's trick for the crush at depth: flood the frame with " +
      "borrowed strength and let the body argue with physics for a while.",
    range: 0,
    cooldown: 4,
    effect: { type: "boost", stat: "body", amount: 2, turns: 2 },
    effectRef: "guard-shimmer",
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
    effectRef: "focus-ring",
  },
];

/** An ability purchasable with advancement points. */
export interface AdvancementPoolEntry {
  abilityId: string;
  /** Advancement points the unlock costs. */
  cost: number;
}

/**
 * Abilities the advancement system can unlock (see
 * src/character/advancement.ts). Costs are content, not code.
 */
export const advancementPool: AdvancementPoolEntry[] = [
  { abilityId: "ability-combat-focus", cost: 1 },
  { abilityId: "ability-bulwark-surge", cost: 1 },
  { abilityId: "ability-overclock-burst", cost: 2 },
  { abilityId: "ability-shatter-hand", cost: 2 },
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
