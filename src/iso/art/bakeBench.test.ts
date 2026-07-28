// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BODY_TIMING, type Facing, type MotionState } from "../animation";
import {
  CHARACTER_ANCHOR_X,
  CHARACTER_ANCHOR_Y,
  CHARACTER_FRAMES,
  ROLE_REMAPS,
  type CharacterRole,
} from "./characters";
import { INTERACTABLE_ART } from "./interactables";
import { BODY_FRAME } from "./layers/body";
import { BODY_ANIM } from "./layers/bodyAnim";
import {
  bakeSilhouette,
  bakeSprite,
  mirrored,
  nativeScaled,
  remapped,
  upscaled,
} from "./pixel";
import { PROP_ART } from "./props";
import { TILE_ART } from "./tiles";

/**
 * Micro-benchmark guarding compose+bake cost: bakes every registered
 * grid through the same transform chains the provider uses. The stub
 * context makes fillRect free, so what's measured is the JS work we own
 * — grid transforms (upscale, remap, mirror) and the run-collapsing
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
  const SHIM = 2;
  let baked = 0;

  for (const art of Object.values(TILE_ART)) {
    for (const frames of art.variants) {
      for (const frame of frames) {
        bakeSprite(nativeScaled(frame), 32, 16);
        baked++;
      }
    }
  }

  for (const art of Object.values(PROP_ART)) {
    for (const frame of art.frames) {
      if (art.native) bakeSprite(frame, art.anchorX, art.anchorY);
      else bakeSprite(upscaled(frame), art.anchorX * SHIM, art.anchorY * SHIM);
      baked++;
    }
  }

  for (const art of Object.values(INTERACTABLE_ART)) {
    for (const frame of art.frames) {
      bakeSprite(frame, art.anchorX, art.anchorY);
      baked++;
    }
  }

  const roles = Object.keys(ROLE_REMAPS) as CharacterRole[];
  const facings: Facing[] = ["n", "e", "s", "w"];
  const states: MotionState[] = ["idle", "walk"];
  for (const facing of facings) {
    for (const state of states) {
      for (const frame of CHARACTER_FRAMES[facing][state]) {
        for (const role of roles) {
          bakeSprite(
            upscaled(remapped(frame, ROLE_REMAPS[role])),
            CHARACTER_ANCHOR_X * SHIM,
            CHARACTER_ANCHOR_Y * SHIM,
          );
          baked++;
        }
        bakeSilhouette(
          upscaled(frame),
          "#ffffff",
          CHARACTER_ANCHOR_X * SHIM,
          CHARACTER_ANCHOR_Y * SHIM,
        );
        baked++;
      }
    }
  }

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
