import { act1Arc } from "./act1";
import { breachArc } from "./breach";
import { marketArc } from "./market";
import { quaysArc } from "./quays";
import {
  act3CourtToFreehold,
  act3LoneToGhost,
  act3VossToRegency,
  routeCourtToSeverance,
  routeLoneToSeveranceHex,
  routeVossToTakeover,
} from "./walkthroughRoutes";
import {
  afterSegmentWith,
  breachStep,
  chromeStep,
  clinicStep,
  crossingStep,
  dressedStep,
  injuriesCarried,
  saveLoadStep,
  type TraceProfile,
} from "./traceSupport";
import { healStep, type RouteStep } from "./walkthroughSupport";

/**
 * Three whole runs, each played by a different kind of player on a
 * different preset, kept as regression armour.
 *
 * They are not three more endings — the act3 walkthroughs already cover
 * the four roads. They are three *profiles*: a difficulty carried from
 * character creation to epilogue, districts explored or skipped,
 * terminals dived, crossings walked, chrome stacked until it screams.
 * Between them they put every system this game grew in v2 through the
 * same run at the same time, which is the only place their seams are
 * actually visible.
 *
 * | trace | who | preset | what it is for |
 * |---|---|---|---|
 * | `corpo-rush` | tower analyst | Blackout | the road, nothing optional, on the hardest city |
 * | `net-explorer` | grid diver | Grind | both side chains, three terminals, one crossing |
 * | `street-chrome` | gutter courier | Drift | chrome to screaming, and the crown fought |
 *
 * Each carries three mid-run save/load checkpoints, placed at the seams
 * a player would actually stop at, and each one *continues from the
 * reloaded state* (see saveLoadStep) — so roughly two thirds of every
 * trace is being played on a save file rather than on the state the
 * engine built.
 */

/* ------------------------------------------------------------------ *
 * 1. The corpo rush, on Blackout
 * ------------------------------------------------------------------ */

/**
 * Nothing optional: the tower's road from the intro to the regency,
 * played on the preset where everything hits harder, stands longer and
 * marks you for it.
 *
 * This is the trace that owns injuries, because Blackout is where they
 * actually happen — see the note in .watchfire/memory.md. The clinic
 * steps at the chapter breaks are what a player does about them, and
 * the acceptance predicate insists the run really was marked, so a
 * change that quietly stops fights leaving anything behind fails here.
 */
export const corpoRushTrace: TraceProfile = {
  id: "corpo-rush",
  blurb:
    "A tower analyst who signs with Voss and takes the shortest road " +
    "there is, on the hardest night the city does.",
  build: {
    backgroundId: "tower-analyst",
    allocate(stats) {
      stats.body += 5;
      stats.reflexes += 6;
      stats.cool += 4;
    },
    difficulty: "blackout",
  },
  script: (log) => {
    const opening = afterSegmentWith(
      [...routeVossToTakeover, ...act3VossToRegency],
      // The Act 1 finale: the ledger sold, the deal signed.
      "sign",
      saveLoadStep("act 1 done", log),
      clinicStep(log),
    );
    const midGame = afterSegmentWith(
      opening,
      // The uplink: Voss holds the ring and Chapter 2 is over.
      "uplink",
      saveLoadStep("act 2 done", log),
      clinicStep(log),
      healStep(),
    );
    return afterSegmentWith(
      midGame,
      // Up out of the Registry's terminal, one scene short of the crown.
      "audit",
      saveLoadStep("at the spire", log),
      clinicStep(log),
    );
  },
  endingId: "ending-regency",
  // A Blackout night that left nobody carrying anything is not the
  // night this trace is about — try the next seed. Roughly two in
  // three qualify, so the scan stays short.
  accept: (_result, beats) => injuriesCarried(beats).length > 0,
};

/* ------------------------------------------------------------------ *
 * 2. The thorough netrunner, on Grind
 * ------------------------------------------------------------------ */

