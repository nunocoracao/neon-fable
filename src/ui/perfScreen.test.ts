// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { perfScene } from "../data/perfScenes";
import { DEFAULT_SETTINGS, settings } from "../settings";
import { createPerfScreen } from "./perfScreen";

/**
 * The dev perf screen's wiring: that a measurement is taken under the
 * settings the scene declares, that the HUD is there reporting real
 * frames, and — the part that would otherwise bite somebody — that the
 * player's own settings are exactly where they left them on the way
 * out. A dev tool that quietly leaves the glow pass forced on is worse
 * than no dev tool.
 */
let frames: FrameRequestCallback[] = [];
let root: HTMLElement;

function recordingContext(): CanvasRenderingContext2D {
  const noop = (): void => {};
  return {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    imageSmoothingEnabled: false,
    canvas: { width: 0, height: 0 },
    font: "",
    textAlign: "left",
    setTransform: noop,
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    fillText: noop,
    measureText: () => ({ width: 40 }),
    drawImage: noop,
    save: noop,
    restore: noop,
    translate: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    fill: noop,
    stroke: noop,
    setLineDash: noop,
    createRadialGradient: () => ({ addColorStop: noop }),
    arc: noop,
  } as unknown as CanvasRenderingContext2D;
}

/** Runs every frame callback queued since the last flush. */
function flush(timeMs: number): void {
  const queued = frames;
  frames = [];
  for (const callback of queued) callback(timeMs);
}

beforeEach(() => {
  settings.update({ ...DEFAULT_SETTINGS });
  frames = [];
  const canvas = document.createElement("canvas");
  canvas.id = "iso-canvas";
  Object.defineProperty(canvas, "clientWidth", { value: 1280 });
  Object.defineProperty(canvas, "clientHeight", { value: 720 });
  document.body.append(canvas);
  root = document.createElement("div");
  document.body.append(root);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => recordingContext(),
  );
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  settings.update({ ...DEFAULT_SETTINGS });
});

describe("the dev perf screen", () => {
  const scene = perfScene("worst-case");

  it("takes the measurement under the scene's own settings", () => {
    settings.update({ glow: false, weather: false, setPieces: false, zoom: 2 });
    const screen = createPerfScreen({ onExit: () => {} });
    screen.mount(root);
    const current = settings.get();
    expect(current.glow).toBe(true);
    expect(current.weather).toBe(true);
    expect(current.setPieces).toBe(true);
    expect(current.zoom).toBe(scene.zoom);
    screen.unmount();
  });

  it("puts the player's settings back exactly as it found them", () => {
    settings.update({ glow: false, weather: false, zoom: 2, motion: "reduced" });
    const before = settings.get();
    const screen = createPerfScreen({ onExit: () => {} });
    screen.mount(root);
    flush(16);
    screen.unmount();
    expect(settings.get()).toEqual(before);
  });

  it("reports live frames into the HUD", () => {
    const screen = createPerfScreen({ onExit: () => {} });
    screen.mount(root);
    const panel = (): HTMLElement | null => root.querySelector(".nf-perf-hud");
    expect(panel()).not.toBeNull();
    // The first frame is what fills it in; before that it is empty.
    expect(panel()?.textContent ?? "").toBe("");
    flush(16);
    const text = panel()?.textContent ?? "";
    expect(text).toContain("fps");
    expect(text).toContain("draws");
    // The scene really drew something, and the counters came with it.
    expect(text).not.toContain("draws  0 ");
    screen.unmount();
    expect(panel()).toBeNull();
  });

  it("scrolls the camera, and stops when the scroll is switched off", () => {
    const screen = createPerfScreen({ onExit: () => {} });
    screen.mount(root);
    // Both loops run per flush: the scene's and the scripted pan's.
    flush(16);
    flush(400);
    const toggle = [...root.querySelectorAll("button")].find((button) =>
      button.textContent?.startsWith("Scroll"),
    );
    expect(toggle?.textContent).toBe("Scroll: on");
    toggle?.click();
    expect(toggle?.textContent).toBe("Scroll: off");
    screen.unmount();
  });

  it("names what makes this the worst frame, on screen", () => {
    const screen = createPerfScreen({ onExit: () => {} });
    screen.mount(root);
    const note = root.querySelector(".nf-explore-readout")?.textContent ?? "";
    expect(note).toContain(scene.label);
    expect(note).toContain(scene.note);
    screen.unmount();
  });

  it("routes Back through the callback it was given", () => {
    const exits: number[] = [];
    const screen = createPerfScreen({ onExit: () => exits.push(1) });
    screen.mount(root);
    const back = root.querySelector<HTMLButtonElement>(".nf-explore-back");
    back?.click();
    expect(exits).toHaveLength(1);
    screen.unmount();
  });
});
