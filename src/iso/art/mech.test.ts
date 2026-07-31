import { describe, expect, it } from "vitest";
import { BODY_TIMING, type LoopState } from "../animation";
import { ATTACK_TIMING, attackFrameCount } from "../attack";
import {
  DEATH_REACTION_KINDS,
  REACTION_KINDS,
  reactionFrameCount,
} from "../reaction";
import {
  MECH_ART,
  MECH_ART_IDS,
  MECH_FRAME,
  MECH_SET_IDS,
  MECH_VIEW_IDS,
  mechAttackClass,
  mechAttackVariant,
  mechFrameCount,
  mechGrid,
  mechMuzzlePoint,
  mechViewForFacing,
  type MechArtId,
  type MechSetId,
} from "./mech";
import { entityFrame, entityFrameKey, entityGrid, mechArt } from "./entity";
import { EMISSIVE_COLORS } from "./palette";
import { gridErrors, type PixelGrid } from "./pixel";

/**
 * The authored multi-tile chassis. It lives outside both the layered
 * character system and the 32×48 frame everything else shares, and this
 * file is what holds it to the contract it does have: valid
 * palette-indexed grids at its own frame size, frame counts matching the
 * shared timings, an anchor and a ground shadow that survive every
 * transform, and a silhouette that actually changes when it moves.
 */

const FACINGS = ["n", "e", "s", "w"] as const;
const LOOPS: readonly LoopState[] = ["idle", "walk"];
const AWAYS = [-1, 1] as const;

interface Frame {
  label: string;
  grid: PixelGrid;
}

