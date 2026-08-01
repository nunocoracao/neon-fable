import {
  clampAssists,
  noAssists,
  type AssistId,
  type AssistState,
} from "../data/assists";
import {
  clampDifficultyId,
  difficultyModifiers,
  type DifficultyId,
  type DifficultyModifiers,
} from "../data/difficulty";

/**
 * What this run is being played under: a difficulty preset, the assist
 * switches, and whether the preset was ever changed after the run
 * started.
 *
 * ## Why it lives on GameState
 *
 * Because a fight has to be resolvable from the run it belongs to. Every
 * seam that reads a modifier — combat setup, the damage math, the
 * rewards, the injury draw — is a pure function over state, and a device
 * preference read out of localStorage halfway down that call chain would
 * make the same save resolve differently on a different machine. So the
 * preferences persist in the settings store (they are what the *next*
 * run starts on, and what New Game+ keeps), and the run carries its own
 * copy of them from the moment it is created.
 *
 * ## Honesty rather than lockouts
 *
 * `difficultyChanged` records that the preset moved mid-run. Nothing
 * reads it as a penalty — there are no achievements to lock and nothing
 * is taken away — it exists so a save can say what it actually is, and
 * so the settings panel can stop pretending a run finished on the
 * preset it started on.
 */
export interface RunRules {
  difficulty: DifficultyId;
  assists: AssistState;
  /** True once the preset was changed after the run began. */
  difficultyChanged: boolean;
}

/** Middle difficulty, every assist off — the documented default. */
export function defaultRules(): RunRules {
  return {
    difficulty: clampDifficultyId(undefined),
    assists: noAssists(),
    difficultyChanged: false,
  };
}

/**
 * Coerces any value into a complete RunRules. An absent record, a
 * retired preset id, and an assist this build no longer has all degrade
 * to the default rather than crashing — the same tolerance the lore and
 * vendor clamps apply, and the reason a pre-difficulty save loads as a
 * run on the authored figures.
 */
export function clampRules(value: unknown): RunRules {
  const record =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  return {
    difficulty: clampDifficultyId(record.difficulty),
    assists: clampAssists(record.assists),
    difficultyChanged: record.difficultyChanged === true,
  };
}

/** The bundle these rules apply at every seam. */
export function rulesModifiers(rules: RunRules): DifficultyModifiers {
  return difficultyModifiers(rules.difficulty);
}

/** Whether one assist is switched on. */
export function assistOn(rules: RunRules, id: AssistId): boolean {
  return rules.assists[id] === true;
}

/**
 * The rules with a different preset on. Picking the preset already in
 * force is not a change and does not mark the run — re-selecting Grind
 * on a Grind run leaves the record exactly as it was.
 */
export function withDifficulty(
  rules: RunRules,
  difficulty: DifficultyId,
): RunRules {
  if (rules.difficulty === difficulty) return rules;
  return { ...rules, difficulty, difficultyChanged: true };
}

/** The rules with one switch flipped. Assists never mark the run. */
export function withAssist(
  rules: RunRules,
  id: AssistId,
  on: boolean,
): RunRules {
  if (rules.assists[id] === on) return rules;
  return { ...rules, assists: { ...rules.assists, [id]: on } };
}

/**
 * The rules a *fresh* run starts on, given what the player last chose.
 * The change flag never carries: a new run has not changed anything
 * yet, however many times the previous one did — which is also what
 * makes New Game+ keep the chosen preset without inheriting its
 * history.
 */
export function startingRules(preferred: {
  difficulty: DifficultyId;
  assists: AssistState;
}): RunRules {
  return {
    difficulty: clampDifficultyId(preferred.difficulty),
    assists: clampAssists(preferred.assists),
    difficultyChanged: false,
  };
}
