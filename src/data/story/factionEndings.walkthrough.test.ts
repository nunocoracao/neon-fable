import { describe, expect, it } from "vitest";
import { selectVignettes } from "../../narrative";
import {
  bandOf,
  deriveCodex,
  dominantFaction,
  emptyMetaProgress,
  recordCompletion,
  reputationOf,
  type GameState,
} from "../../state";
import { endings } from "../endings";
import { epilogueVignettes } from "../epilogues";
import { act2Arc } from "./act2";
import { act3Arc } from "./act3";
import { marketArc } from "./market";
import {
  advanceStep,
  equipStep,
  findRouteSeed,
  healStep,
  type RouteStep,
} from "./walkthroughSupport";
import {
  act1BetrayalRoute,
  makeBetrayalState,
  makeCourtState,
  makeVossState,
  routeCourtToSeverance,
  routeVossToTakeover,
} from "./walkthroughRoutes";

/**
 * Three scripted full-game routes for the standing axis: one per power,
 * each earning trusted standing the long way and cashing it at the
 * founders' keys for a disposition no legacy flag can reach.
 *
 * What these pin that the act walkthroughs cannot: that trusted is
 * actually attainable with each of the three factions inside one
 * playthrough, that the muster call's dominant-faction branch resolves
 * to a different crowd on each of them, and that the band gates on the
 * road there — the Market's freight stair, the Combine's bonded lift,
 * the boards buying out the Trust's writ — open for the runs that
 * earned them. A gate nobody can reach is content that does not exist,
 * so the proof is a route rather than an assertion about a table.
 */

const spendPoints: RouteStep[] = [
  advanceStep("body"),
  advanceStep("body"),
  advanceStep("reflexes"),
];

function vignetteIds(state: GameState): string[] {
  return selectVignettes(state, epilogueVignettes).map((v) => v.id);
}

/**
 * Reads the run mid-route, where the standing gates are actually
 * evaluated. applyChoice throws on an unmet requirement, so passing the
 * route already proves the gates opened; this pins *why* they opened,
 * at the point they opened, rather than off a finished save that has
 * the ending's own swing folded into it.
 */
function checkStanding(
  factionId: "auric" | "court" | "market",
  band: string,
): RouteStep {
  return {
    kind: "do",
    run(state) {
      expect(bandOf(state.reputation, factionId).id).toBe(band);
      expect(dominantFaction(state.reputation)).toBe(factionId);
      return state;
    },
  };
}

/** What the codex shows a player who has just seen this ending. */
function codexEntry(endingId: string) {
  const meta = recordCompletion(emptyMetaProgress(), {
    endingId,
    epilogueIds: [],
    legacyItemIds: [],
    legacyAppearance: undefined as never,
  });
  return deriveCodex(endings, meta).entries.find((e) => e.id === endingId);
}

