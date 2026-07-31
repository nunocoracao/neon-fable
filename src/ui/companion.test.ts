// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { baseStats } from "../character";
import { fixtureCharacter } from "../character/testSupport";
import { activeCombatant, createCombat, allyCombatantId } from "../combat";
import { companionSpriteId } from "../data";
import * as iso from "../iso";
import type { CombatSceneEntity, IsoSceneOptions } from "../iso";
import {
  createNewGame,
  getMember,
  recruitCompanion,
  type GameState,
} from "../state";
import { createCombatScreen } from "./combatScreen";
import { createGameScreen } from "./gameScreen";
import { initScreenRouter, showScreen } from "./screen";
import { createSession } from "./session";

/**
 * The companion as the player meets her: walking behind them on a map,
 * and standing in the initiative rail with her own turn to spend.
 *
 * The engine's own tests prove the party rules; this one drives the real
 * screens and asks what is on them — a follower handed to the scene, a
 * face in the rail, an ally body on the arena, and her turn taken
 * through the same buttons and arrow keys the player's is.
 */

const ENCOUNTER_ID = "enc-quays-salvage";
const VESPER_ID = allyCombatantId("vesper");

/** Entity lists the combat screen has pushed to the scene, newest last. */
let entityPushes: CombatSceneEntity[][] = [];
/** Options the exploration scene was built with. */
let sceneOptions: IsoSceneOptions | null = null;
/** The exploration scenes built so far, newest last. */
let sceneHandles: iso.IsoScene[] = [];

function anything(): unknown {
  const fn = (): unknown => anything();
  return new Proxy(fn, {
    get: (_target, prop) =>
      prop === Symbol.toPrimitive ? () => 0 : anything(),
    set: () => true,
    apply: () => anything(),
  });
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").trim().startsWith(text),
  );
}

function click(text: string): void {
  const button = buttonByText(text);
  if (!button) throw new Error(`no button labelled "${text}"`);
  if (button.disabled) throw new Error(`button "${text}" is disabled`);
  button.click();
}

function pressKey(key: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key }));
}

function chipNames(): string[] {
  return [...document.querySelectorAll(".nf-init-name")].map(
    (el) => el.textContent ?? "",
  );
}

function statusText(): string {
  return document.querySelector(".nf-combat-status")?.textContent ?? "";
}

/** The latest view the scene holds of one body on the board. */
function entity(id: string): CombatSceneEntity | undefined {
  return entityPushes.at(-1)?.find((e) => e.id === id);
}

/**
 * A slow-handed player, so the companion (Reflexes 7) takes the crew's
 * first turn and the screen is sitting on *her* turn after mount.
 */
function crewState(seed = 3): GameState {
  const allocation = baseStats();
  allocation.body += 5;
  allocation.tech += 5;
  allocation.intelligence += 5;
  const state = createNewGame({
    character: fixtureCharacter({ allocation }),
    seed,
  });
  return {
    ...state,
    location: "flooded-quays",
    party: recruitCompanion(state.party, "vesper"),
  };
}

