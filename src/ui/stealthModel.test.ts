import { describe, expect, it } from "vitest";
import { testRoom, testZone } from "../stealth/testSupport";
import {
  earshotOnlyTiles,
  guardViews,
  lungeOffer,
  startStealth,
  takedownOffer,
  watchedTiles,
} from "../stealth";
import {
  CROUCH_KEY,
  STEALTH_ACTION_KEY,
  crouchLabel,
  guardEntities,
  spottedLine,
  stealthPrompt,
  stealthRefusal,
  takedownLine,
  watchTints,
} from "./stealthModel";

const map = testRoom();
const zone = testZone();
const views = guardViews(map, zone, 0, {});
const run = startStealth(zone);

const key = (tile: { x: number; y: number }): string => `${tile.x},${tile.y}`;

describe("what a watch looks like on the ground", () => {
  it("tints every cone as reach, and every guard's own tile as an origin", () => {
    const tints = watchTints(views, { crouched: true });
    const cones = new Set(watchedTiles(views).map(key));
    for (const tile of tints) {
      if (tile.tint === "range") expect(cones.has(key(tile))).toBe(true);
    }
    for (const view of views) {
      expect(tints).toContainEqual({ ...view.tile, tint: "origin" });
    }
  });

  it("drops the earshot ring entirely while crouching", () => {
    const standing = watchTints(views, { crouched: false });
    const crouched = watchTints(views, { crouched: true });
    const ring = earshotOnlyTiles(views);
    expect(ring.length).toBeGreaterThan(0);
    for (const tile of ring) {
      expect(standing).toContainEqual({ ...tile, tint: "threat" });
      expect(crouched.some((t) => key(t) === key(tile) && t.tint === "threat")).toBe(
        false,
      );
    }
  });

  it("paints a cone over the ring where the two overlap, never both", () => {
    const tints = watchTints(views, { crouched: false });
    const cones = new Set(watchedTiles(views).map(key));
    for (const tile of tints) {
      if (tile.tint !== "threat") continue;
      expect(cones.has(key(tile)), `${key(tile)} tinted twice`).toBe(false);
    }
  });

  it("draws every live guard as a figure at its own fractional position", () => {
    const midStep = guardViews(map, zone, 2.5, {});
    const entities = guardEntities(midStep);
    expect(entities).toHaveLength(midStep.length);
    expect(entities[0]).toEqual({
      spriteId: midStep[0]!.spriteId,
      position: { x: midStep[0]!.x, y: midStep[0]!.y },
      facing: midStep[0]!.facing,
      moving: midStep[0]!.moving,
    });
  });
});

describe("the one line of prompt", () => {
  const flags = {};

  it("offers the takedown when there is a neck within reach", () => {
    const takedown = takedownOffer(zone, run, views, { x: 2, y: 1 }, {
      flags,
      quiet: false,
    });
    const lunge = lungeOffer(zone, run, { x: 2, y: 1 }, 9);
    expect(stealthPrompt(takedown, lunge)).toBe(
      `${STEALTH_ACTION_KEY.toUpperCase()} — take down the walker`,
    );
  });

  it("offers the dash when there is a gap and nobody to take", () => {
    const takedown = takedownOffer(zone, run, views, { x: 1, y: 3 }, {
      flags,
      quiet: false,
    });
    const lunge = lungeOffer(zone, run, { x: 1, y: 3 }, 9);
    expect(stealthPrompt(takedown, lunge)).toBe(
      `${STEALTH_ACTION_KEY.toUpperCase()} — lunge past the mouth of the far side`,
    );
  });

  it("says nothing at all on ordinary ground", () => {
    const takedown = takedownOffer(zone, run, views, { x: 7, y: 4 }, {
      flags,
      quiet: false,
    });
    const lunge = lungeOffer(zone, run, { x: 7, y: 4 }, 9);
    expect(stealthPrompt(takedown, lunge)).toBeNull();
    expect(stealthRefusal(takedown, lunge)).toBeNull();
  });

  it("explains the two refusals worth explaining, and no others", () => {
    const slow = lungeOffer(zone, run, { x: 1, y: 3 }, 2);
    const none = takedownOffer(zone, run, views, { x: 1, y: 3 }, {
      flags,
      quiet: false,
    });
    expect(stealthRefusal(none, slow)).toBe("You are not quick enough for that gap.");
    const aware = takedownOffer(zone, run, guardViews(map, zone, 2, {}), {
      x: 3,
      y: 3,
    }, { flags, quiet: false });
    expect(stealthRefusal(aware, { ok: false, reason: "no-pinch" })).toBe(
      "They are looking straight at you.",
    );
    // A machine within reach is not a refusal anybody needs a sentence
    // about — the prompt simply never appeared.
    const immune = takedownOffer(zone, run, views, { x: 6, y: 3 }, {
      flags,
      quiet: false,
    });
    expect(stealthRefusal(immune, { ok: false, reason: "no-pinch" })).toBeNull();
  });
});

describe("the words for what just happened", () => {
  it("names the guard a takedown took", () => {
    expect(takedownLine(views[0]!)).toBe("The walker goes down quietly.");
  });

  it("puts the noise before the shout when it was a footstep", () => {
    expect(
      spottedLine({ guardId: "a", name: "n", sense: "sound", bark: "\"Oi!\"" }),
    ).toBe("A boot on the plate. \"Oi!\"");
    expect(
      spottedLine({ guardId: "a", name: "n", sense: "sight", bark: "\"Oi!\"" }),
    ).toBe("\"Oi!\"");
  });

  it("names the crouch key in the HUD, both ways round", () => {
    const up = CROUCH_KEY.toUpperCase();
    expect(crouchLabel(true)).toBe(`Crouched [${up}]`);
    expect(crouchLabel(false)).toBe(`Standing [${up}]`);
  });
});
