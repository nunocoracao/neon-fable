import { describe, expect, it } from "vitest";
import {
  MAX_INTERLUDE_BEATS,
  MIN_INTERLUDE_BEATS,
  composeInterlude,
} from "../narrative/interlude";
import { createNewGame, type GameState } from "../state";
import type { FlagValue } from "../state/flags";
import { getInterlude, interludes } from "./interludes";
import { getMap } from "./maps";
import { storyArcs } from "./story";

/**
 * The authored interludes, swept against the flag states three acts can
 * actually leave behind: every route through both boundaries composes a
 * well-formed vignette, the beats say the thing that route earned, and
 * a run with no flags at all still reads as sentences.
 *
 * Content is checked against the story itself — a strand gating on a
 * flag no arc ever writes is a beat that can never play, and that is a
 * bug this file fails on rather than a line nobody notices missing.
 */

function stateWith(flags: Record<string, FlagValue>): GameState {
  const state = createNewGame({ playerName: "Vex", seed: 5 });
  return { ...state, flags };
}

/** Every flag key the story graph writes, anywhere. */
const writtenFlags = new Set<string>(
  storyArcs.flatMap((arc) =>
    arc.nodes.flatMap((node) =>
      (node.choices ?? []).flatMap((choice) =>
        (choice.effects ?? [])
          .filter(
            (effect) =>
              effect.type === "set-flag" || effect.type === "increment-flag",
          )
          .map((effect) => (effect as { key: string }).key),
      ),
    ),
  ),
);

const act1 = getInterlude("act1-act2")!;
const act2 = getInterlude("act2-act3")!;

function beatIds(state: GameState, id: string): string[] {
  return composeInterlude(state, getInterlude(id)!).beats.map((beat) => beat.id);
}

