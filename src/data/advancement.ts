/**
 * Advancement content: how chapter completions convert into advancement
 * points and what raising a stat costs. The spending rules live in
 * src/character/advancement.ts; the ability pool lives with the other
 * ability content in src/data/abilities.ts. Earned points are always
 * derived from the chapter flags below — never stored — so saves made
 * before a grant existed still receive it.
 */
export interface ChapterGrant {
  /** Flag the chapter's endings set when the chapter completes. */
  flag: string;
  /** Points the completed chapter awards (once — the flag is a boolean). */
  points: number;
  /** Label shown on the advancement screen. */
  label: string;
}

export const chapterGrants: ChapterGrant[] = [
  { flag: "act1-complete", points: 3, label: "Chapter 1 — The Undertow" },
  { flag: "act2-complete", points: 3, label: "Chapter 2 — The Cordon" },
];

/** Advancement points one +1 stat raise costs. */
export const STAT_RAISE_COST = 2;
