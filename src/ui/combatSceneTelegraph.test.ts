// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireMap } from "../data";
import {
  TELEGRAPH_PAINT_ORDER,
  TELEGRAPH_PATH_LINE,
  createCombatScene,
  telegraphStyle,
  worldToScreen,
  type CombatScene,
  type TelegraphTintId,
  type TilePoint,
} from "../iso";

/**
 * How the arena paints what the engine tinted. The tints themselves are
 * the combat layer's business (src/combat/telegraph.ts); what is under
 * test here is the painting contract the task turns on: one fill and
 * one stroke per tint however many tiles carry it, the palette's own
 * colours and dashes, context tints under the hot ones, and a previewed
 * walk drawn as a dotted route rather than a scatter of tiles.
 */

const ARENA = "rustyard-arena";

/** One canvas operation the scene asked for, in the order it asked. */
type Op =
  | { kind: "beginPath" }
  | { kind: "moveTo"; x: number; y: number }
  | { kind: "lineTo"; x: number; y: number }
  | { kind: "closePath" }
  | { kind: "fill"; style: string }
  | { kind: "stroke"; style: string; lineWidth: number; dash: number[] };

/** A 2D context that records the path and paint calls and nothing else. */
function recordingContext(ops: Op[]): CanvasRenderingContext2D {
  const state = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    dash: [] as number[],
  };
  const noop = (): void => {};
  const ctx: Record<string, unknown> = {
    beginPath: () => ops.push({ kind: "beginPath" }),
    moveTo: (x: number, y: number) => ops.push({ kind: "moveTo", x, y }),
    lineTo: (x: number, y: number) => ops.push({ kind: "lineTo", x, y }),
    closePath: () => ops.push({ kind: "closePath" }),
    fill: () => ops.push({ kind: "fill", style: state.fillStyle }),
    stroke: () =>
      ops.push({
        kind: "stroke",
        style: state.strokeStyle,
        lineWidth: state.lineWidth,
        dash: [...state.dash],
      }),
    setLineDash: (dash: number[]) => {
      state.dash = [...dash];
    },
    getLineDash: () => [...state.dash],
    // Everything else the scene touches while drawing a frame.
    clearRect: noop,
    save: noop,
    restore: noop,
    translate: noop,
    setTransform: noop,
    drawImage: noop,
    fillRect: noop,
    globalAlpha: 1,
    imageSmoothingEnabled: false,
  };
  Object.defineProperty(ctx, "fillStyle", {
    get: () => state.fillStyle,
    set: (value: string) => {
      state.fillStyle = value;
    },
  });
  Object.defineProperty(ctx, "strokeStyle", {
    get: () => state.strokeStyle,
    set: (value: string) => {
      state.strokeStyle = value;
    },
  });
  Object.defineProperty(ctx, "lineWidth", {
    get: () => state.lineWidth,
    set: (value: number) => {
      state.lineWidth = value;
    },
  });
  return ctx as unknown as CanvasRenderingContext2D;
}

type FillOp = Extract<Op, { kind: "fill" }>;
type StrokeOp = Extract<Op, { kind: "stroke" }>;

/** Paint calls grouped by the path they belong to. */
interface Batch {
  moves: number;
  fills: FillOp[];
  strokes: StrokeOp[];
}

function batches(ops: Op[]): Batch[] {
  const out: Batch[] = [];
  let current: Batch | null = null;
  for (const op of ops) {
    if (op.kind === "beginPath") {
      current = { moves: 0, fills: [], strokes: [] };
      out.push(current);
      continue;
    }
    if (!current) continue;
    if (op.kind === "moveTo") current.moves += 1;
    if (op.kind === "fill") current.fills.push(op);
    if (op.kind === "stroke") current.strokes.push(op);
  }
  return out;
}

/** The batch that painted one tint, identified by its own colours. */
function batchForTint(ops: Op[], tint: TelegraphTintId): Batch | undefined {
  const style = telegraphStyle(tint);
  return batches(ops).find((batch) => {
    const filled =
      style.fill === null || batch.fills.some((f) => f.style === style.fill);
    const stroked =
      style.stroke === null ||
      batch.strokes.some((s) => s.style === style.stroke);
    const touched =
      (style.fill !== null && batch.fills.length > 0) ||
      (style.stroke !== null && batch.strokes.length > 0);
    return touched && filled && stroked;
  });
}

