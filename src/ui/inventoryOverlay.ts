import { audio, type SoundId } from "../audio";
import { getItem } from "../data/items";
import {
  ENHANCEMENT_SLOTS,
  InventoryError,
  equip,
  installEnhancement,
  unequip,
  uninstallEnhancement,
  useConsumable,
  type EnhancementSlot,
  type Loadout,
} from "../inventory";
import { factionRows } from "./factionModel";
import {
  itemEffectLabels,
  itemSummary,
  slotLabel,
  uninstallWarning,
} from "./format";
import type { OverlayHandle } from "./overlay";
import { portraitCanvas } from "./portraits";
import type { Session } from "./session";

/**
 * Inventory panel: carried items, weapon/outfit slots, cyber install
 * points, and the neural-load meter. Every action dispatches into the
 * pure inventory functions; slot and capacity rules live there, and
 * their errors surface here as messages.
 */
export interface InventoryOverlayOptions {
  session: Session;
  onStateChange(): void;
  onClose(): void;
}

export function createInventoryOverlay(
  options: InventoryOverlayOptions,
): OverlayHandle {
  const { session } = options;

  const el = document.createElement("div");
  el.className = "nf-overlay nf-overlay-center";

  const panel = document.createElement("div");
  panel.className = "nf-panel nf-inventory";
  el.append(panel);

  let message = "";
  let messageIsError = false;
  /** Slot whose Uninstall button is waiting on its confirm click. */
  let pendingUninstall: EnhancementSlot | null = null;

  function apply(action: () => Loadout, sound: SoundId): void {
    try {
      const loadout = action();
      session.state = {
        ...session.state,
        player: loadout.character,
        inventory: loadout.inventory,
      };
      audio.play(sound);
      message = "";
      messageIsError = false;
      options.onStateChange();
    } catch (error) {
      if (error instanceof InventoryError) {
        message = error.message;
        messageIsError = true;
      } else {
        throw error;
      }
    }
    pendingUninstall = null;
    render();
  }

  function actionButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "nf-button nf-button-small";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function itemName(itemId: string): string {
    return getItem(itemId)?.name ?? itemId;
  }

  function renderStatus(container: HTMLElement): void {
    const { player } = session.state;
    const status = document.createElement("div");
    status.className = "nf-inventory-status";

    const hp = document.createElement("span");
    hp.textContent = `HP ${player.hp}/${player.derived.maxHp}`;
    const credits = document.createElement("span");
    credits.textContent = `${session.state.credits} cr`;

    const neural = document.createElement("div");
    neural.className = "nf-neural";
    const neuralLabel = document.createElement("span");
    neuralLabel.textContent = `Neural load ${player.neuralLoad}/${player.derived.neuralCapacity}`;
    const meter = document.createElement("div");
    meter.className = "nf-meter";
    const fill = document.createElement("div");
    fill.className = "nf-meter-fill";
    const capacity = player.derived.neuralCapacity;
    fill.style.width =
      capacity > 0 ? `${Math.min(100, (player.neuralLoad / capacity) * 100)}%` : "0%";
    meter.append(fill);
    neural.append(neuralLabel, meter);

    status.append(hp, credits, neural);
    container.append(status);
  }

  function renderEquipment(container: HTMLElement): void {
    const { player } = session.state;
    const section = document.createElement("div");
    section.className = "nf-inventory-section";
    const heading = document.createElement("h3");
    heading.textContent = "Equipped";
    section.append(heading);

    for (const slot of ["weapon", "outfit"] as const) {
      const row = document.createElement("div");
      row.className = "nf-slot-row";
      const label = document.createElement("span");
      label.className = "nf-slot-label";
      label.textContent = slot === "weapon" ? "Weapon" : "Outfit";
      const value = document.createElement("span");
      value.className = "nf-slot-value";
      const itemId = player.equipment[slot];
      value.textContent = itemId ? itemName(itemId) : "—";
      row.append(label, value);
      if (itemId) {
        row.append(
          actionButton("Unequip", () =>
            apply(() => unequip(player, session.state.inventory, slot), "unequip"),
          ),
        );
      }
      section.append(row);
    }

    for (const slot of ENHANCEMENT_SLOTS) {
      const row = document.createElement("div");
      row.className = "nf-slot-row";
      const label = document.createElement("span");
      label.className = "nf-slot-label";
      label.textContent = slotLabel(slot);
      const value = document.createElement("span");
      value.className = "nf-slot-value";
      const itemId = player.equipment.enhancements[slot];
      value.textContent = itemId ? itemName(itemId) : "Empty";
      row.append(label, value);
      if (itemId) {
        if (pendingUninstall === slot) {
          row.append(
            actionButton("Confirm extraction", () =>
              apply(
                () =>
                  uninstallEnhancement(player, session.state.inventory, slot),
                "unequip",
              ),
            ),
          );
        } else {
          row.append(
            actionButton("Uninstall", () => {
              const item = getItem(itemId);
              message =
                item?.kind === "enhancement"
                  ? uninstallWarning(item)
                  : "Extraction destroys the implant.";
              messageIsError = false;
              pendingUninstall = slot;
              render();
            }),
          );
        }
      }
      section.append(row);
    }
    container.append(section);
  }

  /**
   * Where the player stands with the three powers. Read-only: nothing
   * on this panel spends standing, and the number never appears — the
   * band name and the lean of the meter are the whole report.
   */
  function renderStanding(container: HTMLElement): void {
    const section = document.createElement("div");
    section.className = "nf-inventory-section nf-factions";
    const heading = document.createElement("h3");
    heading.textContent = "Standing";
    section.append(heading);

    for (const row of factionRows(session.state.reputation)) {
      const card = document.createElement("div");
      card.className = "nf-faction-row";
      card.dataset.faction = row.factionId;

      const name = document.createElement("div");
      name.className = "nf-item-name";
      name.textContent = row.name;

      const band = document.createElement("span");
      band.className = `nf-faction-band nf-band-${row.band}`;
      band.textContent = row.bandLabel;
      name.append(band);

      const track = document.createElement("div");
      track.className = "nf-meter nf-standing-meter";
      const fill = document.createElement("div");
      fill.className = `nf-standing-fill nf-standing-${row.meter.side}`;
      fill.style.left = `${row.meter.offsetPercent}%`;
      fill.style.width = `${row.meter.widthPercent}%`;
      track.append(fill);

      const blurb = document.createElement("div");
      blurb.className = "nf-item-summary";
      blurb.textContent = row.blurb;

      card.append(name, track, blurb);
      section.append(card);
    }
    container.append(section);
  }

  function renderCarried(container: HTMLElement): void {
    const { player, inventory } = session.state;
    const section = document.createElement("div");
    section.className = "nf-inventory-section";
    const heading = document.createElement("h3");
    heading.textContent = "Carried";
    section.append(heading);

    const grid = document.createElement("div");
    grid.className = "nf-item-grid";
    if (inventory.stacks.length === 0) {
      const empty = document.createElement("p");
      empty.className = "nf-dim";
      empty.textContent = "Nothing carried.";
      grid.append(empty);
    }
    for (const stack of inventory.stacks) {
      const item = getItem(stack.itemId);
      const card = document.createElement("div");
      card.className = "nf-item-card";

      const name = document.createElement("div");
      name.className = "nf-item-name";
      name.textContent =
        stack.quantity > 1
          ? `${item?.name ?? stack.itemId} ×${stack.quantity}`
          : (item?.name ?? stack.itemId);
      card.append(name);

      if (item) {
        const summary = document.createElement("div");
        summary.className = "nf-item-summary";
        summary.textContent = itemSummary(item);
        card.append(summary);

        const effects = itemEffectLabels(item);
        if (effects.length > 0) {
          const list = document.createElement("div");
          list.className = "nf-item-effects";
          list.textContent = effects.join(" · ");
          card.append(list);
        }

        if (item.kind === "weapon" || item.kind === "outfit") {
          card.append(
            actionButton("Equip", () =>
              apply(() => equip(player, inventory, item.id), "equip"),
            ),
          );
        } else if (item.kind === "enhancement") {
          card.append(
            actionButton("Install", () =>
              apply(() => installEnhancement(player, inventory, item.id), "install"),
            ),
          );
        } else if (item.kind === "consumable") {
          card.append(
            actionButton("Use", () =>
              apply(() => useConsumable(player, inventory, item.id), "item-use"),
            ),
          );
        }
      } else {
        console.error(`Unknown item id in inventory: ${stack.itemId}`);
      }
      grid.append(card);
    }
    section.append(grid);
    container.append(section);
  }

  function render(): void {
    panel.replaceChildren();

    const header = document.createElement("div");
    header.className = "nf-panel-header";
    // Player portrait derived live from appearance + equipped gear, so
    // equipping an outfit or installing head cyberware shows here at
    // once (render() rebuilds the header on every state change).
    const identity = document.createElement("div");
    identity.className = "nf-inventory-identity";
    const { player } = session.state;
    identity.append(portraitCanvas(player.appearance, player.equipment));
    const title = document.createElement("h2");
    title.textContent = "Inventory";
    identity.append(title);
    const close = document.createElement("button");
    close.className = "nf-button nf-button-small";
    close.textContent = "Close [Esc]";
    close.addEventListener("click", options.onClose);
    header.append(identity, close);
    panel.append(header);

    renderStatus(panel);

    const messageLine = document.createElement("p");
    messageLine.className = messageIsError ? "nf-message nf-error" : "nf-message";
    messageLine.textContent = message;
    panel.append(messageLine);

    const columns = document.createElement("div");
    columns.className = "nf-inventory-columns";
    const left = document.createElement("div");
    left.className = "nf-inventory-column";
    renderEquipment(left);
    renderStanding(left);
    columns.append(left);
    renderCarried(columns);
    panel.append(columns);
  }

  render();

  return {
    el,
    destroy(): void {
      el.remove();
    },
  };
}
