import type { GameState } from "../../state";
import { act1Arc } from "./act1";
import { act2Arc } from "./act2";
import { act3Arc } from "./act3";
import { introArc } from "./intro";
import {
  advanceStep,
  equipStep,
  healStep,
  installStep,
  makeState,
  type RouteStep,
} from "./walkthroughSupport";

/**
 * Canonical full-game routes shared by the per-act walkthrough tests:
 * each drives character creation through the intro, an Act 1 outcome,
 * and an Act 2 outcome, leaving a real recorded state the next act's
 * tests build on. Kept beside walkthroughSupport (no vitest imports)
 * so act2 and act3 walkthroughs replay identical histories instead of
 * drifting apart.
 *
 * The four `PLAYTHROUGHS` at the foot of the file carry the same routes
 * all the way through the finale, so a harness that needs a whole run —
 * the economy ledger sweep in src/economy/sim, and the act3 walkthrough
 * test itself — replays one script rather than its own copy of one.
 */

/** Intro played to a delivered spike (fighting the scout). */
export const introDeliveredFighting: RouteStep = {
  kind: "arc",
  arc: introArc,
  entry: "start",
  choices: [
    "agree-terms",
    "walk-on",
    "street-nod",
    "sit-agreed",
    "take-advance",
    "take-job",
    "jump-scout",
    "back-to-bar",
    "hand-over",
  ],
};

/** Act 1 court route: street kid, culvert entry, inner-key climax. */
export const act1CourtRoute: RouteStep[] = [
  introDeliveredFighting,
  {
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
      "done",
      "leave",
    ],
  },
  installStep("cyb-silt-gills"),
  {
    kind: "arc",
    arc: act1Arc,
    entry: "a1-ferrow",
    choices: [
      "oath",
      "to-gate",
      "culvert",
      "take-key",
      "mark",
      "back",
      "court",
      "inner-key",
      "face-custodian",
      "light-it",
      "rest",
    ],
  },
];

/** Court state: a bruiser courier with enough Body for the crew gate. */
export function makeCourtState(seed: number): GameState {
  return makeState(
    "gutter-courier",
    (a) => {
      a.body += 5;
      a.reflexes += 3;
      a.tech += 3;
      a.intelligence += 4;
    },
    seed,
  );
}

/**
 * Court opening through Act 2: the sappers' tunnel, the crews' ducts,
 * and the severance ending — no gate fight, no crawler fight.
 */
export const routeCourtToSeverance: RouteStep[] = [
  ...act1CourtRoute,
  healStep(),
  {
    kind: "arc",
    arc: act2Arc,
    entry: "a2-start",
    choices: [
      "court", // gated on act1-outcome = court
      "descend", // the thieves' chain exists because of ally-cistern-court
      "ask-cyclers",
      "back",
      "accept",
      "tunnel-supplied", // Ferrow's kit + the sappers' tunnel skip the gate
      "up",
      "crew",
      "street-knock", // street-exclusive scene: the ducts and the den warning
      "back",
      "vault",
      "ducts", // non-combat route past the vent crawler
      "take",
      "core",
      "breach-court", // climax variant keyed on a2-approach = court
      "spool",
      "sever-court", // ending gated on the Court alliance
      "throw",
    ],
  },
];

/** Act 1 voss route: corp analyst, badge-through, ledger sold. */
export const act1VossRoute: RouteStep[] = [
  {
    kind: "arc",
    arc: introArc,
    entry: "start",
    choices: [
      "agree-terms",
      "walk-on",
      "corp-talk",
      "sit-agreed",
      "take-advance",
      "take-job",
      "bluff-scout",
      "back-to-bar",
      "hand-over",
    ],
  },
  {
    kind: "arc",
    arc: act1Arc,
    entry: "a1-start",
    choices: [
      "follow",
      "about-spike",
      "on-to-business",
      "glasshouse",
      "audit-cadence",
      "walk-up",
      "take-deal",
      "descend",
      "to-gate",
      "pass",
      "siphon-deal",
      "back",
      "voss",
      "proceed",
      "fight",
      "burn-sable",
      "sign",
    ],
  },
];

/** Voss state: a fast analyst who shoots straight and talks straighter. */
export function makeVossState(seed: number): GameState {
  return makeState(
    "tower-analyst",
    (a) => {
      a.body += 5;
      a.reflexes += 6;
      a.cool += 4;
    },
    seed,
  );
}

/**
 * Voss opening through Act 2: the writ walks the front gate, Lin's
 * spool comes early, and the takeover ending hands Voss the ring.
 */