beforeEach(() => {
  document.body.innerHTML =
    '<canvas id="iso-canvas"></canvas><div id="ui-root"></div>';
  entityPushes = [];
  sceneOptions = null;
  sceneHandles = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => anything() as CanvasRenderingContext2D,
  );
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const realCombatScene = iso.createCombatScene;
  vi.spyOn(iso, "createCombatScene").mockImplementation((canvas, options) => {
    const scene = realCombatScene(canvas, options);
    return {
      ...scene,
      setEntities(views: CombatSceneEntity[]): void {
        entityPushes.push(views);
        scene.setEntities(views);
      },
    };
  });
  const realIsoScene = iso.createIsoScene;
  vi.spyOn(iso, "createIsoScene").mockImplementation((canvas, options) => {
    sceneOptions = options;
    const scene = realIsoScene(canvas, options);
    sceneHandles.push(scene);
    return scene;
  });
  localStorage.clear();
  initScreenRouter(document.getElementById("ui-root")!);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("walking with a companion", () => {
  it("hands the scene the companion's own sprite to trail the player with", () => {
    showScreen(createGameScreen({ session: createSession(crewState()) }));
    expect(sceneOptions?.followerSpriteId).toBe(
      companionSpriteId("vesper", "quays-runner"),
    );
  });

  it("walks alone when nobody has joined", () => {
    const solo = createNewGame({ character: fixtureCharacter({}), seed: 3 });
    showScreen(
      createGameScreen({
        session: createSession({ ...solo, location: "flooded-quays" }),
      }),
    );
    expect(sceneOptions?.followerSpriteId).toBeNull();
  });

  it("falls in the moment she is recruited, not the next map over", () => {
    // The whole recruitment beat, played through the real dialogue box
    // on the real map: talk to her on the strand, take the handle, say
    // yes — and she is walking with you when the box closes.
    const solo = createNewGame({ character: fixtureCharacter({}), seed: 3 });
    const session = createSession({ ...solo, location: "flooded-quays" });
    showScreen(createGameScreen({ session }));
    expect(sceneOptions?.followerSpriteId).toBeNull();

    const scene = sceneHandles.at(-1)!;
    const followers: Array<string | null> = [];
    scene.setFollower = (id: string | null): void => void followers.push(id);

    sceneOptions!.onInteract({
      interactableId: "quays-kade",
      interaction: { kind: "dialogue", nodeId: "fq-kade" },
    });
    click("Get a hand on the other handle");
    click("\"You don't owe me.");
    click("\"Then keep up.\"");

    expect(getMember(session.state.party, "vesper")?.recruited).toBe(true);
    expect(followers.at(-1)).toBe(companionSpriteId("vesper", "quays-runner"));
  });

  it("is not an interactable: nothing on the map is the companion", () => {
    // The follower is scenery to input — it is never placed among the
    // map's interactables, so it can neither be clicked nor block one.
    showScreen(createGameScreen({ session: createSession(crewState()) }));
    const map = sceneOptions!.map;
    expect(
      map.interactables.some((i) => i.id.startsWith("ally:")),
      "no ally interactable",
    ).toBe(false);
    // The quays' own fixtures are all still there to be walked up to.
    expect(map.interactables.map((i) => i.id)).toContain("quays-cage");
  });
});

describe("fighting with a companion", () => {
  function openFight(state = crewState()): ReturnType<typeof createSession> {
    const session = createSession(state);
    showScreen(
      createCombatScreen({
        session,
        encounterId: ENCOUNTER_ID,
        resumeNodeId: null,
        enemyDelayMs: 0,
      }),
    );
    return session;
  }

  it("puts her in the rail with a portrait of her own", () => {
    openFight();
    expect(chipNames()).toContain("Vesper Kade");
    const chip = [...document.querySelectorAll(".nf-init-chip")].find(
      (el) => el.querySelector(".nf-init-name")?.textContent === "Vesper Kade",
    );
    expect(chip?.classList.contains("nf-init-ally")).toBe(true);
    expect(chip?.querySelector("canvas.nf-portrait")).not.toBeNull();
  });

  it("stands her on the arena beside the player, drawn as herself", () => {
    openFight();
    const ally = entity(VESPER_ID);
    expect(ally?.spriteId).toBe(companionSpriteId("vesper", "quays-runner"));
    expect(ally?.alive).toBe(true);
    const player = entity("player")!;
    expect(ally?.position).not.toEqual(player.position);
  });

  it("gives the player her turn, and says whose turn it is", () => {
    const session = openFight();
    const combat = createCombat(session.state, ENCOUNTER_ID);
    expect(activeCombatant(combat).id).toBe(VESPER_ID);

    // Her hp on the status row, her chip lit, her body active.
    expect(statusText()).toContain("Vesper Kade — HP");
    expect(entity(VESPER_ID)?.active).toBe(true);
    // And the bar is live: it is a turn to spend, not a turn to watch.
    expect(buttonByText("End Turn")?.disabled).toBe(false);
    expect(buttonByText("Move")?.disabled).toBe(false);
  });

  it("moves her with the same arrow keys the player is moved with", () => {
    openFight();
    const before = entity(VESPER_ID)!.position;
    pressKey("ArrowUp");
    const after = entity(VESPER_ID)!.position;
    expect(after).toEqual({ x: before.x, y: before.y - 1 });
    // The player did not budge — the keys drive whoever is acting.
    expect(entity("player")!.position).toEqual(entityPushes[0]![0]!.position);
  });

  it("hands the turn on to the player when she is done", () => {
    openFight();
    click("End Turn");
    expect(statusText()).not.toContain("Vesper Kade — HP");
    expect(entity("player")?.active).toBe(true);
    expect(entity(VESPER_ID)?.active).toBe(false);
  });

  it("keeps the player's kit out of her hands", () => {
    openFight();
    // Items are the player's own; her turn offers none.
    expect(buttonByText("Item")?.disabled).toBe(true);
    expect(buttonByText("Flee")?.disabled).toBe(true);
  });
});
