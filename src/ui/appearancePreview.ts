/**
 * Live character preview panel for the creation wizard's appearance
 * step: a large crisp canvas of the fully composed character (working
 * appearance + the chosen background's starting gear) on a pedestal
 * stage, playing the real idle/walk provider timing, with facing
 * rotation, motion toggle, a fixed zoom ladder, and a portrait inset
 * that tracks every pick. Pure state lives in ./previewState; this
 * file is the thin canvas/DOM shell.
 *
 * Rendering stays stall-free by construction: a pick re-composes the
 * layer stack (pure grid work) but bakes at most the single frame the
 * next paint needs — frames land in a byte-budgeted LRU on demand, so
 * flipping options never pre-bakes whole animation sets.
 */
import {
  composeCharacter,
  defaultAppearance,
  type Appearance,
} from "../character";
import { emptyEquipment, type EquipmentState } from "../inventory/equipment";
import { bodyFrameAt } from "../iso/animation";
import {
  composedCharacterGrid,
  composedFrameKey,
  type ComposedCharacter,
} from "../iso/art/layers";
import { BODY_FRAME } from "../iso/art/layers/body";
import { ART_SCALE, bakeSprite, spriteBytes } from "../iso/art/pixel";
import { createSpriteCache, type SpriteCacheStats } from "../iso/art/spriteCache";
import type { Sprite } from "../iso/sprites";
import { reducedMotionActive } from "../settings";
import { portraitCanvas } from "./portraits";
import {
  DEFAULT_PREVIEW_STATE,
  facingLabel,
  maxPreviewZoom,
  previewZoomLabel,
  rotateFacing,
  showcaseFacing,
  stepPreviewZoom,
  toggleMotion,
  type PreviewState,
} from "./previewState";
import { t } from "./strings";

/**
 * Byte budget for baked preview frames. A 64×96-at-2x bake holds
 * ~48 KiB; a full look is at most 40 frames (4 facings × idle 4 +
 * walk 6), so 4 MiB keeps a couple of looks fully animated while
 * bounding churn from rapid option flipping.
 */
export const PREVIEW_CACHE_BUDGET_BYTES = 4 * 1024 * 1024;

const previewCache = createSpriteCache<Sprite>(
  PREVIEW_CACHE_BUDGET_BYTES,
  spriteBytes,
);

/** Cache visibility for tests and dev tuning. */
export function previewCacheStats(): SpriteCacheStats {
  return previewCache.stats();
}

export interface AppearancePreviewOptions {
  /** Live working appearance the preview composes from. */
  appearance: () => Appearance;
  /** Live equipment (the chosen background's starting gear). */
  equipment: () => EquipmentState;
  /** View state to open on; lets the screen keep it across re-renders. */
  initialState?: PreviewState;
  /** Fired on every rotate/toggle/zoom so the caller can persist it. */
  onStateChange?: (state: PreviewState) => void;
  /**
   * Showcase mode for the review step: the largest crisp zoom, no
   * controls or hint, and a slow automatic facing cycle over the idle
   * loop (held front-facing under reduced motion) — a display case
   * rather than an editor.
   */
  showcase?: boolean;
}

export interface AppearancePreview {
  el: HTMLElement;
  /** The appearance or equipment changed: re-compose and repaint. */
  update(): void;
  /** Quarter-turn the facing; positive steps spin clockwise (E key). */
  rotate(step: 1 | -1): void;
  /** Flip between the idle and walk loops (W key). */
  toggleMotion(): void;
  /** Step the crisp zoom ladder (+/− keys). */
  stepZoom(direction: 1 | -1): void;
  /** Stop the animation loop; call when leaving the step. */
  destroy(): void;
}

