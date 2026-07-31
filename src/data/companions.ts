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
  },
];

const companionsById = new Map(companions.map((c) => [c.id, c]));

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
