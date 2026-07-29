import { describe, expect, it } from "vitest";
import { ART_SCALE } from "../iso/art/pixel";
import {
  DEFAULT_PREVIEW_STATE,
  PREVIEW_FACINGS,
  PREVIEW_ZOOM_LEVELS,
  SHOWCASE_FACING_MS,
  clampPreviewZoom,
  facingLabel,
  maxPreviewZoom,
  previewZoomLabel,
  rotateFacing,
  showcaseFacing,
  stepPreviewZoom,
  toggleMotion,
} from "./previewState";

describe("preview facings", () => {
  it("covers all four facings exactly once", () => {
    expect([...PREVIEW_FACINGS].sort()).toEqual(["e", "n", "s", "w"]);
  });

  it("rotating right walks the full cycle and wraps", () => {
    let state = DEFAULT_PREVIEW_STATE;
    const seen = [state.facing];
    for (let i = 0; i < PREVIEW_FACINGS.length; i++) {
      state = rotateFacing(state, 1);
      seen.push(state.facing);
    }
    expect(seen).toEqual(["s", "w", "n", "e", "s"]);
  });

  it("rotating left undoes rotating right", () => {
    for (const facing of PREVIEW_FACINGS) {
      const state = { ...DEFAULT_PREVIEW_STATE, facing };
      expect(rotateFacing(rotateFacing(state, 1), -1).facing).toBe(facing);
    }
  });

  it("wraps arbitrary step counts", () => {
    expect(rotateFacing(DEFAULT_PREVIEW_STATE, 4).facing).toBe("s");
    expect(rotateFacing(DEFAULT_PREVIEW_STATE, -5).facing).toBe("e");
  });

  it("labels every facing distinctly", () => {
    const labels = PREVIEW_FACINGS.map(facingLabel);
    expect(new Set(labels).size).toBe(PREVIEW_FACINGS.length);
  });
});

describe("showcase spin", () => {
  it("holds each facing for the interval, cycling clockwise", () => {
    expect(showcaseFacing(0)).toBe("s");
    expect(showcaseFacing(SHOWCASE_FACING_MS - 1)).toBe("s");
    expect(showcaseFacing(SHOWCASE_FACING_MS)).toBe("w");
    expect(showcaseFacing(SHOWCASE_FACING_MS * 2)).toBe("n");
    expect(showcaseFacing(SHOWCASE_FACING_MS * 3)).toBe("e");
    expect(showcaseFacing(SHOWCASE_FACING_MS * 4)).toBe("s");
  });

  it("a frozen clock (reduced motion) holds the front facing", () => {
    expect(showcaseFacing(0)).toBe(DEFAULT_PREVIEW_STATE.facing);
  });

  it("full size is the top of the crisp zoom ladder", () => {
    expect(maxPreviewZoom()).toBe(PREVIEW_ZOOM_LEVELS.at(-1));
  });
});

describe("motion toggle", () => {
  it("flips idle to walk and back", () => {
    const walking = toggleMotion(DEFAULT_PREVIEW_STATE);
    expect(walking.motion).toBe("walk");
    expect(toggleMotion(walking).motion).toBe("idle");
  });
});

describe("zoom ladder", () => {
  it("keeps every level a whole multiple of the bake scale", () => {
    for (const level of PREVIEW_ZOOM_LEVELS) {
      expect(level % ART_SCALE).toBe(0);
    }
  });

  it("defaults onto the ladder", () => {
    expect(PREVIEW_ZOOM_LEVELS).toContain(DEFAULT_PREVIEW_STATE.zoom);
  });

  it("snaps arbitrary zooms to the nearest level", () => {
    expect(clampPreviewZoom(0)).toBe(4);
    expect(clampPreviewZoom(4.4)).toBe(4);
    expect(clampPreviewZoom(6.9)).toBe(6);
    expect(clampPreviewZoom(100)).toBe(8);
  });

  it("steps along the ladder and clamps at both ends", () => {
    let state = { ...DEFAULT_PREVIEW_STATE, zoom: 4 };
    expect(stepPreviewZoom(state, -1).zoom).toBe(4);
    state = stepPreviewZoom(state, 1);
    expect(state.zoom).toBe(6);
    state = stepPreviewZoom(state, 1);
    expect(state.zoom).toBe(8);
    expect(stepPreviewZoom(state, 1).zoom).toBe(8);
  });

  it("labels zoom relative to the native on-screen scale", () => {
    expect(previewZoomLabel(4)).toBe("×2");
    expect(previewZoomLabel(6)).toBe("×3");
    expect(previewZoomLabel(8)).toBe("×4");
  });
});