export function createAppearancePreview(
  options: AppearancePreviewOptions,
): AppearancePreview {
  let state = options.showcase
    ? { ...DEFAULT_PREVIEW_STATE, zoom: maxPreviewZoom() }
    : (options.initialState ?? DEFAULT_PREVIEW_STATE);
  let composed = resolveComposed();
  let lastPaintedKey: string | null = null;
  let lastTickMs = 0;
  let rafId = 0;

  function resolveComposed(): ComposedCharacter {
    try {
      return composeCharacter(options.appearance(), options.equipment());
    } catch (error) {
      console.error("Invalid appearance; previewing the default look", error);
      return composeCharacter(defaultAppearance(), emptyEquipment());
    }
  }

  const el = document.createElement("div");
  el.className = "nf-appearance-preview nf-preview";
  if (options.showcase) el.classList.add("nf-preview-showcase");

  const stage = document.createElement("div");
  stage.className = "nf-preview-stage";

  const canvas = document.createElement("canvas");
  canvas.className = "nf-preview-canvas";
  canvas.width = BODY_FRAME.width * ART_SCALE;
  canvas.height = BODY_FRAME.height * ART_SCALE;
  const ctx = canvas.getContext("2d");

  const portraitInset = document.createElement("div");
  portraitInset.className = "nf-preview-portrait";

  stage.append(canvas, portraitInset);

  const controls = document.createElement("div");
  controls.className = "nf-preview-controls";

  function controlButton(
    label: string,
    ariaLabel: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nf-button nf-button-small";
    button.textContent = label;
    button.setAttribute("aria-label", ariaLabel);
    button.addEventListener("click", onClick);
    return button;
  }

  const rotateLeft = controlButton("◀", "Rotate left (Q)", () => rotate(-1));
  const rotateRight = controlButton("▶", "Rotate right (E)", () => rotate(1));
  const walkToggle = controlButton("Walk", "Toggle walk animation (W)", () =>
    toggle(),
  );
  const zoomOut = controlButton("−", "Zoom out (−)", () => zoom(-1));
  const zoomIn = controlButton("+", "Zoom in (+)", () => zoom(1));
  const readout = document.createElement("span");
  readout.className = "nf-preview-readout";
  controls.append(rotateLeft, rotateRight, walkToggle, zoomOut, zoomIn, readout);

  const hint = document.createElement("p");
  hint.className = "nf-dim nf-preview-hint";
  hint.textContent = t("appearance.preview.keys");

  el.append(stage);
  if (!options.showcase) el.append(controls, hint);

  function paint(timeMs: number): void {
    const frame = bodyFrameAt(state.motion, timeMs);
    const key = `preview:${composedFrameKey(composed, state.facing, state.motion, frame)}`;
    if (key === lastPaintedKey || !ctx) return;
    const baked = previewCache.get(key, () =>
      bakeSprite(
        composedCharacterGrid(composed, state.facing, state.motion, frame),
        0,
        0,
      ),
    );
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baked.image, 0, 0);
    lastPaintedKey = key;
  }

  /** Reflect the view state into the DOM, then repaint. */
  function sync(): void {
    el.dataset.facing = state.facing;
    el.dataset.motion = state.motion;
    el.dataset.zoom = String(state.zoom);
    canvas.style.width = `${BODY_FRAME.width * state.zoom}px`;
    canvas.style.height = `${BODY_FRAME.height * state.zoom}px`;
    walkToggle.setAttribute("aria-pressed", String(state.motion === "walk"));
    walkToggle.classList.toggle("nf-selected", state.motion === "walk");
    const zoomedOut = stepPreviewZoom(state, -1).zoom === state.zoom;
    const zoomedIn = stepPreviewZoom(state, 1).zoom === state.zoom;
    zoomOut.disabled = zoomedOut;
    zoomIn.disabled = zoomedIn;
    readout.textContent = `${facingLabel(state.facing)} · ${previewZoomLabel(state.zoom)}`;
    lastPaintedKey = null;
    paint(lastTickMs);
  }

  function setState(next: PreviewState): void {
    state = next;
    options.onStateChange?.(state);
    sync();
  }

  function rotate(step: 1 | -1): void {
    setState(rotateFacing(state, step));
  }

  function toggle(): void {
    setState(toggleMotion(state));
  }

  function zoom(direction: 1 | -1): void {
    setState(stepPreviewZoom(state, direction));
  }

  function refreshPortrait(): void {
    portraitInset.replaceChildren(
      portraitCanvas(options.appearance(), options.equipment()),
    );
  }

  const tick = (now: number): void => {
    // Reduced motion (in-game setting or OS preference) freezes the
    // clock: the preview holds a static frame and the showcase spin
    // holds its front facing instead of turning.
    lastTickMs = reducedMotionActive() ? 0 : now;
    if (options.showcase) {
      const facing = showcaseFacing(lastTickMs);
      if (facing !== state.facing) setState({ ...state, facing });
    }
    paint(lastTickMs);
    rafId = requestAnimationFrame(tick);
  };

  refreshPortrait();
  sync();
  rafId = requestAnimationFrame(tick);

  return {
    el,
    update(): void {
      composed = resolveComposed();
      refreshPortrait();
      lastPaintedKey = null;
      paint(lastTickMs);
    },
    rotate,
    toggleMotion: toggle,
    stepZoom: zoom,
    destroy(): void {
      cancelAnimationFrame(rafId);
    },
  };
}
