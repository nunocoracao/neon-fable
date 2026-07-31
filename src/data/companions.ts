import type { CharacterVisual } from "../character/appearance";
import type { Stats } from "../character/stats";

/**
 * Companion content: the people who travel with the player and fight
 * beside them. Pure typed data, exactly like enemies — the party state
 * (src/state/party.ts) seeds itself from a record here when a companion
 * is recruited and never reaches back into it for anything mutable.
 *
 * A companion is written the way a player character is: base stats,
 * gear by item id, and one or more authored *looks*. A look is a
 * CharacterVisual, so a companion composes through the same layered
 * appearance pipeline as the player, an NPC, and an enemy — the sprite
 * on the street, the body in the arena, and the portrait in the
 * initiative rail are one set of data. The recruited party member
 * stores which look it wears (its appearance ref) and its own copy of
 * the gear, so a later task can re-dress a companion without touching
 * content.
 *
 * Friendly faces keep off the crimson/magenta optics reserved for
 * enemies (see the hostility convention in ./enemies.ts).
 */

/** One authored look a companion can wear; `id` is the appearance ref. */
export interface CompanionLook {
  id: string;
  label: string;
  visual: CharacterVisual;
}

/**
 * The kinds of act a companion has an opinion about. A choice is tagged
 * with the reactions it *is* (see Choice.reactions) and every companion
 * standing there when it is taken scores it against their own values —
 * so a beat is authored once and two people can read it differently,
 * rather than every scene hard-coding who gains what.
 *
 * Six tags, chosen so they pull against each other: taking a thing
 * versus logging it, telling power where to go versus building the case
 * that ends it, a straight answer versus a useful lie.
 */
export const REACTION_TAGS = [
  /** Helping somebody who cannot pay you for it. */
  "mercy",
  /** Taking what is lying there, because it is lying there. */
  "salvage",
  /** Telling power, to its face, that it does not own the room. */
  "defiance",
  /** Getting it written down: names, serials, who signed. */
  "record",
  /** Doing it the long way — the sanctioned way — because it holds. */
  "procedure",
  /** Getting there on a lie. */
  "deception",
] as const;

export type ReactionTag = (typeof REACTION_TAGS)[number];

/** What a companion thinks of each kind of act, in loyalty. */
export type CompanionValues = Readonly<Partial<Record<ReactionTag, number>>>;

/**
 * The one scene a companion raises once they have made their mind up
 * about the player. `loyalty` is the threshold that opens it, `nodeId`
 * the beat it opens on, and `resolvedFlag` the flag its fork writes —
 * so "have they had their say yet" is one flag lookup, and the endings
 * read that flag rather than a number that kept moving.
 */
export interface CompanionPersonalScene {
  nodeId: string;
  loyalty: number;
  resolvedFlag: string;
}

/**
 * How the later, quieter hour was left. Three values, and the third is
 * not simply the worst of the first two: `betrayed` is only reachable
 * when the mid-game beat where the crew's agendas collided already went
 * against this person, so it is the moment an old cost is finally
 * itemised rather than a fresh cruelty.
 */
export const BOND_OUTCOMES = ["warm", "distant", "betrayed"] as const;

export type BondOutcome = (typeof BOND_OUTCOMES)[number];

/**
 * The second scene: the hour a companion raises once they have already
 * had their say and the story has moved far enough that there is an
 * "after" worth talking about. It sits *beyond* the personal scene —
 * that one's flag is part of the gate — and asks nothing of the plot:
 * a rooftop meal, a ledger pushed across a table.
 *
 * `loyalty` is a higher threshold than the personal scene's,
 * `progressFlag` is the story gate (the chapter that makes the question
 * worth asking has to be behind you), and `resolvedFlag` records which
 * BondOutcome the fork wrote — the one figure the epilogue threads read.
 */
export interface CompanionBondScene {
  nodeId: string;
  loyalty: number;
  progressFlag: string;
  resolvedFlag: string;
}

export interface Companion {
  id: string;
  /** Display name: dialogue speaker key, initiative chip, party UI. */
  name: string;
  /** One line for the recruitment beat and the party roster. */
  blurb: string;
  stats: Stats;
  maxHp: number;
  /** Weapon item id they bring with them; null fights bare-handed. */
  weaponId: string | null;
  /** Outfit item id they wear; null keeps the base garb. */
  outfitId: string | null;
  /** Combat abilities they know, on top of anything their gear grants. */
  abilityIds: string[];
  looks: CompanionLook[];
  /** Which look a fresh recruit wears; must name one of `looks`. */
  defaultLookId: string;
  /** What they make of each kind of act; absent tags leave them cold. */
  values: CompanionValues;
  /** The scene they raise once they have decided about the player. */
  personalScene: CompanionPersonalScene;
  /** The quieter hour they raise long after that one. */
  bondScene: CompanionBondScene;
}

/**
 * Vesper Kade — a salvage-runner off the Flooded Quays who works the
 * drowned streets for parts and talks the entire time she is doing it.
 * Dredge dives; Kade *runs* — she is the one who gets a haul up the
 * stair and sold before the tide board notices. Fast, wry, allergic to
 * being thanked.
 */
export const VESPER_KADE_LOOK: CharacterVisual = {
  appearance: {
    skinTone: "deep-umber",
    build: "lean",
    hairStyle: "locs",
    hairColor: "auburn",
    eyes: "standard",
    eyeColor: "amber",
    brows: "arched",
    mouth: "smirk",
    faceDetail: "scar",
    headwear: "cap",
  },
  outfit: "out-diver-harness",
  weapon: "wpn-hookline",
};

