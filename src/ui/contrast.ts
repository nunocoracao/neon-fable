/**
 * Contrast maths, and the table of pairs the theme has to satisfy.
 *
 * The pixel look is dark chrome with neon accents, and it is easy to
 * write a colour into theme.css that looks right on the author's screen
 * and falls under WCAG AA on anybody else's. So the ratios are computed
 * rather than eyeballed: ./contrast.test.ts reads the real custom
 * properties out of theme.css, runs them through here, and fails the
 * suite on anything below the level its pair declares.
 *
 * Everything in this file is pure string and number work — no DOM, no
 * CSS parsing beyond pulling `--nf-*: #rrggbb;` declarations out of a
 * stylesheet's text, which is the whole of how the theme declares a
 * colour.
 *
 * ## The levels
 *
 * - **4.5** — WCAG 2.1 AA for body text.
 * - **3** — AA for large text (the display face at 1.5rem and up), and
 *   the level 1.4.11 asks of a control's own boundary and of a focus
 *   indicator. This is the one the pixel aesthetic actually needs:
 *   a hairline panel border at 1.3:1 is a border nobody can find.
 */

/** A colour as three channels in [0, 1]. */
export type Rgb = readonly [r: number, g: number, b: number];

/** Parses "#rgb" or "#rrggbb"; throws on anything else. */
export function parseHex(hex: string): Rgb {
  const body = hex.trim().replace(/^#/, "");
  const full =
    body.length === 3
      ? body
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : body;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Not a hex colour: "${hex}"`);
  }
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as
    unknown as Rgb;
}

/** WCAG relative luminance. */
export function relativeLuminance(color: Rgb): number {
  const [r, g, b] = color.map((channel) =>
    channel <= 0.03928
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4),
  ) as unknown as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours: 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(parseHex(a));
  const lb = relativeLuminance(parseHex(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Every `--nf-name: #value;` declaration in a stylesheet's text, by
 * name without the leading dashes. Non-colour custom properties (the
 * fonts, the shadows, the text scale) are skipped — they have no ratio.
 */
export function readColorTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  const pattern = /--(nf-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g;
  for (const match of css.matchAll(pattern)) {
    const [, name, value] = match;
    if (name && value && (value.length === 4 || value.length === 7)) {
      tokens[name] = value;
    }
  }
  return tokens;
}

/** What a pair is used for, and therefore what it has to clear. */
export type ContrastLevel = "text" | "large" | "ui";

export const CONTRAST_MINIMUMS: Record<ContrastLevel, number> = {
  /** AA, body text. */
  text: 4.5,
  /** AA, large text — the display face at 1.5rem and up. */
  large: 3,
  /** 1.4.11: a control's own boundary, and a focus indicator. */
  ui: 3,
};

export interface ContrastPair {
  /** Foreground token name, without the leading dashes. */
  fg: string;
  /** Background token it is painted on. */
  bg: string;
  level: ContrastLevel;
  /** Where in the interface this pair actually occurs. */
  where: string;
}

/**
 * The pairs the theme is checked against.
 *
 * Not every possible combination — a table of every token against every
 * other would fail on pairs nothing puts together, and a test nobody
 * can satisfy gets deleted rather than fixed. These are the ones the
 * stylesheet really paints, one row per place a colour lands on a
 * background.
 */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  // Body copy, on each of the three surfaces.
  { fg: "nf-ink", bg: "nf-bg-deep", level: "text", where: "body copy on the page" },
  { fg: "nf-ink", bg: "nf-bg-panel", level: "text", where: "body copy in a panel" },
  { fg: "nf-ink", bg: "nf-bg-raised", level: "text", where: "body copy on a card" },
  // The dim voice: notes, blurbs, secondary labels. Small text, so AA.
  { fg: "nf-ink-dim", bg: "nf-bg-deep", level: "text", where: "notes on the page" },
  { fg: "nf-ink-dim", bg: "nf-bg-panel", level: "text", where: "notes in a panel" },
  { fg: "nf-ink-dim", bg: "nf-bg-raised", level: "text", where: "notes on a card" },
  // The three accents, wherever they are set as text.
  { fg: "nf-glow-cyan", bg: "nf-bg-deep", level: "text", where: "cyan headings and keys" },
  { fg: "nf-glow-cyan", bg: "nf-bg-panel", level: "text", where: "cyan labels in a panel" },
  { fg: "nf-glow-cyan", bg: "nf-bg-raised", level: "text", where: "cyan labels on a card" },
  { fg: "nf-glow-amber", bg: "nf-bg-deep", level: "text", where: "amber warnings" },
  { fg: "nf-glow-amber", bg: "nf-bg-panel", level: "text", where: "amber bands in a panel" },
  { fg: "nf-glow-amber", bg: "nf-bg-raised", level: "text", where: "amber bands on a card" },
  { fg: "nf-glow-magenta", bg: "nf-bg-deep", level: "text", where: "magenta band names" },
  { fg: "nf-glow-magenta", bg: "nf-bg-panel", level: "text", where: "magenta labels in a panel" },
  { fg: "nf-glow-magenta", bg: "nf-bg-raised", level: "text", where: "magenta labels on a card" },
  { fg: "nf-danger", bg: "nf-bg-deep", level: "text", where: "danger copy" },
  { fg: "nf-danger", bg: "nf-bg-panel", level: "text", where: "danger copy in a panel" },
  { fg: "nf-danger", bg: "nf-bg-raised", level: "text", where: "danger copy on a card" },
  // Boundaries and indicators: 1.4.11 rather than a text level.
  { fg: "nf-border", bg: "nf-bg-panel", level: "ui", where: "panel and control borders" },
  { fg: "nf-border", bg: "nf-bg-raised", level: "ui", where: "borders on a raised card" },
  { fg: "nf-border", bg: "nf-bg-deep", level: "ui", where: "borders against the page" },
  { fg: "nf-glow-cyan", bg: "nf-bg-deep", level: "ui", where: "the focus ring" },
  { fg: "nf-glow-cyan", bg: "nf-bg-panel", level: "ui", where: "the focus ring in a panel" },
  { fg: "nf-glow-cyan", bg: "nf-bg-raised", level: "ui", where: "the focus ring on a card" },
];

export interface ContrastFailure extends ContrastPair {
  ratio: number;
  required: number;
}

/**
 * Every pair that falls short, with the ratio it managed. An empty
 * array is the theme passing.
 */
export function contrastFailures(
  tokens: Record<string, string>,
  pairs: readonly ContrastPair[] = CONTRAST_PAIRS,
): ContrastFailure[] {
  const failures: ContrastFailure[] = [];
  for (const pair of pairs) {
    const fg = tokens[pair.fg];
    const bg = tokens[pair.bg];
    if (!fg || !bg) {
      throw new Error(`Contrast pair names a missing token: ${pair.fg}/${pair.bg}`);
    }
    const ratio = contrastRatio(fg, bg);
    const required = CONTRAST_MINIMUMS[pair.level];
    // Rounded to two places first: a pair that computes to 4.4999 is
    // 4.50 to anybody reading a report, and failing it would be noise.
    if (Math.round(ratio * 100) / 100 < required) {
      failures.push({ ...pair, ratio, required });
    }
  }
  return failures;
}
