/**
 * The sweep that keeps `strings.ts` honest.
 *
 * A string table only stays complete if adding a caption the old way is
 * *harder* than adding it the new way. So this walks the UI sources
 * looking for words written straight into a DOM sink — `textContent`,
 * `title`, `placeholder`, `aria-label` and friends — and reports them.
 * `stringLint.test.ts` fails the suite on any hit.
 *
 * It reads the whole right-hand side of such an assignment, not just a
 * bare literal, because the ways prose sneaks into a screen are more
 * varied than that: a ternary between two captions, a template with
 * connective tissue between its holes, a joined list with " and "
 * between the items. Anything the table already answers for — the text
 * inside a `t()` call — is blanked out first.
 *
 * It is a heuristic, deliberately. It reads text, not types, so it
 * cannot know that a literal reaching `el.title` is a tooltip rather
 * than a lookup key. What it can do is make the common regression —
 * typing `button.textContent = "Save"` — impossible to land quietly,
 * and offer an allowlist for the literals that are genuinely not words:
 * separators, symbols, numerals, punctuation.
 *
 * Everything here is pure string work, so the sweep is unit-tested
 * against synthetic sources rather than only against the real tree.
 */

/** A property that puts words in front of the player. */
export const DOM_SINKS = [
  "textContent",
  "innerText",
  "innerHTML",
  "title",
  "placeholder",
  "ariaLabel",
  "alt",
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

/** Calls whose string arguments are keys or already-tabled text. */
const TABLE_CALLS = ["t", "plain", "format"] as const;

/**
 * Literals that read like words but are not: discriminants the code
 * branches on, passed to a predicate inside an expression that also
 * renders something.
 *
 * `preview.textContent = usableIn(item, "exploration") ? … : …` puts no
 * "exploration" on screen — it asks a question about a context id. The
 * sweep reads text rather than types, so it cannot tell that from a
 * caption, and this is where the exceptions are written down. Keep the
 * list short: an entry here is a place the sweep has stopped watching.
 */
export const ALLOWED_LITERALS: readonly string[] = ["exploration"];

export interface LintHit {
  /** 1-based line the offending text sits on. */
  line: number;
  /** The sink it flows into — `textContent`, `aria-label`, … */
  sink: string;
  /** The literal text, without quotes. */
  text: string;
}

/**
 * Literals that are not words and never will be: symbols, separators,
 * bare numerals, punctuation, lone interpolations. Nothing here is a
 * translation unit, and demanding a table key for it would be noise.
 */
export function isNonTranslatable(text: string): boolean {
  const plain = unescape(text);
  if (plain.trim() === "") return true;
  if (ALLOWED_LITERALS.includes(plain)) return true;
  // No letter anywhere: "×", " — ", "/", "0", "+1", "…", " · ", "\n".
  if (!/\p{Letter}/u.test(plain)) return true;
  // A CSS class list, which is what most letters in a screen file are.
  if (/^[a-z0-9-]+(\s+[a-z0-9-]+)*$/.test(plain) && /(^|\s)nf-/.test(plain)) {
    return true;
  }
  return false;
}

/** Resolves the escapes a source literal carries, so `"\n"` reads as blank. */
function unescape(text: string): string {
  return text.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|.)/g, (_, code: string) => {
    if (code === "n") return "\n";
    if (code === "t") return "\t";
    if (code === "r") return "\r";
    if (code.startsWith("u")) {
      const hex = code.replace(/^u\{?|\}$/g, "");
      return String.fromCodePoint(Number.parseInt(hex, 16));
    }
    return code;
  });
}

/* ------------------------------------------------------------------ *
 * Source scanning
 * ------------------------------------------------------------------ */

/**
 * Blanks out comments so a later scan sees only code.
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
      out += i < n ? "  " : "";
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

/** Index just past the string literal that opens at `start`. */
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
    // An unterminated quote is almost always an apostrophe in prose we
    // are not parsing; stop at the newline rather than swallowing the
    // rest of the file.
    if (ch === "\n" && quote !== "`") return i;
    i += 1;
  }
  return source.length;
}

/**
 * Replaces the text inside `t(...)` and `format(...)` arguments with
 * spaces. Those strings are keys and templates the table already owns —
 * leaving them in would have the sweep flag every migrated call site.
 */
export function blankTableCalls(source: string): string {
  const call = new RegExp(String.raw`\b(${TABLE_CALLS.join("|")})\(`, "g");
  const out = source.split("");
  for (const match of source.matchAll(call)) {
    const open = match.index + match[0].length - 1;
    const close = matchingBracket(source, open);
    for (let i = open + 1; i < close; i += 1) {
      if (source[i] !== "\n") out[i] = " ";
    }
  }
  return out.join("");
}

