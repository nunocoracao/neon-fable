import { audio } from "../audio";
import {
  InventoryError,
  fitMod,
  pullMod,
  type WeaponRef,
  type Workbench,
} from "../inventory";
import { focusFirst } from "./focus";
import type { OverlayHandle } from "./overlay";
import type { Session } from "./session";
import { workbenchModel, type WorkbenchModel } from "./workbenchModel";
import { t } from "./strings";

/**
 * The rig-up bench: the only screen that changes a weapon's parts.
 *
 * Three columns, left to right — which weapon, which socket, which
 * part — and every figure on them comes from ./workbenchModel.ts, which
 * derives it through the same `weaponProfile` the fight reads. Nothing
 * here computes a stat; nothing here enforces a rule. Fitting and
 * pulling dispatch into the pure workbench ops and surface their
 * InventoryError messages, exactly as the inventory panel does.
 */
export interface WorkbenchOverlayOptions {
  session: Session;
  onStateChange(): void;
  onClose(): void;
}

export function createWorkbenchOverlay(
  options: WorkbenchOverlayOptions,
): OverlayHandle {
  const { session } = options;

  const el = document.createElement("div");
  el.className = "nf-overlay nf-overlay-center";

  const panel = document.createElement("div");
  panel.className = "nf-panel nf-workbench";
  el.append(panel);

  let selectedRef: WeaponRef | null = null;
  let socketIndex: number | null = null;
  let message = "";
  let messageIsError = false;

  /** The slice of the run the bench works on. */
  function bench(): Workbench {
    return {
      character: session.state.player,
      inventory: session.state.inventory,
      credits: session.state.credits,
    };
  }

  /** Runs a bench operation and folds the result back into the run. */
  function apply(action: (current: Workbench) => Workbench): void {
    try {
      const next = action(bench());
      session.state = {
        ...session.state,
        player: next.character,
        inventory: next.inventory,
        credits: next.credits,
      };
      audio.emit("ui.install");
      message = "";
      messageIsError = false;
      options.onStateChange();
    } catch (error) {
      if (!(error instanceof InventoryError)) throw error;
      message = error.message;
      messageIsError = true;
    }
    render();
  }

  function button(
    label: string,
    className: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const el = document.createElement("button");
    el.className = className;
    el.textContent = label;
    el.addEventListener("click", onClick);
    return el;
  }

  function chips(labels: string[], className: string): HTMLElement | null {
    if (labels.length === 0) return null;
    const row = document.createElement("div");
    row.className = className;
    row.textContent = labels.join(" · ");
    return row;
  }

  function renderWeapons(model: WorkbenchModel): HTMLElement {
    const column = document.createElement("div");
    column.className = "nf-bench-column";
    const heading = document.createElement("h3");
    heading.textContent = t("bench.rack");
    column.append(heading);

    if (model.weapons.length === 0) {
      const empty = document.createElement("p");
      empty.className = "nf-dim";
      empty.textContent = t("bench.rack.empty");
      column.append(empty);
      return column;
    }

    const list = document.createElement("div");
    list.className = "nf-bench-list";
    list.setAttribute("role", "radiogroup");
    list.setAttribute("aria-label", t("bench.rack.label"));
    for (const row of model.weapons) {
      const card = button(
        "",
        row.selected ? "nf-bench-card nf-selected" : "nf-bench-card",
        () => {
          selectedRef = row.ref;
          socketIndex = null;
          message = "";
          render();
        },
      );
      card.setAttribute("role", "radio");
      card.setAttribute("aria-checked", row.selected ? "true" : "false");
      card.disabled = !row.workable;

      const name = document.createElement("span");
      name.className = "nf-item-name";
      name.textContent = `${row.name} — ${row.place}`;
      const summary = document.createElement("span");
      summary.className = "nf-item-summary";
      summary.textContent = row.summary;
      const sockets = document.createElement("span");
      sockets.className = "nf-bench-sockets";
      sockets.textContent = row.socketLine;
      card.append(name, summary, sockets);
      list.append(card);
    }
    column.append(list);
    return column;
  }

  function renderSockets(model: WorkbenchModel): HTMLElement {
    const column = document.createElement("div");
    column.className = "nf-bench-column";
    const heading = document.createElement("h3");
    heading.textContent = model.selected
      ? t("bench.sockets.of", { name: model.selected.item.name })
      : t("bench.sockets");
    column.append(heading);

    if (model.sockets.length === 0) {
      const empty = document.createElement("p");
      empty.className = "nf-dim";
      empty.textContent = t("bench.noSockets");
      column.append(empty);
      return column;
    }

    for (const socket of model.sockets) {
      const card = document.createElement("div");
      card.className =
        model.socketIndex === socket.index
          ? "nf-bench-socket nf-selected"
          : "nf-bench-socket";

      const label = document.createElement("div");
      label.className = "nf-item-name";
      label.textContent = t("bench.socket", {
        label: socket.label,
        fitted: socket.fitted ?? t("bench.socket.empty"),
      });
      card.append(label);

      const effects = chips(socket.effects, "nf-item-effects");
      if (effects) card.append(effects);

      if (socket.pull) {
        const deltas = chips(socket.pull.deltas, "nf-bench-delta");
        if (deltas) card.append(deltas);
        const pull = button(
          socket.pull.feeLabel,
          "nf-button nf-button-small",
          () =>
            apply((current) =>
              pullMod(current, model.selected!.ref, socket.index),
            ),
        );
        pull.disabled = !socket.pull.affordable;
        card.append(pull);
      } else {
        card.append(
          button(t("bench.fitPart"), "nf-button nf-button-small", () => {
            socketIndex = socket.index;
            message = "";
            render();
          }),
        );
      }
      column.append(card);
    }
    return column;
  }

  function renderParts(model: WorkbenchModel): HTMLElement {
    const column = document.createElement("div");
    column.className = "nf-bench-column";
    const heading = document.createElement("h3");
    heading.textContent = t("bench.parts");
    column.append(heading);

    if (model.socketIndex === null) {
      const hint = document.createElement("p");
      hint.className = "nf-dim";
      hint.textContent = t("bench.parts.hint");
      column.append(hint);
      return column;
    }
    if (model.parts.length === 0) {
      const empty = document.createElement("p");
      empty.className = "nf-dim";
      empty.textContent = t("bench.parts.empty");
      column.append(empty);
      return column;
    }

    for (const part of model.parts) {
      const card = document.createElement("div");
      card.className = "nf-bench-part";

      const name = document.createElement("div");
      name.className = "nf-item-name";
      name.textContent =
        part.quantity > 1 ? `${part.name} ×${part.quantity}` : part.name;
      card.append(name);

      const effects = chips(part.effects, "nf-item-effects");
      if (effects) card.append(effects);
      // What it would do, before anything is committed — the whole
      // point of the screen.
      const deltas = chips(part.deltas, "nf-bench-delta");
      if (deltas) card.append(deltas);

      const fit = button(t("bench.fit"), "nf-button nf-button-small", () =>
        apply((current) =>
          fitMod(current, model.selected!.ref, model.socketIndex!, part.modId),
        ),
      );
      fit.disabled = part.preview === null;
      card.append(fit);
      column.append(card);
    }
    return column;
  }

  function render(): void {
    const model = workbenchModel(bench(), selectedRef, socketIndex);
    // The rack shifts under a fitting (a part leaves the bag, so every
    // later stack index moves); re-reading the selection off the model
    // is what keeps the highlighted weapon the one being worked on.
    selectedRef = model.selected?.ref ?? null;
    socketIndex = model.socketIndex;

    panel.replaceChildren();

    const header = document.createElement("div");
    header.className = "nf-panel-header";
    const title = document.createElement("h2");
    title.textContent = t("bench.title");
    const credits = document.createElement("span");
    credits.className = "nf-bench-credits";
    credits.textContent = t("counter.credits", { credits: model.credits });
    const close = document.createElement("button");
    close.className = "nf-button nf-button-small";
    close.textContent = t("common.doneEsc");
    close.addEventListener("click", options.onClose);
    header.append(title, credits, close);
    panel.append(header);

    const messageLine = document.createElement("p");
    messageLine.className = messageIsError
      ? "nf-message nf-error"
      : "nf-message";
    messageLine.textContent = message;
    panel.append(messageLine);

    const columns = document.createElement("div");
    columns.className = "nf-bench-columns";
    columns.append(
      renderWeapons(model),
      renderSockets(model),
      renderParts(model),
    );
    panel.append(columns);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      options.onClose();
    }
  }

  render();
  window.addEventListener("keydown", onKeyDown);
  focusFirst(panel);

  return {
    el,
    destroy(): void {
      window.removeEventListener("keydown", onKeyDown);
      el.remove();
    },
  };
}
