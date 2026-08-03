// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HUB_MAP_ID, requireMap } from "../data";
import type { Camera, IsoScene, ScenePhotoView } from "../iso";
import { createShotCounter } from "./photoModel";
import { createPhotoOverlay, type PhotoOverlayHandle } from "./photoOverlay";

/**
 * The strip's wiring: that every control reaches the scene, that the
 * keys mean what the hint line says they mean, and — the one that would
 * cost a player something if it broke — that putting photo mode away
 * hands the scene back the camera it came in with and nothing else.
 *
 * The scene is a recorder rather than a real one: what is being checked
 * here is what the strip *asks for*, and what a scene does with the
 * asking is pinned in src/iso/scenePhoto.test.ts.
 */

const map = requireMap(HUB_MAP_ID);
const PRIOR_CAMERA: Camera = { sx: 320, sy: 180 };

interface FakeScene extends IsoScene {
  views: (ScenePhotoView | null)[];
  cameras: Camera[];
  captures: number[];
  /** What the scene hands back when asked for a frame; null for none. */
  frame: HTMLCanvasElement | null;
}

function fakeScene(): FakeScene {
  const scene: FakeScene = {
    views: [],
    cameras: [],
    captures: [],
    frame: null,
    setFollower: () => {},
    setDayPhase: () => {},
    playOpening: () => false,
    setCrouched: () => {},
    placePlayer: () => {},
    setCamera(point): void {
      scene.cameras.push(point);
    },
    viewCamera: () => ({ ...PRIOR_CAMERA }),
    setPhoto(view): void {
      scene.views.push(view);
    },
    captureFrame(supersample = 1): HTMLCanvasElement | null {
      scene.captures.push(supersample);
      return scene.frame;
    },
    destroy: () => {},
  };
  return scene;
}

let canvas: HTMLCanvasElement;
let scene: FakeScene;
let overlay: PhotoOverlayHandle;
let exits: number;

function open(): void {
  exits = 0;
  overlay = createPhotoOverlay({
    canvas,
    scene,
    map,
    prior: {
      camera: { ...PRIOR_CAMERA },
      zoom: 1,
      dayPhase: "dusk",
      weather: true,
    },
    onExit: () => {
      exits += 1;
    },
    shots: createShotCounter(),
  });
  document.body.append(overlay.el);
}

function press(key: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

function control(className: string): HTMLButtonElement {
  const button = overlay.el.querySelector(`.${className}`);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`No ${className} control on the strip`);
  }
  return button;
}

/** The most recent framing the scene was handed. */
function pushed(): ScenePhotoView {
  const view = scene.views.at(-1);
  if (!view) throw new Error("The scene was never handed a framing");
  return view;
}

beforeEach(() => {
  canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "clientWidth", { value: 1280 });
  Object.defineProperty(canvas, "clientHeight", { value: 720 });
  canvas.setPointerCapture = (): void => {};
  canvas.releasePointerCapture = (): void => {};
  document.body.append(canvas);
  scene = fakeScene();
  open();
});

afterEach(() => {
  overlay.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("opening the strip", () => {
  it("frames what the player was already looking at", () => {
    const view = pushed();
    expect(view.camera).toEqual(PRIOR_CAMERA);
    expect(view.zoom).toBe(1);
    expect(view.dayPhase).toBe("dusk");
    expect(view.weather).toBe(true);
    expect(view.hideCharacters).toBe(false);
  });

  it("names itself and says which key does what", () => {
    expect(overlay.el.getAttribute("aria-label")).toBeTruthy();
    expect(overlay.el.querySelector(".nf-photo-hints")?.textContent).toContain(
      "Esc",
    );
  });
});

describe("framing controls", () => {
  it("zooms past the level the game itself plays at", () => {
    control("nf-photo-zoom-in").click();
    expect(pushed().zoom).toBe(1.5);
    control("nf-photo-zoom-in").click();
    control("nf-photo-zoom-in").click();
    expect(pushed().zoom).toBe(3);
    // And stops there rather than running off the ladder.
    control("nf-photo-zoom-in").click();
    expect(pushed().zoom).toBe(3);
    expect(overlay.el.querySelector(".nf-photo-zoom")?.textContent).toContain(
      "3",
    );
  });

  it("cycles the hour and says which one is staged", () => {
    const hour = control("nf-photo-hour");
    const before = hour.textContent;
    hour.click();
    expect(pushed().dayPhase).toBe("night");
    expect(hour.textContent).not.toBe(before);
  });

  it("switches the rain and the people, and says which way", () => {
    const weather = control("nf-photo-weather");
    weather.click();
    expect(pushed().weather).toBe(false);
    expect(weather.getAttribute("aria-pressed")).toBe("false");

    const people = control("nf-photo-people");
    people.click();
    expect(pushed().hideCharacters).toBe(true);
    expect(people.getAttribute("aria-pressed")).toBe("true");
  });

  it("pans within the district and never past it", () => {
    const start = pushed().camera;
    press("ArrowRight");
    expect(pushed().camera.sx).toBeGreaterThan(start.sx);
    for (let i = 0; i < 500; i += 1) press("ArrowRight");
    const east = pushed().camera;
    press("ArrowRight");
    expect(pushed().camera).toEqual(east);
  });

  it("takes the keys the hint line promises", () => {
    press("]");
    expect(pushed().dayPhase).toBe("night");
    press("[");
    expect(pushed().dayPhase).toBe("dusk");
    press("r");
    expect(pushed().weather).toBe(false);
    press("h");
    expect(pushed().hideCharacters).toBe(true);
    press("+");
    expect(pushed().zoom).toBe(1.5);
    press("-");
    expect(pushed().zoom).toBe(1);
  });

  it("leaves the scene's own keys alone when a modifier is held", () => {
    const before = scene.views.length;
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "r", ctrlKey: true }),
    );
    expect(scene.views.length).toBe(before);
  });
});

describe("taking the shot", () => {
  it("asks for the screen's own resolution by default", async () => {
    control("nf-photo-capture").click();
    await Promise.resolve();
    expect(scene.captures).toEqual([1]);
  });

  it("asks for double when double is switched on", async () => {
    control("nf-photo-supersample").click();
    expect(pushed()).toBeTruthy();
    control("nf-photo-capture").click();
    await Promise.resolve();
    expect(scene.captures).toEqual([2]);
  });

  it("says so when the browser will not save one", async () => {
    control("nf-photo-capture").click();
    await Promise.resolve();
    await Promise.resolve();
    const status = overlay.el.querySelector(".nf-photo-status");
    expect(status?.textContent).toBeTruthy();
    expect(status?.getAttribute("aria-live")).toBe("polite");
  });
});

describe("leaving", () => {
  it("asks whoever opened it to close it, rather than closing itself", () => {
    press("Escape");
    expect(exits).toBe(1);
    // Still up: the game screen owns the teardown, and the HUD it took
    // away has to come back in the same breath.
    expect(document.body.contains(overlay.el)).toBe(true);
    control("nf-photo-exit").click();
    expect(exits).toBe(2);
  });

  it("hands the scene back the camera it came in with", () => {
    press("]");
    press("h");
    for (let i = 0; i < 10; i += 1) press("ArrowLeft");
    control("nf-photo-zoom-in").click();
    expect(pushed().camera).not.toEqual(PRIOR_CAMERA);

    overlay.destroy();
    expect(scene.views.at(-1)).toBeNull();
    expect(scene.cameras.at(-1)).toEqual(PRIOR_CAMERA);
    // And it stops listening: a key after the teardown reaches nothing.
    const settled = scene.views.length;
    press("]");
    expect(scene.views.length).toBe(settled);
  });
});
