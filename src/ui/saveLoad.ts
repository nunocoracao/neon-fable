import { audio } from "../audio";
import type { Interlude } from "../narrative";
import {
  SaveError,
  deleteSave,
  loadGame,
  readSaveSlots,
  renameSave,
  saveGame,
  type GameState,
  type SaveSlot,
  type SaveStorage,
} from "../state";
import { SAVE_LABEL_MAX_LENGTH } from "../state";
import { saveErrorMessage } from "./format";
import type { OverlayHandle } from "./overlay";
import {
  cardTitle,
  deleteConfirmed,
  renameError,
  slotCards,
  type SlotCard,
} from "./saveModel";
import { captureSaveExtras, sceneCanvas } from "./saveThumbs";
import type { Session } from "./session";

/**
 * Save/load slot cards. In "game" mode the three manual slots accept
 * saves; the autosave slot is load-only everywhere. All persistence goes
 * through the state module's save system, and every decision about what
 * a card says or offers is made in ./saveModel — this file paints.
 *
 * Three things it is careful about:
 *
 *  - **Nothing here can fail to draw.** The panel renders from
 *    readSaveSlots, which reads every slot in whatever condition it is
 *    in; a slot that failed validation becomes an info card carrying
 *    whatever survived, with its error stated plainly.
 *  - **Nothing here depends on a picture.** A save with no thumbnails
 *    (every save written before they existed) gets a placeholder
 *    silhouette and loses no function.
 *  - **A run past Act 1 is not deleted by a stray double-click.** It
 *    costs the runner's name, typed.
 *
 * A mid-game run also gets a "Previously" line: the act interlude the
 * loaded save is past, offered for replay. The panel is handed the
 * interlude already derived — it decides nothing about which one that
 * is, and replaying records nothing.
 */
export interface SaveLoadPanelOptions {
  mode: "game" | "menu";
  storage: SaveStorage;
  /** Required in "game" mode — the state that Save writes. */
  session?: Session;
  /** Last act boundary this run is past; null offers no replay. */
  latestInterlude?: Interlude | null;
  onReplayInterlude?(interlude: Interlude): void;
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
  /** Slot whose delete is armed, and what has been typed to confirm it. */
  let pendingDelete: SaveSlot | null = null;
  let deleteTyped = "";
  /** Slot whose label is being edited, and the working text. */
  let renaming: SaveSlot | null = null;
  let renameDraft = "";

  function setMessage(text: string, isError: boolean): void {
    message = text;
    messageIsError = isError;
  }

  function resetInteractions(): void {
    pendingDelete = null;
    deleteTyped = "";
    renaming = null;
    renameDraft = "";
  }

  function slotButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "nf-button nf-button-small";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  /**
   * The art block: the vignette behind, the face in front. Either can be
   * missing; with no portrait the frame draws a silhouette instead, so
   * a v1 save reads as "a save without a picture" rather than as a hole.
   */
  function renderArt(card: SlotCard): HTMLElement {
    const art = document.createElement("div");
    art.className = "nf-save-art";
    if (card.scene) {
      const scene = document.createElement("img");
      scene.className = "nf-save-scene";
      scene.alt = "";
      scene.src = card.scene;
      art.append(scene);
    }
    if (card.portrait) {
      const portrait = document.createElement("img");
      portrait.className = "nf-save-portrait";
      portrait.alt = "";
      portrait.src = card.portrait;
      art.append(portrait);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "nf-save-portrait nf-save-silhouette";
      art.append(placeholder);
    }
    return art;
  }

