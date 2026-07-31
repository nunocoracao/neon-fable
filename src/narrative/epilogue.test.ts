import { describe, expect, it } from "vitest";
import {
  STATIC_EPILOGUE_FLAGS,
  epilogueThreads,
  epilogueVignettes,
} from "../data/epilogues";
import { bandCeiling } from "../data/factions";
import {
  RESTYLE_COUNT_FLAG,
  RESTYLE_FLAG,
  RESTYLE_REGULAR_COUNT,
} from "../data/stylist";
import { createNewGame, type GameState } from "../state";
import type { FlagMap, FlagValue } from "../state/flags";
import { adjustLoyalty, recruitCompanion } from "../state/party";
import { clampReputation, emptyReputation } from "../state/reputation";
import {
  EPILOGUE_SECTIONS,
  composeEpilogue,
  sectionRank,
  selectVignettes,
  threadVariantIds,
  type EpilogueVignette,
} from "./epilogue";
import { checkRequirements } from "./requirements";

/**
 * Pure epilogue selection and composition: one vignette per subject,
 * first authored match wins, fallbacks catch subjects with no matching
 * variant, subjects with no fallback are omitted, and the finished
 * epilogue runs in section order (personal -> chains -> allies ->
 * companions -> factions -> city).
 *
 * The authored content is then swept property-style: a large spread of
 * outcome-flag fixtures is composed and every one of them must produce
 * a well-formed epilogue — ordered, one variant per thread, no
 * mutually exclusive pair, every thread registered, and every thread a
 * run never touched cleanly absent.
 */

function stateWith(flags: Record<string, FlagValue>): GameState {
  const state = createNewGame({ playerName: "Vex", seed: 7 });
  return { ...state, flags };
}

const sample: EpilogueVignette[] = [
  {
    id: "a-special",
    subject: "a",
    title: "A",
    text: "special",
    requires: [{ type: "flag-equals", key: "won", value: true }],
  },
  { id: "a-default", subject: "a", title: "A", text: "default" },
  {
    id: "b-only",
    subject: "b",
    title: "B",
    text: "gated",
    requires: [{ type: "flag-equals", key: "met-b", value: true }],
  },
];

describe("selectVignettes", () => {
  it("picks the first vignette per subject whose requirements pass", () => {
    const picked = selectVignettes(stateWith({ won: true, "met-b": true }), sample);
    expect(picked.map((v) => v.id)).toEqual(["a-special", "b-only"]);
  });

  it("falls back within a subject and omits subjects with no match", () => {
    const picked = selectVignettes(stateWith({}), sample);
    expect(picked.map((v) => v.id)).toEqual(["a-default"]);
  });

  it("keeps authored order as render order", () => {
    const picked = selectVignettes(stateWith({ "met-b": true }), sample);
    expect(picked.map((v) => v.subject)).toEqual(["a", "b"]);
  });
});

describe("composeEpilogue", () => {
  const threads = [
    { subject: "b", section: "city" as const, title: "B", hint: "?" },
    { subject: "a", section: "personal" as const, title: "A", hint: "?" },
  ];

  it("assembles selected vignettes in section order, not authored order", () => {
    const picked = composeEpilogue(
      stateWith({ "met-b": true }),
      sample,
      threads,
    );
    expect(picked.map((v) => v.subject)).toEqual(["a", "b"]);

    // Same content, thread table reversed: the order follows the table.
    const flipped = composeEpilogue(stateWith({ "met-b": true }), sample, [
      { ...threads[0]!, section: "personal" },
      { ...threads[1]!, section: "city" },
    ]);
    expect(flipped.map((v) => v.subject)).toEqual(["b", "a"]);
  });

  it("keeps authored order between vignettes of the same section", () => {
    const both = [
      { subject: "a", section: "allies" as const, title: "A", hint: "?" },
      { subject: "b", section: "allies" as const, title: "B", hint: "?" },
    ];
    const picked = composeEpilogue(stateWith({ "met-b": true }), sample, both);
    expect(picked.map((v) => v.id)).toEqual(["a-default", "b-only"]);
  });

  it("drops nothing when a subject has no registered thread", () => {
    const picked = composeEpilogue(stateWith({ "met-b": true }), sample, [
      threads[1]!,
    ]);
    // The unregistered subject sorts last rather than vanishing.
    expect(picked.map((v) => v.subject)).toEqual(["a", "b"]);
  });

  it("leaves no gap where a thread is absent", () => {
    const picked = composeEpilogue(stateWith({}), sample, threads);
    expect(picked.map((v) => v.id)).toEqual(["a-default"]);
  });
});

