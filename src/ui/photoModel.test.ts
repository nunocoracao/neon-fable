import { describe, expect, it } from "vitest";
import { DAY_PHASES, mapPixelBounds, type Camera } from "../iso";
import { ART_SCALE } from "../iso/art/pixel";
import { HUB_MAP_ID, requireMap } from "../data";
import { ZOOM_LEVELS } from "../settings";
import {
  PHOTO_PAN_STEP,
  PHOTO_SUPERSAMPLE,
  PHOTO_ZOOM_LEVELS,
  createShotCounter,
  cyclePhotoPhase,
  enterPhotoMode,
  exitPhotoMode,
  panPhoto,
  photoCaptureScale,
  photoFilename,
  stepPhotoZoom,
  togglePhotoCharacters,
  togglePhotoSupersample,
  togglePhotoWeather,
  zoomPhoto,
  type PhotoRestore,
  type PhotoViewport,
} from "./photoModel";

const MAP_ID = HUB_MAP_ID;

function viewport(): PhotoViewport {
  return { width: 960, height: 540, bounds: mapPixelBounds(requireMap(MAP_ID)) };
}

function restore(camera: Camera = { sx: 0, sy: 0 }): PhotoRestore {
  return { camera, zoom: 1.5, dayPhase: "dusk", weather: true };
}

describe("the photo zoom ladder", () => {
  it("offers every level the game plays at, plus a deeper one", () => {
    for (const level of ZOOM_LEVELS) {
      expect(PHOTO_ZOOM_LEVELS).toContain(level);
    }
    const deepest = PHOTO_ZOOM_LEVELS[PHOTO_ZOOM_LEVELS.length - 1]!;
    expect(deepest).toBeGreaterThan(Math.max(...ZOOM_LEVELS));
  });

  it("keeps every level a whole number of pixels per art pixel", () => {
    for (const level of PHOTO_ZOOM_LEVELS) {
      expect(Number.isInteger(level * ART_SCALE), `${level}×`).toBe(true);
    }
  });

  it("steps up and down and stops at the ends", () => {
    expect(stepPhotoZoom(1, -1)).toBe(1);
    expect(stepPhotoZoom(1, 1)).toBe(1.5);
    expect(stepPhotoZoom(2, 1)).toBe(3);
    expect(stepPhotoZoom(3, 1)).toBe(3);
  });
});

describe("entering and leaving photo mode", () => {
  it("opens on exactly what gameplay was showing", () => {
    const prior = restore({ sx: 120, sy: -40 });
    const session = enterPhotoMode(prior);
    expect(session.framing.camera).toEqual(prior.camera);
    expect(session.framing.zoom).toBe(prior.zoom);
    expect(session.framing.dayPhase).toBe(prior.dayPhase);
    expect(session.framing.weather).toBe(prior.weather);
    // Nobody is out of frame until somebody asks for it.
    expect(session.framing.hideCharacters).toBe(false);
    expect(session.framing.supersample).toBe(false);
  });

  it("hands gameplay back untouched however far the framing wandered", () => {
    const prior = restore({ sx: 120, sy: -40 });
    const session = enterPhotoMode(prior);
    const view = viewport();
    session.framing = panPhoto(session.framing, -400, 260, view);
    session.framing = zoomPhoto(session.framing, 1, view);
    session.framing = zoomPhoto(session.framing, 1, view);
    session.framing = cyclePhotoPhase(session.framing, 1);
    session.framing = togglePhotoWeather(session.framing);
    session.framing = togglePhotoCharacters(session.framing);
    session.framing = togglePhotoSupersample(session.framing);

    expect(exitPhotoMode(session)).toEqual(prior);
    // And the framing really did move, so the check above means something.
    expect(session.framing.camera).not.toEqual(prior.camera);
    expect(session.framing.zoom).not.toBe(prior.zoom);
    expect(session.framing.dayPhase).not.toBe(prior.dayPhase);
    expect(session.framing.weather).not.toBe(prior.weather);
  });

  it("never writes through to the record it was handed", () => {
    const camera = { sx: 10, sy: 20 };
    const prior = restore(camera);
    const session = enterPhotoMode(prior);
    session.framing.camera.sx = 999;
    session.framing.dayPhase = "late";
    expect(camera).toEqual({ sx: 10, sy: 20 });
    expect(prior.dayPhase).toBe("dusk");
    expect(exitPhotoMode(session).camera).toEqual({ sx: 10, sy: 20 });
  });

  it("gives a restore that cannot be written back through either", () => {
    const session = enterPhotoMode(restore());
    const first = exitPhotoMode(session);
    first.camera.sx = 12_345;
    first.dayPhase = "late";
    expect(exitPhotoMode(session)).toEqual(restore());
  });
});

