import { findWaiver, waivedPairs } from "../../data/narrativeAudit";
import { storyArcs } from "../../data/story";
import type { StoryArc } from "../types";
import { auditConsequences } from "./consequence";
import {
  contentFlagWrites,
  engineFlagReads,
  engineFlagWrites,
  gateSources,
} from "./content";
import { auditGateSatisfiability, defaultGateWorld } from "./gates";
import {
  auditGateRefs,
  auditGraph,
  auditPlacements,
  auditWorldEntries,
  worldEntries,
} from "./structure";
import { runWalks, unvisitedFindings } from "./walk";
import { error, type AuditFinding, type NarrativeAudit } from "./types";

/**
 * The narrative audit: one pass, every check, one report.
 *
 * Four questions, in the order a problem gets expensive:
 *
 *  1. **Structure** — does everything the content points at exist, and
 *     can a run always get back out again (./structure.ts).
 *  2. **Satisfiability** — can every authored door actually open
 *     (./gates.ts).
 *  3. **Consequence** — does anything read what a beat wrote down
 *     (./consequence.ts).
 *  4. **The walk** — does the real engine survive playing it badly
 *     (./walk.ts).
 *
 * Everything here is pure over the content it is handed, which is what
 * makes the whole suite fixture-testable: audit.test.ts runs it over the
 * shipped story, and the fixture tests run the same functions over a
 * deliberately-broken mini-graph.
 *
 * Cost is the reason the walk budget is a number rather than "until it
 * stops finding things": the audit runs in the ordinary test run, so it
 * has to stay in the ordinary test run's budget. See AUDIT_WALKS.
 */

/** Walks the standard audit runs; enough to reach most of the graph. */
export const AUDIT_WALKS = 2000;
/** Choices one walk may take before it is cut off. */
export const AUDIT_WALK_STEPS = 60;
/** The seed the standard audit starts from; a failure is reproducible. */
export const AUDIT_SEED = 0x5eed;

export interface AuditOptions {
  arcs?: readonly StoryArc[];
  walks?: number;
  steps?: number;
  seed?: number;
}

export function auditNarrative(options: AuditOptions = {}): NarrativeAudit {
  const arcs = options.arcs ?? storyArcs;
  const sources = gateSources();
  const writes = contentFlagWrites();
  const engineWrites = engineFlagWrites();
  const engineReads = engineFlagReads();

  const raw: AuditFinding[] = [
    ...auditGraph(arcs),
    ...auditWorldEntries(arcs, worldEntries(arcs)),
    ...auditGateRefs(sources),
    ...auditPlacements(),
    ...auditGateSatisfiability(sources, defaultGateWorld()),
    ...auditConsequences(writes, sources, engineReads),
  ];

  const walk = runWalks({
    arcs,
    entries: worldEntries(arcs),
    writes: [...writes, ...engineWrites],
    walks: options.walks ?? AUDIT_WALKS,
    steps: options.steps ?? AUDIT_WALK_STEPS,
    seed: options.seed ?? AUDIT_SEED,
  });
  raw.push(...walk.findings);

  const audit = split(raw);
  audit.coverage = unvisitedFindings(arcs, walk.visited);
  audit.errors.push(...staleWaivers(raw));

  const nodes = arcs.reduce((sum, arc) => sum + arc.nodes.length, 0);
  const choices = arcs.reduce(
    (sum, arc) =>
      sum + arc.nodes.reduce((count, node) => count + node.choices.length, 0),
    0,
  );
  const flagKeys = new Set([
    ...writes.map((write) => write.key),
    ...engineWrites.map((write) => write.key),
  ]);
  audit.stats = {
    arcs: arcs.length,
    nodes,
    choices,
    gates: sources.length,
    flagKeys: flagKeys.size,
    walks: walk.walks,
    walkSteps: walk.steps,
    visitedNodes: walk.visited.size,
  };
  return audit;
}

/** Splits findings by severity, moving waived ones out of the way. */
export function split(findings: readonly AuditFinding[]): NarrativeAudit {
  const audit: NarrativeAudit = {
    errors: [],
    warnings: [],
    waived: [],
    coverage: [],
    stats: {
      arcs: 0,
      nodes: 0,
      choices: 0,
      gates: 0,
      flagKeys: 0,
      walks: 0,
      walkSteps: 0,
      visitedNodes: 0,
    },
  };
  for (const finding of findings) {
    if (findWaiver(finding.code, finding.subject)) {
      audit.waived.push(finding);
    } else if (finding.severity === "error") {
      audit.errors.push(finding);
    } else {
      audit.warnings.push(finding);
    }
  }
  return audit;
}

/**
 * Waivers nothing needed. A fixed problem must not leave a permanent
 * hole in the audit behind it, so a waiver that matches nothing is
 * itself a failure — the one check that keeps the waiver list honest.
 */
export function staleWaivers(findings: readonly AuditFinding[]): AuditFinding[] {
  return waivedPairs()
    .filter(
      (pair) =>
        !findings.some(
          (finding) =>
            finding.code === pair.code && finding.subject === pair.subject,
        ),
    )
    .map((pair) =>
      error(
        "stale-waiver",
        "waivers",
        `Waiver for ${pair.code} "${pair.subject}" matches nothing: the ` +
          "finding is gone, so the waiver should go with it",
        { subject: pair.subject },
      ),
    );
}

export { auditConsequences } from "./consequence";
export { auditGateSatisfiability, defaultGateWorld, statCeilings } from "./gates";
export {
  auditGateRefs,
  auditGraph,
  auditPlacements,
  auditWorldEntries,
  softLockedNodes,
  worldEntries,
} from "./structure";
export { fuzzedStart, runWalks, unvisitedFindings } from "./walk";
export { formatAudit } from "./report";
export type { AuditFinding, AuditStats, NarrativeAudit } from "./types";
export type { GateSource } from "./content";