// --- The authored content ----------------------------------------------

const threadsBySubject = new Map(epilogueThreads.map((t) => [t.subject, t]));

/** Threads every finished run resolves, whatever it did. */
const ALWAYS_SHOWN = [
  "warrant",
  "ferrow",
  "voss",
  "halex",
  "flick",
  "sable",
  "crews",
  "auric",
  "court",
  "market",
  "undercroft",
];

/**
 * Threads that only speak when a run gave them something to speak
 * about, and the flag that decides it. "Clean skip" is the property:
 * present exactly when the run touched the thread, absent otherwise,
 * with no placeholder either way.
 */
const OPTIONAL_THREADS: Record<string, (flags: FlagMap) => boolean> = {
  courier: (flags) => "last-mile" in flags,
  ring: (flags) => "under-waterline" in flags,
  look: (flags) => flags[RESTYLE_FLAG] === true,
  static: (flags) =>
    flags[STATIC_EPILOGUE_FLAGS.overload] === true ||
    STATIC_EPILOGUE_FLAGS.peak in flags,
  streets: (flags) =>
    flags["cordon-broken"] === true ||
    flags["kept-spike"] === true ||
    flags["spike-delivered"] === true,
  hex: (flags) =>
    flags["ending"] === "ending-ghost" ||
    flags["hex-exchange"] === true ||
    flags["hex-broadcast"] === true,
  lin: (flags) => flags["lin-debt"] === true,
  boards: (flags) =>
    flags["ending"] === "ending-consortium" || flags["boards-cut-in"] === true,
  city: (flags) => typeof flags["ending"] === "string",
};

