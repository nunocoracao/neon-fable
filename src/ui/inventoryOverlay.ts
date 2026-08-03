import { audio, type SoundEventId } from "../audio";
import { characterInjury, neuralCapacityOf } from "../character";
import { getItem } from "../data/items";
import {
  ENHANCEMENT_SLOTS,
  InventoryError,
  equip,
  equippedMods,
  installEnhancement,
  unequip,
  uninstallEnhancement,
  useConsumable,
  type EnhancementSlot,
  type Loadout,
} from "../inventory";
import {
  characterSubject,
  consumableOutcome,
  usableIn,
} from "../inventory";
import { factionRows } from "./factionModel";
import {
  consumableOutcomeText,
  dyeChannelSummary,
  injuryEffectText,
  injuryName,
  injuryRecoveryNote,
  itemEffectLabels,
  itemSummary,
  slotLabel,
  uninstallWarning,
} from "./format";
import { createOverlayRoot, type OverlayHandle } from "./overlay";
import { flickeringPortraitCanvas, portraitCanvas } from "./portraits";
import type { Session } from "./session";
import {
  installPreviewRow,
  staticMeter,
  uninstallPreviewRow,
} from "./staticModel";
import { t } from "./strings";

/**
 * Inventory panel: carried items, weapon/outfit slots, cyber install
 * points, and the two meters chrome is measured on — neural load (what
 * the body can carry) and Static (how loudly it complains). Every
 * action dispatches into the pure inventory functions; slot and
 * capacity rules live there, and their errors surface here as messages.
 *
 * Nothing on this panel computes a Static figure of its own: the meter,
 * the band under an occupied slot, and the projection on an install
 * button all come from ./staticModel.ts, so what an install is promised
 * to cost is what installing it costs.
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

  const el = createOverlayRoot(t("inventory.title"));

  const panel = document.createElement("div");
  panel.className = "nf-panel nf-inventory";
  el.append(panel);

  let message = "";
  let messageIsError = false;
  /** Slot whose Uninstall button is waiting on its confirm click. */
  let pendingUninstall: EnhancementSlot | null = null;

  function apply(action: () => Loadout, sound: SoundEventId): void {
    try {
      const loadout = action();
      session.state = {
        ...session.state,
        player: loadout.character,
        inventory: loadout.inventory,
      };
      audio.emit(sound);
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
    hp.textContent = t("inventory.hp", {
      hp: player.hp,
      max: player.derived.maxHp,
    });
    const credits = document.createElement("span");
    credits.textContent = t("inventory.credits", {
      credits: session.state.credits,
    });

    const neural = document.createElement("div");
    neural.className = "nf-neural";
    const neuralLabel = document.createElement("span");
    // The perk-aware figure, the same one installEnhancement enforces —
    // a meter that read the raw derived capacity would refuse an
    // install the rules allow.
    const capacity = neuralCapacityOf(player);
    neuralLabel.textContent = t("inventory.neuralLoad", {
      load: player.neuralLoad,
      capacity,
    });
    const meter = document.createElement("div");
    meter.className = "nf-meter";
    // The bar draws what the label beside it already says in figures.
    // Left in the reading order it would be an unnamed box between two
    // sentences; hidden, nothing is lost.
    meter.setAttribute("aria-hidden", "true");
    const fill = document.createElement("div");
    fill.className = "nf-meter-fill";
    fill.style.width =
      capacity > 0 ? `${Math.min(100, (player.neuralLoad / capacity) * 100)}%` : "0%";
    meter.append(fill);
    neural.append(neuralLabel, meter);

    status.append(hp, credits, neural);
    container.append(status);
    renderInjury(container);
    renderStatic(container);
  }

  /**
   * What the last bad fight left behind, above the noise meter because
   * it is the more urgent of the two and the only one that goes away on
   * its own. Three lines and no numbers hidden: what it is, what it is
   * costing, and when it stops — a debuff a player cannot read is a
   * debuff they experience as bad luck.
   */
  function renderInjury(container: HTMLElement): void {
    const carried = characterInjury(session.state.player);
    const name = injuryName(carried);
    if (name === null) return;
    const section = document.createElement("div");
    section.className = "nf-injury";
    section.dataset.injury = carried?.id ?? "";

    const head = document.createElement("div");
    head.className = "nf-injury-head";
    const label = document.createElement("span");
    label.className = "nf-injury-name";
    label.textContent = name;
    const cost = document.createElement("span");
    cost.className = "nf-injury-effect";
    cost.textContent = injuryEffectText(carried) ?? "";
    head.append(label, cost);

    const note = document.createElement("div");
    note.className = "nf-item-summary";
    note.textContent = injuryRecoveryNote(carried) ?? "";

    section.append(head, note);
    container.append(section);
  }

  /**
   * The noise, under the load meter: the band by name, a bar that pins
   * full at screaming, what the band is currently costing, and the line
   * about what it feels like. The number is shown as well as the band —
   * unlike faction standing, Static is a figure the player does
   * arithmetic on every time they consider an implant.
   */
  function renderStatic(container: HTMLElement): void {
    const view = staticMeter(session.state.player);
    const section = document.createElement("div");
    section.className = "nf-static";
    section.dataset.band = view.band;

    const head = document.createElement("div");
    head.className = "nf-static-head";
    const label = document.createElement("span");
    label.className = "nf-static-label";
    label.textContent = view.label;
    const band = document.createElement("span");
    band.className = `nf-static-band nf-static-${view.band}`;
    band.textContent = view.notes.join(" · ");
    head.append(label, band);

    const track = document.createElement("div");
    track.className = "nf-meter nf-static-meter";
    // Same again: the band, the figure, and what it costs are all on
    // the row in words.
    track.setAttribute("aria-hidden", "true");
    const fill = document.createElement("div");
    fill.className = "nf-static-fill";
    fill.style.width = `${Math.round(view.fill * 100)}%`;
    track.append(fill);

    const blurb = document.createElement("div");
    blurb.className = "nf-item-summary";
    blurb.textContent = view.blurb;

    section.append(head, track, blurb);
    container.append(section);
  }

  function renderEquipment(container: HTMLElement): void {
    const { player } = session.state;
    const section = document.createElement("div");
    section.className = "nf-inventory-section";
    const heading = document.createElement("h3");
    heading.textContent = t("inventory.equipped");
    section.append(heading);

    for (const slot of ["weapon", "outfit"] as const) {
      const row = document.createElement("div");
      row.className = "nf-slot-row";
      const label = document.createElement("span");
      label.className = "nf-slot-label";
      label.textContent =
        slot === "weapon" ? t("inventory.slot.weapon") : t("inventory.slot.outfit");
      const value = document.createElement("span");
      value.className = "nf-slot-value";
      const itemId = player.equipment[slot];
      value.textContent = itemId ? itemName(itemId) : "—";
      row.append(label, value);
      if (itemId) {
        row.append(
          actionButton(t("inventory.unequip"), () =>
            apply(() => unequip(player, session.state.inventory, slot), "ui.unequip"),
          ),
        );
      }
      section.append(row);
      // What is bolted to the weapon in hand, read-only: changing it
      // needs a bench, and the bench is the only place that can.
      if (slot === "weapon") {
        const fitted = equippedMods(player);
        if (fitted.length > 0) {
          const parts = document.createElement("div");
          parts.className = "nf-item-effects";
          parts.textContent = t("inventory.fitted", {
            mods: fitted.map((m) => m.name).join(" · "),
          });
          section.append(parts);
        }
      }
      // And what colour the coat was painted, on the same terms: the
      // chapel's chair is the only place that changes it.
      if (slot === "outfit" && player.equipment.outfitDye) {
        const dyed = document.createElement("div");
        dyed.className = "nf-item-effects";
        dyed.textContent = t("inventory.dyed", {
          channels: dyeChannelSummary(player.equipment.outfitDye),
        });
        section.append(dyed);
      }
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
      value.textContent = itemId ? itemName(itemId) : t("inventory.slot.empty");
      row.append(label, value);
      if (itemId) {
        if (pendingUninstall === slot) {
          row.append(
            actionButton(t("inventory.confirmExtraction"), () =>
              apply(
                () =>
                  uninstallEnhancement(player, session.state.inventory, slot),
                "ui.unequip",
              ),
            ),
          );
        } else {
          row.append(
            actionButton(t("inventory.uninstall"), () => {
              const item = getItem(itemId);
              message =
                item?.kind === "enhancement"
                  ? uninstallWarning(item)
                  : t("inventory.extractionWarning");
              messageIsError = false;
              pendingUninstall = slot;
              render();
            }),
          );
        }
      }
      section.append(row);
      // What pulling it would leave behind, on the same terms the
      // carried shelf offers an install: the extraction confirm below
      // already warns about the trauma, and this is the other half of
      // the price.
      if (itemId) {
        const quieter = document.createElement("div");
        quieter.className = "nf-item-effects";
        quieter.textContent = t("inventory.pulling", {
          projection: uninstallPreviewRow(player, slot).projection,
        });
        section.append(quieter);
      }
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
    section.className = "nf-inventory-section";
    const heading = document.createElement("h3");
    heading.textContent = t("inventory.standing");
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
      // The band name carries which side of nothing this faction sits
      // on and roughly how far — the bar is the same fact drawn, and
      // the number is deliberately never shown at all.
      track.setAttribute("aria-hidden", "true");
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
    heading.textContent = t("inventory.carried");
    section.append(heading);

    const grid = document.createElement("div");
    grid.className = "nf-item-grid";
    if (inventory.stacks.length === 0) {
      const empty = document.createElement("p");
      empty.className = "nf-dim";
      empty.textContent = t("inventory.nothingCarried");
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
            actionButton(t("inventory.equip"), () =>
              apply(() => equip(player, inventory, item.id), "ui.equip"),
            ),
          );
        } else if (item.kind === "enhancement") {
          // The projected band before the commit, not after it: an
          // install is permanent-ish and extraction hurts, so the one
          // moment this figure is worth anything is now.
          const projected = installPreviewRow(player, item.id);
          const preview = document.createElement("div");
          preview.className = projected.quiets
            ? "nf-item-effects nf-static-quiets"
            : "nf-item-effects";
          preview.dataset.band = projected.band;
          preview.textContent = projected.projection;
          card.append(preview);
          card.append(
            actionButton(t("inventory.install"), () =>
              apply(() => installEnhancement(player, inventory, item.id), "ui.install"),
            ),
          );
        } else if (item.kind === "consumable") {
          // What this dose would do to *this* body right now, off the
          // same derivation the fight's item list quotes — so a patch
          // reads the same on both screens, and a kit that would do
          // nothing says so before it is opened.
          const outcome = consumableOutcome(item, characterSubject(player));
          const preview = document.createElement("div");
          preview.className = "nf-item-effects";
          preview.textContent = usableIn(item, "exploration")
            ? consumableOutcomeText(outcome)
            : t("inventory.combatOnly");
          card.append(preview);
          if (usableIn(item, "exploration")) {
            card.append(
              actionButton(t("inventory.use"), () =>
                apply(
                  () => useConsumable(player, inventory, item.id),
                  "ui.item.use",
                ),
              ),
            );
          }
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
    // A screaming band tears the face it belongs to. The band is
    // already said in words on the meter below; this is the same fact
    // where the player is actually looking.
    const noisy = staticMeter(player).band === "screaming";
    identity.append(
      noisy
        ? flickeringPortraitCanvas(player.appearance, player.equipment)
        : portraitCanvas(player.appearance, player.equipment),
    );
    const title = document.createElement("h2");
    title.textContent = t("inventory.title");
    identity.append(title);
    const close = document.createElement("button");
    close.className = "nf-button nf-button-small";
    close.textContent = t("common.closeEsc");
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
