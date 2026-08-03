import { fixtureAppearance } from "../../character/testSupport";
import { createCharacter } from "../../character/create";
import type { CharacterState } from "../../character/create";
import type { Stats } from "../../character/stats";
import { backgrounds, getBackground } from "../../data/backgrounds";
import type { ProgressionTier } from "../../data/balance";
import type { DifficultyId } from "../../data/difficulty";
import { requireItem } from "../../data/items";
import { noAssists } from "../../data/assists";
import {
  addItem,
  equip,
  installEnhancement,
  type InventoryState,
  type Loadout,
} from "../../inventory";
import { installMod, normalizeMods, storedMods } from "../../inventory/mods";
import { staticReading } from "../../inventory/staticLoad";
import type { StaticBand } from "../../data/static";
import { createNewGame, type GameState } from "../../state/gameState";
import { recruitCompanion } from "../../state/party";

/**
 * The characters the balance sweep fights with.
 *
 * A build is a *description* — background, stat spread, progression
 * tier, how much chrome, whether somebody came along — and `buildGame`
 * turns one into a real GameState by walking the same code paths the
 * game does: createCharacter, applyStartingGear, equip, install, fit.
 * Nothing here fabricates a stat line or a weapon profile by hand, so a
 * cell the sweep measures is a run the player could actually have.
 *
 * Gear a build cannot legally hold is *skipped*, not forced. A talker
 * who cannot make the Rail Spitter's Reflexes requirement fights with
 * what they can lift, and a frame with no capacity left simply wears
 * fewer implants — which is the honest reading of "this build at this
 * point in the run", and the reason the low-spread cells are worth
 * measuring at all.
 *
 * Test tooling, like the `testSupport.ts` files beside it: nothing in
 * the shipped game imports this module.
 */

/** How the point pool was spent — the shape of a runner, not a number. */
export type StatSpread = "low" | "mid" | "high";

export const STAT_SPREADS: readonly StatSpread[] = ["low", "mid", "high"];

/**
 * Point-buy allocations, each spending exactly POINT_POOL. Background
 * bonuses land on top, so the real line is always a point or two above
 * these.
 *
 * - **low** is not a bad build, it is a *non-combat* one: the talker who
 *   put the pool into Cool and Intelligence and still has to walk out of
 *   the room when the talking fails. Reflexes sits at 5 because that is
 *   what a sidearm asks for, and a build that cannot hold its own
 *   background's starting weapon is a character-creation bug rather than
 *   a balance question.
 * - **mid** is the wizard's own default: everything at 6.
 * - **high** is the fighter: Body and Reflexes bought up, the rest left
 *   where it started.
 */
const ALLOCATIONS: Readonly<Record<StatSpread, Stats>> = {
  low: { body: 5, reflexes: 5, tech: 6, cool: 7, intelligence: 7 },
  mid: { body: 6, reflexes: 6, tech: 6, cool: 6, intelligence: 6 },
  high: { body: 8, reflexes: 8, tech: 4, cool: 4, intelligence: 6 },
};

/**
 * The chrome-heavy line, used by the Static-band variant sweep only.
 * Body and Cool are what carry implants (see neuralCapacity), so this is
 * the only allocation with room for enough hardware to reach screaming.
 */
const CHROMED_ALLOCATION: Stats = {
  body: 8,
  reflexes: 5,
  tech: 4,
  cool: 8,
  intelligence: 5,
};

/** How much hardware a build is carrying. */
export type ChromeLevel = "none" | "light" | "heavy";

/**
 * Implants per chrome level, in install order. Installed best-effort:
 * whatever the frame's neural capacity refuses is skipped, so the
 * achieved Static band is a *result* the sweep reports rather than a
 * promise the build makes.
 */
const CHROME: Readonly<Record<ChromeLevel, readonly string[]>> = {
  none: [],
  light: ["cyb-optic-suite"],
  heavy: ["cyb-warden-optics", "cyb-torsion-frame", "cyb-lattice-coprocessor"],
};

/** Gear, kit and learning a tier walks in with. */
interface TierKit {
  /** Weapon ids to try in order; the first that equips is kept. */
  weapons: readonly string[];
  /** Outfit ids, same rule. */
  outfits: readonly string[];
  /** Parts to fit into the held weapon's sockets, best-effort. */
  mods: readonly string[];
  /** Abilities bought with advancement points. */
  abilityIds: readonly string[];
  /** Perks taken at cred milestones. */
  perkIds: readonly string[];
  /** Consumables in the bag: item id and how many. */
  consumables: readonly (readonly [string, number])[];
  /** Default chrome for the tier; the variant sweep overrides it. */
  chrome: ChromeLevel;
}

