import { describe, expect, it } from "vitest";
import { composeCharacter } from "../character/appearance";
import { composeVisual, type CharacterVisual } from "../character/appearance";
import { composePortrait, portraitKey } from "../character/portrait";
import { fixtureCharacter } from "../character/testSupport";
import type { CharacterState } from "../character/create";
import { enemies } from "../data/enemies";
import { composedCharacterKey } from "../iso/art/layers";
import {
  GAME_STATE_VERSION,
  createNewGame,
  migrateGameState,
  type GameState,
} from "../state/gameState";
import { createMemoryStorage, loadGame, saveGame } from "../state/save";
import { applyDye, stripDye, type DyeCounter } from "./dye";
import { armorValue, effectiveStats } from "./selectors";
import { equip } from "./equipment";
import { addGear, addItem, emptyInventory } from "./inventory";

/**
 * The joins: what a dyed coat does once somebody is wearing it through
 * the world — to the sprite descriptor, to its bake-cache key, to the
 * portrait, to the figures a fight reads (nothing), to authored NPC
 * looks (nothing), and across a save.
 */

const OUTFIT = "out-courier-slicker";

function dressed(): CharacterState {
  return equip(
    fixtureCharacter(),
    addGear(emptyInventory(), OUTFIT, {}),
    OUTFIT,
  ).character;
}

function counterWith(...tins: string[]): DyeCounter {
  let inventory = emptyInventory();
  for (const id of tins) inventory = addItem(inventory, id, 1);
  return { character: dressed(), inventory, credits: 200 };
}

const worn = { where: "equipped" } as const;

describe("a colour reaches the sprite", () => {
  it("repaints the outfit layer's channels and nothing else's", () => {
    const plain = dressed();
    const dyed = applyDye(counterWith("dye-cinder-black"), worn,
      "dye-cinder-black").character;

    const before = composeCharacter(plain.appearance, plain.equipment);
    const after = composeCharacter(dyed.appearance, dyed.equipment);

    expect(after.layers.map((l) => `${l.slot}:${l.art}`)).toEqual(
      before.layers.map((l) => `${l.slot}:${l.art}`),
    );
    const changed = after.layers.filter(
      (layer, index) =>
        JSON.stringify(layer.remap) !==
        JSON.stringify(before.layers[index]?.remap),
    );
    expect(changed.map((layer) => layer.slot)).toEqual(["outfit"]);
  });

  it("keeps the item's own materials on channels the tin does not name", () => {
    // The spire suit authors a chrome accent; a trim-only dye takes the
    // accent and leaves the authored cloth alone.
    const suited = equip(
      fixtureCharacter(),
      addGear(emptyInventory(), "out-spire-suit", {}),
      "out-spire-suit",
    ).character;
    const counter: DyeCounter = {
      character: suited,
      inventory: addItem(emptyInventory(), "dye-signal-cyan", 1),
      credits: 0,
    };
    const dyed = applyDye(counter, worn, "dye-signal-cyan").character;
    const plainOutfit = composeCharacter(
      suited.appearance,
      suited.equipment,
    ).layers.find((l) => l.slot === "outfit");
    const dyedOutfit = composeCharacter(
      dyed.appearance,
      dyed.equipment,
    ).layers.find((l) => l.slot === "outfit");
    // The primary (cloth) channel entries are identical...
    expect(dyedOutfit?.remap["V"]).toBe(plainOutfit?.remap["V"]);
    // ...and the accent moved onto the cyan ramp.
    expect(dyedOutfit?.remap["j"]).not.toBe(plainOutfit?.remap["j"]);
  });

  it("changes the bake-cache key, and stripping changes it back", () => {
    const plain = dressed();
    const plainKey = composedCharacterKey(
      composeCharacter(plain.appearance, plain.equipment),
    );

    let counter = applyDye(counterWith("dye-cinder-black"), worn,
      "dye-cinder-black");
    const dyed = counter.character;
    const dyedKey = composedCharacterKey(
      composeCharacter(dyed.appearance, dyed.equipment),
    );
    expect(dyedKey).not.toBe(plainKey);

    counter = stripDye(counter, worn);
    expect(
      composedCharacterKey(
        composeCharacter(
          counter.character.appearance,
          counter.character.equipment,
        ),
      ),
    ).toBe(plainKey);
  });

  it("gives two different colours two different keys", () => {
    const key = (dyeId: string): string => {
      const c = applyDye(counterWith(dyeId), worn, dyeId).character;
      return composedCharacterKey(composeCharacter(c.appearance, c.equipment));
    };
    expect(key("dye-cinder-black")).not.toBe(key("dye-tidewater"));
  });
});

describe("a colour reaches the portrait", () => {
  it("tints the shoulder band and re-keys the portrait bake", () => {
    const plain = dressed();
    const dyed = applyDye(counterWith("dye-cinder-black"), worn,
      "dye-cinder-black").character;

    const plainKey = portraitKey(plain.appearance, plain.equipment);
    const dyedKey = portraitKey(dyed.appearance, dyed.equipment);
    expect(dyedKey).not.toBe(plainKey);

    // Same face, different coat: the grids differ somewhere.
    const before = composePortrait(plain.appearance, plain.equipment);
    const after = composePortrait(dyed.appearance, dyed.equipment);
    expect(after).not.toEqual(before);
    expect(after.length).toBe(before.length);
  });

  it("paints the same channels the sprite paints", () => {
    const dyed = applyDye(counterWith("dye-tidewater"), worn,
      "dye-tidewater").character;
    const outfitLayer = composeCharacter(
      dyed.appearance,
      dyed.equipment,
    ).layers.find((layer) => layer.slot === "outfit");
    const head = portraitKey(dyed.appearance, dyed.equipment).split("|")[0]!;
    for (const [from, to] of Object.entries(outfitLayer?.remap ?? {})) {
      // Every outfit-channel entry the sprite uses appears on the
      // portrait's head part too, so the two can never disagree.
      expect(head).toContain(`${from}>${to}`);
    }
  });
});

