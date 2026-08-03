import { describe, expect, it } from "vitest";
import { BODY_TIMING } from "../../animation";
import { REMAP_CHANNELS } from "../palette";
import { gridErrors, type PixelGrid } from "../pixel";
import {
  BODY_BUILD_IDS,
  BODY_FRAME,
  BODY_GRIDS,
  BODY_VIEW_IDS,
} from "./body";
import { BODY_ANIM } from "./bodyAnim";

const SKIN = REMAP_CHANNELS.skin as readonly string[];

/** Every (build, view) animation set with its base grid, for iteration. */
const ALL_SETS = BODY_BUILD_IDS.flatMap((build) =>
  BODY_VIEW_IDS.map((view) => ({
    build,
    view,
    base: BODY_GRIDS[build][view],
    anim: BODY_ANIM[build][view],
    label: `${build} ${view}`,
  })),
);

/** Lowest row above the shadow band with any opaque pixel. */
function bottomBodyRow(grid: PixelGrid): number {
  for (let y = BODY_FRAME.shadow.top - 1; y >= 0; y--) {
    if ((grid[y] ?? "").split("").some((ch) => ch !== ".")) return y;
  }
  return -1;
}

describe("hi-res body animation frames", () => {
  it("matches the BODY_TIMING frame counts for both states", () => {
    for (const { anim, label } of ALL_SETS) {
      expect(anim.walk.length, `${label} walk`).toBe(BODY_TIMING.walk.frameCount);
      expect(anim.idle.length, `${label} idle`).toBe(BODY_TIMING.idle.frameCount);
    }
  });

  it("every frame is a valid 32×48 palette grid", () => {
    for (const { anim, label } of ALL_SETS) {
      for (const [state, frames] of Object.entries(anim)) {
        for (const [i, frame] of frames.entries()) {
          const name = `${label} ${state} ${i}`;
          expect(gridErrors(frame), name).toEqual([]);
          expect(frame.length, `${name} height`).toBe(BODY_FRAME.height);
          expect(frame[0]?.length, `${name} width`).toBe(BODY_FRAME.width);
        }
      }
    }
  });

  it("keeps the anchor shadow identical on every frame (no drift)", () => {
    for (const { base, anim, label } of ALL_SETS) {
      const ground = base.slice(BODY_FRAME.shadow.top);
      for (const [state, frames] of Object.entries(anim)) {
        for (const [i, frame] of frames.entries()) {
          expect(frame.slice(BODY_FRAME.shadow.top), `${label} ${state} ${i}`).toEqual(
            ground,
          );
        }
      }
    }
  });

  it("leaves the top margin clear even on raised frames", () => {
    for (const { anim, label } of ALL_SETS) {
      for (const [state, frames] of Object.entries(anim)) {
        for (const [i, frame] of frames.entries()) {
          expect(frame[0], `${label} ${state} ${i} row 0`).toBe(".".repeat(32));
          expect(frame[1], `${label} ${state} ${i} row 1`).toBe(".".repeat(32));
        }
      }
    }
  });

  it("plants feet through the step and clears the ground only on reach", () => {
    const grounded = BODY_FRAME.shadow.top - 1;
    for (const { anim, label } of ALL_SETS) {
      for (const [i, frame] of anim.walk.entries()) {
        // One rise and fall per step: contact and passing stand, recoil
        // sinks into the boot row, reach is the pose that lifts.
        const isReach = i % 4 === 3;
        expect(bottomBodyRow(frame), `${label} walk ${i}`).toBe(
          isReach ? grounded - 1 : grounded,
        );
      }
      for (const [i, frame] of anim.idle.entries()) {
        expect(bottomBodyRow(frame), `${label} idle ${i}`).toBe(grounded);
      }
    }
  });

  it("counter-swings the arms between the two stride halves", () => {
    for (const { build, anim, label } of ALL_SETS) {
      const hands = BODY_FRAME.hands[build];
      const [top, bottom] = hands.rows;
      const skinAt = (frame: PixelGrid, r: number, cols: readonly number[]) =>
        cols.every((c) => SKIN.includes(frame[r]?.[c] ?? "."));
      const contactA = anim.walk[0] ?? [];
      const contactB = anim.walk[4] ?? [];
      // Right leg leads first: left hand rides above the belt, right
      // hand drops onto the hip; the second half swaps sides.
      expect(skinAt(contactA, top - 1, hands.left), `${label} A left up`).toBe(true);
      expect(skinAt(contactA, bottom + 1, hands.right), `${label} A right down`).toBe(true);
      expect(skinAt(contactB, top - 1, hands.right), `${label} B right up`).toBe(true);
      expect(skinAt(contactB, bottom + 1, hands.left), `${label} B left down`).toBe(true);
    }
  });

  it("walk frames are all distinct so the loop actually cycles", () => {
    for (const { anim, label } of ALL_SETS) {
      const unique = new Set(anim.walk.map((f) => f.join("\n")));
      expect(unique.size, label).toBe(anim.walk.length);
    }
  });

  it("breathes: shoulders rise, the peak lifts the head, settle repeats", () => {
    for (const { base, anim, label } of ALL_SETS) {
      const shoulder = BODY_FRAME.neck.bottom + 1;
      const [neutral, rise, peak, settle] = anim.idle;
      expect(neutral, `${label} neutral`).toEqual(base);
      expect(rise?.[shoulder - 1], `${label} rise shoulders`).toBe(base[shoulder]);
      expect(rise, `${label} rise differs`).not.toEqual(neutral);
      expect(peak?.[2], `${label} peak head`).toBe(base[3]);
      expect(settle, `${label} settle`).toEqual(rise);
    }
  });

  it("never moves hips or feet during the idle breath", () => {
    for (const { base, anim, label } of ALL_SETS) {
      const shoulder = BODY_FRAME.neck.bottom + 1;
      for (const [i, frame] of anim.idle.entries()) {
        expect(frame.slice(shoulder + 1), `${label} idle ${i}`).toEqual(
          base.slice(shoulder + 1),
        );
      }
    }
  });
});
