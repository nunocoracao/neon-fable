import { describe, expect, it } from "vitest";
import { createNewGame, type GameState } from "../state";
import type { FlagValue } from "../state/flags";
import {
  MAX_INTERLUDE_BEATS,
  MIN_INTERLUDE_BEATS,
  composeInterlude,
  interludeReached,
  interludeSeen,
  interludeSeenFlag,
  latestInterlude,
  markInterludeSeen,
  pendingInterlude,
  selectBeats,
  selectStrandBeat,
  type Interlude,
} from "./interlude";

/**
 * Pure interlude selection: one line per strand, first authored match
 * wins, strands nobody touched fall back or go unsaid, and a vignette
 * that comes out short is padded from the neutral connective pool so
 * composition is total over any flag map at all.
 *
 * The seen-flag behaviour is here too — it is the only state an
 * interlude has, and "plays once, replays on demand" is entirely a
 * property of that flag.
 */

function stateWith(flags: Record<string, FlagValue>): GameState {
  const state = createNewGame({ playerName: "Vex", seed: 11 });
  return { ...state, flags };
}

const sample: Interlude = {
  id: "sample",
  afterFlag: "sample-complete",
  kicker: "Interlude",
  title: "Sample",
  backdrop: { mapId: "greywater-steps", tone: "cyan" },
  connective: ["filler one", "filler two", "filler three", "filler four"],
  strands: [
    {
      id: "water",
      fallback: "the water, unremarked",
      variants: [
        {
          id: "water-stopped",
          text: "the water stopped",
          requires: [{ type: "flag-equals", key: "stopped", value: true }],
        },
        {
          id: "water-delayed",
          text: "the water waited",
          requires: [{ type: "flag-equals", key: "delayed", value: true }],
        },
      ],
    },
    {
      id: "friend",
      variants: [
        {
          id: "friend-kept",
          text: "the friend stayed",
          requires: [{ type: "flag-equals", key: "kept", value: true }],
        },
      ],
    },
    { id: "always", fallback: "always said", variants: [] },
  ],
};

describe("strand selection", () => {
  it("takes the first authored variant whose requirements pass", () => {
    const beat = selectStrandBeat(
      stateWith({ stopped: true, delayed: true }),
      sample.strands[0]!,
    );
    expect(beat).toEqual({ id: "water-stopped", text: "the water stopped" });
  });

  it("takes a later variant when the earlier one does not match", () => {
    const beat = selectStrandBeat(
      stateWith({ delayed: true }),
      sample.strands[0]!,
    );
    expect(beat?.id).toBe("water-delayed");
  });

  it("falls back to the strand's neutral line when nothing matched", () => {
    const beat = selectStrandBeat(stateWith({}), sample.strands[0]!);
    expect(beat).toEqual({ id: "water:fallback", text: "the water, unremarked" });
  });

  it("says nothing at all for an untouched strand with no fallback", () => {
    expect(selectStrandBeat(stateWith({}), sample.strands[1]!)).toBeNull();
  });
});

describe("composition", () => {
  it("keeps authored strand order and drops the silent ones", () => {
    const beats = selectBeats(stateWith({ stopped: true }), sample);
    expect(beats.map((beat) => beat.id)).toEqual([
      "water-stopped",
      "always:fallback",
    ]);
  });

  it("pads a short vignette from the connective pool", () => {
    const composed = composeInterlude(stateWith({}), sample);
    expect(composed.beats.map((beat) => beat.text)).toEqual([
      "the water, unremarked",
      "always said",
      "filler one",
    ]);
    expect(composed.beats).toHaveLength(MIN_INTERLUDE_BEATS);
  });

  it("composes for a state with no flags whatsoever", () => {
    const composed = composeInterlude(stateWith({}), {
      ...sample,
      strands: [],
    });
    expect(composed.beats.map((beat) => beat.id)).toEqual([
      "sample:connective:0",
      "sample:connective:1",
      "sample:connective:2",
    ]);
  });

  it("trims a busy run to the maximum, keeping the top strands", () => {
    const busy: Interlude = {
      ...sample,
      strands: Array.from({ length: 8 }, (_, index) => ({
        id: `s${index}`,
        fallback: `line ${index}`,
        variants: [],
      })),
    };
    const composed = composeInterlude(stateWith({}), busy);
    expect(composed.beats).toHaveLength(MAX_INTERLUDE_BEATS);
    expect(composed.beats[0]?.text).toBe("line 0");
    expect(composed.beats.at(-1)?.text).toBe("line 4");
  });

  it("carries the presentation the screen needs", () => {
    const composed = composeInterlude(stateWith({ kept: true }), sample);
    expect(composed.id).toBe("sample");
    expect(composed.kicker).toBe("Interlude");
    expect(composed.title).toBe("Sample");
    expect(composed.backdrop).toEqual({
      mapId: "greywater-steps",
      tone: "cyan",
    });
  });
});

describe("the seen flag", () => {
  const second: Interlude = { ...sample, id: "second", afterFlag: "second-done" };

  it("reads a boundary as crossed only on a true completion flag", () => {
    expect(interludeReached(stateWith({}), sample)).toBe(false);
    expect(interludeReached(stateWith({ "sample-complete": false }), sample)).toBe(
      false,
    );
    expect(interludeReached(stateWith({ "sample-complete": true }), sample)).toBe(
      true,
    );
  });

  it("owes the crossed-but-unplayed vignette, and only once", () => {
    const state = stateWith({ "sample-complete": true });
    expect(pendingInterlude(state, [sample, second])).toBe(sample);

    const played = markInterludeSeen(state, sample);
    expect(interludeSeen(played, sample)).toBe(true);
    expect(played.flags[interludeSeenFlag("sample")]).toBe(true);
    expect(pendingInterlude(played, [sample, second])).toBeNull();
    // The state it came from is untouched — selection is pure.
    expect(interludeSeen(state, sample)).toBe(false);
  });

  it("owes nothing before a boundary is crossed", () => {
    expect(pendingInterlude(stateWith({}), [sample, second])).toBeNull();
  });

  it("plays boundaries in authored order when two come due at once", () => {
    const state = stateWith({ "sample-complete": true, "second-done": true });
    expect(pendingInterlude(state, [sample, second])).toBe(sample);
    expect(
      pendingInterlude(markInterludeSeen(state, sample), [sample, second]),
    ).toBe(second);
  });

  it("marking twice changes nothing", () => {
    const once = markInterludeSeen(stateWith({}), sample);
    expect(markInterludeSeen(once, sample)).toBe(once);
  });

  it("replays the latest crossed boundary, seen or not", () => {
    expect(latestInterlude(stateWith({}), [sample, second])).toBeNull();
    expect(
      latestInterlude(stateWith({ "sample-complete": true }), [sample, second]),
    ).toBe(sample);
    const both = stateWith({ "sample-complete": true, "second-done": true });
    expect(latestInterlude(markInterludeSeen(both, sample), [sample, second])).toBe(
      second,
    );
  });
});
