// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireMap } from "../data/maps";
import { NEWS_HEADLINES } from "../data/world";
import { createNewGame, type GameState } from "../state";
import { createGameScreen } from "./gameScreen";
import { createMainMenuScreen } from "./mainMenu";
import { resolveDistrict } from "./district";
import { initScreenRouter, setFallbackScreen, showScreen } from "./screen";
import { createSession } from "./session";

/**
 * The street the game screen actually mounts. resolveDistrict is what
 * the screen resolves its map through, so what is pinned here is the
 * assembled result — and, at the end, that the real screen mounts on a
 * populated district without any of the map machinery (focus, minimap,
 * the crowd, the scene's own lint) tripping over somebody the world put
 * there.
 */

function anything(): unknown {
  const fn = (): unknown => anything();
  return new Proxy(fn, {
    get: (_target, prop) =>
      prop === Symbol.toPrimitive ? () => 0 : anything(),
    set: () => true,
    apply: () => anything(),
  });
}

function state(flags: GameState["flags"] = {}): GameState {
  const base = createNewGame({ playerName: "Vex", seed: 5 });
  return { ...base, flags: { ...base.flags, ...flags } };
}

function headline(id: string): string {
  const found = NEWS_HEADLINES.find((h) => h.id === id);
  if (!found) throw new Error(`no headline "${id}"`);
  return found.text;
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => anything() as unknown as CanvasRenderingContext2D,
  );
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  document.body.innerHTML =
    '<canvas id="iso-canvas"></canvas><div id="ui-root"></div>';
  const canvas = document.getElementById("iso-canvas") as HTMLCanvasElement;
  Object.defineProperty(canvas, "clientWidth", { value: 960 });
  Object.defineProperty(canvas, "clientHeight", { value: 640 });
  localStorage.clear();
  initScreenRouter(document.getElementById("ui-root")!);
  setFallbackScreen(createMainMenuScreen);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("resolveDistrict", () => {
  it("hands back the authored map on a run that has changed nothing", () => {
    const district = resolveDistrict(state(), "cinder-plaza");
    expect(district.map).toBe(requireMap("cinder-plaza"));
    expect(district.world.conditions).toEqual(["streets-calm", "warrant-clear"]);
  });

  it("puts the world's people on the street the screen will draw", () => {
    const district = resolveDistrict(state({ "act1-outcome": "voss" }), "cinder-plaza");
    expect(district.map.interactables.map((i) => i.id)).toContain(
      "hub-syndicate-watch",
    );
  });

  it("keeps the story's dressing as well as the world's", () => {
    // Both passes land on one map: an interactable a settled side chain
    // re-pointed is still re-pointed on a populated district.
    const dressed = resolveDistrict(
      state({ "under-waterline-partner": true }),
      "flooded-quays",
    );
    const diver = dressed.map.interactables.find((i) => i.id === "quays-diver");
    expect(diver?.interaction).toEqual({
      kind: "dialogue",
      nodeId: "uw-settled-partner",
    });
  });

  it("resolves a running order for every screen the map carries", () => {
    const district = resolveDistrict(state({ "cordon-broken": true }), "cinder-plaza");
    const ids = (district.map.screens ?? []).map((s) => s.id);
    expect(ids).toEqual(["plaza-board", "row-sign"]);
    for (const id of ids) {
      expect(district.newsStrips[id]).toContain(headline("cordon-down"));
    }
    // Two boards, one pool, different orders — never one screen twice.
    expect(district.newsStrips["plaza-board"]).not.toEqual(
      district.newsStrips["row-sign"],
    );
  });

  it("leaves an unscreened district with no strips at all", () => {
    expect(resolveDistrict(state(), "greywater-steps").newsStrips).toEqual({});
  });
});

describe("the game screen on a changed street", () => {
  it("mounts the hub after the courier job without tripping over the picket", () => {
    const changed = state({ "spike-delivered": true });
    expect(
      resolveDistrict(changed, "cinder-plaza").map.interactables.map((i) => i.id),
    ).toContain("hub-picket");
    showScreen(createGameScreen({ session: createSession(changed, localStorage) }));
    // The screen is up, on the hub, with its HUD reading the district it
    // resolved — the map with the picket standing on it.
    expect(document.querySelector(".nf-hud")).not.toBeNull();
    expect(document.body.textContent).toContain("Cinder Row Plaza");
  });

  it("mounts the hub after the Cordon, with the ambusher gone", () => {
    const changed = state({ "cordon-broken": true });
    expect(
      resolveDistrict(changed, "cinder-plaza").map.interactables.map((i) => i.id),
    ).not.toContain("rust-runner");
    showScreen(createGameScreen({ session: createSession(changed, localStorage) }));
    expect(document.querySelector(".nf-hud")).not.toBeNull();
  });

  it("mounts a district with every reaction it has live at once", () => {
    const changed = state({
      "spike-delivered": true,
      "act1-outcome": "voss",
      "voss-ascendant": true,
      "wanted-by-auric": true,
    });
    showScreen(createGameScreen({ session: createSession(changed, localStorage) }));
    expect(document.querySelector(".nf-hud")).not.toBeNull();
  });
});
