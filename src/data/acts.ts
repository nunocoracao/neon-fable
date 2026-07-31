import type { FlagMap } from "../state/flags";

/**
 * Which chapter the run is in.
 *
 * The story has always recorded this — each act's endings set their own
 * `actN-complete` flag — but nothing outside the story could ask the
 * question without hard-coding those flag names. This is the one place
 * they are read, so a system that turns over per chapter (vendor stock,
 * a counter's memory of an argument) keys on an act rather than on a
 * beat.
 *
 * Content, and deliberately tiny. The advancement grants read the same
 * flags for their own purpose (src/data/advancement.ts); acts.test.ts
 * pins the two lists together so a renamed chapter flag cannot move one
 * without the other.
 */
export interface Act {
  /** 1-based chapter number. */
  act: number;
  title: string;
  /** Flag this chapter's endings set when it completes. */
  completeFlag: string;
}

export const ACTS: readonly Act[] = [
  { act: 1, title: "The Undertow", completeFlag: "act1-complete" },
  { act: 2, title: "The Cordon", completeFlag: "act2-complete" },
  { act: 3, title: "The Succession", completeFlag: "act3-complete" },
];

export const FIRST_ACT = 1;

/** The last chapter there is; a finished run stays in it. */
export const FINAL_ACT = ACTS.length;

/**
 * The act a run is in: one past the last chapter it finished, and never
 * past the last chapter there is. A finished game therefore reads as
 * Act 3 rather than as a fourth act nobody wrote.
 */
export function currentAct(flags: FlagMap): number {
  let act = FIRST_ACT;
  for (const entry of ACTS) {
    if (Boolean(flags[entry.completeFlag])) {
      act = Math.min(FINAL_ACT, entry.act + 1);
    }
  }
  return act;
}

/** The chapter record for an act number, for screens that name it. */
export function actTitle(act: number): string {
  return ACTS.find((entry) => entry.act === act)?.title ?? `Act ${act}`;
}
