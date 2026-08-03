import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { abilities } from "./abilities";
import { backgrounds } from "./backgrounds";
import { companions } from "./companions";
import { consumableItems } from "./consumables";
import { dyeItems } from "./dyes";
import { enemies } from "./enemies";
import { encounters } from "./encounters";
import { factions } from "./factions";
import { injuries } from "./injuries";
import { items } from "./items";
import { LORE_SHARDS } from "./lore";
import { maps } from "./maps";
import { perks } from "./perks";
import {
  CASING_EXCEPTIONS,
  PROPER_NOUNS,
  isContentId,
  isSignage,
  isTitleCase,
  properNounIssues,
} from "./styleguide";

/* ------------------------------------------------------------------ *
 * The pure checkers, on prose written to exercise them
 * ------------------------------------------------------------------ */

describe("isSignage", () => {
  it("accepts a shouted headline", () => {
    expect(isSignage("CORDON HOLDS AT THE ROW")).toBe(true);
  });

  it("rejects anything with a lower-case letter in it", () => {
    expect(isSignage("CORDON holds")).toBe(false);
  });

  it("rejects text with no letters at all", () => {
    expect(isSignage("40% — 20 cr")).toBe(false);
  });
});

describe("isTitleCase", () => {
  it("accepts the shapes the registries use", () => {
    for (const name of [
      "Rail Spitter",
      "Tender's Oilskin",
      "Wire-Grill Skewer",
      "Ledger Ghost-Copy",
      "Auric Letter of Passage",
      "Splint & Seal Kit",
      "Undercroft Junction Nine",
    ]) {
      expect(isTitleCase(name), name).toBe(true);
    }
  });

  it("rejects a sentence-case label", () => {
    expect(isTitleCase("The back shelf")).toBe(false);
    expect(isTitleCase("Bold telegraphs")).toBe(false);
  });

  it("rejects an empty name", () => {
    expect(isTitleCase("   ")).toBe(false);
  });

  it("lets a minor word stay lower case unless it opens the name", () => {
    expect(isTitleCase("Letter of Passage")).toBe(true);
    expect(isTitleCase("of Passage")).toBe(false);
  });
});

describe("isContentId", () => {
  it("accepts kebab-case", () => {
    expect(isContentId("out-cordon-plate")).toBe(true);
    expect(isContentId("a3-keys")).toBe(true);
  });

  it("rejects capitals, underscores and spaces", () => {
    expect(isContentId("outCordonPlate")).toBe(false);
    expect(isContentId("out_cordon_plate")).toBe(false);
    expect(isContentId("out cordon plate")).toBe(false);
    expect(isContentId("-leading")).toBe(false);
    expect(isContentId("trailing-")).toBe(false);
  });
});

describe("properNounIssues", () => {
  it("catches a name written in lower case", () => {
    const issues = properNounIssues("she walks the crown ring at dawn");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.canonical).toBe("Crown Ring");
    expect(issues[0]?.found).toBe("crown ring");
  });

  it("passes the canonical spelling", () => {
    expect(properNounIssues("she walks the Crown Ring at dawn")).toEqual([]);
  });

  it("leaves the signage voice alone", () => {
    expect(properNounIssues("CROWN RING SEALED — NO PASSAGE")).toEqual([]);
  });

  it("never reads a kebab id as prose", () => {
    expect(properNounIssues("flooded-quays:lockgate-stair")).toEqual([]);
    expect(properNounIssues("enc-rustyard-ambush")).toEqual([]);
  });

  it("excuses a literal carrying a documented exception", () => {
    const excused = CASING_EXCEPTIONS[0]?.phrase ?? "";
    expect(properNounIssues(`"${excused}," he says.`)).toEqual([]);
  });

  it("reports every miss in one pass, in reading order", () => {
    const issues = properNounIssues("the undercroft, then the spire");
    expect(issues.map((i) => i.found)).toEqual(["undercroft", "spire"]);
  });
});

/* ------------------------------------------------------------------ *
 * The styleguide's own hygiene
 * ------------------------------------------------------------------ */

describe("the styleguide itself", () => {
  it("spells every proper noun the way it asks content to", () => {
    for (const noun of PROPER_NOUNS) {
      expect(isTitleCase(noun.text), noun.text).toBe(true);
    }
  });

  it("gives every exception a reason", () => {
    for (const exception of CASING_EXCEPTIONS) {
      expect(exception.phrase.length, exception.phrase).toBeGreaterThan(8);
      expect(exception.reason.length, exception.phrase).toBeGreaterThan(20);
    }
  });

  it("lists no name twice", () => {
    const texts = PROPER_NOUNS.map((n) => n.text);
    expect(new Set(texts).size).toBe(texts.length);
  });
});

/* ------------------------------------------------------------------ *
 * The sweep, over the shipped city
 * ------------------------------------------------------------------ */

const DATA_DIR = __dirname;