/**
 * The Vertical Market's chain, taken the way a diver takes it: the lead
 * pulled off the crate's own consignment tag rather than out of a face,
 * the crew on the stair gone through, and the case's contents filed as
 * an assessment instead of delivered.
 *
 * The catwalk (`lm-slip`) is deliberately not on this road — it is the
 * optics' reward, and this diver put the points into Tech rather than
 * the eye socket, so the sixth level still has to be climbed the loud
 * way. That fight is the only one in either district chain.
 */
const lastMileByTrace: RouteStep = {
  kind: "arc",
  arc: marketArc,
  entry: "vm-fixer",
  choices: [
    "the-job",
    "lm-who-wants-it",
    "lm-parties-back",
    "lm-take-job",
    "lm-trace", // Tech 7: the diver's road onto the chain
    "lm-lead-go",
    "lm-fight",
    "lm-pell-look",
    "lm-expose",
    "lm-exposed-done",
  ],
};

/** What the register's cut order opened, emptied. */
const marketLockerCut: RouteStep = {
  kind: "arc",
  arc: breachArc,
  entry: "bz-market-locker",
  choices: ["cut-take", "cut-done"],
};

/** What the lockgate hoists lifted, taken off the chain. */
const quaysCageWinched: RouteStep = {
  kind: "arc",
  arc: breachArc,
  entry: "bz-quays-cage",
  choices: ["winch-take", "winch-done"],
};

/**
 * The Flooded Quays' chain, up to the point where the basin itself is
 * the obstacle: the diver's terms taken, the crossing left to be
 * walked rather than talked past.
 */
const underWaterlineToCrossing: RouteStep = {
  kind: "arc",
  arc: quaysArc,
  entry: "fq-diver",
  choices: [
    "the-store",
    "uw-ask-what",
    "uw-squeeze-back",
    "uw-help", // the chain reaches "taken" — which is what posts the watch
    "uw-taken-hold", // and then walk, rather than take a road in
  ],
};

/** The far side of the crossing: in through the open door, and the book. */
const underWaterlineFromQuiet: RouteStep = {
  kind: "arc",
  arc: quaysArc,
  entry: "uw-quiet",
  choices: ["quiet-in", "uw-break", "uw-broken-done"],
};

/**
 * Everything the districts hold, on the authored preset: both side
 * chains, both district terminals, and the one watched crossing in the
 * game — walked, not fought.
 *
 * The order is a player's: the market first (it is up the stair from
 * the plaza), then the quays, and the quays' terminal before the
 * crossing because the lockgate cabinet is on the strand you land on.
 */
export const netExplorerTrace: TraceProfile = {
  id: "net-explorer",
  blurb:
    "A grid diver who owes nobody, reads every terminal, walks the " +
    "crossing nobody sees, and hands the parish to the ghost.",
  build: {
    backgroundId: "grid-diver",
    allocate(stats) {
      stats.body += 5;
      stats.reflexes += 5;
      stats.tech += 4; // 3 + 4 + the diver's +2 = 9: clears the commune gate
      stats.intelligence += 1;
    },
    difficulty: "grind",
  },
  script: (log) => {
    const districts: RouteStep[] = [
      // The market: the register read, the hasp it released walked up
      // to and emptied, then the fixer's chain.
      breachStep("market-register", log),
      dressedStep("vertical-market", "market-consignment", "bz-market-locker"),
      marketLockerCut,
      lastMileByTrace,
      saveLoadStep("both districts", log),
      // The quays: the lockgate read, the cage it lifted taken, the
      // diver's terms accepted, the crossing walked, and the store
      // entered from the quiet side.
      breachStep("quays-lockgate", log),
      dressedStep("flooded-quays", "quays-cage", "bz-quays-cage"),
      quaysCageWinched,
      underWaterlineToCrossing,
      crossingStep("store-crossing", log),
      underWaterlineFromQuiet,
      healStep(),
    ];
    const withDistricts = afterSegmentWith(
      [...routeLoneToSeveranceHex, ...act3LoneToGhost],
      // Act 1's finale: the Crown sent raw, the diver gone.
      "vanish",
      ...districts,
    );
    const midGame = afterSegmentWith(
      withDistricts,
      // Out of the Exchange's vault, on the ventworks map its own
      // terminal stands on.
      "vault",
      breachStep("vent-archive", log),
      saveLoadStep("act 2 done", log),
    );
    return afterSegmentWith(
      midGame,
      // Hex reaches the concourse first; the crown is the next scene.
      "wire",
      saveLoadStep("at the spire", log),
    );
  },
  endingId: "ending-ghost",
};

