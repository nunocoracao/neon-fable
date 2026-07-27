import type { ChapterEnding } from "../data/endings";

/**
 * Cross-playthrough meta-progress: which endings and epilogue vignettes
 * the player has ever reached, how many runs they finished, and the New
 * Game+ unlock. Persisted to localStorage separately from save slots
 * (it outlives any one run) and from device settings. Pure functions
 * over a plain object; storage is injectable so tests use an in-memory
 * fake, and nothing here writes storage except the explicit save/record
 * calls.
 */

export const META_PROGRESS_KEY = "neon-fable:meta";

/** Bump when the MetaProgress shape changes; migrateMetaProgress routes on it. */
export const META_PROGRESS_VERSION = 1;

export interface MetaProgress {
  /** Final ending ids ever reached, in discovery order, deduplicated. */
  endingsSeen: string[];
  /** Epilogue vignette ids ever shown, in discovery order, deduplicated. */
  epiloguesSeen: string[];
  /** Completed playthroughs. */
  completions: number;
  /** True once any playthrough has been completed. */
  ngPlusUnlocked: boolean;
  /**
   * Carry-over candidates from the most recent finished character: the
   * item ids it had equipped or installed. New Game+ offers one of these.
   */
  legacyItemIds: string[];
}

export function emptyMetaProgress(): MetaProgress {
  return {
    endingsSeen: [],
    epiloguesSeen: [],
    completions: 0,
    ngPlusUnlocked: false,
    legacyItemIds: [],
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry === "string" && entry.length > 0) seen.add(entry);
  }
  return [...seen];
}

/** Coerces any value into a valid MetaProgress, field by field. */
export function clampMetaProgress(value: unknown): MetaProgress {
  if (typeof value !== "object" || value === null) return emptyMetaProgress();
  const record = value as Record<string, unknown>;
  const completions =
    typeof record.completions === "number" &&
    Number.isInteger(record.completions) &&
    record.completions > 0
      ? record.completions
      : 0;
  return {
    endingsSeen: stringList(record.endingsSeen),
    epiloguesSeen: stringList(record.epiloguesSeen),
    completions,
    // A finished run always unlocks NG+, even if the flag was lost.
    ngPlusUnlocked: record.ngPlusUnlocked === true || completions > 0,
    legacyItemIds: stringList(record.legacyItemIds),
  };
}

/**
 * Migrates a parsed payload from any stored version to the current
 * shape. There is only v1 so far, so every version routes through the
 * field-tolerant clamp — unknown or future versions degrade to defaults
 * per field instead of crashing.
 */
export function migrateMetaProgress(parsed: unknown): MetaProgress {
  return clampMetaProgress(parsed);
}

export function serializeMetaProgress(meta: MetaProgress): string {
  const clamped = clampMetaProgress(meta);
  return JSON.stringify({ version: META_PROGRESS_VERSION, ...clamped });
}

/** Tolerant parse: anything malformed falls back to an empty record. */
export function parseMetaProgress(raw: string | null): MetaProgress {
  if (raw === null) return emptyMetaProgress();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyMetaProgress();
  }
  return migrateMetaProgress(parsed);
}

/**
 * Unions two records: every ending or vignette either side has seen
 * counts, the higher completion count wins, and the legacy loadout
 * follows `next` (the more recent record) when it has one.
 */
export function mergeMetaProgress(
  base: MetaProgress,
  next: MetaProgress,
): MetaProgress {
  return clampMetaProgress({
    endingsSeen: [...base.endingsSeen, ...next.endingsSeen],
    epiloguesSeen: [...base.epiloguesSeen, ...next.epiloguesSeen],
    completions: Math.max(base.completions, next.completions),
    ngPlusUnlocked: base.ngPlusUnlocked || next.ngPlusUnlocked,
    legacyItemIds:
      next.legacyItemIds.length > 0 ? next.legacyItemIds : base.legacyItemIds,
  });
}

/** What a finished playthrough contributes to meta-progress. */
export interface CompletionRecord {
  endingId: string;
  /** Epilogue vignette ids shown on this run's epilogue screen. */
  epilogueIds: string[];
  /** Equipped/installed item ids on the finishing character. */
  legacyItemIds: string[];
}

/** Folds one finished playthrough into a meta-progress record. Pure. */
export function recordCompletion(
  meta: MetaProgress,
  completion: CompletionRecord,
): MetaProgress {
  return clampMetaProgress({
    endingsSeen: [...meta.endingsSeen, completion.endingId],
    epiloguesSeen: [...meta.epiloguesSeen, ...completion.epilogueIds],
    completions: meta.completions + 1,
    ngPlusUnlocked: true,
    legacyItemIds: completion.legacyItemIds,
  });
}

// --- Persistence -------------------------------------------------------

/** Minimal storage surface; window.localStorage satisfies it. */
export interface MetaStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadMetaProgress(storage: MetaStorage | null): MetaProgress {
  if (!storage) return emptyMetaProgress();
  try {
    return parseMetaProgress(storage.getItem(META_PROGRESS_KEY));
  } catch {
    return emptyMetaProgress();
  }
}

export function saveMetaProgress(
  meta: MetaProgress,
  storage: MetaStorage | null,
): void {
  if (!storage) return;
  try {
    storage.setItem(META_PROGRESS_KEY, serializeMetaProgress(meta));
  } catch {
    // Quota or privacy-mode failures lose the codex, never the game.
  }
}

/**
 * The one write path for finishing a run: merges the completion into
 * whatever is currently stored and persists it. Callers (the UI layer,
 * at the moment the epilogue is first shown) must invoke this
 * explicitly — nothing records meta-progress as a side effect.
 */
export function recordCompletionToStorage(
  completion: CompletionRecord,
  storage: MetaStorage | null,
): MetaProgress {
  const meta = recordCompletion(loadMetaProgress(storage), completion);
  saveMetaProgress(meta, storage);
  return meta;
}

// --- Codex derivation --------------------------------------------------

export interface CodexEntry {
  id: string;
  discovered: boolean;
  /** Null while locked — the title itself is a spoiler. */
  title: string | null;
  /** Null while locked; the authored short summary once discovered. */
  summary: string | null;
  /** Spoiler-safe hint, always available. */
  hint: string;
}

export interface CodexView {
  entries: CodexEntry[];
  found: number;
  total: number;
}

/**
 * Derives the endings-codex view: one entry per final ending, locked
 * entries exposing only the authored hint. Never surfaces epilogue
 * paragraphs — the codex reads titles, summaries, and hints only.
 */
export function deriveCodex(
  endings: readonly ChapterEnding[],
  meta: MetaProgress,
): CodexView {
  const finals = endings.filter((ending) => ending.final === true);
  const seen = new Set(meta.endingsSeen);
  const entries = finals.map((ending): CodexEntry => {
    const discovered = seen.has(ending.id);
    return {
      id: ending.id,
      discovered,
      title: discovered ? ending.title : null,
      summary: discovered ? (ending.summary ?? null) : null,
      hint: ending.hint ?? "A path not yet taken.",
    };
  });
  return {
    entries,
    found: entries.filter((entry) => entry.discovered).length,
    total: entries.length,
  };
}
