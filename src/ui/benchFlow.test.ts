// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findArcByNode } from "../data/story";
import { applyChoice, requireNode } from "../narrative";
import {
  addItem,
  equippedWeaponProfile,
  type ItemStack,
} from "../inventory";
import {
  createMemoryStorage,
  createNewGame,
  loadGame,
  saveGame,
  type GameState,
} from "../state";
import { createGameScreen } from "./gameScreen";
import { initScreenRouter, setFallbackScreen, showScreen } from "./screen";
import { createMainMenuScreen } from "./mainMenu";
import { createSession } from "./session";

/**
 * The bench as the player reaches it: the market's `vm-bench` node is
 * the only door, its "put your weapon on the bench" choice opens the
 * real workbench overlay through the game screen, and closing it comes
 * back to the same beat.
 */

/** A value whose every property/call yields another such value — enough
 * to satisfy the canvas 2D API without rendering anything. */
function anything(): unknown {
  const fn = (): unknown => anything();
  return new Proxy(fn, {
    get: (_target, prop) =>
      prop === Symbol.toPrimitive ? () => 0 : anything(),
    set: () => true,
    apply: () => anything(),
  });
}

let root: HTMLElement;

beforeEach(() => {
  document.body.innerHTML =
    '<canvas id="iso-canvas"></canvas><div id="ui-root"></div>';
  root = document.getElementById("ui-root")!;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => anything() as CanvasRenderingContext2D,
  );
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  localStorage.clear();
  initScreenRouter(root);
  setFallbackScreen(createMainMenuScreen);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function state(): GameState {
  const base = createNewGame({ playerName: "Test", seed: 5 });
  return {
    ...base,
    location: "vertical-market",
    credits: 400,
    inventory: addItem(base.inventory, "mod-gyro-sleeve", 1),
  };
}

describe("the bench beat", () => {
  it("is authored on exactly one node, and that node is the market's", () => {
    const arc = findArcByNode("vm-bench");
    expect(arc?.id).toBe("vertical-market");
    // "Only at a bench" is enforced by there being one door: if a
    // second arc ever authors open-workbench, this fails and the rule
    // has to be stated somewhere other than in the content.
    const doors = (arc?.nodes ?? []).flatMap((node) =>
      node.choices.filter((choice) =>
        (choice.effects ?? []).some((e) => e.type === "open-workbench"),
      ),
    );
    expect(doors.map((c) => c.id)).toEqual(["bench-work"]);
  });

  it("reports the handoff, and comes back to the same beat", () => {
    const node = requireNode(findArcByNode("vm-bench")!, "vm-bench");
    const outcome = applyChoice(state(), node, "bench-work");
    expect(outcome.workbench).toBe(true);
    expect(outcome.nextNodeId).toBe("vm-bench");
    expect(outcome.state.flags["bench-known"]).toBe(true);
  });

  it("empties the scrap bin exactly once", () => {
    const arc = findArcByNode("vm-bench")!;
    const node = requireNode(arc, "vm-bench");
    const tech = state();
    const first = applyChoice(
      { ...tech, player: { ...tech.player, stats: { ...tech.player.stats, tech: 7 } } },
      node,
      "bench-scrap",
    );
    expect(first.state.flags["bench-scrap"]).toBe(true);
    // The gate is a flag-not-equals, so the second visit cannot take it.
    expect(() =>
      applyChoice(first.state, node, "bench-scrap"),
    ).toThrowError(/requirements/i);
  });

  it("opens the real bench screen from the game screen", () => {
    const session = createSession(state(), createMemoryStorage());
    showScreen(createGameScreen({ session, dialogueNodeId: "vm-bench" }));

    const dialogue = root.querySelector(".nf-dialogue");
    expect(dialogue?.textContent).toContain("Bench is open");
    const open = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.includes("Put your weapon on the bench"),
    );
    expect(open).toBeDefined();
    open!.click();

    const bench = root.querySelector(".nf-workbench");
    expect(bench).not.toBeNull();
    expect(bench?.textContent).toContain("Rig-Up Bench");

    // Fit the sleeve into the starting knife's grip socket, then close.
    const fitSocket = [
      ...root.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent === "Fit a part");
    fitSocket!.click();
    const fit = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent === "Fit",
    );
    fit!.click();
    expect(session.state.player.equipment.weaponMods).toEqual([
      "mod-gyro-sleeve",
    ]);
    // A grip part shapes the character, not the weapon's own figures.
    expect(equippedWeaponProfile(session.state.player)).toEqual({
      name: "Shard Knife",
      damage: 4,
      rangeType: "melee",
    });

    const done = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent === "Done [Esc]",
    );
    done!.click();
    expect(root.querySelector(".nf-workbench")).toBeNull();
    expect(root.querySelector(".nf-dialogue")?.textContent).toContain(
      "Bench is open",
    );
  });

  it("keeps the part on the weapon through the session's autosave", () => {
    const session = createSession(state(), createMemoryStorage());
    showScreen(createGameScreen({ session, dialogueNodeId: "vm-bench" }));
    [...root.querySelectorAll<HTMLButtonElement>("button")]
      .find((b) => b.textContent?.includes("Put your weapon on the bench"))!
      .click();
    [...root.querySelectorAll<HTMLButtonElement>("button")]
      .find((b) => b.textContent === "Fit a part")!
      .click();
    [...root.querySelectorAll<HTMLButtonElement>("button")]
      .find((b) => b.textContent === "Fit")!
      .click();

    saveGame(session.state, "slot1", session.storage, 1);
    const reloaded = loadGame("slot1", session.storage);
    expect(reloaded.player.equipment.weaponMods).toEqual(["mod-gyro-sleeve"]);
    const stacks: ItemStack[] = reloaded.inventory.stacks;
    expect(stacks.some((s) => s.itemId === "mod-gyro-sleeve")).toBe(false);
  });
});