  function renderInfo(card: SlotCard): HTMLElement {
    const info = document.createElement("div");
    info.className = "nf-save-info";

    const heading = document.createElement("div");
    heading.className = "nf-save-slot";
    heading.textContent = cardTitle(card);
    if (card.label.length > 0) {
      const slotTag = document.createElement("span");
      slotTag.className = "nf-save-slot-tag";
      slotTag.textContent = card.slotName;
      heading.append(slotTag);
    }
    for (const badge of card.badges) {
      const chip = document.createElement("span");
      chip.className = "nf-save-badge";
      chip.textContent = badge;
      heading.append(chip);
    }
    info.append(heading);

    if (card.status === "empty") {
      const empty = document.createElement("div");
      empty.className = "nf-save-meta";
      empty.textContent = "Empty";
      info.append(empty);
      return info;
    }

    for (const line of [card.identity, card.chapter]) {
      if (!line) continue;
      const row = document.createElement("div");
      row.className = "nf-save-meta";
      row.textContent = line;
      info.append(row);
    }

    const footer = [card.progress, card.difficultyLabel, card.savedAtLabel]
      .filter((part) => part.length > 0)
      .join(" · ");
    if (footer) {
      const row = document.createElement("div");
      row.className = "nf-save-meta nf-save-footnote";
      row.textContent = footer;
      info.append(row);
    }

    if (card.notice) {
      const notice = document.createElement("p");
      notice.className = "nf-save-notice";
      notice.textContent = card.notice;
      info.append(notice);
    }

    if (renaming === card.slot) info.append(renameField(card));
    if (pendingDelete === card.slot && card.deleteGuard === "type-name") {
      info.append(deleteField(card));
    }
    return info;
  }

  /**
   * The rename field. Typing never re-renders — the panel redraws whole,
   * and a redraw per keystroke would take the caret with it — so the
   * draft is kept here and only the error line is refreshed live.
   */
  function renameField(card: SlotCard): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "nf-save-edit";

    const label = document.createElement("label");
    label.className = "nf-field-label";
    label.htmlFor = `nf-save-rename-${card.slot}`;
    label.textContent = "Name this save";

    const input = document.createElement("input");
    input.id = `nf-save-rename-${card.slot}`;
    input.className = "nf-input";
    input.maxLength = SAVE_LABEL_MAX_LENGTH;
    input.placeholder = "Before the Undercroft";
    input.value = renameDraft;

    const error = document.createElement("p");
    error.className = "nf-message nf-error nf-save-inline-error";

    const commit = (): void => {
      const problem = renameError(renameDraft);
      if (problem) {
        error.textContent = problem;
        return;
      }
      try {
        const stored = renameSave(card.slot, storage, renameDraft);
        setMessage(
          stored.length > 0
            ? `${card.slotName} is now "${stored}".`
            : `${card.slotName} label cleared.`,
          false,
        );
      } catch (saveError) {
        setMessage(errorText(saveError), true);
      }
      resetInteractions();
      render();
    };

