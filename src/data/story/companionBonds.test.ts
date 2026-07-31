import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../../character/testSupport";
import {
  applyChoice,
  availableChoices,
  bondSceneReady,
  selectVignettes,
  type StoryNode,
} from "../../narrative";
import {
  adjustLoyalty,
  createNewGame,
  emptyMetaProgress,
  getMember,
  recordCompletion,
  recruitCompanion,
  setActiveCompanion,
  type GameState,
} from "../../state";
import type { FlagValue } from "../../state/flags";
import { BOND_OUTCOMES, getCompanion } from "../companions";
import { epilogueVignettes } from "../epilogues";
import { companionsArc } from "./companions";

/**
 * The crew's second hour, and what it leaves in the epilogue.
 *
 * Three things are pinned here. That the later scene is gated on
 * exactly the five conditions bondSceneReady checks, declared once in
 * content and once in code. That each fork writes one BondOutcome into
 * one companion's own flag and nothing else — so "how was it left" is a
 * single lookup that can never hold two answers. And that the fate
 * threads cover the whole outcome matrix: every loyalty band crossed
 * with every bond flag, every closeness flag, and every reading of the
 * coolant vault resolves to exactly one paragraph, never none and never
 * two.
 */

const VESPER = getCompanion("vesper")!;
const SILL = getCompanion("sill")!;
const COMPANIONS = [VESPER, SILL];

/** Loyalty values, one inside each band the player is ever shown. */
const LOYALTY_BANDS = [9, 7, 5, 3, 1, 0, -2, -5, -8];

/** Every reading the coolant-vault call can leave behind, plus none. */
const VAULT_CALLS = ["salvage", "filed", "brokered", undefined] as const;

/** Every way the first conversation can have gone, plus never had. */
const BONDS = ["sworn", "parted", undefined] as const;

/** The vault call that went against each of them. */
const CROSSED_BY: Record<string, string> = { vesper: "filed", sill: "salvage" };

const nodesById = new Map(companionsArc.nodes.map((node) => [node.id, node]));

function node(id: string): StoryNode {
  const found = nodesById.get(id);
  if (!found) throw new Error(`no node "${id}"`);
  return found;
}

function freshState(): GameState {
  return createNewGame({ character: fixtureCharacter({}), seed: 23 });
}

/** One companion recruited and out, standing at `loyalty`, with `flags`. */
function walking(
  companionId: string,
  loyalty: number,
  flags: Record<string, FlagValue> = {},
): GameState {
  const state = freshState();
  let party = recruitCompanion(state.party, companionId);
  party = adjustLoyalty(party, companionId, loyalty);
  return {
    ...state,
    party: setActiveCompanion(party, companionId),
    flags: { ...state.flags, ...flags },
  };
}

/** A state in which `companion` would raise their later hour tonight. */
function readyForLateHour(companionId: string): GameState {
  const companion = getCompanion(companionId)!;
  return walking(companionId, companion.bondScene.loyalty, {
    [companion.personalScene.resolvedFlag]: "sworn",
    [companion.bondScene.progressFlag]: true,
  });
}

/** The choice ids a player could actually take on a node right now. */
function choiceIds(state: GameState, nodeId: string): string[] {
  return availableChoices(state, node(nodeId))
    .filter((presented) => presented.enabled)
    .map((presented) => presented.choice.id);
}

function playRoute(
  start: GameState,
  entryNodeId: string,
  choiceIdList: string[],
): GameState {
  let state = start;
  let nodeId: string | null = entryNodeId;
  for (const choiceId of choiceIdList) {
    const outcome = applyChoice(state, node(nodeId ?? ""), choiceId);
    state = outcome.state;
    nodeId = outcome.nextNodeId;
  }
  return state;
}

/** The one fate a finished run reads out for a companion, if any. */
function fateFor(state: GameState, subject: string): string[] {
  return selectVignettes(state, epilogueVignettes)
    .filter((vignette) => vignette.subject === subject)
    .map((vignette) => vignette.id);
}

