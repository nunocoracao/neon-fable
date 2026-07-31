import { describe, expect, it } from "vitest";
import { BODY_TIMING, type LoopState } from "../animation";
import { ATTACK_TIMING, attackFrameCount } from "../attack";
import { REACTION_KINDS, reactionFrameCount } from "../reaction";
import {
  DRONE_ART,
  DRONE_ART_IDS,
  DRONE_SET_IDS,
  droneAttackTiming,
  droneFrameCount,
  type DroneArtId,
  type DroneSetId,
} from "./drone";
import { droneArt, entityGrid } from "./entity";
import { BODY_FRAME, BODY_VIEW_IDS } from "./layers/body";
import { PORTRAIT_FRAME } from "./layers/portrait";
import { gridErrors, type PixelGrid } from "./pixel";

/**
 * The authored non-humanoid chassis. It lives outside the layered
 * character system but inside the same 32×48 frame contract, and this
 * file is what holds it to that: valid palette-indexed grids, frame
 * counts matching the shared timings, and an anchor and ground shadow
 * that survive every frame of every set.
 */

const FACINGS = ["n", "e", "s", "w"] as const;
const LOOPS: readonly LoopState[] = ["idle", "walk"];

function everyFrame(
  id: DroneArtId,
): ReadonlyArray<{ label: string; grid: PixelGrid }> {
  const art = droneArt(id);
  const out: Array<{ label: string; grid: PixelGrid }> = [];
  for (const facing of FACINGS) {
    for (const state of LOOPS) {
      for (let f = 0; f < BODY_TIMING[state].frameCount; f++) {
        out.push({
          label: `${id} ${state} ${facing} f${f}`,
          grid: entityGrid(art, facing, state, f),
        });
      }
    }
    const attackClass = DRONE_ART[id].attackClass;
    for (let f = 0; f < attackFrameCount(attackClass); f++) {
      out.push({
        label: `${id} attack ${facing} f${f}`,
        grid: entityGrid(art, facing, "attack", f),
      });
    }
    for (const kind of REACTION_KINDS) {
      for (let f = 0; f < reactionFrameCount(kind); f++) {
        for (const awayX of [-1, 1] as const) {
          out.push({
            label: `${id} react ${kind} ${facing} f${f} away${awayX}`,
            grid: entityGrid(art, facing, "react", f, { kind, awayX }),
          });
        }
      }
    }
  }
  return out;
}

describe("drone art registry", () => {
  it("registers a chassis for every declared id", () => {
    for (const id of DRONE_ART_IDS) {
      expect(DRONE_ART[id], id).toBeTruthy();
      expect(DRONE_ART[id].portrait.length, `${id} has a portrait`)
        .toBeGreaterThan(0);
    }
  });

  it("authors every base grid at the shared 32×48 layer frame", () => {
    for (const id of DRONE_ART_IDS) {
      for (const view of BODY_VIEW_IDS) {
        const grid = DRONE_ART[id].neutral[view];
        expect(gridErrors(grid), `${id} ${view}`).toEqual([]);
        expect(grid.length, `${id} ${view} height`).toBe(BODY_FRAME.height);
        expect(grid[0]?.length, `${id} ${view} width`).toBe(BODY_FRAME.width);
      }
    }
  });

  it("draws two distinct views, so a drone seen from behind is not the front", () => {
    for (const id of DRONE_ART_IDS) {
      expect(DRONE_ART[id].neutral.front.join("\n")).not.toBe(
        DRONE_ART[id].neutral.back.join("\n"),
      );
    }
  });
});

describe("drone frame counts", () => {
  it("matches the loop timings every body shares", () => {
    for (const id of DRONE_ART_IDS) {
      for (const state of LOOPS) {
        expect(droneFrameCount(id, state), `${id} ${state}`).toBe(
          BODY_TIMING[state].frameCount,
        );
      }
    }
  });

  it("matches its attack class's authored timing", () => {
    for (const id of DRONE_ART_IDS) {
      expect(droneFrameCount(id, "attack"), `${id} attack`).toBe(
        droneAttackTiming(id).frameMs.length,
      );
      expect(droneAttackTiming(id)).toBe(
        ATTACK_TIMING[DRONE_ART[id].attackClass],
      );
    }
  });

  it("has the same count in both views for every set", () => {
    for (const id of DRONE_ART_IDS) {
      for (const set of DRONE_SET_IDS) {
        const { front, back } = DRONE_ART[id].frames;
        expect(back[set].length, `${id} ${set}`).toBe(front[set].length);
      }
    }
  });
});

