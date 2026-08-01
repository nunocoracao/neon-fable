import {
  createCharacter,
  defaultAllocation,
  defaultAppearance,
  normalizeInjury,
  normalizePerkIds,
  normalizeReadied,
} from "../character";
import type { CharacterState } from "../character";
import { DEFAULT_BACKGROUND_ID, getBackground } from "../data/backgrounds";
import {
  applyStartingGear,
  emptyInventory,
  sanitizeDyes,
  sanitizeMods,
} from "../inventory";
import type { InventoryState } from "../inventory";
import type { FlagMap } from "./flags";
import { clampLore, emptyLore, type LoreState } from "./lore";
import { emptyParty, type PartyState } from "./party";
import {
  deriveReputation,
  emptyReputation,
  type ReputationState,
} from "./reputation";
import type { RngState } from "./rng";
import { clampRules, defaultRules, type RunRules } from "./rules";
import { clampVendors, emptyVendors, type VendorsState } from "./vendors";

/** Save-format version; bump when GameState shape changes incompatibly. */
export const GAME_STATE_VERSION = 17;

/**
 * Oldest save version migrateGameState can bring forward. Saves from
 * before this version predate the migration system and fail to load
 * with a version-mismatch error, exactly as they always have.
 */
export const OLDEST_MIGRATABLE_VERSION = 6;

/** Credits a fresh character starts with. */
export const STARTING_CREDITS = 25;

export type { InventoryState };

/**
 * Central serializable game state. Every system reads from and writes to
 * this object; save/load serializes it to localStorage as JSON. Must stay
 * a plain object (no classes, functions, Dates, Maps) so a JSON round-trip
 * preserves it exactly.
 */
export interface GameState {
  version: number;
  player: CharacterState;
  flags: FlagMap;
  /** Current location or screen id (e.g. "main-menu", "hub:market"). */
  location: string;
  inventory: InventoryState;
  /** Money on hand; never negative. Narrative effects grant and spend it. */
  credits: number;
  /**
   * Encounter the narrative asked to fight (start-combat effect). The UI
   * layer launches combat for it; resolveCombat clears it.
   */
  pendingEncounterId: string | null;
  /**
   * Companions recruited so far and which of them travel with the
   * player. Always present (empty until somebody joins); see ./party.ts.
   */
  party: PartyState;
  /**
   * Where the player stands with the city's factions. Always present
   * (everybody starts at nothing); see ./reputation.ts.
   */
  reputation: ReputationState;
  /**
   * Memory shards picked up this run. Always present (empty until the
   * player finds one); see ./lore.ts.
   */
  lore: LoreState;
  /**
   * What the city's counters remember about this run: what has been
   * bought off each shelf this chapter, and how the argument over the
   * price went. Always present (empty until the player trades); see
   * ./vendors.ts.
   */
  vendors: VendorsState;
  /**
   * What this run is being played under: difficulty preset, assist
   * switches, and whether the preset was moved mid-run. Always present
   * (a fresh run gets the middle preset and no assists); see ./rules.ts.
   */
  rules: RunRules;
  /** Deterministic RNG state; advance via the rng module, never Math.random. */
  rng: RngState;
}

/**
 * Migrates a save's GameState from an older supported version to the
 * current shape, stepwise. Pure: returns a new state. Callers gate on
 * OLDEST_MIGRATABLE_VERSION before calling.
 *
 * - v6 -> v7: characters gained a layered appearance; old saves get
 *   defaultAppearance.
 * - v7 -> v8: the game gained companions; old saves get an empty party
 *   and can recruit from wherever they left off.
 * - v8 -> v9: the factions started keeping a ledger. Rather than
 *   starting an old save at nothing, its standing is read back off the
 *   outcomes it already recorded (deriveReputation), so a run that
 *   stood with the Court in Act 1 loads as somebody the Court knows.
 * - v9 -> v10: the city started leaving its history lying around. Old
 *   saves get an empty shard collection and can go and find all twelve
 *   from wherever they left off — the shards are still on the maps,
 *   because a map only drops the ones this run has already picked up.
 * - v10 -> v11: weapons grew mod sockets. There is nothing to fill in:
 *   a weapon with no fitted parts is exactly what every older save
 *   already describes, and the sanitize pass below (which runs at every
 *   version, like the lore clamp) is what makes that true rather than
 *   assumed.
 * - v11 -> v12: outfits started taking dye. Same story as the sockets:
 *   a coat with no color rubbed into it is exactly what every older
 *   save already describes, and the sanitize pass is what makes that
 *   true rather than assumed.
 * - v12 -> v13: the counters started keeping books. An old save has
 *   traded at none of them, which is exactly what an empty ledger set
 *   says — and because a ledger only counts against the act it was
 *   written in, a save resumed mid-chapter finds every shelf full,
 *   which is the generous reading and the only one that cannot lose a
 *   player something they paid for.
 * - v13 -> v14: the street started keeping score. Cred itself needs no
 *   migration — it is derived from the deeds and the won fights an old
 *   save already recorded, so a save resumed deep into Chapter 2 loads
 *   with every milestone it has actually earned — but the picks those
 *   milestones grant are stored, and an old save has taken none. The
 *   normalize pass below (which runs at every version, like the lore
 *   clamp) is what fills the empty list in rather than assuming it.
 * - v14 -> v15: fights started leaving marks. There is nothing to fill
 *   in — an old save describes a runner and a crew who are carrying
 *   nothing, which is exactly what an absent injury field says — and
 *   the sanitize pass below is what makes that true rather than
 *   assumed: a wound naming an injury this build retired closes rather
 *   than quietly going on costing.
 * - v15 -> v16: the carts started selling hot food, and a meal is
 *   something you carry into the *next* fight rather than something you
 *   feel at once. There is nothing to fill in — an old save describes
 *   somebody who has not eaten, which is exactly what an absent
 *   held-over list says — and the normalize pass below is what makes
 *   that true rather than assumed: an effect naming a family or a stat
 *   this build no longer has stops being carried rather than riding
 *   along forever.
 * - v16 -> v17: the game learned to be played at more than one
 *   intensity. An old save is a run on the authored figures with no
 *   assists switched on, which is exactly what the middle preset and an
 *   empty switchboard describe — so it loads as precisely the game it
 *   was, down to the arithmetic. The clamp below (which runs at every
 *   version, like the lore clamp) is what fills the record in rather
 *   than assuming it, and is also what closes a preset or an assist
 *   this build has since retired.
 */
