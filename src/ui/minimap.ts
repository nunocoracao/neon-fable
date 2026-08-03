/**
 * The corner minimap: a small canvas overview of the map being
 * explored, plus the slim tab it collapses to. Deliberately thin —
 * every cell, pip, and rectangle position comes from the pure math in
 * src/iso/minimap.ts, and a repaint only happens when the scene's view
 * actually changed (the player stepped, the camera panned or zoomed,
 * the window resized), never once per frame.
 *
 * Read-only by design: the canvas takes no pointer events at all, so
 * clicking the map does nothing. Only the tab is interactive, and all it
 * does is collapse and expand — no click-to-travel, no click-to-pan.
 */
import {
  MINIMAP_COLORS,
  minimapCells,
  minimapLayout,
  minimapPips,
  minimapViewport,
  sameMinimapView,
  tileTopLeft,
  type IsoMap,
  type MinimapView,
} from "../iso";
import { t } from "./strings";

export interface MinimapOptions {
  map: IsoMap;
  /** Whether it starts expanded; the caller owns the persisted setting. */
  open: boolean;
  /** The tab was pressed — the caller flips its setting and calls setOpen. */
  onToggle(): void;
}

export interface MinimapHandle {
  /** The fixed-position element to mount into the HUD layer. */
  el: HTMLElement;
  /** Feed the scene's current view; repaints only if something moved. */
  update(view: MinimapView): void;
  /** Expand or collapse. Collapsed keeps the tab and paints nothing. */
  setOpen(open: boolean): void;
  /** Repaints performed so far — the change-gating test reads this. */
  redraws(): number;
  destroy(): void;
}

/** Label on the collapse tab; the key it answers to is in settingsScreen. */
export const MINIMAP_TAB_LABEL = t("minimap.tab");

export function createMinimap(options: MinimapOptions): MinimapHandle {
  const { map } = options;
  const layout = minimapLayout(map);
  // The map never changes under a mounted scene, so its cells are read
  // out of tile data once and reused by every repaint.
  const cells = minimapCells(map);

  const el = document.createElement("div");
  el.className = "nf-minimap";

  const tab = document.createElement("button");
  tab.className = "nf-button nf-button-small nf-minimap-tab";
  tab.textContent = MINIMAP_TAB_LABEL;
  tab.addEventListener("click", options.onToggle);

  const body = document.createElement("div");
  body.className = "nf-minimap-body";

  const canvas = document.createElement("canvas");
  canvas.className = "nf-minimap-canvas";
  canvas.style.width = `${layout.width}px`;
  canvas.style.height = `${layout.height}px`;
  // Decoration, not a control: nothing here is clickable or focusable.
  canvas.setAttribute("aria-hidden", "true");

  body.append(canvas);
  el.append(tab, body);

  const ctx = canvas.getContext("2d");
  let open = options.open;
  let view: MinimapView | null = null;
  /** The view last painted, so an unchanged frame paints nothing. */
  let painted: MinimapView | null = null;
  let redraws = 0;

  function syncOpen(): void {
    el.classList.toggle("nf-minimap-collapsed", !open);
    tab.setAttribute("aria-pressed", String(open));
  }

  function paint(): void {
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(layout.width * dpr);
    const height = Math.round(layout.height * dpr);
    // Follows the device pixel ratio so the grid stays hard-edged on a
    // retina screen. Resizing clears the backing store, which costs
    // nothing: every repaint draws the whole picture from scratch, and
    // the opaque void fill below is what clears it otherwise.
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = MINIMAP_COLORS.void;
    ctx.fillRect(0, 0, layout.width, layout.height);

    cells.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell === "void") return;
        const { x: px, y: py } = tileTopLeft(layout, x, y);
        ctx.fillStyle = MINIMAP_COLORS[cell];
        ctx.fillRect(px, py, layout.cell, layout.cell);
      });
    });

    if (view) {
      const frame = minimapViewport(
        layout,
        view.camera,
        view.viewportW,
        view.viewportH,
        view.zoom,
      );
      if (frame.width > 0 && frame.height > 0) {
        ctx.strokeStyle = MINIMAP_COLORS.viewport;
        ctx.lineWidth = 1;
        // Half-pixel offset so a 1px stroke lands on one row of pixels.
        ctx.strokeRect(
          Math.round(frame.x) + 0.5,
          Math.round(frame.y) + 0.5,
          Math.max(1, Math.round(frame.width) - 1),
          Math.max(1, Math.round(frame.height) - 1),
        );
      }

      for (const pip of minimapPips(map, layout, {
        tile: view.playerTile,
        facing: view.facing,
      })) {
        ctx.fillStyle = MINIMAP_COLORS[pip.kind];
        ctx.fillRect(
          Math.round(pip.x - pip.size / 2),
          Math.round(pip.y - pip.size / 2),
          pip.size,
          pip.size,
        );
        if (!pip.tick) continue;
        // The facing tick: a stubby bar from the pip's center out to the
        // tick's end, drawn as a rect so it stays hard-edged at any
        // device pixel ratio. One axis at a time — facings are cardinal.
        const horizontal = pip.tick.y === pip.y;
        const length = Math.max(
          1,
          Math.round(
            Math.abs(pip.tick.x - pip.x) + Math.abs(pip.tick.y - pip.y),
          ),
        );
        ctx.fillRect(
          Math.round(horizontal ? Math.min(pip.x, pip.tick.x) : pip.x) - 1,
          Math.round(horizontal ? pip.y : Math.min(pip.y, pip.tick.y)) - 1,
          horizontal ? length : 2,
          horizontal ? 2 : length,
        );
      }
    }

    ctx.strokeStyle = MINIMAP_COLORS.frame;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, layout.width - 1, layout.height - 1);
    redraws += 1;
  }

  syncOpen();

  return {
    el,

    update(next: MinimapView): void {
      view = next;
      if (!open || sameMinimapView(painted, next)) return;
      painted = next;
      paint();
    },

    setOpen(nextOpen: boolean): void {
      if (nextOpen === open) return;
      open = nextOpen;
      syncOpen();
      // Expanding repaints from the latest view; collapsing throws the
      // painted view away so reopening never shows a stale picture.
      painted = null;
      if (open && view) {
        painted = view;
        paint();
      }
    },

    redraws(): number {
      return redraws;
    },

    destroy(): void {
      tab.removeEventListener("click", options.onToggle);
      el.remove();
    },
  };
}