describe("authored epilogue content", () => {
  it("never buries a gated variant below its subject's fallback", () => {
    const fallbackSeen = new Set<string>();
    for (const vignette of epilogueVignettes) {
      if (!vignette.requires || vignette.requires.length === 0) {
        fallbackSeen.add(vignette.subject);
      } else {
        expect(
          fallbackSeen.has(vignette.subject),
          `"${vignette.id}" is unreachable behind its subject's fallback`,
        ).toBe(false);
      }
    }
  });

  it("gives every always-shown subject a fallback", () => {
    const withFallback = new Set(
      epilogueVignettes
        .filter((v) => !v.requires || v.requires.length === 0)
        .map((v) => v.subject),
    );
    // These subjects appear in every playthrough's epilogue.
    for (const subject of [
      "undercroft",
      "ferrow",
      "voss",
      "halex",
      "flick",
      "sable",
      "crews",
      "warrant",
      "auric",
      "court",
      "market",
    ]) {
      expect(withFallback.has(subject), `no fallback for ${subject}`).toBe(true);
    }
  });

  it("registers every subject as a thread, and every thread has variants", () => {
    for (const vignette of epilogueVignettes) {
      expect(
        threadsBySubject.has(vignette.subject),
        `"${vignette.id}" has no thread for subject "${vignette.subject}"`,
      ).toBe(true);
    }
    for (const thread of epilogueThreads) {
      expect(
        threadVariantIds(thread.subject, epilogueVignettes).length,
        `thread "${thread.subject}" has no vignettes`,
      ).toBeGreaterThan(0);
    }
    expect(new Set(epilogueThreads.map((t) => t.subject)).size).toBe(
      epilogueThreads.length,
    );
    expect(new Set(epilogueVignettes.map((v) => v.id)).size).toBe(
      epilogueVignettes.length,
    );
  });

  it("declares a known section and a spoiler-safe hint for every thread", () => {
    const sections: readonly string[] = EPILOGUE_SECTIONS;
    for (const thread of epilogueThreads) {
      expect(sections, `${thread.subject}`).toContain(thread.section);
      expect(thread.hint.length, `${thread.subject} hint`).toBeGreaterThan(20);
      // A hint teases the kind of thing, never a title or an outcome.
      expect(thread.hint, `${thread.subject} hint`).not.toContain(thread.title);
      for (const variant of epilogueVignettes.filter(
        (v) => v.subject === thread.subject,
      )) {
        expect(
          variant.text.includes(thread.hint),
          `${thread.subject} hint leaks ${variant.id}`,
        ).toBe(false);
      }
    }
  });

  it("selects a distinct city closer for each of the four endings", () => {
    const closers = new Set<string>();
    for (const ending of [
      "ending-commons",
      "ending-regency",
      "ending-freehold",
      "ending-ghost",
    ]) {
      const picked = selectVignettes(
        stateWith({ ending }),
        epilogueVignettes,
      ).filter((v) => v.subject === "city");
      expect(picked, `no city closer for ${ending}`).toHaveLength(1);
      closers.add(picked[0]!.id);
    }
    expect(closers.size).toBe(4);
  });

  it("resolves the betrayed and loyal Court to different vignettes", () => {
    const loyal = selectVignettes(
      stateWith({ "ally-cistern-court": true }),
      epilogueVignettes,
    ).find((v) => v.subject === "ferrow");
    const betrayed = selectVignettes(
      stateWith({ "betrayed-court": true }),
      epilogueVignettes,
    ).find((v) => v.subject === "ferrow");
    expect(loyal?.id).toBe("ferrow-ally");
    expect(betrayed?.id).toBe("ferrow-betrayed");
  });

  it("distinguishes a live, suspended, and never-issued warrant", () => {
    const pick = (flags: Record<string, FlagValue>): string | undefined =>
      selectVignettes(stateWith(flags), epilogueVignettes).find(
        (v) => v.subject === "warrant",
      )?.id;
    expect(pick({ "wanted-by-auric": true })).toBe("warrant-standing");
    expect(pick({ "wanted-by-auric": false })).toBe("warrant-suspended");
    expect(pick({})).toBe("warrant-clean");
  });

  it("omits Hex and Lin entirely when they were never part of the story", () => {
    const subjects = selectVignettes(stateWith({}), epilogueVignettes).map(
      (v) => v.subject,
    );
    expect(subjects).not.toContain("hex");
    expect(subjects).not.toContain("lin");
  });
});

// --- The v2 threads -----------------------------------------------------

/** The one vignette a set of flags resolves for a subject, if any. */
function pickFor(subject: string, flags: FlagMap): string | undefined {
  return selectVignettes(stateWith(flags), epilogueVignettes).find(
    (v) => v.subject === subject,
  )?.id;
}

/** A finished state standing at `value` with one faction. */
function stateWithStanding(factionId: string, value: number): GameState {
  const state = stateWith({});
  const reputation = emptyReputation();
  reputation.standing[factionId as "auric"] = clampReputation(value);
  return { ...state, reputation };
}

describe("the courier chain in the epilogue", () => {
  it("reads back each terminal, and each way the chain was left open", () => {
    expect(
      pickFor("courier", {
        "last-mile": "delivered",
        "last-mile-delivered": true,
      }),
    ).toBe("courier-delivered");
    expect(
      pickFor("courier", { "last-mile": "exposed", "last-mile-exposed": true }),
    ).toBe("courier-exposed");
    expect(pickFor("courier", { "last-mile": "recovered" })).toBe(
      "courier-recovered",
    );
    expect(pickFor("courier", { "last-mile": "taken" })).toBe("courier-lapsed");
    expect(pickFor("courier", { "last-mile": "found" })).toBe("courier-lapsed");
  });

  it("says nothing at all to a run that never met the courier", () => {
    expect(pickFor("courier", {})).toBeUndefined();
  });
});

