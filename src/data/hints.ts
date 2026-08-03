import type { WizardStep } from "../character/wizard";

/**
 * Contextual hints: the game teaching itself by playing, one chip at a
 * time. Content only — the rules for when a chip is offered, which one
 * wins, and how it is remembered live in src/narrative/hints.ts; the
 * chip itself is src/ui/hintLayer.ts.
 *
 * ## What earns a hint
 *
 * A system gets exactly one chip, the first time the player is standing
 * in front of it. Not "the first time it exists" — the first time it is
 * *relevant*: the interact chip waits until something is actually in
 * reach, the Static chip waits until chrome is actually loading the
 * body. A hint that fires before the thing it explains is on screen is
 * a manual, and manuals get dismissed unread.
 *
 * ## The action-bar tour is spread over fights, not stacked
 *
 * The first fight is the densest screen in the game, so its concepts
 * are queued rather than shown: one per turn-start offer, highest
 * priority first, capped per fight (see COMBAT_HINT_BUDGET). Attack and
 * moving come out in the first fight; ending a turn and running away
 * wait for the next one. Every one of them is still once-only across
 * the whole run — the budget only decides *when*, never *whether*.
 *
 * ## Every line is dismissible and none of them is load-bearing
 *
 * A player who never reads a chip can still finish the game: everything
 * a hint says is also said by a button label, a tooltip, or a prompt.
 * They are a shortcut past the first half hour, not a dependency.
 */

/**
 * What has just happened, as the screens report it. One trigger may own
 * several hints (the action-bar tour); most own one.
 */
export type HintTrigger =
  | "explore"
  | "interact"
  | "combat-turn"
  | "combat-ability"
  | "injury"
  | "static"
  | "breach"
  | "vendor";

export interface Hint {
  /** Stable id; the save remembers it (see hintFlagKey). */
  id: string;
  trigger: HintTrigger;
  /** Two or three words naming the system, shown as the chip's kicker. */
  title: string;
  /** One sentence. Anything longer is a manual. */
  text: string;
  /**
   * Which chip wins when several are waiting. Higher first; ties fall
   * back to catalog order, so the table below is the tie-break and
   * reordering it is a real (and reviewable) change.
   */
  priority: number;
}

/**
 * How many hints one fight may spend. Two is enough to teach the two
 * things a first fight actually needs — that you attack from the bar,
 * and that you close the distance first — and leaves the rest for the
 * second fight, by which point the bar is familiar furniture.
 */
export const COMBAT_HINT_BUDGET = 2;

export const hints: readonly Hint[] = [
  // --- Exploration ---
  {
    id: "hint-move",
    trigger: "explore",
    title: "Getting around",
    text:
      "Click anywhere on the street to walk there, or steer with the " +
      "arrow keys. The wheel — or + and − — zooms.",
    priority: 100,
  },
  {
    id: "hint-interact",
    trigger: "interact",
    title: "In reach",
    text:
      "The line along the bottom names whatever you are stood beside. " +
      "Press Enter to take it up, or click the thing itself.",
    priority: 90,
  },

  // --- The action bar, one concept at a time ---
  {
    id: "hint-combat-attack",
    trigger: "combat-turn",
    title: "Your turn",
    text:
      "The bar along the bottom is your turn: one action and a few " +
      "steps. Attack spends the action — the button carries the odds.",
    priority: 80,
  },
  {
    id: "hint-combat-move",
    trigger: "combat-turn",
    title: "Closing in",
    text:
      "Move is free of your action and costs steps. Greyed-out Attack " +
      "usually means nothing is in reach yet — walk in first.",
    priority: 70,
  },
  {
    id: "hint-combat-end",
    trigger: "combat-turn",
    title: "Ending a turn",
    text:
      "End Turn hands the round on. Unspent steps do not carry over, so " +
      "there is rarely a reason to hold them back.",
    priority: 60,
  },
  {
    id: "hint-combat-flee",
    trigger: "combat-turn",
    title: "Walking away",
    text:
      "Flee carries its own odds on its face. A fight you cannot win is " +
      "not a fight you have to finish.",
    priority: 50,
  },
  {
    id: "hint-ability",
    trigger: "combat-ability",
    title: "Abilities",
    text:
      "Your chrome and your training buy you abilities: stronger than a " +
      "swing, and each on its own cooldown afterwards.",
    priority: 75,
  },

  // --- The systems that arrive later ---
  {
    id: "hint-injury",
    trigger: "injury",
    title: "You are hurt",
    text:
      "A wound rides with you until it is treated or walked off. Check " +
      "Inventory for what it costs you; a clinic will take it off.",
    priority: 85,
  },
  {
    id: "hint-static",
    trigger: "static",
    title: "Static",
    text:
      "Installed chrome loads your nerves with Static. Enough of it " +
      "starts costing you — Inventory shows the band you are in.",
    priority: 65,
  },
  {
    id: "hint-breach",
    trigger: "breach",
    title: "Breaching",
    text:
      "A breach is played on the lattice: route from the entry to the " +
      "core before the trace catches up with you.",
    priority: 95,
  },
  {
    id: "hint-vendor",
    trigger: "vendor",
    title: "Trading",
    text:
      "Counters buy as well as sell, and their stock moves between " +
      "chapters. Haggling is worth a try when you have the Cool for it.",
    priority: 95,
  },
];

/** One hint by id; undefined when the id is unknown. */
export function getHint(id: string): Hint | undefined {
  return hints.find((hint) => hint.id === id);
}

/** Every hint a trigger owns, in catalog order. */
export function hintsFor(
  trigger: HintTrigger,
  catalog: readonly Hint[] = hints,
): Hint[] {
  return catalog.filter((hint) => hint.trigger === trigger);
}

/**
 * Helper copy under each creation-wizard step title, for players who
 * have never finished a run. A returning player has made these choices
 * before and gets the step back without the commentary — see
 * `wizardHelpFor` in src/narrative/hints.ts, which is the only thing
 * allowed to decide that.
 */
export const WIZARD_STEP_HELP: Readonly<Record<WizardStep, string>> = {
  identity:
    "Pick the name the street will know you by. Everything else can " +
    "change later — this can't.",
  background:
    "Where you came from. It sets two stats, your starting gear, and " +
    "lines only you can say later on.",
  stats:
    "Spend the pool. Body soaks hits, Reflexes decide who swings first, " +
    "Tech and Intelligence open doors, Cool wins arguments.",
  appearance:
    "Your look, layer by layer. None of it changes how you play, and a " +
    "stylist in the city can change it back.",
  review: "Last look before the city gets a say. Any line can be edited.",
};