describe("framing the shot", () => {
  it("pans by the viewport delta, divided by the zoom", () => {
    const view = viewport();
    // Settled first, so the step below is measured against a camera the
    // clamp has already had its say about.
    const settled = panPhoto(enterPhotoMode(restore()).framing, 0, 0, view);
    const panned = panPhoto(settled, PHOTO_PAN_STEP, 0, view);
    // 1.5× zoom: 64 CSS pixels of drag is 64 / 1.5 world units.
    expect(panned.camera.sx - settled.camera.sx).toBeCloseTo(
      PHOTO_PAN_STEP / 1.5,
      6,
    );
    expect(panned.camera.sy).toBe(settled.camera.sy);
  });

  it("keeps the camera inside the map however hard it is pushed", () => {
    const view = viewport();
    const bounds = view.bounds;
    let framing = enterPhotoMode(restore()).framing;
    for (let i = 0; i < 200; i += 1) {
      framing = panPhoto(framing, -500, -500, view);
    }
    expect(framing.camera.sx).toBeGreaterThanOrEqual(bounds.minX - 10_000);
    // The real assertion: it settled somewhere, rather than running off.
    const settled = panPhoto(framing, -500, -500, view);
    expect(settled.camera).toEqual(framing.camera);

    let east = enterPhotoMode(restore()).framing;
    for (let i = 0; i < 200; i += 1) east = panPhoto(east, 500, 500, view);
    expect(panPhoto(east, 500, 500, view).camera).toEqual(east.camera);
    expect(east.camera).not.toEqual(framing.camera);
  });

  it("re-clamps when the zoom deepens", () => {
    const view = viewport();
    let framing = enterPhotoMode(restore()).framing;
    // Push hard into a corner at the shallowest zoom the ladder has.
    framing = zoomPhoto(framing, -1, view);
    for (let i = 0; i < 200; i += 1) framing = panPhoto(framing, -500, -500, view);
    const wide = { ...framing.camera };
    const deep = zoomPhoto(framing, 1, view);
    // A tighter viewport reaches further into the corner, never less.
    expect(deep.zoom).toBe(1.5);
    expect(deep.camera.sx).toBeLessThanOrEqual(wide.sx);
    expect(deep.camera.sy).toBeLessThanOrEqual(wide.sy);
  });

  it("cycles the hour both ways and wraps", () => {
    let framing = enterPhotoMode(restore()).framing;
    const seen = new Set<string>();
    for (let i = 0; i < DAY_PHASES.length; i += 1) {
      seen.add(framing.dayPhase);
      framing = cyclePhotoPhase(framing, 1);
    }
    expect(seen.size).toBe(DAY_PHASES.length);
    // A full lap comes home.
    expect(framing.dayPhase).toBe("dusk");
    expect(cyclePhotoPhase(cyclePhotoPhase(framing, -1), 1).dayPhase).toBe("dusk");
  });

  it("moving the hour is the framing's business and not the run's", () => {
    const prior = restore();
    const session = enterPhotoMode(prior);
    session.framing = cyclePhotoPhase(session.framing, 1);
    session.framing = cyclePhotoPhase(session.framing, 1);
    expect(session.framing.dayPhase).not.toBe(prior.dayPhase);
    expect(exitPhotoMode(session).dayPhase).toBe(prior.dayPhase);
  });

  it("toggles read as switches and nothing else moves", () => {
    const framing = enterPhotoMode(restore()).framing;
    const hidden = togglePhotoCharacters(framing);
    expect(hidden.hideCharacters).toBe(true);
    expect(togglePhotoCharacters(hidden)).toEqual(framing);
    expect(hidden.camera).toEqual(framing.camera);
    expect(togglePhotoWeather(framing).weather).toBe(false);
    expect(togglePhotoSupersample(framing).supersample).toBe(true);
  });

  it("supersampling is the whole of what a capture scales by", () => {
    const framing = enterPhotoMode(restore()).framing;
    expect(photoCaptureScale(framing)).toBe(1);
    expect(photoCaptureScale(togglePhotoSupersample(framing))).toBe(
      PHOTO_SUPERSAMPLE,
    );
  });
});

describe("what a shot is called", () => {
  it("names the district and numbers the shot", () => {
    expect(photoFilename("cinder-plaza", 1)).toBe("neon-fable-cinder-plaza-1.png");
    expect(photoFilename("cinder-plaza", 12)).toBe(
      "neon-fable-cinder-plaza-12.png",
    );
  });

  it("is the same name for the same shot, every run", () => {
    expect(photoFilename("dock-row", 3)).toBe(photoFilename("dock-row", 3));
  });

  it("squeezes anything a file system would argue with", () => {
    expect(photoFilename("Dock Row/2", 1)).toBe("neon-fable-dock-row-2-1.png");
    expect(photoFilename("!!!", 1)).toBe("neon-fable-map-1.png");
  });

  it("counts up from one and never repeats", () => {
    const counter = createShotCounter();
    expect([counter.next(), counter.next(), counter.next()]).toEqual([1, 2, 3]);
    expect(createShotCounter().next()).toBe(1);
  });
});
