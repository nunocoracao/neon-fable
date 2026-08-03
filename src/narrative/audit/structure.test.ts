import { describe, expect, it } from "vitest";
import { storyArcs } from "../../data/story";
import {
  allGatedNodes,
  auditGateRefs,
  auditGraph,
  auditPlacements,
  auditWorldEntries,
  softLockedNodes,
  worldEntries,
} from "./structure";
import {
  brokenArc,
  brokenGateSources,
  soundArc,
  soundGateSources,
  strayEntryArc,
} from "./fixtures";

/** Codes reported, for asserting on a set rather than on an order. */
function codes(findings: { code: string }[]): string[] {
  return [...new Set(findings.map((finding) => finding.code))].sort();
}

describe("the graph audit", () => {
  it("says nothing about a sound arc", () => {
    expect(auditGraph([soundArc])).toEqual([]);
  });

  it("reports a broken target, a choice going nowhere, and a room with no doors", () => {
    const findings = auditGraph([brokenArc]);
    expect(findings).toContainEqual(
      expect.objectContaining({
        code: "arc-issue",
        detail: expect.stringContaining("b-nowhere-at-all"),
      }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        code: "arc-issue",
        detail: expect.stringContaining("dead-end-choice"),
      }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({ code: "no-exit-node", subject: "b-island" }),
    );
  });

  it("reports a loop no terminator is reachable from", () => {
    expect(softLockedNodes(brokenArc)).toContain("b-loop");
    expect(auditGraph([brokenArc])).toContainEqual(
      expect.objectContaining({ code: "soft-lock", subject: "b-loop" }),
    );
  });

  it("does not report the room with no doors twice", () => {
    const findings = auditGraph([brokenArc]).filter(
      (finding) => finding.subject === "b-island",
    );
    expect(codes(findings)).toEqual(["arc-issue", "no-exit-node"]);
  });

  it("reports a scene whose every choice is gated", () => {
    expect(allGatedNodes(brokenArc).map((node) => node.id)).toEqual(["b-gated"]);
    expect(auditGraph([brokenArc])).toContainEqual(
      expect.objectContaining({
        code: "all-gated-node",
        severity: "warning",
        subject: "b-gated",
      }),
    );
  });

  it("does not call a scene all-gated when one choice asks for nothing", () => {
    expect(allGatedNodes(soundArc)).toEqual([]);
  });

  it("reports a duplicate node id and an entry that does not exist", () => {
    const findings = auditGraph([strayEntryArc]);
    expect(findings).toContainEqual(
      expect.objectContaining({ detail: expect.stringContaining("duplicate-node") }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({ detail: expect.stringContaining("missing-entry") }),
    );
  });
});

describe("the world's doorways", () => {
  it("accepts a doorway onto a node that exists", () => {
    expect(
      auditWorldEntries([soundArc], [{ nodeId: "s-start", source: "map:test/door" }]),
    ).toEqual([]);
  });

  it("reports a doorway onto a node that does not", () => {
    expect(
      auditWorldEntries([soundArc], [{ nodeId: "s-gone", source: "map:test/door" }]),
    ).toEqual([
      expect.objectContaining({
        code: "arc-issue",
        source: "map:test/door",
        subject: "s-gone",
      }),
    ]);
  });

  it("gathers the real game's doorways, and every one of them lands", () => {
    const entries = worldEntries(storyArcs);
    expect(entries.length).toBeGreaterThan(20);
    expect(auditWorldEntries(storyArcs, entries)).toEqual([]);
  });
});

describe("ids named by gates outside the story graph", () => {
  it("says nothing when every id resolves", () => {
    expect(auditGateRefs(soundGateSources)).toEqual([]);
  });

  it("reports the unknown item, companion, injury, and band", () => {
    expect(codes(auditGateRefs(brokenGateSources))).toEqual([
      "unknown-band",
      "unknown-companion",
      "unknown-injury",
      "unknown-item",
    ]);
  });

  it("leaves story choices to validateArc, so one typo is reported once", () => {
    expect(
      auditGateRefs([
        {
          source: "arc:fixture-broken",
          where: "b-hub/b-throw",
          requirements: [{ type: "item", itemId: "itm-not-in-the-catalog" }],
        },
      ]),
    ).toEqual([]);
  });
});

describe("where non-story content says it lives", () => {
  it("finds nothing wrong with the shipped barks, shards, and interludes", () => {
    expect(auditPlacements()).toEqual([]);
  });
});
