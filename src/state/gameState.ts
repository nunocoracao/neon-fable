import { createCharacter, defaultAllocation, defaultAppearance } from "../character";
import type { CharacterState } from "../character";
import { DEFAULT_BACKGROUND_ID, getBackground } from "../data/backgrounds";
import { applyStartingGear, emptyInventory } from "../inventory";
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

/** Save-format version; bump when GameState shape changes incompatibly. */
export const GAME_STATE_VERSION = 10;

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
  // A save at the current version can still carry a collection an older
  // build wrote badly; clamping costs nothing and keeps the codex from
  // counting a duplicate twice.
  return { ...migrated, lore: clampLore(migrated.lore), version: GAME_STATE_VERSION };
}

export interface NewGameOptions {
  playerName?: string;
  seed?: number;
  /** Fully created character; when absent a default one is generated. */
  character?: CharacterState;
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
    rng: { seed: (options.seed ?? Date.now()) >>> 0 },
  };
}
