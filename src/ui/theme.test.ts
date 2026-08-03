import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONTRAST_MINIMUMS,
  CONTRAST_PAIRS,
  contrastFailures,
  contrastRatio,
  parseHex,
  readColorTokens,
  relativeLuminance,
} from "./contrast";
import {
  focusVisibleClasses,
  interactiveClasses,
  unringedClasses,
} from "./focusSweep";

/**
 * The two things about the stylesheet that cannot be checked by
 * looking at it: whether a colour clears WCAG AA on the surface it is
 * actually painted on, and whether every control the keyboard can land
 * on shows that it has.
 *
 * Both are run against the real theme.css and the real UI sources, so
 * a colour tweaked or a control added without a ring fails here rather
 * than shipping.
 */

const UI_DIR = __dirname;
const CSS = readFileSync(join(UI_DIR, "theme.css"), "utf8");

function uiSources(): string[] {
  return readdirSync(UI_DIR)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => readFileSync(join(UI_DIR, name), "utf8"));
}

/* ------------------------------------------------------------------ *
 * The maths
 * ------------------------------------------------------------------ */

describe("contrast maths", () => {
  it("agrees with the reference values at both ends", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // Symmetric: which one is the ink makes no difference to the ratio.
    expect(contrastRatio("#123456", "#abcdef")).toBeCloseTo(
      contrastRatio("#abcdef", "#123456"),
      10,
    );
  });

  it("reads short and long hex the same", () => {
    expect(parseHex("#fff")).toEqual(parseHex("#ffffff"));
    expect(parseHex("0a0a12")).toEqual(parseHex("#0a0a12"));
    expect(() => parseHex("rebeccapurple")).toThrow();
  });

  it("weights luminance the way WCAG does", () => {
    expect(relativeLuminance(parseHex("#000000"))).toBeCloseTo(0, 10);
    expect(relativeLuminance(parseHex("#ffffff"))).toBeCloseTo(1, 10);
    // Green carries most of the weight, blue least.
    expect(relativeLuminance(parseHex("#00ff00"))).toBeGreaterThan(
      relativeLuminance(parseHex("#ff0000")),
    );
    expect(relativeLuminance(parseHex("#ff0000"))).toBeGreaterThan(
      relativeLuminance(parseHex("#0000ff")),
    );
  });

  it("pulls colour tokens out of a stylesheet and skips everything else", () => {
    const tokens = readColorTokens(`:root {
      --nf-ink: #e8e6f0;
      --nf-short: #abc;
      --nf-font-body: monospace;
      --nf-text-scale: 1;
      --nf-shadow-hard: 4px 4px 0 rgba(5, 6, 12, 0.65);
    }`);
    expect(tokens).toEqual({ "nf-ink": "#e8e6f0", "nf-short": "#abc" });
  });
});

/* ------------------------------------------------------------------ *
 * The theme itself
 * ------------------------------------------------------------------ */

describe("theme.css", () => {
  const tokens = readColorTokens(CSS);

  it("declares every token the contrast table names", () => {
    for (const pair of CONTRAST_PAIRS) {
      expect(tokens[pair.fg], pair.fg).toBeDefined();
      expect(tokens[pair.bg], pair.bg).toBeDefined();
    }
  });

  it("meets WCAG AA everywhere a colour lands on a surface", () => {
    const failures = contrastFailures(tokens).map(
      (failure) =>
        `${failure.where} — ${failure.fg} on ${failure.bg}: ` +
        `${failure.ratio.toFixed(2)}:1, needs ${failure.required}:1`,
    );
    expect(
      failures,
      "raise the colour in theme.css until it clears the ratio",
    ).toEqual([]);
  });

  it("checks enough pairs for a clean result to mean something", () => {
    expect(CONTRAST_PAIRS.length).toBeGreaterThan(15);
    expect(new Set(CONTRAST_PAIRS.map((p) => p.fg)).size).toBeGreaterThan(4);
    expect(CONTRAST_MINIMUMS.text).toBe(4.5);
    expect(CONTRAST_MINIMUMS.ui).toBe(3);
  });
});

/* ------------------------------------------------------------------ *
 * Focus visibility
 * ------------------------------------------------------------------ */

describe("keyboard focus is visible", () => {
  it("finds the control classes in a source", () => {
    const source = `
      const button = document.createElement("button");
      button.className = "nf-button nf-button-small";
      const tin = document.createElement("button");
      tin.dataset.dye = id;
      tin.className = "nf-dye-tin";
      const field = document.createElement("input");
      field.type = "text";
      field.className = "nf-input";
      const div = document.createElement("div");
      div.className = "nf-panel";
    `;
    // The panel underneath is not a control, and proximity alone must
    // not sweep it up.
    expect(interactiveClasses(source)).toEqual([
      "nf-button",
      "nf-button-small",
      "nf-dye-tin",
      "nf-input",
    ]);
  });

  it("reads the ring list off a stylesheet", () => {
    expect(
      focusVisibleClasses(`
        .nf-button:focus-visible,
        .nf-choice:focus-visible { outline: 2px solid red; }
        .nf-panel { border: 0; }
      `),
    ).toEqual(["nf-button", "nf-choice"]);
  });

  it("reports a control class with no ring", () => {
    expect(
      unringedClasses(
        [
          'const b = document.createElement("button");\nb.className = "nf-lock";',
        ],
        ".nf-button:focus-visible { outline: 2px solid red; }",
      ),
    ).toEqual(["nf-lock"]);
  });

  it("gives every control in the game a ring", () => {
    expect(
      unringedClasses(uiSources(), CSS),
      "add these to the :focus-visible block in theme.css",
    ).toEqual([]);
  });

  it("sweeps enough of the tree for a clean result to mean something", () => {
    const classes = new Set(uiSources().flatMap(interactiveClasses));
    expect(classes.size).toBeGreaterThan(10);
    expect(classes.has("nf-button")).toBe(true);
  });
});
