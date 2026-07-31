import type { GameState } from "../state/gameState";
import { checkRequirements } from "./requirements";
import type { Requirement } from "./types";

/**
 * Epilogue vignettes: short outcome paragraphs shown after a final ending
 * — what became of each faction and ally given this playthrough. Content
 * lives in src/data/epilogues.ts; this module is the pure selection
 * logic the epilogue screen renders from.
 */
export interface EpilogueVignette {
  id: string;
  /**
   * Subject slot (e.g. "undercroft", "voss"). Exactly one vignette per
   * subject is selected; a subject with no matching vignette is omitted.
   * Every subject must also be declared as a thread (see EpilogueThread)
   * — that is what gives it a place in the running order and a codex
   * entry, and a test fails on a subject that has neither.
   */
  subject: string;
  /** Short heading shown over the vignette. */
  title: string;
  text: string;
  /** All must pass against the finished state; omit for a fallback. */
  requires?: Requirement[];
}

/**
 * The running order of a finished epilogue, outermost fact last: what
 * the run did to the runner, then the work they took on, then the
 * people it put beside them, then who actually travelled with them,
 * then the three powers' ledgers, and the city itself for a closer.
 *
 * Sections are the only ordering an epilogue has. Within one, authored
 * order stands — so a thread is placed once, in its section, and never
 * has to be threaded past somebody else's content again.
 */
export const EPILOGUE_SECTIONS = [
  "personal",
  "chains",
  "allies",
  "companions",
  "factions",
  "city",
] as const;

export type EpilogueSection = (typeof EPILOGUE_SECTIONS)[number];

/**
 * A subject's registration: where it sits in the running order, the
 * heading its variants share, and the spoiler-safe line the codex shows
 * while none of them has been seen.
 *
 * One entry per subject, and the table is the single place a new thread
 * has to be added — composition order, codex grouping, and codex
 * counting all read it.
 */
export interface EpilogueThread {
  subject: string;
  section: EpilogueSection;
  /** Heading for the thread as a whole (its variants' shared title). */
  title: string;
  /**
   * Codex hint, shown while the thread is undiscovered. Must name the
   * kind of thing that could happen, never which way it went — locked
   * entries are read by players who have not seen any of it.
   */
  hint: string;
}

const SECTION_RANK: ReadonlyMap<string, number> = new Map(
  EPILOGUE_SECTIONS.map((section, index) => [section, index]),
);

/**
 * Where a section sorts. An unknown section — content from a build this
 * one does not have — sorts after every known one rather than throwing,
 * so a stale entry lands at the end of the epilogue instead of losing
 * the whole screen.
 */
export function sectionRank(section: string): number {
  return SECTION_RANK.get(section) ?? EPILOGUE_SECTIONS.length;
}

/** Threads by subject, for the joins below. */
export function threadIndex(
  threads: readonly EpilogueThread[],
): ReadonlyMap<string, EpilogueThread> {
  return new Map(threads.map((thread) => [thread.subject, thread]));
}

/**
 * Picks at most one vignette per subject: the first in authored order
 * whose requirements pass. Result order follows the authored list, so
 * content controls both variant priority and render order.
 */
export function selectVignettes(
  state: GameState,
  vignettes: readonly EpilogueVignette[],
): EpilogueVignette[] {
  const covered = new Set<string>();
  const selected: EpilogueVignette[] = [];
  for (const vignette of vignettes) {
    if (covered.has(vignette.subject)) continue;
    if (!checkRequirements(state, vignette.requires)) continue;
    covered.add(vignette.subject);
    selected.push(vignette);
  }
  return selected;
}

/**
 * The finished epilogue: the selected variants, in section order.
 *
 * Everything a run never touched is simply missing — a subject with no
 * matching variant was already omitted by selectVignettes, so a skipped
 * thread leaves no gap and no seam. A subject with no declared thread
 * keeps its authored position at the end (a test catches it in
 * content); it is never dropped, because a paragraph the player earned
 * is worth more than a tidy order.
 */
export function composeEpilogue(
  state: GameState,
  vignettes: readonly EpilogueVignette[],
  threads: readonly EpilogueThread[],
): EpilogueVignette[] {
  const bySubject = threadIndex(threads);
  return selectVignettes(state, vignettes)
    .map((vignette, index) => ({
      vignette,
      index,
      rank: sectionRank(bySubject.get(vignette.subject)?.section ?? ""),
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.vignette);
}

/** Every authored variant id of one thread, in authored order. */
export function threadVariantIds(
  subject: string,
  vignettes: readonly EpilogueVignette[],
): string[] {
  return vignettes
    .filter((vignette) => vignette.subject === subject)
    .map((vignette) => vignette.id);
}
