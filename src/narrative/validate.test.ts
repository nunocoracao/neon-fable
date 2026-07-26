import { describe, expect, it } from "vitest";
import { introArc } from "../data/story/intro";
import type { StoryArc } from "./types";
import { validateArc } from "./validate";

function arcWith(overrides: Partial<StoryArc>): StoryArc {
  return {
    id: "t",
    title: "T",
    entryNodeId: "a",
    nodes: [
      {
        id: "a",
        text: "",
        choices: [{ id: "go", label: "", target: "b" }],
      },
      {
        id: "b",
        text: "",
        choices: [{ id: "stop", label: "", effects: [{ type: "end" }] }],
      },
    ],
    ...overrides,
  };
}

describe("validateArc", () => {
  it("passes a sound arc", () => {
    expect(validateArc(arcWith({}))).toEqual([]);
  });

  it("passes the authored intro arc", () => {
    expect(validateArc(introArc)).toEqual([]);
  });

  it("flags choice targets that point at missing nodes", () => {
    const arc = arcWith({
      nodes: [
        {
          id: "a",
          text: "",
          choices: [{ id: "go", label: "", target: "missing" }],
        },
      ],
    });
    expect(validateArc(arc)).toContainEqual(
      expect.objectContaining({ code: "broken-target", nodeId: "a" }),
    );
  });

  it("flags nodes unreachable from the entry node", () => {
    const arc = arcWith({
      nodes: [
        ...arcWith({}).nodes,
        { id: "island", text: "", choices: [] },
      ],
    });
    expect(validateArc(arc)).toContainEqual(
      expect.objectContaining({ code: "orphan-node", nodeId: "island" }),
    );
  });

  it("treats goto effects as graph edges for reachability and targets", () => {
    const arc = arcWith({
      nodes: [
        {
          id: "a",
          text: "",
          choices: [
            {
              id: "go",
              label: "",
              target: "b",
              effects: [{ type: "goto", nodeId: "c" }],
            },
          ],
        },
        {
          id: "b",
          text: "",
          choices: [{ id: "stop", label: "", effects: [{ type: "end" }] }],
        },
        {
          id: "c",
          text: "",
          choices: [{ id: "stop", label: "", effects: [{ type: "end" }] }],
        },
      ],
    });
    expect(validateArc(arc)).toEqual([]);
  });

  it("flags duplicate node ids", () => {
    const arc = arcWith({
      nodes: [...arcWith({}).nodes, { id: "a", text: "", choices: [] }],
    });
    expect(validateArc(arc)).toContainEqual(
      expect.objectContaining({ code: "duplicate-node", nodeId: "a" }),
    );
  });

  it("flags a missing entry node", () => {
    expect(validateArc(arcWith({ entryNodeId: "nowhere" }))).toContainEqual(
      expect.objectContaining({ code: "missing-entry" }),
    );
  });

  it("flags choices with no target, goto, or end marker", () => {
    const arc = arcWith({
      nodes: [
        {
          id: "a",
          text: "",
          choices: [{ id: "go", label: "" }],
        },
      ],
    });
    expect(validateArc(arc)).toContainEqual(
      expect.objectContaining({ code: "dead-end-choice", choiceId: "go" }),
    );
  });

  it("flags unknown item ids in requirements and effects", () => {
    const arc = arcWith({
      nodes: [
        {
          id: "a",
          text: "",
          choices: [
            {
              id: "go",
              label: "",
              target: "b",
              requirements: [{ type: "item", itemId: "msc-not-real" }],
              effects: [{ type: "add-item", itemId: "wpn-not-real" }],
            },
          ],
        },
        {
          id: "b",
          text: "",
          choices: [{ id: "stop", label: "", effects: [{ type: "end" }] }],
        },
      ],
    });
    const issues = validateArc(arc);
    expect(issues).toContainEqual(
      expect.objectContaining({ code: "unknown-item", detail: expect.stringContaining("msc-not-real") }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ code: "unknown-item", detail: expect.stringContaining("wpn-not-real") }),
    );
  });
});
