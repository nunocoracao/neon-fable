/**
 * One home for every player-facing word that is *chrome*.
 *
 * ## The boundary
 *
 * **Chrome lives here.** Chrome is the frame around the game: button
 * captions, screen headings, field labels, settings descriptions, hint
 * text, confirmation prompts, error copy, empty-state lines, save-slot
 * furniture, combat action names. It is written by the interface, not by
 * the story, and it would be the first thing a translator asks for.
 *
 * **Content stays in `src/data/`.** Story nodes, dialogue, barks, lore
 * shards, epilogues, item names and descriptions, ability and enemy
 * names, faction and companion names — all of it stays in the typed
 * content files it already lives in. Those are authored fiction with
 * their own schemas, tests, and narrative gating; dragging them through
 * a flat key table would buy nothing and cost a lot.
 *
 * The test of which side a string falls on: *would rewriting it change
 * the story?* "Load Game" would not. A courier's threat would. When a
 * line is chrome wrapped around content — "Equipped: {item}" — the
 * wrapper is chrome and belongs here; `{item}` arrives from the data
 * file.
 *
 * ## Using it
 *
 * ```ts
 * button.textContent = t("menu.newGame");
 * label.textContent = t("combat.damageDealt", { n: 12 });
 * ```
 *
 * `t()` is typed against the table: an unknown key is a compile error,
 * and a string with `{placeholders}` demands exactly those parameters.
 * Keys are hierarchical and dot-separated, grouped by the screen or
 * overlay that renders them (`save.slot.empty`, `combat.action.flee`).
 *
 * A lint-style sweep (`strings.lint.test.ts`) walks `src/ui` looking for
 * string literals assigned into DOM sinks, so a new hard-coded caption
 * fails the suite rather than quietly shipping.
 */

/* ------------------------------------------------------------------ *
 * The table
 * ------------------------------------------------------------------ */

export const STRINGS = {
  /* -------------------------------------------------------------- *
   * Common — words shared by more screens than any one of them owns
   * -------------------------------------------------------------- */
  "common.back": "Back",

  /* -------------------------------------------------------------- *
   * Main menu
   * -------------------------------------------------------------- */
  "menu.title": "Neon Fable",
  "menu.subtitle": "A cyberpunk story",
  "menu.newGame": "New Game",
  "menu.newGamePlus": "New Game+",
  "menu.continue": "Continue",
  "menu.recoverRun": "Recover Run",
  "menu.loadGame": "Load Game",
  "menu.codex": "Codex",
  "menu.settings": "Settings",
  "menu.error.loadRecent": "Could not load the most recent save.",
  "menu.error.recover": "The stashed run could not be recovered.",
  "menu.dev.explore": "Explore (dev)",
  "menu.dev.gallery": "Art Gallery (dev)",
  "menu.dev.perf": "Perf Scene (dev)",

  /* -------------------------------------------------------------- *
   * Explore, art gallery and perf scene — the dev-only routes
   * -------------------------------------------------------------- */
  "explore.help": "Click a tile to move. Drag to pan.",
  "explore.hour": "Hour: {phase}",
  "gallery.title": "Art Gallery",
  "gallery.filter.placeholder": "Filter by id…",
  "gallery.filter.label": "Filter art by id",
  "gallery.section": "{title} ({count})",
  "perf.scroll.on": "Scroll: on",
  "perf.scroll.off": "Scroll: off",
} as const;

export type StringTable = typeof STRINGS;
export type StringKey = keyof StringTable;

/* ------------------------------------------------------------------ *
 * The formatter
 * ------------------------------------------------------------------ */

/** A value a placeholder may be filled with. */
export type FormatValue = string | number;

/**
 * The placeholder names inside a template, as a union of literal types.
 * `"Deal {n} to {target}"` yields `"n" | "target"`; a template with no
 * placeholders yields `never`.
 *
 * Doubled braces escape, so `"{{n}}"` contributes nothing — the `{{`
 * arm is matched first and consumes the brace pair before the
 * placeholder arm can see it.
 */
export type Placeholders<S extends string> =
  S extends `${string}{{${string}}}${infer Rest}`
    ? Placeholders<Rest>
    : S extends `${string}{${infer Name}}${infer Rest}`
      ? Name | Placeholders<Rest>
      : never;

/** The parameter record a template demands, or `never` if it takes none. */
export type FormatParams<S extends string> = [Placeholders<S>] extends [never]
  ? never
  : Record<Placeholders<S>, FormatValue>;

/**
 * The tail of `t()`'s argument list: nothing for a plain string, a
 * required params record for a parameterized one. Splitting it this way
 * is what makes `t("menu.back", { n: 1 })` and `t("combat.hit")` both
 * compile errors.
 */
export type TArgs<K extends StringKey> = [
  Placeholders<StringTable[K]>,
] extends [never]
  ? []
  : [params: FormatParams<StringTable[K]>];

const PLACEHOLDER = /\{\{|\}\}|\{([A-Za-z][A-Za-z0-9_]*)\}/g;

/**
 * Fills `{name}` placeholders from `params`.
 *
 * - `{{` and `}}` are literal braces, so a template can say `{` at all.
 * - A placeholder with no matching parameter is left standing. Typed
 *   call sites make that unreachable; untyped ones get something
 *   obviously wrong on screen rather than the word "undefined".
 * - Numbers stringify with `String`, which is the plain decimal form
 *   this game wants everywhere it counts something.
 */
export function format(
  template: string,
  params?: Record<string, FormatValue>,
): string {
  if (!params) return template.replace(PLACEHOLDER, unescapeOnly);
  return template.replace(PLACEHOLDER, (match, name?: string) => {
    if (name === undefined) return match === "{{" ? "{" : "}";
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

function unescapeOnly(match: string): string {
  if (match === "{{") return "{";
  if (match === "}}") return "}";
  return match;
}

/**
 * Looks a string up by key and fills its placeholders.
 *
 * The overload-free signature carries the whole contract: `K` narrows to
 * a literal key, and `TArgs<K>` derives the parameters from that key's
 * template, so misuse fails at compile time.
 */
export function t<K extends StringKey>(key: K, ...args: TArgs<K>): string {
  const template: string = STRINGS[key];
  const params = args[0] as Record<string, FormatValue> | undefined;
  return format(template, params);
}

/** Whether a runtime string names an entry in the table. */
export function isStringKey(key: string): key is StringKey {
  return Object.prototype.hasOwnProperty.call(STRINGS, key);
}
