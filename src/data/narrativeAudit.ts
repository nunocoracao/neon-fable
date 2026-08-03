import type { AuditCode } from "../narrative/audit/types";

/**
 * Waivers: the narrative audit's findings that a human has looked at and
 * decided to keep.
 *
 * The audit fails on errors and prints its warnings, which leaves
 * exactly one honest way to ship a finding: name it here and say why in
 * a sentence somebody would accept in review. A waiver is about the
 * story rather than about the checker, so it lives with the story data.
 *
 * Two rules for adding one:
 *
 *  - **Say what makes it deliberate**, not what it is. "Foreshadowing"
 *    is a reason; "known issue" is a shrug.
 *  - **Waive the narrowest thing that works.** A waiver names a code
 *    *and* the subjects it covers, so silencing one flag never silences
 *    a whole check. There is deliberately no way to waive a code
 *    outright, and a subject that stops matching anything is reported
 *    as a stale waiver — a fixed problem cannot leave a permanent hole
 *    behind it.
 */
export interface AuditWaiver {
  code: AuditCode;
  /** The ids, flag keys, or node ids this waiver covers. */
  subjects: readonly string[];
  /** Why these are deliberate. Written for a reviewer, not a log. */
  why: string;
}

export const AUDIT_WAIVERS: readonly AuditWaiver[] = [];

/** The waiver covering a finding, if one does. */
export function findWaiver(
  code: AuditCode,
  subject: string | undefined,
): AuditWaiver | undefined {
  if (subject == null) return undefined;
  return AUDIT_WAIVERS.find(
    (waiver) => waiver.code === code && waiver.subjects.includes(subject),
  );
}

/** Every (code, subject) pair the waiver list claims to cover. */
export function waivedPairs(): { code: AuditCode; subject: string }[] {
  return AUDIT_WAIVERS.flatMap((waiver) =>
    waiver.subjects.map((subject) => ({ code: waiver.code, subject })),
  );
}
