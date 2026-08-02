// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HUB_MAP_ID, requireMap } from "../data/maps";
import { ambientSpriteSource } from "../ui/entitySprites";
import { createCrowd, crowdEntities } from "./ambient";
import { createPixelArtSprites } from "./art/provider";
import { mapPixelBounds } from "./camera";
import { collectGlowPlacements } from "./glowPass";
import { clearRenderCounters, createRenderCounters } from "./perf";
import { renderScene, type RenderView } from "./render";
import { collectSetPieces, setPieceGlows } from "./setpiece";
import { resolveWeather } from "./weather";

/**
 * The frame counters, through the real renderer. What is under test is
 * that the HUD's numbers are the frame's numbers: `draws` is every
 * drawImage the frame issued, and every drawn/culled pair adds back up
 * to everything the pass was offered. A counter that drifts from what
 * the renderer did is worse than no counter — it is a measurement
 * people would act on.
 */
function countingContext(counts: { draws: number }): CanvasRenderingContext2D {
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
    measureText: () => ({ width: 40 }),
    fillText: noop,
    drawImage: (): void => {
      counts.draws++;
    },
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

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() =>
    countingContext({ draws: 0 }),
  );
});
afterEach(() => vi.restoreAllMocks());

const map = requireMap(HUB_MAP_ID);
const bounds = mapPixelBounds(map);
const TIME_MS = 4200;

interface Frame {
  draws: number;
  counters: ReturnType<typeof createRenderCounters>;
  view: RenderView;
}

function frame(camera: { sx: number; sy: number }, viewport = 1280): Frame {
  const counts = { draws: 0 };
  const ctx = countingContext(counts);
  const sprites = createPixelArtSprites({ entity: ambientSpriteSource() });
  const counters = createRenderCounters();
  clearRenderCounters(counters);
  const view: RenderView = {
    map,
    camera,
    viewportW: viewport,
    viewportH: Math.round((viewport * 9) / 16),
    hoverTile: { x: 5, y: 5 },
    path: [],
    entities: [
      { spriteId: "player", position: { x: 7, y: 6 }, facing: "s", moving: true },
      ...crowdEntities(createCrowd(map)),
    ],
    timeMs: TIME_MS,
    dpr: 2,
    zoom: 1,
    glowEnabled: true,
    weather: resolveWeather(map, { enabled: true, weather: "rain" }),
    setPieces: collectSetPieces(map, TIME_MS, { rain: true }),
    counters,
  };
  renderScene(ctx, sprites, view);
  return { draws: counts.draws, counters, view };
}

const CENTER = {
  sx: (bounds.minX + bounds.maxX) / 2,
  sy: (bounds.minY + bounds.maxY) / 2,
};
/** Far enough away that no part of the map can reach the viewport. */
const ELSEWHERE = { sx: bounds.maxX + 100000, sy: bounds.maxY + 100000 };

describe("frame counters", () => {
  it("counts every drawImage the frame issued, and no others", () => {
    const { draws, counters } = frame(CENTER);
    expect(counters.draws).toBe(draws);
    expect(draws).toBeGreaterThan(0);
  });

  it("accounts for every tile the map has, drawn or culled", () => {
    const { counters } = frame(CENTER);
    expect(counters.groundDrawn + counters.groundCulled).toBe(
      map.width * map.height,
    );
    expect(counters.groundDrawn).toBeGreaterThan(0);
  });

  it("accounts for every object the frame was offered", () => {
    const { counters, view } = frame(CENTER);
    const offered =
      map.props.length +
      map.interactables.length +
      view.entities.length +
      (view.setPieces?.length ?? 0);
    expect(counters.objectsDrawn + counters.objectsCulled).toBe(offered);
  });

  it("accounts for every glow the pass placed", () => {
    const { counters, view } = frame(CENTER);
    const placed =
      collectGlowPlacements(map, TIME_MS, view.weather ?? null, "night").length +
      setPieceGlows(view.setPieces ?? [], "night").length;
    expect(counters.glowsDrawn + counters.glowsCulled).toBe(placed);
  });

  it("culls nothing when the whole district is framed", () => {
    const { counters } = frame(CENTER, 5000);
    expect(counters.groundCulled).toBe(0);
    expect(counters.objectsCulled).toBe(0);
    expect(counters.glowsCulled).toBe(0);
    expect(counters.groundDrawn).toBe(map.width * map.height);
  });

  it("culls all of it when the camera is somewhere else entirely", () => {
    const { counters } = frame(ELSEWHERE);
    expect(counters.groundDrawn).toBe(0);
    expect(counters.objectsDrawn).toBe(0);
    expect(counters.glowsDrawn).toBe(0);
    // The rain curtain is screen-space and falls in front of the camera
    // wherever it is pointed, so the frame is not empty.
    expect(counters.draws).toBeGreaterThan(0);
  });

  it("culls more of the same scene the closer the view zooms", () => {
    const wide = frame(CENTER, 1280).counters;
    const narrow = frame(CENTER, 400).counters;
    expect(narrow.groundDrawn).toBeLessThan(wide.groundDrawn);
    expect(narrow.glowsDrawn).toBeLessThan(wide.glowsDrawn);
    expect(narrow.draws).toBeLessThan(wide.draws);
  });
});
