/**
 * Dev exploration screen (?dev only): runs the iso scene on the
 * background canvas with a thin DOM overlay (back button + last
 * interaction readout). Interaction events are displayed, not routed —
 * the game screen owns the real narrative/combat wiring; this screen
 * exists to inspect maps without a character.
 */
import {
  DAY_PHASES,
  createIsoScene,
  createPixelArtSprites,
  resolveDayPhase,
  type DayPhaseId,
  type IsoScene,
} from "../iso";
import { requireMap } from "../data";
import { npcSpriteSource, sceneSpriteSource } from "./entitySprites";
import type { Screen } from "./screen";
import { t } from "./strings";

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
    name: "explore",
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
      back.textContent = t("common.back");
      back.addEventListener("click", onExit);

      const readout = document.createElement("p");
      readout.className = "nf-explore-readout";
      readout.textContent = t("explore.help");

      const map = requireMap(mapId);

      // Hour cycle: the only way to see a map's three moods back to
      // back, which is what tuning the tints actually needs. Dev-only —
      // in the game the map and the story own the clock.
      let phase: DayPhaseId = resolveDayPhase(map);
      const hour = document.createElement("button");
      hour.className = "nf-button nf-button-small";
      const labelHour = (): void => {
        hour.textContent = t("explore.hour", { phase });
      };
      labelHour();
      hour.addEventListener("click", () => {
        const next = DAY_PHASES[(DAY_PHASES.indexOf(phase) + 1) % DAY_PHASES.length];
        if (!next) return;
        phase = next;
        labelHour();
        scene?.setDayPhase(phase);
      });

      container.append(back, hour, readout);
      root.append(container);

      scene = createIsoScene(canvas, {
        map,
        spawnId,
        sprites: createPixelArtSprites({
          npc: npcSpriteSource(map),
          entity: sceneSpriteSource(),
        }),
        onInteract(event): void {
          const interaction = event.interaction;
          const detail =
            interaction.kind === "dialogue"
              ? `dialogue → ${interaction.nodeId}`
              : interaction.kind === "lore"
                ? `lore → ${interaction.shardId}`
                : interaction.kind === "breach"
                  ? `breach → ${interaction.contextId}`
                  : `combat → ${interaction.encounterId}`;
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
