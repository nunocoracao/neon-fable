import { describe, expect, it } from "vitest";
import type { Facing } from "../../animation";
import {
  DEATH_REACTION_KINDS,
  HIT_REACTION_KINDS,
  REACTION_KINDS,
  reactionFrameCount,
  type ReactionKind,
} from "../../reaction";
import { composedCharacterGrid, type ComposedCharacter } from "../layers";
import { gridErrors, mirrored, type PixelGrid } from "../pixel";
import { BODY_BUILD_IDS, BODY_FRAME, type BodyBuildId } from "./body";
import { FALL_FRAMES, HIT_FRAMES, SPARK_REGION } from "./hit";

/**
 * The reaction sets: the recoils a body takes, the fall it ends on, and
 * the contract every frame of every one of them keeps. Painting is not
 * under test — what is: that the art is valid, that a hit never moves a
 * character off its tile, that a death ends up on the floor and stays
 * there, and that a chassis dies visibly differently from a body.
 */

const FACINGS: Facing[] = ["n", "e", "s", "w"];

/** Last body row; everything under it is the anchored ground shadow. */
const GROUND_ROW = 42;

function opaqueCells(grid: PixelGrid): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  grid.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c !== ".") cells.push([x, y]);
    });
  });
  return cells;
}

function countChar(grid: PixelGrid, ch: string): number {
  return grid.reduce((sum, row) => sum + [...row].filter((c) => c === ch).length, 0);
}

/**
 * Topmost row above the shadow band holding any of the figure. Sparks
 * (the amber pair) are thrown clear of the shell and are not part of
 * it, so they never count as the body still being up.
 */
function topBodyRow(grid: PixelGrid): number {
  for (let y = 0; y <= GROUND_ROW; y++) {
    if ([...(grid[y] ?? "")].some((ch) => ch !== "." && ch !== "m" && ch !== "n")) {
      return y;
    }
  }
  return GROUND_ROW;
}

/** A bare body of the given build, with a face so the head reads. */
function figure(build: BodyBuildId): ComposedCharacter {
  return {
    build,
    layers: [
      { slot: "body", art: build, remap: {} },
      { slot: "face", art: "standard", remap: {} },
    ],
  };
}

const REACTED = REACTION_KINDS.flatMap((kind) =>
  BODY_BUILD_IDS.flatMap((build) =>
    FACINGS.flatMap((facing) =>
      ([-1, 1] as const).flatMap((awayX) =>
        Array.from({ length: reactionFrameCount(kind) }, (_, frame) => ({
          kind,
          build,
          facing,
          awayX,
          frame,
          label: `${kind} ${build} ${facing} away${awayX} f${frame}`,
          grid: composedCharacterGrid(figure(build), facing, "react", frame, {
            kind,
            awayX,
          }),
        })),
      ),
    ),
  ),
);

/** The resting pose the same figure would be drawn in. */
function rest(build: BodyBuildId, facing: Facing): PixelGrid {
  return composedCharacterGrid(figure(build), facing, "idle", 0);
}

describe("authored reaction sets", () => {
  it("gives every reaction the frame count its timing declares", () => {
    for (const kind of HIT_REACTION_KINDS) {
      expect(HIT_FRAMES[kind].length, kind).toBe(reactionFrameCount(kind));
    }
    for (const kind of DEATH_REACTION_KINDS) {
      expect(FALL_FRAMES[kind].length, kind).toBe(reactionFrameCount(kind));
    }
  });

  it("throws for a frame a reaction never authored", () => {
    expect(() =>
      composedCharacterGrid(figure("lean"), "e", "react", 9, {
        kind: "flinch",
        awayX: 1,
      }),
    ).toThrow(/no flinch reaction frame 9/);
  });

  it("refuses to draw a reaction frame without saying which reaction", () => {
    expect(() =>
      composedCharacterGrid(figure("lean"), "e", "react", 0),
    ).toThrow(/needs a reaction variant/);
  });

  it("composes a valid 32×48 grid for every reaction, build, facing, and throw", () => {
    for (const { grid, label } of REACTED) {
      expect(gridErrors(grid), label).toEqual([]);
      expect(grid.length, `${label} height`).toBe(BODY_FRAME.height);
      expect(grid[0]?.length, `${label} width`).toBe(BODY_FRAME.width);
    }
  });

  it("keeps the anchored ground shadow identical on every frame", () => {
    for (const { build, facing, grid, label } of REACTED) {
      expect(grid.slice(BODY_FRAME.shadow.top), label).toEqual(
        rest(build, facing).slice(BODY_FRAME.shadow.top),
      );
    }
  });

  it("actually moves: every frame differs from the resting pose", () => {
    for (const { build, facing, grid, label } of REACTED) {
      expect(grid, `${label} differs from idle`).not.toEqual(rest(build, facing));
    }
  });

  it("mirrors as a screen direction, not a body-relative one", () => {
    // The recoil is applied after the facing mirror, so a body thrown
    // right is thrown right on every facing: mirroring a frame is the
    // same as flipping both the facing and the direction of the blow.
    for (const kind of REACTION_KINDS) {
      for (let frame = 0; frame < reactionFrameCount(kind); frame++) {
        const east = composedCharacterGrid(figure("lean"), "e", "react", frame, {
          kind,
          awayX: 1,
        });
        const south = composedCharacterGrid(figure("lean"), "s", "react", frame, {
          kind,
          awayX: -1,
        });
        expect(south, `${kind} f${frame}`).toEqual(mirrored(east));
      }
    }
  });
});

