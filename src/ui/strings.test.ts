import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments } from "./stringLint";
import { STRINGS, format, isStringKey, t, type StringKey } from "./strings";

describe("format", () => {
  it("returns a template with no placeholders unchanged", () => {
    expect(format("Load Game")).toBe("Load Game");
    expect(format("Load Game", {})).toBe("Load Game");
  });

  it("fills a named placeholder", () => {
    expect(format("Deal {n} damage", { n: 12 })).toBe("Deal 12 damage");
  });

  it("fills every occurrence of the same placeholder", () => {
    expect(format("{name} vs {name}", { name: "Vex" })).toBe("Vex vs Vex");
  });

  it("fills several placeholders in one template", () => {
    expect(format("{a} of {b}", { a: 2, b: 5 })).toBe("2 of 5");
  });

  it("stringifies numbers in plain decimal", () => {
    expect(format("{n}", { n: 0 })).toBe("0");
    expect(format("{n}", { n: -3 })).toBe("-3");
    expect(format("{n}", { n: 1.5 })).toBe("1.5");
  });

  it("leaves a placeholder standing when no parameter is given", () => {
    expect(format("Deal {n} damage", { other: 1 })).toBe("Deal {n} damage");
    expect(format("Deal {n} damage")).toBe("Deal {n} damage");
  });

  it("unescapes doubled braces", () => {
    expect(format("{{n}}")).toBe("{n}");
    expect(format("{{n}}", { n: 4 })).toBe("{n}");
    expect(format("{{{n}}}", { n: 4 })).toBe("{4}");
  });

  it("ignores brace runs that are not placeholders", () => {
    expect(format("{ n }", { n: 1 })).toBe("{ n }");
    expect(format("{}", {})).toBe("{}");
    expect(format("{9lives}", { "9lives": 1 })).toBe("{9lives}");
  });

  it("does not re-scan substituted text for placeholders", () => {
    expect(format("{a}", { a: "{b}", b: "boom" })).toBe("{b}");
  });
});

describe("t", () => {
  it("looks a plain string up by key", () => {
    expect(t("menu.newGame")).toBe("New Game");
  });

  it("matches the raw table entry for unparameterized keys", () => {
    const lookup = t as (key: string) => string;
    for (const [key, template] of Object.entries(STRINGS)) {
      if (template.includes("{")) continue;
      expect(lookup(key)).toBe(template);
    }
  });
});

describe("isStringKey", () => {
  it("accepts table keys and rejects everything else", () => {
    expect(isStringKey("menu.newGame")).toBe(true);
    expect(isStringKey("menu.notAKey")).toBe(false);
    expect(isStringKey("toString")).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Table hygiene
 * ------------------------------------------------------------------ */

const UI_DIR = join(__dirname);
const SRC_DIR = join(__dirname, "..");

/** Every non-test `.ts` file under `src/`, recursively. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(path);
    }
  }
  return out;
}

/** Anything shaped like a table key, quoted, outside the table itself. */
const KEY_SHAPED = /"([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9+]+)+)"/g;

function keyLiterals(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of sourceFiles(SRC_DIR)) {
    if (file === join(UI_DIR, "strings.ts")) continue;
    const src = stripComments(readFileSync(file, "utf8"));
    for (const match of src.matchAll(KEY_SHAPED)) {
      const key = match[1]!;
      const seen = found.get(key) ?? [];
      seen.push(file);
      found.set(key, seen);
    }
  }
  return found;
}

/** Keys passed to `t()` directly — the ones tsc would already catch. */
function calledKeys(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of sourceFiles(SRC_DIR)) {
    const src = stripComments(readFileSync(file, "utf8"));
    for (const match of src.matchAll(/\bt\(\s*"([^"]+)"/g)) {
      const key = match[1]!;
      const seen = found.get(key) ?? [];
      seen.push(file);
      found.set(key, seen);
    }
  }
  return found;
}

describe("string table", () => {
  it("keys are hierarchical, dot-separated and lower-camel", () => {
    for (const key of Object.keys(STRINGS)) {
      expect(key, `${key} should be group.name`).toMatch(
        /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9+]+)+$/,
      );
    }
  });

  it("holds every value as one string literal", () => {
    // A `+` between two halves of a caption widens the inferred type to
    // `string`, and `Placeholders<string>` is `never` — the parameters
    // would quietly stop being checked at every call site.
    const table = stripComments(
      readFileSync(join(UI_DIR, "strings.ts"), "utf8"),
    );
    const body = table.slice(
      table.indexOf("export const STRINGS = {"),
      table.indexOf("} as const;"),
    );
    const concatenated = body
      .split("\n")
      .filter((line) => /^\s*("[^"]*"|)\s*\+\s*$|\+\s*$/.test(line));
    expect(concatenated, "split this back into one literal").toEqual([]);
  });

  it("has no duplicate keys differing only by case", () => {
    const lowered = Object.keys(STRINGS).map((key) => key.toLowerCase());
    expect(new Set(lowered).size).toBe(lowered.length);
  });

  it("resolves every key handed to t()", () => {
    const unknown = [...calledKeys()].filter(([key]) => !isStringKey(key));
    expect(unknown.map(([key, files]) => `${key} (${files.join(", ")})`)).toEqual(
      [],
    );
  });

  it("resolves every key-shaped literal that names a string group", () => {
    // Indirect routes — key maps keyed by kind, arrays of keys — bypass
    // `t()`'s typing at the point the literal is written. A literal that
    // starts with a real group prefix but does not resolve is a typo.
    const groups = new Set(
      Object.keys(STRINGS).map((key) => key.slice(0, key.indexOf("."))),
    );
    const stale = [...keyLiterals().keys()].filter(
      (key) => groups.has(key.slice(0, key.indexOf("."))) && !isStringKey(key),
    );
    expect(stale).toEqual([]);
  });

  it("has no orphan entries", () => {
    const referenced = keyLiterals();
    const orphans = (Object.keys(STRINGS) as StringKey[]).filter(
      (key) => !referenced.has(key),
    );
    expect(
      orphans,
      "unused table entries — delete them or wire them up",
    ).toEqual([]);
  });
});
