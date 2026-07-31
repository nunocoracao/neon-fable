import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import { checkRequirement, checkRequirements } from "../narrative/requirements";
import {
  GAME_STATE_VERSION,
  createNewGame,
  migrateGameState,
  type GameState,
} from "../state";
import { installEnhancement } from "./equipment";
import { addItem } from "./inventory";
import { effectiveStats } from "./selectors";
import { staticEffects, staticReading } from "./staticLoad";

/**
 * Static where it meets the rest of the game: the doors a band opens
 * and closes, and what a save written before any of this existed
 * derives when it loads.
 *
 * Deliberately against the shipped catalog rather than fixtures — the
 * point of these is that the implants a player can actually buy add up
 * to the bands the content gates on.
 */

/** A game whose player has the named implants installed. */
function playing(...itemIds: string[]): GameState {
  const state = createNewGame({
    character: fixtureCharacter({ backgroundId: "tower-analyst" }),
    seed: 3,
  });
  let player = state.player;
  let inventory = state.inventory;
  for (const id of itemIds) {
    const loadout = installEnhancement(player, addItem(inventory, id), id);
    player = loadout.character;
    inventory = loadout.inventory;
  }
  return { ...state, player, inventory };
}

describe("what the bands do to a conversation", () => {
  it("leaves a quiet runner's Cool gates exactly where they were", () => {
    const clean = playing();
    const cool = effectiveStats(clean.player).cool;
    expect(staticReading(clean.player).band).toBe("clear");
    expect(
      checkRequirement(clean, { type: "stat", stat: "cool", value: cool }),
    ).toBe(true);
  });

  it("closes a Cool gate the loadout would otherwise clear", () => {
    // Myomer Arms (3) + Lattice Coprocessor (3) = 6: loud.
    const loud = playing("cyb-myomer-arms", "cyb-lattice-coprocessor");
    expect(staticReading(loud.player).band).toBe("loud");
    const penalty = staticEffects(loud.player).coolPenalty;
    expect(penalty).toBeGreaterThan(0);

    const cool = effectiveStats(loud.player).cool;
    // The fight still reads the full figure; only the conversation does not.
    expect(
      checkRequirement(loud, { type: "stat", stat: "cool", value: cool }),
    ).toBe(false);
    expect(
      checkRequirement(loud, {
        type: "stat",
        stat: "cool",
        value: cool - penalty,
      }),
    ).toBe(true);
  });

  it("touches no stat but Cool", () => {
    const loud = playing("cyb-myomer-arms", "cyb-lattice-coprocessor");
    for (const stat of ["body", "reflexes", "tech", "intelligence"] as const) {
      const value = effectiveStats(loud.player)[stat];
      expect(
        checkRequirement(loud, { type: "stat", stat, value }),
        `${stat} gate unmoved`,
      ).toBe(true);
    }
  });

  it("opens the chrome-affinity gate the clean face cannot reach", () => {
    const affinity = { type: "static", band: "loud" } as const;
    expect(checkRequirement(playing(), affinity)).toBe(false);
    expect(
      checkRequirement(playing("cyb-optic-suite"), affinity),
      "one implant is not an argument",
    ).toBe(false);
    expect(
      checkRequirement(
        playing("cyb-myomer-arms", "cyb-lattice-coprocessor"),
        affinity,
      ),
    ).toBe(true);
  });

  it("closes the quiet-face gate on somebody audible", () => {
    const unheard = { type: "static", band: "humming", mode: "at-most" } as const;
    expect(checkRequirement(playing(), unheard)).toBe(true);
    expect(checkRequirement(playing("cyb-optic-suite"), unheard)).toBe(true);
    expect(
      checkRequirement(
        playing("cyb-myomer-arms", "cyb-lattice-coprocessor"),
        unheard,
      ),
    ).toBe(false);
  });

  it("is bought back by a dampener, gate and all", () => {
    const loud = playing("cyb-myomer-arms", "cyb-lattice-coprocessor");
    const cool = effectiveStats(loud.player).cool;
    // The collar takes the neural socket the coprocessor was in, so
    // quieting down means giving the coprocessor up — which is the
    // whole trade, and why the Cool figure moves as well as the band.
    const damped = playing("cyb-myomer-arms", "cyb-null-collar");
    expect(staticReading(damped.player).band).toBe("clear");
    expect(staticEffects(damped.player).coolPenalty).toBe(0);
    expect(
      checkRequirements(damped, [{ type: "static", band: "loud" }]),
      "the door loud opened is shut again",
    ).toBe(false);
    expect(cool).toBeGreaterThan(0);
  });
});

describe("a save from before Static existed", () => {
  /** A v6 save: implants installed, and no notion of noise anywhere. */
  function preStaticSave(): GameState {
    const state = playing("cyb-optic-suite", "cyb-myomer-arms");
    return { ...state, version: 6 };
  }

  it("loads and derives a band from the installs it already had", () => {
    const migrated = migrateGameState(preStaticSave(), 6);
    expect(migrated.version).toBe(GAME_STATE_VERSION);
    // Optic Suite (2) + Myomer Arms (3) = 5, which is loud. Derived,
    // not stored: nothing in the old save said so.
    expect(staticReading(migrated.player).level).toBe(5);
    expect(staticReading(migrated.player).band).toBe("loud");
  });

  it("stores nothing, so the state still round-trips as JSON", () => {
    const migrated = migrateGameState(preStaticSave(), 6);
    expect(JSON.parse(JSON.stringify(migrated))).toEqual(migrated);
    // No Static field was added to the character; the level is a read.
    expect(Object.keys(migrated.player)).not.toContain("staticLevel");
  });

  it("bands a save with nothing installed as clear", () => {
    const bare: GameState = { ...createNewGame({ seed: 2 }), version: 6 };
    const migrated = migrateGameState(bare, 6);
    expect(staticReading(migrated.player).level).toBe(0);
    expect(staticReading(migrated.player).band).toBe("clear");
  });
});