describe("authored interludes", () => {
  it("covers both act boundaries, in story order", () => {
    expect(interludes.map((interlude) => interlude.id)).toEqual([
      "act1-act2",
      "act2-act3",
    ]);
    expect(interludes.map((interlude) => interlude.afterFlag)).toEqual([
      "act1-complete",
      "act2-complete",
    ]);
  });

  it("gates every variant on a flag the story actually writes", () => {
    for (const interlude of interludes) {
      for (const strand of interlude.strands) {
        for (const variant of strand.variants) {
          for (const requirement of variant.requires ?? []) {
            if (!("key" in requirement)) continue;
            expect(
              writtenFlags.has(requirement.key),
              `${variant.id} gates on unwritten flag "${requirement.key}"`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it("names a real district and enough connective lines to stand on", () => {
    for (const interlude of interludes) {
      expect(getMap(interlude.backdrop.mapId)).toBeDefined();
      expect(interlude.connective.length).toBeGreaterThanOrEqual(
        MIN_INTERLUDE_BEATS,
      );
    }
  });

  it("keeps every beat id unique across the content", () => {
    const ids = interludes.flatMap((interlude) => [
      interlude.id,
      ...interlude.strands.flatMap((strand) => [
        strand.id,
        ...strand.variants.map((variant) => variant.id),
      ]),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("act one into act two", () => {
  it("reads the Court route back off its own flags", () => {
    const ids = beatIds(
      stateWith({
        "act1-complete": true,
        "act1-outcome": "court",
        "ally-cistern-court": true,
        "court-oath": true,
        "undertow-stopped": true,
        "betrayed-voss": true,
        "sable-trust": true,
      }),
      act1.id,
    );
    expect(ids).toEqual([
      "undertow-court",
      "court-oath",
      "warrant:fallback",
      "voss-betrayed",
      "sable-trust",
    ]);
  });

  it("reads the Voss route back, warrant and all", () => {
    const ids = beatIds(
      stateWith({
        "act1-complete": true,
        "act1-outcome": "voss",
        "ally-voss": true,
        "voss-deal": true,
        "undertow-delayed": true,
      }),
      act1.id,
    );
    expect(ids).toEqual([
      "undertow-voss",
      "court-cool",
      "warrant-patron",
      "voss-deal",
    ]);
  });

  it("reads the broadcast route, and trims the busiest run to the cap", () => {
    const ids = beatIds(
      stateWith({
        "act1-complete": true,
        "act1-outcome": "broadcast",
        "wanted-by-auric": true,
        "betrayed-court": true,
        "voss-exposed": true,
        "sable-burned": true,
        "hex-broadcast": true,
      }),
      act1.id,
    );
    expect(ids).toEqual([
      "undertow-broadcast",
      "court-betrayed",
      "warrant-open",
      "voss-exposed",
      "sable-burned",
    ]);
    expect(ids).toHaveLength(MAX_INTERLUDE_BEATS);
  });

  it("still reads as sentences for a run that recorded nothing", () => {
    const ids = beatIds(stateWith({ "act1-complete": true }), act1.id);
    expect(ids).toEqual([
      "undertow:fallback",
      "court:fallback",
      "warrant:fallback",
    ]);
  });
});

describe("act two into act three", () => {
  it("reads the charter route, including the suspended warrant", () => {
    const ids = beatIds(
      stateWith({
        "act2-complete": true,
        "act2-outcome": "charter",
        "cordon-broken": true,
        "halex-deposed": true,
        "undercroft-charter": true,
        "wanted-by-auric": false,
        "boards-cut-in": true,
      }),
      act2.id,
    );
    expect(ids).toEqual([
      "cordon-charter",
      "halex-deposed",
      "undercroft-charter",
      "patron-cleared",
      "market-boards",
    ]);
  });

  it("reads the takeover route as Voss's night", () => {
    const ids = beatIds(
      stateWith({
        "act2-complete": true,
        "act2-outcome": "takeover",
        "cordon-broken": true,
        "halex-deposed": true,
        "voss-ascendant": true,
        "auric-patron": true,
        "crew-freed": true,
      }),
      act2.id,
    );
    expect(ids).toEqual([
      "cordon-takeover",
      "halex-deposed",
      "patron-voss",
      "crew-freed",
    ]);
  });

  it("reads the severance route with the warrant still open", () => {
    const ids = beatIds(
      stateWith({
        "act2-complete": true,
        "act2-outcome": "severance",
        "cordon-broken": true,
        "undercroft-severed": true,
        "steps-independent": true,
        "wanted-by-auric": true,
      }),
      act2.id,
    );
    expect(ids).toEqual([
      "cordon-severance",
      "undercroft-severed",
      "patron-hunted",
    ]);
  });

  it("still reads as sentences for a run that recorded nothing", () => {
    const ids = beatIds(stateWith({ "act2-complete": true }), act2.id);
    expect(ids).toEqual([
      "cordon:fallback",
      "act2-act3:connective:0",
      "act2-act3:connective:1",
    ]);
  });
});

describe("every boundary, over every recorded outcome", () => {
  const act1Outcomes = ["court", "voss", "broadcast"];
  const act2Outcomes = ["charter", "takeover", "severance"];
  const extras: Array<Record<string, FlagValue>> = [
    {},
    { "wanted-by-auric": true },
    { "wanted-by-auric": false },
    { "hex-assist": true, "sable-skeptical": true, "lin-debt": true },
    { "crew-warned": true, "proxy-known": true, "voss-refused": true },
  ];

  it("composes a well-formed vignette for every combination", () => {
    for (const interlude of interludes) {
      const outcomes =
        interlude.id === "act1-act2" ? act1Outcomes : act2Outcomes;
      const outcomeKey =
        interlude.id === "act1-act2" ? "act1-outcome" : "act2-outcome";
      for (const outcome of [...outcomes, undefined]) {
        for (const extra of extras) {
          const flags: Record<string, FlagValue> = {
            [interlude.afterFlag]: true,
            ...extra,
          };
          if (outcome) flags[outcomeKey] = outcome;
          const composed = composeInterlude(stateWith(flags), interlude);
          expect(composed.beats.length).toBeGreaterThanOrEqual(
            MIN_INTERLUDE_BEATS,
          );
          expect(composed.beats.length).toBeLessThanOrEqual(
            MAX_INTERLUDE_BEATS,
          );
          // No blank lines, and nothing said twice in one vignette.
          for (const beat of composed.beats) {
            expect(beat.text.trim().length).toBeGreaterThan(0);
          }
          expect(new Set(composed.beats.map((b) => b.id)).size).toBe(
            composed.beats.length,
          );
        }
      }
    }
  });
});
