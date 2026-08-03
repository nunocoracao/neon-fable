/**
 * The sweep that keeps `strings.ts` honest.
 *
 * A string table only stays complete if adding a caption the old way is
 * *harder* than adding it the new way. So this walks the UI sources
 * looking for string literals written straight into a DOM sink —
 * `textContent`, `title`, `placeholder`, `aria-label` and friends — and
 * reports them. `strings.lint.test.ts` fails the suite on any hit.
 *
 * It is a heuristic, deliberately. It reads text, not types: it cannot
 * know that a literal reaching `el.title` is a CSS class name rather
 * than a caption. What it can do is make the common regression — typing
 * `button.textContent = "Save"` — impossible to land quietly, and offer
 * an allowlist for the handful of literals that are genuinely not
 * words: separators, symbols, numerals, punctuation.
 *
 * Everything here is pure string work so the sweep can be unit-tested
 * against synthetic sources rather than only against the real tree.
 */

/** A place a literal would end up in front of the player. */
export const DOM_SINKS = [
  "textContent",
  "innerText",
  "innerHTML",
  "title",
  "placeholder",
  "ariaLabel",
  "alt",
  "label",
] as const;

export type DomSink = (typeof DOM_SINKS)[number];

/** `setAttribute` targets that carry player-facing words. */
export const TEXT_ATTRIBUTES = [
  "aria-label",
  "aria-valuetext",
  "aria-description",
  "aria-placeholder",
  "title",
  "placeholder",
  "alt",
] as const;

export interface LintHit {
  /** 1-based line the literal sits on. */
  line: number;
  /** The sink it was assigned into — `textContent`, `aria-label`, … */
  sink: string;
  /** The literal's contents, braces and all, without its quotes. */
  text: string;
}

/**
 * Literals that are not words and never will be: symbols, separators,
 * bare numerals, punctuation. Anything matching is not a translation
 * unit, and demanding a table key for it would be noise.
 */
export function isNonTranslatable(text: string): boolean {
  if (text.trim() === "") return true;
  // No letter anywhere: "×", "—", "/", "0", "+1", "…", "12:00".
  if (!/\p{Letter}/u.test(text)) return true;
  // A lone interpolation and nothing else: `${name}`, "{n}".
  if (/^\s*(\$\{[^}]*\}|\{[A-Za-z][A-Za-z0-9_]*\})\s*$/.test(text)) return true;
  return false;
}

/**
 * Blanks out comments and template-literal `${...}` holes so a later
 * regex sweep sees only real code and real literal text.
 *
 * Replacing rather than deleting keeps every byte offset — and so every
 * line number — exactly where it was in the original source.
 */
export function stripComments(source: string): string {
  let out = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      while (i < n && source[i] !== "\n") {
        out += " ";
        i += 1;
      }
      continue;
    }
    if (ch === "/" && next === "*") {
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        out += source[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      out += "  ";
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const end = skipString(source, i);
      out += source.slice(i, end);
      i = end;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Index just past the string literal opening at `start`. */
function skipString(source: string, start: number): number {
  const quote = source[start]!;
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    // An unterminated single/double quote is almost always an apostrophe
    // inside a comment we already blanked; stop at the newline rather
    // than swallowing the rest of the file.
    if (ch === "\n" && quote !== "`") return i;
    i += 1;
  }
  return source.length;
}

const SINK_ASSIGN = new RegExp(
  String.raw`\.(${DOM_SINKS.join("|")})\s*=\s*(?!=)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\`(?:[^\`\\]|\\.)*\`)`,
  "g",
);

const ATTR_CALL = new RegExp(
  String.raw`setAttribute\(\s*["'](${TEXT_ATTRIBUTES.join("|")})["']\s*,\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\`(?:[^\`\\]|\\.)*\`)`,
  "g",
);

/** `createTextNode("…")` — the other way words reach the page. */
const TEXT_NODE = new RegExp(
  String.raw`createTextNode\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\`(?:[^\`\\]|\\.)*\`)`,
  "g",
);

/** Every hard-coded, translatable literal written into a DOM sink. */
export function findHardCodedStrings(source: string): LintHit[] {
  const code = stripComments(source);
  const hits: LintHit[] = [];
  const record = (index: number, sink: string, quoted: string): void => {
    const text = quoted.slice(1, -1);
    if (isNonTranslatable(text)) return;
    hits.push({ line: lineOf(code, index), sink, text });
  };
  for (const match of code.matchAll(SINK_ASSIGN)) {
    record(match.index, match[1]!, match[2]!);
  }
  for (const match of code.matchAll(ATTR_CALL)) {
    record(match.index, match[1]!, match[2]!);
  }
  for (const match of code.matchAll(TEXT_NODE)) {
    record(match.index, "createTextNode", match[1]!);
  }
  return hits.sort((a, b) => a.line - b.line);
}

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (source[i] === "\n") line += 1;
  return line;
}