export const routeVossToTakeover: RouteStep[] = [
  ...act1VossRoute,
  healStep(),
  {
    kind: "arc",
    arc: act2Arc,
    entry: "a2-start",
    choices: [
      "voss", // gated on act1-outcome = voss
      "glasshouse",
      "terms",
      "lin", // corp-exclusive scene: the mandate spool, early
      "back",
      "filament", // sable-burned comes back to bite
      "back",
      "go", // Voss's retainer kit rides along
      "writ", // the Act 1 writ opens the front gate — no fight
    ],
  },
  healStep(),
  {
    kind: "arc",
    arc: act2Arc,
    entry: "a2-vent-arrival",
    choices: [
      "gallery",
      "read",
      "back",
      "core",
      "breach-voss", // climax variant keyed on a2-approach = voss
      "console",
      "takeover", // ending gated on ally-voss
      "uplink",
    ],
  },
];

/**
 * Act 1 broadcast route with a betrayal in it: grid diver keeps the
 * spike, takes Voss's deal, then burns it at the Relay Crown — ending
 * wanted AND betrayed-voss, the worst state later acts have to honor.
 */
export const act1BetrayalRoute: RouteStep[] = [
  {
    kind: "arc",
    arc: introArc,
    entry: "start",
    choices: [
      "go-cold",
      "walk-on",
      "pay-cover",
      "sit-cold",
      "hear-out",
      "take-job",
      "jump-scout",
      "back-to-bar",
      "keep-spike",
    ],
  },
  {
    kind: "arc",
    arc: act1Arc,
    entry: "a1-start",
    choices: [
      "follow",
      "show-spike",
      "on-to-business",
      "glasshouse",
      "liaison",
      "take-deal",
      "descend",
      "to-shrine",
      "jack-in",
      "ask-crown",
      "surface",
    ],
  },
  {
    kind: "arc",
    arc: act1Arc,
    entry: "a1-pumpgate",
    choices: [
      "hex",
      "siphon-deal",
      "back",
      "crown-betray-voss",
      "own-copy",
      "fight",
      "name-author",
      "vanish",
    ],
  },
];

/** Betrayal state: a hardy diver with the Intelligence the dives want. */
export function makeBetrayalState(seed: number): GameState {
  return makeState(
    "grid-diver",
    (a) => {
      a.body += 5;
      a.reflexes += 5;
      a.tech += 1;
      a.intelligence += 4;
    },
    seed,
  );
}

/**
 * Betrayal opening through Act 2: hunted and betrayed-voss, the
 * collectors fought, veiled past the scanners, out on the charter
 * ending with the warrant suspended.
 */
export const routeBetrayalToCharter: RouteStep[] = [
  ...act1BetrayalRoute,
  {
    kind: "arc",
    arc: act2Arc,
    entry: "a2-start",
    choices: [
      "lone", // gated on act1-outcome = broadcast
      "follow", // Patch's trauma patches, aunt-fashion
      "hex", // Hex earned in Act 1 moves into the Exchange
      "back",
    ],
  },
  healStep(),
  {
    kind: "arc",
    arc: act2Arc,
    entry: "a2-lone-safehouse",
    choices: [
      "move-voss", // betrayed-voss bites: Voss's collectors are waiting
      "fight",
    ],
  },
  {
    kind: "arc",
    arc: act2Arc,
    entry: "a2-lone-approach",
    choices: [
      "patch-veil",
      "buy", // credits-gated enhancement purchase
      "buy-patch",
      "buy-patch",
      "buy-patch",
      "buy-patch",
      "done",
    ],
  },
  installStep("cyb-static-veil"),
  healStep(),
  {
    kind: "arc",
    arc: act2Arc,
    entry: "a2-lone-approach",
    choices: [
      "veil-walk", // enhancement gate beats the wanted-by-auric scanners
      "in",
      "gallery",
      "dive", // net-exclusive scene: the ducts and the proxy's secret
      "surface",
      "vault",
      "ducts",
      "take",
    ],
  },
  equipStep("wpn-arc-lash"),
  healStep(),
  {
    kind: "arc",
    arc: act2Arc,
    entry: "a2-vent-arrival",
    choices: [
      "core",
      "breach-lone", // climax variant keyed on a2-approach = lone
      "gloat", // voss-exposed callback: Halex says thank you
      "spool",
      "charter", // ending gated on the mandate spool
      "walk-out",
    ],
  },
];

