import { beforeAll, describe, expect, it } from "vitest";
import { AUDIT_WAIVERS } from "../../data/narrativeAudit";
import { storyArcs } from "../../data/story";
import { auditNarrative, split, staleWaivers } from "./index";
import { coveragePercent, formatAudit } from "./report";
import { error, warning, type NarrativeAudit } from "./types";

/**
 * The audit, run over everything the game ships.
 *
 * This is the file that makes the tooling matter: the checks in
 * ./structure.ts, ./gates.ts, ./consequence.ts, and ./walk.ts are all
 * fixture-tested beside their own modules, and here they are pointed at
 * the real story with nothing waived that does not carry a written
 * reason.
 *
 * Verbose mode, for looking rather than for failing:
 *
 *     npm run audit:narrative
 *
 * — or `NARRATIVE_AUDIT=verbose npx vitest run src/narrative/audit`,
 * which prints the whole report including walk coverage and every
 * waived finding with the sentence justifying it.
 */

const VERBOSE = process.env.NARRATIVE_AUDIT != null;

/** How much of the graph the walks must reach for the budget to be honest. */
const MIN_COVERAGE = 70;

let audit: NarrativeAudit;
let elapsedMs = 0;

beforeAll(() => {
  const started = performance.now();
  audit = auditNarrative();
  elapsedMs = performance.now() - started;
  if (VERBOSE) {
    // eslint-disable-next-line no-console -- the whole point of the mode
    console.log(formatAudit(audit, { verbose: true }));
  }
});

describe("the narrative audit", () => {
  it("finds no errors in the shipped story", () => {
    expect(audit.errors, formatAudit(audit)).toEqual([]);
  });

  it("has every warning either fixed or waived with a reason", () => {
    expect(audit.warnings, formatAudit(audit)).toEqual([]);
  });

  it("actually looked at the whole corpus", () => {
    expect(audit.stats.arcs).toBe(storyArcs.length);
    expect(audit.stats.nodes).toBeGreaterThan(200);
    expect(audit.stats.choices).toBeGreaterThan(400);
    // Gates from every content kind, not just story choices.
    expect(audit.stats.gates).toBeGreaterThan(200);
    expect(audit.stats.flagKeys).toBeGreaterThan(100);
  });

  it("walks enough of the graph for the coverage report to mean something", () => {
    expect(audit.stats.walkSteps).toBeGreaterThan(1000);
    expect(coveragePercent(audit), formatAudit(audit)).toBeGreaterThan(MIN_COVERAGE);
  });

  it("stays inside the ordinary test run's budget", () => {
    // The whole suite runs in seconds; an audit that cost more than a
    // second of it would be quietly deleted by the first person in a
    // hurry. Wide enough for a loaded CI box, tight enough to notice a
    // check that started walking the graph quadratically.
    expect(elapsedMs).toBeLessThan(3000);
  });
});

describe("the waiver list", () => {
  it("says why for every subject it covers", () => {
    for (const waiver of AUDIT_WAIVERS) {
      expect(waiver.subjects.length, waiver.why).toBeGreaterThan(0);
      expect(waiver.why.length, waiver.subjects.join(", ")).toBeGreaterThan(60);
    }
  });

  it("covers only findings that are really there", () => {
    // A waiver that stopped matching is a hole left behind by a fix.
    expect(staleWaivers([]).length).toBe(AUDIT_WAIVERS.flatMap((w) => w.subjects).length);
    expect(
      audit.errors.filter((finding) => finding.code === "stale-waiver"),
    ).toEqual([]);
  });

  it("moves a waived finding out of the way rather than dropping it", () => {
    expect(audit.waived.length).toBeGreaterThan(0);
    for (const finding of audit.waived) {
      expect(audit.errors).not.toContainEqual(finding);
      expect(audit.warnings).not.toContainEqual(finding);
    }
  });
});

describe("the report", () => {
  it("leads with the figures and groups findings by code", () => {
    const report = formatAudit(
      split([
        error("soft-lock", "arc:x", "trapped in x", { subject: "x" }),
        error("soft-lock", "arc:y", "trapped in y", { subject: "y" }),
        warning("unread-flag", "arc:z", "nobody reads z", { subject: "z" }),
      ]),
    );
    expect(report).toContain("Narrative audit");
    expect(report).toContain("soft-lock × 2");
    expect(report).toContain("unread-flag × 1");
    expect(report).toContain("trapped in x");
  });

  it("keeps the coverage list and the waivers for verbose mode only", () => {
    const quiet = formatAudit(audit);
    const loud = formatAudit(audit, { verbose: true });
    expect(quiet).not.toContain("Unreached by any walk");
    expect(loud).toContain("Unreached by any walk");
    expect(loud).toContain("why:");
    expect(loud.length).toBeGreaterThan(quiet.length);
  });
});
