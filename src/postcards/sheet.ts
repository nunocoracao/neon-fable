/**
 * Contact-sheet layout: a titled page of labelled art.
 *
 * A sheet is a uniform grid of cells. Each cell holds one entry's
 * frames laid left to right — a static picture is a one-frame strip —
 * over a checkerboard, with the entry's id written under it in the
 * repo's own pixel font. The checker is not decoration: transparent
 * pixels are the hardest thing to judge in isolation, and a two-tone
 * ground behind every cell is what makes a misplaced layer, a clipped
 * edge, or an off-by-one anchor visible at a glance.
 *
 * Cells are uniform per sheet so a family can be compared down a
 * column. Pages split at a fixed cell count, so no single PNG is
 * unopenable — a section with four hundred entries becomes numbered
 * pages rather than one enormous image.
 *
 * Pure: a sheet spec goes in, a framebuffer comes out. Nothing here
 * knows what a file is.
 */
import {
  DEFAULT_DENSITY,
  densityOf,
  type ArtDensity,
} from "../iso/art/density";
import type { PixelGrid } from "../iso/art/pixel";
import { drawText, textHeight, textWidth } from "./canvas2d";
import {
  createFramebuffer,
  drawGrid,
  fillRect,
  gridHeight,
  gridWidth,
  parseColor,
  type Framebuffer,
} from "./framebuffer";

/** One labelled entry: its id and the frames it draws. */
export interface SheetCell {
  readonly id: string;
  readonly frames: readonly PixelGrid[];
  /**
   * What the frames were authored at (see ../iso/art/density.ts).
   * Absent means 1x. A finer cell draws at a proportionally smaller
   * scale, so it comes out the size its neighbours do — which is the
   * only way to judge whether the extra pixels bought anything — and
   * says so in its label.
   */
  readonly density?: ArtDensity;
}

/** A page of cells, ready to render. */
export interface SheetSpec {
  /** File stem, without the extension. */
  readonly name: string;
  /** Heading printed across the top. */
  readonly title: string;
  /** One line under the heading saying what is being looked at. */
  readonly note?: string;
  readonly cells: readonly SheetCell[];
  /** Art pixels per sheet pixel; 2 matches ART_SCALE on screen. */
  readonly scale?: number;
}

const BACKGROUND = "#0d0f18";
const CHECKER_A = "#1a1e2b";
const CHECKER_B = "#141826";
const TITLE_INK = "#7ff5ea";
const NOTE_INK = "#9aa3b8";
const LABEL_INK = "#e8e6f0";
const INDEX_INK = "#6b7691";
const RULE = "#2b3244";

const TITLE_SCALE = 4;
const NOTE_SCALE = 2;
const LABEL_SCALE = 2;
const INDEX_SCALE = 1;

const PAGE_PAD = 16;
const CELL_PAD = 8;
const FRAME_GAP = 6;
const CHECKER_SIZE = 8;
/** Widest a sheet is allowed to get, so viewers can open it. */
const MAX_SHEET_WIDTH = 2048;
/** Most cells on one page, before it splits into numbered pages. */
export const MAX_CELLS_PER_SHEET = 120;

/** Art pixels per sheet pixel when a spec does not say. */
export const DEFAULT_SHEET_SCALE = 2;

/**
 * Sheet pixels per authored pixel for a cell. The sheet's scale is in
 * 1x art pixels, so art drawn at density 2 draws at half of it and lands
 * at the same size — never below 1, which would drop pixels the whole
 * exercise exists to show.
 */
function cellScale(cell: SheetCell, scale: number): number {
  return Math.max(1, Math.round(scale / densityOf(cell)));
}

/** The strip width a cell's frames cover, at a scale. */
function stripWidth(cell: SheetCell, scale: number): number {
  if (cell.frames.length === 0) return 0;
  const at = cellScale(cell, scale);
  const frames = cell.frames.reduce(
    (sum, frame) => sum + gridWidth(frame, at),
    0,
  );
  return frames + FRAME_GAP * (cell.frames.length - 1);
}