/** Loner state: a tech-first diver built to speak to machines. */
export function makeLoneState(seed: number): GameState {
  return makeState(
    "grid-diver",
    (a) => {
      a.body += 5;
      a.reflexes += 5;
      a.tech += 4; // 3 + 4 + the diver's +2 = 9: clears the commune gate
      a.intelligence += 1;
    },
    seed,
  );
}

/**
 * Pure loner: broadcast with no deal and no betrayal (act1-side stays
 * open), Hex all the way — the shrine dive, the Crown, the Exchange's
 * service dark, and severance handed to the ghost at the console.
 */
export const routeLoneToSeveranceHex: RouteStep[] = [
  {
    kind: "arc",
    arc: introArc,
    entry: "start",
    choices: [
      "go-cold",
      "walk-on",
      "pay-cover",
      "sit-cold",
      "hear-out",
      "take-job",
      "jump-scout",
      "back-to-bar",
      "keep-spike",
    ],
  },
  {
    kind: "arc",
    arc: act1Arc,
    entry: "a1-start",
    choices: [
      "follow",
      "show-spike",
      "on-to-business",
      "descend", // straight down — Voss's glasshouse never entered
      "to-shrine",
      "jack-in",
      "ask-crown",
      "surface",
    ],
  },
  healStep(),
  {
    kind: "arc",
    arc: act1Arc,
    entry: "a1-pumpgate",
    choices: [
      "hex", // Hex sings the service door open
      "scout", // touch nothing; owe nothing
      "back",
      "crown-open", // act1-side is still "open" — no betrayal flag
      "own-copy",
      "fight",
      "raw", // send it raw: no voss-exposed either
      "vanish",
    ],
  },
  {
    kind: "arc",
    arc: act2Arc,
    entry: "a2-start",
    choices: ["lone", "follow", "hex", "back"],
  },
  healStep(),
  {
    kind: "arc",
    arc: act2Arc,
    entry: "a2-lone-safehouse",
    choices: [
      "move-open", // no betrayals: nobody is waiting in the cut
      "patch-veil", // stock up at Patch's case before the Exchange
      "buy-patch",
      "buy-patch",
      "buy-patch",
      "buy-patch",
      "done",
      "hex-door", // Hex opens the Exchange — no veil purchase needed
      "in",
      "gallery",
      "dive",
      "surface",
      "vault",
      "ducts",
      "take",
    ],
  },
  equipStep("wpn-arc-lash"),
  healStep(),
  {
    kind: "arc",
    arc: act2Arc,
    entry: "a2-vent-arrival",
    choices: [
      "core",
      "breach-lone",
      "console", // no gloat (Voss never named), no spool needed
      "sever-hex", // the ghost keeps the parish
      "throw",
    ],
  },
];

/* ------------------------------------------------------------------ *
 * The finale, and the whole runs
 * ------------------------------------------------------------------ */

/**
 * The six advancement points three chapters earn, spent the way a
 * player spends them: into the stats the finale actually asks for.
 */
const spendPoints: RouteStep[] = [
  advanceStep("body"),
  advanceStep("body"),
  advanceStep("reflexes"),
];

/** Court loyalist finale: sappers at the crown, the keys burned. */
export const act3CourtToFreehold: RouteStep[] = [
  ...spendPoints,
  healStep(),
  {
    kind: "arc",
    arc: act3Arc,
    entry: "a3-start",
    choices: [
      "severance", // opening gated on act2-outcome = severance
      "council",
      "ferrow", // ally-cistern-court aside: Ferrow's blessing
      "back",
      "go",
      "muster",
      "sappers", // the loyal Court joins the final battle
      "back",
      "crews-warned", // Odal remembers the courier knock
      "back",
      "back",
      "gate",
      "fight", // never wanted, no veil, no ghost: the loud way in
      "in",
    ],
  },
  healStep(),
  {
    kind: "arc",
    arc: act3Arc,
    entry: "a3-spire-arrival",
    choices: [
      "crown",
      "breach-court", // climax variant only a kept alliance unlocks
      "stand",
      "keys",
      "freehold", // ending gated on steps-independent
      "seal",
    ],
  },
];

