import { findWaiver } from "../../data/narrativeAudit";
import type { AuditFinding, NarrativeAudit } from "./types";

/**
 * The audit as prose: the report the test run prints when something
 * fails, and the whole report when a developer asks for it.
 *
 * Plain text, sorted, and grouped by code rather than by file, because
 * the useful question in front of thirty findings is "what kind of
 * mistake is this" and not "which act was unlucky". A count beside each
 * group is what tells somebody whether they are looking at one rename
 * or at a systematic slip.
 */

function line(finding: AuditFinding): string {
  const where = finding.where != null ? ` ${finding.where}` : "";
  return `    ${finding.source}${where}: ${finding.detail}`;
}

function group(title: string, findings: readonly AuditFinding[]): string[] {
  if (findings.length === 0) return [];
  const byCode = new Map<string, AuditFinding[]>();
  for (const finding of findings) {
    const bucket = byCode.get(finding.code) ?? [];
    bucket.push(finding);
    byCode.set(finding.code, bucket);
  }
  const out = [`${title} (${findings.length})`];
  for (const [code, bucket] of [...byCode].sort(([a], [b]) => a.localeCompare(b))) {
    out.push(`  ${code} × ${bucket.length}`);
    for (const finding of bucket) out.push(line(finding));
  }
  return out;
}

/** How much of the graph the walks stood on, as a percentage. */
export function coveragePercent(audit: NarrativeAudit): number {
  if (audit.stats.nodes === 0) return 100;
  return (audit.stats.visitedNodes / audit.stats.nodes) * 100;
}

export interface ReportOptions {
  /**
   * Include the full coverage list and every waived finding. Off by
   * default: a failure report wants the failures, and the coverage list
   * is one line per unvisited node.
   */
  verbose?: boolean;
}

export function formatAudit(
  audit: NarrativeAudit,
  options: ReportOptions = {},
): string {
  const { stats } = audit;
  const lines: string[] = [
    "Narrative audit",
    `  ${stats.arcs} arcs, ${stats.nodes} nodes, ${stats.choices} choices, ` +
      `${stats.gates} gated things, ${stats.flagKeys} flag keys`,
    `  ${stats.walks} walks, ${stats.walkSteps} choices taken, ` +
      `${stats.visitedNodes}/${stats.nodes} nodes reached ` +
      `(${coveragePercent(audit).toFixed(1)}%)`,
    `  ${audit.errors.length} errors, ${audit.warnings.length} warnings, ` +
      `${audit.waived.length} waived, ${audit.coverage.length} unreached`,
    "",
  ];

  lines.push(...group("Errors", audit.errors));
  lines.push(...group("Warnings", audit.warnings));

  if (options.verbose) {
    if (audit.waived.length > 0) {
      lines.push(`Waived (${audit.waived.length})`);
      for (const finding of audit.waived) {
        const waiver = findWaiver(finding.code, finding.subject);
        lines.push(`  ${finding.code} ${finding.subject ?? ""}`);
        lines.push(line(finding));
        if (waiver) lines.push(`      why: ${waiver.why}`);
      }
    }
    lines.push(...group("Unreached by any walk", audit.coverage));
  }

  return lines.join("\n");
}
