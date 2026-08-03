import { describe, expect, it } from "vitest";
import { auditConsequences, readerKeys } from "./consequence";
import {
  contentFlagWrites,
  engineFlagReads,
  engineFlagWrites,
  gateSources,
} from "./content";

describe("the consequence audit", () => {
  it("says nothing about a flag a gate reads", () => {
    expect(
      auditConsequences(
        [{ key: "b-flag", value: true, source: "arc:fixture", where: "n/c" }],
        [
          {
            source: "arc:fixture",
            requirements: [{ type: "flag-equals", key: "b-flag", value: true }],
          },
        ],
        [],
      ),
    ).toEqual([]);
  });

  it("says nothing about a flag a system reads off its own table", () => {
    expect(
      auditConsequences(
        [{ key: "act9-complete", value: true, source: "arc:fixture" }],
        [],
        [{ key: "act9-complete", source: "engine:acts" }],
      ),
    ).toEqual([]);
  });

  it("warns about a flag nothing anywhere reads", () => {
    expect(
      auditConsequences(
        [{ key: "b-unread", value: true, source: "arc:fixture", where: "n/c" }],
        [],
        [],
      ),
    ).toEqual([
      expect.objectContaining({
        code: "unread-flag",
        severity: "warning",
        subject: "b-unread",
        where: "n/c",
      }),
    ]);
  });

  it("reports one loose end per key, however many beats write it", () => {
    const findings = auditConsequences(
      [
        { key: "b-unread", value: 1, source: "arc:fixture", where: "a/one" },
        { key: "b-unread", value: 2, source: "arc:fixture", where: "b/two" },
        { key: "b-unread", value: 3, source: "arc:fixture", where: "c/three" },
      ],
      [],
      [],
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.detail).toContain("3 beats");
  });

  it("counts every reader the real game has, gates and systems alike", () => {
    const readers = readerKeys(gateSources(), engineFlagReads());
    expect(readers.size).toBeGreaterThan(50);
    // The chapter flags are read by advancement rather than by a gate,
    // which is exactly the case the engine-read table exists for.
    expect(readers.has("act1-complete")).toBe(true);
  });

  it("never calls an engine-owned flag unread: its own system reads it", () => {
    const findings = auditConsequences(
      contentFlagWrites(),
      gateSources(),
      engineFlagReads(),
    );
    const engineKeys = new Set(engineFlagWrites().map((write) => write.key));
    for (const finding of findings) {
      expect(engineKeys.has(finding.subject ?? ""), finding.detail).toBe(false);
    }
  });
});