describe("the smuggling ring in the epilogue", () => {
  it("reads back all three settlements", () => {
    expect(
      pickFor("ring", {
        "under-waterline": "broken",
        "under-waterline-broken": true,
      }),
    ).toBe("ring-broken");
    expect(
      pickFor("ring", {
        "under-waterline": "partner",
        "under-waterline-partner": true,
      }),
    ).toBe("ring-partner");
    expect(
      pickFor("ring", {
        "under-waterline": "abandoned",
        "under-waterline-abandoned": true,
      }),
    ).toBe("ring-abandoned");
  });

  it("reads an unsettled chain and skips one never started", () => {
    expect(pickFor("ring", { "under-waterline": "taken" })).toBe("ring-lapsed");
    expect(pickFor("ring", { "under-waterline": "sold" })).toBe("ring-lapsed");
    expect(pickFor("ring", {})).toBeUndefined();
  });
});

describe("faction fates", () => {
  const rising: Record<string, string> = {
    auric: "auric-favoured",
    court: "court-owed",
    market: "market-good-for-it",
  };
  const falling: Record<string, string> = {
    auric: "auric-marked",
    court: "court-owing",
    market: "market-cash-first",
  };
  const unchanged: Record<string, string> = {
    auric: "auric-filed",
    court: "court-unwritten",
    market: "market-stranger",
  };

  it("gives every faction a rising, falling and unchanged paragraph", () => {
    for (const faction of ["auric", "court", "market"]) {
      const pick = (value: number): string | undefined =>
        selectVignettes(
          stateWithStanding(faction, value),
          epilogueVignettes,
        ).find((v) => v.subject === faction)?.id;
      expect(pick(80), `${faction} trusted`).toBe(rising[faction]);
      expect(pick(20), `${faction} warm floor`).toBe(rising[faction]);
      expect(pick(0), `${faction} neutral`).toBe(unchanged[faction]);
      expect(pick(-20), `${faction} neutral floor`).toBe(unchanged[faction]);
      expect(pick(bandCeiling("cold")), `${faction} cold`).toBe(
        falling[faction],
      );
      expect(pick(-100), `${faction} hostile`).toBe(falling[faction]);
    }
  });

  it("reads each faction independently of the other two", () => {
    const state = stateWith({});
    const reputation = emptyReputation();
    reputation.standing.auric = -80;
    reputation.standing.court = 70;
    const ids = composeEpilogue(
      { ...state, reputation },
      epilogueVignettes,
      epilogueThreads,
    ).map((v) => v.id);
    expect(ids).toContain("auric-marked");
    expect(ids).toContain("court-owed");
    expect(ids).toContain("market-stranger");
  });
});

describe("the look and the wiring", () => {
  it("reads one visit to the chair differently from a habit", () => {
    expect(
      pickFor("look", { [RESTYLE_FLAG]: true, [RESTYLE_COUNT_FLAG]: 1 }),
    ).toBe("look-changed");
    expect(
      pickFor("look", {
        [RESTYLE_FLAG]: true,
        [RESTYLE_COUNT_FLAG]: RESTYLE_REGULAR_COUNT,
      }),
    ).toBe("look-signature");
    expect(pickFor("look", {})).toBeUndefined();
  });

  it("keeps the Static thread silent until the meter writes its flags", () => {
    // Nothing in the game sets these yet; the thread must read as
    // absent rather than as a default paragraph about chrome.
    expect(pickFor("static", {})).toBeUndefined();
    expect(pickFor("static", { "wanted-by-auric": true })).toBeUndefined();
    // And it must light up the moment the meter does start writing.
    expect(
      pickFor("static", { [STATIC_EPILOGUE_FLAGS.overload]: true }),
    ).toBe("static-overload");
    expect(pickFor("static", { [STATIC_EPILOGUE_FLAGS.peak]: 95 })).toBe(
      "static-heavy",
    );
    expect(pickFor("static", { [STATIC_EPILOGUE_FLAGS.peak]: 1 })).toBe(
      "static-clean",
    );
  });
});