function stripHeight(cell: SheetCell, scale: number): number {
  const at = cellScale(cell, scale);
  return cell.frames.reduce((tall, frame) => Math.max(tall, gridHeight(frame, at)), 0);
}

/** What a cell is labelled: its id, plus its density when it has moved. */
export function cellLabel(cell: SheetCell): string {
  const density = densityOf(cell);
  return density > DEFAULT_DENSITY ? `${cell.id} [d${density}]` : cell.id;
}

/**
 * Break a label across lines that fit a width, on spaces where it can
 * and mid-word where a single token is simply too long. Ids in this
 * repo are space-separated words ("enemy scrap-runner look0 s"), so
 * this reads as intended almost everywhere.
 */
export function wrapLabel(
  text: string,
  maxWidth: number,
  scale: number,
): string[] {
  // n glyphs cover (n * (GLYPH_W + GLYPH_GAP) - GLYPH_GAP) * scale; solve
  // that for the largest n that still fits, never below one.
  const advance = textWidth("MM", scale) - textWidth("M", scale);
  const gap = advance - textWidth("M", scale);
  const columns = Math.max(1, Math.floor((maxWidth + gap) / advance));
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const candidate = line.length === 0 ? word : `${line} ${word}`;
    if (candidate.length <= columns) {
      line = candidate;
      continue;
    }
    if (line.length > 0) lines.push(line);
    line = word;
    while (line.length > columns) {
      lines.push(line.slice(0, columns));
      line = line.slice(columns);
    }
  }
  if (line.length > 0) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

interface Metrics {
  readonly scale: number;
  readonly cellW: number;
  readonly cellH: number;
  /** Height of the art band alone; frames sit on its floor. */
  readonly artH: number;
  /** Height of the strip of frame numbers under the art, or 0. */
  readonly indexH: number;
  readonly labelLines: number;
  readonly columns: number;
  readonly rows: number;
  readonly headerH: number;
  readonly width: number;
  readonly height: number;
}

function measure(spec: SheetSpec): Metrics {
  const scale = spec.scale ?? DEFAULT_SHEET_SCALE;
  const artW = spec.cells.reduce(
    (wide, cell) => Math.max(wide, stripWidth(cell, scale)),
    1,
  );
  const artH = spec.cells.reduce(
    (tall, cell) => Math.max(tall, stripHeight(cell, scale)),
    1,
  );
  const indexH = spec.cells.some((cell) => cell.frames.length > 1)
    ? textHeight(INDEX_SCALE) + 2
    : 0;
  // Columns are as wide as the widest strip, but never so narrow that
  // an id has to wrap every other character.
  const cellW = Math.max(artW, 176) + CELL_PAD * 2;
  const labelWidth = cellW - CELL_PAD * 2;
  const labelLines = spec.cells.reduce(
    (most, cell) =>
      Math.max(most, wrapLabel(cellLabel(cell), labelWidth, LABEL_SCALE).length),
    1,
  );
  const labelH = labelLines * (textHeight(LABEL_SCALE) + 2);
  const cellH = artH + indexH + labelH + CELL_PAD * 2 + 4;
  const columns = Math.max(
    1,
    Math.floor((MAX_SHEET_WIDTH - PAGE_PAD * 2) / cellW),
  );
  const rows = Math.max(1, Math.ceil(spec.cells.length / columns));
  const headerH =
    PAGE_PAD +
    textHeight(TITLE_SCALE) +
    (spec.note ? textHeight(NOTE_SCALE) + 8 : 0) +
    14;
  return {
    scale,
    cellW,
    cellH,
    artH,
    indexH,
    labelLines,
    columns,
    rows,
    headerH,
    width: PAGE_PAD * 2 + columns * cellW,
    height: headerH + rows * cellH + PAGE_PAD,
  };
}

/** The pixel size a spec will render at, without rendering it. */
export function sheetSize(spec: SheetSpec): { width: number; height: number } {
  const metrics = measure(spec);
  return { width: metrics.width, height: metrics.height };
}

