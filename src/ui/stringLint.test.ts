import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_LITERALS,
  blankTableCalls,
  findHardCodedStrings,
  isNonTranslatable,
  literalTexts,
  stripComments,
} from "./stringLint";

/* ------------------------------------------------------------------ *
 * The sweep, on sources written to exercise it
 * ------------------------------------------------------------------ */

describe("stripComments", () => {
  it("blanks a line comment and keeps the line count", () => {
    const out = stripComments('const a = 1; // el.textContent = "Save"\nb');
    expect(out).not.toContain("Save");
    expect(out.split("\n")).toHaveLength(2);
  });

  it("blanks a block comment and keeps its newlines", () => {
    const out = stripComments('/* el.title = "Hi"\n   more */ code');
    expect(out).not.toContain("Hi");
    expect(out.split("\n")).toHaveLength(2);
    expect(out.trim()).toBe("code");
  });

  it("leaves a comment marker inside a string alone", () => {
    expect(stripComments('const url = "https://a.example/b";')).toBe(
      'const url = "https://a.example/b";',
    );
  });

  it("does not run an apostrophe in a comment past its line", () => {
    const out = stripComments("// don't\nel.textContent = \"Save\";");
    expect(out).toContain('"Save"');
  });
});

describe("blankTableCalls", () => {
  it("erases the key inside a t() call, keeping every offset", () => {
    const source = 'el.textContent = t("menu.newGame");';
    const out = blankTableCalls(source);
    expect(out).not.toContain("menu.newGame");
    expect(out).toMatch(/^el\.textContent = t\( +\);$/);
    expect(out).toHaveLength(source.length);
  });

  it("erases a params object as well as the key", () => {
    const out = blankTableCalls('t("a.b", { n: "x" })');
    expect(out).not.toContain("a.b");
    expect(out).not.toContain('"x"');
  });

  it("leaves other calls untouched", () => {
    expect(blankTableCalls('label("Save")')).toBe('label("Save")');
  });
});

describe("literalTexts", () => {
  it("collects plain string literals", () => {
    expect(literalTexts('a("one") + b(\'two\')')).toEqual(["one", "two"]);
  });

  it("collects a template's fixed runs, not its holes", () => {
    expect(literalTexts("`HP ${hp} of ${max} left`")).toEqual([
      "HP  of  left",
    ]);
  });

  it("collects literals nested inside a template's holes", () => {
    expect(literalTexts("`${on ? \"Mute\" : \"Unmute\"} bus`")).toEqual([
      "Mute",
      "Unmute",
      " bus",
    ]);
  });

  it("skips a literal being compared rather than shown", () => {
    expect(literalTexts('mode === "game" ? "Save / Load" : "Load Game"')).toEqual(
      ["Save / Load", "Load Game"],
    );
  });

  it("skips a literal looked up in a collection", () => {
    expect(literalTexts('seen.has("intro") ? "Again" : "First"')).toEqual([
      "Again",
      "First",
    ]);
  });
});

describe("isNonTranslatable", () => {
  it("passes over symbols, separators and numerals", () => {
    for (const text of ["×", " — ", "/", "0", "+1", "…", " · ", "???", "%"]) {
      expect(isNonTranslatable(text), text).toBe(true);
    }
  });

  it("passes over whitespace, including escaped whitespace", () => {
    for (const text of ["", "   ", "\\n", "\\t"]) {
      expect(isNonTranslatable(text), JSON.stringify(text)).toBe(true);
    }
  });

  it("passes over the project's own CSS class lists", () => {
    expect(isNonTranslatable("nf-button nf-button-small")).toBe(true);
  });

  it("passes over the explicit allowlist", () => {
    for (const text of ALLOWED_LITERALS) {
      expect(isNonTranslatable(text), text).toBe(true);
    }
  });

  it("catches words", () => {
    for (const text of ["Save", "HP  of ", " cr", "Deal {n} damage"]) {
      expect(isNonTranslatable(text), text).toBe(false);
    }
  });
});