describe("district colour", () => {
  it("speaks only about streets a run actually changed", () => {
    expect(pickFor("streets", { "cordon-broken": true })).toBe(
      "streets-cordon",
    );
    expect(pickFor("streets", { "kept-spike": true })).toBe(
      "streets-spike-loose",
    );
    expect(pickFor("streets", { "spike-delivered": true })).toBe(
      "streets-spike-quiet",
    );
    expect(pickFor("streets", {})).toBeUndefined();
  });
});

// --- The sweep ----------------------------------------------------------

/**
 * Outcome axes a finished run can differ along. The sweep below walks a
 * spread of their combinations rather than the full cross product
 * (which is in the millions once bands and companions are counted):
 * fixture `i` reads its axis values off the digits of `i * STRIDE` in
 * mixed radix, and STRIDE is prime, so every axis keeps varying against
 * every other one instead of the low-order axes cycling alone.
 */
const AXES = {
  ending: [
    {},
    { ending: "ending-commons" },
    { ending: "ending-regency" },
    { ending: "ending-freehold" },
    { ending: "ending-concordat" },
    { ending: "ending-receivership" },
    { ending: "ending-consortium" },
    { ending: "ending-ghost" },
  ],
  disposition: [
    {},
    { "undercroft-charter": true },
    { "steps-independent": true },
    { "voss-ascendant": true },
  ],
  voss: [{}, { "voss-exposed": true }, { "betrayed-voss": true }],
  courier: [
    {},
    { "last-mile": "taken" },
    { "last-mile": "recovered" },
    { "last-mile": "delivered", "last-mile-delivered": true },
    { "last-mile": "exposed", "last-mile-exposed": true },
  ],
  ring: [
    {},
    { "under-waterline": "taken" },
    { "under-waterline": "broken", "under-waterline-broken": true },
    { "under-waterline": "partner", "under-waterline-partner": true },
    { "under-waterline": "abandoned", "under-waterline-abandoned": true },
  ],
  warrant: [{}, { "wanted-by-auric": true }, { "wanted-by-auric": false }],
  court: [
    {},
    { "ally-cistern-court": true },
    { "betrayed-court": true },
    { "court-cold": true },
  ],
  hex: [{}, { "hex-exchange": true }, { "hex-broadcast": true }],
  look: [
    {},
    { [RESTYLE_FLAG]: true, [RESTYLE_COUNT_FLAG]: 1 },
    { [RESTYLE_FLAG]: true, [RESTYLE_COUNT_FLAG]: 6 },
  ],
  static: [
    {},
    { [STATIC_EPILOGUE_FLAGS.peak]: 12 },
    { [STATIC_EPILOGUE_FLAGS.peak]: 88 },
    { [STATIC_EPILOGUE_FLAGS.overload]: true, [STATIC_EPILOGUE_FLAGS.peak]: 99 },
  ],
  streets: [
    {},
    { "spike-delivered": true },
    { "kept-spike": true },
    { "cordon-broken": true },
  ],
  side: [
    {},
    { "lin-debt": true },
    { "boards-cut-in": true },
    { "flick-friend": true },
    { "flick-scout": true },
    { "sable-burned": true, "crew-freed": true },
    { "crew-warned": true },
    { "lin-debt": true, "boards-cut-in": true, "flick-scout": true },
  ],
  companionFlags: [
    {},
    { "vesper-close": "warm", "vesper-bond": "sworn" },
    { "vesper-close": "betrayed", "vent-vault-call": "salvage" },
    { "sill-close": "distant", "vent-vault-call": "filed" },
    { "sill-close": "warm", "sill-bond": "parted" },
  ],
} as const satisfies Record<string, readonly Record<string, FlagValue>[]>;

const BANDS = [-100, -30, 0, 40, 90];
const PARTY = ["none", "vesper", "sill", "both"] as const;

/**
 * Flag combinations the axes above can express. Every radix is 2-, 3-
 * or 5-smooth, so any prime stride above 5 is coprime to the product
 * and `index * STRIDE % FLAG_SPACE` walks the whole space without ever
 * repeating inside a sweep.
 */
const FLAG_SPACE = Object.values(AXES).reduce(
  (product, options) => product * options.length,
  1,
);
const STRIDE = 1000003;

