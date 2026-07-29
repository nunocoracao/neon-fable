import { audio } from "../audio";
import type { Appearance } from "../character";
import {
  COSMETIC_APPEARANCE_TABS,
  RESTYLE_PRICE,
  RESTYLE_REFUSAL,
} from "../data";
import { applyRestyle, restyleChanged } from "../state";
import { createAppearancePicker } from "./appearancePicker";
import { createAppearancePreview } from "./appearancePreview";
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

  left.append(picker.el);
  right.append(preview.el, status, buttons);
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
