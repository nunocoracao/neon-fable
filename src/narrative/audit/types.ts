/**
 * What a narrative audit reports, and the vocabulary it reports it in.
 *
 * The audit is one pass over every piece of authored narrative content —
 * story arcs, barks, lore shards, interludes, epilogues, world
 * conditions, stealth zones — asking the questions a playthrough would
 * eventually ask on the player's behalf: does this id exist, can this
 * door ever open, does anybody ever read what this beat wrote down.
 *
 * Two severities, and the difference between them is whether a human
 * has to decide. An **error** is a fact: a target that does not exist,
 * a gate nothing can satisfy. Nobody has to weigh it, so errors fail
 * the test run. A **warning** is a judgement: a flag nothing reads is
 * usually a loose end and is sometimes deliberate foreshadowing, so
 * warnings are reported and waived by name in src/data/narrativeAudit.ts
 * rather than silently tolerated.
 */

export type AuditSeverity = "error" | "warning";

export type AuditCode =
  // --- Structure: the graph itself ---------------------------------
  /** An issue validateArc found; its own code rides in `detail`. */
  | "arc-issue"
  /** A node nobody can leave: no choices at all. */
  | "no-exit-node"
  /** No end, travel, or other terminator is reachable from this node. */
  | "soft-lock"
  /** Every choice on the node is gated: prove the gates are exhaustive. */
  | "all-gated-node"
  // --- Structure: ids referenced outside the story graph ------------
  | "unknown-item"
  | "unknown-companion"
  | "unknown-injury"
  | "unknown-faction"
  | "unknown-band"
  | "unknown-map"
  | "unknown-zone"
  // --- Satisfiability: can the door ever open? ----------------------
  /** A positive flag gate on a key nothing in the game ever writes. */
  | "unwritten-flag"
  /** flag-equals on a value no writer of that key ever writes. */
  | "unwritten-flag-value"
  /** flag-at-least past the highest figure any writer can reach. */
  | "unreachable-flag-value"
  /** A stat gate above the best a character could ever present. */
  | "unreachable-stat"
  /** A gate on an item no path in the game hands out or sells. */
  | "ungrantable-item"
  /** A gate on somebody no beat ever recruits. */
  | "unrecruitable-companion"
  /** A background gate on a tag no background and no outfit carries. */
  | "unknown-background-tag"
  /** A standing gate above the best the standing table can add up to. */
  | "unreachable-standing"
  /** A negative flag gate nothing can ever close: always open. */
  | "vacuous-gate"
  // --- Consequence: is anything listening? --------------------------
  /** A flag written by content that nothing anywhere reads. */
  | "unread-flag"
  // --- Random walk --------------------------------------------------
  /** The engine threw while a walk was taking a legal choice. */
  | "walk-throw"
  /** A walk produced a state the game's own validator rejects. */
  | "walk-invalid-state"
  /** No walk in the budget ever stood on this node. */
  | "unvisited-node"
  // --- The waiver list itself ---------------------------------------
  /** A waiver in src/data/narrativeAudit.ts no longer covers anything. */
  | "stale-waiver";

export interface AuditFinding {
  code: AuditCode;
  severity: AuditSeverity;
  /** The content this came out of: "arc:act1", "bark:bark-quays-tide". */
  source: string;
  /** Where inside it: "node-id", "node-id/choice-id", "strand/variant". */
  where?: string;
  /** The id, key, or figure the finding is about — what a waiver names. */
  subject?: string;
  detail: string;
}

/** One audit pass, split by severity and kept in reporting order. */
export interface NarrativeAudit {
  errors: AuditFinding[];
  /** Warnings that survived the waiver list in src/data/narrativeAudit.ts. */
  warnings: AuditFinding[];
  /** Findings a waiver silenced, kept so the verbose report can show them. */
  waived: AuditFinding[];
  /**
   * Walk coverage: one warning per node no walk reached. Kept apart
   * from `warnings` because it is a measure of the walk budget rather
   * than a defect in the content — a node behind three chapters of
   * flags is not a bug, it is a node the budget did not buy. The report
   * prints them; the test run asserts a floor on the fraction covered.
   */
  coverage: AuditFinding[];
  /** Coverage and corpus figures, for the verbose report. */
  stats: AuditStats;
}

export interface AuditStats {
  arcs: number;
  nodes: number;
  choices: number;
  /** Gated things checked across every content kind, story and not. */
  gates: number;
  flagKeys: number;
  walks: number;
  walkSteps: number;
  /** Story nodes at least one walk stood on. */
  visitedNodes: number;
}

export function error(
  code: AuditCode,
  source: string,
  detail: string,
  extra: Partial<AuditFinding> = {},
): AuditFinding {
  return { code, severity: "error", source, detail, ...extra };
}

export function warning(
  code: AuditCode,
  source: string,
  detail: string,
  extra: Partial<AuditFinding> = {},
): AuditFinding {
  return { code, severity: "warning", source, detail, ...extra };
}
