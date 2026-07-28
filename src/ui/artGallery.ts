/**
 * Dev-only art gallery: renders every entry from the gallery registry
 * (src/iso/art/gallery.ts) as a labeled canvas cell on a checkered
 * background, with animated entries playing on a shared rAF clock and a
 * text box filtering by id substring. Loaded lazily through the ?dev
 * route in dev.ts — never part of the normal play flow.
 */
import { frameAt } from "../iso/animation";
import {
  buildGallerySections,
  matchesQuery,
  type GalleryEntry,
} from "../iso/art/gallery";
import { bakeSprite } from "../iso/art/pixel";
import type { Sprite } from "../iso/sprites";
import { focusFirst } from "./focus";
import type { Screen } from "./screen";

interface ArtGalleryOptions {
  onBack: () => void;
}

/** One rendered cell, tracked for filtering and animation. */
interface Cell {
  entryId: string;
  el: HTMLElement;
  ctx: CanvasRenderingContext2D;
  baked: readonly Sprite[];
  frameMs: number;
  lastFrame: number;
}

function paintFrame(cell: Cell, frame: number): void {
  const sprite = cell.baked[frame];
  if (!sprite) return;
  const { width, height } = cell.ctx.canvas;
  cell.ctx.clearRect(0, 0, width, height);
  cell.ctx.drawImage(sprite.image, 0, 0);
  cell.lastFrame = frame;
}

function createCell(entry: GalleryEntry): Cell {
  // bakeSprite scales by ART_SCALE (2), which is exactly the gallery's
  // 2x zoom; anchors are irrelevant here, cells draw from the top-left.
  const baked = entry.frames.map((grid) => bakeSprite(grid, 0, 0));
  const cell = document.createElement("figure");
  cell.className = "nf-gallery-cell";

  const canvas = document.createElement("canvas");
  canvas.className = "nf-gallery-canvas";
  canvas.width = Math.max(1, ...baked.map((s) => (s.image as HTMLCanvasElement).width));
  canvas.height = Math.max(1, ...baked.map((s) => (s.image as HTMLCanvasElement).height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create 2d context for gallery cell");
  ctx.imageSmoothingEnabled = false;

  const label = document.createElement("figcaption");
  label.className = "nf-gallery-label";
  label.textContent = entry.id;
  cell.append(canvas, label);

  const made: Cell = {
    entryId: entry.id,
    el: cell,
    ctx,
    baked,
    frameMs: entry.frameMs,
    lastFrame: -1,
  };
  paintFrame(made, 0);
  return made;
}

export function createArtGalleryScreen(options: ArtGalleryOptions): Screen {
  let container: HTMLElement | null = null;
  let rafId = 0;

  return {
    mount(root: HTMLElement): void {
      container = document.createElement("div");
      container.className = "nf-screen nf-gallery";

      const header = document.createElement("div");
      header.className = "nf-gallery-header";

      const back = document.createElement("button");
      back.className = "nf-button nf-button-small";
      back.textContent = "Back";
      back.addEventListener("click", options.onBack);

      const title = document.createElement("h2");
      title.className = "nf-gallery-title";
      title.textContent = "Art Gallery";

      const filter = document.createElement("input");
      filter.className = "nf-input nf-gallery-filter";
      filter.type = "search";
      filter.placeholder = "Filter by id…";
      filter.setAttribute("aria-label", "Filter art by id");

      header.append(back, title, filter);
      container.append(header);

      const sections: { el: HTMLElement; cells: Cell[] }[] = [];
      const animated: Cell[] = [];
      for (const section of buildGallerySections()) {
        const sectionEl = document.createElement("section");
        sectionEl.className = "nf-gallery-section";
        const heading = document.createElement("h3");
        heading.className = "nf-gallery-section-title";
        heading.textContent = `${section.title} (${section.entries.length})`;
        const grid = document.createElement("div");
        grid.className = "nf-gallery-grid";
        const cells = section.entries.map(createCell);
        for (const cell of cells) {
          grid.append(cell.el);
          if (cell.frameMs > 0 && cell.baked.length > 1) animated.push(cell);
        }
        sectionEl.append(heading, grid);
        container.append(sectionEl);
        sections.push({ el: sectionEl, cells });
      }

      filter.addEventListener("input", () => {
        for (const section of sections) {
          let visible = 0;
          for (const cell of section.cells) {
            const show = matchesQuery(cell.entryId, filter.value);
            cell.el.hidden = !show;
            if (show) visible++;
          }
          section.el.hidden = visible === 0;
        }
      });

      const tick = (now: number): void => {
        for (const cell of animated) {
          if (cell.el.hidden) continue;
          const frame = frameAt(now, cell.frameMs, cell.baked.length);
          if (frame !== cell.lastFrame) paintFrame(cell, frame);
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);

      root.append(container);
      focusFirst(container);
    },

    unmount(): void {
      cancelAnimationFrame(rafId);
      container?.remove();
      container = null;
    },
  };
}