/** Every non-test content source under `src/data`, recursively. */
function contentFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...contentFiles(path));
    else if (
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts") &&
      // The guide quotes the lower-case senses it excuses; it is the
      // ruler, not a thing to measure.
      entry.name !== "styleguide.ts"
    ) {
      out.push(path);
    }
  }
  return out.sort();
}

interface Literal {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/**
 * Every double-quoted string literal in a source, with the line it sits
 * on. Content is authored as plain quoted strings joined with `+`, so a
 * literal is the unit an author actually types — and the unit an
 * exception phrase has to fit inside.
 */
function literals(file: string): Literal[] {
  const source = readFileSync(file, "utf8");
  const out: Literal[] = [];
  const pattern = /"((?:[^"\\\n]|\\.)*)"/g;
  let line = 1;
  let scanned = 0;
  for (const match of source.matchAll(pattern)) {
    for (let i = scanned; i < match.index; i += 1) {
      if (source[i] === "\n") line += 1;
    }
    scanned = match.index;
    out.push({ file, line, text: match[1] ?? "" });
  }
  return out;
}

/** Literals that are prose: they have letters and are not an id. */
function prose(file: string): Literal[] {
  return literals(file).filter(
    ({ text }) =>
      /\p{Letter}/u.test(text) && !/^[a-z0-9]+(?:[:-][a-z0-9]+)*$/.test(text),
  );
}

const CONTENT = contentFiles(DATA_DIR);
const PROSE = CONTENT.flatMap(prose);

describe("content spells the city's names one way", () => {
  it("finds prose to sweep in the first place", () => {
    // A broken extractor would pass every assertion below by finding
    // nothing at all.
    expect(CONTENT.length).toBeGreaterThan(30);
    expect(PROSE.length).toBeGreaterThan(2000);
  });

  it("writes every proper noun the way the styleguide spells it", () => {
    const misses = PROSE.flatMap(({ file, line, text }) =>
      properNounIssues(text).map(
        (issue) =>
          `${relative(file)}:${line} wrote "${issue.found}" for "${issue.canonical}"`,
      ),
    );
    expect(misses).toEqual([]);
  });

  it("keeps the typographic conventions", () => {
    const misses: string[] = [];
    for (const { file, line, text } of PROSE) {
      // Tile grids are art, not prose: unbroken rows of map glyphs.
      if (!/\s/.test(text) && text.length >= 6) continue;
      const at = `${relative(file)}:${line}`;
      if (/[“”‘’]/u.test(text)) misses.push(`${at} curly quotation mark`);
      if (/--/.test(text)) misses.push(`${at} double hyphen for an em dash`);
      if (/…/u.test(text)) misses.push(`${at} ellipsis character`);
      if (/\.\.\.\s*$/.test(text)) misses.push(`${at} trailing ellipsis`);
      if (/\s\.\.\./.test(text)) misses.push(`${at} space before an ellipsis`);
    }
    expect(misses).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Registry shape: ids and display names
 * ------------------------------------------------------------------ */

interface Named {
  readonly id: string;
  readonly name: string;
}

const NAMED_REGISTRIES: ReadonlyArray<readonly [string, readonly Named[]]> = [
  ["items", items],
  ["consumables", consumableItems],
  ["abilities", abilities],
  ["perks", perks],
  ["dyes", dyeItems],
  ["enemies", enemies],
  ["encounters", encounters],
  ["factions", factions],
  ["maps", maps],
  ["backgrounds", backgrounds],
  ["companions", companions],
  ["injuries", injuries],
];

describe("registry names and ids", () => {
  it("sweeps every registry the game ships", () => {
    for (const [label, registry] of NAMED_REGISTRIES) {
      expect(registry.length, label).toBeGreaterThan(0);
    }
  });

  it("names everything in Title Case", () => {
    const misses = NAMED_REGISTRIES.flatMap(([label, registry]) =>
      registry
        .filter((entry) => !isTitleCase(entry.name))
        .map((entry) => `${label}/${entry.id}: "${entry.name}"`),
    );
    expect(misses).toEqual([]);
  });

  it("gives everything a kebab-case id", () => {
    const misses = NAMED_REGISTRIES.flatMap(([label, registry]) =>
      registry
        .filter((entry) => !isContentId(entry.id))
        .map((entry) => `${label}: "${entry.id}"`),
    );
    expect(misses).toEqual([]);
  });

  it("gives every lore shard a kebab-case id and a Title Case title", () => {
    const misses = LORE_SHARDS.flatMap((shard) => {
      const out: string[] = [];
      if (!isContentId(shard.id)) out.push(`lore: "${shard.id}"`);
      if (!isTitleCase(shard.title)) out.push(`lore/${shard.id}: title`);
      return out;
    });
    expect(misses).toEqual([]);
  });
});

function relative(file: string): string {
  return file.slice(file.indexOf("/src/") + 1);
}
