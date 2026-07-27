/**
 * Dev exploration screen: runs the iso scene on the background canvas
 * with a thin DOM overlay (back button + last interaction readout).
 * Interaction events are only displayed here for now; routing them into
 * narrative/combat comes in a later task.
 */
import { createIsoScene, type IsoScene } from "../iso";
import { requireMap } from "../data";
import type { Screen } from "./screen";

export interface ExploreScreenOptions {
  mapId: string;
  spawnId: string;
  /** Called when the player leaves the scene (Back button). */
  onExit: () => void;
}

export function createExploreScreen(options: ExploreScreenOptions): Screen {
  const { mapId, spawnId, onExit } = options;
  let container: HTMLElement | null = null;
  let scene: IsoScene | null = null;
  let root: HTMLElement | null = null;

  return {
    mount(mountRoot: HTMLElement): void {
      root = mountRoot;
      // Let clicks fall through the overlay to the iso canvas.
      root.style.pointerEvents = "none";

      const canvas = document.getElementById("iso-canvas");
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("Missing #iso-canvas element");
      }

      container = document.createElement("div");
      container.className = "nf-explore-hud";

      const back = document.createElement("button");
      back.className = "nf-button nf-explore-back";
      back.textContent = "Back";
      back.addEventListener("click", onExit);

      const readout = document.createElement("p");
      readout.className = "nf-explore-readout";
      readout.textContent = "Click a tile to move. Drag to pan.";

      container.append(back, readout);
      root.append(container);

      scene = createIsoScene(canvas, {
        map: requireMap(mapId),
        spawnId,
        onInteract(event): void {
          const detail =
            event.interaction.kind === "dialogue"
              ? `dialogue → ${event.interaction.nodeId}`
              : `combat → ${event.interaction.encounterId}`;
          readout.textContent = `${event.interactableId}: ${detail}`;
        },
      });
    },

    unmount(): void {
      scene?.destroy();
      scene = null;
      container?.remove();
      container = null;
      if (root) {
        root.style.pointerEvents = "";
        root = null;
      }
    },
  };
}
