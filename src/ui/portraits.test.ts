// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  composePortrait,
  composeVisualPortrait,
  defaultAppearance,
  visualPortraitKey,
} from "../character";
import { encounters, spawnLookIndex } from "../data/encounters";
import { enemyLook, getEnemy, requireEnemy } from "../data/enemies";
import { DRONE_ART } from "../iso";
import { PORTRAIT_FRAME } from "../iso/art/layers/portrait";
import { ART_SCALE } from "../iso/art/pixel";
import { emptyEquipment } from "../inventory";
import {
  enemyPortraitCanvas,
  portraitCanvas,
  visualPortraitCanvas,
} from "./portraits";

/**
 * Portrait baking for the DOM screens. What a portrait *looks* like is
 * settled in the pure compose layer (src/character/portrait) and
 * checked there; what this file holds is the screen-facing promise —
 * every face the game shows comes back as a canvas of the right size,
 * every enemy that can appear on a board has one, and a machine gets
 * its own authored plate rather than a composed human head.
 *
 * The 2d context is stubbed as in flow.test — painting is not under
 * test.
 */

/** Canvas stub proxy, as in flow.test. */
function anything(): unknown {
  const fn = (): unknown => anything();
  return new Proxy(fn, {
    get: (_target, prop) =>
      prop === Symbol.toPrimitive ? () => 0 : anything(),
    set: () => true,
    apply: () => anything(),
  });
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => anything() as CanvasRenderingContext2D,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

function expectPortraitSized(canvas: HTMLCanvasElement, label: string): void {
  expect(canvas.width, `${label} width`).toBe(PORTRAIT_FRAME.width * ART_SCALE);
  expect(canvas.height, `${label} height`).toBe(
    PORTRAIT_FRAME.height * ART_SCALE,
  );
}

describe("portraitCanvas", () => {
  it("bakes at the portrait frame times the art scale", () => {
    expectPortraitSized(
      portraitCanvas(defaultAppearance(), emptyEquipment()),
      "player",
    );
  });
});

describe("visualPortraitCanvas", () => {
  it("keeps a crew dye between the sprite and the face wearing it", () => {
    const collector = requireEnemy("nme-auric-collector");
    if (collector.spriteKind !== "humanoid") throw new Error("expected humanoid");
    const dyed = collector.looks[1];
    expect(dyed?.outfitDye, "the family authors a dye to check").toBeTruthy();
    if (!dyed) return;
    const undyed = { ...dyed, outfitDye: undefined };
    // A dye is a visible difference in the portrait, not a no-op the
    // compose path quietly drops — and it keys its own bake.
    expect(composeVisualPortrait(dyed, "grim")).not.toEqual(
      composeVisualPortrait(undyed, "grim"),
    );
    expect(visualPortraitKey(dyed, "grim")).not.toBe(
      visualPortraitKey(undyed, "grim"),
    );
    expectPortraitSized(visualPortraitCanvas(dyed, "grim"), "dyed collector");
  });

  it("falls back to the stock face rather than crashing on bad content", () => {
    const broken = {
      appearance: { ...defaultAppearance(), hairStyle: "not-a-style" },
    };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expectPortraitSized(visualPortraitCanvas(broken, "grim"), "broken look");
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("enemyPortraitCanvas", () => {
  it("draws the record of the family the body is actually wearing", () => {
    const agent = requireEnemy("nme-auric-agent");
    if (agent.spriteKind !== "humanoid") throw new Error("expected humanoid");
    const first = enemyLook(agent, 0);
    const second = enemyLook(agent, 1);
    if (!first || !second) throw new Error("expected a family");
    expect(composeVisualPortrait(first, "grim")).not.toEqual(
      composeVisualPortrait(second, "grim"),
    );
    expectPortraitSized(enemyPortraitCanvas("nme-auric-agent", 1), "agent look1");
  });

  it("gives the drone its own authored plate, not a composed face", () => {
    const drone = requireEnemy("nme-static-drone");
    if (drone.spriteKind !== "drone") throw new Error("expected a drone");
    const plate = DRONE_ART[drone.droneArt].portrait;
    expect(plate.length).toBe(PORTRAIT_FRAME.height);
    // Nothing the appearance system can compose is this picture.
    expect(plate).not.toEqual(
      composePortrait(defaultAppearance(), emptyEquipment(), "grim"),
    );
    expectPortraitSized(enemyPortraitCanvas("nme-static-drone"), "drone");
    // A machine's face does not vary with a look index it does not have.
    expectPortraitSized(enemyPortraitCanvas("nme-static-drone", 2), "drone look2");
  });

  it("accepts a full sprite id as well as a bare archetype id", () => {
    expectPortraitSized(enemyPortraitCanvas("nme-cordon-enforcer#2"), "suffixed");
    expectPortraitSized(enemyPortraitCanvas("nme-cordon-enforcer"), "bare");
  });

  it("gives an unknown archetype the stock face instead of an empty chip", () => {
    expectPortraitSized(enemyPortraitCanvas("nme-nobody"), "unknown");
    expectPortraitSized(enemyPortraitCanvas(null), "null id");
  });

  it("gives every enemy of every authored encounter a face", () => {
    for (const encounter of encounters) {
      encounter.enemies.forEach((spawn, slot) => {
        const look = spawnLookIndex(encounter.id, slot, spawn);
        const where = `${encounter.id} slot ${slot}`;
        expect(getEnemy(spawn.enemyId), where).toBeTruthy();
        expectPortraitSized(
          enemyPortraitCanvas(spawn.enemyId, look, "grim"),
          where,
        );
      });
    }
  });
});
