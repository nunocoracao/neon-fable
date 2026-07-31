import { audio } from "../audio";
import type { Appearance } from "../character";
import {
  COSMETIC_APPEARANCE_TABS,
  RESTYLE_PRICE,
  RESTYLE_REFUSAL,
} from "../data";
import {
  InventoryError,
  applyDye,
  buyAndApplyDye,
  stripDye,
  type DyeCounter,
  type OutfitRef,
} from "../inventory";
import { applyRestyle, restyleChanged } from "../state";
import { createAppearancePicker } from "./appearancePicker";
import { createAppearancePreview } from "./appearancePreview";
import { dyeCounterModel } from "./dyeModel";
import { focusFirst } from "./focus";
import type { OverlayHandle } from "./overlay";
import type { Session } from "./session";

/**
 * The Chrome Chapel's re-style screen: the creation wizard's shared
 * picker panel (cosmetic tabs only — build and skin tone are the
 * person, not the style) beside the shared live preview, both running
 * against a local draft of the player's current look in their actual
 * equipped gear. Nothing touches GameState until Confirm: payment
 * gating, the fee deduction, and the cosmetic-only merge all go through
 * the pure restyle functions, and Cancel simply drops the draft.
 *
 * The colour counter under the preview is the exception, and honestly
 * so: buying a tin is a purchase, not a draft. Each dye row commits at
 * once through the pure dye rules (buy-and-apply, or a free application
 * of a tin already carried), which is what "applied free with the
 * purchase" means — so Cancel drops the look you were trying on, never
 * the colour you paid for.
 */
export interface StylistOverlayOptions {
  session: Session;
  /** Called after a confirmed restyle so the HUD can refresh. */
  onStateChange(): void;
  /** Called when the screen closes (confirm or cancel alike). */
  onClose(): void;
}