describe("the crew's later hour", () => {
  it("hangs off the same hub, on a node the arc actually contains", () => {
    for (const companion of COMPANIONS) {
      expect(nodesById.has(companion.bondScene.nodeId), companion.id).toBe(true);
    }
  });

  it("gates the hub on exactly what bondSceneReady checks", () => {
    // Five conditions, declared twice — once in content, once in code.
    // If they ever drift, the crew panel offers an hour that cannot be
    // played, or hides one that could.
    for (const companion of COMPANIONS) {
      const choice = node("cmp-hub").choices.find(
        (c) => c.target === companion.bondScene.nodeId,
      );
      expect(choice?.requirements, companion.id).toEqual([
        { type: "companion", companionId: companion.id },
        {
          type: "loyalty",
          companionId: companion.id,
          value: companion.bondScene.loyalty,
        },
        { type: "flag-set", key: companion.personalScene.resolvedFlag },
        { type: "flag-set", key: companion.bondScene.progressFlag },
        { type: "flag-unset", key: companion.bondScene.resolvedFlag },
      ]);
    }
  });

  it("stays shut until standing, the first hour, and the chapter all land", () => {
    for (const companion of COMPANIONS) {
      const id = companion.id;
      const open = `hear-${id}-late`;
      const ready = readyForLateHour(id);
      expect(choiceIds(ready, "cmp-hub"), id).toContain(open);
      expect(bondSceneReady(ready, id), id).toBe(true);

      // One condition removed at a time; each on its own closes it.
      const short: GameState = {
        ...ready,
        party: adjustLoyalty(ready.party, id, -1),
      };
      expect(choiceIds(short, "cmp-hub"), `${id}/loyalty`).not.toContain(open);

      const unspoken = { ...ready.flags };
      delete unspoken[companion.personalScene.resolvedFlag];
      expect(
        choiceIds({ ...ready, flags: unspoken }, "cmp-hub"),
        `${id}/first hour`,
      ).not.toContain(open);

      const early = { ...ready.flags };
      delete early[companion.bondScene.progressFlag];
      expect(
        choiceIds({ ...ready, flags: early }, "cmp-hub"),
        `${id}/story`,
      ).not.toContain(open);
    }
  });

  it("offers only the companion actually standing beside you", () => {
    const ready = readyForLateHour("vesper");
    const benched: GameState = {
      ...ready,
      party: setActiveCompanion(ready.party, null),
    };
    expect(choiceIds(benched, "cmp-hub")).toEqual(["hub-leave"]);
    expect(bondSceneReady(benched, "vesper")).toBe(false);
  });

  it("keeps the first conversation and the later hour separate offers", () => {
    // Loyalty high enough for both, but the first has never been had:
    // the hub offers that one and only that one.
    const both = walking("vesper", VESPER.bondScene.loyalty, {
      [VESPER.bondScene.progressFlag]: true,
    });
    expect(choiceIds(both, "cmp-hub")).toEqual(["hear-vesper", "hub-leave"]);
  });
});

