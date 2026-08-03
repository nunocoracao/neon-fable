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

/**
 * How far an ability spreads past the body it was aimed at. Absent means
 * it touches exactly that body's tile. Everything hostile standing on a
 * covered tile takes the ability's whole effect — damage and stun alike —
 * so a shape is the entire promise the telegraph makes.
 *
 * Shapes are resolved once, in src/combat/area.ts, and read by both the
 * engine (which damages exactly those bodies) and the grid telegraph
 * (which tints exactly those tiles).
 */
export type AbilityArea =
  /** A Manhattan disc centered on the target's tile. Radius 0 = one tile. */
  | { shape: "blast"; radius: number }
  /**
   * Every tile the shot crosses between caster and target, target
   * included: the lane, walked dominant-axis-first — the same rule the
   * arena moves and paths everything else by.
   */
  | { shape: "line" };

export interface Ability {
  id: string;
  name: string;
  description: string;
  /**
   * Maximum distance to the target, measured block to block — 1 = melee
   * reach, from whichever tile of the caster is nearest whichever tile
   * of the target (see src/combat/footprint.ts).
   */
  range: number;
  /** Turns the ability stays unusable after firing. */
  cooldown: number;
  effect: AbilityEffect;
  /** Tiles it covers around the target; absent hits that tile alone. */
  area?: AbilityArea;
  /**
   * Caster turns spent winding this up before it is thrown. Absent (or
   * 0) resolves on the spot, which is what almost everything does. A
   * positive count makes the ability *declared* rather than used: the
   * shape is frozen and marked on the ground at once, and it lands at
   * the start of the caster's turn this many turns later, on whatever is
   * standing in it by then. See src/combat/charge.ts — walking out of a
   * marked lane is the whole answer to a charged attack.
   */
  windUp?: number;
  /**
   * Which of the caster's attack animations throws this cast, for art
   * that has more than one (a chassis smashes with a piston and fires
   * with a shoulder cannon). 0 — its default swing — for everything
   * else, which is everything with a single authored set.
   */
  attackVariant?: number;
  /** The effect archetype this plays as; see src/iso/abilityFx.ts. */
  effectRef: AbilityFxId;
}

export const abilities: Ability[] = [
  {
    id: "ability-stun-strike",
    name: "Stun Strike",
    description:
      "A crackling overhead blow that scrambles nerves and servos alike, " +
      "dropping the target out of the fight for a beat. The discharge " +
      "jumps to anything pressed in beside them.",
    range: 1,
    cooldown: 3,
    effect: { type: "damage", amount: 2, stunTurns: 1 },
    // The arc earths itself through whoever is standing too close.
    area: { shape: "blast", radius: 1 },
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
    effect: { type: "damage", amount: 3 },
    effectRef: "shock-arc",
  },
  {
    id: "ability-riot-net",
    name: "Riot Net",
    description:
      "A weighted shock-mesh fired low and spinning. Being wrapped in one " +
      "costs you a beat of the fight and most of your dignity.",
    range: 4,
    cooldown: 4,
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
    cooldown: 3,
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
    cooldown: 5,
    // Straight into the nervous system: an override spike is not a
    // projectile and plate is not an answer to one. The one thing in
    // the Cordon's hands that a late-game runner's armour cannot
    // simply subtract away.
    effect: { type: "damage", amount: 5, ignoresArmor: true, stunTurns: 1 },
    // The Cordon speaks and *the room* stops: the override spike earths
    // through everything pressed in around the mark, which is what makes
    // standing beside a companion a decision in the fights that carry it.
    area: { shape: "blast", radius: 1 },
    effectRef: "optic-flash",
  },
  {
    id: "ability-overclock-burst",
    name: "Overclock Burst",
    description:
      "A trained micro-seizure of the reflex chain: three shots downrange " +
      "in the time most people spend deciding to flinch. Everything in " +
      "the lane is downrange.",
    range: 5,
    cooldown: 3,
    effect: { type: "damage", amount: 5 },
    // Three rounds walked down one lane; nobody standing in it is spared.
    area: { shape: "line" },
    effectRef: "volley-streak",
  },
  {
    // Granted only by the Burst Governor mod (see src/data/items.ts) —
    // the one ability in the game that comes off a part rather than a
    // whole weapon, which is why it reads as the weapon doing more
    // rather than the shooter knowing more.
    id: "ability-burst-fire",
    name: "Burst Fire",
    description:
      "The governor lets three rounds through where the trigger asked for " +
      "one. It is not aiming; it is arithmetic, and the arithmetic is " +
      "leaning on whoever the barrel happened to be pointing at.",
    range: 5,
    cooldown: 2,
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
    id: "ability-piston-smash",
    name: "Piston Smash",
    description:
      "Four tonnes of hydraulic arm brought down on a footprint the size " +
      "of a manhole. The floor takes most of it. You take the rest.",
    range: 1,
    cooldown: 2,
    effect: { type: "damage", amount: 7, ignoresArmor: true },
    // The deck cracks around the strike; anything pressed in beside the
    // body it landed on wears the shockwave too.
    area: { shape: "blast", radius: 1 },
    effectRef: "kinetic-slam",
  },
  {
    id: "ability-shoulder-volley",
    name: "Shoulder Volley",
    description:
      "The chassis plants, drops its shoulder battery into line, and " +
      "spends a full turn telling the room exactly where it intends to " +
      "put the salvo. Everything still standing in that lane when the " +
      "capacitors dump is downrange.",
    range: 6,
    cooldown: 3,
    effect: { type: "damage", amount: 7 },
    // One lane, walked from the chassis to the mark it called.
    area: { shape: "line" },
    // Called a turn ahead: the ground is marked the instant it plants,
    // and it fires at the start of its next turn — into the lane, not at
    // whoever was in it. Reading the floor is the counterplay.
    windUp: 1,
    // Thrown by the shoulder battery, not the piston arm.
    attackVariant: 1,
    effectRef: "volley-streak",
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
