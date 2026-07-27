import { audio } from "../audio";
import { getMap } from "../data";
import {
  SAVE_SLOTS,
  SaveError,
  deleteSave,
  listSaves,
  loadGame,
  saveGame,
  type GameState,
  type SaveMetadata,
  type SaveSlot,
  type SaveStorage,
} from "../state";
import { formatTimestamp, saveErrorMessage, slotDisplayName } from "./format";
import type { OverlayHandle } from "./overlay";
import type { Session } from "./session";

/**
 * Save/load slot list. In "game" mode the three manual slots accept
 * saves; the autosave slot is load-only everywhere. Deletes take a
 * second confirming click. All persistence goes through the state
 * module's save system.
 */
export interface SaveLoadPanelOptions {
  mode: "game" | "menu";
  storage: SaveStorage;
  /** Required in "game" mode — the state that Save writes. */
  session?: Session;
  onLoaded(state: GameState): void;
  onClose(): void;
}

export function createSaveLoadPanel(
  options: SaveLoadPanelOptions,
): OverlayHandle {
  const { storage } = options;

  const el = document.createElement("div");
  el.className = "nf-overlay nf-overlay-center";

  const panel = document.createElement("div");
  panel.className = "nf-panel nf-saves";
  el.append(panel);

  let message = "";
  let messageIsError = false;
  let pendingDelete: SaveSlot | null = null;

  function setMessage(text: string, isError: boolean): void {
    message = text;
    messageIsError = isError;
  }

  function locationName(location: string): string {
    return getMap(location)?.name ?? location;
  }

  function slotButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "nf-button nf-button-small";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function renderSlotRow(
    slot: SaveSlot,
    metadata: SaveMetadata | undefined,
  ): HTMLElement {
    const row = document.createElement("div");
    row.className = "nf-save-row";

    const info = document.createElement("div");
    info.className = "nf-save-info";
    const name = document.createElement("div");
    name.className = "nf-save-slot";
    name.textContent = slotDisplayName(slot);
    const meta = document.createElement("div");
    meta.className = "nf-save-meta";
    meta.textContent = metadata
      ? `${metadata.characterName || "Runner"} — ${locationName(metadata.location)} — ` +
        formatTimestamp(metadata.savedAt)
      : "Empty";
    info.append(name, meta);
    row.append(info);

    const actions = document.createElement("div");
    actions.className = "nf-save-actions";
    if (options.mode === "game" && slot !== "autosave") {
      actions.append(
        slotButton("Save", () => {
          const session = options.session;
          if (!session) return;
          saveGame(session.state, slot, storage);
          audio.play("save-confirm");
          setMessage(`Saved to ${slotDisplayName(slot)}.`, false);
          pendingDelete = null;
          render();
        }),
      );
    }
    if (metadata) {
      actions.append(
        slotButton("Load", () => {
          try {
            const state = loadGame(slot, storage);
            audio.play("load-confirm");
            options.onLoaded(state);
          } catch (error) {
            if (error instanceof SaveError) {
              setMessage(saveErrorMessage(error), true);
              render();
            } else {
              throw error;
            }
          }
        }),
      );
      if (pendingDelete === slot) {
        const confirm = slotButton("Confirm delete", () => {
          deleteSave(slot, storage);
          setMessage(`${slotDisplayName(slot)} deleted.`, false);
          pendingDelete = null;
          render();
        });
        confirm.classList.add("nf-button-danger");
        actions.append(confirm);
      } else {
        actions.append(
          slotButton("Delete", () => {
            pendingDelete = slot;
            setMessage(
              `Delete ${slotDisplayName(slot)}? This cannot be undone.`,
              false,
            );
            render();
          }),
        );
      }
    }
    row.append(actions);
    return row;
  }

  function render(): void {
    panel.replaceChildren();

    const header = document.createElement("div");
    header.className = "nf-panel-header";
    const title = document.createElement("h2");
    title.textContent = options.mode === "game" ? "Save / Load" : "Load Game";
    const close = document.createElement("button");
    close.className = "nf-button nf-button-small";
    close.textContent = options.mode === "game" ? "Close [Esc]" : "Back";
    close.addEventListener("click", options.onClose);
    header.append(title, close);
    panel.append(header);

    const messageLine = document.createElement("p");
    messageLine.className = messageIsError ? "nf-message nf-error" : "nf-message";
    messageLine.textContent = message;
    panel.append(messageLine);

    const saves = new Map(listSaves(storage).map((save) => [save.slot, save]));
    for (const slot of SAVE_SLOTS) {
      panel.append(renderSlotRow(slot, saves.get(slot)));
    }
  }

  render();

  return {
    el,
    destroy(): void {
      el.remove();
    },
  };
}
