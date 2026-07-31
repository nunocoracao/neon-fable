import { describe, expect, it } from "vitest";
import { sumStanding } from "../state/reputation";
import { SIDE_CHAIN_STEP, scaleStanding, type StandingDelta } from "./factions";
import { FACTION_STANDINGS, standingsForFlag } from "./standings";
import { storyArcs } from "./story";
import { LAST_MILE_OUTCOMES } from "./story/lastMile";
import { UNDER_WATERLINE_OUTCOMES } from "./story/underWaterline";
import type { Choice } from "../narrative/types";
import type { FlagValue } from "../state/flags";

/**
 * The standing table and the choices that write it are two halves of
 * one contract: a live run adds a choice's `standing` tag, and a save
 * that predates factions is read back off this table. If they ever
 * disagree, the same playthrough is worth different things depending on
 * whether it was played or loaded — so the invariant is pinned here
 * rather than left to authoring discipline.
 */

interface TaggedChoice {
  arcId: string;
  nodeId: string;
  choice: Choice;
}

function allChoices(): TaggedChoice[] {
  const found: TaggedChoice[] = [];
  for (const arc of storyArcs) {
    for (const node of arc.nodes) {
      for (const choice of node.choices) {
        found.push({ arcId: arc.id, nodeId: node.id, choice });
      }
    }
  }
  return found;
}

/** What the table says a choice's own flag writes are worth. */
function tabledStanding(choice: Choice): StandingDelta {
  const matches: StandingDelta[] = [];
  for (const effect of choice.effects ?? []) {
    if (effect.type !== "set-flag") continue;
    matches.push(...standingsForFlag(effect.key, effect.value));
  }
  return sumStanding(matches);
}

/** Every value any choice anywhere writes to a flag. */
function writtenValues(flag: string): Set<FlagValue> {
  const values = new Set<FlagValue>();
  for (const { choice } of allChoices()) {
    for (const effect of choice.effects ?? []) {
      if (effect.type === "set-flag" && effect.key === flag) {
        values.add(effect.value);
      }
    }
  }
  return values;
}

describe("standing table", () => {
  it("agrees with every choice tag in the authored story", () => {
    const disagreements: string[] = [];
    for (const { arcId, nodeId, choice } of allChoices()) {
      const expected = tabledStanding(choice);
      const actual = sumStanding([choice.standing ?? {}]);
      if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        disagreements.push(
          `${arcId}/${nodeId}/${choice.id}: tagged ` +
            `${JSON.stringify(actual)}, table says ${JSON.stringify(expected)}`,
        );
      }
    }
    expect(disagreements).toEqual([]);
  });

  it("has no entry the story never writes", () => {
    for (const source of FACTION_STANDINGS) {
      expect(
        [...writtenValues(source.flag)],
        `nothing in the story writes ${source.flag}`,
      ).toContain(source.value);
    }
  });

  it("only keys flags that are written once, with one value each", () => {
    // A flag a later beat overwrites would be worth one thing live and
    // another read back off a finished save. Every value the story can
    // write to a tabled flag must therefore be in the table itself.
    for (const source of FACTION_STANDINGS) {
      for (const value of writtenValues(source.flag)) {
        expect(
          standingsForFlag(source.flag, value).length,
          `${source.flag} can be written "${String(value)}" with no entry`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("moves every faction in both directions across the acts", () => {
    for (const factionId of ["auric", "court", "market"] as const) {
      const swings = FACTION_STANDINGS.map(
        (source) => source.standing[factionId] ?? 0,
      );
      expect(swings.some((v) => v > 0)).toBe(true);
      expect(swings.some((v) => v < 0)).toBe(true);
    }
  });

  it("carries both district chains at their own authored weights", () => {
    for (const outcome of [
      ...Object.values(LAST_MILE_OUTCOMES),
      ...Object.values(UNDER_WATERLINE_OUTCOMES),
    ]) {
      const entries = standingsForFlag(outcome.flag, true);
      expect(entries).toEqual([
        scaleStanding(outcome.standing, SIDE_CHAIN_STEP),
      ]);
    }
  });

  it("keeps a chapter outcome worth more than a district errand", () => {
    const chain = standingsForFlag("last-mile-exposed", true)[0]!;
    const chapter = standingsForFlag("act1-outcome", "broadcast")[0]!;
    expect(Math.abs(chapter.auric ?? 0)).toBeGreaterThan(
      Math.abs(chain.auric ?? 0),
    );
  });
});
