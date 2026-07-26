import type { FlagMap } from "./flags";
import type { RngState } from "./rng";

/** Save-format version; bump when GameState shape changes incompatibly. */
export const GAME_STATE_VERSION = 1;

/**
 * Player character placeholder — fleshed out by the character-creation
 * task. Kept minimal so saves stay forward-migratable.
 */
export interface PlayerState {
  name: string;
}

/** Inventory placeholder — fleshed out by the inventory task. */
export interface InventoryState {
  items: string[];
}

/**
 * Central serializable game state. Every system reads from and writes to
 * this object; save/load serializes it to localStorage as JSON. Must stay
 * a plain object (no classes, functions, Dates, Maps) so a JSON round-trip
 * preserves it exactly.
 */
export interface GameState {
  version: number;
  player: PlayerState;
  flags: FlagMap;
  /** Current location or screen id (e.g. "main-menu", "hub:market"). */
  location: string;
  inventory: InventoryState;
  /** Deterministic RNG state; advance via the rng module, never Math.random. */
  rng: RngState;
}

export interface NewGameOptions {
  playerName?: string;
  seed?: number;
}

export function createNewGame(options: NewGameOptions = {}): GameState {
  return {
    version: GAME_STATE_VERSION,
    player: { name: options.playerName ?? "" },
    flags: {},
    location: "main-menu",
    inventory: { items: [] },
    rng: { seed: (options.seed ?? Date.now()) >>> 0 },
  };
}