export function createStylistOverlay(
  options: StylistOverlayOptions,
): OverlayHandle {
  const { session } = options;
  const original = session.state.player.appearance;
  let draft: Appearance = { ...original };

  const el = document.createElement("div");
  el.className = "nf-overlay nf-overlay-center";

  const panel = document.createElement("div");
  panel.className = "nf-panel nf-stylist";
  el.append(panel);

  const header = document.createElement("div");
  header.className = "nf-panel-header";
  const title = document.createElement("h2");
  title.textContent = "The Chrome Chapel";
  const fee = document.createElement("span");
  fee.className = "nf-dim";
  fee.textContent = `Restyle fee: ${RESTYLE_PRICE} cr`;
  header.append(title, fee);

  const columns = document.createElement("div");
  columns.className = "nf-create-columns nf-appearance-columns";
  const left = document.createElement("div");
  left.className = "nf-create-column";
  const right = document.createElement("div");
  right.className = "nf-create-column";
  columns.append(left, right);

  const preview = createAppearancePreview({
    appearance: () => draft,
    equipment: () => session.state.player.equipment,
  });

  const picker = createAppearancePicker({
    appearance: () => draft,
    tabs: COSMETIC_APPEARANCE_TABS,
    onPick(category, id) {
      draft = { ...draft, [category]: id };
      picker.update();
      preview.update();
      refreshStatus();
    },
  });

  const status = document.createElement("p");
  status.className = "nf-message nf-stylist-status";
  status.setAttribute("role", "status");

  /* --- The colour counter -------------------------------------------- */

  const dyes = document.createElement("div");
  dyes.className = "nf-stylist-dyes";
  /** Which coat the tins would go on; null follows the model's default. */
  let coatRef: OutfitRef | null = null;
  let dyeMessage = "";
  let dyeMessageIsError = false;

  function counter(): DyeCounter {
    return {
      character: session.state.player,
      inventory: session.state.inventory,
      credits: session.state.credits,
    };
  }

  /** Commits a colour transaction; a refusal writes only the message. */
  function dyeAction(action: () => DyeCounter, line: string): void {
    let next: DyeCounter;
    try {
      next = action();
    } catch (error) {
      if (!(error instanceof InventoryError)) throw error;
      dyeMessage = error.message;
      dyeMessageIsError = true;
      renderDyes();
      return;
    }
    session.state = {
      ...session.state,
      player: next.character,
      inventory: next.inventory,
      credits: next.credits,
    };
    dyeMessage = line;
    dyeMessageIsError = false;
    audio.play("ui-confirm");
    options.onStateChange();
    // The worn coat's new colour is in the equipment the preview and
    // the portrait inset already read; they just have to look again.
    preview.update();
    refreshStatus();
    renderDyes();
  }

  function renderDyes(): void {
    const model = dyeCounterModel(counter(), coatRef);
    dyes.replaceChildren();

    const heading = document.createElement("h3");
    heading.textContent = "Colour work";
    dyes.append(heading);

    if (model.coats.length === 0) {
      const empty = document.createElement("p");
      empty.className = "nf-dim";
      empty.textContent =
        "\"Bring me a coat and I'll bring you a colour, love.\"";
      dyes.append(empty);
      return;
    }

    // The wardrobe row only earns its space when there is a choice.
    if (model.coats.length > 1) {
      const coats = document.createElement("div");
      coats.className = "nf-dye-coats";
      for (const coat of model.coats) {
        const button = document.createElement("button");
        button.className = coat.selected
          ? "nf-button nf-button-small nf-selected"
          : "nf-button nf-button-small";
        button.dataset.coat =
          coat.ref.where === "equipped" ? "worn" : `${coat.ref.stackIndex}`;
        button.setAttribute("aria-pressed", String(coat.selected));
        button.textContent = `${coat.place}: ${coat.name}`;
        button.addEventListener("click", () => {
          coatRef = coat.ref;
          renderDyes();
        });
        coats.append(button);
      }
      dyes.append(coats);
    }

    const target = document.createElement("p");
    target.className = "nf-dye-target";
    const selected = model.coats.find((coat) => coat.selected);
    target.textContent = selected
      ? `${selected.name} — ${selected.colorLine}`
      : "";
    dyes.append(target);

    const shelf = document.createElement("div");
    shelf.className = "nf-dye-shelf";
    for (const tin of model.tins) {
      const button = document.createElement("button");
      button.className = "nf-button nf-button-small nf-dye-tin";
      button.dataset.dye = tin.dyeId;
      button.disabled = !tin.enabled;
      button.textContent = `${tin.name} — ${tin.colors} · ${tin.actionLabel}`;
      button.addEventListener("click", () => {
        const ref = model.selected?.ref;
        if (!ref) return;
        const price = tin.price ?? 0;
        dyeAction(
          () =>
            tin.carried > 0
              ? applyDye(counter(), ref, tin.dyeId)
              : buyAndApplyDye(counter(), ref, tin.dyeId, price),
          tin.carried > 0
            ? `${tin.name} rubbed in — the tin's gone.`
            : `${tin.name} on, ${price} cr off. Application's free, love.`,
        );
      });
      shelf.append(button);
    }
    dyes.append(shelf);

    if (model.canStrip && model.selected) {
      const ref = model.selected.ref;
      const strip = document.createElement("button");
      strip.className = "nf-button nf-button-small nf-dye-strip";
      strip.textContent = "Strip to factory colours (free)";
      strip.addEventListener("click", () => {
        dyeAction(
          () => stripDye(counter(), ref),
          "Stripped back. The cloth remembers nothing.",
        );
      });
      dyes.append(strip);
    }

    const line = document.createElement("p");
    line.className = dyeMessageIsError
      ? "nf-message nf-error nf-dye-status"
      : "nf-message nf-dye-status";
    line.setAttribute("role", "status");
    line.textContent = dyeMessage;
    dyes.append(line);
  }

  const buttons = document.createElement("div");
  buttons.className = "nf-wizard-controls";
  const cancel = document.createElement("button");
  cancel.className = "nf-button";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => {
    audio.play("ui-cancel");
    options.onClose();
  });
  const confirm = document.createElement("button");
  confirm.className = "nf-button nf-button-primary";
  confirm.textContent = `Confirm (${RESTYLE_PRICE} cr)`;
  confirm.addEventListener("click", () => {
    const result = applyRestyle(session.state, draft);
    if (!result.ok) {
      // Confirm stays disabled for these; belt-and-braces refusal.
      refreshStatus();
      return;
    }
    session.state = result.state;
    audio.play("ui-confirm");
    options.onStateChange();
    options.onClose();
  });
  buttons.append(cancel, confirm);

  /** Fee/refusal line and the Confirm gate, from the pure rules. */
  function refreshStatus(): void {
    const changed = restyleChanged(original, draft);
    const affordable = session.state.credits >= RESTYLE_PRICE;
    confirm.disabled = !changed || !affordable;
    status.classList.toggle("nf-error", changed && !affordable);
    if (!changed) {
      status.textContent =
        "Pick a new look — the chair charges only for what changes.";
    } else if (!affordable) {
      status.textContent = RESTYLE_REFUSAL;
    } else {
      status.textContent =
        `${RESTYLE_PRICE} cr on confirm — you carry ` +
        `${session.state.credits} cr.`;
    }
  }
  refreshStatus();
  renderDyes();

  left.append(picker.el);
  right.append(preview.el, dyes, status, buttons);
  panel.append(header, columns);
  focusFirst(panel);

  return {
    el,
    destroy(): void {
      preview.destroy();
      el.remove();
    },
  };
}