/** Voss retainer finale: the chair's override, the keys routed up. */
export const act3VossToRegency: RouteStep[] = [
  ...spendPoints,
  healStep(),
  {
    kind: "arc",
    arc: act3Arc,
    entry: "a3-start",
    choices: [
      "takeover", // opening gated on act2-outcome = takeover
      "glasshouse",
      "terms",
      "go",
      "gate",
      "standing", // the regent's credentials open the Registry Gate
      "in",
      "terminal",
      "audit", // corp-exclusive read of the founding instrument
      "surface",
    ],
  },
  healStep(),
  {
    kind: "arc",
    arc: act3Arc,
    entry: "a3-spire-arrival",
    choices: [
      "crown",
      "breach-auric", // climax variant keyed on the chair's standing
      "stand",
      "clause", // locus-known callback: the engine re-reads its will
      "keys",
      "regency", // ending gated on voss-ascendant
      "seal",
    ],
  },
];

/** Charter witness finale: the betrayal bites, the warrant stands down. */
export const act3BetrayalToCommons: RouteStep[] = [
  ...spendPoints,
  healStep(),
  {
    kind: "arc",
    arc: act3Arc,
    entry: "a3-start",
    choices: [
      "charter", // opening gated on act2-outcome = charter
      "ask",
      "go",
      "outlaw", // act1-outcome = broadcast aside: the witness was wanted
      "back",
      "mandate",
      "collectors", // betrayed-voss bites a third time: the Trust's writ
      "fight",
      "gate",
      "witness", // wanted-by-auric = false: the scanners stand down
      "in",
      "terminal",
      "dive", // net-exclusive read of the founding instrument
      "surface",
    ],
  },
  healStep(),
  {
    kind: "arc",
    arc: act3Arc,
    entry: "a3-spire-arrival",
    choices: [
      "crown",
      "breach-alone", // no sappers, no chair: the hardest door
      "stand",
      "clause",
      "keys",
      "commons", // ending gated on undercroft-charter
      "seal",
    ],
  },
];

/** The diver and the ghost: a finale with no fight anywhere in it. */
export const act3LoneToGhost: RouteStep[] = [
  ...spendPoints,
  healStep(),
  {
    kind: "arc",
    arc: act3Arc,
    entry: "a3-start",
    choices: [
      "severance", // same act2-outcome as the court route...
      "council",
      "outlaw", // ...but act1-outcome = broadcast opens this aside
      "back",
      "go",
      "wire", // Hex reaches the concourse first
      "take",
    ],
  },
  installStep("cyb-lattice-coprocessor"),
  {
    kind: "arc",
    arc: act3Arc,
    entry: "a3-spire-arrival",
    choices: [
      "gate",
      "dark", // Hex misfiles the arch — the wanted diver never scans
      "in",
      "terminal",
      "dive",
      "surface",
      "crown",
      "commune", // hex-exchange + Tech 8 + installed lattice: no battle
      "stand",
      "clause",
      "keys",
      "ghost", // ending gated on hex-exchange
      "seal",
    ],
  },
];

/**
 * A whole run, named: who is playing it, the script that plays it, and
 * where it lands. This is the unit both the finale walkthroughs and the
 * economy ledger sweep iterate over, so "the four canonical runs" is one
 * list in one place rather than a convention four tests remember.
 */
export interface Playthrough {
  id: string;
  /** Background the run is played on (see src/data/backgrounds.ts). */
  backgroundId: string;
  /** One line of what this run is. */
  blurb: string;
  makeState(seed: number): GameState;
  steps: RouteStep[];
  /** Ending id the run lands on. */
  endingId: string;
}

export const PLAYTHROUGHS: readonly Playthrough[] = [
  {
    id: "court-freehold",
    backgroundId: "gutter-courier",
    blurb: "A courier who keeps the Court's oath and burns the keys.",
    makeState: makeCourtState,
    steps: [...routeCourtToSeverance, ...act3CourtToFreehold],
    endingId: "ending-freehold",
  },
  {
    id: "voss-regency",
    backgroundId: "tower-analyst",
    blurb: "An analyst who signs with Voss and routes the crown upstairs.",
    makeState: makeVossState,
    steps: [...routeVossToTakeover, ...act3VossToRegency],
    endingId: "ending-regency",
  },
  {
    id: "betrayal-commons",
    backgroundId: "grid-diver",
    blurb: "A diver who takes Voss's deal, burns it, and pays for it thrice.",
    makeState: makeBetrayalState,
    steps: [...routeBetrayalToCharter, ...act3BetrayalToCommons],
    endingId: "ending-commons",
  },
  {
    id: "lone-ghost",
    backgroundId: "grid-diver",
    blurb: "A diver who owes nobody and hands the parish to the ghost.",
    makeState: makeLoneState,
    steps: [...routeLoneToSeveranceHex, ...act3LoneToGhost],
    endingId: "ending-ghost",
  },
];
