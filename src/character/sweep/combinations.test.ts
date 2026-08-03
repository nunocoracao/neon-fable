import { describe, expect, it } from "vitest";
import {
  coverageIndexCases,
  exhaustiveCaseCount,
  pairwiseIndexCases,
  perOptionIndexCases,
  uncoveredPairs,
  valuesOf,
  type SweepDimension,
} from "./combinations";
import { faultReport } from "./report";

const sizes = (dimensions: readonly SweepDimension<unknown>[]): number[] =>
  dimensions.map((dimension) => dimension.values.length);

describe("pairwiseIndexCases", () => {
  it("covers every pair of values from every pair of dimensions", () => {
    for (const shape of [
      [2, 2],
      [2, 3, 4],
      [4, 2, 9, 6, 4, 6, 3, 4, 6, 5],
      [8, 10, 16, 9, 2],
    ]) {
      const cases = pairwiseIndexCases(shape);
      expect(faultReport(uncoveredPairs(shape, cases))).toBe("");
    }
  });

  it("costs far less than the exhaustive product it stands in for", () => {
    const shape = [4, 2, 9, 6, 4, 6, 3, 4, 6, 5, 8, 10, 16, 9];
    const cases = pairwiseIndexCases(shape);
    const exhaustive = shape.reduce((total, size) => total * size, 1);
    expect(cases.length).toBeLessThan(exhaustive / 1000);
    // Never below the theoretical floor: the largest pair of dimensions
    // alone needs this many cases.
    expect(cases.length).toBeGreaterThanOrEqual(16 * 10);
  });

  it("is deterministic for a seed, and varies across seeds", () => {
    const shape = [3, 4, 5, 2];
    expect(pairwiseIndexCases(shape, 7)).toEqual(pairwiseIndexCases(shape, 7));
    expect(pairwiseIndexCases(shape, 7)).not.toEqual(
      pairwiseIndexCases(shape, 8),
    );
    // Every seed still covers everything — the seed picks which cases,
    // never how complete they are.
    for (const seed of [1, 2, 3, 9, 42]) {
      expect(uncoveredPairs(shape, pairwiseIndexCases(shape, seed))).toEqual([]);
    }
  });

  it("degenerates gracefully on trivial shapes", () => {
    expect(pairwiseIndexCases([])).toEqual([]);
    expect(pairwiseIndexCases([3])).toEqual([[0], [1], [2]]);
  });
});

describe("perOptionIndexCases", () => {
  it("visits every value of every dimension against the defaults", () => {
    const shape = [3, 4, 2];
    const defaults = [0, 0, 0];
    const cases = perOptionIndexCases(shape, defaults);
    for (let d = 0; d < shape.length; d++) {
      for (let v = 0; v < (shape[d] ?? 0); v++) {
        const found = cases.some(
          (row) =>
            row[d] === v &&
            row.every((value, i) => i === d || value === defaults[i]),
        );
        expect(found, `dimension ${d} value ${v}`).toBe(true);
      }
    }
  });

  it("changes exactly one dimension at a time, and lists the default once", () => {
    const defaults = [1, 2, 0];
    const cases = perOptionIndexCases([3, 4, 2], defaults);
    const varied = cases.map(
      (row) => row.filter((value, i) => value !== defaults[i]).length,
    );
    expect(varied.filter((count) => count === 0)).toHaveLength(1);
    expect(Math.max(...varied)).toBe(1);
    // (3 - 1) + (4 - 1) + (2 - 1) variations, plus the default itself.
    expect(cases).toHaveLength(1 + 2 + 3 + 1);
  });

  it("rejects a default row that does not match the shape", () => {
    expect(() => perOptionIndexCases([2, 2], [0])).toThrow(/does not match/);
  });
});

describe("coverageIndexCases", () => {
  it("is the union of both strategies, deduplicated and per-option first", () => {
    const shape = [3, 4, 2];
    const defaults = [0, 0, 0];
    const perOption = perOptionIndexCases(shape, defaults);
    const cases = coverageIndexCases(shape, defaults);
    expect(cases.slice(0, perOption.length)).toEqual(perOption);
    expect(uncoveredPairs(shape, cases)).toEqual([]);
    expect(new Set(cases.map((row) => row.join(","))).size).toBe(cases.length);
  });
});

describe("dimension plumbing", () => {
  it("materializes index cases into values", () => {
    const dimensions: SweepDimension<string>[] = [
      { name: "a", values: ["a0", "a1"] },
      { name: "b", values: ["b0", "b1", "b2"] },
    ];
    expect(valuesOf(dimensions, [1, 2])).toEqual(["a1", "b2"]);
    expect(exhaustiveCaseCount(dimensions)).toBe(6);
    expect(sizes(dimensions)).toEqual([2, 3]);
  });

  it("rejects an empty dimension rather than silently skipping it", () => {
    expect(() => exhaustiveCaseCount([{ name: "empty", values: [] }])).toThrow(
      /has no values/,
    );
  });
});