/** Index of the bracket closing the one at `open`, or end of source. */
function matchingBracket(source: string, open: number): number {
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const stack: string[] = [pairs[source[open]!]!];
  let i = open + 1;
  while (i < source.length && stack.length > 0) {
    const ch = source[i]!;
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(source, i);
      continue;
    }
    if (ch in pairs) stack.push(pairs[ch]!);
    else if (ch === stack[stack.length - 1]) stack.pop();
    i += 1;
  }
  return i - 1;
}

/**
 * The static text of every string and template literal in `expression`.
 * A template's `${...}` holes are skipped — the code inside them is
 * scanned in its own right, so its literals are not lost.
 */
export function literalTexts(expression: string): string[] {
  const texts: string[] = [];
  let i = 0;
  while (i < expression.length) {
    const ch = expression[i]!;
    if (ch === '"' || ch === "'") {
      const end = skipString(expression, i);
      if (!isComparisonOperand(expression, i, end)) {
        texts.push(expression.slice(i + 1, end - 1));
      }
      i = end;
      continue;
    }
    if (ch === "`") {
      const end = skipString(expression, i);
      texts.push(...templateParts(expression.slice(i, end)));
      i = end;
      continue;
    }
    i += 1;
  }
  return texts;
}

/**
 * Whether a literal is being *compared* rather than shown.
 *
 * `mode === "menu" ? t("save.title") : t("save.load")` puts one string
 * on screen and one in a condition, and only the first is a word anyone
 * reads. Discriminants are how this codebase branches, so without this
 * every ternary in a screen would be a false alarm.
 */
function isComparisonOperand(source: string, start: number, end: number): boolean {
  const before = source.slice(0, start).trimEnd();
  const after = source.slice(end).trimStart();
  return (
    /(===|!==|==|!=)$/.test(before) ||
    /^(===|!==|==|!=)/.test(after) ||
    /\bcase$/.test(before) ||
    /\b(includes|startsWith|endsWith|has|get|set|indexOf)\($/.test(before)
  );
}

/** A template literal's fixed text runs, plus the literals in its holes. */
function templateParts(template: string): string[] {
  const body = template.slice(1, -1);
  const parts: string[] = [];
  let text = "";
  let i = 0;
  while (i < body.length) {
    if (body[i] === "\\") {
      text += body.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (body[i] === "$" && body[i + 1] === "{") {
      const close = matchingBracket(body, i + 1);
      parts.push(...literalTexts(body.slice(i + 2, close)));
      i = close + 1;
      continue;
    }
    text += body[i];
    i += 1;
  }
  parts.push(text);
  return parts;
}

/** The expression assigned at `from`, up to the statement's end. */
function assignedExpression(source: string, from: number): string {
  let i = from;
  let depth = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(source, i);
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 0) break;
      depth -= 1;
    } else if (ch === ";" && depth === 0) break;
    i += 1;
  }
  return source.slice(from, i);
}

const SINK_ASSIGN = new RegExp(
  String.raw`\.(${DOM_SINKS.join("|")})\s*=\s*(?!=)`,
  "g",
);

const ATTR_CALL = new RegExp(
  String.raw`setAttribute\(\s*["'](${TEXT_ATTRIBUTES.join("|")})["']\s*,`,
  "g",
);

const TEXT_NODE = /createTextNode\(/g;

/** Every hard-coded, translatable word written into a DOM sink. */
export function findHardCodedStrings(source: string): LintHit[] {
  const code = blankTableCalls(stripComments(source));
  const hits: LintHit[] = [];
  const record = (index: number, sink: string, expression: string): void => {
    for (const text of literalTexts(expression)) {
      if (isNonTranslatable(text)) continue;
      hits.push({ line: lineOf(code, index), sink, text });
    }
  };
  for (const match of code.matchAll(SINK_ASSIGN)) {
    const start = match.index + match[0].length;
    record(match.index, match[1]!, assignedExpression(code, start));
  }
  for (const match of code.matchAll(ATTR_CALL)) {
    const start = match.index + match[0].length;
    const open = code.indexOf("(", match.index);
    record(match.index, match[1]!, code.slice(start, matchingBracket(code, open)));
  }
  for (const match of code.matchAll(TEXT_NODE)) {
    const open = match.index + match[0].length - 1;
    const body = code.slice(open + 1, matchingBracket(code, open));
    record(match.index, "createTextNode", body);
  }
  return hits.sort((a, b) => a.line - b.line);
}

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (source[i] === "\n") line += 1;
  return line;
}
