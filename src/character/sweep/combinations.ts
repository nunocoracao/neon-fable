/**
 * Combination coverage: how a sweep gets near-total confidence out of a
 * budget that cannot afford the raw product.
 *
 * The layered character system has ten appearance categories plus gear,
 * cyberware, and dye axes. Their full cross product is in the hundreds
 * of millions of descriptors before a single facing or animation frame
 * is drawn, so an exhaustive sweep is not a test, it is a build farm.
 *
 * What actually catches art bugs is smaller and provable:
 *
 * - **Every option at least once.** One case per catalog entry, every
 *   other axis held at its default (`perOptionCases`). A grid that is
 *   simply mis-authored — wrong width, off-palette character, pixels
 *   outside its region — fails here no matter what it is worn with.
 * - **Every *pair* of options at least once.** Interaction bugs are
 *   overwhelmingly two-way: this hat over that hair, that weapon on
 *   this build. `pairwiseCases` covers every value pair of every
 *   dimension pair in a few dozen cases rather than millions
 *   (all-pairs / orthogonal-array testing).
 *
 * Both generators are pure and seeded (the project RNG, never
 * Math.random), so a failure reproduces exactly and the case list is
 * identical on every machine and every run.
 */
import { createRng, nextInt, type RngState } from "../../state/rng";

/** One axis of a sweep: a named dimension with its possible values. */
export interface SweepDimension<T> {
  readonly name: string;
  readonly values: readonly T[];
}

/** A generated case: one value index per dimension, in dimension order. */
export type IndexCase = readonly number[];

function sizesOf(dimensions: readonly SweepDimension<unknown>[]): number[] {
  return dimensions.map((dimension) => {
    if (dimension.values.length === 0) {
      throw new Error(`sweep dimension "${dimension.name}" has no values`);
    }
    return dimension.values.length;
  });
}

/** Total cases an exhaustive sweep would need — what we are not running. */
export function exhaustiveCaseCount(
  dimensions: readonly SweepDimension<unknown>[],
): number {
  return sizesOf(dimensions).reduce((total, size) => total * size, 1);
}

const pairKey = (i: number, vi: number, j: number, vj: number): string =>
  `${i}:${vi}|${j}:${vj}`;

/** Every (dimension, value) × (later dimension, value) pair, as keys. */
function allPairs(sizes: readonly number[]): Set<string> {
  const pairs = new Set<string>();
  for (let i = 0; i < sizes.length; i++) {
    for (let j = i + 1; j < sizes.length; j++) {
      for (let vi = 0; vi < (sizes[i] ?? 0); vi++) {
        for (let vj = 0; vj < (sizes[j] ?? 0); vj++) {
          pairs.add(pairKey(i, vi, j, vj));
        }
      }
    }
  }
  return pairs;
}

/**
 * All-pairs coverage: the smallest case list this greedy builder can
 * find such that every pair of values from every pair of dimensions
 * appears together in at least one case.
 *
 * Greedy per case, dimension by dimension: pick the value covering the
 * most still-uncovered pairs against the dimensions already fixed in
 * this case, breaking ties with the seeded RNG so the result is varied
 * but reproducible. Not minimal (that is NP-hard), but within a small
 * factor of it and — the property that matters — complete: the returned
 * list provably covers every pair, which `pairwiseCases` asserts by
 * construction and a test re-checks independently.
 */
export function pairwiseIndexCases(
  sizes: readonly number[],
  seed = 1,
): IndexCase[] {
  if (sizes.length === 0) return [];
  if (sizes.length === 1) {
    return Array.from({ length: sizes[0] ?? 0 }, (_, v) => [v]);
  }
  const uncovered = allPairs(sizes);
  const cases: IndexCase[] = [];
  let rng: RngState = createRng(seed);
  // Bounded well above any real dimension set: the loop exits when the
  // pair set empties, and this only stops a pathological input from
  // spinning forever.
  const limit = uncovered.size + sizes.length;
  while (uncovered.size > 0 && cases.length < limit) {
    const chosen: number[] = [];
    for (let d = 0; d < sizes.length; d++) {
      let best: number[] = [];
      let bestGain = -1;
      for (let v = 0; v < (sizes[d] ?? 0); v++) {
        let gain = 0;
        for (let prev = 0; prev < d; prev++) {
          if (uncovered.has(pairKey(prev, chosen[prev] ?? 0, d, v))) gain++;
        }
        if (gain > bestGain) {
          bestGain = gain;
          best = [v];
        } else if (gain === bestGain) {
          best.push(v);
        }
      }
      const roll = nextInt(rng, 0, best.length - 1);
      rng = roll.state;
      chosen.push(best[roll.value] ?? 0);
    }
    for (let i = 0; i < sizes.length; i++) {
      for (let j = i + 1; j < sizes.length; j++) {
        uncovered.delete(pairKey(i, chosen[i] ?? 0, j, chosen[j] ?? 0));
      }
    }
    cases.push(chosen);
  }
  if (uncovered.size > 0) {
    throw new Error(
      `pairwise generation gave up with ${uncovered.size} pairs uncovered`,
    );
  }
  return cases;
}

/**
 * One case per individual value, every other dimension held at its
 * default index — the "each option against the stock look" half of the
 * strategy. The all-defaults case appears exactly once.
 */
export function perOptionIndexCases(
  sizes: readonly number[],
  defaults: readonly number[],
): IndexCase[] {
  if (defaults.length !== sizes.length) {
    throw new Error(
      `defaults length ${defaults.length} does not match ${sizes.length} dimensions`,
    );
  }
  const seen = new Set<string>();
  const cases: IndexCase[] = [];
  const push = (row: number[]): void => {
    const key = row.join(",");
    if (seen.has(key)) return;
    seen.add(key);
    cases.push(row);
  };
  push([...defaults]);
  for (let d = 0; d < sizes.length; d++) {
    for (let v = 0; v < (sizes[d] ?? 0); v++) {
      const row = [...defaults];
      row[d] = v;
      push(row);
    }
  }
  return cases;
}

/** Materialize an index case into its dimension values. */
export function valuesOf<T>(
  dimensions: readonly SweepDimension<T>[],
  indices: IndexCase,
): T[] {
  return dimensions.map((dimension, d) => {
    const value = dimension.values[indices[d] ?? 0];
    if (value === undefined) {
      throw new Error(`no value ${indices[d]} in dimension "${dimension.name}"`);
    }
    return value;
  });
}

/**
 * The documented strategy, as one list: every option against the
 * defaults, then all-pairs coverage on top, deduplicated. Order is
 * stable — per-option cases first, so a failure in the simplest
 * possible look is reported before any exotic combination.
 */
export function coverageIndexCases(
  sizes: readonly number[],
  defaults: readonly number[],
  seed = 1,
): IndexCase[] {
  const seen = new Set<string>();
  const cases: IndexCase[] = [];
  for (const row of [
    ...perOptionIndexCases(sizes, defaults),
    ...pairwiseIndexCases(sizes, seed),
  ]) {
    const key = row.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    cases.push(row);
  }
  return cases;
}

/** Every pair a case list leaves uncovered; empty means all-pairs complete. */
export function uncoveredPairs(
  sizes: readonly number[],
  cases: readonly IndexCase[],
): string[] {
  const uncovered = allPairs(sizes);
  for (const row of cases) {
    for (let i = 0; i < sizes.length; i++) {
      for (let j = i + 1; j < sizes.length; j++) {
        uncovered.delete(pairKey(i, row[i] ?? 0, j, row[j] ?? 0));
      }
    }
  }
  return [...uncovered];
}