describe("hit reactions", () => {
  const HITS = REACTED.filter((r) => r.kind === "flinch" || r.kind === "shudder");

  it("throws the head further than the chest, and never the other way", () => {
    for (const kind of HIT_REACTION_KINDS) {
      for (const [frame, authored] of HIT_FRAMES[kind].entries()) {
        expect(
          Math.abs(authored.headDx),
          `${kind} f${frame} head leads`,
        ).toBeGreaterThanOrEqual(Math.abs(authored.torsoDx));
      }
      // The first frame is the snap; something has to move on it.
      expect(HIT_FRAMES[kind][0]?.headDx, `${kind} snaps`).not.toBe(0);
    }
  });

  it("recoils away from the attacker, on both sides", () => {
    // The head band's leftmost pixel moves the way the blow threw it.
    const headEdge = (grid: PixelGrid): number => {
      let left: number = BODY_FRAME.width;
      for (let y = BODY_FRAME.head.top; y <= BODY_FRAME.head.bottom; y++) {
        const x = [...(grid[y] ?? "")].findIndex((ch) => ch !== ".");
        if (x >= 0) left = Math.min(left, x);
      }
      return left;
    };
    const standing = headEdge(rest("lean", "e"));
    for (const kind of HIT_REACTION_KINDS) {
      const right = composedCharacterGrid(figure("lean"), "e", "react", 0, {
        kind,
        awayX: 1,
      });
      const left = composedCharacterGrid(figure("lean"), "e", "react", 0, {
        kind,
        awayX: -1,
      });
      expect(headEdge(right), `${kind} thrown right`).toBeGreaterThan(standing);
      expect(headEdge(left), `${kind} thrown left`).toBeLessThan(standing);
    }
  });

  it("takes an armored blow the same way, half as far", () => {
    const travel = (kind: ReactionKind): number =>
      Math.max(
        ...HIT_FRAMES[kind as "flinch" | "shudder"].map((f) =>
          Math.abs(f.headDx),
        ),
      );
    expect(travel("shudder")).toBeLessThan(travel("flinch"));
  });

  it("staggers the body without moving it off its tile", () => {
    // Legs, boots, and the shadow are untouched: a hit never walks a
    // character to another tile.
    for (const { build, facing, grid, label } of HITS) {
      const standing = rest(build, facing);
      for (let y = 31; y < BODY_FRAME.height; y++) {
        expect(grid[y], `${label} row ${y}`).toBe(standing[y]);
      }
    }
  });
});

