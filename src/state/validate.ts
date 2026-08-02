/**
 * Save-shape validation with a finger to point.
 *
 * "This save is invalid" is a dead end: it tells the player nothing and
 * tells whoever has to fix it less. Everything here exists to turn that
 * sentence into `state.player.name (expected a string, got nothing)` —
 * a path, an expectation, and what was actually there.
 *
 * Three properties make it safe to run on every load, including loads
 * of saves written years of versions ago:
 *
 *  - **It is a table, not a routine.** The rules below are data; adding
 *    a field to GameState means adding a row, and the row carries the
 *    version the field started existing at.
 *  - **It is version-aware.** A rule only applies to a state at or past
 *    its `since` version, so a v6 save is not failed for missing the
 *    party it could not possibly have. This is what lets the migration
 *    runner validate every intermediate step (see ./migrate.ts): after
 *    the step that adds parties, parties are required.
 *  - **It never cascades.** A missing `player` reports once, not once
 *    per field underneath it.
 *
 * It is a *shape* check, deliberately shallow. Whether a difficulty id
 * names a preset this build still ships is the clamp layer's business
 * (clampRules, clampLore, sanitizeMods…), which runs after migration
 * and is free to repair. Validation only decides whether there is
 * something coherent enough to hand to those.
 */

export interface ValidationIssue {
  /** Dotted path from the validated root: "state.player.name". */
  path: string;
  /** "expected a string, got nothing" — expectation and reality. */
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export interface ValidateOptions {
  /**
   * Version to judge the state at. Defaults to the state's own
   * `version` field — the migration runner passes the version a step
   * has just produced, which is how a half-migrated state is held to
   * exactly the fields it should have by then.
   */
  atVersion?: number;
  /** Prefix for reported paths; "state" when validating an envelope. */
  root?: string;
}

/** One field the shape check knows about. */
interface StateRule {
  /** Dotted path within the state. */
  path: string;
  /** Prose for the report: "a string", "a finite number". */
  expect: string;
  test(value: unknown): boolean;
  /** First save version at which the field must be present. */
  since: number;
}

/* ------------------------------------------------------------------ *
 * Predicates
 * ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): boolean {
  return typeof value === "string";
}

function isFinite(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegative(value: unknown): boolean {
  return isFinite(value) && (value as number) >= 0;
}

function isArray(value: unknown): boolean {
  return Array.isArray(value);
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

/* ------------------------------------------------------------------ *
 * The table
 * ------------------------------------------------------------------ */

/**
 * Every field a save must carry, and the version it started being
 * required at. Ordered roughly as GameState declares them, so a diff of
 * this table reads like a diff of the state.
 */
const STATE_RULES: readonly StateRule[] = [
  { path: "version", expect: "a finite number", test: isFinite, since: 0 },
  { path: "location", expect: "a string", test: isString, since: 0 },
  { path: "player", expect: "an object", test: isRecord, since: 0 },
  { path: "player.name", expect: "a string", test: isString, since: 0 },
  { path: "player.stats", expect: "an object", test: isRecord, since: 0 },
  {
    path: "player.equipment",
    expect: "an object",
    test: isRecord,
    since: 0,
  },
  { path: "flags", expect: "an object", test: isRecord, since: 0 },
  { path: "inventory", expect: "an object", test: isRecord, since: 0 },
  { path: "inventory.stacks", expect: "an array", test: isArray, since: 0 },
  {
    path: "credits",
    expect: "a number that is not negative",
    test: isNonNegative,
    since: 0,
  },
  {
    path: "pendingEncounterId",
    expect: "a string or null",
    test: isNullableString,
    since: 0,
  },
  { path: "rng", expect: "an object", test: isRecord, since: 0 },
  { path: "rng.seed", expect: "a finite number", test: isFinite, since: 0 },
  // Version-gated: each of these arrived with the migration step of the
  // same number, and is required from that version on.
  { path: "player.appearance", expect: "an object", test: isRecord, since: 7 },
  { path: "party", expect: "an object", test: isRecord, since: 8 },
  { path: "party.members", expect: "an array", test: isArray, since: 8 },
  { path: "reputation", expect: "an object", test: isRecord, since: 9 },
  { path: "lore", expect: "an object", test: isRecord, since: 10 },
  { path: "lore.collected", expect: "an array", test: isArray, since: 10 },
  { path: "vendors", expect: "an object", test: isRecord, since: 13 },
  { path: "rules", expect: "an object", test: isRecord, since: 17 },
  {
    path: "rules.difficulty",
    expect: "a string",
    test: isString,
    since: 17,
  },
];

/* ------------------------------------------------------------------ *
 * Checking
 * ------------------------------------------------------------------ */

/** What was actually there, in words a report can print. */
function describeValue(value: unknown): string {
  if (value === undefined) return "nothing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  switch (typeof value) {
    case "object":
      return "an object";
    case "string":
      return "a string";
    case "number":
      return Number.isFinite(value) ? "a number" : `${value}`;
    case "boolean":
      return "a boolean";
    default:
      return typeof value;
  }
}