    input.addEventListener("input", () => {
      renameDraft = input.value;
      error.textContent = renameError(renameDraft) ?? "";
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      }
    });

    const actions = document.createElement("div");
    actions.className = "nf-save-actions";
    actions.append(
      slotButton("Save name", commit),
      slotButton("Cancel", () => {
        resetInteractions();
        render();
      }),
    );

    wrap.append(label, input, error, actions);
    return wrap;
  }

  /** The typed-name confirm a run past Act 1 costs to delete. */
  function deleteField(card: SlotCard): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "nf-save-edit";

    const label = document.createElement("label");
    label.className = "nf-field-label";
    label.htmlFor = `nf-save-confirm-${card.slot}`;
    label.textContent = `Type "${card.confirmWord}" to delete this run`;

    const input = document.createElement("input");
    input.id = `nf-save-confirm-${card.slot}`;
    input.className = "nf-input";
    input.value = deleteTyped;

    const confirm = slotButton("Confirm delete", () => {
      if (!deleteConfirmed(card, deleteTyped)) return;
      removeSlot(card);
    });
    confirm.classList.add("nf-button-danger");
    confirm.disabled = !deleteConfirmed(card, deleteTyped);

    input.addEventListener("input", () => {
      deleteTyped = input.value;
      confirm.disabled = !deleteConfirmed(card, deleteTyped);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && deleteConfirmed(card, deleteTyped)) {
        event.preventDefault();
        removeSlot(card);
      }
    });

    const actions = document.createElement("div");
    actions.className = "nf-save-actions";
    actions.append(
      confirm,
      slotButton("Cancel", () => {
        resetInteractions();
        render();
      }),
    );

    wrap.append(label, input, actions);
    return wrap;
  }

  function removeSlot(card: SlotCard): void {
    deleteSave(card.slot, storage);
    setMessage(`${card.slotName} deleted.`, false);
    resetInteractions();
    render();
  }

  function renderActions(card: SlotCard): HTMLElement {
    const actions = document.createElement("div");
    actions.className = "nf-save-actions";

    if (card.canSave) {
      actions.append(
        slotButton("Save", () => {
          const session = options.session;
          if (!session) return;
          // Both pictures are taken now, from what is on screen now.
          // Either can come back empty and the save is written anyway.
          saveGame(
            session.state,
            card.slot,
            storage,
            Date.now(),
            captureSaveExtras(session.state, sceneCanvas()),
          );
          audio.emit("ui.save");
          setMessage(`Saved to ${card.slotName}.`, false);
          resetInteractions();
          render();
        }),
      );
    }

    if (card.canLoad) {
      actions.append(
        slotButton("Load", () => {
          try {
            const state = loadGame(card.slot, storage);
            audio.emit("ui.load");
            options.onLoaded(state);
          } catch (error) {
            setMessage(errorText(error), true);
            render();
          }
        }),
      );
    }

    if (card.canRename && renaming !== card.slot) {
      actions.append(
        slotButton(card.label.length > 0 ? "Rename" : "Name", () => {
          resetInteractions();
          renaming = card.slot;
          renameDraft = card.label;
          render();
        }),
      );
    }

    if (card.canDelete) {
      if (pendingDelete === card.slot && card.deleteGuard === "click") {
        const confirm = slotButton("Confirm delete", () => removeSlot(card));
        confirm.classList.add("nf-button-danger");
        actions.append(confirm);
      } else if (pendingDelete !== card.slot) {
        actions.append(
          slotButton("Delete", () => {
            resetInteractions();
            pendingDelete = card.slot;
            setMessage(
              card.deleteGuard === "type-name"
                ? `Deleting ${card.slotName} needs the runner's name typed back.`
                : `Delete ${card.slotName}? This cannot be undone.`,
              false,
            );
            render();
          }),
        );
      }
    }

    return actions;
  }

  function renderCard(card: SlotCard): HTMLElement {
    const row = document.createElement("div");
    row.className = "nf-save-row nf-save-card";
    if (card.status === "empty") row.classList.add("nf-save-card-empty");
    if (card.status === "unreadable") row.classList.add("nf-save-card-broken");
    row.append(renderArt(card), renderInfo(card), renderActions(card));
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

    for (const card of slotCards(readSaveSlots(storage), options.mode)) {
      panel.append(renderCard(card));
    }

    const previously = options.latestInterlude;
    if (previously && options.onReplayInterlude) {
      const row = document.createElement("div");
      row.className = "nf-save-row nf-save-previously";
      const info = document.createElement("div");
      info.className = "nf-save-info";
      const name = document.createElement("div");
      name.className = "nf-save-slot";
      name.textContent = "Previously";
      const meta = document.createElement("div");
      meta.className = "nf-save-meta";
      meta.textContent = previously.title;
      info.append(name, meta);
      const actions = document.createElement("div");
      actions.className = "nf-save-actions";
      actions.append(
        slotButton("Replay", () => options.onReplayInterlude?.(previously)),
      );
      row.append(info, actions);
      panel.append(row);
    }

    // The panel redraws whole, so a field that just opened has to be
    // handed the caret again — otherwise asking for a name would put
    // focus nowhere and the keyboard player would be stranded.
    focusOpenField();
  }

  function focusOpenField(): void {
    const id = renaming
      ? `nf-save-rename-${renaming}`
      : pendingDelete
        ? `nf-save-confirm-${pendingDelete}`
        : null;
    if (!id) return;
    panel.querySelector<HTMLInputElement>(`#${id}`)?.focus();
  }

  render();

  return {
    el,
    destroy(): void {
      el.remove();
    },
  };
}

/**
 * The line to show for a failed save operation. A SaveError is expected
 * and gets friendly copy; anything else is a bug in this build and is
 * rethrown to the screen boundary rather than swallowed into a toast.
 */
function errorText(error: unknown): string {
  if (error instanceof SaveError) return saveErrorMessage(error);
  throw error;
}