describe("drone frames", () => {
  it("every frame of every set is a valid 32×48 palette-indexed grid", () => {
    for (const id of DRONE_ART_IDS) {
      for (const { label, grid } of everyFrame(id)) {
        expect(gridErrors(grid), label).toEqual([]);
        expect(grid.length, `${label} height`).toBe(BODY_FRAME.height);
        expect(grid[0]?.length, `${label} width`).toBe(BODY_FRAME.width);
      }
    }
  });

  it("never moves the ground shadow, so no frame drifts off its tile", () => {
    for (const id of DRONE_ART_IDS) {
      const shadow = (grid: PixelGrid): string =>
        grid
          .slice(BODY_FRAME.shadow.top, BODY_FRAME.shadow.bottom + 1)
          .join("\n");
      const authored = shadow(DRONE_ART[id].neutral.front);
      expect(authored, "the chassis casts a shadow").toContain("z");
      for (const { label, grid } of everyFrame(id)) {
        // Reactions crumple the chassis onto the shadow; nothing else
        // may touch those rows at all.
        if (label.includes("react")) continue;
        expect(shadow(grid), `${label} shadow`).toBe(authored);
      }
    }
  });

  it("hovers: nothing but the shadow touches the ground rows", () => {
    for (const id of DRONE_ART_IDS) {
      for (const view of BODY_VIEW_IDS) {
        const grid = DRONE_ART[id].neutral[view];
        // The rows a walking body's boots occupy are empty air under a
        // drone — that gap is what reads as a hover.
        for (let r = 38; r < BODY_FRAME.shadow.top; r++) {
          expect(grid[r], `${id} ${view} row ${r} is air`).toBe(
            ".".repeat(BODY_FRAME.width),
          );
        }
      }
    }
  });

  it("bobs: an idle chassis is not the same picture four times", () => {
    for (const id of DRONE_ART_IDS) {
      const art = droneArt(id);
      const frames = Array.from({ length: BODY_TIMING.idle.frameCount }, (_, f) =>
        entityGrid(art, "e", "idle", f).join("\n"),
      );
      expect(new Set(frames).size, `${id} idle bob`).toBeGreaterThan(1);
    }
  });

  it("tilts: travelling frames lean off the idle silhouette", () => {
    for (const id of DRONE_ART_IDS) {
      const art = droneArt(id);
      const idle = entityGrid(art, "e", "idle", 0).join("\n");
      const walking = Array.from({ length: BODY_TIMING.walk.frameCount }, (_, f) =>
        entityGrid(art, "e", "walk", f).join("\n"),
      );
      expect(walking.every((frame) => frame !== idle), `${id} walk`).toBe(true);
    }
  });

  it("fires: the attack set lights the emitter on its impact beat", () => {
    for (const id of DRONE_ART_IDS) {
      const art = droneArt(id);
      const attackClass = DRONE_ART[id].attackClass;
      const impact = ATTACK_TIMING[attackClass].impactFrame;
      const charge = (frame: number): number =>
        entityGrid(art, "e", "attack", frame)
          .join("")
          .split("")
          .filter((ch) => ch === "n").length;
      // The bolt leaving is the brightest frame of the set, and it is
      // the frame the combat scene schedules the hit against.
      expect(charge(impact), `${id} impact glow`).toBeGreaterThan(charge(0));
      expect(charge(impact), `${id} impact vs recovery`).toBeGreaterThan(
        charge(attackFrameCount(attackClass) - 1),
      );
    }
  });

  it("sparks out: the death set throws charge and ends flat", () => {
    for (const id of DRONE_ART_IDS) {
      const art = droneArt(id);
      const last = reactionFrameCount("sparkout") - 1;
      const heap = entityGrid(art, "e", "react", last, {
        kind: "sparkout",
        awayX: 1,
      });
      const standing = entityGrid(art, "e", "idle", 0);
      const topOf = (grid: PixelGrid): number =>
        grid.findIndex((row) => /[^.z]/.test(row));
      // Whatever was flying is now on the deck: the highest painted row
      // of the heap sits below where the chassis used to float.
      expect(topOf(heap), `${id} heap`).toBeGreaterThan(topOf(standing));
    }
  });
});

describe("drone portrait", () => {
  it("is a valid grid at the portrait frame", () => {
    for (const id of DRONE_ART_IDS) {
      const portrait = DRONE_ART[id].portrait;
      expect(gridErrors(portrait), `${id} portrait`).toEqual([]);
      expect(portrait.length, `${id} portrait height`).toBe(
        PORTRAIT_FRAME.height,
      );
      expect(portrait[0]?.length, `${id} portrait width`).toBe(
        PORTRAIT_FRAME.width,
      );
    }
  });

  it("shows the camera eye — a machine's face is the thing looking back", () => {
    for (const id of DRONE_ART_IDS) {
      expect(
        DRONE_ART[id].portrait.join("").includes("p"),
        `${id} portrait optic`,
      ).toBe(true);
    }
  });
});

describe("drone sets", () => {
  it("declares exactly the sets it authors", () => {
    const sets: readonly DroneSetId[] = DRONE_SET_IDS;
    for (const id of DRONE_ART_IDS) {
      expect(Object.keys(DRONE_ART[id].frames.front).sort()).toEqual(
        [...sets].sort(),
      );
    }
  });
});
