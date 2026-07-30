// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireMap } from "../data";
import {
  MINIMAP_COLORS,
  minimapLayout,
  minimapPipKind,
  tileCenter,
  type MinimapView,
} from "../iso";
import { MINIMAP_TAB_LABEL, createMinimap, type MinimapHandle } from "./minimap";

/**
 * The minimap widget with a recording 2d context. What matters here is
 * not the picture but the contract around it: a repaint happens only when
 * the scene's view actually moved, the collapsed state paints nothing at
 * all, and the canvas is inert — no listeners, no pointer events, so
 * clicking the overview cannot do anything.
 */

interface RectDraw {
  kind: "fill" | "stroke";
  x: number;
  y: number;
  w: number;
  h: number;
  style: string;
}

let rects: RectDraw[] = [];

function recordingContext(): CanvasRenderingContext2D {
  const state = { fillStyle: "", strokeStyle: "", lineWidth: 1 };
  const ctx = {
    get fillStyle(): string {
      return state.fillStyle;
    },
    set fillStyle(value: string) {
      state.fillStyle = value;
    },
    get strokeStyle(): string {
      return state.strokeStyle;
    },
    set strokeStyle(value: string) {
      state.strokeStyle = value;
    },
    lineWidth: 1,
    imageSmoothingEnabled: true,
    setTransform: () => {},
    clearRect: () => {},
    fillRect: (x: number, y: number, w: number, h: number) =>
      rects.push({ kind: "fill", x, y, w, h, style: state.fillStyle }),
    strokeRect: (x: number, y: number, w: number, h: number) =>
      rects.push({ kind: "stroke", x, y, w, h, style: state.strokeStyle }),
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

const hub = requireMap("cinder-plaza");
const layout = minimapLayout(hub);

function view(patch: Partial<MinimapView> = {}): MinimapView {
  return {
    playerTile: { x: 7, y: 10 },
    facing: "n",
    camera: { sx: 0, sy: 0 },
    viewportW: 1280,
    viewportH: 720,
    zoom: 1,
    ...patch,
  };
}

let handles: MinimapHandle[] = [];
let toggles = 0;

function mount(open = true): MinimapHandle {
  const handle = createMinimap({
    map: hub,
    open,
    onToggle: () => {
      toggles += 1;
    },
  });
  handles.push(handle);
  document.body.append(handle.el);
  return handle;
}

function tab(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(".nf-minimap-tab");
  if (!button) throw new Error("no minimap tab");
  return button;
}

beforeEach(() => {
  rects = [];
  handles = [];
  toggles = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => recordingContext(),
  );
});

afterEach(() => {
  for (const handle of handles) handle.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("createMinimap", () => {
  it("sizes the canvas to the map's overview", () => {
    mount();
    const canvas = document.querySelector<HTMLCanvasElement>(
      ".nf-minimap-canvas",
    );
    expect(canvas?.style.width).toBe(`${layout.width}px`);
    expect(canvas?.style.height).toBe(`${layout.height}px`);
  });

  it("paints nothing until it is fed a view", () => {
    const handle = mount();
    expect(handle.redraws()).toBe(0);
    expect(rects).toHaveLength(0);
  });

  it("redraws on a move and on a camera pan, never on a still frame", () => {
    const handle = mount();
    handle.update(view());
    expect(handle.redraws()).toBe(1);

    // A hundred frames with nothing moving: the scene reports every
    // frame, the widget paints none of them.
    for (let i = 0; i < 100; i++) handle.update(view());
    expect(handle.redraws()).toBe(1);

    handle.update(view({ playerTile: { x: 7, y: 9 } }));
    expect(handle.redraws()).toBe(2);
    handle.update(view({ playerTile: { x: 7, y: 9 }, facing: "e" }));
    expect(handle.redraws()).toBe(3);
    handle.update(
      view({ playerTile: { x: 7, y: 9 }, facing: "e", camera: { sx: 40, sy: 0 } }),
    );
    expect(handle.redraws()).toBe(4);
    handle.update(
      view({ playerTile: { x: 7, y: 9 }, facing: "e", camera: { sx: 40, sy: 0 } }),
    );
    expect(handle.redraws()).toBe(4);
  });

  it("draws a cell for every tile that is not void, plus the frame", () => {
    const handle = mount();
    handle.update(view());
    const cellRects = rects.filter(
      (r) => r.kind === "fill" && r.w === layout.cell && r.h === layout.cell,
    );
    expect(cellRects.length).toBeGreaterThan(0);
    // No cell is painted in the void color: the background already is.
    expect(cellRects.some((r) => r.style === MINIMAP_COLORS.void)).toBe(false);
    expect(
      cellRects.some((r) => r.style === MINIMAP_COLORS.walkable),
    ).toBe(true);
    expect(cellRects.some((r) => r.style === MINIMAP_COLORS.water)).toBe(true);
    expect(cellRects.some((r) => r.style === MINIMAP_COLORS.blocked)).toBe(true);
    expect(
      rects.some((r) => r.kind === "stroke" && r.style === MINIMAP_COLORS.frame),
    ).toBe(true);
    expect(handle.redraws()).toBe(1);
  });

  it("marks the player, the exits, and the people it was asked to", () => {
    const handle = mount();
    handle.update(view());
    const inks = new Set(rects.filter((r) => r.kind === "fill").map((r) => r.style));
    expect(inks.has(MINIMAP_COLORS.player)).toBe(true);
    expect(inks.has(MINIMAP_COLORS.npc)).toBe(true);
    expect(inks.has(MINIMAP_COLORS.objective)).toBe(true);
    const center = tileCenter(layout, 7, 10);
    const playerRect = rects.find((r) => r.style === MINIMAP_COLORS.player);
    expect(playerRect?.x).toBe(Math.round(center.x - (playerRect?.w ?? 0) / 2));
  });

  it("strokes the camera's viewport inside the overview", () => {
    const handle = mount();
    handle.update(view());
    const frame = rects.find(
      (r) => r.kind === "stroke" && r.style === MINIMAP_COLORS.viewport,
    );
    expect(frame).toBeDefined();
    expect(frame?.x).toBeGreaterThanOrEqual(0);
    expect((frame?.x ?? 0) + (frame?.w ?? 0)).toBeLessThanOrEqual(layout.width);
    expect((frame?.y ?? 0) + (frame?.h ?? 0)).toBeLessThanOrEqual(layout.height);
  });
});

describe("collapsing", () => {
  it("starts collapsed when the setting says so, and paints nothing", () => {
    const handle = mount(false);
    expect(handle.el.classList.contains("nf-minimap-collapsed")).toBe(true);
    handle.update(view());
    expect(handle.redraws()).toBe(0);
    expect(rects).toHaveLength(0);
  });

  it("keeps its tab while collapsed", () => {
    mount(false);
    expect(tab().textContent).toBe(MINIMAP_TAB_LABEL);
    expect(tab().getAttribute("aria-pressed")).toBe("false");
  });

  it("paints the latest view the moment it expands", () => {
    const handle = mount(false);
    handle.update(view({ playerTile: { x: 3, y: 3 } }));
    expect(handle.redraws()).toBe(0);
    handle.setOpen(true);
    expect(handle.redraws()).toBe(1);
    expect(handle.el.classList.contains("nf-minimap-collapsed")).toBe(false);
    expect(tab().getAttribute("aria-pressed")).toBe("true");
  });

  it("repaints after a collapse and expand, never showing a stale picture", () => {
    const handle = mount();
    handle.update(view());
    handle.setOpen(false);
    handle.setOpen(true);
    expect(handle.redraws()).toBe(2);
  });

  it("ignores a setOpen that changes nothing", () => {
    const handle = mount();
    handle.update(view());
    handle.setOpen(true);
    expect(handle.redraws()).toBe(1);
  });

  it("asks the caller to flip the setting rather than flipping itself", () => {
    const handle = mount();
    tab().click();
    expect(toggles).toBe(1);
    // The widget waits to be told: the caller persists, then calls setOpen.
    expect(handle.el.classList.contains("nf-minimap-collapsed")).toBe(false);
  });
});

describe("the overview is read-only", () => {
  it("takes no pointer events and offers nothing to click", () => {
    mount();
    const canvas = document.querySelector<HTMLCanvasElement>(
      ".nf-minimap-canvas",
    );
    expect(canvas?.getAttribute("aria-hidden")).toBe("true");
    // The only control anywhere in the widget is the collapse tab.
    expect(document.querySelectorAll(".nf-minimap button")).toHaveLength(1);
  });

  it("does nothing at all when the overview is clicked", () => {
    const handle = mount();
    handle.update(view());
    const before = handle.redraws();
    const canvas = document.querySelector<HTMLCanvasElement>(
      ".nf-minimap-canvas",
    );
    canvas?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 20, clientY: 20 }),
    );
    expect(toggles).toBe(0);
    expect(handle.redraws()).toBe(before);
  });
});

describe("map data drives the pips", () => {
  it("marks the doors the story sends you through", () => {
    const door = hub.interactables.find((i) => i.id === "filament-door");
    expect(door?.minimap).toBe(true);
    expect(minimapPipKind(door!)).toBe("objective");
  });
});

describe("destroy", () => {
  it("leaves nothing on the page", () => {
    const handle = mount();
    handle.update(view());
    handle.destroy();
    expect(document.querySelector(".nf-minimap")).toBeNull();
  });
});
