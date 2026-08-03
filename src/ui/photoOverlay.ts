/**
 * The photo-mode control strip, and the input that drives it.
 *
 * Everything on screen while a shot is being framed: a row of controls
 * along the bottom, a line of key hints under them, and nothing else —
 * the game screen has already taken the HUD, the minimap, the prompt,
 * and the street's chatter off screen, because a screenshot of a
 * district should be a picture of the district.
 *
 * This layer owns no state. The framing is the record in ./photoModel.ts
 * and every control is the same three steps: run a pure function over
 * it, push the result at the scene, relabel. That is why the interesting
 * questions — does panning stay inside the map, does the deeper zoom
 * exist, does leaving put the hour back — are answered by tests with no
 * DOM in them at all, and why the only thing left here that a browser
 * has to judge is the capture itself.
 *
 * Input is this strip's while it is up: the scene answers no key and no
 * pointer (see IsoScene.setPhoto), so the arrows pan rather than walk
 * and the zoom keys reach a level the game's own ladder does not have.
 * Tab still walks the controls, which is why the arrows are free to mean
 * something else here — the strip installs no arrow-key list navigation
 * of its own.
 */
import { audio } from "../audio";
import { mapPixelBounds, type DayPhaseId, type IsoMap, type IsoScene } from "../iso";
import { saveCanvasPng } from "./photoCapture";
import {
  PHOTO_PAN_STEP,
  cyclePhotoPhase,
  enterPhotoMode,
  exitPhotoMode,
  panPhoto,
  photoCaptureScale,
  photoFilename,
  sessionShots,
  togglePhotoCharacters,
  togglePhotoSupersample,
  togglePhotoWeather,
  zoomPhoto,
  type PhotoFraming,
  type PhotoRestore,
  type PhotoSession,
  type PhotoViewport,
  type ShotCounter,
} from "./photoModel";
import { plain, t, type PlainKey } from "./strings";

/** How each hour reads on the control that cycles them. */
const PHASE_LABELS: Record<DayPhaseId, PlainKey> = {
  dusk: "photo.phase.dusk",
  night: "photo.phase.night",
  late: "photo.phase.late",
};

/** Which way each key pushes the camera; one PHOTO_PAN_STEP per press. */
const PAN_KEYS: Readonly<Record<string, { x: number; y: number }>> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 },
};

export interface PhotoOverlayOptions {
  /** The scene's canvas: what is photographed, and what is dragged. */
  canvas: HTMLCanvasElement;
  scene: IsoScene;
  map: IsoMap;
  /** Gameplay as it stands; handed back untouched when the strip closes. */
  prior: PhotoRestore;
  /** Called when the player leaves photo mode, by key or by button. */
  onExit(): void;
  /** Overridable so a test can pin the numbering; defaults to the session's. */
  shots?: ShotCounter;
}

export interface PhotoOverlayHandle {
  el: HTMLElement;
  /** How the shot is framed right now — the strip's whole state. */
  framing(): PhotoFraming;
  destroy(): void;
}

