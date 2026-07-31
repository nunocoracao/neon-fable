import { describe, expect, it } from "vitest";
import {
  FOLLOW_GAP,
  FOLLOW_SPEED,
  FOLLOW_TRAIL_LIMIT,
  createFollowState,
  isFollowMoving,
  leaderEntered,
  stepFollow,
  type FollowState,
} from "./follow";
import type { TilePoint } from "./coords";

/**
 * Trail-behind following, driven the way the scene drives it: drop a
 * breadcrumb per tile the leader enters, step the follower by elapsed
 * time, read its position out. Pure — no canvas, no clock.
 */

/** One second of walking, in the small steps a frame takes. */
function walk(state: FollowState, seconds: number, steps = 60): FollowState {
  let next = state;
  for (let i = 0; i < steps; i++) next = stepFollow(next, seconds / steps);
  return next;
}

/** Leader walks a straight line east, one tile at a time, follower in tow. */
function leadEast(
  state: FollowState,
  from: TilePoint,
  tiles: number,
): FollowState {
  let next = state;
  for (let i = 1; i <= tiles; i++) {
    next = leaderEntered(next, { x: from.x + i, y: from.y });
    next = walk(next, 1 / FOLLOW_SPEED);
  }
  return next;
}

describe("createFollowState", () => {
  it("starts in formation on the tile it was given", () => {
    const state = createFollowState({ x: 4, y: 2 }, "n");
    expect(state.tile).toEqual({ x: 4, y: 2 });
    expect(state.position).toEqual({ x: 4, y: 2 });
    expect(state.facing).toBe("n");
    expect(state.trail).toEqual([]);
    expect(isFollowMoving(state)).toBe(false);
  });
});

describe("leaderEntered", () => {
  it("records a real step and ignores a repeat of the same tile", () => {
    const start = createFollowState({ x: 0, y: 0 });
    const once = leaderEntered(start, { x: 1, y: 0 });
    expect(once.trail).toEqual([{ x: 1, y: 0 }]);
    // The scene calls this every frame; standing still must cost nothing.
    expect(leaderEntered(once, { x: 1, y: 0 })).toBe(once);
  });

  it("ignores the tile the follower is already standing on", () => {
    const start = createFollowState({ x: 3, y: 3 });
    expect(leaderEntered(start, { x: 3, y: 3 })).toBe(start);
  });

  it("copies the tile rather than holding the caller's object", () => {
    const tile = { x: 2, y: 0 };
    const state = leaderEntered(createFollowState({ x: 0, y: 0 }), tile);
    tile.x = 99;
    expect(state.trail[0]).toEqual({ x: 2, y: 0 });
  });
});

describe("stepFollow", () => {
  it("holds station while the leader is within the gap", () => {
    let state = createFollowState({ x: 0, y: 0 });
    for (let i = 1; i <= FOLLOW_GAP; i++) {
      state = leaderEntered(state, { x: i, y: 0 });
    }
    const settled = walk(state, 2);
    expect(settled.tile).toEqual({ x: 0, y: 0 });
    expect(settled.position).toEqual({ x: 0, y: 0 });
    expect(isFollowMoving(settled)).toBe(false);
  });

  it("walks the leader's own ground, a gap behind, and stops there", () => {
    const state = leadEast(createFollowState({ x: 0, y: 0 }), { x: 0, y: 0 }, 6);
    // Leader is on (6,0); the follower settles FOLLOW_GAP tiles back.
    const settled = walk(state, 3);
    expect(settled.tile).toEqual({ x: 6 - FOLLOW_GAP, y: 0 });
    expect(settled.trail).toHaveLength(FOLLOW_GAP);
    expect(isFollowMoving(settled)).toBe(false);
  });

  it("never stands where the leader is standing", () => {
    let state = createFollowState({ x: 0, y: 0 });
    const leader = { x: 0, y: 0 };
    for (let i = 1; i <= 10; i++) {
      leader.x = i;
      state = leaderEntered(state, { ...leader });
      state = walk(state, 1 / FOLLOW_SPEED);
      expect(state.tile).not.toEqual(leader);
      expect(state.position).not.toEqual(leader);
    }
  });

  it("only ever steps onto ground the leader walked", () => {
    // The safety property the whole design rests on: no path-finding, so
    // a follower can never be routed into a wall or onto water.
    const walked: TilePoint[] = [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 2 },
    ];
    let state = createFollowState({ x: 0, y: 0 });
    const visited: TilePoint[] = [];
    for (const tile of walked) {
      state = leaderEntered(state, tile);
      state = walk(state, 1 / FOLLOW_SPEED);
      visited.push(state.tile);
    }
    state = walk(state, 3);
    visited.push(state.tile);
    for (const tile of visited) {
      const known =
        (tile.x === 0 && tile.y === 0) ||
        walked.some((w) => w.x === tile.x && w.y === tile.y);
      expect(known, `(${tile.x}, ${tile.y}) was walked by the leader`).toBe(
        true,
      );
    }
  });

  it("faces the way it is walking", () => {
    let state = createFollowState({ x: 0, y: 0 }, "n");
    for (let i = 1; i <= 4; i++) state = leaderEntered(state, { x: 0, y: i });
    const moving = stepFollow(state, 0.05);
    expect(moving.facing).toBe("s");
  });

  it("jogs to close a gap it has lost, and does not overshoot", () => {
    let state = createFollowState({ x: 0, y: 0 });
    for (let i = 1; i <= 8; i++) state = leaderEntered(state, { x: i, y: 0 });
    // Owing six tiles, one second of catch-up covers more than the
    // walking pace would — and it still stops in formation.
    const jogged = walk(state, 1);
    expect(jogged.tile.x).toBeGreaterThan(FOLLOW_SPEED);
    const settled = walk(jogged, 5);
    expect(settled.tile).toEqual({ x: 8 - FOLLOW_GAP, y: 0 });
  });

  it("cuts to the tail rather than retracing a run it slept through", () => {
    let state = createFollowState({ x: 0, y: 0 });
    const total = FOLLOW_TRAIL_LIMIT + 10;
    for (let i = 1; i <= total; i++) state = leaderEntered(state, { x: i, y: 0 });
    const cut = stepFollow(state, 0);
    expect(cut.trail).toHaveLength(FOLLOW_TRAIL_LIMIT);
    expect(cut.tile).toEqual({ x: total - FOLLOW_TRAIL_LIMIT + 1, y: 0 });
    // And it walks in from there like any other trail.
    expect(walk(cut, 10).tile).toEqual({ x: total - FOLLOW_GAP, y: 0 });
  });

  it("takes a configurable gap", () => {
    let state = createFollowState({ x: 0, y: 0 });
    for (let i = 1; i <= 6; i++) state = leaderEntered(state, { x: i, y: 0 });
    let next = state;
    for (let i = 0; i < 600; i++) next = stepFollow(next, 0.01, { gap: 1 });
    expect(next.tile).toEqual({ x: 5, y: 0 });
    expect(isFollowMoving(next, { gap: 1 })).toBe(false);
  });
});
