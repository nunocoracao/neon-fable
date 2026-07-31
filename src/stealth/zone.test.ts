import { describe, expect, it } from "vitest";
import { combatResultFlag } from "../combat/outcome";
import { requireStealthZone, stealthZoneFlag } from "../data/stealth";
import { addItem, installEnhancement } from "../inventory";
import type { FlagValue } from "../state/flags";
import { createNewGame, type GameState } from "../state/gameState";
import { activeStealthZone, hasQuietHands, isZoneLive } from "./zone";

const exec = requireStealthZone("exec-detail");
const crossing = requireStealthZone("store-crossing");

function runner(flags: Record<string, FlagValue> = {}): GameState {
  const state = createNewGame({ seed: 3 });
  return { ...state, flags: { ...state.flags, ...flags } };
}

describe("which watch is posted", () => {
  it("finds nobody on an ordinary street", () => {
    expect(activeStealthZone(runner(), "cinder-plaza")).toBeNull();
  });

  it("posts the floor detail until the aisle is somebody's", () => {
    expect(activeStealthZone(runner(), exec.mapId)?.id).toBe(exec.id);
    expect(
      activeStealthZone(runner({ "exec-cleared": true }), exec.mapId),
    ).toBeNull();
  });

  it("posts the crew only while the chain is standing at the water", () => {
    expect(activeStealthZone(runner(), crossing.mapId)).toBeNull();
    expect(
      activeStealthZone(runner({ "under-waterline": "taken" }), crossing.mapId)
        ?.id,
    ).toBe(crossing.id);
    // Once inside, the crossing is behind you.
    expect(
      activeStealthZone(runner({ "under-waterline": "inside" }), crossing.mapId),
    ).toBeNull();
  });

  it("takes a settled crossing off the map, whichever way it settled", () => {
    for (const outcome of ["passed", "spotted"]) {
      expect(
        isZoneLive(runner({ [stealthZoneFlag(exec.id)]: outcome }), exec),
      ).toBe(false);
    }
  });

  it("takes it off once its fight has been had, however it went", () => {
    for (const result of ["victory", "defeat", "fled"]) {
      expect(
        isZoneLive(
          runner({ [combatResultFlag(exec.encounterId)]: result }),
          exec,
        ),
      ).toBe(false);
    }
  });
});

describe("the chrome that buys a second takedown", () => {
  it("is read as a tag, so any implant that earns it counts", () => {
    const bare = runner();
    expect(hasQuietHands(bare)).toBe(false);
    const held = addItem(bare.inventory, "cyb-static-veil", 1);
    const worn = installEnhancement(bare.player, held, "cyb-static-veil");
    expect(
      hasQuietHands({
        ...bare,
        player: worn.character,
        inventory: worn.inventory,
      }),
    ).toBe(true);
  });

  it("is not bought by carrying the implant, only by wearing it", () => {
    const carried = runner();
    expect(
      hasQuietHands({
        ...carried,
        inventory: addItem(carried.inventory, "cyb-static-veil", 1),
      }),
    ).toBe(false);
  });
});