export function createPhotoOverlay(
  options: PhotoOverlayOptions,
): PhotoOverlayHandle {
  const { canvas, scene, map } = options;
  const shots = options.shots ?? sessionShots;
  const session: PhotoSession = enterPhotoMode(options.prior);
  const bounds = mapPixelBounds(map);

  const el = document.createElement("section");
  el.className = "nf-photo";
  el.setAttribute("aria-label", t("photo.title"));

  const title = document.createElement("h2");
  title.className = "nf-photo-title";
  title.textContent = t("photo.title");

  const controls = document.createElement("div");
  controls.className = "nf-photo-controls";

  const hints = document.createElement("p");
  hints.className = "nf-photo-hints";
  hints.textContent = t("photo.hints");

  const status = document.createElement("p");
  status.className = "nf-photo-status";
  // The capture happens on a canvas nobody can see change, so the one
  // confirmation a player gets is this line — and it has to announce
  // itself, because no focus moves when a file is written.
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  el.append(title, controls, hints, status);

  /** The viewport every clamp is taken against, re-read as it changes. */
  function viewport(): PhotoViewport {
    return {
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      bounds,
    };
  }

  /** Pushes the framing at the scene and relabels the controls. */
  function apply(next: PhotoFraming): void {
    session.framing = next;
    scene.setPhoto({
      camera: next.camera,
      zoom: next.zoom,
      dayPhase: next.dayPhase,
      weather: next.weather,
      hideCharacters: next.hideCharacters,
    });
    relabel();
  }

  function button(className: string, onClick: () => void): HTMLButtonElement {
    const control = document.createElement("button");
    control.className = `nf-button nf-button-small ${className}`;
    control.addEventListener("click", onClick);
    return control;
  }

  const zoomOut = button("nf-photo-zoom-out", () =>
    apply(zoomPhoto(session.framing, -1, viewport())),
  );
  const zoomIn = button("nf-photo-zoom-in", () =>
    apply(zoomPhoto(session.framing, 1, viewport())),
  );
  const hour = button("nf-photo-hour", () =>
    apply(cyclePhotoPhase(session.framing, 1)),
  );
  const weather = button("nf-photo-weather", () =>
    apply(togglePhotoWeather(session.framing)),
  );
  const people = button("nf-photo-people", () =>
    apply(togglePhotoCharacters(session.framing)),
  );
  const supersample = button("nf-photo-supersample", () =>
    apply(togglePhotoSupersample(session.framing)),
  );
  const capture = button("nf-photo-capture", () => {
    void takeShot();
  });
  const exit = button("nf-photo-exit", () => leave());

  zoomOut.textContent = t("photo.zoomOut");
  zoomIn.textContent = t("photo.zoomIn");
  capture.textContent = t("photo.capture");
  exit.textContent = t("photo.exit");
  /** How deep the shot is zoomed — a readout, not a control. */
  const zoomLevel = document.createElement("span");
  zoomLevel.className = "nf-photo-zoom";
  controls.append(
    zoomOut,
    zoomLevel,
    zoomIn,
    hour,
    weather,
    people,
    supersample,
    capture,
    exit,
  );

  /** Writes every control and readout whose caption is its own value. */
  function relabel(): void {
    const { framing } = session;
    zoomLevel.textContent = t("photo.zoom", { zoom: String(framing.zoom) });
    hour.textContent = t("photo.hour", {
      phase: plain(PHASE_LABELS[framing.dayPhase]),
    });
    weather.textContent = framing.weather
      ? t("photo.weather.on")
      : t("photo.weather.off");
    weather.setAttribute("aria-pressed", String(framing.weather));
    people.textContent = framing.hideCharacters
      ? t("photo.people.hidden")
      : t("photo.people.shown");
    people.setAttribute("aria-pressed", String(framing.hideCharacters));
    supersample.textContent = framing.supersample
      ? t("photo.supersample.on")
      : t("photo.supersample.off");
    supersample.setAttribute("aria-pressed", String(framing.supersample));
  }

  /**
   * One shot: the scene paints the frame it is holding into a canvas of
   * its own, and the file goes down under a name that says which
   * district it is and which shot of the session it was.
   */
  async function takeShot(): Promise<void> {
    const shot = scene.captureFrame(photoCaptureScale(session.framing));
    if (!shot) {
      audio.emit("ui.cancel");
      status.textContent = t("photo.saveFailed");
      return;
    }
    const filename = photoFilename(map.id, shots.next());
    const saved = await saveCanvasPng(shot, filename);
    audio.emit(saved ? "ui.confirm" : "ui.cancel");
    status.textContent = saved
      ? t("photo.saved", { file: filename })
      : t("photo.saveFailed");
  }

  /** Puts photo mode away: the scene first, then whoever opened it. */
  function leave(): void {
    audio.emit("ui.cancel");
    options.onExit();
  }

  // --- Input ----------------------------------------------------------

  function pan(dx: number, dy: number): void {
    apply(panPhoto(session.framing, dx, dy, viewport()));
  }

  /**
   * Whether a key press belongs to the strip rather than to the control
   * the player has tabbed onto. Only the activation keys are handed
   * back: everything else means the same thing wherever focus is, and a
   * player who has tabbed to the hour button still expects the arrows
   * to move the camera.
   */
  function keyIsOurs(event: KeyboardEvent): boolean {
    if (event.key !== "Enter" && event.key !== " ") return true;
    return !(event.target instanceof HTMLElement && event.target.closest("button"));
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (!keyIsOurs(event)) return;
    const key = event.key;
    if (key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      leave();
      return;
    }
    const step = PAN_KEYS[key.length === 1 ? key.toLowerCase() : key];
    if (step) {
      event.preventDefault();
      pan(step.x * PHOTO_PAN_STEP, step.y * PHOTO_PAN_STEP);
      return;
    }
    if (key === "+" || key === "=") {
      event.preventDefault();
      apply(zoomPhoto(session.framing, 1, viewport()));
      return;
    }
    if (key === "-" || key === "_") {
      event.preventDefault();
      apply(zoomPhoto(session.framing, -1, viewport()));
      return;
    }
    if (key === "[" || key === "]") {
      event.preventDefault();
      apply(cyclePhotoPhase(session.framing, key === "]" ? 1 : -1));
      return;
    }
    if (key === "r" || key === "R") {
      apply(togglePhotoWeather(session.framing));
      return;
    }
    if (key === "h" || key === "H") {
      apply(togglePhotoCharacters(session.framing));
      return;
    }
    if (key === "2") {
      apply(togglePhotoSupersample(session.framing));
      return;
    }
    if (key === "Enter") {
      event.preventDefault();
      void takeShot();
    }
  }

  // Drag-panning: the same clamped path the keys take, so a shot framed
  // by dragging and one framed by pressing an arrow cannot end up in
  // places the other could not reach.
  let dragging = false;
  let last = { x: 0, y: 0 };

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    dragging = true;
    last = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = "grabbing";
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging) return;
    // Dragging moves the ground with the cursor, so the camera moves
    // the other way — the same sign the scene's own drag-pan uses.
    pan(last.x - event.clientX, last.y - event.clientY);
    last = { x: event.clientX, y: event.clientY };
  }

  function onPointerUp(event: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    canvas.releasePointerCapture(event.pointerId);
    canvas.style.cursor = "";
  }

  function onWheel(event: WheelEvent): void {
    if (event.deltaY === 0) return;
    event.preventDefault();
    apply(zoomPhoto(session.framing, event.deltaY < 0 ? 1 : -1, viewport()));
  }

  function onResize(): void {
    // The clamp is against the viewport, so a window that changed shape
    // can leave a framing pointing off the edge of the district.
    apply(panPhoto(session.framing, 0, 0, viewport()));
  }

  apply(session.framing);
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("resize", onResize);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  return {
    el,
    framing: () => session.framing,
    destroy(): void {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.style.cursor = "";
      // The framing is dropped and gameplay is handed back exactly as it
      // was found — the record has been sitting untouched since the
      // strip opened (see exitPhotoMode).
      const prior = exitPhotoMode(session);
      scene.setPhoto(null);
      scene.setCamera(prior.camera);
      el.remove();
    },
  };
}
