import { describe, expect, it } from "vitest";
import { inBounds, isOccupied, manhattan, moveSpeed } from "./grid";
import { makeCombatant } from "./testSupport";

describe("manhattan", () => {
  it("sums the axis distances with no diagonals", () => {
    expect(manhattan({ x: 0, y: 0 }, { x: 3, y: 2 })).toBe(5);
    expect(manhattan({ x: 2, y: 2 }, { x: 2, y: 2 })).toBe(0);
    expect(manhattan({ x: 5, y: 1 }, { x: 1, y: 4 })).toBe(7);
  });
});

describe("inBounds", () => {
  const grid = { width: 4, height: 3 };

  it("accepts tiles inside the grid and rejects those outside", () => {
    expect(inBounds(grid, { x: 0, y: 0 })).toBe(true);
    expect(inBounds(grid, { x: 3, y: 2 })).toBe(true);
    expect(inBounds(grid, { x: 4, y: 0 })).toBe(false);
    expect(inBounds(grid, { x: 0, y: 3 })).toBe(false);
    expect(inBounds(grid, { x: -1, y: 1 })).toBe(false);
  });

  it("rejects non-integer coordinates", () => {
    expect(inBounds(grid, { x: 1.5, y: 1 })).toBe(false);
  });
});

describe("isOccupied", () => {
  const combatants = [
    makeCombatant({ id: "a", position: { x: 1, y: 1 } }),
    makeCombatant({ id: "dead", position: { x: 2, y: 2 }, hp: 0 }),
  ];

  it("counts living combatants only", () => {
    expect(isOccupied(combatants, { x: 1, y: 1 })).toBe(true);
    expect(isOccupied(combatants, { x: 2, y: 2 })).toBe(false);
    expect(isOccupied(combatants, { x: 0, y: 0 })).toBe(false);
  });

  it("ignores the combatant passed as ignoreId", () => {
    expect(isOccupied(combatants, { x: 1, y: 1 }, "a")).toBe(false);
  });
});

describe("moveSpeed", () => {
  it("derives grid steps per turn from Reflexes", () => {
    expect(moveSpeed(3)).toBe(2);
    expect(moveSpeed(4)).toBe(3);
    expect(moveSpeed(8)).toBe(4);
    expect(moveSpeed(9)).toBe(4);
  });
});
