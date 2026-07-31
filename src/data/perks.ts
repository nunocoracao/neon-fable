/**
 * Perks: the small, permanent habits a runner picks up once the street
 * has decided who they are.
 *
 * A perk is content and nothing else. Every one of them declares its
 * effect as a *named figure* in `PerkEffects`, and exactly one
 * derivation point in the engine reads each figure — armor is folded by
 * `armorValue`, healing by `healedAmount`, conversation Cool by
 * `dialogueStats`, and so on. Nothing anywhere branches on a perk id,
 * so a re-tune here moves the game without touching a line of logic,
 * and a perk that granted nothing would be a perk that does nothing
 * rather than a special case somebody forgot to write.
 *
 * The folding rules live with the modifiers (src/character/perks.ts);
 * what a milestone is and when one is reached lives with the rest of
 * advancement (src/data/advancement.ts).
 */

/**
 * Which part of the game a perk is about. Purely presentational — the
 * pick overlay groups by it and the character sheet labels it — but
 * authored deliberately: the pool has to keep offering a fight-fixer, a
 * talker, and a quartermaster, whatever else it grows.
 */
export const PERK_DOMAINS = ["combat", "dialogue", "inventory"] as const;

export type PerkDomain = (typeof PERK_DOMAINS)[number];

/**
 * Everything a perk can change, as figures. Absent is always "no
 * change" — never a special value — so folding an empty pool and
 * folding no pool at all produce the same record.
 */
export interface PerkEffects {
  /** Percent added to healing this character receives from items. */
  healingPercent?: number;
  /** Percent added to how much a dampener implant quiets. */
  dampenerPercent?: number;
  /** Neural capacity on top of the figure the stat line derives. */
  neuralCapacity?: number;
  /** Armor on top of whatever the outfit provides. */
  armorBonus?: number;
  /** Grid steps added to every combat turn's budget. */
  extraSteps?: number;
  /**
   * Turns of warning on what the hostiles mean to do. 0 is the ordinary
   * blind read — you learn who a body was going for when it reaches
   * them. 1 marks whoever each one is about to strike, a turn early
   * (see intentTiles in src/combat/telegraph.ts).
   */
  enemyIntent?: number;
  /** Share of max HP (percent) a blow has to drop you below to answer. */
  secondWindBelow?: number;
  /** Share of max HP (percent) the answer gives back. */
  secondWindRecover?: number;
  /** Cool added to every conversation read, and to nothing a fight asks. */
  dialogueCool?: number;
  /**
   * Points of the Static band's Cool penalty a conversation stops
   * charging you. Distinct from `dialogueCool`: this one is worth
   * nothing to a quiet runner and everything to a screaming one.
   */
  staticPoise?: number;
  /** Standing added when a door asks a faction how it feels about you. */
  factionRapport?: number;
}

export interface Perk {
  id: string;
  name: string;
  domain: PerkDomain;
  /** Who this makes you; flavour, shown under the name. */
  description: string;
  /** What it does, in the player's own terms. One line, no numbers hidden. */
  effect: string;
  /** The figures it moves. Never empty — a perk that does nothing is a bug. */
  effects: PerkEffects;
}

/**
 * The pool. Every pick is permanent and comes off this list, so it is
 * deliberately short and deliberately spread: no entry is a strictly
 * better version of another, and each one is a sentence about how the
 * run is played rather than a percentage on a sheet.
 */
export const perks: Perk[] = [
  {
    id: "perk-gutter-surgeon",
    name: "Gutter Surgeon",
    domain: "inventory",
    description:
      "You learned medicine the way the Sprawl teaches everything — on " +
      "somebody who was already bleeding, with what was in the bag.",
    effect: "Healing items restore half again as much.",
    effects: { healingPercent: 50 },
  },
  {
    id: "perk-chrome-whisperer",
    name: "Chrome Whisperer",
    domain: "inventory",
    description:
      "Implants talk. Most people learn to ignore them; you learned to " +
      "answer, and the noise settles for you the way it does for nobody else.",
    effect: "Dampeners quiet half again as much Static.",
    effects: { dampenerPercent: 50 },
  },
  {
    id: "perk-load-bearer",
    name: "Load Bearer",
    domain: "inventory",
    description:
      "Some frames reject chrome. Yours has stopped arguing about it.",
    effect: "Neural capacity +1 — one more point of implant fits.",
    effects: { neuralCapacity: 1 },
  },
  {
    id: "perk-cold-read",
    name: "Cold Read",
    domain: "combat",
    description:
      "You stopped watching the weapon and started watching the shoulder. " +
      "Everyone tells you where they are going a beat before they go.",
    effect:
      "Whoever a hostile is about to strike is marked a turn before the " +
      "blow, reach and approach counted in.",
    effects: { enemyIntent: 1 },
  },
  {
    id: "perk-second-wind",
    name: "Second Wind",
    domain: "combat",
    description:
      "The first time a fight takes you apart, something in you refuses " +
      "to file the paperwork.",
    effect:
      "Once per fight, the blow that drops you under a third of your " +
      "frame gives a quarter of it back.",
    effects: { secondWindBelow: 33, secondWindRecover: 25 },
  },
  {
    id: "perk-pain-editor",
    name: "Pain Editor",
    domain: "combat",
    description:
      "A cheap subdermal trick: the signal still arrives, it just arrives " +
      "later, and quieter, and after you have moved.",
    effect: "Armor +1 against everything.",
    effects: { armorBonus: 1 },
  },
  {
    id: "perk-ghost-step",
    name: "Ghost Step",
    domain: "combat",
    description:
      "Rooftop distance is not measured in metres. It is measured in how " +
      "little of you is on the ground at any moment.",
    effect: "One extra step of movement every combat turn.",
    effects: { extraSteps: 1 },
  },
  {
    id: "perk-silver-tongue",
    name: "Silver Tongue",
    domain: "dialogue",
    description:
      "You have been thrown out of better rooms than this one, and you " +
      "have talked your way back into most of them.",
    effect: "Cool +1 in every conversation — and at every counter.",
    effects: { dialogueCool: 1 },
  },
  {
    id: "perk-poker-face",
    domain: "dialogue",
    name: "Poker Face",
    description:
      "Your implants scream and your face does not hear them. People " +
      "who have never met a dampener assume you simply are not wired.",
    effect:
      "A screaming loadout costs you up to 2 less Cool in conversation.",
    effects: { staticPoise: 2 },
  },
  {
    id: "perk-known-face",
    name: "Known Face",
    domain: "dialogue",
    description:
      "Nobody can name the job. Everybody remembers the face, and " +
      "everybody remembers it slightly better than it deserves.",
    effect:
      "Every faction reads you ten points warmer when a door asks their " +
      "opinion.",
    effects: { factionRapport: 10 },
  },
];

const perksById = new Map(perks.map((perk) => [perk.id, perk]));

export function getPerk(id: string): Perk | undefined {
  return perksById.get(id);
}

export function requirePerk(id: string): Perk {
  const perk = perksById.get(id);
  if (!perk) throw new Error(`No perk with id "${id}"`);
  return perk;
}

/** Every perk in one domain, in pool order. */
export function perksIn(domain: PerkDomain): Perk[] {
  return perks.filter((perk) => perk.domain === domain);
}
