import { describe, expect, it } from "vitest";
import { findArcByNode, introArc } from "./index";

describe("findArcByNode", () => {
  it("finds the arc that contains a node id", () => {
    expect(findArcByNode("filament-door")?.id).toBe(introArc.id);
  });

  it("returns undefined for unknown node ids", () => {
    expect(findArcByNode("no-such-node")).toBeUndefined();
  });
});
