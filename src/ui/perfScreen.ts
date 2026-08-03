/**
 * Dev performance screen (?dev only): the scripted worst-case scene
 * from src/data/perfScenes.ts, with the frame-time HUD over it.
 *
 * The point is that the same frame can be measured twice. The scene
 * forces its own graphics settings (every pass on, motion unreduced,
 * the widest zoom) and puts the player's back where it found them on
 * the way out; the camera pans a fixed circuit at a fixed speed rather
 * than sitting still, because a hitch that only shows while the world
 * is scrolling is the one worth catching.
 */
import { PERF_SCENES, panRect, scrollCircuit } from "../data/perfScenes";
import { requireMap } from "../data";
import {
  clampCamera,
  createIsoScene,
  createPixelArtSprites,
  mapPixelBounds,
  type Camera,
  type IsoScene,
  type PixelArtSprites,
} from "../iso";
import { settings, type Settings } from "../settings";
import { npcSpriteSource, sceneSpriteSource } from "./entitySprites";
import { createPerfHud, type PerfHud } from "./perfHud";
import type { Screen } from "./screen";
import { t } from "./strings";

export interface PerfScreenOptions {
  /** Which scripted scene to run; the first is the worst case. */
  sceneId?: string;
  onExit: () => void;
}

export function createPerfScreen(options: PerfScreenOptions): Screen {
  const scene =
    PERF_SCENES.find((entry) => entry.id === options.sceneId) ?? PERF_SCENES[0];
  if (!scene) throw new Error("No perf scenes are registered");

  let container: HTMLElement | null = null;
  let iso: IsoScene | null = null;
  let hud: PerfHud | null = null;
  let root: HTMLElement | null = null;
  let rafId = 0;
  let restore: Settings | null = null;

  return {
    mount(mountRoot: HTMLElement): void {
      root = mountRoot;
      root.style.pointerEvents = "none";

      const canvas = document.getElementById("iso-canvas");
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("Missing #iso-canvas element");
      }

      // Force the measurement's settings, remembering what the player
      // had so the panel they come back to is the one they left.
      restore = settings.get();
      settings.update({ ...scene.graphics, zoom: scene.zoom });

      container = document.createElement("div");
      container.className = "nf-explore-hud";

      const back = document.createElement("button");
      back.className = "nf-button nf-explore-back";
      back.textContent = t("common.back");
      back.addEventListener("click", options.onExit);

      let scrolling = true;
      const scroll = document.createElement("button");
      scroll.className = "nf-button nf-button-small";
      const labelScroll = (): void => {
        scroll.textContent = scrolling
          ? t("perf.scroll.on")
          : t("perf.scroll.off");
      };
      labelScroll();
      scroll.addEventListener("click", () => {
        scrolling = !scrolling;
        labelScroll();
        hud?.reset();
      });

      const note = document.createElement("p");
      note.className = "nf-explore-readout";
      note.textContent = `${scene.label} — ${scene.note}`;

      container.append(back, scroll, note);
      root.append(container);

      const map = requireMap(scene.mapId);
      const bounds = mapPixelBounds(map);
      const sprites: PixelArtSprites = createPixelArtSprites({
        npc: npcSpriteSource(map),
        entity: sceneSpriteSource(),
      });

      hud = createPerfHud({
        host: container,
        cacheStats: () => sprites.cacheStats(),
      });

      iso = createIsoScene(canvas, {
        map,
        spawnId: scene.spawnId,
        sprites,
        weather: scene.weather,
        dayPhase: scene.dayPhase,
        onInteract(): void {
          // Nothing is being played here; the scene is a stopwatch.
        },
        onPerf(sample): void {
          hud?.sample(sample);
        },
      });

      // The scripted pan. Its own loop rather than a scene option: what
      // the camera does during a measurement is the measurement's
      // business, and the scene only has to be told where to look.
      const startedAt = performance.now();
      const clamp = (camera: Camera): Camera =>
        clampCamera(
          camera,
          bounds,
          canvas.clientWidth / scene.zoom,
          canvas.clientHeight / scene.zoom,
        );
      const step = (): void => {
        if (scrolling && canvas.clientWidth > 0) {
          const { lo, hi } = panRect(clamp, bounds);
          iso?.setCamera(
            scrollCircuit(lo, hi, performance.now() - startedAt, scene.scrollPxPerS),
          );
        }
        rafId = requestAnimationFrame(step);
      };
      rafId = requestAnimationFrame(step);
    },

    unmount(): void {
      cancelAnimationFrame(rafId);
      rafId = 0;
      iso?.destroy();
      iso = null;
      hud?.destroy();
      hud = null;
      container?.remove();
      container = null;
      if (restore) {
        settings.update(restore);
        restore = null;
      }
      if (root) {
        root.style.pointerEvents = "";
        root = null;
      }
    },
  };
}