/**
 * Deacon Sill — nine years an Auric compliance auditor, and the last
 * of them spent writing a variance report on the Undercroft cyclers
 * that the tower answered by striking him off the register at four in
 * the morning. He kept the suit, the visor, and the seal, and he has
 * been building the same case ever since out of a rented pitch in the
 * Vertical Market. Where Kade takes the thing and goes, Sill wants the
 * serial number, the signature, and somewhere it can be filed.
 */
export const DEACON_SILL_LOOK: CharacterVisual = {
  appearance: {
    skinTone: "golden-tan",
    build: "heavy",
    hairStyle: "buzz",
    hairColor: "raven",
    eyes: "narrow",
    eyeColor: "silver",
    brows: "straight",
    mouth: "frown",
    faceDetail: "brow-split",
    headwear: "visor",
  },
  outfit: "out-spire-suit",
  weapon: "wpn-writ-seal",
};

export const companions: Companion[] = [
  {
    id: "vesper",
    name: "Vesper Kade",
    blurb:
      "Salvage-runner. Knows every drowned doorway between the lockgate " +
      "and the tram tunnels, and exactly what each one is worth.",
    // Built like a runner: quick and handy, not a wall. She is the
    // player's second angle on a fight, never their front line.
    stats: { body: 5, reflexes: 7, tech: 6, cool: 6, intelligence: 5 },
    maxHp: 22,
    weaponId: "wpn-hookline",
    outfitId: "out-diver-harness",
    // The line goes out low and takes somebody's feet from under them.
    abilityIds: ["ability-riot-net"],
    looks: [
      {
        id: "quays-runner",
        label: "Quays Runner",
        visual: VESPER_KADE_LOOK,
      },
    ],
    defaultLookId: "quays-runner",
    // She works the water for a living: the haul is the point, the
    // people below the waterline are hers, and paperwork is the noise
    // the people who drowned them make afterwards.
    values: {
      salvage: 2,
      defiance: 2,
      mercy: 1,
      deception: 1,
      record: -1,
      procedure: -2,
    },
    personalScene: {
      nodeId: "cmp-vesper-open",
      loyalty: 4,
      resolvedFlag: "vesper-bond",
    },
    bondScene: {
      nodeId: "cmp-vesper-late",
      loyalty: 7,
      progressFlag: "act2-complete",
      resolvedFlag: "vesper-close",
    },
  },
  {
    id: "sill",
    name: "Deacon Sill",
    blurb:
      "Struck-off compliance auditor. Still carries the seal, still " +
      "keeps the file, and still believes a signature can be made to " +
      "mean something.",
    // Not a fighter and never was: an accurate, thinking body who
    // stands at the back and calls the room, where Kade closes it.
    stats: { body: 4, reflexes: 5, tech: 6, cool: 7, intelligence: 8 },
    maxHp: 20,
    weaponId: "wpn-writ-seal",
    outfitId: "out-spire-suit",
    // Nine years of reading civic hardware, pointed the other way.
    abilityIds: ["ability-mandate-pulse"],
    looks: [
      {
        id: "struck-off",
        label: "Struck Off",
        visual: DEACON_SILL_LOOK,
      },
    ],
    defaultLookId: "struck-off",
    // The case is the point. A thing taken is a thing that can never
    // be entered in evidence, and a night's shouting is a night the
    // file did not grow.
    values: {
      record: 2,
      procedure: 1,
      mercy: 1,
      salvage: -2,
      deception: -2,
      defiance: -1,
    },
    personalScene: {
      nodeId: "cmp-sill-open",
      loyalty: 4,
      resolvedFlag: "sill-bond",
    },
    bondScene: {
      nodeId: "cmp-sill-late",
      loyalty: 7,
      progressFlag: "act2-complete",
      resolvedFlag: "sill-close",
    },
  },
];

const companionsById = new Map(companions.map((c) => [c.id, c]));

/**
 * What a companion makes of one kind of act. A tag they hold no
 * opinion on — including one a later build retires — scores nothing,
 * so a reaction can be authored on a beat before everybody has a line
 * about it.
 */
export function reactionValue(companion: Companion, tag: string): number {
  return companion.values[tag as ReactionTag] ?? 0;
}

export function getCompanion(id: string): Companion | undefined {
  return companionsById.get(id);
}

export class CompanionError extends Error {
  constructor(
    readonly code: "unknown-companion" | "unknown-look",
    message: string,
  ) {
    super(message);
    this.name = "CompanionError";
  }
}

export function requireCompanion(id: string): Companion {
  const companion = companionsById.get(id);
  if (!companion) {
    throw new CompanionError(
      "unknown-companion",
      `No companion with id "${id}"`,
    );
  }
  return companion;
}

/**
 * The look a companion is wearing. Unknown refs fall back to the
 * default look rather than throwing: a save that names a look a later
 * build removed still draws somebody (missing content degrades, never
 * crashes).
 */
export function companionLook(
  companion: Companion,
  lookId: string,
): CompanionLook {
  return (
    companion.looks.find((look) => look.id === lookId) ??
    companion.looks.find((look) => look.id === companion.defaultLookId) ??
    companion.looks[0]!
  );
}

/**
 * The sprite id an ally is drawn under — companion plus the look it
 * wears, so re-dressing one is a different id and therefore a different
 * bake. Mirrors enemySpriteId; the entity source in the UI layer parses
 * it back (see companionSpriteSource).
 */
export function companionSpriteId(companionId: string, lookId: string): string {
  return `companion:${companionId}:${lookId}`;
}

/** The companion and look a sprite id names; empty ids parse to empties. */
export function parseCompanionSpriteId(spriteId: string): {
  companionId: string;
  lookId: string;
} | null {
  const parts = spriteId.split(":");
  if (parts.length !== 3 || parts[0] !== "companion") return null;
  return { companionId: parts[1] ?? "", lookId: parts[2] ?? "" };
}