describe("what the later hour writes", () => {
  const scenes = [
    {
      companion: VESPER,
      open: "hear-vesper-late",
      on: "vesper-late-sit",
      forks: {
        warm: "vesper-late-warm",
        distant: "vesper-late-distant",
        betrayed: "vesper-late-spend",
      },
    },
    {
      companion: SILL,
      open: "hear-sill-late",
      on: "sill-late-read",
      forks: {
        warm: "sill-late-warm",
        distant: "sill-late-distant",
        betrayed: "sill-late-keep",
      },
    },
  ] as const;

  it("locks one outcome per companion, and only ever one", () => {
    for (const scene of scenes) {
      const id = scene.companion.id;
      const flag = scene.companion.bondScene.resolvedFlag;
      const other = COMPANIONS.find((c) => c.id !== id)!;

      for (const outcome of BOND_OUTCOMES) {
        const start = {
          ...readyForLateHour(id),
          flags: {
            ...readyForLateHour(id).flags,
            // The break is only sayable when the vault already went
            // against them; the other two do not care either way.
            "vent-vault-call": CROSSED_BY[id]!,
          },
        };
        const after = playRoute(start, "cmp-hub", [
          scene.open,
          scene.on,
          scene.forks[outcome],
        ]);
        expect(after.flags[flag], `${id}/${outcome}`).toBe(outcome);
        // Exclusive: one value, and nothing written for anybody else.
        expect(
          BOND_OUTCOMES.filter((value) => after.flags[flag] === value),
          `${id}/${outcome}`,
        ).toEqual([outcome]);
        expect(after.flags[other.bondScene.resolvedFlag], id).toBeUndefined();
        // And the hour cannot be spent twice.
        expect(bondSceneReady(after, id), `${id}/${outcome}`).toBe(false);
        expect(choiceIds(after, "cmp-hub"), `${id}/${outcome}`).not.toContain(
          scene.open,
        );
      }
    }
  });

  it("only lets it break where the vault call already broke something", () => {
    for (const scene of scenes) {
      const id = scene.companion.id;
      const ask = `cmp-${id}-late-ask`;
      const crossed = CROSSED_BY[id]!;

      for (const call of VAULT_CALLS) {
        const flags: Record<string, FlagValue> =
          call === undefined ? {} : { "vent-vault-call": call };
        const state = {
          ...readyForLateHour(id),
          flags: { ...readyForLateHour(id).flags, ...flags },
        };
        const offered = choiceIds(state, ask);
        expect(offered, `${id}/${call ?? "no call"}`).toContain(
          scene.forks.warm,
        );
        expect(offered, `${id}/${call ?? "no call"}`).toContain(
          scene.forks.distant,
        );
        expect(
          offered.includes(scene.forks.betrayed),
          `${id}/${call ?? "no call"}`,
        ).toBe(call === crossed);
      }
    }
  });

  it("costs standing in the direction the answer went", () => {
    for (const scene of scenes) {
      const id = scene.companion.id;
      const start = {
        ...readyForLateHour(id),
        flags: {
          ...readyForLateHour(id).flags,
          "vent-vault-call": CROSSED_BY[id]!,
        },
      };
      const before = getMember(start.party, id)!.loyalty;
      const standing = (fork: string): number =>
        getMember(
          playRoute(start, "cmp-hub", [scene.open, scene.on, fork]).party,
          id,
        )!.loyalty;

      expect(standing(scene.forks.warm), id).toBeGreaterThan(before);
      expect(standing(scene.forks.distant), id).toBeLessThan(before);
      expect(standing(scene.forks.betrayed), id).toBeLessThan(
        standing(scene.forks.distant),
      );
      // Nobody is sacked over a conversation: they are still at your
      // shoulder afterwards, whichever way it went.
      for (const fork of Object.values(scene.forks)) {
        const after = playRoute(start, "cmp-hub", [scene.open, scene.on, fork]);
        expect(getMember(after.party, id)!.recruited, `${id}/${fork}`).toBe(
          true,
        );
        expect(getMember(after.party, id)!.active, `${id}/${fork}`).toBe(true);
      }
    }
  });
});

