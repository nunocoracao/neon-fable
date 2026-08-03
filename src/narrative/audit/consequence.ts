import type { FlagReadSite, FlagWriteSite, GateSource } from "./content";
import { flagReads } from "./refs";
import { warning, type AuditFinding } from "./types";

/**
 * Consequence: is anybody listening?
 *
 * A choice that writes a flag is making a promise — that what just
 * happened will matter later. A flag nothing reads is that promise
 * quietly broken: the branch exists, the player took it, and the game
 * has no way of ever behaving differently for it.
 *
 * These are warnings and not errors on purpose, because a flag written
 * ahead of its reader is a real authoring move: an act lays down what
 * the next one will pick up, and content is written in that order more
 * often than not. So the check reports every one of them and the waiver
 * list in src/data/narrativeAudit.ts is where a deliberate one gets its
 * reason written down — which is the actual value of the check. Not the
 * error, the sentence somebody has to write to keep it.
 */

/** Every flag key anything in the game reads. */
export function readerKeys(
  sources: readonly GateSource[],
  engineReads: readonly FlagReadSite[],
): Set<string> {
  const keys = new Set<string>();
  for (const source of sources) {
    for (const read of flagReads(source.requirements)) keys.add(read.key);
  }
  for (const read of engineReads) keys.add(read.key);
  return keys;
}

/**
 * Flags the story writes that nothing reads. Reported once per key, at
 * the first beat that writes it, with the rest of the writers counted —
 * a flag written by nine choices and read by nobody is one loose end,
 * not nine.
 */
export function auditConsequences(
  writes: readonly FlagWriteSite[],
  sources: readonly GateSource[],
  engineReads: readonly FlagReadSite[],
): AuditFinding[] {
  const readers = readerKeys(sources, engineReads);
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  for (const write of writes) {
    counts.set(write.key, (counts.get(write.key) ?? 0) + 1);
  }

  const findings: AuditFinding[] = [];
  for (const write of writes) {
    if (readers.has(write.key) || seen.has(write.key)) continue;
    seen.add(write.key);
    const count = counts.get(write.key) ?? 1;
    findings.push(
      warning(
        "unread-flag",
        write.source,
        `Writes flag "${write.key}"${count > 1 ? ` (${count} beats do)` : ""}, ` +
          "and nothing anywhere reads it",
        {
          ...(write.where != null ? { where: write.where } : {}),
          subject: write.key,
        },
      ),
    );
  }
  return findings;
}