describe("findHardCodedStrings", () => {
  it("flags a caption assigned to textContent", () => {
    expect(findHardCodedStrings('button.textContent = "Save";')).toEqual([
      { line: 1, sink: "textContent", text: "Save" },
    ]);
  });

  it("flags both arms of a ternary", () => {
    const hits = findHardCodedStrings(
      'el.textContent = on ? "Mute" : "Unmute";',
    );
    expect(hits.map((hit) => hit.text)).toEqual(["Mute", "Unmute"]);
  });

  it("flags the connective text between a template's holes", () => {
    const hits = findHardCodedStrings("el.textContent = `${n} cr`;");
    expect(hits.map((hit) => hit.text)).toEqual([" cr"]);
  });

  it("flags a title or placeholder", () => {
    const hits = findHardCodedStrings(
      'input.placeholder = "Your name";\nel.title = "A tooltip";',
    );
    expect(hits.map((hit) => hit.sink)).toEqual(["placeholder", "title"]);
  });

  it("flags a setAttribute onto a text-carrying attribute", () => {
    const hits = findHardCodedStrings(
      'el.setAttribute("aria-label", "Filter by id");',
    );
    expect(hits).toEqual([
      { line: 1, sink: "aria-label", text: "Filter by id" },
    ]);
  });

  it("ignores setAttribute onto an attribute that carries no words", () => {
    expect(findHardCodedStrings('el.setAttribute("role", "radiogroup");')).toEqual(
      [],
    );
  });

  it("flags a text node built from a literal", () => {
    const hits = findHardCodedStrings('el.append(document.createTextNode("or"));');
    expect(hits.map((hit) => hit.sink)).toEqual(["createTextNode"]);
  });

  it("accepts a caption that comes through the table", () => {
    expect(findHardCodedStrings('button.textContent = t("menu.newGame");')).toEqual(
      [],
    );
  });

  it("accepts a class name, a separator and a comparison", () => {
    expect(
      findHardCodedStrings(
        'el.className = "nf-button";\n' +
          'el.textContent = parts.join(" · ");\n' +
          'el.textContent = mode === "game" ? t("save.title.game") : t("save.title.load");',
      ),
    ).toEqual([]);
  });

  it("reports the line the assignment starts on", () => {
    const hits = findHardCodedStrings('\n\nel.textContent =\n  "Save";');
    expect(hits[0]?.line).toBe(3);
  });

  it("says nothing about a comment that looks like a violation", () => {
    expect(
      findHardCodedStrings('// el.textContent = "Save";\nconst a = 1;'),
    ).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * The sweep, on the real tree
 * ------------------------------------------------------------------ */

const UI_DIR = __dirname;

function uiSources(): string[] {
  return readdirSync(UI_DIR)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .sort();
}

describe("src/ui", () => {
  it("renders no hard-coded words into the DOM", () => {
    const offences: string[] = [];
    for (const name of uiSources()) {
      const source = readFileSync(join(UI_DIR, name), "utf8");
      for (const hit of findHardCodedStrings(source)) {
        offences.push(`${name}:${hit.line} ${hit.sink} — ${hit.text}`);
      }
    }
    expect(
      offences,
      "put these in src/ui/strings.ts and read them back with t()",
    ).toEqual([]);
  });

  it("sweeps every screen, so a clean result means something", () => {
    // A regex that quietly stopped matching would report zero offences
    // and look like success. This is the canary: the sweep must still
    // find the sinks it is watching, even though none of them offend.
    const sources = uiSources();
    expect(sources.length).toBeGreaterThan(20);
    const withSinks = sources.filter((name) =>
      /\.(textContent|title|placeholder)\s*=/.test(
        readFileSync(join(UI_DIR, name), "utf8"),
      ),
    );
    expect(withSinks.length).toBeGreaterThan(15);
  });
});