interface Fixture {
  label: string;
  state: GameState;
}

function fixtureAt(index: number): Fixture {
  let n = (index * STRIDE) % FLAG_SPACE;

  let flags: FlagMap = {};
  const chosen: string[] = [];
  for (const [name, options] of Object.entries(AXES)) {
    const choice = n % options.length;
    n = Math.floor(n / options.length);
    chosen.push(`${name}=${choice}`);
    flags = { ...flags, ...(options[choice] as Record<string, FlagValue>) };
  }

  // Standing and roster run off the raw index instead: 500 fixtures
  // cover every band triple against every party, and that cycle is
  // coprime to nothing in the flag walk above, so the two keep
  // crossing rather than marching in step.
  const reputation = emptyReputation();
  const bands = [index, Math.floor(index / 5), Math.floor(index / 25)];
  (["auric", "court", "market"] as const).forEach((faction, slot) => {
    reputation.standing[faction] = BANDS[bands[slot]! % BANDS.length]!;
  });

  const roster = PARTY[Math.floor(index / 125) % PARTY.length]!;
  let state: GameState = { ...stateWith(flags), reputation };
  if (roster === "vesper" || roster === "both") {
    state = { ...state, party: recruitCompanion(state.party, "vesper") };
    state = { ...state, party: adjustLoyalty(state.party, "vesper", index % 9) };
  }
  if (roster === "sill" || roster === "both") {
    state = { ...state, party: recruitCompanion(state.party, "sill") };
    state = { ...state, party: adjustLoyalty(state.party, "sill", -(index % 5)) };
  }

  return {
    label: `${chosen.join(" ")} bands=${Object.values(
      reputation.standing,
    ).join("/")} party=${roster}`,
    state,
  };
}

/** Thread families whose variants are alternatives, never a set. */
const EXCLUSIVE_FAMILIES: Record<string, readonly string[]> = {
  courier: ["courier-delivered", "courier-exposed", "courier-recovered"],
  ring: ["ring-broken", "ring-partner", "ring-abandoned"],
  auric: ["auric-favoured", "auric-marked", "auric-filed"],
  court: ["court-owed", "court-owing", "court-unwritten"],
  market: ["market-good-for-it", "market-cash-first", "market-stranger"],
  warrant: ["warrant-standing", "warrant-suspended", "warrant-clean"],
  look: ["look-signature", "look-changed"],
  static: ["static-overload", "static-heavy", "static-clean"],
  streets: ["streets-cordon", "streets-spike-loose", "streets-spike-quiet"],
};

const SWEEP = 1500;

