import { describe, expect, it } from "vitest";
import { applyChoice } from "../../narrative";
import { createNewGame, type GameState } from "../../state";
import { countItem } from "../../inventory";
import { dressMap, mapDressings } from "../mapDressing";
import { requireMap } from "../maps";
import { breachArc } from "./breach";
import { storyArcs } from "./index";

/**
 * The two scenes a breached terminal opens. Graph soundness is covered
 * by validate.test.ts over every registered arc; what is pinned here is
 * the promise this arc makes — that neither scene is reachable except
 * through a breach, that each is a *third* key rather than the only
 * one, and that each pays exactly once however many times it is walked
 * back into.
 */

const nodesById = new Map(breachArc.nodes.map((node) => [node.id, node]));

/** Every node the world opens directly: one per re-pointed fixture. */
const doorways = [breachArc.entryNodeId, ...(breachArc.entryNodeIds ?? [])];

describe("what the lattice opened", () => {
  it("is registered so a dressed interactable can find its nodes", () => {
    expect(storyArcs).toContain(breachArc);
  });

  it("is opened only by a breach dressing, and by nothing that walks", () => {
    const dressed = mapDressings
      .filter((dressing) => doorways.includes(dressing.nodeId ?? ""))
      .map((dressing) => dressing.nodeId);
    expect(dressed.sort()).toEqual([...doorways].sort());

    // Nothing else in the game points at this arc: no map interactable
    // as authored, and no choice in any other arc.
    for (const map of [requireMap("vertical-market"), requireMap("flooded-quays")]) {
      for (const thing of map.interactables) {
        if (thing.interaction.kind !== "dialogue") continue;
        expect(doorways, `${map.id}/${thing.id}`).not.toContain(
          thing.interaction.nodeId,
        );
      }
    }
    const outsideTargets = storyArcs
      .filter((arc) => arc !== breachArc)
      .flatMap((arc) =>
        arc.nodes.flatMap((node) =>
          node.choices.flatMap((choice) => (choice.target ? [choice.target] : [])),
        ),
      );
    for (const nodeId of nodesById.keys()) {
      expect(outsideTargets, nodeId).not.toContain(nodeId);
    }
  });

  it("writes only the fixtures' own flags — nothing an act reads", () => {
    const flags = breachArc.nodes.flatMap((node) =>
      node.choices.flatMap((choice) =>
        (choice.effects ?? []).flatMap((effect) =>
          effect.type === "set-flag" || effect.type === "increment-flag"
            ? [effect.key]
            : [],
        ),
      ),
    );
    // The same two flags the authored keys write, so the chains that
    // read them later cannot tell which key was used.
    expect([...new Set(flags)].sort()).toEqual(["market-locker", "quays-cage"]);
    for (const node of breachArc.nodes) {
      for (const choice of node.choices) {
        for (const effect of choice.effects ?? []) {
          expect(effect.type, choice.id).not.toBe("start-combat");
          expect(effect.type, choice.id).not.toBe("travel");
        }
      }
    }
  });

  it("always lets the player walk away from either fixture", () => {
    for (const nodeId of doorways) {
      const node = nodesById.get(nodeId);
      expect(node, nodeId).toBeDefined();
      expect(
        (node?.choices ?? []).some((choice) =>
          (choice.effects ?? []).some((effect) => effect.type === "end"),
        ),
        nodeId,
      ).toBe(true);
    }
  });

  it.each([
    ["bz-market-locker", "cut-take", "market-locker", "con-field-kit"],
    ["bz-quays-cage", "winch-take", "quays-cage", "con-trauma-patch"],
  ])("%s pays once and then has nothing left", (nodeId, choiceId, flag, itemId) => {
    const node = nodesById.get(nodeId)!;
    const fresh: GameState = createNewGame({ seed: 5 });
    const taken = applyChoice(fresh, node, choiceId).state;
    expect(taken.flags[flag]).toBeTypeOf("string");
    expect(countItem(taken.inventory, itemId)).toBe(
      countItem(fresh.inventory, itemId) + 1,
    );
    expect(taken.credits).toBeGreaterThan(fresh.credits);

    // Walking back in finds it empty: the take is gated on the
    // fixture's own flag being unset, and it no longer is.
    const takeAgain = node.choices.find((choice) => choice.id === choiceId);
    expect(takeAgain?.requirements).toEqual([{ type: "flag-unset", key: flag }]);
  });

  it("is a third key, never the only one", () => {
    // The authored keys are untouched on both fixtures: an undressed
    // map still opens the scenes it always did.
    const market = requireMap("vertical-market");
    const quays = requireMap("flooded-quays");
    expect(dressMap(market, {})).toBe(market);
    expect(dressMap(quays, {})).toBe(quays);
    for (const [map, id, nodeId] of [
      [market, "market-consignment", "vm-stash"],
      [quays, "quays-cage", "fq-cage"],
    ] as const) {
      expect(
        map.interactables.find((thing) => thing.id === id)?.interaction,
      ).toEqual({ kind: "dialogue", nodeId });
    }
  });
});
