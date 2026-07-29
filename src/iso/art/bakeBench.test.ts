// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BODY_TIMING, type Facing, type MotionState } from "../animation";
import { composeVisual } from "../../character/appearance";
import { enemies } from "../../data/enemies";
import { INTERACTABLE_ART } from "./interactables";
import {
  composedCharacterGrid,
  skinToneRemap,
  type ComposedCharacter,
} from "./layers";
import { BODY_BUILD_IDS, BODY_FRAME } from "./layers/body";
import { BODY_ANIM } from "./layers/bodyAnim";
import { bakeSilhouette, bakeSprite, mirrored } from "./pixel";
import { PROP_ART } from "./props";
import { TILE_ART } from "./tiles";

/**
 * Micro-benchmark guarding compose+bake cost: bakes every registered
 * grid through the same transform chains the provider uses. The stub
 * context makes fillRect free, so what's measured is the JS work we own
 * — grid transforms (compose, remap, mirror) and the run-collapsing
 * paint loop — which is exactly what a scene pays on a cache miss.
 * The full current set (~320 sprites) bakes in ~9ms on a dev machine;
 * the budget leaves room for slower CI and severalfold art growth while
 * still catching order-of-magnitude regressions (a per-pixel paint
 * path, an accidental deep copy in the compose chain).
 */
const TIME_BUDGET_MS = 1000;
/** Sanity floor so a broken enumeration can't pass an empty benchmark. */
const MIN_SPRITES = 300;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({ fillStyle: "", fillRect: () => {} }) as unknown as CanvasRenderingContext2D,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Bake the full current art set once; returns the number of bakes. */
function bakeEverything(): number {
  let baked = 0;

  for (const art of Object.values(TILE_ART)) {
    for (const frames of art.variants) {
      for (const frame of frames) {
        bakeSprite(frame, 32, 16);
        baked++;
      }
    }
  }

  for (const art of Object.values(PROP_ART)) {
    for (const frame of art.frames) {
      bakeSprite(frame, art.anchorX, art.anchorY);
      baked++;
    }
  }

  for (const art of Object.values(INTERACTABLE_ART)) {
    for (const frame of art.frames) {
      bakeSprite(frame, art.anchorX, art.anchorY);
      baked++;
    }
  }

  const facings: Facing[] = ["n", "e", "s", "w"];
  const states: MotionState[] = ["idle", "walk"];

  // The v2 layered bodies: both builds and views, plus the mirrored
  // facings the provider derives at bake time.
  for (const build of Object.values(BODY_ANIM)) {
    for (const view of Object.values(build)) {
      for (const state of states) {
        for (let i = 0; i < BODY_TIMING[state].frameCount; i++) {
          const frame = view[state][i] ?? [];
          bakeSprite(frame, BODY_FRAME.anchorX, BODY_FRAME.anchorY);
          bakeSprite(mirrored(frame), BODY_FRAME.anchorX, BODY_FRAME.anchorY);
          baked += 2;
        }
      }
    }
  }

  // The composed player path: full compose + animate + bake per frame,
  // exactly what the provider pays on a player cache miss — both builds
  // at two skin tones, every facing, state, and frame.
  const composedCharacters: ComposedCharacter[] = BODY_BUILD_IDS.flatMap(
    (build) =>
      [0, 2].map((tone): ComposedCharacter => {
        const skin = skinToneRemap(tone);
        return {
          build,
          layers: [
            { slot: "body", art: build, remap: skin },
            { slot: "face", art: "standard", remap: skin },
            { slot: "face", art: "straight", remap: {} },
            { slot: "face", art: "neutral", remap: skin },
          ],
        };
      }),
  );
  for (const character of composedCharacters) {
    for (const facing of facings) {
      for (const state of states) {
        for (let i = 0; i < BODY_TIMING[state].frameCount; i++) {
          bakeSprite(
            composedCharacterGrid(character, facing, state, i),
            BODY_FRAME.anchorX,
            BODY_FRAME.anchorY,
          );
          baked++;
        }
      }
    }
  }

  // The composed cast: every enemy archetype's full authored layer
  // stack (outfit, weapon, cyberware) plus a hit-flash silhouette —
  // what a combat scene pays to warm its cache.
  for (const enemy of enemies) {
    const character = composeVisual(enemy.visual);
    for (const facing of facings) {
      for (const state of states) {
        for (let i = 0; i < BODY_TIMING[state].frameCount; i++) {
          const grid = composedCharacterGrid(character, facing, state, i);
          bakeSprite(grid, BODY_FRAME.anchorX, BODY_FRAME.anchorY);
          bakeSilhouette(grid, "#ffffff", BODY_FRAME.anchorX, BODY_FRAME.anchorY);
          baked += 2;
        }
      }
    }
  }

  return baked;
}

describe("compose+bake micro-benchmark", () => {
  it(`bakes the full art set under ${TIME_BUDGET_MS}ms`, () => {
    bakeEverything(); // warm-up: JIT and module-level lazy work
    const start = performance.now();
    const baked = bakeEverything();
    const elapsed = performance.now() - start;
    expect(baked).toBeGreaterThanOrEqual(MIN_SPRITES);
    expect(elapsed).toBeLessThan(TIME_BUDGET_MS);
  });
});
