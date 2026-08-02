import {
  createCharacter,
  defaultAllocation,
  defaultAppearance,
} from "../character";
import type { CharacterState } from "../character";
import { DEFAULT_BACKGROUND_ID, getBackground } from "../data/backgrounds";
import { applyStartingGear, emptyInventory } from "../inventory";
import type { InventoryState } from "../inventory";
import type { FlagMap } from "./flags";
import type { LoreState } from "./lore";
import { emptyLore } from "./lore";
import { emptyParty, type PartyState } from "./party";
import { emptyReputation, type ReputationState } from "./reputation";
import type { RngState } from "./rng";
import { clampRules, defaultRules, type RunRules } from "./rules";
import { emptyVendors, type VendorsState } from "./vendors";
import { GAME_STATE_VERSION, OLDEST_MIGRATABLE_VERSION } from "./version";

export { GAME_STATE_VERSION, OLDEST_MIGRATABLE_VERSION };

/**
 * Bringing an old save forward lives in ./migrate.ts, beside the
 * per-step validation that decides whether each rung of the ladder
 * produced something loadable. Re-exported here because this is where
 * every caller has always found it.
 */
export {
  MIGRATION_STEPS,
  MigrationError,
  migrateGameState,
  migrateStepwise,
  normalizeState,
  stepName,
  type MigrationResult,
  type MigrationStep,
} from "./migrate";

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