function checkerboard(
  fb: Framebuffer,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const a = parseColor(CHECKER_A);
  const b = parseColor(CHECKER_B);
  for (let py = 0; py < h; py += CHECKER_SIZE) {
    for (let px = 0; px < w; px += CHECKER_SIZE) {
      const dark = ((px / CHECKER_SIZE) | 0) + ((py / CHECKER_SIZE) | 0);
      fillRect(
        fb,
        x + px,
        y + py,
        Math.min(CHECKER_SIZE, w - px),
        Math.min(CHECKER_SIZE, h - py),
        dark % 2 === 0 ? a : b,
      );
    }
  }
}

/** Render one page of cells to a framebuffer. */
export function renderSheet(spec: SheetSpec): Framebuffer {
  const metrics = measure(spec);
  const fb = createFramebuffer(
    metrics.width,
    metrics.height,
    parseColor(BACKGROUND),
  );
  drawText(fb, spec.title, PAGE_PAD, PAGE_PAD, TITLE_SCALE, TITLE_INK);
  if (spec.note) {
    drawText(
      fb,
      spec.note,
      PAGE_PAD,
      PAGE_PAD + textHeight(TITLE_SCALE) + 8,
      NOTE_SCALE,
      NOTE_INK,
    );
  }
  fillRect(
    fb,
    PAGE_PAD,
    metrics.headerH - 8,
    metrics.width - PAGE_PAD * 2,
    1,
    parseColor(RULE),
  );

  spec.cells.forEach((cell, index) => {
    const column = index % metrics.columns;
    const row = Math.floor(index / metrics.columns);
    const left = PAGE_PAD + column * metrics.cellW;
    const top = metrics.headerH + row * metrics.cellH;
    const artLeft = left + CELL_PAD;
    const artTop = top + CELL_PAD;
    const artWidth = metrics.cellW - CELL_PAD * 2;
    checkerboard(fb, artLeft, artTop, artWidth, metrics.artH + metrics.indexH);

    let frameX = artLeft;
    const scale = cellScale(cell, metrics.scale);
    cell.frames.forEach((frame, frameIndex) => {
      const w = gridWidth(frame, scale);
      const h = gridHeight(frame, scale);
      // Frames sit on a common floor, so a walk cycle's bob shows as
      // bob rather than as every frame being re-centred.
      drawGrid(fb, frame, frameX, artTop + (metrics.artH - h), scale);
      if (metrics.indexH > 0) {
        // Numbers get their own band under the art rather than sharing
        // its last rows, so a short frame is never mistaken for a digit.
        drawText(
          fb,
          String(frameIndex),
          frameX,
          artTop + metrics.artH + 2,
          INDEX_SCALE,
          INDEX_INK,
        );
      }
      frameX += w + FRAME_GAP;
    });

    const lines = wrapLabel(cellLabel(cell), artWidth, LABEL_SCALE);
    lines.forEach((line, lineIndex) => {
      drawText(
        fb,
        line,
        artLeft,
        artTop +
          metrics.artH +
          metrics.indexH +
          6 +
          lineIndex * (textHeight(LABEL_SCALE) + 2),
        LABEL_SCALE,
        LABEL_INK,
      );
    });
  });
  return fb;
}

/**
 * Split a long list of cells into pages of at most MAX_CELLS_PER_SHEET,
 * numbering the file stems and titles when there is more than one.
 */
export function paginate(spec: SheetSpec): SheetSpec[] {
  if (spec.cells.length <= MAX_CELLS_PER_SHEET) return [spec];
  const pages: SheetSpec[] = [];
  const total = Math.ceil(spec.cells.length / MAX_CELLS_PER_SHEET);
  for (let page = 0; page < total; page++) {
    const from = page * MAX_CELLS_PER_SHEET;
    pages.push({
      ...spec,
      name: `${spec.name}-${String(page + 1).padStart(2, "0")}`,
      title: `${spec.title} (${page + 1}/${total})`,
      cells: spec.cells.slice(from, from + MAX_CELLS_PER_SHEET),
    });
  }
  return pages;
}
