// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultAppearance, type Appearance } from "../character";
import { appearanceCatalogs } from "../data";
import { startingEquipment } from "../inventory";
import { backgrounds } from "../data/backgrounds";
import {
  createAppearancePreview,
  previewCacheStats,
  type AppearancePreview,
} from "./appearancePreview";
import {
  DEFAULT_PREVIEW_STATE,
  SHOWCASE_FACING_MS,
  maxPreviewZoom,
  type PreviewState,
} from "./previewState";

/**
 * Drives the preview panel in happy-dom with the canvas 2D context
 * stubbed — pixels are not under test, only that the panel reflects
 * its view state into the DOM, tracks picks through update(), and
 * bakes lazily (one frame per repaint, never whole animation sets).
 */

/** A value whose every property/call yields another such value — enough to
 * satisfy the canvas 2D API without rendering anything. */
function anything(): unknown {
  const fn = (): unknown => anything();
  return new Proxy(fn, {
    get: (_target, prop) =>
      prop === Symbol.toPrimitive ? () => 0 : anything(),
    set: () => true,
    apply: () => anything(),
  });
}

let look: Appearance;
let states: PreviewState[];
let preview: AppearancePreview;

function button(ariaLabel: string): HTMLButtonElement {
  const el = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${ariaLabel}"]`,
  );
  if (!el) throw new Error(`no button labelled "${ariaLabel}"`);
  return el;
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => anything() as CanvasRenderingContext2D,
  );
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  document.body.innerHTML = "";
  look = defaultAppearance();
  states = [];
  preview = createAppearancePreview({
    appearance: () => look,
    equipment: () => startingEquipment(backgrounds[0]!),
    onStateChange: (state) => states.push(state),
  });
  document.body.append(preview.el);
});

afterEach(() => {
  preview.destroy();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("appearance preview panel", () => {
  it("renders the stage canvas and a live portrait inset", () => {
    expect(document.querySelector("canvas.nf-preview-canvas")).toBeTruthy();
    expect(
      document.querySelector(".nf-preview-portrait canvas.nf-portrait"),
    ).toBeTruthy();
    expect(preview.el.dataset.facing).toBe(DEFAULT_PREVIEW_STATE.facing);
    expect(preview.el.dataset.motion).toBe("idle");
  });

  it("rotate buttons cycle all four facings and report state", () => {
    const seen = new Set([preview.el.dataset.facing]);
    for (let i = 0; i < 3; i++) {
      button("Rotate right (E)").click();
      seen.add(preview.el.dataset.facing);
    }
    expect(seen.size).toBe(4);
    button("Rotate right (E)").click();
    expect(preview.el.dataset.facing).toBe(DEFAULT_PREVIEW_STATE.facing);
    button("Rotate left (Q)").click();
    expect(states.at(-1)?.facing).toBe(preview.el.dataset.facing);
  });

  it("the walk toggle flips motion and its pressed state", () => {
    const toggle = button("Toggle walk animation (W)");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    toggle.click();
    expect(preview.el.dataset.motion).toBe("walk");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    preview.toggleMotion();
    expect(preview.el.dataset.motion).toBe("idle");
  });

  it("zoom steps the crisp ladder, sizes the canvas, and clamps", () => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      "canvas.nf-preview-canvas",
    )!;
    expect(canvas.style.width).toBe("192px");
    button("Zoom in (+)").click();
    expect(preview.el.dataset.zoom).toBe("8");
    expect(canvas.style.width).toBe("256px");
    expect(button("Zoom in (+)").disabled).toBe(true);
    preview.stepZoom(-1);
    preview.stepZoom(-1);
    expect(preview.el.dataset.zoom).toBe("4");
    expect(canvas.style.width).toBe("128px");
    expect(button("Zoom out (−)").disabled).toBe(true);
    // The backing store never changes — zoom is pure CSS upscale.
    expect(canvas.width).toBe(64);
    expect(canvas.height).toBe(96);
  });

  it("update() rebuilds the portrait inset for the new look", () => {
    const before = document.querySelector(
      ".nf-preview-portrait canvas.nf-portrait",
    );
    look = { ...look, hairStyle: "slicked" };
    preview.update();
    const after = document.querySelector(
      ".nf-preview-portrait canvas.nf-portrait",
    );
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
  });

  it("showcase mode drops controls, zooms full size, and spins itself", () => {
    preview.destroy();
    document.body.innerHTML = "";
    let frame: FrameRequestCallback = () => undefined;
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback): number => {
        frame = callback;
        return 0;
      },
    );
    const showcase = createAppearancePreview({
      appearance: () => look,
      equipment: () => startingEquipment(backgrounds[0]!),
      showcase: true,
    });
    document.body.append(showcase.el);

    expect(showcase.el.classList.contains("nf-preview-showcase")).toBe(true);
    expect(showcase.el.querySelector("button")).toBeNull();
    expect(showcase.el.dataset.zoom).toBe(String(maxPreviewZoom()));
    expect(showcase.el.dataset.motion).toBe("idle");
    expect(
      showcase.el.querySelector(".nf-preview-portrait canvas.nf-portrait"),
    ).toBeTruthy();

    // The animation clock alone turns the character, one quarter each hold.
    expect(showcase.el.dataset.facing).toBe("s");
    frame(SHOWCASE_FACING_MS);
    expect(showcase.el.dataset.facing).toBe("w");
    frame(SHOWCASE_FACING_MS * 2);
    expect(showcase.el.dataset.facing).toBe("n");
    showcase.destroy();
  });

  it("the OS reduced-motion preference freezes the clock: a static idle frame, no spin", () => {
    preview.destroy();
    document.body.innerHTML = "";
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);
    let frame: FrameRequestCallback = () => undefined;
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback): number => {
        frame = callback;
        return 0;
      },
    );
    const showcase = createAppearancePreview({
      appearance: () => look,
      equipment: () => startingEquipment(backgrounds[0]!),
      showcase: true,
    });
    document.body.append(showcase.el);
    // The clock advancing past several holds never turns the character.
    frame(SHOWCASE_FACING_MS);
    frame(SHOWCASE_FACING_MS * 3);
    expect(showcase.el.dataset.facing).toBe("s");
    expect(showcase.el.dataset.motion).toBe("idle");
    showcase.destroy();
  });

  it("flipping options bakes one frame per look, never whole sets", () => {
    const styles = appearanceCatalogs.hairStyle.map((option) => option.id);
    const before = previewCacheStats().misses;
    for (const id of styles) {
      look = { ...look, hairStyle: id };
      preview.update();
    }
    const baked = previewCacheStats().misses - before;
    // At most one bake per distinct look (cache hits cost nothing) —
    // a full-set pre-bake would show ~10x this.
    expect(baked).toBeLessThanOrEqual(styles.length);
  });
});