/**
 * Walks a dotted path. Returns `blocked` when an ancestor is not an
 * object — that ancestor has its own rule and will report on its own,
 * and a second complaint about its children is noise.
 */
function resolve(
  root: unknown,
  path: string,
): { blocked: boolean; value: unknown } {
  const parts = path.split(".");
  let current: unknown = root;
  for (let i = 0; i < parts.length; i += 1) {
    if (!isRecord(current)) return { blocked: true, value: undefined };
    current = current[parts[i]!];
  }
  return { blocked: false, value: current };
}

function joinPath(root: string, path: string): string {
  return root ? `${root}.${path}` : path;
}

/**
 * Checks a value against the state schema. Never throws; a value that
 * is not an object at all is one issue, not a crash.
 */
export function validateGameState(
  value: unknown,
  options: ValidateOptions = {},
): ValidationResult {
  const root = options.root ?? "";
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [
        {
          path: root || "state",
          message: `expected an object, got ${describeValue(value)}`,
        },
      ],
    };
  }

  const declared = value.version;
  const version =
    options.atVersion ?? (typeof declared === "number" ? declared : 0);

  const issues: ValidationIssue[] = [];
  for (const rule of STATE_RULES) {
    if (version < rule.since) continue;
    const found = resolve(value, rule.path);
    if (found.blocked) continue;
    if (rule.test(found.value)) continue;
    issues.push({
      path: joinPath(root, rule.path),
      message: `expected ${rule.expect}, got ${describeValue(found.value)}`,
    });
  }
  return { ok: issues.length === 0, issues };
}

/**
 * Checks the wrapper a slot stores: the version and timestamp beside
 * the state, then the state itself under the `state.` prefix. The
 * optional meta block is not checked here — it is sanitized rather than
 * validated (a nonsense meta block is a slot with no meta block), and a
 * save is not unreadable because somebody's thumbnail rotted.
 */
export function validateSaveEnvelope(value: unknown): ValidationResult {
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [
        { path: "save", message: `expected an object, got ${describeValue(value)}` },
      ],
    };
  }
  const issues: ValidationIssue[] = [];
  if (!isFinite(value.version)) {
    issues.push({
      path: "version",
      message: `expected a finite number, got ${describeValue(value.version)}`,
    });
  }
  if (!isFinite(value.savedAt)) {
    issues.push({
      path: "savedAt",
      message: `expected a finite number, got ${describeValue(value.savedAt)}`,
    });
  }
  const stateVersion = isFinite(value.version)
    ? (value.version as number)
    : undefined;
  const inner = validateGameState(value.state, {
    root: "state",
    atVersion: stateVersion,
  });
  issues.push(...inner.issues);
  return { ok: issues.length === 0, issues };
}

/**
 * Issues as one line, for an error message that has to fit on a card.
 * Caps at three, then says how many were left out — a player reading a
 * broken-save notice needs the first thing that is wrong, not all of
 * them.
 */
export function describeIssues(
  issues: readonly ValidationIssue[],
  limit = 3,
): string {
  if (issues.length === 0) return "";
  const shown = issues
    .slice(0, limit)
    .map((issue) => `${issue.path} (${issue.message})`);
  const hidden = issues.length - shown.length;
  return hidden > 0
    ? `${shown.join("; ")}; and ${hidden} more`
    : shown.join("; ");
}
