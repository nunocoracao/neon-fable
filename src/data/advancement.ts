/**
 * Advancement content, in two currencies.
 *
 * Points are what a chapter teaches you: they come from the chapter
 * flags below and buy stat raises and abilities (spending rules in
 * src/character/advancement.ts; the ability pool lives with the other
 * ability content in src/data/abilities.ts). Street cred is what the
 * city noticed: it comes from deeds and won fights, and at the
 * milestones below it grants a perk pick (src/character/cred.ts).
 *
 * Both are always derived from flags — never stored — so saves made
 * before a grant existed still receive it, and no flag can pay twice.
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

/**
 * Street cred: the other half of advancement, and the one the city
 * keeps rather than the character.
 *
 * Points buy the things a runner decides about themself — a stat, an
 * ability. Cred is what the Sprawl has decided about *them*, and it is
 * earned the way a reputation actually is: by finishing chapters and by
 * walking away from fights. At the thresholds below the street stops
 * merely knowing you and starts expecting something, and the run picks
 * a perk (src/data/perks.ts).
 *
 * Derived from flags every time, exactly like earnedPoints — never
 * stored, never counted twice, and retroactive for a save made before a
 * deed was worth anything. Only the picks themselves persist.
 */
export interface CredDeed {
  /** Flag the deed sets. */
  flag: string;
  /** Value it must hold; `true` for the ordinary boolean deed. */
  value?: boolean | number | string;
  /** Cred the deed is worth (once — a flag is not a counter). */
  cred: number;
  /** Label shown on the advancement screen. */
  label: string;
}

/**
 * The authored deeds. Chapter completions are the backbone, and they
 * deliberately read the same flags the point grants do — finishing a
 * chapter is both the biggest thing you have learned and the loudest
 * thing you have done.
 */
export const credDeeds: CredDeed[] = [
  { flag: "act1-complete", cred: 5, label: "Chapter 1 — The Undertow" },
  { flag: "act2-complete", cred: 5, label: "Chapter 2 — The Cordon" },
  { flag: "act3-complete", cred: 5, label: "Chapter 3 — The Succession" },
];

/**
 * Prefix of the flags a finished fight writes (see combatResultFlag in
 * src/combat/outcome.ts), and the value a won one holds. Named here so
 * the cred derivation can count victories without the content layer
 * depending on the combat engine; advancement.test.ts pins the two
 * against each other.
 */
export const VICTORY_FLAG_PREFIX = "combat:";
export const VICTORY_FLAG_VALUE = "victory";

/** Cred one won fight is worth. Fled and lost fights are worth nothing. */
export const CRED_PER_VICTORY = 2;

/**
 * A point at which the street asks something of you. Ordered by `cred`
 * ascending; a milestone is reached — permanently — the moment the
 * derived total clears its threshold.
 */
export interface CredMilestone {
  id: string;
  /** Street cred this milestone wants. */
  cred: number;
  /** What the city is calling you now. */
  label: string;
  /** One line, shown on the pick overlay above the choices. */
  blurb: string;
}

export const credMilestones: CredMilestone[] = [
  {
    id: "cred-known",
    cred: 5,
    label: "Known",
    blurb:
      "Somebody described you to somebody else and got it roughly right. " +
      "Pick what they got right.",
  },
  {
    id: "cred-counted",
    cred: 12,
    label: "Counted",
    blurb:
      "The people who keep lists have put you on one. Decide what your " +
      "entry says.",
  },
  {
    id: "cred-named",
    cred: 20,
    label: "Named",
    blurb:
      "Doors open before you reach them, and a few close early. That is " +
      "a name doing its work.",
  },
  {
    id: "cred-notorious",
    cred: 30,
    label: "Notorious",
    blurb:
      "The Sprawl has stopped asking who you are. It asks what you are " +
      "going to do.",
  },
];