describe("epilogue composition, swept over outcome fixtures", () => {
  it("composes a well-formed epilogue for every flag combination", () => {
    const authoredIndex = new Map(
      epilogueVignettes.map((vignette, index) => [vignette.id, index]),
    );

    for (let i = 0; i < SWEEP; i++) {
      const { label, state } = fixtureAt(i);
      const composed = composeEpilogue(
        state,
        epilogueVignettes,
        epilogueThreads,
      );
      const ids = composed.map((v) => v.id);
      const subjects = composed.map((v) => v.subject);

      // One variant per thread, and every one of them earned.
      expect(new Set(subjects).size, label).toBe(subjects.length);
      for (const vignette of composed) {
        expect(
          checkRequirements(state, vignette.requires),
          `${vignette.id} selected but its requirements fail — ${label}`,
        ).toBe(true);
        expect(
          threadsBySubject.has(vignette.subject),
          `${vignette.id} has no thread — ${label}`,
        ).toBe(true);
      }

      // Section order holds, and authored order holds inside a section.
      let lastRank = -1;
      let lastAuthored = -1;
      for (const vignette of composed) {
        const rank = sectionRank(
          threadsBySubject.get(vignette.subject)!.section,
        );
        expect(rank, `${vignette.id} out of section order — ${label}`)
          .toBeGreaterThanOrEqual(lastRank);
        if (rank === lastRank) {
          expect(
            authoredIndex.get(vignette.id)!,
            `${vignette.id} out of authored order — ${label}`,
          ).toBeGreaterThan(lastAuthored);
        }
        if (rank !== lastRank) lastAuthored = -1;
        lastRank = rank;
        lastAuthored = authoredIndex.get(vignette.id)!;
      }

      // Mutually exclusive variants never co-occur.
      for (const [family, variants] of Object.entries(EXCLUSIVE_FAMILIES)) {
        const hits = variants.filter((id) => ids.includes(id));
        expect(hits.length, `${family} co-occurrence ${hits} — ${label}`)
          .toBeLessThanOrEqual(1);
      }

      // Every thread a run touched speaks; every one it did not is
      // silently absent — no placeholders, no gaps.
      for (const subject of ALWAYS_SHOWN) {
        expect(subjects, `${subject} missing — ${label}`).toContain(subject);
      }
      for (const [subject, touched] of Object.entries(OPTIONAL_THREADS)) {
        expect(
          subjects.includes(subject),
          `${subject} presence — ${label}`,
        ).toBe(touched(state.flags));
      }

      // Digestible: a finished epilogue is a page, not a chapter.
      expect(composed.length, label).toBeLessThanOrEqual(
        epilogueThreads.length,
      );
      expect(composed.length, label).toBeGreaterThanOrEqual(
        ALWAYS_SHOWN.length,
      );
    }
  });

  it("covers every authored variant across the sweep", () => {
    const seen = new Set<string>();
    for (let i = 0; i < SWEEP; i++) {
      for (const vignette of composeEpilogue(
        fixtureAt(i).state,
        epilogueVignettes,
        epilogueThreads,
      )) {
        seen.add(vignette.id);
      }
    }
    // Companion variants need bond/loyalty combinations the sweep only
    // partly reaches; everything else must be selectable by some run.
    const unreachable = epilogueVignettes
      .filter((v) => !seen.has(v.id))
      .filter((v) => v.subject !== "vesper" && v.subject !== "sill");
    expect(unreachable.map((v) => v.id)).toEqual([]);
  });
});

// --- Old saves ----------------------------------------------------------

describe("v1-era saves", () => {
  /**
   * A finished run from before the side chains, the chair, the meter and
   * the reactive streets existed: act flags and an ending, nothing else.
   * Reputation is what the save migration derives from those same flags.
   */
  function v1State(): GameState {
    const flags: FlagMap = {
      "game-complete": true,
      ending: "ending-freehold",
      "act1-outcome": "court",
      "act2-outcome": "severance",
      "act3-outcome": "freehold",
      "steps-independent": true,
      "ally-cistern-court": true,
      "wanted-by-auric": true,
    };
    return stateWith(flags);
  }

  it("composes a valid, ordered epilogue with every v2 thread absent", () => {
    const state = v1State();
    const composed = composeEpilogue(
      state,
      epilogueVignettes,
      epilogueThreads,
    );
    const subjects = composed.map((v) => v.subject);

    for (const subject of ALWAYS_SHOWN) {
      expect(subjects, `${subject} missing`).toContain(subject);
    }
    // Nothing a v1 save could never have written shows up.
    for (const subject of ["courier", "ring", "look", "static", "streets"]) {
      expect(subjects, `${subject} leaked into a v1 epilogue`).not.toContain(
        subject,
      );
    }
    // Still in section order, and still ends on the city.
    const ranks = composed.map((v) =>
      sectionRank(threadsBySubject.get(v.subject)!.section),
    );
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(subjects[subjects.length - 1]).toBe("city");
    expect(composed.map((v) => v.id)).toContain("undercroft-severed");
    expect(composed.map((v) => v.id)).toContain("ferrow-ally");
  });

  it("gives a save with no reputation at all the unchanged ledgers", () => {
    // Faction standing a pre-factions save derives to nothing.
    const ids = composeEpilogue(
      { ...v1State(), reputation: emptyReputation() },
      epilogueVignettes,
      epilogueThreads,
    ).map((v) => v.id);
    expect(ids).toContain("auric-filed");
    expect(ids).toContain("court-unwritten");
    expect(ids).toContain("market-stranger");
  });
});
