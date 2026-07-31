import type { ItemEffect } from "../inventory/items";

/**
 * Injuries: what a fight leaves behind when it nearly took you.
 *
 * A run that ends badly already has its answer — the defeat panel, the
 * autosave, the fight again. This is the other half: a fight the player
 * *won* while being taken apart costs them something that outlives the
 * arena, and then stops costing them, because a consequence that never
 * heals is a punishment for playing.
 *
 * ## The shape of the thing
 *
 * One injury at a time, per character. A second one that lands while
 * the first is still carried only replaces it when it is genuinely
 * worse (see `severity` and `worseInjury`), so a bad night stacks into
 * a bad injury rather than into a pile of them, and nobody is ever
 * reading four debuffs off a sheet.
 *
 * Every injury says what it does as a *named figure* that exactly one
 * derivation point in the game reads — the same rule the perks follow
 * (src/data/perks.ts). `effects` is the ordinary ItemEffect vocabulary,
 * so a wound's −1 Reflexes is folded in by the very same selector that
 * folds a coat's +1 (see effectiveStats); `dialogueCool` is subtracted
 * where the Static band's is (dialogueStats); `chromeOffline` is read
 * where granted abilities are collected (grantedAbilityIds). Nothing
 * anywhere branches on an injury id, so retuning this table moves the
 * game without touching a line of logic.
 *
 * ## Bounded on both ends
 *
 * `scenes` is how many moves across the city it takes to walk one off,
 * and `treatCost` is what a clinic charges to end it tonight. Both are
 * content: an injury the player cannot get rid of is not in this file,
 * because there is no way to author one.
 */

/**
 * What kind of harm an injury is, and therefore which fights hand it
 * out. A drawn injury is chosen by matching the fight's own record —
 * were they stunned, are they carrying chrome that could seize — so the
 * wound the player limps away with is about the fight they just had.
 */
export const INJURY_CAUSES = ["chrome", "concussion", "shot"] as const;

export type InjuryCause = (typeof INJURY_CAUSES)[number];

/**
 * Which cause wins when a fight matches more than one, most specific
 * first. Chrome seizing is the narrowest read (it needs implants that
 * could seize at all), a rung landed on the head is the next, and
 * "you got hurt" is the one that is always true — which is what makes
 * the table total: a won-but-bloody fight always draws something.
 */
export const INJURY_CAUSE_ORDER: readonly InjuryCause[] = INJURY_CAUSES;

export interface InjuryDef {
  id: string;
  name: string;
  /** What it is, in the player's own terms. Flavour, shown under the name. */
  description: string;
  /** What it costs, in one line, with nothing hidden. */
  effect: string;
  /** The fight that hands this one out (see INJURY_CAUSE_ORDER). */
  cause: InjuryCause;
  /** Worse replaces better; equal or lesser is shrugged off. */
  severity: number;
  /**
   * Stat shifts, said in the vocabulary gear already speaks so the
   * equipment selectors fold them with no new arithmetic anywhere.
   * Negative amounts, obviously — this is a wound.
   */
  effects: ItemEffect[];
  /**
   * Cool a *conversation* loses, and nothing a fight asks. Distinct
   * from a stat shift for the same reason the Static band's penalty is
   * (see src/data/static.ts): a rung across the temple does not make
   * anybody shoot worse, it makes them hard to listen to.
   */
  dialogueCool?: number;
  /**
   * While carried, abilities granted by installed cyberware are
   * offline. The implant is still in, still costing capacity and still
   * making noise — it simply will not answer.
   */
  chromeOffline?: boolean;
  /** Moves across the city before it heals on its own. */
  scenes: number;
  /** Credits a clinic charges to close it now. */
  treatCost: number;
}

/**
 * The pool. Deliberately short and deliberately unlike each other: one
 * costs speed, one costs composure, one costs the thing the player
 * spent capacity buying. No entry is a strictly worse version of
 * another, and each is a sentence about the fight it came out of.
 */
export const injuries: InjuryDef[] = [
  {
    id: "inj-winged",
    name: "Winged",
    cause: "shot",
    severity: 1,
    description:
      "Something went through the meat of the arm on its way past. The " +
      "field dressing holds. The arm argues about every fast thing you " +
      "ask it to do.",
    effect: "Reflexes −1 until it closes.",
    effects: [{ type: "stat-mod", stat: "reflexes", amount: -1 }],
    scenes: 3,
    treatCost: 45,
  },
  {
    id: "inj-concussed",
    name: "Concussed",
    cause: "concussion",
    severity: 2,
    description:
      "You remember the floor arriving and not much of the minute after " +
      "it. Sentences keep getting away from you halfway through.",
    effect: "Cool −2 in conversation. Fights are unaffected.",
    effects: [],
    dialogueCool: 2,
    scenes: 3,
    treatCost: 60,
  },
  {
    id: "inj-servo-lock",
    name: "Servo-Lock",
    cause: "chrome",
    severity: 3,
    description:
      "The chrome took the same beating you did and stopped taking " +
      "instructions. It is still in you, still humming, still costing " +
      "you the socket. It just will not answer.",
    effect: "Cyberware grants no abilities until it is reset.",
    effects: [],
    chromeOffline: true,
    scenes: 2,
    treatCost: 80,
  },
];

const injuriesById = new Map(injuries.map((injury) => [injury.id, injury]));

export function getInjury(id: string): InjuryDef | undefined {
  return injuriesById.get(id);
}

export function requireInjury(id: string): InjuryDef {
  const injury = injuriesById.get(id);
  if (!injury) throw new Error(`No injury with id "${id}"`);
  return injury;
}

/**
 * The injury a cause hands out, or undefined when the pool has nothing
 * for it. Content decides which wound a kind of fight leaves; the
 * combat layer only decides which causes the fight matched.
 */
export function injuryForCause(cause: InjuryCause): InjuryDef | undefined {
  return injuries.find((injury) => injury.cause === cause);
}

/**
 * The injury drawn for a fight that matched these causes: the first
 * cause in INJURY_CAUSE_ORDER the fight carries that the pool answers.
 * Null when it matched nothing the pool covers, which cannot happen
 * while "shot" is authored and always matched.
 */
export function drawInjury(
  causes: readonly InjuryCause[],
): InjuryDef | null {
  for (const cause of INJURY_CAUSE_ORDER) {
    if (!causes.includes(cause)) continue;
    const injury = injuryForCause(cause);
    if (injury) return injury;
  }
  return null;
}

/** What a clinic charges to close this injury tonight; 0 for an unknown id. */
export function injuryTreatCost(id: string): number {
  return getInjury(id)?.treatCost ?? 0;
}