/* ------------------------------------------------------------------ *
 * 3. The chromed courier, on Drift
 * ------------------------------------------------------------------ */

/**
 * What the courier walks in carrying: optics and arms, 6 of a frame's 8
 * points of capacity, and 7 points of noise — **loud**, which is the
 * band Patch's den reads off you.
 *
 * The last two points are the Court route's own silt gills, bought at
 * that same counter. They take the frame to full and the noise to 9,
 * which is **screaming**, and it is screaming for the whole rest of the
 * game: the escalation is authored by the road rather than arranged
 * here.
 */
export const CHROME_KIT = [
  "cyb-warden-optics", // eyes, 3 load, 4 static
  "cyb-myomer-arms", // arms, 3 load, 3 static
] as const;

/**
 * Patch's den, played by somebody the clinician can hear from the door:
 * the same shop visit the Court route makes, plus the two beats only a
 * visibly chromed runner is offered.
 */
const denAsAChromedRunner: RouteStep = {
  kind: "arc",
  arc: act1Arc,
  entry: "a1-start",
  choices: [
    "follow",
    "about-spike",
    "on-to-business",
    "descend",
    "to-den",
    "knock",
    "back",
    "browse",
    "buy-gills",
    "ask-static",
    "static-mine", // static >= loud: Patch reads the noise off you
    "read-refuse", // "I like being audible."
    "leave",
  ],
};

/**
 * A courier who spent everything on hardware, on the kindest preset.
 *
 * What it is for: the top Static band, end to end. The chrome goes in
 * before Act 1's clinic so the band is loud enough to open the
 * chrome-affinity door there, and stays in through the Crown Ring —
 * which is a boss fight, on a build carrying a surge that goes off once
 * a fight. Drift is the other half of the point: the same road, on the
 * preset that takes the edge off, finishes every fight a long way above
 * the line that marks anybody (see the memory note).
 */
export const streetChromeTrace: TraceProfile = {
  id: "street-chrome",
  blurb:
    "A gutter courier carrying more chrome than frame, keeping the " +
    "Court's oath on the kindest night the city does.",
  build: {
    backgroundId: "gutter-courier",
    allocate(stats) {
      // Body and Cool are what carry implants (neuralCapacity), so this
      // is the only shape of courier with room for the whole kit.
      stats.body += 5;
      stats.cool += 5;
      stats.tech += 3;
      stats.reflexes += 2;
    },
    difficulty: "drift",
  },
  script: (log) => {
    // The Court opening, with the den replayed by a screaming runner.
    const court = routeCourtToSeverance.map((step) =>
      step.kind === "arc" && step.choices.includes("buy-gills")
        ? denAsAChromedRunner
        : step,
    );
    const opening = afterSegmentWith(
      [chromeStep([...CHROME_KIT]), ...court, ...act3CourtToFreehold],
      // The Act 1 finale: the inner key taken, the Undertow stopped.
      "rest",
      saveLoadStep("act 1 done", log),
      clinicStep(log),
    );
    const midGame = afterSegmentWith(
      opening,
      // The spool thrown: the Cordon is down and Chapter 2 is over.
      "throw",
      saveLoadStep("act 2 done", log),
      clinicStep(log),
    );
    return afterSegmentWith(
      midGame,
      // Through the Registry Gate the loud way, one scene short of the
      // crown.
      "in",
      saveLoadStep("at the spire", log),
      healStep(),
    );
  },
  endingId: "ending-freehold",
};

export const TRACE_PROFILES: readonly TraceProfile[] = [
  corpoRushTrace,
  netExplorerTrace,
  streetChromeTrace,
];