/**
 * What a run looks like at each tier. Written against the shelves the
 * economy actually stocks and the grants advancement actually pays out
 * (three points and five cred a chapter — one ability plus a perk by
 * Chapter 2, two of each by Chapter 3).
 *
 * Weapon lists are ordered corp-grade first and fall back through the
 * tiers, because that is what a player does: buy the best thing you can
 * hold, keep the old one when you cannot.
 */
const TIER_KITS: Readonly<Record<ProgressionTier, TierKit>> = {
  opening: {
    weapons: [],
    outfits: [],
    mods: [],
    abilityIds: [],
    perkIds: [],
    consumables: [["con-trauma-patch", 2]],
    chrome: "none",
  },
  // Chapter 2 money buys roughly one big thing. The tier-2 weapon is
  // 320cr and the first implant 200 (see ITEM_VALUES) against an Act 1
  // haul in the low hundreds, so the mid build shops for the gun, keeps
  // the coat it started in, and carries a working bag. Modelling a
  // player who somehow bought all of it would make every Chapter 2 fight
  // read as free, which says more about the model than the fight.
  mid: {
    weapons: ["wpn-rail-spitter", "wpn-torque-cleaver", "wpn-arc-lash"],
    outfits: [],
    mods: [],
    abilityIds: ["ability-combat-focus"],
    perkIds: ["perk-pain-editor"],
    consumables: [
      ["con-trauma-patch", 3],
      ["con-surge-stim", 1],
      ["con-field-kit", 1],
    ],
    chrome: "light",
  },
  late: {
    weapons: [
      "wpn-rail-spitter",
      "wpn-torque-cleaver",
      "wpn-spindle-projector",
      "wpn-arc-lash",
    ],
    outfits: ["out-cordon-plate", "out-ghostline-mantle"],
    mods: ["mod-splitbore-choke", "mod-hairline-sear", "mod-gyro-sleeve"],
    abilityIds: ["ability-combat-focus", "ability-overclock-burst"],
    perkIds: ["perk-pain-editor", "perk-second-wind"],
    consumables: [
      ["con-trauma-patch", 4],
      ["con-surge-stim", 2],
      ["con-hammerhead", 1],
      ["con-field-kit", 2],
    ],
    chrome: "heavy",
  },
};

/** One cell's character: everything that is not the fight or the preset. */
export interface SimBuild {
  /** Stable, sortable, and what the report prints. */
  id: string;
  backgroundId: string;
  spread: StatSpread;
  tier: ProgressionTier;
  chrome: ChromeLevel;
  /** Whether a companion walks in with them. */
  companion: string | null;
  /** Drop the tier's fitted parts, perks and stims — the bare build. */
  stripped?: boolean;
  /** Force the chrome-heavy allocation; the Static variant sweep only. */
  chromedFrame?: boolean;
}

function buildId(build: Omit<SimBuild, "id">): string {
  return [
    build.backgroundId,
    build.spread,
    build.tier,
    `chrome-${build.chrome}`,
    build.companion ? `+${build.companion}` : "solo",
    ...(build.stripped ? ["bare"] : []),
    ...(build.chromedFrame ? ["frame"] : []),
  ].join("/");
}

/** A build description with its id filled in. */
export function makeBuild(build: Omit<SimBuild, "id">): SimBuild {
  return { ...build, id: buildId(build) };
}

/**
 * The core matrix for one tier: every background, every spread, with and
 * without a companion. Chrome and kit come from the tier, so this is
 * "the run as it is actually played" rather than a cross-product of
 * every knob — the knobs get their own variant sweeps.
 */
export function coreBuilds(tier: ProgressionTier): SimBuild[] {
  const kit = TIER_KITS[tier];
  const builds: SimBuild[] = [];
  for (const background of backgrounds) {
    for (const spread of STAT_SPREADS) {
      for (const companion of [null, "vesper"]) {
        builds.push(
          makeBuild({
            backgroundId: background.id,
            spread,
            tier,
            chrome: kit.chrome,
            companion,
          }),
        );
      }
    }
  }
  return builds;
}

/* --- Turning a description into a run -------------------------------- */

