import {
  APPEARANCE_FIELDS,
  validateAppearance,
  type Appearance,
} from "../character";
import type { ChapterEnding } from "../data/endings";
import {
  sectionRank,
  threadVariantIds,
  type EpilogueSection,
  type EpilogueThread,
  type EpilogueVignette,
} from "../narrative/epilogue";

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
  /**
   * The most recent finished character's look, seeded into the New
   * Game+ wizard as its initial working appearance. Null until a run
   * finishes (records written before the appearance carry-over, or
   * whose stored look no longer validates, degrade to null too).
   */
  legacyAppearance: Appearance | null;
}

export function emptyMetaProgress(): MetaProgress {
  return {
    endingsSeen: [],
    epiloguesSeen: [],
    completions: 0,
    ngPlusUnlocked: false,
    legacyItemIds: [],
    legacyAppearance: null,
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

/**
 * Coerces a stored value into a valid Appearance or null: every field
 * must be a string its catalog knows. Anything else — records from
 * before the appearance carry-over, or looks referencing retired
 * options — degrades to null, and NG+ falls back to the stock look.
 */
function clampAppearance(value: unknown): Appearance | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const look = {} as Appearance;
  for (const field of APPEARANCE_FIELDS) {
    const id = record[field];
    if (typeof id !== "string") return null;
    look[field] = id;
  }
  return validateAppearance(look).length === 0 ? look : null;
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
    legacyAppearance: clampAppearance(record.legacyAppearance),
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
 * counts, the higher completion count wins, and the legacy loadout and
 * look follow `next` (the more recent record) when it has them.
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
    legacyAppearance: next.legacyAppearance ?? base.legacyAppearance,
  });
}

/** What a finished playthrough contributes to meta-progress. */
export interface CompletionRecord {
  endingId: string;
  /** Epilogue vignette ids shown on this run's epilogue screen. */
  epilogueIds: string[];
  /** Equipped/installed item ids on the finishing character. */
  legacyItemIds: string[];
  /** The finishing character's look, offered to the NG+ wizard. */
  legacyAppearance: Appearance;
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
    legacyAppearance: completion.legacyAppearance,
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

/** One epilogue thread's standing in the codex. */
export interface EpilogueCodexEntry {
  subject: string;
  section: EpilogueSection;
  /** Null until at least one of the thread's variants has been seen. */
  title: string | null;
  /** Spoiler-safe hint, always available. */
  hint: string;
  /** Variants of this thread ever shown, and how many it has. */
  found: number;
  total: number;
}

export interface EpilogueCodexView {
  entries: EpilogueCodexEntry[];
  /** Variants recorded across every thread, and how many exist. */
  found: number;
  total: number;
  /** Threads with at least one variant recorded, and how many exist. */
  threadsFound: number;
  threads: number;
}

/**
 * Derives the epilogue half of the codex: one entry per authored
 * thread, in the epilogue's own running order, counting how many of
 * each thread's variants a player has ever been shown.
 *
 * Counting is derived from the two content tables rather than from a
 * list kept here, so a thread added to src/data/epilogues.ts is counted
 * with no change to this file — which is the whole point, since every
 * new side chain that echoes into the ending adds variants.
 *
 * Nothing here reveals an outcome: a locked thread shows its authored
 * hint and no title, and the vignette paragraphs never leave the
 * epilogue screen. A recorded id whose vignette no longer exists (a
 * retired variant in an old meta record) is ignored rather than
 * inflating a count past its total.
 */
export function deriveEpilogueCodex(
  threads: readonly EpilogueThread[],
  vignettes: readonly EpilogueVignette[],
  meta: MetaProgress,
): EpilogueCodexView {
  const seen = new Set(meta.epiloguesSeen);
  const entries = threads
    .map((thread): EpilogueCodexEntry => {
      const variants = threadVariantIds(thread.subject, vignettes);
      const found = variants.filter((id) => seen.has(id)).length;
      return {
        subject: thread.subject,
        section: thread.section,
        title: found > 0 ? thread.title : null,
        hint: thread.hint,
        found,
        total: variants.length,
      };
    })
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) =>
        sectionRank(a.entry.section) - sectionRank(b.entry.section) ||
        a.index - b.index,
    )
    .map(({ entry }) => entry);
  return {
    entries,
    found: entries.reduce((sum, entry) => sum + entry.found, 0),
    total: entries.reduce((sum, entry) => sum + entry.total, 0),
    threadsFound: entries.filter((entry) => entry.found > 0).length,
    threads: entries.length,
  };
}
