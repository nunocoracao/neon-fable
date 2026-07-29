import { afterEach, describe, expect, it, vi } from "vitest";
import { composeCharacter, defaultAppearance } from "../character";
import { emptyEquipment } from "../inventory/equipment";
import { playerSpriteSource } from "./playerSprite";
import type { Session } from "./session";

/** The minimal slice of Session the sprite source reads. */
function fakeSession(
  appearance = defaultAppearance(),
  equipment = emptyEquipment(),
): Session {
  return { state: { player: { appearance, equipment } } } as unknown as Session;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("playerSpriteSource", () => {
  it("composes the session player's appearance and equipment", () => {
    const session = fakeSession();
    expect(playerSpriteSource(session)()).toEqual(
      composeCharacter(defaultAppearance(), emptyEquipment()),
    );
  });

  it("returns the identical descriptor while nothing changed", () => {
    const source = playerSpriteSource(fakeSession());
    expect(source()).toBe(source());
  });

  it("recomposes when the appearance reference changes", () => {
    const session = fakeSession();
    const source = playerSpriteSource(session);
    const before = source();
    session.state = {
      ...session.state,
      player: {
        ...session.state.player,
        appearance: { ...defaultAppearance(), skinTone: "deep-umber" },
      },
    };
    const after = source();
    expect(after).not.toBe(before);
    expect(after.layers[0]?.remap).toEqual({ r: "I", q: "H", A: "J" });
  });

  it("recomposes when the equipment reference changes", () => {
    const session = fakeSession();
    const source = playerSpriteSource(session);
    const before = source();
    session.state = {
      ...session.state,
      player: {
        ...session.state.player,
        equipment: { ...emptyEquipment(), weapon: "wpn-shard-knife" },
      },
    };
    const after = source();
    expect(after).not.toBe(before);
    // The equipped knife resolves to its blade class layer per build.
    expect(after.layers.find((l) => l.slot === "weapon")?.art).toBe(
      "blade@lean",
    );
  });

  it("degrades a corrupt appearance to the default look", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = { ...defaultAppearance(), build: "colossus" };
    const source = playerSpriteSource(fakeSession(broken));
    expect(source()).toEqual(
      composeCharacter(defaultAppearance(), emptyEquipment()),
    );
    expect(errorSpy).toHaveBeenCalledOnce();
  });
});
