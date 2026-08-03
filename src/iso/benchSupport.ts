/**
 * Wall-clock budgets, and why they are off by default.
 *
 * Two files in this repo time themselves: `art/bakeBench.test.ts` and
 * `crowdBench.test.ts`. Both are worth having — they are the only place
 * a per-frame recompose or a per-pixel paint path would show up as a
 * number — and neither is a safe CI assertion, because what they
 * measure is partly how busy the machine was. The deploy workflow had
 * already grown an `--exclude` for one of them, which loses the file's
 * *deterministic* guards (draw counts, cache misses, eviction counts)
 * along with the timing.
 *
 * So the split is here instead of in the workflow: the deterministic
 * assertions always run, and the millisecond ones run when somebody
 * asks for them.
 *
 *     PERF_BENCH=1 npm test          # or: npm run bench
 *
 * That is the mode to use when changing the render loop or the bake
 * path, on a quiet machine, and to compare against the figures in
 * `.watchfire/memory.md` ("Frame budget and the hi-res render loop").
 * Off, the benches still do all their work — the timing is measured and
 * reported, it just is not allowed to fail the run.
 */

/** Whether this run was asked to hold wall-clock budgets. */
export const WALL_CLOCK_BUDGETS =
  typeof process !== "undefined" && process.env?.PERF_BENCH === "1";

/**
 * Whether a measurement busts its budget *and* this run is holding
 * budgets. Written to be asserted as `expect(overBudget(...)).toBe(false)`
 * with the measured figure in the assertion message, so the number is in
 * the report either way.
 */
export function overBudget(measuredMs: number, budgetMs: number): boolean {
  return WALL_CLOCK_BUDGETS && measuredMs >= budgetMs;
}

/** The figure and its budget, for an assertion message. */
export function budgetLine(
  measuredMs: number,
  budgetMs: number,
  unit: string,
): string {
  const held = WALL_CLOCK_BUDGETS ? "" : " (not held: set PERF_BENCH=1)";
  return `${measuredMs.toFixed(3)}ms ${unit}, budget ${budgetMs}ms${held}`;
}
