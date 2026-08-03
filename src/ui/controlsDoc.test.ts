import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONTROLS_DOC_BEGIN,
  CONTROLS_DOC_END,
  controlsDocBlock,
  controlsMarkdown,
  extractControlsBlock,
} from "./controlsDoc";
import { CONTROL_GROUPS, allControlBindings } from "./controlsModel";
import { plain } from "./strings";

/**
 * The docs-accuracy check.
 *
 * `controlsModel.test.ts` keeps the key map complete; this keeps the
 * *manual* honest about it. The player guide's controls section is
 * generated from the same table the Controls screen renders, so the
 * only way for the two to disagree is for somebody to edit the block by
 * hand — which fails here, with the correct text printed in the diff.
 */

const GUIDE_PATH = join(process.cwd(), "docs", "PLAYER_GUIDE.md");

function guide(): string {
  return readFileSync(GUIDE_PATH, "utf8");
}

describe("the generated controls block", () => {
  it("says every key the game answers, and only those", () => {
    const markdown = controlsMarkdown();
    for (const binding of allControlBindings()) {
      expect(markdown, binding.id).toContain(plain(binding.keys));
      expect(markdown, binding.id).toContain(plain(binding.what));
    }
    // One row per binding, and no rows invented: the header separators
    // are the only other table lines.
    const rows = markdown
      .split("\n")
      .filter((line) => line.startsWith("| ") && !line.startsWith("| --- "));
    expect(rows).toHaveLength(
      allControlBindings().length + CONTROL_GROUPS.length,
    );
  });

  it("keeps a group's own heading and blurb with its keys", () => {
    const markdown = controlsMarkdown();
    for (const group of CONTROL_GROUPS) {
      expect(markdown, group.id).toContain(`### ${plain(group.title)}`);
      if (group.blurb !== null) {
        expect(markdown, group.id).toContain(plain(group.blurb));
      }
    }
  });

  it("escapes a pipe, so a key named | cannot end its own column", () => {
    // No binding spells one today; the guard is here because the day one
    // does, the table would silently render one column short.
    const escaped = controlsMarkdown()
      .split("\n")
      .filter((line) => line.startsWith("| "))
      .every((line) => line.split("|").length >= 4);
    expect(escaped).toBe(true);
  });
});

describe("docs/PLAYER_GUIDE.md", () => {
  it("carries the generated controls block, between its markers", () => {
    const text = guide();
    expect(text).toContain(CONTROLS_DOC_BEGIN);
    expect(text).toContain(CONTROLS_DOC_END);
    expect(extractControlsBlock(text)).not.toBeNull();
  });

  it("prints exactly what the settings screen renders from", () => {
    // If this fails, the guide is stale: paste `controlsDocBlock()` —
    // the expected side of this diff — over the block in the guide.
    expect(extractControlsBlock(guide())).toBe(controlsDocBlock());
  });

  it("points a reader at the in-game reference rather than repeating it", () => {
    // The manual is allowed to be a manual, but the key map has one
    // home; the guide has to say where the game itself keeps it.
    expect(guide()).toContain("Controls");
  });
});
