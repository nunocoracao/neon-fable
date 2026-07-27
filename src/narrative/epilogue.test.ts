import { describe, expect, it } from "vitest";
import { epilogueVignettes } from "../data/epilogues";
import { createNewGame, type GameState } from "../state";
import type { FlagValue } from "../state/flags";
import { selectVignettes, type EpilogueVignette } from "./epilogue";

/**
 * Pure epilogue selection: one vignette per subject, first authored
 * match wins, fallbacks catch subjects with no matching variant, and
 * subjects with no fallback are omitted. The authored content is also
 * sanity-checked: every requirement-bearing variant must sit above its
 * subject's fallback or it can never be selected.
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
    ]) {
      expect(withFallback.has(subject), `no fallback for ${subject}`).toBe(true);
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