/** Every frame of every set, every facing, every variant. */
function everyFrame(id: MechArtId): readonly Frame[] {
  const art = mechArt(id);
  const out: Frame[] = [];
  for (const facing of FACINGS) {
    for (const set of MECH_SET_IDS) {
      for (let f = 0; f < mechFrameCount(id, set); f++) {
        out.push({
          label: `${id} ${set} ${facing} f${f}`,
          grid: entityGrid(art, facing, set, f),
        });
      }
    }
    for (let v = 0; v < MECH_ART[id].attackClasses.length; v++) {
      for (let f = 0; f < attackFrameCount(mechAttackClass(id, v)); f++) {
        out.push({
          label: `${id} attack v${v} ${facing} f${f}`,
          grid: entityGrid(art, facing, "attack", f, undefined, v),
        });
      }
    }
    for (const kind of REACTION_KINDS) {
      for (let f = 0; f < reactionFrameCount(kind); f++) {
        for (const awayX of AWAYS) {
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

/** Rows the chassis itself may occupy; the shadow lives below them. */
const BODY_ROWS = { top: 0, bottom: MECH_FRAME.groundRow } as const;

function opaqueCells(grid: PixelGrid): Set<string> {
  const cells = new Set<string>();
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch !== "." && ch !== "z") cells.add(`${x},${y}`);
    }
  });
  return cells;
}

describe.each(MECH_ART_IDS.map((id) => [id] as const))("%s", (id) => {
  const frames = everyFrame(id);

  it("draws valid palette-indexed grids at the mech frame", () => {
    for (const { label, grid } of frames) {
      expect(gridErrors(grid), label).toEqual([]);
      expect(grid.length, `${label} height`).toBe(MECH_FRAME.height);
      expect(grid[0]?.length, `${label} width`).toBe(MECH_FRAME.width);
    }
  });

  it("is bigger than the body frame, which is the whole point", () => {
    expect(entityFrame(mechArt(id))).toEqual(MECH_FRAME);
    expect(MECH_FRAME.width).toBeGreaterThan(32);
    expect(MECH_FRAME.height).toBeGreaterThan(48);
    // The anchor is the shadow's centre, which lands on the middle of
    // the 2×2 block rather than between a pair of boots.
    expect(MECH_FRAME.anchorX).toBe(MECH_FRAME.shadow.centerX);
    expect(MECH_FRAME.anchorY).toBeGreaterThan(MECH_FRAME.shadow.top);
    expect(MECH_FRAME.anchorY).toBeLessThan(MECH_FRAME.shadow.bottom + 1);
  });

  it("matches the shared loop timings frame for frame", () => {
    for (const state of LOOPS) {
      expect(mechFrameCount(id, state), state).toBe(
        BODY_TIMING[state].frameCount,
      );
    }
    // The held wind-up rides the idle cadence: it is a stance, not a
    // sequence, so it breathes at the speed a standing thing breathes.
    expect(mechFrameCount(id, "charge")).toBe(BODY_TIMING.idle.frameCount);
  });

  it("matches its attack classes' timings frame for frame", () => {
    const classes = MECH_ART[id].attackClasses;
    // Two swings, because the chassis has two things to swing.
    expect(classes.length).toBeGreaterThanOrEqual(2);
    classes.forEach((attackClass, variant) => {
      expect(MECH_ART[id].attacks.front[variant]).toHaveLength(
        ATTACK_TIMING[attackClass].frameMs.length,
      );
      expect(MECH_ART[id].attacks.back[variant]).toHaveLength(
        ATTACK_TIMING[attackClass].frameMs.length,
      );
    });
  });

  it("clamps an out-of-range attack variant instead of blanking", () => {
    const last = MECH_ART[id].attackClasses.length - 1;
    expect(mechAttackVariant(id, 99)).toBe(last);
    expect(mechAttackVariant(id, -4)).toBe(0);
    expect(mechAttackClass(id, 99)).toBe(mechAttackClass(id, last));
    expect(() => mechGrid(id, "e", "attack", 0, { attackVariant: 99 })).not.toThrow();
  });

  it("keeps the ground shadow under the anchor on every frame", () => {
    for (const { label, grid } of frames) {
      let anyShadow = false;
      for (let y = MECH_FRAME.shadow.top; y <= MECH_FRAME.shadow.bottom; y++) {
        if ((grid[y] ?? "").includes("z")) anyShadow = true;
      }
      expect(anyShadow, `${label} casts a shadow`).toBe(true);
      // And no frame paints shadow up in the air where the chassis is.
      for (let y = BODY_ROWS.top; y < MECH_FRAME.shadow.top; y++) {
        expect((grid[y] ?? "").includes("z"), `${label} row ${y}`).toBe(false);
      }
    }
  });

  it("never lets a transform push the chassis into the shadow band", () => {
    // The shadow rows are identical across every frame: nothing that
    // moves the chassis is allowed to drag its footprint with it.
    const reference = mechGrid(id, "e", "idle", 0).slice(
      MECH_FRAME.shadow.top,
      MECH_FRAME.shadow.bottom + 1,
    );
    for (const { label, grid } of frames) {
      // Reactions fold the chassis onto the shadow, and the mirrored
      // facings flip it, so compare within one facing's own loops.
      if (!label.includes(" e ") || label.includes("react")) continue;
      expect(
        grid.slice(MECH_FRAME.shadow.top, MECH_FRAME.shadow.bottom + 1),
        label,
      ).toEqual(reference);
    }
  });

  it("mirrors the away facings rather than authoring them twice", () => {
    expect(mechViewForFacing("e")).toEqual({ view: "front", flip: false });
    expect(mechViewForFacing("s")).toEqual({ view: "front", flip: true });
    expect(mechViewForFacing("n")).toEqual({ view: "back", flip: false });
    expect(mechViewForFacing("w")).toEqual({ view: "back", flip: true });
    const east = mechGrid(id, "e", "idle", 0);
    const south = mechGrid(id, "s", "idle", 0);
    expect(south).toEqual(east.map((row) => [...row].reverse().join("")));
  });

  it("mirrors the muzzle with the figure", () => {
    for (let v = 0; v < MECH_ART[id].attackClasses.length; v++) {
      const east = mechMuzzlePoint(id, "e", v);
      const south = mechMuzzlePoint(id, "s", v);
      expect(south.y).toBe(east.y);
      expect(south.x).toBe(MECH_FRAME.width - 1 - east.x);
      // And it is somewhere on the chassis, not out in the air.
      expect(east.x).toBeGreaterThanOrEqual(0);
      expect(east.x).toBeLessThan(MECH_FRAME.width);
      expect(east.y).toBeLessThan(MECH_FRAME.groundRow);
    }
    // The two swings leave from two different places — an arm and a
    // shoulder battery are not the same port.
    expect(mechMuzzlePoint(id, "e", 0)).not.toEqual(mechMuzzlePoint(id, "e", 1));
  });

  it("actually animates: every set changes shape between frames", () => {
    for (const set of MECH_SET_IDS) {
      const shapes = new Set(
        Array.from({ length: mechFrameCount(id, set) }, (_, f) =>
          [...opaqueCells(mechGrid(id, "e", set, f))].sort().join("|"),
        ),
      );
      expect(shapes.size, `${set} has distinct frames`).toBeGreaterThan(1);
    }
    for (let v = 0; v < MECH_ART[id].attackClasses.length; v++) {
      const count = attackFrameCount(mechAttackClass(id, v));
      const shapes = new Set(
        Array.from({ length: count }, (_, f) =>
          [...opaqueCells(mechGrid(id, "e", "attack", f, { attackVariant: v }))]
            .sort()
            .join("|"),
        ),
      );
      expect(shapes.size, `attack v${v} has distinct frames`).toBeGreaterThan(1);
    }
  });

  it("swings its two attacks differently", () => {
    const piston = mechGrid(id, "e", "attack", 1, { attackVariant: 0 });
    const cannon = mechGrid(id, "e", "attack", 1, { attackVariant: 1 });
    expect(piston).not.toEqual(cannon);
  });

  it("burns its capacitors in emissive colours while it winds up", () => {
    const idle = mechGrid(id, "e", "idle", 0).join("");
    const charging = mechGrid(id, "e", "charge", 1).join("");
    const emissive = (text: string): number =>
      [...text].filter((ch) => EMISSIVE_COLORS.includes(ch)).length;
    // The wind-up is *visibly* a wind-up: measurably more light on it.
    expect(emissive(charging)).toBeGreaterThan(emissive(idle));
  });

  it("collapses in distinct stages and leaves a wreck behind", () => {
    for (const kind of DEATH_REACTION_KINDS) {
      const stages = Array.from({ length: reactionFrameCount(kind) }, (_, f) =>
        mechGrid(id, "e", "react", f, { reaction: { kind, awayX: 1 } }),
      );
      expect(stages.length, kind).toBeGreaterThanOrEqual(4);
      const shapes = new Set(
        stages.map((g) => [...opaqueCells(g)].sort().join("|")),
      );
      expect(shapes.size, `${kind} stages differ`).toBe(stages.length);
      // Each stage sits lower than the last: the chassis is going down,
      // not shuffling. Measured as the mean row of what is painted, so
      // a stray spark cannot make a flatter wreck read as a taller one.
      const heights = stages.map((grid) => {
        const cells = [...opaqueCells(grid)].map((c) => Number(c.split(",")[1]));
        return cells.reduce((a, b) => a + b, 0) / cells.length;
      });
      for (let i = 1; i < heights.length; i++) {
        expect(heights[i]!, `${kind} stage ${i} is lower`).toBeGreaterThan(
          heights[i - 1]!,
        );
      }
      // And it really is folding, not just sliding: each stage paints
      // less of the frame than the one before.
      const sizes = stages.map((g) => opaqueCells(g).size);
      for (let i = 1; i < sizes.length; i++) {
        expect(sizes[i]!, `${kind} stage ${i} is flatter`).toBeLessThan(
          sizes[i - 1]!,
        );
      }
      // And the wreck is still a thing on the floor, not nothing.
      expect(opaqueCells(stages.at(-1)!).size).toBeGreaterThan(200);
    }
  });

  it("shudders away from the blow without leaving its block", () => {
    for (const awayX of AWAYS) {
      for (const kind of ["flinch", "shudder"] as const) {
        const hit = mechGrid(id, "e", "react", 0, { reaction: { kind, awayX } });
        expect(hit).not.toEqual(mechGrid(id, "e", "idle", 0));
        // The legs and the shadow hold: a blow staggers a chassis, it
        // does not shove it a tile.
        expect(hit.slice(MECH_FRAME.shadow.top)).toEqual(
          mechGrid(id, "e", "idle", 0).slice(MECH_FRAME.shadow.top),
        );
      }
    }
  });

  it("keys its bakes by the swing as well as the frame", () => {
    const art = mechArt(id);
    const piston = entityFrameKey(art, "e", "attack", 1, undefined, 0);
    const cannon = entityFrameKey(art, "e", "attack", 1, undefined, 1);
    expect(piston).not.toBe(cannon);
    // The variant is irrelevant to a set that has only one picture, so
    // it stays out of those keys and cannot fragment the cache.
    expect(entityFrameKey(art, "e", "idle", 0, undefined, 0)).toBe(
      entityFrameKey(art, "e", "idle", 0, undefined, 1),
    );
  });

  it("has a portrait plate rather than a composed face", () => {
    const portrait = MECH_ART[id].portrait;
    expect(gridErrors(portrait)).toEqual([]);
    expect(portrait).toHaveLength(48);
    expect(portrait[0]).toHaveLength(48);
  });
});

describe("registry", () => {
  it("names every authored chassis exactly once", () => {
    expect(new Set(MECH_ART_IDS).size).toBe(MECH_ART_IDS.length);
    expect(Object.keys(MECH_ART).sort()).toEqual([...MECH_ART_IDS].sort());
  });

  it("authors both views and every set", () => {
    for (const id of MECH_ART_IDS) {
      for (const view of MECH_VIEW_IDS) {
        for (const set of MECH_SET_IDS as readonly MechSetId[]) {
          expect(MECH_ART[id].frames[view][set].length, `${id} ${view} ${set}`)
            .toBeGreaterThan(0);
        }
      }
    }
  });
});
