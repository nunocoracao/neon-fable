import {
  PLAYTHROUGHS,
  type Playthrough,
} from "../../data/story/walkthroughRoutes";
import {
  findRouteSeed,
  type RouteCreditEvent,
  type RouteStep,
} from "../../data/story/walkthroughSupport";
import { STARTING_CREDITS } from "../../state/gameState";
import { classifyEvent } from "./classify";
import { foldEvents, type Ledger } from "./ledger";
import {
  ECONOMY_PROFILES,
  type EconomyProfile,
  type EconomyProfileId,
} from "./profiles";

/**
 * The economy sweep: every canonical playthrough, played on every
 * profile, folded into a ledger.
 *
 * The run is the real one. `findRouteSeed` drives the shipped narrative
 * engine and the shipped combat engine over the same scripts the
 * walkthrough tests use, the shopping goes across the shipped counter,
 * and the credits are whatever those functions charged. Nothing here
 * models a payout; it only writes down the ones that happened.
 *
 * Reproducibility is inherited: the routes are fixed scripts and the
 * seed is the first one whose fights all go the player's way, scanned
 * upwards from 1. So the same build produces the same ledger on every
 * machine, and a data edit that moves a number moves it visibly.
 */

/**
 * Where a profile's shopping happens: the break after each chapter,
 * found by the arc the next segment belongs to. Chapter breaks are a
 * property of the route, not of the profile, so both profiles shop at
 * the same moments and their ledgers are comparable line for line.
 */
const CHAPTER_ARCS: ReadonlyArray<[arcId: string, chapter: number]> = [
  ["act2", 1],
  ["act3", 2],
];

/**
 * A step that only wants a thing — the ones a run is allowed to fail to
 * afford. Selling the bag and walking into a clinic are not wishes.
 */
function isWish(label: string): boolean {
  return ["buy", "stock", "dye", "restyle", "bench"].some((prefix) =>
    label.startsWith(prefix),
  );
}

/** What one chapter break was worth to a profile. */
export interface ChapterBreak {
  chapter: number;
  /** Credits held when the shopping was done. */
  credits: number;
}

interface Spliced {
  steps: RouteStep[];
  /** Labels of every wish the profile made, in order. */
  wishes: string[];
  /** Filled in as the route runs. */
  breaks: ChapterBreak[];
}

/**
 * Splices a profile's interludes into a route at the chapter breaks,
 * with a marker after each one that records what the run was left
 * holding. A route that never reaches an arc simply never gets that
 * interlude — which cannot happen for the canonical four, and is the
 * harmless reading for anything else.
 */
export function withInterludes(
  steps: readonly RouteStep[],
  profile: EconomyProfile,
): Spliced {
  const out: RouteStep[] = [];
  const wishes: string[] = [];
  const breaks: ChapterBreak[] = [];
  const spent = new Set<number>();
  for (const step of steps) {
    if (step.kind === "arc") {
      for (const [arcId, chapter] of CHAPTER_ARCS) {
        if (step.arc.id !== arcId || spent.has(chapter)) continue;
        spent.add(chapter);
        // Labels are stamped with the chapter so the same wish made at
        // two breaks is two wishes: buying the gun in chapter 2 does not
        // count as having bought it in chapter 3.
        const interlude = profile.interlude(chapter).map((entry) =>
          entry.kind === "do"
            ? { ...entry, label: `${entry.label ?? "step"} @${chapter}` }
            : entry,
        );
        for (const entry of interlude) {
          if (entry.kind === "do" && entry.label && isWish(entry.label)) {
            wishes.push(entry.label);
          }
        }
        out.push(...interlude, {
          kind: "do",
          label: `break after chapter ${chapter}`,
          run(state) {
            breaks.push({ chapter, credits: state.credits });
            return state;
          },
        });
      }
    }
    out.push(step);
  }
  return { steps: out, wishes, breaks };
}

/** One (playthrough, profile) cell of the sweep. */
export interface EconomyCell {
  playthroughId: string;
  backgroundId: string;
  profileId: EconomyProfileId;
  ledger: Ledger;
  /** Ending the run landed on — proof the route still finishes. */
  endings: readonly string[];
  /** Credits held at the epilogue. */
  finalCredits: number;
  /** What the run was holding when each chapter's shopping was done. */
  breaks: readonly ChapterBreak[];
  /** Wishes the profile made and could not pay for. */
  unmetWishes: readonly string[];
}

/** Plays one cell and folds its ledger. */
export function runEconomyCell(
  playthrough: Playthrough,
  profile: EconomyProfile,
): EconomyCell {
  const events: RouteCreditEvent[] = [];
  const spliced = withInterludes(playthrough.steps, profile);
  const { state, endings } = findRouteSeed(playthrough.makeState, spliced.steps, 400, {
    onCredits: (event) => events.push(event),
  });
  // A wish that moved no credits was a wish nobody could pay: every
  // purchase step charges, and a step that charged is in the ledger
  // under its own label.
  const paid = new Set(events.map((event) => event.detail));
  return {
    playthroughId: playthrough.id,
    backgroundId: playthrough.backgroundId,
    profileId: profile.id,
    ledger: foldEvents(STARTING_CREDITS, events, classifyEvent),
    endings,
    finalCredits: state.credits,
    // The markers fire on every abandoned seed as well as the one that
    // finished, and the one that finished is always last — so the final
    // reading for each chapter is the run that actually happened.
    breaks: CHAPTER_ARCS.flatMap(([, chapter]) => {
      const last = [...spliced.breaks]
        .reverse()
        .find((entry) => entry.chapter === chapter);
      return last ? [last] : [];
    }),
    unmetWishes: spliced.wishes.filter((label) => !paid.has(label)),
  };
}

/** Every playthrough on every profile. */
export function runEconomySweep(
  playthroughs: readonly Playthrough[] = PLAYTHROUGHS,
  profiles: readonly EconomyProfile[] = ECONOMY_PROFILES,
): EconomyCell[] {
  const cells: EconomyCell[] = [];
  for (const playthrough of playthroughs) {
    for (const profile of profiles) {
      cells.push(runEconomyCell(playthrough, profile));
    }
  }
  return cells;
}

/** The cells for one profile, keyed by playthrough. */
export function cellsFor(
  cells: readonly EconomyCell[],
  profileId: EconomyProfileId,
): EconomyCell[] {
  return cells.filter((cell) => cell.profileId === profileId);
}