describe("deaths", () => {
  const DEATHS = REACTED.filter(
    (r) => r.kind === "collapse" || r.kind === "sparkout",
  );

  it("folds the figure down over the fall, ending on the floor", () => {
    for (const kind of DEATH_REACTION_KINDS) {
      for (const build of BODY_BUILD_IDS) {
        const tops = Array.from({ length: reactionFrameCount(kind) }, (_, f) =>
          topBodyRow(
            composedCharacterGrid(figure(build), "e", "react", f, {
              kind,
              awayX: 1,
            }),
          ),
        );
        const standing = topBodyRow(rest(build, "e"));
        // Every frame is lower than the last, and the heap ends in the
        // bottom quarter of the frame.
        expect(tops[0], `${kind} ${build} starts falling`).toBeGreaterThan(
          standing,
        );
        for (let f = 1; f < tops.length; f++) {
          expect(tops[f], `${kind} ${build} f${f}`).toBeGreaterThanOrEqual(
            tops[f - 1] as number,
          );
        }
        expect(
          tops[tops.length - 1],
          `${kind} ${build} heap height`,
        ).toBeGreaterThan(GROUND_ROW - 12);
      }
    }
  });

  it("goes over the way the blow threw it", () => {
    for (const kind of DEATH_REACTION_KINDS) {
      const heap = reactionFrameCount(kind) - 1;
      const right = composedCharacterGrid(figure("lean"), "e", "react", heap, {
        kind,
        awayX: 1,
      });
      const left = composedCharacterGrid(figure("lean"), "e", "react", heap, {
        kind,
        awayX: -1,
      });
      const center = (grid: PixelGrid): number => {
        const cells = opaqueCells(grid).filter(([, y]) => y <= GROUND_ROW);
        return cells.reduce((sum, [x]) => sum + x, 0) / cells.length;
      };
      expect(center(right), `${kind} falls right`).toBeGreaterThan(center(left));
    }
  });

  it("keeps every death frame inside the frame it was drawn in", () => {
    for (const { grid, label } of DEATHS) {
      for (const [x, y] of opaqueCells(grid)) {
        expect(x, `${label} col`).toBeGreaterThanOrEqual(0);
        expect(x, `${label} col`).toBeLessThan(BODY_FRAME.width);
        expect(y, `${label} row`).toBeGreaterThanOrEqual(0);
        expect(y, `${label} row`).toBeLessThan(BODY_FRAME.height);
      }
    }
  });

  it("sparks a chassis out and never a body", () => {
    const sparks = (grid: PixelGrid): number =>
      countChar(grid, "m") + countChar(grid, "n");
    for (const build of BODY_BUILD_IDS) {
      const thrown = Array.from({ length: reactionFrameCount("sparkout") }, (_, f) =>
        sparks(
          composedCharacterGrid(figure(build), "e", "react", f, {
            kind: "sparkout",
            awayX: 1,
          }),
        ),
      );
      // Charge is thrown while it falls and gone once it is dark.
      expect(thrown.slice(0, -1).every((n) => n > 0), `${build} sparks`).toBe(
        true,
      );
      expect(thrown[thrown.length - 1], `${build} goes dark`).toBe(0);
      for (let f = 0; f < reactionFrameCount("collapse"); f++) {
        expect(
          sparks(
            composedCharacterGrid(figure(build), "e", "react", f, {
              kind: "collapse",
              awayX: 1,
            }),
          ),
          `${build} body f${f}`,
        ).toBe(0);
      }
    }
  });

  it("keeps every spark inside the spark region, clear of the shadow", () => {
    for (const { kind, grid, label } of DEATHS) {
      if (kind !== "sparkout") continue;
      grid.forEach((row, y) => {
        [...row].forEach((ch, x) => {
          if (ch !== "m" && ch !== "n") return;
          expect(y, `${label} spark row`).toBeGreaterThanOrEqual(
            SPARK_REGION.top,
          );
          expect(y, `${label} spark row`).toBeLessThanOrEqual(
            SPARK_REGION.bottom,
          );
          expect(x, `${label} spark col`).toBeGreaterThanOrEqual(
            SPARK_REGION.left,
          );
          expect(x, `${label} spark col`).toBeLessThanOrEqual(
            SPARK_REGION.right,
          );
        });
      });
      expect(SPARK_REGION.bottom, "clear of the shadow").toBeLessThan(
        BODY_FRAME.shadow.top,
      );
    }
  });

  it("leaves a body and a chassis lying differently", () => {
    for (const build of BODY_BUILD_IDS) {
      const crumpled = composedCharacterGrid(
        figure(build),
        "e",
        "react",
        reactionFrameCount("collapse") - 1,
        { kind: "collapse", awayX: 1 },
      );
      const sparked = composedCharacterGrid(
        figure(build),
        "e",
        "react",
        reactionFrameCount("sparkout") - 1,
        { kind: "sparkout", awayX: 1 },
      );
      expect(sparked, `${build} heaps differ`).not.toEqual(crumpled);
    }
  });

  it("replays a death identically — same frame, same sparks", () => {
    const once = composedCharacterGrid(figure("lean"), "e", "react", 1, {
      kind: "sparkout",
      awayX: 1,
    });
    const again = composedCharacterGrid(figure("lean"), "e", "react", 1, {
      kind: "sparkout",
      awayX: 1,
    });
    expect(again).toEqual(once);
  });
});