describe("telegraph painting", () => {
  let ops: Op[] = [];
  let frameCallback: FrameRequestCallback | null = null;
  let scene: CombatScene | null = null;

  function paintFrame(): void {
    ops.length = 0;
    frameCallback?.(1000);
  }

  function mount(telegraphBoost = false): CombatScene {
    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    return createCombatScene(canvas, {
      map: requireMap(ARENA),
      telegraphBoost,
      onTileClick: () => {},
      onTileHover: () => {},
    });
  }

  beforeEach(() => {
    ops = [];
    frameCallback = null;
    document.body.innerHTML = "";
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => recordingContext(ops),
    );
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frameCallback = cb;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    scene = mount();
  });

  afterEach(() => {
    scene?.destroy();
    scene = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("draws a whole tint in one batch, whatever it costs in tiles", () => {
    const tiles = [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 1, y: 2 },
    ];
    scene!.setHighlights({
      tiles: tiles.map((t) => ({ ...t, tint: "reach" as const })),
    });
    paintFrame();
    const batch = batchForTint(ops, "reach");
    // Four diamonds, four subpaths — and exactly one fill and one
    // stroke across all of them.
    expect(batch?.moves).toBe(4);
    expect(batch?.fills).toHaveLength(1);
    expect(batch?.strokes).toHaveLength(1);
  });


  /**
   * The "bold telegraphs" assist reaching the paint. The palette's own
   * tests pin what a boosted style *is* (see telegraphPalette.test.ts);
   * what is asserted here is that the scene actually paints with it,
   * and that switching it off paints exactly what it always did.
   */
  it("paints the boosted style when the assist is switched on", () => {
    scene!.destroy();
    scene = mount(true);
    scene.setHighlights({
      tiles: [
        { x: 1, y: 1, tint: "reach" },
        { x: 2, y: 1, tint: "impact" },
      ],
    });
    paintFrame();
    for (const tint of ["reach", "impact"] as const) {
      const bold = telegraphStyle(tint, "neon", true);
      const plain = telegraphStyle(tint);
      const painted = batches(ops).find((batch) =>
        batch.fills.some((f) => f.style === bold.fill),
      );
      expect(painted, tint).toBeDefined();
      expect(painted?.strokes[0]?.style, tint).toBe(bold.stroke);
      // Stronger than it would have been, and unmistakably so.
      expect(bold.fill, tint).not.toBe(plain.fill);
      // The shape channels are untouched, so the tint still reads.
      expect(painted?.strokes[0]?.lineWidth, tint).toBe(plain.lineWidth);
      expect(painted?.strokes[0]?.dash, tint).toEqual([...plain.dash]);
    }
  });

  it("paints the plain style when it is switched off", () => {
    scene!.setHighlights({ tiles: [{ x: 1, y: 1, tint: "impact" }] });
    paintFrame();
    const style = telegraphStyle("impact");
    expect(batchForTint(ops, "impact")?.fills[0]?.style).toBe(style.fill);
  });

  it("paints each tint in its palette's own colour, width, and dash", () => {
    scene!.setHighlights({
      tiles: [
        { x: 1, y: 1, tint: "reach" },
        { x: 2, y: 1, tint: "impact" },
        { x: 3, y: 1, tint: "denied" },
      ],
    });
    paintFrame();
    for (const tint of ["reach", "impact", "denied"] as const) {
      const style = telegraphStyle(tint);
      const batch = batchForTint(ops, tint);
      expect(batch, tint).toBeDefined();
      expect(batch?.fills[0]?.style, tint).toBe(style.fill);
      const stroke = batch?.strokes[0];
      expect(stroke?.style, tint).toBe(style.stroke);
      expect(stroke?.lineWidth, tint).toBe(style.lineWidth);
      expect(stroke?.dash, tint).toEqual([...style.dash]);
    }
  });

  it("lays context tints down before the ones that answer the cursor", () => {
    scene!.setHighlights({
      tiles: [
        { x: 4, y: 4, tint: "impact" },
        { x: 1, y: 1, tint: "reach" },
        { x: 2, y: 2, tint: "range" },
      ],
    });
    paintFrame();
    const order = batches(ops)
      .map((batch, index) => ({ batch, index }))
      .filter(({ batch }) => batch.fills.length > 0 || batch.strokes.length > 0);
    const indexOf = (tint: TelegraphTintId): number => {
      const style = telegraphStyle(tint);
      return order.findIndex(({ batch }) =>
        batch.fills.some((f) => f.style === style.fill),
      );
    };
    // The palette's order, not the caller's: impact was pushed first and
    // is still painted last.
    expect(indexOf("range")).toBeLessThan(indexOf("reach"));
    expect(indexOf("reach")).toBeLessThan(indexOf("impact"));
    expect(TELEGRAPH_PAINT_ORDER.indexOf("impact")).toBeGreaterThan(
      TELEGRAPH_PAINT_ORDER.indexOf("reach"),
    );
  });

  it("draws nothing at all when nothing is tinted", () => {
    scene!.setHighlights({ tiles: [], pathLine: [], hover: null });
    paintFrame();
    for (const tint of TELEGRAPH_PAINT_ORDER) {
      expect(batchForTint(ops, tint), tint).toBeUndefined();
    }
  });

  it("draws a previewed walk as one dotted line through the tiles it crosses", () => {
    const walk: TilePoint[] = [
      { x: 3, y: 6 },
      { x: 3, y: 5 },
      { x: 3, y: 4 },
    ];
    scene!.setHighlights({ tiles: [], pathLine: walk });
    paintFrame();
    const style = TELEGRAPH_PATH_LINE.neon;
    const line = batches(ops).find((batch) =>
      batch.strokes.some((s) => s.style === style.color),
    );
    expect(line).toBeDefined();
    // One move and then a lineTo per remaining tile: a route, not tiles.
    expect(line?.moves).toBe(1);
    expect(line?.strokes[0]?.dash).toEqual([...style.dash]);
    // And it runs through the tile centers the walk names.
    const points = ops.filter(
      (op): op is Extract<Op, { kind: "moveTo" | "lineTo" }> =>
        op.kind === "moveTo" || op.kind === "lineTo",
    );
    for (const tile of walk) {
      const { sx, sy } = worldToScreen(tile.x, tile.y);
      expect(
        points.some((p) => p.x === sx && p.y === sy),
        `${tile.x},${tile.y}`,
      ).toBe(true);
    }
  });

  it("draws no line for a walk of one tile — there is no route yet", () => {
    scene!.setHighlights({ tiles: [], pathLine: [{ x: 3, y: 6 }] });
    paintFrame();
    const style = TELEGRAPH_PATH_LINE.neon;
    expect(
      ops.some((op) => op.kind === "stroke" && op.style === style.color),
    ).toBe(false);
  });
});
