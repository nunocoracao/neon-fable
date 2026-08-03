/**
 * How a sweep fails.
 *
 * A sweep runs tens of thousands of assertions, so it does not assert
 * inside its loops: an `expect` per composed frame is both slow and, at
 * that volume, useless — the first failure aborts and says nothing
 * about how widespread the problem is. Instead every check appends a
 * line naming the exact combination, and the test asserts once at the
 * end against the report.
 *
 * The report is the repro. Each line carries the full case (every
 * appearance id, the gear, the pose), so a failure can be pasted
 * straight into a fixture and re-run.
 */

/** Default number of faults printed before the tail is summarized. */
export const FAULT_REPORT_LIMIT = 12;

/**
 * The failure message for a list of fault lines, or "" when clean —
 * so a test reads `expect(faultReport(faults)).toBe("")` and prints
 * real repro strings when it does not.
 */
export function faultReport(
  faults: readonly string[],
  limit = FAULT_REPORT_LIMIT,
): string {
  if (faults.length === 0) return "";
  const shown = faults.slice(0, limit);
  const rest = faults.length - shown.length;
  const tail = rest > 0 ? [`… and ${rest} more`] : [];
  return [`${faults.length} failing combination(s):`, ...shown, ...tail].join(
    "\n",
  );
}
