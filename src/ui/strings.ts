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
 * overlay that renders them (`save.slot.empty`, `combat.end.victory`).
 * The dotted shape is shared with the audio event ids in
 * `src/data/sfx.ts`, so a new group checks there for a name clash — two
 * meanings behind one string is a bug waiting on a careless grep.
 *
 * One rule about writing entries: **every value is a single string
 * literal**. Splitting a long line with `+` widens its inferred type
 * from the literal to `string`, and a `string` has no placeholders TS
 * can see — the parameters would silently stop being checked. Long
 * lines are the price; `strings.test.ts` enforces it.
 *
 * A lint-style sweep (`stringLint.ts`, run by `stringLint.test.ts`)
 * walks `src/ui` looking for words written into DOM sinks, so a new
 * hard-coded caption fails the suite rather than quietly shipping.
 */

/* ------------------------------------------------------------------ *
 * The table
 * ------------------------------------------------------------------ */

export const STRINGS = {
  /* -------------------------------------------------------------- *
   * Common — words shared by more screens than any one of them owns
   * -------------------------------------------------------------- */
  "common.back": "Back",
  "common.closeEsc": "Close [Esc]",

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

  /* -------------------------------------------------------------- *
   * Crash screen
   * -------------------------------------------------------------- */
  "crash.title": "Something glitched",
  "crash.lede.stashed":
    "The game hit an error it could not carry on from. The run you were in has been stashed — pick it up from the main menu.",
  "crash.lede.clean":
    "The game hit an error it could not carry on from. Your last save is untouched; head back to the main menu to pick the thread up.",
  "crash.report.label": "Diagnostic report",
  "crash.includeSave": "Include save data (adds the whole run to the report)",
  "crash.copy": "Copy report",
  "crash.mainMenu": "Main Menu",
  "crash.reload": "Reload",
  "crash.status.copied": "Report copied.",
  "crash.status.copyFailed":
    "Could not reach the clipboard — select the text and copy it.",
  "crash.status.saveIncluded": "The whole save is in the report now.",
  "crash.status.saveOmitted": "The report is back to a summary of the run.",

  /* -------------------------------------------------------------- *
   * Interludes, hints and the epilogue
   * -------------------------------------------------------------- */
  "interlude.continueHint": "Click or press Enter to continue.",
  "hint.dismiss": "Dismiss hint: {title}",
  "epilogue.kicker": "Epilogue — The Meridian Sprawl",
  "epilogue.closer": "{name}'s story is told. The Sprawl keeps every receipt.",
  "epilogue.ngPlus":
    "New Game+ is open from the main menu — a fresh run with a small legacy carry-over.",
  "epilogue.returnToMenu": "Return to Main Menu",

  /* -------------------------------------------------------------- *
   * The game screen: HUD, system menu, chapter-end panel
   * -------------------------------------------------------------- */
  "game.paused": "Paused",
  "game.chapterComplete": "Chapter complete",
  "game.chapter.keepExploring": "Keep Exploring",
  "game.chapter.mainMenu": "Main Menu",
  "game.chapter.spendPoints": "Spend Advancement Points",
  "game.chapter.choosePerk": "Choose a Perk",
  "game.menu.resume": "Resume",
  "game.menu.saveLoad": "Save / Load",
  "game.menu.codex": "Codex",
  "game.menu.settings": "Settings",
  "game.menu.quit": "Quit to Main Menu",
  "game.hud.inventory": "Inventory [I]",
  "game.hud.crew": "Crew [C]",
  "game.hud.advance": "Advance [P]",
  "game.hud.saves": "Saves",
  "game.hud.menu": "Menu [Esc]",

  /* -------------------------------------------------------------- *
   * Combat: how a fight ends
   * -------------------------------------------------------------- */
  "combat.end.victory": "Victory",
  "combat.end.continue": "Continue",
  "combat.end.fled": "Clean Break",
  "combat.end.fledNote":
    "You break contact and melt back into Cinder Row. Word of it will travel.",
  "combat.end.return": "Return",
  "combat.end.defeat": "Flatlined",
  "combat.end.defeatNote":
    "The Sprawl goes dark. Load a save to pick the thread back up.",
  "combat.end.loadAutosave": "Load Autosave",
  "combat.end.autosaveError": "Could not load the autosave.",
  "combat.end.loadGame": "Load Game",
  "combat.end.mainMenu": "Main Menu",

  /* -------------------------------------------------------------- *
   * Appearance picker and its live preview
   * -------------------------------------------------------------- */
  "appearance.categories": "Appearance category",
  "appearance.preview.keys": "Q/E rotate · W walk · +/− zoom",

  /* -------------------------------------------------------------- *
   * Breach minigame
   * -------------------------------------------------------------- */
  "breach.lattice": "Signal lattice",
  "breach.help": "Arrows to move, Enter to route. [U] back up, [W] pull out.",

  /* -------------------------------------------------------------- *
   * Advancement overlay
   * -------------------------------------------------------------- */
  "advance.title": "Advancement",
  "advance.unspent": "Unspent: {points}",
  "advance.chapter.granted": "{label} · +{points}",
  "advance.chapter.pending": "{label} · not yet complete",
  "advance.nextMilestone": "{label} at {cred} cred",
  "advance.allMilestones": "Every milestone reached",
  "advance.perks": "Perks",
  "advance.noPerks": "None yet. Street cred milestones are what grant them.",
  "advance.raiseStat": "Raise a stat ({cost} each)",
  "advance.raise": "Raise",
  "advance.atCap": "At cap",
  "advance.unlockAbility": "Unlock an ability",
  "advance.abilityCost": "Ability · {cost}",
  "advance.unlock": "Unlock",
  "advance.unlocked": "Unlocked",

  /* -------------------------------------------------------------- *
   * Perks — the pick screen and the cred readouts it shares
   * -------------------------------------------------------------- */
  "perk.title": "Perks",
  "perk.taken": "Yours",
  "perk.take": "Take",
  "perk.confirm": "Confirm — this is permanent",
  "perk.confirmPrompt": "{name} is a permanent choice. Confirm to take it.",
  "perk.next": "Next: {label} at {cred}",
  "perk.noCredYet": "Nothing the city has noticed yet.",
  "perk.cred.plain": "Street cred {cred}",
  "perk.cred.milestone": "Street cred {cred} · {milestone}",
  "perk.picks.none": "No pick waiting",
  "perk.picks.one": "1 perk pick waiting",
  "perk.picks.many": "{picks} perk picks waiting",
  "perk.headline.exhausted": "You are everything the street has to teach.",
  "perk.headline.next": "{remaining} more cred and the Sprawl wants a word.",
  "perk.headline.known": "The city knows exactly who you are.",

  /* -------------------------------------------------------------- *
   * Crew overlay
   * -------------------------------------------------------------- */
  "party.title": "Crew",
  "party.hp": "HP {hp}/{max}",
  "party.waiting": "{name} has something to say.",
  "party.withYou": "With you",
  "party.standDown": "Stand down",
  "party.takeAlong": "Take along",
  "party.empty": "Nobody has thrown in with you yet.",
  "party.note": "One of them walks with you at a time. Swap between jobs.",

  /* -------------------------------------------------------------- *
   * Codex — the between-runs record. The entries themselves are
   * content; the tallies wrapped around them are not.
   * -------------------------------------------------------------- */
  "codex.title": "Codex",
  "codex.endings": "Endings",
  "codex.endings.stats":
    "Endings found {found}/{total} · Playthroughs completed: {completions}",
  "codex.threads": "Epilogue Threads",
  "codex.threads.stats":
    "Threads found {found}/{threads} · Outcomes recorded {outcomes}/{total}",
  "codex.threads.outcomes": "Outcomes seen: {found}/{total}",
  "codex.shards": "Memory Shards",
  "codex.shards.statsInRun":
    "Shards this run {collected}/{total} · Ever found {discovered}/{total}",
  "codex.shards.statsEver": "Shards ever found {discovered}/{total}",
  "codex.shards.locked": "Shard {number}",

  /* -------------------------------------------------------------- *
   * Inventory overlay
   * -------------------------------------------------------------- */
  "inventory.title": "Inventory",
  "inventory.hp": "HP {hp}/{max}",
  "inventory.credits": "{credits} cr",
  "inventory.neuralLoad": "Neural load {load}/{capacity}",
  "inventory.equipped": "Equipped",
  "inventory.slot.weapon": "Weapon",
  "inventory.slot.outfit": "Outfit",
  "inventory.slot.empty": "Empty",
  "inventory.fitted": "Fitted: {mods}",
  "inventory.dyed": "Dyed: {channels}",
  "inventory.pulling": "Pulling it: {projection}",
  "inventory.equip": "Equip",
  "inventory.unequip": "Unequip",
  "inventory.install": "Install",
  "inventory.uninstall": "Uninstall",
  "inventory.confirmExtraction": "Confirm extraction",
  "inventory.extractionWarning": "Extraction destroys the implant.",
  "inventory.use": "Use",
  "inventory.combatOnly": "Only in a fight.",
  "inventory.standing": "Standing",
  "inventory.carried": "Carried",
  "inventory.nothingCarried": "Nothing carried.",

  /* -------------------------------------------------------------- *
   * Save / load panel
   * -------------------------------------------------------------- */
  "save.title.game": "Save / Load",
  "save.title.load": "Load Game",
  "save.slot.empty": "Empty",
  "save.cancel": "Cancel",
  "save.previously": "Previously",
  "save.replay": "Replay",
  "save.action.save": "Save",
  "save.action.saved": "Saved to {slot}.",
  "save.action.load": "Load",
  "save.action.name": "Name",
  "save.action.rename": "Rename",
  "save.action.delete": "Delete",
  "save.action.restoreBackup": "Restore backup",
  "save.action.restored": "{slot} restored from the save before it.",
  "save.rename.label": "Name this save",
  "save.rename.placeholder": "Before the Undercroft",
  "save.rename.commit": "Save name",
  "save.rename.done": "{slot} is now \"{name}\".",
  "save.rename.cleared": "{slot} label cleared.",
  "save.delete.confirm": "Confirm delete",
  "save.delete.done": "{slot} deleted.",
  "save.delete.prompt": "Delete {slot}? This cannot be undone.",
  "save.delete.needsName": "Deleting {slot} needs the runner's name typed back.",
  "save.delete.typePrompt": "Type \"{word}\" to delete this run",
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
