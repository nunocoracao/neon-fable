/**
 * The flash budget.
 *
 * WCAG 2.3.1 draws one hard line: nothing may flash more than three
 * times in any one-second period. It is the only guideline in the set
 * whose failure mode is a seizure, so it is not a matter of taste and
 * it is not something to eyeball on a screen — it is arithmetic over a
 * signal that is already deterministic here, and it is measured.
 *
 * A *flash* is a pair of opposing changes in relative luminance: a neon
 * sign dropping out and coming back is one flash, not two. So what is
 * counted is the transitions in one direction — lit going dark — and
 * the worst one-second window of them across the whole cycle.
 *
 * This file is pure counting. What it is counted over lives beside the
 * effects themselves (the neon dropout in ./animation.ts, the Static
 * portrait tear in ./status.ts), and ./flash.test.ts holds both of them
 * to the budget.
 */

/** WCAG 2.3.1: no more than three flashes in any one-second period. */
export const MAX_FLASHES_PER_SECOND = 3;

/**
 * The minimum gap between the starts of two flashes that keeps a signal
 * inside the budget. Three flashes in a second is allowed, four is not,
 * so flashes may begin no oftener than every second-third — with a hair
 * of margin so a boundary case does not land exactly on the line.
 */
export const MIN_FLASH_GAP_MS = 340;

/**
 * The most flashes any one-second window of a periodic signal contains.
 *
 * `lit(timeMs)` answers whether the thing is on at that instant, and is
 * assumed to repeat every `periodMs`. Sampled at `stepMs`, which must
 * divide finely enough to catch the shortest dropout — the caller knows
 * its own timing and passes it.
 */
export function flashesPerSecond(
  lit: (timeMs: number) => boolean,
  periodMs: number,
  stepMs = 10,
): number {
  if (periodMs <= 0 || stepMs <= 0) return 0;
  // Two whole periods, so a window straddling the loop point is
  // measured as it is really seen rather than as the cycle's edge.
  const span = periodMs * 2;
  const starts: number[] = [];
  let previous = lit(0);
  for (let t = stepMs; t <= span; t += stepMs) {
    const now = lit(t % periodMs);
    if (previous && !now) starts.push(t);
    previous = now;
  }
  let worst = 0;
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i] ?? 0;
    // A window that runs off the end of the sampled span would
    // undercount, so only fully-covered windows are scored — the
    // second period guarantees at least one.
    if (from + 1000 > span) break;
    let count = 0;
    for (let j = i; j < starts.length && (starts[j] ?? 0) < from + 1000; j++) {
      count++;
    }
    if (count > worst) worst = count;
  }
  return worst;
}
