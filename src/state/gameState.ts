import { createCharacter, defaultAllocation } from "../character";
import type { CharacterState } from "../character";
import { DEFAULT_BACKGROUND_ID, getBackground } from "../data/backgrounds";
import { applyStartingGear, emptyInventory } from "../inventory";
import type { InventoryState } from "../inventory";
import type { FlagMap } from "./flags";
import type { RngState } from "./rng";

/** Save-format version; bump when GameState shape changes incompatibly. */
export const GAME_STATE_VERSION = 4;

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
  /** Deterministic RNG state; advance via the rng module, never Math.random. */
  rng: RngState;
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
    });
  const loadout = applyStartingGear(character, emptyInventory());
  return {
    version: GAME_STATE_VERSION,
    player: loadout.character,
    flags: {},
    location: "main-menu",
    inventory: loadout.inventory,
    credits: STARTING_CREDITS,
    rng: { seed: (options.seed ?? Date.now()) >>> 0 },
  };
}