/** Equips the first id that the character can legally hold. */
function equipFirst(loadout: Loadout, ids: readonly string[]): Loadout {
  for (const id of ids) {
    const withItem = {
      ...loadout,
      inventory: addItem(loadout.inventory, id),
    };
    try {
      return equip(withItem.character, withItem.inventory, id);
    } catch {
      // Requirement unmet: the piece stays in the bag, exactly as it
      // would for a player who bought it a level too early.
      loadout = withItem;
    }
  }
  return loadout;
}

/** Installs what the frame has capacity for, skipping what it has not. */
function installAll(loadout: Loadout, ids: readonly string[]): Loadout {
  for (const id of ids) {
    const withItem = {
      ...loadout,
      inventory: addItem(loadout.inventory, id),
    };
    try {
      loadout = installEnhancement(
        withItem.character,
        withItem.inventory,
        id,
      );
    } catch {
      loadout = withItem;
    }
  }
  return loadout;
}

/**
 * Fits each part into the first socket that will take it. Silent about
 * parts the weapon in hand has no socket for — a Gyro Sleeve is worth
 * nothing to a weapon with no grip socket, and that is a fact about the
 * build rather than an error.
 */
function fitMods(character: CharacterState, ids: readonly string[]): CharacterState {
  const weaponId = character.equipment.weapon;
  if (weaponId == null) return character;
  const weapon = requireItem(weaponId);
  if (weapon.kind !== "weapon") return character;
  let slots = normalizeMods(weapon, character.equipment.weaponMods);
  for (const modId of ids) {
    const sockets = weapon.sockets ?? [];
    for (let index = 0; index < sockets.length; index++) {
      if (slots[index] != null) continue;
      try {
        slots = installMod(weapon, slots, index, modId);
        break;
      } catch {
        // Wrong socket kind for this index; try the next one.
      }
    }
  }
  return {
    ...character,
    equipment: { ...character.equipment, weaponMods: storedMods(slots) },
  };
}

function stockConsumables(
  inventory: InventoryState,
  entries: readonly (readonly [string, number])[],
): InventoryState {
  let next = inventory;
  for (const [itemId, quantity] of entries) {
    next = addItem(next, itemId, quantity);
  }
  return next;
}

/**
 * The run a build describes, seeded and ready to fight. `seed` is the
 * only source of variation between repeats of one cell: the character,
 * the gear and the party are a pure function of the build.
 */
export function buildGame(
  build: SimBuild,
  difficulty: DifficultyId,
  seed: number,
): GameState {
  const background = getBackground(build.backgroundId);
  if (!background) {
    throw new Error(`buildGame: unknown background "${build.backgroundId}"`);
  }
  const kit = TIER_KITS[build.tier];
  const bare = build.stripped === true;

  const character = createCharacter({
    name: "Sim",
    background,
    allocation: build.chromedFrame
      ? { ...CHROMED_ALLOCATION }
      : { ...ALLOCATIONS[build.spread] },
    appearance: fixtureAppearance(),
  });

  const game = createNewGame({
    character,
    seed,
    rules: { difficulty, assists: noAssists(), difficultyChanged: false },
  });

  let loadout: Loadout = { character: game.player, inventory: game.inventory };
  loadout = equipFirst(loadout, kit.weapons);
  loadout = equipFirst(loadout, kit.outfits);
  loadout = installAll(loadout, CHROME[build.chrome]);
  if (!bare) {
    loadout = {
      ...loadout,
      character: fitMods(loadout.character, kit.mods),
    };
  }

  const player: CharacterState = {
    ...loadout.character,
    // Advancement is plain data: what a chapter's points and the
    // street's cred were spent on. Written directly rather than walked
    // through the spend rules, which would need the chapter flags the
    // sweep deliberately does not simulate.
    advancement: {
      ...loadout.character.advancement,
      abilityIds: [...kit.abilityIds],
      perkIds: bare ? [] : [...kit.perkIds],
    },
    // Everybody starts a fight whole. A sweep that also modelled arriving
    // hurt would be measuring the previous fight, not this one.
    hp: loadout.character.derived.maxHp,
  };

  const stocked = stockConsumables(
    loadout.inventory,
    bare
      ? kit.consumables.filter(([id]) => id === "con-trauma-patch")
      : kit.consumables,
  );

  const withKit: GameState = {
    ...game,
    player,
    inventory: stocked,
  };
  return build.companion
    ? { ...withKit, party: recruitCompanion(withKit.party, build.companion) }
    : withKit;
}

/** The Static band a build actually ends up carrying, for the report. */
export function buildStaticBand(build: SimBuild): StaticBand {
  const game = buildGame(build, "grind", 1);
  return staticReading(game.player).band;
}