export function migrateGameState(
  state: GameState,
  fromVersion: number,
): GameState {
  let migrated = state;
  if (fromVersion < 7) {
    migrated = {
      ...migrated,
      player: { ...migrated.player, appearance: defaultAppearance() },
    };
  }
  if (fromVersion < 8) {
    migrated = { ...migrated, party: emptyParty() };
  }
  if (fromVersion < 9) {
    migrated = { ...migrated, reputation: deriveReputation(migrated.flags) };
  }
  if (fromVersion < 10) {
    migrated = { ...migrated, lore: emptyLore() };
  }
  if (fromVersion < 13) {
    migrated = { ...migrated, vendors: emptyVendors() };
  }
  // A save at the current version can still carry a collection an older
  // build wrote badly; clamping costs nothing and keeps the codex from
  // counting a duplicate twice.
  //
  // The same goes for fitted weapon parts: content moves, and a part in
  // a socket its weapon no longer offers has to stop being fitted
  // rather than quietly keep paying out. An unmodded loadout — which is
  // every pre-v11 save — comes back unchanged.
  //
  // Dyed outfits get the same treatment for the same reason: a color
  // whose material this build no longer has, or one sitting on a coat
  // that lost its sprite layer, has to stop being worn rather than
  // quietly paint nothing.
  //
  // And perks, for a third time: a save from before the street kept
  // score has no list at all, and one naming a perk this build retired
  // has to stop paying out rather than quietly keep doing so.
  const withMods = sanitizeMods(migrated.player, migrated.inventory);
  const cleaned = sanitizeDyes(withMods.player, withMods.inventory);
  const player: CharacterState = {
    ...cleaned.player,
    advancement: {
      ...cleaned.player.advancement,
      perkIds: normalizePerkIds(cleaned.player.advancement?.perkIds),
    },
    injury: normalizeInjury(cleaned.player.injury),
    // And a fifth time, for what somebody ate: content moves, and a
    // held-over lift naming a family this build retired has to stop
    // being carried rather than quietly go on lifting.
    readied: normalizeReadied(cleaned.player.readied),
  };
  return {
    ...migrated,
    player,
    inventory: cleaned.inventory,
    // And a fourth time, for the crew: a companion's wound follows the
    // same rules the player's does, including this one.
    party: {
      ...migrated.party,
      members: (migrated.party?.members ?? []).map((member) => ({
        ...member,
        injury: normalizeInjury(member.injury),
      })),
    },
    lore: clampLore(migrated.lore),
    vendors: clampVendors(migrated.vendors),
    // And a sixth time, for how hard the city is: a save from before
    // difficulty existed has no record at all and gets the authored
    // figures, and one naming a preset or an assist this build retired
    // falls back to them rather than quietly scaling something by a
    // number nobody can see.
    rules: clampRules(migrated.rules),
    version: GAME_STATE_VERSION,
  };
}

export interface NewGameOptions {
  playerName?: string;
  seed?: number;
  /** Fully created character; when absent a default one is generated. */
  character?: CharacterState;
  /**
   * What the run is played under. Absent is the documented default —
   * middle difficulty, every assist off — which is what a run created
   * outside the wizard (a test, a dev screen) gets.
   */
  rules?: RunRules;
}

export function createNewGame(options: NewGameOptions = {}): GameState {
  const character =
    options.character ??
    createCharacter({
      name: options.playerName ?? "",
      background: getBackground(DEFAULT_BACKGROUND_ID)!,
      allocation: defaultAllocation(),
      // The stock look — always catalog-valid, same as save migration.
      appearance: defaultAppearance(),
    });
  const loadout = applyStartingGear(character, emptyInventory());
  return {
    version: GAME_STATE_VERSION,
    player: loadout.character,
    flags: {},
    location: "main-menu",
    inventory: loadout.inventory,
    credits: STARTING_CREDITS,
    pendingEncounterId: null,
    party: emptyParty(),
    reputation: emptyReputation(),
    lore: emptyLore(),
    vendors: emptyVendors(),
    rules: options.rules ? clampRules(options.rules) : defaultRules(),
    rng: { seed: (options.seed ?? Date.now()) >>> 0 },
  };
}