describe("what a colour must not touch", () => {
  it("moves no figure a fight reads", () => {
    const plain = dressed();
    const dyed = applyDye(counterWith("dye-cinder-black"), worn,
      "dye-cinder-black").character;
    expect(effectiveStats(dyed)).toEqual(effectiveStats(plain));
    expect(armorValue(dyed)).toBe(armorValue(plain));
  });

  it("leaves authored NPC looks exactly as their content declares", () => {
    // The player's dye is instance state; a look's crew colours are
    // authored. Composing every enemy look before and after a player
    // dyes the same outfit id yields identical descriptors.
    const keys = (): string[] =>
      enemies.flatMap((enemy) =>
        enemy.spriteKind === "humanoid"
          ? enemy.looks.map((look) =>
              composedCharacterKey(composeVisual(look)),
            )
          : [],
      );
    const before = keys();
    applyDye(counterWith("dye-cinder-black"), worn, "dye-cinder-black");
    const after = keys();
    expect(after).toEqual(before);
  });

  it("cannot be reached through a CharacterVisual's equipment", () => {
    // visualEquipment carries no dye slot: an NPC wearing the same coat
    // renders it in the item's own colours, whatever any player copy of
    // that coat is painted.
    const visual: CharacterVisual = {
      appearance: fixtureCharacter().appearance,
      outfit: OUTFIT,
    };
    const key = composedCharacterKey(composeVisual(visual));
    applyDye(counterWith("dye-cinder-black"), worn, "dye-cinder-black");
    expect(composedCharacterKey(composeVisual(visual))).toBe(key);
  });
});

describe("colour survives a save", () => {
  it("round-trips through JSON on the coat worn and the coat carried", () => {
    const counter = applyDye(counterWith("dye-cinder-black"), worn,
      "dye-cinder-black");
    const state: GameState = {
      ...createNewGame({ seed: 4 }),
      player: counter.character,
      inventory: addGear(emptyInventory(), "out-spire-suit", {
        dye: { accent: "neonCyan" },
      }),
    };

    const storage = createMemoryStorage();
    saveGame(state, "slot1", storage, 1);
    const loaded = loadGame("slot1", storage);

    expect(loaded.player.equipment.outfitDye).toEqual({
      primary: "darkFabric",
      accent: "hazardAmber",
    });
    expect(loaded.inventory.stacks[0]?.dye).toEqual({ accent: "neonCyan" });
    // And the picture comes back with it.
    expect(
      composedCharacterKey(
        composeCharacter(loaded.player.appearance, loaded.player.equipment),
      ),
    ).toBe(
      composedCharacterKey(
        composeCharacter(
          counter.character.appearance,
          counter.character.equipment,
        ),
      ),
    );
  });

  it("stores an undyed coat exactly as it always did", () => {
    const state: GameState = {
      ...createNewGame({ seed: 4 }),
      inventory: addGear(emptyInventory(), "out-spire-suit", {}),
    };
    expect(JSON.parse(JSON.stringify(state.inventory))).toEqual({
      stacks: [{ itemId: "out-spire-suit", quantity: 1 }],
    });
  });
});

describe("saves written before outfits took dye", () => {
  /** A v11 save: no colour anywhere, because there was none to have. */
  function preDyeSave(): GameState {
    const state = createNewGame({ seed: 6 });
    return {
      ...state,
      player: dressed(),
      inventory: addItem(
        addGear(emptyInventory(), "out-spire-suit", {}),
        "con-trauma-patch",
        2,
      ),
      version: 11,
    };
  }

  it("load with factory colours and nothing else changed", () => {
    const old = preDyeSave();
    const migrated = migrateGameState(old, 11);
    expect(migrated.version).toBe(GAME_STATE_VERSION);
    expect(migrated.player.equipment.outfitDye).toBeUndefined();
    expect(migrated.inventory).toEqual(old.inventory);
    expect(
      composedCharacterKey(
        composeCharacter(migrated.player.appearance, migrated.player.equipment),
      ),
    ).toBe(
      composedCharacterKey(
        composeCharacter(old.player.appearance, old.player.equipment),
      ),
    );
  });

  it("keeps fitted parts and colour through the same migration", () => {
    const counter = applyDye(counterWith("dye-cinder-black"), worn,
      "dye-cinder-black");
    const state: GameState = {
      ...createNewGame({ seed: 6 }),
      player: counter.character,
      inventory: addGear(emptyInventory(), "wpn-shard-knife", {
        mods: ["mod-gyro-sleeve"],
      }),
      version: 11,
    };
    const migrated = migrateGameState(state, 11);
    expect(migrated.player.equipment.outfitDye).toEqual({
      primary: "darkFabric",
      accent: "hazardAmber",
    });
    expect(migrated.inventory.stacks[0]?.mods).toEqual(["mod-gyro-sleeve"]);
  });
});