describe("the companion epilogue threads", () => {
  it("resolves every loyalty × bond × closeness × vault call to one fate", () => {
    for (const companion of COMPANIONS) {
      const fates = new Set<string>();
      for (const loyalty of LOYALTY_BANDS) {
        for (const bond of BONDS) {
          for (const close of [...BOND_OUTCOMES, undefined]) {
            for (const call of VAULT_CALLS) {
              const flags: Record<string, FlagValue> = {};
              if (bond) flags[companion.personalScene.resolvedFlag] = bond;
              if (close) flags[companion.bondScene.resolvedFlag] = close;
              if (call) flags["vent-vault-call"] = call;
              const picked = fateFor(
                walking(companion.id, loyalty, flags),
                companion.id,
              );
              expect(
                picked,
                `${companion.id} @${loyalty} ${bond ?? "-"}/${close ?? "-"}/${call ?? "-"}`,
              ).toHaveLength(1);
              fates.add(picked[0]!);
            }
          }
        }
      }
      // Well past the three the arc owes each of them.
      expect(fates.size, companion.id).toBeGreaterThanOrEqual(3);
    }
  });

  it("still says nothing at all about somebody never met", () => {
    for (const companion of COMPANIONS) {
      expect(fateFor(freshState(), companion.id), companion.id).toEqual([]);
      // Not even with the flags of a run that met the other one.
      const other = COMPANIONS.find((c) => c.id !== companion.id)!;
      const state = walking(other.id, 9, {
        [companion.bondScene.resolvedFlag]: "warm",
        "vent-vault-call": "filed",
      });
      expect(fateFor(state, companion.id), companion.id).toEqual([]);
    }
  });

  it("reads the later hour above the first one", () => {
    // Sworn on the board, then spent on the roof: the fate is the roof.
    const state = walking("vesper", 9, {
      "vesper-bond": "sworn",
      "vesper-close": "betrayed",
      "vent-vault-call": "filed",
    });
    expect(fateFor(state, "vesper")).toEqual(["vesper-betrayed"]);
  });

  it("gives each way of leaving it its own paragraph", () => {
    for (const companion of COMPANIONS) {
      const ids = BOND_OUTCOMES.map(
        (close) =>
          fateFor(
            walking(companion.id, 9, {
              [companion.personalScene.resolvedFlag]: "sworn",
              [companion.bondScene.resolvedFlag]: close,
            }),
            companion.id,
          )[0],
      );
      expect(new Set(ids).size, companion.id).toBe(BOND_OUTCOMES.length);
    }
  });

  it("lets the vault call split a fate the closeness flag shares", () => {
    const crossed = fateFor(
      walking("vesper", 9, {
        "vesper-close": "distant",
        "vent-vault-call": "filed",
      }),
      "vesper",
    );
    const clean = fateFor(
      walking("vesper", 9, {
        "vesper-close": "distant",
        "vent-vault-call": "salvage",
      }),
      "vesper",
    );
    expect(crossed).toEqual(["vesper-distant-filed"]);
    expect(clean).toEqual(["vesper-distant"]);
  });

  it("lets where they ended up standing outrank either conversation", () => {
    const warmly = fateFor(walking("sill", 9, {}), "sill");
    const coldly = fateFor(walking("sill", -5, {}), "sill");
    expect(warmly).toEqual(["sill-crew"]);
    expect(coldly).toEqual(["sill-spent"]);
  });
});

describe("what the codex makes of the new threads", () => {
  it("counts each companion thread as its own epilogue variant", () => {
    const run = (state: GameState): string[] =>
      selectVignettes(state, epilogueVignettes).map((vignette) => vignette.id);

    const warm = walking("vesper", 9, {
      ending: "ending-commons",
      "vesper-bond": "sworn",
      "vesper-close": "warm",
    });
    const spent = walking("vesper", -5, {
      ending: "ending-commons",
      "vesper-bond": "parted",
    });

    const first = recordCompletion(emptyMetaProgress(), {
      endingId: "ending-commons",
      epilogueIds: run(warm),
      legacyItemIds: [],
      legacyAppearance: warm.player.appearance,
    });
    expect(first.epiloguesSeen).toContain("vesper-warm-sworn");

    const second = recordCompletion(first, {
      endingId: "ending-commons",
      epilogueIds: run(spent),
      legacyItemIds: [],
      legacyAppearance: spent.player.appearance,
    });
    // A second run adds its own thread and never double-counts the
    // paragraphs both runs shared.
    expect(second.epiloguesSeen).toContain("vesper-warm-sworn");
    expect(second.epiloguesSeen).toContain("vesper-spent");
    expect(new Set(second.epiloguesSeen).size).toBe(
      second.epiloguesSeen.length,
    );
    expect(second.completions).toBe(2);
  });

  it("puts every authored companion thread within a run's reach", () => {
    // Nothing in the crew's epilogue is unreachable content: each
    // thread is the one selected for at least one outcome.
    const reachable = new Set<string>();
    for (const companion of COMPANIONS) {
      for (const loyalty of LOYALTY_BANDS) {
        for (const bond of BONDS) {
          for (const close of [...BOND_OUTCOMES, undefined]) {
            for (const call of VAULT_CALLS) {
              const flags: Record<string, FlagValue> = {};
              if (bond) flags[companion.personalScene.resolvedFlag] = bond;
              if (close) flags[companion.bondScene.resolvedFlag] = close;
              if (call) flags["vent-vault-call"] = call;
              for (const id of fateFor(
                walking(companion.id, loyalty, flags),
                companion.id,
              )) {
                reachable.add(id);
              }
            }
          }
        }
      }
    }
    for (const vignette of epilogueVignettes) {
      if (!["vesper", "sill"].includes(vignette.subject)) continue;
      expect(reachable, `${vignette.id} can never be selected`).toContain(
        vignette.id,
      );
    }
  });
});