describe("the standing endings, played end to end", () => {
  it("court trusted: the Steps answer the muster and sign the register — Concordat", () => {
    const { state, endings: reached } = findRouteSeed(makeCourtState, [
      ...routeCourtToSeverance,
      ...spendPoints,
      healStep(),
      {
        kind: "arc",
        arc: act3Arc,
        entry: "a3-start",
        choices: [
          "severance",
          "council",
          "go",
          "rally", // the act's one beat that reads the standings together
          "rally-court", // and the Undercroft is the only answer this run has
          "back",
          "gate",
          "fight",
          "in",
        ],
      },
      healStep(),
      checkStanding("court", "trusted"),
      {
        kind: "arc",
        arc: act3Arc,
        entry: "a3-spire-arrival",
        choices: [
          "crown",
          "allies-court", // a door the muster call opened
          "stand",
          "keys",
          "concordat", // reachable on trusted Court standing and nothing else
          "seal",
        ],
      },
    ]);

    expect(reached.at(-1)).toBe("ending-concordat");
    expect(state.flags["act3-outcome"]).toBe("concordat");
    expect(state.flags["game-complete"]).toBe(true);
    expect(state.flags["a3-allies"]).toBe("court");
    expect(state.flags["crown-route"]).toBe("allies-court");
    expect(state.flags["combat:enc-crown-court"]).toBe("victory");
    expect(vignetteIds(state)).toContain("city-concordat");
  });

  it("auric trusted: the Combine's own file opens the bonded lift — Receivership", () => {
    const { state, endings: reached } = findRouteSeed(makeVossState, [
      // Everything the takeover route does, with one detour: the
      // mezzanine lift that reads the player's own Combine file.
      ...routeVossToTakeover.slice(0, -1),
      {
        kind: "arc",
        arc: act2Arc,
        entry: "a2-vent-arrival",
        choices: [
          "bonded",
          "bonded-standing", // warm with the Combine: the reader just opens
          "bonded-take",
          "gallery",
          "read",
          "back",
          "core",
          "breach-voss",
          "console",
          "takeover",
          "uplink",
        ],
      },
      ...spendPoints,
      healStep(),
      {
        kind: "arc",
        arc: act3Arc,
        entry: "a3-start",
        choices: [
          "takeover",
          "glasshouse",
          "terms",
          "go",
          "rally",
          "rally-auric",
          "back",
          "gate",
          "standing",
          "in",
        ],
      },
      healStep(),
      checkStanding("auric", "trusted"),
      {
        kind: "arc",
        arc: act3Arc,
        entry: "a3-spire-arrival",
        choices: [
          "crown",
          "allies-auric",
          "stand",
          "keys",
          "receivership",
          "seal",
        ],
      },
    ]);

    expect(reached.at(-1)).toBe("ending-receivership");
    expect(state.flags["act3-outcome"]).toBe("receivership");
    expect(state.flags["game-complete"]).toBe(true);
    // The lift read a file rather than taking a bribe.
    expect(state.flags["bonded-floor"]).toBe("standing");
    expect(state.flags["a3-allies"]).toBe("auric");
    expect(state.flags["crown-route"]).toBe("allies-auric");
    expect(vignetteIds(state)).toContain("city-receivership");
  });

  it("market trusted: the boards' stair, the boards' writ, the boards' city — Open Ledger", () => {
    const { state, endings: reached } = findRouteSeed(makeBetrayalState, [
      ...act1BetrayalRoute,
      healStep(),
      {
        // The Market's own chain, worked before the Exchange: this is
        // what buys warm, and warm is what buys the freight stair.
        kind: "arc",
        arc: marketArc,
        entry: "vm-fixer",
        choices: [
          "the-job",
          "lm-take-job",
          "lm-ask-around",
          "lm-lead-go",
          "lm-pay", // day three, and the Rung would rather be paid
          "lm-pell-look",
          "lm-expose", // six levels read their own names
          "lm-exposed-done",
        ],
      },
      healStep(),
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
        choices: ["move-voss", "fight"],
      },
      healStep(),
      {
        kind: "arc",
        arc: act2Arc,
        entry: "a2-lone-approach",
        choices: [
          "patch-veil", // Patch's case, for the patches only
          "buy-patch",
          "buy-patch",
          "buy-patch",
          "done",
          "market-stair", // warm with the boards: no veil, no gate fight
          "in",
          "bonded",
          "bonded-clerk", // cold with the Combine: this door is bought
          "bonded-boards", // and the manifest goes on the boards
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
        choices: ["core", "breach-lone", "gloat", "spool", "charter", "walk-out"],
      },
      ...spendPoints,
      healStep(),
      {
        kind: "arc",
        arc: act3Arc,
        entry: "a3-start",
        choices: [
          "charter",
          "ask",
          "go",
          "mandate",
          "rally",
          "rally-market", // the boards are this run's strongest tie
          "back",
          "collectors",
          "boards", // trusted: the Trust's writ is bought out from under it
          "on",
          "gate",
          "witness",
          "in",
        ],
      },
      healStep(),
      checkStanding("market", "trusted"),
      {
        kind: "arc",
        arc: act3Arc,
        entry: "a3-spire-arrival",
        choices: [
          "crown",
          "allies-market",
          "stand",
          "keys",
          "consortium",
          "seal",
        ],
      },
    ]);

    expect(reached.at(-1)).toBe("ending-consortium");
    expect(state.flags["act3-outcome"]).toBe("consortium");
    expect(state.flags["game-complete"]).toBe(true);
    // The three band gates on the way, each in its own band.
    expect(state.flags["gate2-route"]).toBe("market");
    expect(state.flags["combat:enc-exchange-gate"]).toBeUndefined();
    expect(state.flags["bonded-floor"]).toBe("paid");
    expect(state.flags["boards-cut-in"]).toBe(true);
    expect(state.flags["trust-bought"]).toBe(true);
    expect(state.flags["combat:enc-spire-collectors"]).toBeUndefined();
    expect(state.flags["a3-allies"]).toBe("market");
    expect(vignetteIds(state)).toContain("city-consortium");
  });
});

describe("the standing endings in the codex", () => {
  it("lists each new disposition in the codex, hint before, summary after", () => {
    for (const endingId of [
      "ending-concordat",
      "ending-receivership",
      "ending-consortium",
    ]) {
      const locked = deriveCodex(endings, emptyMetaProgress()).entries.find(
        (e) => e.id === endingId,
      );
      expect(locked, `${endingId} missing from the codex`).toBeDefined();
      expect(locked?.discovered).toBe(false);
      expect(locked?.title).toBeNull();
      expect(locked?.hint.length).toBeGreaterThan(0);

      const found = codexEntry(endingId);
      expect(found?.discovered).toBe(true);
      expect(found?.title).toBeTruthy();
      expect(found?.summary).toBeTruthy();
    }
  });

  it("keeps the four legacy endings in the codex beside them", () => {
    const ids = deriveCodex(endings, emptyMetaProgress()).entries.map(
      (e) => e.id,
    );
    expect(ids).toEqual(
      expect.arrayContaining([
        "ending-commons",
        "ending-regency",
        "ending-freehold",
        "ending-ghost",
      ]),
    );
    expect(ids.length).toBe(7);
  });
});

describe("the muster call reads the city, not the player", () => {
  it("resolves to whichever power a finished run left standing highest", () => {
    // The same helper the gate uses, against the standings the three
    // routes above actually finish on.
    const { state } = findRouteSeed(makeCourtState, [...routeCourtToSeverance]);
    expect(dominantFaction(state.reputation)).toBe("court");
    expect(bandOf(state.reputation, "court").id).toBe("trusted");
    expect(reputationOf(state.reputation, "auric")).toBeLessThan(0);
  });
});
